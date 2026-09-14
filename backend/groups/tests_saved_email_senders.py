"""Saved Sender templates: tenant isolation, encryption, and independent Group copies."""

from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.crypto import decrypt_secret
from groups.email_sender_models import GroupEmailSender, SavedEmailSender
from groups.email_sender_testing import GROUP_EMAIL_CRYPTO_TEST_SETTINGS
from groups.models import Group
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
)
from accounts.models import User


@override_settings(**GROUP_EMAIL_CRYPTO_TEST_SETTINGS)
class SavedEmailSenderTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="saved-sender-owner@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Saved Sender Org",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Import Target",
            check_in_enabled=True,
        )
        self.other_owner = User.objects.create_user(
            email="saved-sender-other@example.com",
            password="password12345",
        )
        self.other_owner.email_verified = True
        self.other_owner.save(update_fields=["email_verified"])
        self.other_org = Organization.objects.create_with_owner(
            owner=self.other_owner,
            internal_label="Other Saved Sender Org",
        )
        self.other_group = Group.objects.create_group(
            organization=self.other_org,
            name="Other Import Target",
            check_in_enabled=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.other_client = APIClient()
        self.other_client.force_authenticate(user=self.other_owner)

    def _smtp_payload(self, **overrides):
        payload = {
            "name": "SELS Main Email",
            "provider": "custom_smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_security": "starttls",
            "smtp_username": "user@example.com",
            "from_email": "checkstation@sels.jp",
            "from_name": "SELS",
            "smtp_password": "super-secret-password",
        }
        payload.update(overrides)
        return payload

    def _create(self, client=None, **overrides):
        client = client or self.client
        return client.post(
            "/api/saved-email-senders/",
            self._smtp_payload(**overrides),
            format="json",
        )

    def test_workspace_isolation_for_list_import_and_delete(self):
        created = self._create()
        self.assertEqual(created.status_code, 201, created.data)
        template_id = created.data["id"]

        listed = self.other_client.get("/api/saved-email-senders/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["results"], [])

        own_list = self.client.get("/api/saved-email-senders/")
        self.assertEqual(len(own_list.data["results"]), 1)
        self.assertEqual(own_list.data["results"][0]["id"], template_id)

        imported = self.other_client.put(
            f"/api/groups/{self.other_group.id}/email-sender/",
            {
                "provider": "custom_smtp",
                "smtp_host": "smtp.example.com",
                "smtp_port": 587,
                "smtp_security": "starttls",
                "smtp_username": "user@example.com",
                "from_email": "checkstation@sels.jp",
                "from_name": "SELS",
                "saved_sender_id": template_id,
            },
            format="json",
        )
        self.assertEqual(imported.status_code, 400)
        self.assertIn("saved_sender_id", imported.data)
        self.assertFalse(
            GroupEmailSender.objects.filter(group=self.other_group).exists()
        )

        deleted = self.other_client.delete(f"/api/saved-email-senders/{template_id}/")
        self.assertEqual(deleted.status_code, 404)
        self.assertTrue(SavedEmailSender.objects.filter(pk=template_id).exists())

    def test_secret_is_encrypted_and_never_returned(self):
        created = self._create()
        self.assertEqual(created.status_code, 201)
        template = SavedEmailSender.objects.get(pk=created.data["id"])
        self.assertNotEqual(template.smtp_password_encrypted, "super-secret-password")
        self.assertEqual(
            decrypt_secret(template.smtp_password_encrypted),
            "super-secret-password",
        )
        body = str(created.content) + str(
            self.client.get("/api/saved-email-senders/").content
        )
        self.assertNotIn("super-secret-password", body)
        self.assertNotIn("smtp_password", created.data)
        self.assertNotIn("smtp_password_encrypted", created.data)
        self.assertTrue(created.data["password_configured"])
        self.assertNotIn(template.smtp_password_encrypted, body)

    def test_create_from_valid_configuration_and_duplicate_requires_replace(self):
        created = self._create()
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["provider"], "custom_smtp")
        self.assertEqual(created.data["from_email"], "checkstation@sels.jp")
        self.assertEqual(created.data["smtp_host"], "smtp.example.com")
        self.assertEqual(created.data["smtp_port"], 587)
        self.assertEqual(created.data["smtp_security"], "starttls")

        duplicate = self._create(from_email="other@sels.jp")
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.data["code"], "saved_sender_name_exists")
        self.assertEqual(SavedEmailSender.objects.filter(organization=self.organization).count(), 1)
        self.assertEqual(
            SavedEmailSender.objects.get(organization=self.organization).from_email,
            "checkstation@sels.jp",
        )

        replaced = self._create(replace=True, from_email="other@sels.jp", smtp_password="replacement-secret")
        self.assertEqual(replaced.status_code, 200, replaced.data)
        self.assertEqual(replaced.data["id"], created.data["id"])
        self.assertEqual(replaced.data["from_email"], "other@sels.jp")
        template = SavedEmailSender.objects.get(pk=created.data["id"])
        self.assertEqual(decrypt_secret(template.smtp_password_encrypted), "replacement-secret")

        same_name_other_case = self._create(name="sels main email")
        self.assertEqual(same_name_other_case.status_code, 409)

    def test_guided_providers_keep_their_provider(self):
        cases = (
            ("gmail", {"gmail_address": "office@gmail.com"}, "office@gmail.com"),
            ("microsoft", {"microsoft_email": "office@contoso.com"}, "office@contoso.com"),
            ("yahoo", {"yahoo_email": "office@yahoo.com"}, "office@yahoo.com"),
        )
        for provider, extra, address in cases:
            with self.subTest(provider=provider):
                response = self.client.post(
                    "/api/saved-email-senders/",
                    {
                        "name": f"{provider} sender",
                        "provider": provider,
                        "from_name": "Office",
                        "smtp_password": "app-secret-value",
                        **extra,
                    },
                    format="json",
                )
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(response.data["provider"], provider)
                self.assertEqual(response.data["from_email"], address)
                self.assertNotIn("app-secret-value", str(response.content))
                stored = SavedEmailSender.objects.get(pk=response.data["id"])
                self.assertEqual(stored.provider, provider)
                self.assertEqual(decrypt_secret(stored.smtp_password_encrypted), "app-secret-value")

    def test_import_copies_credential_independently_and_delete_leaves_group(self):
        created = self._create()
        template_id = created.data["id"]
        template = SavedEmailSender.objects.get(pk=template_id)
        original_ciphertext = template.smtp_password_encrypted

        draft = {
            "provider": "custom_smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_security": "starttls",
            "smtp_username": "user@example.com",
            "from_email": "checkstation@sels.jp",
            "from_name": "SELS",
            "saved_sender_id": template_id,
        }
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            tested = self.client.post(
                f"/api/groups/{self.group.id}/email-sender/test/",
                {"to_email": "verify@example.com", **draft},
                format="json",
            )
            self.assertEqual(tested.status_code, 200, tested.data)
            self.assertTrue(tested.data["draft_verified"])
            self.assertNotIn("super-secret-password", str(tested.content))

            saved = self.client.put(
                f"/api/groups/{self.group.id}/email-sender/",
                draft,
                format="json",
            )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.data["provider"], "custom_smtp")
        self.assertEqual(saved.data["smtp_host"], "smtp.example.com")
        self.assertEqual(saved.data["smtp_port"], 587)
        self.assertEqual(saved.data["smtp_security"], "starttls")
        self.assertEqual(saved.data["smtp_username"], "user@example.com")
        self.assertEqual(saved.data["from_email"], "checkstation@sels.jp")
        self.assertEqual(saved.data["from_name"], "SELS")
        self.assertTrue(saved.data["password_configured"])
        self.assertNotIn("smtp_password", saved.data)
        self.assertNotIn("super-secret-password", str(saved.content))

        group_sender = GroupEmailSender.objects.get(group=self.group)
        self.assertEqual(group_sender.smtp_password_encrypted, original_ciphertext)
        self.assertFalse(hasattr(group_sender, "saved_email_sender_id"))
        self.assertNotIn("saved_email_sender", [field.name for field in group_sender._meta.get_fields()])
        self.assertEqual(
            decrypt_secret(group_sender.smtp_password_encrypted),
            "super-secret-password",
        )

        deleted = self.client.delete(f"/api/saved-email-senders/{template_id}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(SavedEmailSender.objects.filter(pk=template_id).exists())

        group_sender.refresh_from_db()
        self.assertEqual(group_sender.smtp_password_encrypted, original_ciphertext)
        self.assertEqual(group_sender.provider, "custom_smtp")
        self.assertEqual(group_sender.from_email, "checkstation@sels.jp")
        self.assertEqual(group_sender.status, "ready")
        self.group.refresh_from_db()
        self.assertTrue(self.group.check_in_enabled)

    def test_replacement_password_is_used_instead_of_template_secret(self):
        created = self._create()
        template_id = created.data["id"]
        draft = {
            "provider": "custom_smtp",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_security": "starttls",
            "smtp_username": "user@example.com",
            "from_email": "checkstation@sels.jp",
            "from_name": "SELS",
            "saved_sender_id": template_id,
            "change_password": True,
            "smtp_password": "typed-replacement",
        }
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            tested = self.client.post(
                f"/api/groups/{self.group.id}/email-sender/test/",
                {"to_email": "verify@example.com", **draft},
                format="json",
            )
            self.assertEqual(tested.status_code, 200, tested.data)
            saved = self.client.put(
                f"/api/groups/{self.group.id}/email-sender/",
                draft,
                format="json",
            )
        self.assertEqual(saved.status_code, 200, saved.data)
        group_sender = GroupEmailSender.objects.get(group=self.group)
        self.assertEqual(decrypt_secret(group_sender.smtp_password_encrypted), "typed-replacement")
        template = SavedEmailSender.objects.get(pk=template_id)
        self.assertEqual(decrypt_secret(template.smtp_password_encrypted), "super-secret-password")

    def test_save_as_template_can_copy_group_credential_without_returning_it(self):
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            saved = self.client.put(
                f"/api/groups/{self.group.id}/email-sender/",
                {
                    "provider": "custom_smtp",
                    "smtp_host": "smtp.example.com",
                    "smtp_port": 465,
                    "smtp_security": "ssl",
                    "smtp_username": "mailbox@example.com",
                    "from_email": "mailbox@example.com",
                    "from_name": "Mailbox",
                    "smtp_password": "group-secret",
                    "change_password": True,
                },
                format="json",
            )
            self.assertEqual(saved.status_code, 400)
            tested = self.client.post(
                f"/api/groups/{self.group.id}/email-sender/test/",
                {
                    "to_email": "verify@example.com",
                    "provider": "custom_smtp",
                    "smtp_host": "smtp.example.com",
                    "smtp_port": 465,
                    "smtp_security": "ssl",
                    "smtp_username": "mailbox@example.com",
                    "from_email": "mailbox@example.com",
                    "from_name": "Mailbox",
                    "smtp_password": "group-secret",
                    "change_password": True,
                },
                format="json",
            )
            self.assertEqual(tested.status_code, 200, tested.data)
            saved = self.client.put(
                f"/api/groups/{self.group.id}/email-sender/",
                {
                    "provider": "custom_smtp",
                    "smtp_host": "smtp.example.com",
                    "smtp_port": 465,
                    "smtp_security": "ssl",
                    "smtp_username": "mailbox@example.com",
                    "from_email": "mailbox@example.com",
                    "from_name": "Mailbox",
                    "smtp_password": "group-secret",
                    "change_password": True,
                },
                format="json",
            )
        self.assertEqual(saved.status_code, 200, saved.data)

        created = self.client.post(
            "/api/saved-email-senders/",
            {
                "name": "From Group",
                "provider": "custom_smtp",
                "smtp_host": "smtp.example.com",
                "smtp_port": 465,
                "smtp_security": "ssl",
                "smtp_username": "mailbox@example.com",
                "from_email": "mailbox@example.com",
                "from_name": "Mailbox",
                "source_group_id": self.group.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertNotIn("group-secret", str(created.content))
        template = SavedEmailSender.objects.get(pk=created.data["id"])
        group_sender = GroupEmailSender.objects.get(group=self.group)
        self.assertEqual(
            decrypt_secret(template.smtp_password_encrypted),
            "group-secret",
        )
        self.assertEqual(
            template.smtp_password_encrypted,
            group_sender.smtp_password_encrypted,
        )
        self.assertFalse(
            any(field.name == "group" for field in template._meta.fields)
        )

    def test_other_workspace_group_cannot_be_used_as_secret_source(self):
        created = self.other_client.post(
            "/api/saved-email-senders/",
            self._smtp_payload(name="Other template"),
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        copied = self.client.post(
            "/api/saved-email-senders/",
            self._smtp_payload(
                name="Stolen",
                smtp_password="",
                source_group_id=self.other_group.id,
            ),
            format="json",
        )
        self.assertEqual(copied.status_code, 400)
        self.assertFalse(
            SavedEmailSender.objects.filter(organization=self.organization, name="Stolen").exists()
        )

    def test_staff_cannot_manage_saved_senders_admin_can_list(self):
        self.organization.plan = OrganizationPlan.PLUS
        self.organization.save(update_fields=["plan"])
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="operator",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        admin = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="lead.admin",
            password="admin-password",
            role=WorkspaceStaffRole.ADMIN,
            email="lead.admin@example.com",
        )
        admin.plan_unlocked = True
        admin.save(update_fields=["plan_unlocked"])
        staff_client = APIClient()
        staff_client.force_authenticate(user=staff)
        denied = staff_client.get("/api/saved-email-senders/")
        self.assertEqual(denied.status_code, 403)

        admin_client = APIClient()
        admin_client.force_authenticate(user=admin)
        allowed = admin_client.get("/api/saved-email-senders/")
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.data["results"], [])
