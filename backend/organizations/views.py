import logging

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth import get_user_model
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.exceptions import EmailNotVerified
from accounts.services import send_verification_email_for_user
from accounts.verification import customer_must_verify_email
from core.mail import EmailConfigurationError, EmailSendError
from organizations.models import (
    Organization,
    OrganizationStatus,
    WorkspaceStaffAccount,
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
)
from attendance.kiosk_lock import attach_kiosk_status
from organizations.permissions import (
    CanManageStaffAccounts,
    get_active_workspace_organization,
    get_workspace_operator_role,
    staff_account_manageable_by_actor,
    workspace_capabilities,
)
from accounts.owner_two_factor import begin_pending_owner_2fa, has_confirmed_owner_totp

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
            payload = {
                "account_kind": "workspace_staff",
                "role": actor.role,
                "identity": actor.username,
                "is_platform_operator": False,
                "workspace_id": actor.organization.workspace_id,
                "capabilities": workspace_capabilities(actor),
            }
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
                "capabilities": workspace_capabilities(actor),
            }
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


class OwnerRegistrationView(APIView):
    """
    Register a new paying customer (accounts.User) and automatically create exactly one Organization.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        ser = RegisterOwnerSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"]
        password = ser.validated_data["password"]
        first_name = ser.validated_data.get("first_name") or ""
        last_name = ser.validated_data.get("last_name") or ""

        User = get_user_model()
        with transaction.atomic():
            user = User.objects.create_user(
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                is_staff=False,
                is_superuser=False,
                email_verified=False,
            )
            organization = Organization.objects.create_with_owner(owner=user)
            # Multiple AUTHENTICATION_BACKENDS are configured, so login()
            # requires an explicit backend for a newly created User.
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
            detail = "Check your email to verify your Check Station account."
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
                "workspace_created": True,
                "detail": detail,
            },
            status=201,
        )


class OwnerLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = OwnerLoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"]
        password = ser.validated_data["password"]

        user = authenticate(request, email=email, password=password)
        if user is None or not getattr(user, "is_active", False):
            return Response({"detail": "Invalid email or password."}, status=401)

        if customer_must_verify_email(user):
            return Response(
                {
                    "detail": "Please verify your email before continuing.",
                    "code": "email_not_verified",
                    "email": user.email,
                },
                status=403,
            )

        organization = Organization.objects.filter(
            owner=user,
            status=OrganizationStatus.ACTIVE,
        ).first()
        if organization is None:
            return Response({"detail": "No active workspace for this account."}, status=404)

        if has_confirmed_owner_totp(user):
            begin_pending_owner_2fa(request, user)
            return Response(
                {
                    "detail": "Two-factor authentication is required.",
                    "code": "two_factor_required",
                    "email": user.email,
                },
                status=403,
            )

        login(request, user)
        payload = {
            "account_kind": "owner",
            "role": "owner",
            "identity": user.email,
            "is_platform_operator": bool(user.is_staff or user.is_superuser),
            "workspace_id": organization.workspace_id,
            "capabilities": workspace_capabilities(user),
        }
        return Response(CurrentWorkspaceSerializer(attach_kiosk_status(request, payload)).data)


class StaffLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = StaffLoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        workspace_id = ser.validated_data["workspace_id"]
        username = ser.validated_data["username"]
        password = ser.validated_data["password"]

        staff = authenticate(
            request,
            workspace_id=workspace_id,
            username=username,
            password=password,
        )
        # `authenticate()` returns None when the custom backend does not match.
        if staff is None or not isinstance(staff, WorkspaceStaffAccount):
            return Response({"detail": "Invalid workspace staff credentials."}, status=401)

        if staff.status != WorkspaceStaffStatus.ACTIVE:
            return Response({"detail": "Invalid workspace staff credentials."}, status=401)

        # Ensure we're not leaving an owner session around.
        try:
            logout(request)
        except Exception:
            pass

        login(request, staff)

        payload = {
            "account_kind": "workspace_staff",
            "role": staff.role,
            "identity": staff.username,
            "is_platform_operator": False,
            "workspace_id": staff.organization.workspace_id,
            "capabilities": workspace_capabilities(staff),
        }
        return Response(CurrentWorkspaceSerializer(attach_kiosk_status(request, payload)).data)


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

        qs = WorkspaceStaffAccount.objects.filter(organization=organization)
        if self._actor_role(request) == WorkspaceStaffRole.ADMIN:
            qs = qs.filter(role=WorkspaceStaffRole.STAFF)

        payload = WorkspaceStaffAccountListSerializer(qs.order_by("username"), many=True).data
        return Response(payload)

    def post(self, request):
        organization = self._organization(request)
        if organization is None:
            return Response(status=404)

        actor_role = self._actor_role(request)
        ser = WorkspaceStaffAccountCreateSerializer(
            data=request.data,
            context={"organization": organization, "actor_role": actor_role},
        )
        ser.is_valid(raise_exception=True)

        account = WorkspaceStaffAccount.objects.create_account(
            organization=organization,
            username=ser.validated_data["username"],
            email=ser.validated_data.get("email") or "",
            password=ser.validated_data["password"],
            role=ser.validated_data["role"],
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


class WorkspaceStaffResetPasswordView(APIView):
    permission_classes = [CanManageStaffAccounts]

    def post(self, request, staff_id: int):
        organization = get_active_workspace_organization(request.user)
        if organization is None:
            return Response(status=404)

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
