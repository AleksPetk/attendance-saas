"""Phase 4: owner account deletion auth + live subscription guard."""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.owner_sensitive_auth import (
    OWNER_OAUTH_REAUTH_SESSION_KEY,
    record_owner_oauth_reauth,
)
from billing.models import BillingInterval, BillingStatus, PurchaseSource, WorkspaceSubscription
from billing.services import activate_paid_subscription
from billing.testing import simulate_migrated_existing_workspace
from organizations.models import Organization, OrganizationPlan

User = get_user_model()

STRIPE_TEST_SETTINGS = {
    "BILLING_PROVIDER": "fake",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_WEBHOOK_SECRET": "whsec_test_fake",
}


def create_password_owner(email="delete-pw@example.com", *, password="secure-password"):
    user = User.objects.create_user(email=email, password=password)
    user.mark_email_verified()
    org = Organization.objects.create_with_owner(owner=user)
    return user, org, password


def create_oauth_only_owner(email="delete-oauth@example.com"):
    user = User.objects.create_user(email=email, password="temporary-password")
    user.set_unusable_password()
    user.save(update_fields=["password"])
    user.mark_email_verified()
    org = Organization.objects.create_with_owner(owner=user)
    OwnerAuthProviderLink.objects.create(
        user=user,
        provider=OwnerAuthProvider.GOOGLE,
        provider_subject=f"google-sub-{user.pk}",
        provider_email=email,
    )
    return user, org


def _activate_live(org, *, cancel_at_period_end=False, status=BillingStatus.ACTIVE):
    simulate_migrated_existing_workspace(org)
    now = timezone.now()
    billing = activate_paid_subscription(
        org,
        subscribed_plan=OrganizationPlan.PLUS,
        billing_interval=BillingInterval.MONTHLY,
        purchase_source=PurchaseSource.STRIPE,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        external_customer_id=f"cus_{org.pk}",
        external_subscription_id=f"sub_{org.pk}",
    )
    if status != BillingStatus.ACTIVE or cancel_at_period_end:
        billing.status = status
        billing.cancel_at_period_end = cancel_at_period_end
        billing.save(update_fields=["status", "cancel_at_period_end", "updated_at"])
    return billing


@override_settings(**STRIPE_TEST_SETTINGS)
class AccountDeletionAuthAndSubscriptionTests(TestCase):
    def test_password_owner_correct_password_deletes_without_live_subscription(self):
        owner, org, password = create_password_owner()
        simulate_migrated_existing_workspace(org)
        api = APIClient()
        api.force_authenticate(owner)
        response = api.post(
            "/api/auth/account/delete/",
            {"current_password": password, "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["code"], "account_deleted")
        self.assertFalse(User.objects.filter(pk=owner.pk).exists())
        self.assertFalse(Organization.objects.filter(pk=org.pk).exists())

    def test_password_owner_wrong_password_denied(self):
        owner, org, _password = create_password_owner(email="wrong-pw@example.com")
        api = APIClient()
        api.force_authenticate(owner)
        response = api.post(
            "/api/auth/account/delete/",
            {"current_password": "not-the-password", "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.data)
        self.assertTrue(User.objects.filter(pk=owner.pk).exists())
        self.assertTrue(Organization.objects.filter(pk=org.pk).exists())

    def test_oauth_only_owner_cannot_bypass_reauth(self):
        owner, org = create_oauth_only_owner(email="oauth-bypass@example.com")
        api = APIClient()
        api.force_authenticate(owner)
        response = api.post(
            "/api/auth/account/delete/",
            {"confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "oauth_reauth_required")
        self.assertTrue(User.objects.filter(pk=owner.pk).exists())
        self.assertTrue(Organization.objects.filter(pk=org.pk).exists())

    def test_oauth_only_owner_with_fresh_reauth_can_delete(self):
        owner, org = create_oauth_only_owner(email="oauth-ok@example.com")
        client = Client()
        client.force_login(owner)
        session = client.session
        # Record reauth the same way the OAuth verify callback does.
        request = type("R", (), {"session": session})()
        record_owner_oauth_reauth(request, owner, OwnerAuthProvider.GOOGLE)
        session.save()

        response = client.post(
            "/api/auth/account/delete/",
            data={"confirmation": "DELETE"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.json())
        self.assertFalse(User.objects.filter(pk=owner.pk).exists())
        self.assertFalse(Organization.objects.filter(pk=org.pk).exists())

    def test_oauth_only_owner_active_subscription_blocks_even_with_reauth(self):
        owner, org = create_oauth_only_owner(email="oauth-paid@example.com")
        billing = _activate_live(org)
        client = Client()
        client.force_login(owner)
        session = client.session
        request = type("R", (), {"session": session})()
        record_owner_oauth_reauth(request, owner, OwnerAuthProvider.GOOGLE)
        session.save()

        with patch("billing.operations.request_cancellation") as cancel_mock:
            response = client.post(
                "/api/auth/account/delete/",
                data={"confirmation": "DELETE"},
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "active_subscription")
        self.assertTrue(User.objects.filter(pk=owner.pk).exists())
        self.assertTrue(Organization.objects.filter(pk=org.pk).exists())
        billing.refresh_from_db()
        self.assertEqual(billing.status, BillingStatus.ACTIVE)
        cancel_mock.assert_not_called()

    def test_password_owner_active_subscription_blocked(self):
        owner, org, password = create_password_owner(email="paid-block@example.com")
        billing = _activate_live(org)
        api = APIClient()
        api.force_authenticate(owner)
        with patch("billing.operations.request_cancellation") as cancel_mock:
            response = api.post(
                "/api/auth/account/delete/",
                {"current_password": password, "confirmation": "DELETE"},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "active_subscription")
        self.assertTrue(User.objects.filter(pk=owner.pk).exists())
        self.assertTrue(Organization.objects.filter(pk=org.pk).exists())
        self.assertTrue(WorkspaceSubscription.objects.filter(pk=billing.pk).exists())
        cancel_mock.assert_not_called()

    def test_cancel_at_period_end_still_blocks(self):
        owner, org, password = create_password_owner(email="cap@example.com")
        billing = _activate_live(org, cancel_at_period_end=True)
        api = APIClient()
        api.force_authenticate(owner)
        response = api.post(
            "/api/auth/account/delete/",
            {"current_password": password, "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "active_subscription")
        self.assertTrue(response.data.get("cancel_at_period_end"))
        billing.refresh_from_db()
        self.assertTrue(billing.cancel_at_period_end)
        self.assertTrue(User.objects.filter(pk=owner.pk).exists())

    def test_ended_subscription_allows_deletion(self):
        owner, org, password = create_password_owner(email="ended-sub@example.com")
        billing = _activate_live(org)
        billing.status = BillingStatus.CANCELED
        billing.cancel_at_period_end = False
        billing.save(update_fields=["status", "cancel_at_period_end", "updated_at"])
        api = APIClient()
        api.force_authenticate(owner)
        response = api.post(
            "/api/auth/account/delete/",
            {"current_password": password, "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(User.objects.filter(pk=owner.pk).exists())
        self.assertFalse(Organization.objects.filter(pk=org.pk).exists())
        self.assertFalse(WorkspaceSubscription.objects.filter(pk=billing.pk).exists())

    def test_builtin_trial_alone_does_not_block_deletion(self):
        owner, org, password = create_password_owner(email="trial-only@example.com")
        # New workspaces receive builtin trial via signal; no WorkspaceSubscription.
        self.assertFalse(WorkspaceSubscription.objects.filter(organization=org).exists())
        api = APIClient()
        api.force_authenticate(owner)
        response = api.post(
            "/api/auth/account/delete/",
            {"current_password": password, "confirmation": "DELETE"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(User.objects.filter(pk=owner.pk).exists())
