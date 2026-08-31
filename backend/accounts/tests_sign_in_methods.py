"""Phase 1 tests for owner auth provider links and sign-in method status."""

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.deletion import permanently_delete_customer_account
from accounts.owner_auth_provider_models import OwnerAuthProvider, OwnerAuthProviderLink
from accounts.sign_in_methods import (
    can_unlink_owner_provider,
    count_owner_sign_in_methods,
    owner_password_enabled,
    sign_in_methods_payload,
)
from organizations.models import Organization

User = get_user_model()


def create_owner(email="owner-signin@example.com", password="secure-password"):
    user = User.objects.create_user(email=email, password=password)
    user.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=user)
    return user, organization


class OwnerAuthProviderLinkModelTests(TestCase):
    def setUp(self):
        self.owner, self.organization = create_owner()
        self.other_owner, _other_org = create_owner("other-signin@example.com")

    def test_provider_link_can_be_created_for_existing_owner(self):
        link = OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-123",
            provider_email="owner@gmail.com",
            provider_email_verified=True,
        )
        self.assertEqual(link.user_id, self.owner.pk)
        self.assertEqual(link.provider, OwnerAuthProvider.GOOGLE)
        self.assertEqual(link.provider_subject, "google-sub-123")

    def test_one_owner_can_have_google_and_apple_simultaneously(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-abc",
        )
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-xyz",
        )
        self.assertEqual(self.owner.auth_provider_links.count(), 2)

    def test_same_google_sub_cannot_belong_to_two_users(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="shared-google-sub",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OwnerAuthProviderLink.objects.create(
                    user=self.other_owner,
                    provider=OwnerAuthProvider.GOOGLE,
                    provider_subject="shared-google-sub",
                )

    def test_same_apple_sub_cannot_belong_to_two_users(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="shared-apple-sub",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OwnerAuthProviderLink.objects.create(
                    user=self.other_owner,
                    provider=OwnerAuthProvider.APPLE,
                    provider_subject="shared-apple-sub",
                )

    def test_same_user_cannot_have_two_google_links(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-one",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OwnerAuthProviderLink.objects.create(
                    user=self.owner,
                    provider=OwnerAuthProvider.GOOGLE,
                    provider_subject="google-sub-two",
                )

    def test_same_user_cannot_have_two_apple_links(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-sub-one",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OwnerAuthProviderLink.objects.create(
                    user=self.owner,
                    provider=OwnerAuthProvider.APPLE,
                    provider_subject="apple-sub-two",
                )

    def test_deleting_user_deletes_provider_links(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-sub-delete",
        )
        user_id = self.owner.pk
        permanently_delete_customer_account(self.owner)
        self.assertFalse(OwnerAuthProviderLink.objects.filter(user_id=user_id).exists())
        self.assertFalse(User.objects.filter(pk=user_id).exists())


class OwnerSignInMethodsHelperTests(TestCase):
    def setUp(self):
        self.owner, _organization = create_owner()

    def test_existing_password_user_reports_password_enabled(self):
        self.assertTrue(owner_password_enabled(self.owner))
        payload = sign_in_methods_payload(self.owner)
        self.assertTrue(payload["password"]["enabled"])
        self.assertEqual(payload["method_count"], 1)
        self.assertFalse(payload["google"]["linked"])
        self.assertFalse(payload["apple"]["linked"])

    def test_unusable_password_reports_password_unavailable(self):
        self.owner.set_unusable_password()
        self.owner.save(update_fields=["password"])
        self.assertFalse(owner_password_enabled(self.owner))
        payload = sign_in_methods_payload(self.owner)
        self.assertFalse(payload["password"]["enabled"])
        self.assertEqual(payload["method_count"], 0)

    def test_sign_in_method_counting_and_last_method_invariant(self):
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.GOOGLE,
            provider_subject="google-count",
        )
        self.assertEqual(count_owner_sign_in_methods(self.owner), 2)
        payload = sign_in_methods_payload(self.owner)
        self.assertTrue(payload["can_unlink_google"])
        self.assertFalse(payload["can_unlink_apple"])

        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-count",
        )
        self.assertEqual(count_owner_sign_in_methods(self.owner), 3)
        payload = sign_in_methods_payload(self.owner)
        self.assertTrue(payload["can_unlink_google"])
        self.assertTrue(payload["can_unlink_apple"])
        self.assertTrue(can_unlink_owner_provider(self.owner, OwnerAuthProvider.GOOGLE))
        self.assertTrue(can_unlink_owner_provider(self.owner, OwnerAuthProvider.APPLE))

    def test_oauth_only_owner_with_one_provider_cannot_unlink_it(self):
        self.owner.set_unusable_password()
        self.owner.save(update_fields=["password"])
        OwnerAuthProviderLink.objects.create(
            user=self.owner,
            provider=OwnerAuthProvider.APPLE,
            provider_subject="apple-only",
        )
        self.assertEqual(count_owner_sign_in_methods(self.owner), 1)
        self.assertFalse(can_unlink_owner_provider(self.owner, OwnerAuthProvider.APPLE))


class OwnerAccountSignInMethodsApiTests(TestCase):
    def setUp(self):
        self.owner, _organization = create_owner()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_account_endpoint_includes_sign_in_methods_block(self):
        response = self.client.get("/api/auth/account/")
        self.assertEqual(response.status_code, 200)
        methods = response.data["sign_in_methods"]
        self.assertTrue(methods["password"]["enabled"])
        self.assertEqual(methods["method_count"], 1)
        self.assertTrue(methods["must_keep_one_method"])
