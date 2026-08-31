from importlib import import_module

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from billing.models import WorkspaceBuiltinTrial
from organizations.models import (
    Organization,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
    WorkspaceTutorialModuleCompletion,
    WorkspaceTutorialState,
    WorkspaceTutorialStatus,
)

User = get_user_model()


def create_owner(email="tutorial-owner@example.com"):
    owner = User.objects.create_user(email=email, password="secure-password")
    owner.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=owner)
    return owner, organization


class WorkspaceTutorialStateApiTests(TestCase):
    def setUp(self):
        self.owner, self.organization = create_owner()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = reverse("workspace-tutorial-state")

    def test_new_workspace_is_eligible_independently_from_trial_state(self):
        trial = WorkspaceBuiltinTrial.objects.get(organization=self.organization)
        trial.expired_at = trial.ends_at
        trial.save(update_fields=["expired_at"])

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], WorkspaceTutorialStatus.NOT_STARTED)
        self.assertTrue(response.data["automatic_eligible"])

        workspace = self.client.get(reverse("current-workspace"))
        self.assertEqual(workspace.status_code, 200)
        self.assertEqual(workspace.data["tutorial"]["status"], "not_started")

    def test_completion_persists_for_another_client(self):
        response = self.client.patch(
            self.url,
            {"status": "completed", "last_module": "workspace-overview", "last_step": "history"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "completed")

        another_browser = APIClient()
        another_browser.force_authenticate(self.owner)
        persisted = another_browser.get(self.url)
        self.assertFalse(persisted.data["automatic_eligible"])
        self.assertEqual(persisted.data["last_step"], "history")

    def test_skip_is_distinct_from_completion(self):
        response = self.client.patch(
            self.url,
            {"status": "skipped", "last_module": "workspace-overview", "last_step": "welcome"},
            format="json",
        )
        state = WorkspaceTutorialState.objects.get(organization=self.organization)
        self.assertEqual(response.data["status"], "skipped")
        self.assertIsNotNone(state.skipped_at)
        self.assertIsNone(state.completed_at)

    def test_replay_cannot_reset_terminal_intro_state(self):
        self.client.patch(self.url, {"status": "completed"}, format="json")
        response = self.client.patch(
            self.url,
            {"status": "in_progress", "last_step": "welcome"},
            format="json",
        )
        self.assertEqual(response.data["status"], "completed")

    def test_tutorial_updates_do_not_change_trial(self):
        trial = WorkspaceBuiltinTrial.objects.get(organization=self.organization)
        before = (trial.started_at, trial.ends_at, trial.expired_at)
        self.client.patch(self.url, {"status": "skipped"}, format="json")
        trial.refresh_from_db()
        self.assertEqual((trial.started_at, trial.ends_at, trial.expired_at), before)

    def test_workspace_staff_cannot_read_or_mutate_owner_tutorial(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="staff-user",
            password="secure-password",
            role=WorkspaceStaffRole.ADMIN,
            email="staff@example.com",
        )
        client = APIClient()
        client.force_authenticate(staff)
        self.assertEqual(client.get(self.url).status_code, 403)
        self.assertEqual(client.patch(self.url, {"status": "skipped"}, format="json").status_code, 403)

    def test_focused_completion_persists_across_clients_and_workspace_hydration(self):
        complete_url = reverse(
            "workspace-tutorial-module-complete",
            kwargs={"module_id": "members"},
        )
        response = self.client.post(complete_url, {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["completed_module_ids"], ["members"])

        another_browser = APIClient()
        another_browser.force_authenticate(self.owner)
        persisted = another_browser.get(self.url)
        workspace = another_browser.get(reverse("current-workspace"))
        self.assertEqual(persisted.data["completed_module_ids"], ["members"])
        self.assertEqual(
            workspace.data["tutorial"]["completed_module_ids"],
            ["members"],
        )

    def test_replay_does_not_clear_completion_and_recompletion_is_idempotent(self):
        complete_url = reverse(
            "workspace-tutorial-module-complete",
            kwargs={"module_id": "groups"},
        )
        first = self.client.post(complete_url, {}, format="json")
        completion = WorkspaceTutorialModuleCompletion.objects.get(
            organization=self.organization,
            module_id="groups",
        )
        first_completed_at = completion.completed_at

        # Starting/replaying is frontend-only and does not mutate completion.
        replay_load = self.client.get(self.url)
        second = self.client.post(complete_url, {}, format="json")
        completion.refresh_from_db()

        self.assertEqual(first.status_code, 200)
        self.assertEqual(replay_load.data["completed_module_ids"], ["groups"])
        self.assertEqual(second.data["completed_module_ids"], ["groups"])
        self.assertEqual(
            WorkspaceTutorialModuleCompletion.objects.filter(
                organization=self.organization,
                module_id="groups",
            ).count(),
            1,
        )
        self.assertGreaterEqual(completion.completed_at, first_completed_at)

    def test_focused_module_ids_persist_independently_without_changing_intro(self):
        self.client.patch(
            self.url,
            {"status": "skipped", "last_module": "workspace-overview"},
            format="json",
        )
        for module_id in ("members", "attendance-history"):
            self.client.post(
                reverse(
                    "workspace-tutorial-module-complete",
                    kwargs={"module_id": module_id},
                ),
                {},
                format="json",
            )

        persisted = self.client.get(self.url)
        self.assertEqual(persisted.data["status"], "skipped")
        self.assertEqual(
            persisted.data["completed_module_ids"],
            ["attendance-history", "members"],
        )

    def test_focused_completions_are_isolated_between_owner_workspaces(self):
        self.client.post(
            reverse(
                "workspace-tutorial-module-complete",
                kwargs={"module_id": "staff-permissions"},
            ),
            {},
            format="json",
        )
        other_owner, _other_organization = create_owner("other-tutorial-owner@example.com")
        other_client = APIClient()
        other_client.force_authenticate(other_owner)

        self.assertEqual(
            other_client.get(self.url).data["completed_module_ids"],
            [],
        )

    def test_staff_cannot_complete_owner_focused_tutorials(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="focused-staff",
            password="secure-password",
            role=WorkspaceStaffRole.ADMIN,
            email="focused-staff@example.com",
        )
        client = APIClient()
        client.force_authenticate(staff)
        response = client.post(
            reverse(
                "workspace-tutorial-module-complete",
                kwargs={"module_id": "groups"},
            ),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            WorkspaceTutorialModuleCompletion.objects.filter(
                organization=self.organization,
            ).exists()
        )

    def test_workspace_overview_cannot_be_recorded_as_a_focused_completion(self):
        response = self.client.post(
            reverse(
                "workspace-tutorial-module-complete",
                kwargs={"module_id": "workspace-overview"},
            ),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            WorkspaceTutorialModuleCompletion.objects.filter(
                organization=self.organization,
            ).exists()
        )


class WorkspaceTutorialMigrationCompatibilityTests(TestCase):
    def test_historical_workspaces_are_marked_completed(self):
        _owner, organization = create_owner("historical-owner@example.com")
        WorkspaceTutorialState.objects.filter(organization=organization).delete()
        migration = import_module(
            "organizations.migrations.0013_workspace_tutorial_state"
        )

        migration.mark_existing_workspaces_completed(apps, None)

        state = WorkspaceTutorialState.objects.get(organization=organization)
        self.assertEqual(state.status, WorkspaceTutorialStatus.COMPLETED)
