import logging

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.exceptions import EmailCooldown, EmailNotVerified
from accounts.email_uniqueness import email_address_claimed
from accounts.language import normalize_language
from accounts.services import (
    send_verification_email_for_user,
    verification_cooldown_remaining,
)
from accounts.sessions import invalidate_owner_sessions
from accounts.verification import customer_must_verify_email
from core.mail import EmailConfigurationError, EmailSendError
from organizations.models import (
    Organization,
    OrganizationStatus,
    WorkspaceStaffAccount,
    WorkspaceStaffGroupAccess,
    WorkspaceStaffRole,
    WorkspaceStaffStatus,
)
from organizations.serializers import (
    CurrentWorkspaceSerializer,
    OwnerLoginSerializer,
    RegisterOwnerSerializer,
    ReauthSerializer,
    StaffLoginSerializer,
    WorkspaceStaffAccountCreateSerializer,
    WorkspaceStaffAccountListSerializer,
    WorkspaceStaffAccountUpdateSerializer,
    WorkspaceTutorialModuleCompletionSerializer,
    WorkspaceTutorialStateUpdateSerializer,
)
from organizations.account_mode import account_mode_key
from organizations.authentication import WORKSPACE_STAFF_SESSION_AUTH_BACKEND
from attendance.kiosk_lock import attach_kiosk_status
from organizations.entitlements.advertising import attach_workspace_advertising
from core.auth_rate_limits import (
    check_owner_login_allowed,
    check_staff_login_allowed,
    clear_owner_login_failures,
    clear_staff_login_failures,
    record_owner_login_failure,
    record_staff_login_failure,
)
from billing.builtin_trial import attach_builtin_trial
from organizations.entitlements import (
    FEATURE_STAFF_MANAGEMENT,
    LIMIT_WORKSPACE_ADMINS,
    LIMIT_WORKSPACE_STAFF,
    build_entitlement_payload,
    apply_slot_selection,
    get_plan_limit,
    is_staff_account_plan_unlocked,
    list_selection_candidates,
    order_staff_queryset_by_plan_availability,
)
from organizations.entitlements.api import deny_plan_capacity, deny_plan_feature
from organizations.permissions import (
    CanManageStaffAccounts,
    IsWorkspaceOwner,
    get_active_workspace_organization,
    get_workspace_operator_role,
    staff_account_manageable_by_actor,
    workspace_capabilities,
)
from organizations.staff_deletion import (
    WorkspaceStaffPermanentDeletionError,
    permanently_delete_workspace_staff_account,
)
from organizations.tutorials import (
    attach_workspace_tutorial,
    complete_workspace_tutorial_module,
    get_workspace_tutorial_state,
    tutorial_state_payload,
    update_workspace_tutorial_state,
)
from accounts.owner_authentication import complete_owner_authentication

from attendance.models import ActionRecord
from attendance.serializers import ActionRecordSerializer
from groups.models import Group, GroupStatus
from members.models import Member, MemberStatus

OWNER_AUTHENTICATION_BACKEND = "django.contrib.auth.backends.ModelBackend"
logger = logging.getLogger("organizations")


class CurrentWorkspaceView(APIView):
    """
    Return the current local-verification identity's workspace context.

    Paying owners authenticate as accounts.User; the workspace is resolved
    from Organization.owner. Workspace admin/staff authenticate as
    WorkspaceStaffAccount with X-Workspace-Id + username + password.
    Platform operators authenticate as accounts.User with is_staff/is_superuser.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        actor = request.user
        if isinstance(actor, WorkspaceStaffAccount):
            org = getattr(actor, "organization", None)
            if org is None or org.status != OrganizationStatus.ACTIVE:
                raise NotFound("No active customer workspace.")
            if getattr(actor, "status", None) != WorkspaceStaffStatus.ACTIVE:
                raise NotFound("No active customer workspace.")
            if not is_staff_account_plan_unlocked(actor):
                return Response(
                    {
                        "code": "plan_account_locked",
                        "detail": "This workspace account is locked by the current plan.",
                        "workspace_id": org.workspace_id,
                        "username": actor.username,
                        "role": actor.role,
                    },
                    status=403,
                )
            payload = {
                "account_kind": "workspace_staff",
                "role": actor.role,
                "identity": actor.username,
                "is_platform_operator": False,
                "workspace_id": org.workspace_id,
                "account_mode": account_mode_key(org),
                "workspace_status": org.status,
                "capabilities": workspace_capabilities(actor),
                "entitlements": build_entitlement_payload(org),
            }
            attach_workspace_advertising(payload, org)
            attach_builtin_trial(payload, org)
            return Response(CurrentWorkspaceSerializer(attach_kiosk_status(request, payload)).data)

        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        organization = Organization.objects.filter(
            owner=actor,
            status=OrganizationStatus.ACTIVE,
        ).first()
        is_platform_operator = bool(actor.is_staff or actor.is_superuser)

        if organization is not None:
            payload = {
                "account_kind": "owner",
                "role": "owner",
                "identity": actor.email,
                "is_platform_operator": is_platform_operator,
                "workspace_id": organization.workspace_id,
                "account_mode": account_mode_key(organization),
                "workspace_status": organization.status,
                "capabilities": workspace_capabilities(actor),
                "entitlements": build_entitlement_payload(organization),
                "preferred_language": normalize_language(
                    getattr(actor, "preferred_language", None)
                ),
            }
            attach_workspace_advertising(payload, organization)
            attach_builtin_trial(payload, organization)
            attach_workspace_tutorial(payload, organization)
            return Response(CurrentWorkspaceSerializer(attach_kiosk_status(request, payload)).data)

        if is_platform_operator:
            payload = {
                "account_kind": "platform_operator",
                "role": None,
                "identity": actor.email,
                "is_platform_operator": True,
                "workspace_id": None,
            }
            return Response(CurrentWorkspaceSerializer(attach_kiosk_status(request, payload)).data)

        raise NotFound("No active customer workspace.")


class WorkspaceTutorialStateView(APIView):
    permission_classes = [IsWorkspaceOwner]

    def get(self, request):
        organization = get_active_workspace_organization(request.user)
        return Response(tutorial_state_payload(get_workspace_tutorial_state(organization)))

    def patch(self, request):
        serializer = WorkspaceTutorialStateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization = get_active_workspace_organization(request.user)
        state = update_workspace_tutorial_state(
            organization,
            status=serializer.validated_data["status"],
            last_module=serializer.validated_data.get("last_module", ""),
            last_step=serializer.validated_data.get("last_step", ""),
        )
        return Response(tutorial_state_payload(state))


class WorkspaceTutorialModuleCompletionView(APIView):
    permission_classes = [IsWorkspaceOwner]

    def post(self, request, module_id):
        serializer = WorkspaceTutorialModuleCompletionSerializer(
            data={"module_id": module_id},
        )
        serializer.is_valid(raise_exception=True)
        organization = get_active_workspace_organization(request.user)
        complete_workspace_tutorial_module(
            organization,
            module_id=serializer.validated_data["module_id"],
        )
        state = get_workspace_tutorial_state(organization)
        return Response(tutorial_state_payload(state))


class OwnerRegistrationView(APIView):
    """
    Start owner registration without provisioning tenant resources.

    The pending User is sufficient to authenticate the verification request.
    Organization creation and the built-in trial happen only after the email
    verification token succeeds.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        ser = RegisterOwnerSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"]
        password = ser.validated_data["password"]
        first_name = ser.validated_data.get("first_name") or ""
        last_name = ser.validated_data.get("last_name") or ""
        preferred_language = ser.validated_data["locale"]
        from billing.markets import lock_market_for_new_registration

        signup_billing_market = lock_market_for_new_registration(request)

        user = self._prepare_pending_user(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            preferred_language=preferred_language,
            signup_billing_market=signup_billing_market,
        )
        # Multiple AUTHENTICATION_BACKENDS are configured, so login() requires
        # an explicit backend for a newly created or restarted pending User.
        login(request, user, backend=OWNER_AUTHENTICATION_BACKEND)

        verification_email_sent = False
        try:
            send_verification_email_for_user(user)
            verification_email_sent = True
        except (EmailConfigurationError, EmailSendError) as exc:
            logger.error(
                "Verification email could not be sent after registration for user_id=%s: %s",
                user.pk,
                exc,
            )
            verification_email_sent = False

        if verification_email_sent:
            detail = "Check your email to verify your CheckStation account."
        else:
            detail = (
                "Account created, but we could not send the verification email. "
                "Please try resending it."
            )
        return Response(
            {
                "email": user.email,
                "email_verified": False,
                "verification_email_sent": verification_email_sent,
                "workspace_created": False,
                "detail": detail,
            },
            status=201,
        )

    @staticmethod
    def _pending_user_unavailable():
        raise ValidationError(
            {"email": "An account with this email already exists."}
        )

    @classmethod
    def _restart_pending_user_locked(
        cls,
        user,
        *,
        password,
        first_name,
        last_name,
        preferred_language,
        signup_billing_market,
    ):
        if (
            user.email_verified
            or not user.is_active
            or user.is_staff
            or user.is_superuser
        ):
            cls._pending_user_unavailable()

        remaining = verification_cooldown_remaining(user)
        if remaining:
            raise EmailCooldown(remaining)

        user.set_password(password)
        user.first_name = first_name
        user.last_name = last_name
        user.preferred_language = preferred_language
        user.signup_billing_market = signup_billing_market
        user.save(
            update_fields=[
                "password",
                "first_name",
                "last_name",
                "preferred_language",
                "signup_billing_market",
            ]
        )
        invalidate_owner_sessions(user)
        return user

    @classmethod
    def _prepare_pending_user(
        cls,
        *,
        email,
        password,
        first_name,
        last_name,
        preferred_language,
        signup_billing_market,
    ):
        User = get_user_model()
        try:
            with transaction.atomic():
                existing = (
                    User.objects.select_for_update()
                    .filter(email__iexact=email)
                    .first()
                )
                if existing is not None:
                    # Another account may already own this address as backup /
                    # pending change even while a stale provisional primary exists.
                    if email_address_claimed(email, exclude_user=existing):
                        cls._pending_user_unavailable()
                    return cls._restart_pending_user_locked(
                        existing,
                        password=password,
                        first_name=first_name,
                        last_name=last_name,
                        preferred_language=preferred_language,
                        signup_billing_market=signup_billing_market,
                    )
                if email_address_claimed(email):
                    cls._pending_user_unavailable()
                return User.objects.create_user(
                    email=email,
                    password=password,
                    first_name=first_name,
                    last_name=last_name,
                    preferred_language=preferred_language,
                    signup_billing_market=signup_billing_market,
                    is_staff=False,
                    is_superuser=False,
                    email_verified=False,
                )
        except IntegrityError:
            # A concurrent request may have inserted the normalized email after
            # our lookup. Resolve it through the same locked restart path.
            with transaction.atomic():
                existing = User.objects.select_for_update().get(email__iexact=email)
                if email_address_claimed(email, exclude_user=existing):
                    cls._pending_user_unavailable()
                return cls._restart_pending_user_locked(
                    existing,
                    password=password,
                    first_name=first_name,
                    last_name=last_name,
                    preferred_language=preferred_language,
                    signup_billing_market=signup_billing_market,
                )


class OwnerLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = OwnerLoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"]
        password = ser.validated_data["password"]

        blocked = check_owner_login_allowed(request, email)
        if blocked is not None:
            return blocked

        user = authenticate(request, email=email, password=password)
        if user is None or not getattr(user, "is_active", False):
            record_owner_login_failure(request, email)
            return Response({"detail": "Invalid email or password."}, status=401)

        clear_owner_login_failures(email)
        return complete_owner_authentication(request, user)


class StaffLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = StaffLoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        workspace_id = ser.validated_data["workspace_id"]
        username = ser.validated_data["username"]
        password = ser.validated_data["password"]

        blocked = check_staff_login_allowed(request, workspace_id, username)
        if blocked is not None:
            return blocked

        staff = authenticate(
            request,
            workspace_id=workspace_id,
            username=username,
            password=password,
        )
        # `authenticate()` returns None when the custom backend does not match.
        if staff is None or not isinstance(staff, WorkspaceStaffAccount):
            record_staff_login_failure(request, workspace_id, username)
            return Response({"detail": "Invalid workspace staff credentials."}, status=401)

        if staff.status != WorkspaceStaffStatus.ACTIVE:
            record_staff_login_failure(request, workspace_id, username)
            return Response({"detail": "Invalid workspace staff credentials."}, status=401)
        if not is_staff_account_plan_unlocked(staff):
            return Response(
                {
                    "code": "plan_account_locked",
                    "detail": "This workspace account is locked by the current plan.",
                    "workspace_id": staff.organization.workspace_id,
                    "username": staff.username,
                    "role": staff.role,
                },
                status=403,
            )

        clear_staff_login_failures(workspace_id, username)

        # Ensure we're not leaving an owner session around.
        try:
            logout(request)
        except Exception:
            pass

        login(request, staff, backend=WORKSPACE_STAFF_SESSION_AUTH_BACKEND)

        payload = {
            "account_kind": "workspace_staff",
            "role": staff.role,
            "identity": staff.username,
            "is_platform_operator": False,
            "workspace_id": staff.organization.workspace_id,
            "account_mode": account_mode_key(staff.organization),
            "workspace_status": staff.organization.status,
            "capabilities": workspace_capabilities(staff),
            "entitlements": build_entitlement_payload(staff.organization),
        }
        attach_workspace_advertising(payload, staff.organization)
        attach_builtin_trial(payload, staff.organization)
        return Response(CurrentWorkspaceSerializer(attach_kiosk_status(request, payload)).data)


class PlanLockSelectionView(APIView):
    """Owner-only plan-lock candidate listing and slot selection."""

    permission_classes = [IsWorkspaceOwner]

    def _organization(self, request):
        return get_active_workspace_organization(request.user)

    def get(self, request):
        organization = self._organization(request)
        kind = request.query_params.get("kind", "")
        candidates = list_selection_candidates(organization, kind)
        return Response(
            {
                "kind": kind,
                "limit": get_plan_limit(organization, kind),
                "current_unlocked": [
                    item["id"] for item in candidates if item["plan_unlocked"]
                ],
                "candidates": candidates,
            }
        )

    def put(self, request):
        organization = self._organization(request)
        kind = request.data.get("kind", "")
        selected_ids = request.data.get("selected_ids")
        if not isinstance(selected_ids, list):
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"selected_ids": "Expected a list of IDs."})
        candidates = apply_slot_selection(
            organization,
            kind,
            selected_ids,
            actor_user=request.user,
        )
        return Response(
            {
                "kind": kind,
                "limit": get_plan_limit(organization, kind),
                "current_unlocked": [
                    item["id"] for item in candidates if item["plan_unlocked"]
                ],
                "candidates": candidates,
            }
        )


class StaffLogoutView(APIView):
    """
    Logout endpoint for both owner and workspace staff.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=204)


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfTokenView(APIView):
    """
    Return a CSRF token cookie for the SPA.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class ReauthView(APIView):
    """
    Verify current session password for kiosk exit / admin actions.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ReauthSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        password = ser.validated_data["password"]
        actor = request.user

        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        try:
            ok = actor.check_password(password)  # WorkspaceStaffAccount or accounts.User compatible
        except Exception:
            ok = False

        if not ok:
            return Response({"detail": "Password verification failed."}, status=403)
        return Response({"ok": True})


class WorkspaceStaffListCreateView(APIView):
    """
    Owner and workspace admin may manage staff accounts.

    Workspace admin can create/edit/deactivate staff-role accounts only.
    Only the paying owner can create or manage admin-role accounts.
    """

    permission_classes = [CanManageStaffAccounts]

    def _organization(self, request):
        return get_active_workspace_organization(request.user)

    def _actor_role(self, request):
        return get_workspace_operator_role(request.user)

    def get(self, request):
        organization = self._organization(request)
        if organization is None:
            return Response(status=404)

        deny_plan_feature(organization, FEATURE_STAFF_MANAGEMENT)

        qs = WorkspaceStaffAccount.objects.filter(organization=organization).prefetch_related(
            Prefetch(
                "group_access",
                queryset=WorkspaceStaffGroupAccess.objects.select_related("group")
                .filter(group__status=GroupStatus.ACTIVE)
                .order_by("group__name", "group_id"),
                to_attr="active_group_access_for_summary",
            )
        )
        if self._actor_role(request) == WorkspaceStaffRole.ADMIN:
            qs = qs.filter(role=WorkspaceStaffRole.STAFF)

        payload = WorkspaceStaffAccountListSerializer(
            order_staff_queryset_by_plan_availability(qs),
            many=True,
        ).data
        return Response(payload)

    def post(self, request):
        organization = self._organization(request)
        if organization is None:
            return Response(status=404)

        deny_plan_feature(organization, FEATURE_STAFF_MANAGEMENT)

        actor_role = self._actor_role(request)
        ser = WorkspaceStaffAccountCreateSerializer(
            data=request.data,
            context={"organization": organization, "actor_role": actor_role},
        )
        ser.is_valid(raise_exception=True)

        role = ser.validated_data["role"]
        if role == WorkspaceStaffRole.ADMIN:
            deny_plan_capacity(organization, LIMIT_WORKSPACE_ADMINS)
        else:
            deny_plan_capacity(organization, LIMIT_WORKSPACE_STAFF)

        account = WorkspaceStaffAccount.objects.create_account(
            organization=organization,
            username=ser.validated_data["username"],
            email=ser.validated_data.get("email") or "",
            password=ser.validated_data["password"],
            role=role,
        )

        out = WorkspaceStaffAccountListSerializer(account).data
        return Response(out, status=201)


class WorkspaceStaffDetailView(APIView):
    permission_classes = [CanManageStaffAccounts]

    def _get_scoped_staff(self, request, staff_id: int):
        organization = get_active_workspace_organization(request.user)
        if organization is None:
            return None
        return WorkspaceStaffAccount.objects.filter(
            organization=organization,
            pk=staff_id,
        ).first()

    def patch(self, request, staff_id: int):
        staff = self._get_scoped_staff(request, staff_id)
        if staff is None:
            return Response(status=404)
        deny_plan_feature(staff.organization, FEATURE_STAFF_MANAGEMENT)
        if not staff_account_manageable_by_actor(request.user, staff):
            return Response(
                {"detail": "Only the workspace owner can manage admin accounts."},
                status=403,
            )

        actor_role = get_workspace_operator_role(request.user)
        ser = WorkspaceStaffAccountUpdateSerializer(
            data=request.data,
            context={
                "organization": staff.organization,
                "staff_id": staff.pk,
                "actor_role": actor_role,
                "staff_account": staff,
            },
        )
        ser.is_valid(raise_exception=True)

        previous_role = staff.role
        next_status = ser.validated_data.get("status", staff.status)
        next_role = ser.validated_data.get("role", staff.role)
        reactivating = (
            staff.status != WorkspaceStaffStatus.ACTIVE
            and next_status == WorkspaceStaffStatus.ACTIVE
        )
        role_to_admin = (
            previous_role != WorkspaceStaffRole.ADMIN
            and next_role == WorkspaceStaffRole.ADMIN
        )
        if reactivating or role_to_admin:
            if next_role == WorkspaceStaffRole.ADMIN:
                deny_plan_capacity(staff.organization, LIMIT_WORKSPACE_ADMINS)
            else:
                deny_plan_capacity(staff.organization, LIMIT_WORKSPACE_STAFF)

        for field, value in ser.validated_data.items():
            if field == "status":
                staff.status = value
            elif field == "role":
                staff.role = value
            elif field == "username":
                staff.username = value
            elif field == "email":
                staff.email = value or ""

        staff.save()

        if (
            previous_role == WorkspaceStaffRole.ADMIN
            and staff.role == WorkspaceStaffRole.STAFF
        ):
            from organizations.staff_group_access import clear_staff_group_access

            clear_staff_group_access(staff)

        return Response(WorkspaceStaffAccountListSerializer(staff).data)

    def delete(self, request, staff_id: int):
        staff = self._get_scoped_staff(request, staff_id)
        if staff is None:
            return Response(status=404)
        deny_plan_feature(staff.organization, FEATURE_STAFF_MANAGEMENT)
        if not staff_account_manageable_by_actor(request.user, staff):
            return Response(
                {"detail": "Only the workspace owner can delete admin accounts."},
                status=403,
            )
        if staff.status != WorkspaceStaffStatus.INACTIVE:
            return Response(
                {
                    "code": "account_active",
                    "detail": "Deactivate this account before deleting it permanently.",
                },
                status=409,
            )

        try:
            permanently_delete_workspace_staff_account(staff)
        except WorkspaceStaffPermanentDeletionError as exc:
            return Response(
                {"code": "account_not_deletable", "detail": exc.messages[0]},
                status=409,
            )
        return Response(status=204)


class WorkspaceStaffResetPasswordView(APIView):
    permission_classes = [CanManageStaffAccounts]

    def post(self, request, staff_id: int):
        organization = get_active_workspace_organization(request.user)
        if organization is None:
            return Response(status=404)

        deny_plan_feature(organization, FEATURE_STAFF_MANAGEMENT)

        staff = WorkspaceStaffAccount.objects.filter(
            organization=organization,
            pk=staff_id,
        ).first()
        if staff is None:
            return Response(status=404)
        if not staff_account_manageable_by_actor(request.user, staff):
            return Response(
                {"detail": "Only the workspace owner can reset admin account passwords."},
                status=403,
            )

        new_password = request.data.get("password") or ""
        # Use Django password validators for strength.
        user_for_validation = get_user_model()(email=organization.owner.email)
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            validate_password(password=new_password, user=user_for_validation)
        except DjangoValidationError as e:
            return Response({"password": e.messages}, status=400)

        staff.set_password(new_password)
        staff.save(update_fields=["password", "updated_at"])
        return Response({"ok": True})


class WorkspaceStaffGroupAccessView(APIView):
    """
    List or replace Group access assignments for a Staff account.

    Owner and workspace Admin may manage Staff assignments only.
    """

    permission_classes = [CanManageStaffAccounts]

    def _get_scoped_staff(self, request, staff_id: int):
        organization = get_active_workspace_organization(request.user)
        if organization is None:
            return None, None
        staff = WorkspaceStaffAccount.objects.filter(
            organization=organization,
            pk=staff_id,
        ).first()
        return organization, staff

    def get(self, request, staff_id: int):
        organization, staff = self._get_scoped_staff(request, staff_id)
        if staff is None:
            return Response(status=404)
        if not staff_account_manageable_by_actor(request.user, staff):
            return Response(
                {"detail": "Only the workspace owner can manage admin accounts."},
                status=403,
            )
        if staff.role != WorkspaceStaffRole.STAFF:
            return Response(
                {"detail": "Group access applies to Staff accounts only."},
                status=400,
            )

        from organizations.staff_group_access import list_staff_group_access

        return Response({"items": list_staff_group_access(staff_account=staff, organization=organization)})

    def put(self, request, staff_id: int):
        organization, staff = self._get_scoped_staff(request, staff_id)
        if staff is None:
            return Response(status=404)
        deny_plan_feature(organization, FEATURE_STAFF_MANAGEMENT)
        if not staff_account_manageable_by_actor(request.user, staff):
            return Response(
                {"detail": "Only the workspace owner can manage admin accounts."},
                status=403,
            )
        if staff.role != WorkspaceStaffRole.STAFF:
            return Response(
                {"detail": "Group access applies to Staff accounts only."},
                status=400,
            )

        from django.core.exceptions import ValidationError as DjangoValidationError
        from organizations.staff_group_access import list_staff_group_access, set_staff_group_access

        group_ids = request.data.get("group_ids")
        if group_ids is None:
            return Response({"group_ids": "This field is required."}, status=400)
        try:
            set_staff_group_access(
                staff_account=staff,
                organization=organization,
                group_ids=group_ids,
            )
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict"):
                return Response(exc.message_dict, status=400)
            return Response({"detail": exc.messages}, status=400)

        return Response({"items": list_staff_group_access(staff_account=staff, organization=organization)})


class WorkspaceDashboardView(APIView):
    """
    Simple workspace dashboard data:
    - Member count
    - Group count
    - Recent activity (Action Records)
    """

    permission_classes = [IsAuthenticated,]

    def get(self, request):
        # Permission/scoping are handled by the customer-facing permissions layer
        # in a later slice; for now we reuse active-workspace scoping.
        from organizations.permissions import (
            CanUseKioskAndViewHistory,
            get_staff_assigned_group_ids,
        )

        if not CanUseKioskAndViewHistory().has_permission(request, self):
            return Response({"detail": "Not allowed."}, status=403)

        organization = get_active_workspace_organization(request.user)
        if organization is None:
            return Response({"detail": "Not allowed."}, status=403)

        assigned_ids = get_staff_assigned_group_ids(request.user)
        if assigned_ids is not None:
            if assigned_ids:
                group_count = Group.objects.filter(
                    organization=organization,
                    status=GroupStatus.ACTIVE,
                    pk__in=assigned_ids,
                ).count()
                recent_qs = ActionRecord.objects.filter(
                    organization=organization,
                    group_id__in=assigned_ids,
                )
            else:
                group_count = 0
                recent_qs = ActionRecord.objects.none()
            member_count = 0
        else:
            member_count = Member.objects.filter(
                organization=organization,
                status=MemberStatus.ACTIVE,
            ).count()
            group_count = Group.objects.filter(
                organization=organization,
                status=GroupStatus.ACTIVE,
            ).count()
            recent_qs = ActionRecord.objects.filter(organization=organization)

        recent = recent_qs.order_by("-performed_at", "-id")[:10]

        return Response(
            {
                "member_count": member_count,
                "group_count": group_count,
                "recent_activity": ActionRecordSerializer(recent, many=True).data,
            }
        )
