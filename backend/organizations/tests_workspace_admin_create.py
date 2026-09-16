"""Admin-only workspace creation for an existing owner."""

from unittest.mock import patch

from django.test import Client, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.services import provision_verified_owner
from accounts.testing import force_platform_admin_login
from billing.builtin_trial import builtin_trial_is_active, get_builtin_trial
from billing.fake_provider import get_fake_provider
from billing.models import WorkspaceSubscription
from billing.services import get_workspace_billing
from core.models import PlatformAdminAction, PlatformAdminActionType
from organizations.models import (
    BillingMarketOverride,
    Organization,
    OrganizationPlan,
    WORKSPACE_ID_LENGTH,
    WORKSPACE_ID_PATTERN,
)
from organizations.workspace_admin_create import (
    WorkspaceAdminCreateError,
    create_workspace_for_existing_owner,
    eligible_owners_queryset,
    validate_owner_eligible_for_workspace,
)

STRIPE_TEST_SETTINGS = {
    "BILLING_PROVIDER": "fake",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_WEBHOOK_SECRET": "whsec_fake",
    "STRIPE_PRICE_PLUS_MONTHLY": "price_plus_monthly",
    "STRIPE_PRICE_PLUS_YEARLY": "price_plus_yearly",
    "STRIPE_PRICE_BUSINESS_MONTHLY": "price_business_monthly",
    "STRIPE_PRICE_BUSINESS_YEARLY": "price_business_yearly",
    "FRONTEND_BASE_URL": "http://localhost:5173",
}

REASON = "Create reviewer workspace for App Store support."
PASSWORD = "secure-password"


def create_user(email, *, password=PASSWORD, verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    return user


@override_settings(**STRIPE_TEST_SETTINGS)
class WorkspaceAdminCreateServiceTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()

    def test_creates_normal_workspace_matching_signup_defaults(self):
        owner = create_user("eligible-owner@example.com")
        org = create_workspace_for_existing_owner(owner=owner)
        self.assertEqual(org.owner_id, owner.pk)
        self.assertEqual(len(org.workspace_id), WORKSPACE_ID_LENGTH)
        self.assertRegex(org.workspace_id, WORKSPACE_ID_PATTERN)
        self.assertFalse(org.is_checkstation_account)
        self.assertEqual(org.billing_market_override, BillingMarketOverride.AUTO)
        self.assertTrue(builtin_trial_is_active(org))
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertIsNone(get_workspace_billing(org))
        self.assertFalse(
            WorkspaceSubscription.objects.filter(organization=org).exists()
        )
        provider = get_fake_provider()
        self.assertEqual(provider.checkouts, {})
        self.assertEqual(provider.subscriptions, {})

    def test_blocks_duplicate_workspace_for_same_owner(self):
        owner = create_user("dup-owner@example.com")
        create_workspace_for_existing_owner(owner=owner)
        with self.assertRaises(WorkspaceAdminCreateError) as ctx:
            create_workspace_for_existing_owner(owner=owner)
        self.assertEqual(ctx.exception.code, "owner_has_workspace")
        self.assertEqual(Organization.objects.filter(owner=owner).count(), 1)

    def test_blocks_invalid_owners(self):
        unverified = create_user("unverified@example.com", verified=False)
        with self.assertRaises(WorkspaceAdminCreateError) as ctx:
            validate_owner_eligible_for_workspace(unverified)
        self.assertEqual(ctx.exception.code, "owner_email_unverified")

        staff = User.objects.create_user(
            email="staff@example.com", password=PASSWORD, is_staff=True
        )
        staff.mark_email_verified()
        with self.assertRaises(WorkspaceAdminCreateError) as ctx:
            validate_owner_eligible_for_workspace(staff)
        self.assertEqual(ctx.exception.code, "owner_platform_operator")

        inactive = create_user("inactive@example.com")
        inactive.is_active = False
        inactive.save(update_fields=["is_active"])
        with self.assertRaises(WorkspaceAdminCreateError) as ctx:
            validate_owner_eligible_for_workspace(inactive)
        self.assertEqual(ctx.exception.code, "owner_inactive")

    def test_checkstation_account_uses_existing_lifecycle(self):
        owner = create_user("reviewer-owner@example.com")
        org = create_workspace_for_existing_owner(
            owner=owner,
            internal_label="Apple reviewer",
            as_checkstation_account=True,
            checkstation_plan=OrganizationPlan.BUSINESS,
        )
        self.assertTrue(org.is_checkstation_account)
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertEqual(org.internal_label, "Apple reviewer")
        trial = get_builtin_trial(org)
        self.assertIsNotNone(trial)
        self.assertIsNotNone(trial.expired_at)
        self.assertFalse(builtin_trial_is_active(org))
        self.assertIsNone(get_workspace_billing(org))
        self.assertFalse(
            WorkspaceSubscription.objects.filter(organization=org).exists()
        )

    def test_creation_is_atomic_when_checkstation_conversion_fails(self):
        owner = create_user("atomic-owner@example.com")
        with patch(
            "organizations.workspace_admin_create.turn_checkstation_account_on",
            side_effect=WorkspaceAdminCreateError("forced failure", code="forced"),
        ):
            with self.assertRaises(WorkspaceAdminCreateError):
                create_workspace_for_existing_owner(
                    owner=owner,
                    as_checkstation_account=True,
                    checkstation_plan=OrganizationPlan.BUSINESS,
                )
        self.assertFalse(Organization.objects.filter(owner=owner).exists())

    def test_integrity_error_maps_to_duplicate_owner(self):
        from django.db import IntegrityError

        owner = create_user("integrity-owner@example.com")
        with patch(
            "organizations.models.OrganizationManager.create_with_owner",
            side_effect=IntegrityError("owner"),
        ):
            with self.assertRaises(WorkspaceAdminCreateError) as ctx:
                create_workspace_for_existing_owner(owner=owner)
        self.assertEqual(ctx.exception.code, "owner_has_workspace")

    def test_eligible_owners_queryset_excludes_owners_with_workspace(self):
        free = create_user("free@example.com")
        taken = create_user("taken@example.com")
        Organization.objects.create_with_owner(owner=taken)
        emails = set(eligible_owners_queryset().values_list("email", flat=True))
        self.assertIn(free.email, emails)
        self.assertNotIn(taken.email, emails)

    def test_normal_signup_path_unchanged(self):
        owner = create_user("signup-owner@example.com")
        user, org, created = provision_verified_owner(owner)
        self.assertTrue(created)
        self.assertEqual(org.owner_id, owner.pk)
        self.assertTrue(builtin_trial_is_active(org))
        self.assertIsNone(get_workspace_billing(org))
        self.assertFalse(org.is_checkstation_account)


@override_settings(**STRIPE_TEST_SETTINGS)
class WorkspaceAdminCreateViewTests(TestCase):
    def setUp(self):
        get_fake_provider().reset()
        self.admin = User.objects.create_superuser(
            email="create-admin@example.com",
            password=PASSWORD,
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.admin)
        self.url = reverse("admin:organizations_organization_create_workspace")
        self.owner = create_user("create-target@example.com")

    def _confirm(self, extra=None):
        payload = {
            "admin_password": PASSWORD,
            "reason": REASON,
            "confirm": "1",
            "owner": str(self.owner.pk),
            "billing_market_override": BillingMarketOverride.AUTO,
            "checkstation_plan": OrganizationPlan.BASIC,
            "internal_label": "support-test",
        }
        if extra:
            payload.update(extra)
        return self.client.post(self.url, payload)

    def test_changelist_shows_create_workspace_action(self):
        response = self.client.get(
            reverse("admin:organizations_organization_changelist")
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Create workspace")
        self.assertContains(response, self.url)

    def test_admin_can_create_workspace_for_eligible_owner(self):
        page = self.client.get(self.url)
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, self.owner.email)
        self.assertContains(page, "Create workspace for existing owner")

        missing = self.client.post(
            self.url,
            {"confirm": "1", "owner": str(self.owner.pk)},
        )
        self.assertEqual(missing.status_code, 200)
        self.assertFalse(Organization.objects.filter(owner=self.owner).exists())

        created = self._confirm()
        self.assertEqual(created.status_code, 302)
        org = Organization.objects.get(owner=self.owner)
        self.assertEqual(org.internal_label, "support-test")
        self.assertTrue(builtin_trial_is_active(org))
        self.assertIsNone(get_workspace_billing(org))
        action = PlatformAdminAction.objects.get(
            action_type=PlatformAdminActionType.ORGANIZATION_CREATE,
            workspace_id_snapshot=org.workspace_id,
        )
        self.assertEqual(action.actor, self.admin)
        self.assertEqual(action.owner_email_snapshot, self.owner.email)
        self.assertEqual(action.reason, REASON)

    def test_admin_can_create_checkstation_reviewer_workspace(self):
        response = self._confirm(
            {
                "as_checkstation_account": "on",
                "checkstation_plan": OrganizationPlan.BUSINESS,
                "internal_label": "Apple ASC reviewer",
            }
        )
        self.assertEqual(response.status_code, 302)
        org = Organization.objects.get(owner=self.owner)
        self.assertTrue(org.is_checkstation_account)
        self.assertEqual(org.plan, OrganizationPlan.BUSINESS)
        self.assertFalse(builtin_trial_is_active(org))
        self.assertIsNone(get_workspace_billing(org))

    def test_duplicate_owner_blocked_in_admin(self):
        Organization.objects.create_with_owner(owner=self.owner)
        response = self._confirm()
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "one workspace per owner")
        self.assertEqual(Organization.objects.filter(owner=self.owner).count(), 1)

    def test_non_admin_cannot_use_create_path(self):
        customer = Client()
        customer.force_login(self.owner)
        response = customer.get(self.url)
        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response.url)

        api = APIClient()
        api.force_authenticate(user=self.owner)
        api_response = api.post(
            "/api/organizations/",
            {"owner": self.owner.pk},
            format="json",
        )
        self.assertIn(api_response.status_code, (404, 405))
