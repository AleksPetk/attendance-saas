from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import Client, TestCase
from django.urls import reverse

from accounts.testing import force_platform_admin_login

User = get_user_model()


class UserModelTests(TestCase):
    def test_create_user_with_email(self):
        user = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )

        self.assertEqual(user.email, "owner@example.com")
        self.assertTrue(user.check_password("secure-password"))
        self.assertTrue(user.is_active)
        self.assertFalse(user.email_verified)
        self.assertIsNone(user.email_verified_at)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_superuser(self):
        user = User.objects.create_superuser(
            email="admin@example.com",
            password="secure-password",
        )

        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.email_verified)
        self.assertIsNotNone(user.email_verified_at)

    def test_email_is_authentication_identifier(self):
        field_names = {field.name for field in User._meta.get_fields()}

        self.assertEqual(User.USERNAME_FIELD, "email")
        self.assertNotIn("username", field_names)

    def test_user_string_representation(self):
        user = User(email="staff@example.com")
        self.assertEqual(str(user), "staff@example.com")

    def test_user_has_last_login_field(self):
        field_names = {field.name for field in User._meta.get_fields()}
        self.assertIn("last_login", field_names)

    def test_email_is_normalized_to_lowercase_on_create(self):
        user = User.objects.create_user(
            email="Owner@Example.COM",
            password="secure-password",
        )

        self.assertEqual(user.email, "owner@example.com")

    def test_email_is_normalized_on_direct_save(self):
        user = User(email="Staff@Example.com")
        user.set_password("secure-password")
        user.save()

        self.assertEqual(user.email, "staff@example.com")

    def test_duplicate_email_differing_only_by_case_is_rejected(self):
        User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )

        with self.assertRaises(IntegrityError):
            User.objects.create_user(
                email="Owner@Example.com",
                password="another-password",
            )


class UserAdminTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.client = Client()
        force_platform_admin_login(self.client, self.admin_user)

    def test_admin_user_changelist_loads(self):
        response = self.client.get(reverse("admin:accounts_user_changelist"))

        self.assertEqual(response.status_code, 200)

    def test_admin_user_add_form_loads(self):
        response = self.client.get(reverse("admin:accounts_user_add"))

        self.assertEqual(response.status_code, 200)

    def test_admin_login_page_loads(self):
        client = Client()
        response = client.get(reverse("admin:login"))

        self.assertEqual(response.status_code, 200)

    def test_non_staff_user_cannot_access_admin(self):
        user = User.objects.create_user(
            email="customer@example.com",
            password="secure-password",
        )
        client = Client()
        client.force_login(user)
        response = client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response.url)
