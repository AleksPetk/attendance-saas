"""Guards for local-only plan-test workspace tooling."""

from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from organizations.models import Organization
from organizations.plan_test_workspace import (
    OWNER_EMAIL,
    assert_plan_test_workspace_allowed,
    create_plan_test_workspace,
    destroy_existing_plan_test_workspace,
    find_existing_owner,
)

User = get_user_model()


@override_settings(DEBUG=False)
class PlanTestWorkspaceProductionGuardTests(TestCase):
    def test_assert_refuses_when_debug_false(self):
        with self.assertRaises(RuntimeError) as ctx:
            assert_plan_test_workspace_allowed()
        self.assertIn("DEBUG=False", str(ctx.exception))

    def test_command_refuses_before_any_db_mutation(self):
        before = User.objects.count()
        out = StringIO()
        err = StringIO()
        with self.assertRaises(CommandError) as ctx:
            call_command("create_plan_test_workspace", stdout=out, stderr=err)
        self.assertIn("DEBUG=False", str(ctx.exception))
        self.assertEqual(User.objects.count(), before)
        self.assertIsNone(find_existing_owner())

    def test_create_helper_refuses_when_debug_false(self):
        before = User.objects.count()
        with self.assertRaises(RuntimeError):
            create_plan_test_workspace(log=lambda _m: None)
        self.assertEqual(User.objects.count(), before)

    def test_destroy_helper_refuses_when_debug_false(self):
        # Even if a matching owner somehow exists, destroy must refuse.
        owner = User.objects.create_user(
            email=OWNER_EMAIL,
            password="not-used-in-prod",
        )
        Organization.objects.create_with_owner(owner=owner)
        before_users = User.objects.count()
        with self.assertRaises(RuntimeError):
            destroy_existing_plan_test_workspace()
        self.assertEqual(User.objects.count(), before_users)
        self.assertTrue(User.objects.filter(email=OWNER_EMAIL).exists())


@override_settings(DEBUG=True)
class PlanTestWorkspaceDevGuardTests(TestCase):
    def test_assert_allows_debug_true(self):
        assert_plan_test_workspace_allowed()

    def test_reset_requires_confirm_destroy(self):
        out = StringIO()
        with self.assertRaises(CommandError) as ctx:
            call_command(
                "create_plan_test_workspace",
                "--reset",
                stdout=out,
            )
        self.assertIn("--confirm-destroy", str(ctx.exception))

    def test_owner_email_uses_reserved_test_domain(self):
        self.assertTrue(OWNER_EMAIL.endswith("@plan-test.local"))

    @patch("organizations.management.commands.create_plan_test_workspace.create_plan_test_workspace")
    def test_debug_true_invokes_create_when_no_existing(self, mock_create):
        class _Summary:
            workspace_id = "WS-TEST"
            plan = "business"
            owner_email = OWNER_EMAIL
            active_standard_groups = 0
            active_structured_groups = 0
            archived_groups = 0
            members = 0
            admins = 0
            staff = 0
            classes = 0
            max_standard_participants = 0
            max_structured_classes = 0
            max_class_participants = 0
            staff_assignment_pattern = ""

        mock_create.return_value = _Summary()
        out = StringIO()
        call_command("create_plan_test_workspace", stdout=out)
        mock_create.assert_called_once()
