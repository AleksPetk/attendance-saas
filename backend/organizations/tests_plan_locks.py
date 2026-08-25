from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import User
from attendance.models import ActionRecord, ActionSource, ActionType
from groups.models import Group, GroupStatus, GroupType
from organizations.entitlements.plan_locks import (
    apply_slot_selection,
)
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
    WorkspaceStaffStatus,
)


class PlanLockTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="plan-lock-owner@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan", "updated_at"])
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def create_group(self, name, *, group_type=GroupType.STANDARD, archived=False):
        group = Group.objects.create_group(
            organization=self.organization,
            name=name,
            group_type=group_type,
        )
        if archived:
            group.archive()
        return group

    def downgrade(self, plan):
        self.organization.plan = plan
        self.organization.save(update_fields=["plan", "updated_at"])
        self.organization.refresh_from_db()

    def test_active_standard_groups_require_owner_selection(self):
        groups = [self.create_group(f"Group {index}") for index in range(3)]
        self.downgrade(OrganizationPlan.BASIC)
        self.assertFalse(self.organization.active_standard_groups_slots_resolved)
        self.assertFalse(
            Group.objects.filter(pk__in=[item.pk for item in groups], plan_unlocked=True).exists()
        )

        response = self.client.put(
            "/api/plan-locks/selection/",
            {
                "kind": "active_standard_groups",
                "selected_ids": [groups[0].pk, groups[1].pk],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertSetEqual(
            set(
                Group.objects.filter(plan_unlocked=True).values_list("id", flat=True)
            ),
            {groups[0].pk, groups[1].pk},
        )

    def test_business_to_basic_locks_all_standard_groups_until_exact_selection(self):
        groups = [self.create_group(f"Std {index}") for index in range(4)]
        self.downgrade(OrganizationPlan.BASIC)

        self.assertFalse(self.organization.active_standard_groups_slots_resolved)
        self.assertEqual(
            Group.objects.filter(
                pk__in=[item.pk for item in groups], plan_unlocked=True
            ).count(),
            0,
        )

        selection = self.client.get(
            "/api/plan-locks/selection/",
            {"kind": "active_standard_groups"},
        )
        self.assertEqual(selection.status_code, 200, selection.data)
        self.assertEqual(selection.data["limit"], 2)
        self.assertEqual(selection.data["current_unlocked"], [])
        self.assertEqual(len(selection.data["candidates"]), 4)

        for group in groups:
            denied = self.client.get(f"/api/groups/{group.pk}/")
            self.assertEqual(denied.status_code, 403, denied.data)
            self.assertEqual(denied.data["code"], "plan_resource_locked")

        wrong_counts = [
            [],
            [groups[0].pk],
            [groups[0].pk, groups[1].pk, groups[2].pk],
            [item.pk for item in groups],
        ]
        for selected_ids in wrong_counts:
            with self.assertRaises(ValidationError):
                apply_slot_selection(
                    self.organization,
                    "active_standard_groups",
                    selected_ids,
                )

        apply_slot_selection(
            self.organization,
            "active_standard_groups",
            [groups[0].pk, groups[1].pk],
        )
        self.organization.refresh_from_db()
        self.assertTrue(self.organization.active_standard_groups_slots_resolved)
        self.assertTrue(Group.objects.get(pk=groups[0].pk).plan_unlocked)
        self.assertTrue(Group.objects.get(pk=groups[1].pk).plan_unlocked)
        self.assertFalse(Group.objects.get(pk=groups[2].pk).plan_unlocked)
        self.assertFalse(Group.objects.get(pk=groups[3].pk).plan_unlocked)
        self.assertEqual(
            Group.objects.filter(
                pk__in=[item.pk for item in groups],
                status=GroupStatus.ACTIVE,
            ).count(),
            4,
        )

        unlocked = self.client.get(f"/api/groups/{groups[0].pk}/")
        self.assertEqual(unlocked.status_code, 200, unlocked.data)
        locked = self.client.get(f"/api/groups/{groups[2].pk}/")
        self.assertEqual(locked.status_code, 403)
        self.assertEqual(locked.data["code"], "plan_resource_locked")

    def test_group_selection_cannot_be_changed_after_resolution(self):
        groups = [self.create_group(f"Swap {index}") for index in range(3)]
        self.downgrade(OrganizationPlan.BASIC)
        apply_slot_selection(
            self.organization,
            "active_standard_groups",
            [groups[0].pk, groups[1].pk],
        )
        with self.assertRaises(ValidationError) as raised:
            apply_slot_selection(
                self.organization,
                "active_standard_groups",
                [groups[1].pk, groups[2].pk],
            )
        self.assertIn("already been resolved", str(raised.exception.detail))
        self.assertSetEqual(
            set(
                Group.objects.filter(plan_unlocked=True).values_list("id", flat=True)
            ),
            {groups[0].pk, groups[1].pk},
        )

        response = self.client.put(
            "/api/plan-locks/selection/",
            {
                "kind": "active_standard_groups",
                "selected_ids": [groups[1].pk, groups[2].pk],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_new_unresolved_selection_after_later_downgrade(self):
        groups = [self.create_group(f"Later {index}") for index in range(4)]
        self.downgrade(OrganizationPlan.BASIC)
        apply_slot_selection(
            self.organization,
            "active_standard_groups",
            [groups[0].pk, groups[1].pk],
        )
        self.downgrade(OrganizationPlan.BUSINESS)
        self.assertEqual(
            Group.objects.filter(
                pk__in=[item.pk for item in groups], plan_unlocked=True
            ).count(),
            4,
        )
        # Plus fits 10 active Standard Groups — 4 remains resolved with no swap UI.
        self.downgrade(OrganizationPlan.PLUS)
        self.organization.refresh_from_db()
        self.assertTrue(self.organization.active_standard_groups_slots_resolved)
        self.create_group("Later 5")
        self.create_group("Later 6")
        self.downgrade(OrganizationPlan.BASIC)
        self.organization.refresh_from_db()
        self.assertFalse(self.organization.active_standard_groups_slots_resolved)
        self.assertEqual(
            Group.objects.filter(
                organization=self.organization,
                group_type=GroupType.STANDARD,
                status=GroupStatus.ACTIVE,
                plan_unlocked=True,
            ).count(),
            0,
        )

    def test_archived_groups_selection_does_not_change_status(self):
        groups = [
            self.create_group(f"Archived {index}", archived=True) for index in range(3)
        ]
        self.downgrade(OrganizationPlan.BASIC)
        apply_slot_selection(
            self.organization,
            "archived_groups",
            [groups[0].pk, groups[1].pk],
        )
        self.assertFalse(Group.objects.get(pk=groups[2].pk).plan_unlocked)
        self.assertEqual(
            Group.objects.filter(
                pk__in=[item.pk for item in groups],
                status=GroupStatus.ARCHIVED,
            ).count(),
            3,
        )
        with self.assertRaises(ValidationError):
            apply_slot_selection(
                self.organization,
                "archived_groups",
                [groups[1].pk, groups[2].pk],
            )

    def test_structured_groups_auto_lock_and_detail_denied(self):
        structured = self.create_group(
            "Structured", group_type=GroupType.STRUCTURED
        )
        self.downgrade(OrganizationPlan.PLUS)
        structured.refresh_from_db()
        self.assertFalse(structured.plan_unlocked)
        self.assertEqual(structured.status, GroupStatus.ACTIVE)

        listed = self.client.get("/api/groups/?status=active")
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(
            any(item["id"] == structured.pk for item in listed.data)
        )
        detail = self.client.get(f"/api/groups/{structured.pk}/")
        self.assertEqual(detail.status_code, 403)
        self.assertEqual(detail.data["code"], "plan_resource_locked")

        self.downgrade(OrganizationPlan.BASIC)
        structured.refresh_from_db()
        self.assertFalse(structured.plan_unlocked)
        detail_basic = self.client.get(f"/api/groups/{structured.pk}/")
        self.assertEqual(detail_basic.status_code, 403)

    def test_admin_and_staff_categories_are_selected_independently(self):
        admins = [
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username=f"admin{index}",
                email=f"admin{index}@example.com",
                password="password12345",
                role=WorkspaceStaffRole.ADMIN,
            )
            for index in range(3)
        ]
        staff = [
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username=f"staff{index}",
                password="password12345",
                role=WorkspaceStaffRole.STAFF,
            )
            for index in range(6)
        ]
        self.downgrade(OrganizationPlan.PLUS)
        apply_slot_selection(
            self.organization, "workspace_admins", [item.pk for item in admins[:2]]
        )
        apply_slot_selection(
            self.organization, "workspace_staff", [item.pk for item in staff[:5]]
        )
        self.assertEqual(
            WorkspaceStaffAccount.objects.filter(plan_unlocked=True).count(), 7
        )

    def test_foreign_tenant_selection_is_rejected(self):
        other_owner = User.objects.create_user(
            email="other-plan-lock@example.com",
            password="password12345",
        )
        other = Organization.objects.create_with_owner(owner=other_owner)
        foreign_group = Group.objects.create_group(organization=other, name="Foreign")
        self.create_group("One")
        self.create_group("Two")
        self.create_group("Three")
        self.downgrade(OrganizationPlan.BASIC)
        with self.assertRaises(ValidationError):
            apply_slot_selection(
                self.organization,
                "active_standard_groups",
                [foreign_group.pk],
            )

    def test_locked_staff_login_returns_plan_account_locked(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="lockedstaff",
            password="password12345",
            role=WorkspaceStaffRole.STAFF,
        )
        self.downgrade(OrganizationPlan.BASIC)
        staff.refresh_from_db()
        self.assertFalse(staff.plan_unlocked)
        response = APIClient().post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.organization.workspace_id,
                "username": staff.username,
                "password": "password12345",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "plan_account_locked")
        self.assertEqual(staff.status, WorkspaceStaffStatus.ACTIVE)

    def test_action_history_is_preserved_when_group_locks(self):
        groups = [self.create_group(f"History {index}") for index in range(3)]
        record = ActionRecord.objects.create(
            organization=self.organization,
            group=groups[2],
            source_group_id=groups[2].pk,
            participant_kind="member",
            action_type=ActionType.CHECK_IN,
            source=ActionSource.OWNER,
            participant_name_snapshot="Historical Person",
            group_name_snapshot=groups[2].name,
        )
        self.downgrade(OrganizationPlan.BASIC)
        self.assertTrue(ActionRecord.objects.filter(pk=record.pk).exists())

    def test_stale_basic_over_capacity_self_heals_on_entitlement_payload(self):
        """Plan already Basic with unlocked Groups (pre-sync data) must lock-all."""
        from organizations.entitlements.service import build_entitlement_payload

        groups = [self.create_group(f"Stale {index}") for index in range(4)]
        structured = self.create_group("Stale Structured", group_type=GroupType.STRUCTURED)
        # Simulate legacy Basic data: plan Basic, resolved True, everything unlocked.
        Organization.objects.filter(pk=self.organization.pk).update(
            plan=OrganizationPlan.BASIC,
            active_standard_groups_slots_resolved=True,
            archived_groups_slots_resolved=True,
        )
        Group.objects.filter(organization=self.organization).update(plan_unlocked=True)
        self.organization.refresh_from_db()

        payload = build_entitlement_payload(self.organization)
        self.organization.refresh_from_db()
        self.assertTrue(payload["selection_required"]["active_standard_groups"])
        self.assertFalse(self.organization.active_standard_groups_slots_resolved)
        self.assertEqual(
            Group.objects.filter(
                pk__in=[item.pk for item in groups], plan_unlocked=True
            ).count(),
            0,
        )
        structured.refresh_from_db()
        self.assertFalse(structured.plan_unlocked)
        self.assertEqual(payload["usage"]["active_standard_groups"], 0)
        self.assertEqual(payload["usage_totals"]["active_standard_groups"], 4)

    def test_locked_group_kiosk_start_is_denied(self):
        groups = [self.create_group(f"Kiosk {index}") for index in range(3)]
        self.downgrade(OrganizationPlan.BASIC)
        for group in groups:
            response = self.client.post(f"/api/groups/{group.pk}/kiosk/")
            self.assertEqual(response.status_code, 403, response.data)
            self.assertEqual(response.data["code"], "plan_resource_locked")
        apply_slot_selection(
            self.organization,
            "active_standard_groups",
            [groups[0].pk, groups[1].pk],
        )
        allowed = self.client.post(f"/api/groups/{groups[0].pk}/kiosk/")
        # May be 409 if kiosk not configured — must not be plan lock.
        self.assertNotEqual(
            getattr(allowed, "data", {}).get("code"),
            "plan_resource_locked",
        )
        denied = self.client.post(f"/api/groups/{groups[2].pk}/kiosk/")
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.data["code"], "plan_resource_locked")

    def test_group_list_orders_unlocked_before_locked_after_selection(self):
        """Unlocked Groups list before locked; Structured stay in locked section."""
        # Names chosen so alphabetical order would put locked rows first if mixed.
        self.create_group("Alpha Locked")
        unlocked_b = self.create_group("Beta Available")
        self.create_group("Mike Locked")
        unlocked_z = self.create_group("Zulu Available")
        structured = self.create_group(
            "Structured Locked", group_type=GroupType.STRUCTURED
        )
        self.downgrade(OrganizationPlan.BASIC)
        apply_slot_selection(
            self.organization,
            "active_standard_groups",
            [unlocked_b.pk, unlocked_z.pk],
        )

        response = self.client.get("/api/groups/?status=active")
        self.assertEqual(response.status_code, 200, response.data)
        names = [row["name"] for row in response.data]
        self.assertEqual(
            names,
            [
                "Beta Available",
                "Zulu Available",
                "Alpha Locked",
                "Mike Locked",
                "Structured Locked",
            ],
        )
        self.assertFalse(response.data[0]["is_plan_locked"])
        self.assertFalse(response.data[1]["is_plan_locked"])
        self.assertTrue(all(row["is_plan_locked"] for row in response.data[2:]))
        self.assertEqual(response.data[-1]["id"], structured.pk)

        searched = self.client.get("/api/groups/?status=active&search=a")
        self.assertEqual(searched.status_code, 200, searched.data)
        searched_names = [row["name"] for row in searched.data]
        # Unlocked matches first, then locked matches (case-insensitive "a").
        self.assertEqual(
            searched_names,
            ["Beta Available", "Zulu Available", "Alpha Locked"],
        )

    def test_archived_group_list_orders_unlocked_before_locked(self):
        unlocked = self.create_group("Archived Available", archived=True)
        locked_early = self.create_group("Archived Locked Early", archived=True)
        also_unlocked = self.create_group("Zebra Archived Available", archived=True)
        self.downgrade(OrganizationPlan.BASIC)
        apply_slot_selection(
            self.organization,
            "archived_groups",
            [unlocked.pk, also_unlocked.pk],
        )
        response = self.client.get("/api/groups/?status=archived")
        self.assertEqual(response.status_code, 200, response.data)
        names = [row["name"] for row in response.data]
        self.assertEqual(
            names,
            [
                "Archived Available",
                "Zebra Archived Available",
                "Archived Locked Early",
            ],
        )
        self.assertFalse(response.data[0]["is_plan_locked"])
        self.assertFalse(response.data[1]["is_plan_locked"])
        self.assertTrue(response.data[2]["is_plan_locked"])
        self.assertEqual(response.data[2]["id"], locked_early.pk)

    def test_group_list_orders_unlocked_before_locked_for_plus_capacity(self):
        """Business → Plus: choose 10 of 12; unlocked first, locked after."""
        groups = [self.create_group(f"Std {index:02d}") for index in range(1, 13)]
        structured = self.create_group(
            "Extra Structured", group_type=GroupType.STRUCTURED
        )
        self.downgrade(OrganizationPlan.PLUS)
        apply_slot_selection(
            self.organization,
            "active_standard_groups",
            [group.pk for group in groups[:10]],
        )
        response = self.client.get("/api/groups/?status=active")
        self.assertEqual(response.status_code, 200, response.data)
        unlocked_names = [
            row["name"] for row in response.data if not row["is_plan_locked"]
        ]
        locked_names = [
            row["name"] for row in response.data if row["is_plan_locked"]
        ]
        self.assertEqual(
            unlocked_names, [f"Std {index:02d}" for index in range(1, 11)]
        )
        self.assertEqual(locked_names, ["Extra Structured", "Std 11", "Std 12"])
        first_locked_index = next(
            index
            for index, row in enumerate(response.data)
            if row["is_plan_locked"]
        )
        self.assertTrue(
            all(
                not row["is_plan_locked"]
                for row in response.data[:first_locked_index]
            )
        )
        self.assertTrue(
            all(row["is_plan_locked"] for row in response.data[first_locked_index:])
        )
        self.assertIn(structured.name, locked_names)

    def test_staff_list_orders_unlocked_admins_and_staff_before_locked(self):
        admins = [
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username=f"admin{index}",
                email=f"admin{index}@cursor.test",
                password="password12345",
                role=WorkspaceStaffRole.ADMIN,
            )
            for index in range(1, 4)
        ]
        staff = [
            WorkspaceStaffAccount.objects.create_account(
                organization=self.organization,
                username=f"staff{index}",
                password="password12345",
                role=WorkspaceStaffRole.STAFF,
            )
            for index in range(1, 7)
        ]
        # Assign groups to one staff account so we can prove preservation after lock.
        from organizations.staff_group_access import set_staff_group_access, staff_assigned_group_ids

        group = self.create_group("Staff Access Group")
        set_staff_group_access(
            staff_account=staff[5],
            organization=self.organization,
            group_ids=[group.pk],
        )

        self.downgrade(OrganizationPlan.PLUS)
        apply_slot_selection(
            self.organization, "workspace_admins", [admins[1].pk, admins[2].pk]
        )
        apply_slot_selection(
            self.organization,
            "workspace_staff",
            [item.pk for item in staff[:5]],
        )

        response = self.client.get("/api/workspace-staff/")
        self.assertEqual(response.status_code, 200, response.data)
        usernames = [row["username"] for row in response.data]
        self.assertEqual(
            usernames,
            [
                "admin2",
                "admin3",
                "staff1",
                "staff2",
                "staff3",
                "staff4",
                "staff5",
                "admin1",
                "staff6",
            ],
        )
        unlocked = [row for row in response.data if not row["is_plan_locked"]]
        locked = [row for row in response.data if row["is_plan_locked"]]
        self.assertEqual(
            [row["username"] for row in unlocked],
            ["admin2", "admin3", "staff1", "staff2", "staff3", "staff4", "staff5"],
        )
        self.assertEqual(
            [row["username"] for row in locked],
            ["admin1", "staff6"],
        )
        self.assertEqual(staff_assigned_group_ids(staff[5]), {group.pk})

        locked_login = APIClient().post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.organization.workspace_id,
                "username": "staff6",
                "password": "password12345",
            },
            format="json",
        )
        self.assertEqual(locked_login.status_code, 403)
        self.assertEqual(locked_login.data["code"], "plan_account_locked")

        # Business/Plus → Basic locks all Admin/Staff accounts deterministically.
        self.downgrade(OrganizationPlan.BASIC)
        basic_list = self.client.get("/api/workspace-staff/")
        # Staff management feature is off on Basic — list is feature-denied.
        self.assertEqual(basic_list.status_code, 403)
        self.assertFalse(
            WorkspaceStaffAccount.objects.filter(
                organization=self.organization, plan_unlocked=True
            ).exists()
        )
        from organizations.entitlements.plan_locks import (
            order_staff_queryset_by_plan_availability,
        )

        ordered = list(
            order_staff_queryset_by_plan_availability(
                WorkspaceStaffAccount.objects.filter(organization=self.organization)
            )
        )
        self.assertEqual(
            [item.username for item in ordered],
            [
                "admin1",
                "admin2",
                "admin3",
                "staff1",
                "staff2",
                "staff3",
                "staff4",
                "staff5",
                "staff6",
            ],
        )
        self.assertTrue(all(not item.plan_unlocked for item in ordered))
        self.assertEqual(staff_assigned_group_ids(staff[5]), {group.pk})


class MemberPlanLockTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="member-plan-lock@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan", "updated_at"])
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def downgrade(self, plan):
        self.organization.plan = plan
        self.organization.save(update_fields=["plan", "updated_at"])
        self.organization.refresh_from_db()

    def bulk_members(self, count, *, prefix="Member"):
        from members.models import Member

        return Member.objects.bulk_create(
            [
                Member(
                    organization=self.organization,
                    name=f"{prefix} {index:03d}",
                    plan_unlocked=True,
                )
                for index in range(count)
            ]
        )

    def test_business_300_to_basic_locks_all_until_exact_selection(self):
        from members.models import Member

        members = self.bulk_members(300)
        self.downgrade(OrganizationPlan.BASIC)

        self.assertFalse(self.organization.members_slots_resolved)
        self.assertEqual(
            Member.objects.filter(
                organization=self.organization, plan_unlocked=True
            ).count(),
            0,
        )

        workspace = self.client.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        entitlements = workspace.data["entitlements"]
        self.assertTrue(entitlements["selection_required"]["members"])
        self.assertEqual(entitlements["usage_totals"]["members"], 300)
        self.assertEqual(entitlements["usage"]["members"], 0)
        self.assertEqual(entitlements["limits"]["members"], 10)

        selection = self.client.get(
            "/api/plan-locks/selection/",
            {"kind": "members"},
        )
        self.assertEqual(selection.status_code, 200, selection.data)
        self.assertEqual(selection.data["limit"], 10)
        self.assertEqual(selection.data["current_unlocked"], [])
        self.assertEqual(len(selection.data["candidates"]), 300)

        create_blocked = self.client.post(
            "/api/members/",
            {"name": "New After Downgrade"},
            format="json",
        )
        self.assertEqual(create_blocked.status_code, 403)
        self.assertEqual(create_blocked.data["code"], "plan_selection_required")

        chosen = [item.pk for item in members[:10]]
        wrong = self.client.put(
            "/api/plan-locks/selection/",
            {"kind": "members", "selected_ids": chosen[:9]},
            format="json",
        )
        self.assertEqual(wrong.status_code, 400)

        confirmed = self.client.put(
            "/api/plan-locks/selection/",
            {"kind": "members", "selected_ids": chosen},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.organization.refresh_from_db()
        self.assertTrue(self.organization.members_slots_resolved)
        self.assertEqual(
            Member.objects.filter(
                organization=self.organization, plan_unlocked=True
            ).count(),
            10,
        )
        self.assertEqual(
            Member.objects.filter(
                organization=self.organization, plan_unlocked=False
            ).count(),
            290,
        )

        listing = self.client.get("/api/members/?status=active")
        self.assertEqual(listing.status_code, 200)
        ids = [item["id"] for item in listing.data]
        self.assertEqual(len(ids), 300)
        unlocked_ids = {
            item["id"] for item in listing.data if item.get("plan_unlocked")
        }
        self.assertEqual(unlocked_ids, set(chosen))
        # Unlocked Members are ordered before locked ones.
        first_locked_index = next(
            index
            for index, item in enumerate(listing.data)
            if not item.get("plan_unlocked")
        )
        self.assertTrue(
            all(item.get("plan_unlocked") for item in listing.data[:first_locked_index])
        )
        self.assertTrue(
            all(
                not item.get("plan_unlocked")
                for item in listing.data[first_locked_index:]
            )
        )

        locked_member = members[10]
        detail = self.client.get(f"/api/members/{locked_member.pk}/")
        self.assertEqual(detail.status_code, 403)
        self.assertEqual(detail.data["code"], "plan_resource_locked")
        patch = self.client.patch(
            f"/api/members/{locked_member.pk}/",
            {"name": "Hacked"},
            format="json",
        )
        self.assertEqual(patch.status_code, 403)

        # No slot swapping after resolution.
        swap = self.client.put(
            "/api/plan-locks/selection/",
            {
                "kind": "members",
                "selected_ids": [members[10].pk] + chosen[1:],
            },
            format="json",
        )
        self.assertEqual(swap.status_code, 400)

    def test_locked_member_existing_participation_survives(self):
        from attendance.models import ActionRecord, ActionType
        from groups.models import Group, GroupMembership, GroupMembershipStatus
        from kiosk_builder.testing import configure_group_kiosk_for_launch
        from members.models import Member

        group_a = Group.objects.create_group(
            organization=self.organization,
            name="Operational Group A",
        )
        group_b = Group.objects.create_group(
            organization=self.organization,
            name="Operational Group B",
        )
        locked_member = Member.objects.create_member(
            organization=self.organization,
            name="Locked Participant",
            email="locked-participant@example.com",
        )
        other_members = self.bulk_members(11, prefix="Extra")
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=group_a,
            member=locked_member,
        )
        configure_group_kiosk_for_launch(group_a)
        configure_group_kiosk_for_launch(group_b)

        self.downgrade(OrganizationPlan.BASIC)
        # Two Standard Groups fit Basic exactly, so Groups auto-resolve unlocked.
        self.organization.refresh_from_db()
        self.assertTrue(self.organization.active_standard_groups_slots_resolved)
        apply_slot_selection(
            self.organization,
            "members",
            [item.pk for item in other_members[:10]],
        )
        locked_member.refresh_from_db()
        membership.refresh_from_db()
        self.assertFalse(locked_member.plan_unlocked)
        self.assertEqual(membership.status, GroupMembershipStatus.ACTIVE)

        group_detail = self.client.get(f"/api/groups/{group_a.pk}/")
        self.assertEqual(group_detail.status_code, 200)
        readiness = group_detail.data.get("readiness") or {}
        # Existing membership with a plan-locked Member profile must not force incomplete.
        if "incomplete_because_member_plan_locked" in readiness:
            self.fail("Member plan lock must not mark Group incomplete")

        participants = self.client.get(f"/api/groups/{group_a.pk}/memberships/")
        self.assertEqual(participants.status_code, 200)
        self.assertEqual(len(participants.data), 1)
        member_payload = participants.data[0]["member"]
        member_id = (
            member_payload["id"]
            if isinstance(member_payload, dict)
            else member_payload
        )
        self.assertEqual(member_id, locked_member.pk)

        patch_participation = self.client.patch(
            f"/api/groups/{group_a.pk}/memberships/{membership.pk}/",
            {"participation_pin": "1234"},
            format="json",
        )
        self.assertEqual(patch_participation.status_code, 200, patch_participation.data)

        available = self.client.get(f"/api/groups/{group_b.pk}/available-members/")
        self.assertEqual(available.status_code, 200)
        available_ids = {item["id"] for item in available.data}
        self.assertNotIn(locked_member.pk, available_ids)

        rejected = self.client.post(
            f"/api/groups/{group_b.pk}/memberships/",
            {"member_id": locked_member.pk},
            format="json",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("locked", str(rejected.data).lower())

        lock = self.client.post(f"/api/groups/{group_a.pk}/kiosk/")
        self.assertEqual(lock.status_code, 200, lock.data)
        start = self.client.get(f"/api/groups/{group_a.pk}/kiosk/")
        self.assertEqual(start.status_code, 200, start.data)
        people = start.data.get("people") or []
        self.assertTrue(
            any(item.get("membership_id") == membership.pk for item in people),
            start.data,
        )

        before = ActionRecord.objects.count()
        identify = self.client.post(
            f"/api/groups/{group_a.pk}/kiosk/identify/",
            {
                "participant_kind": "member",
                "membership_id": membership.pk,
            },
            format="json",
        )
        self.assertEqual(identify.status_code, 200, identify.data)
        action = self.client.post(
            f"/api/groups/{group_a.pk}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": membership.pk,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        self.assertEqual(action.status_code, 200, getattr(action, "data", action.content))
        self.assertEqual(ActionRecord.objects.count(), before + 1)
        self.assertTrue(
            ActionRecord.objects.filter(
                group=group_a,
                member=locked_member,
                action_type=ActionType.CHECK_IN,
            ).exists()
        )

    def test_plus_requires_50_from_over_capacity(self):
        from members.models import Member

        members = self.bulk_members(60)
        self.downgrade(OrganizationPlan.PLUS)
        self.assertFalse(self.organization.members_slots_resolved)
        self.assertEqual(
            Member.objects.filter(
                organization=self.organization, plan_unlocked=True
            ).count(),
            0,
        )
        chosen = [item.pk for item in members[:50]]
        confirmed = self.client.put(
            "/api/plan-locks/selection/",
            {"kind": "members", "selected_ids": chosen},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(
            Member.objects.filter(
                organization=self.organization, plan_unlocked=True
            ).count(),
            50,
        )

    def test_upgrade_to_business_unlocks_when_under_limit(self):
        from members.models import Member

        members = self.bulk_members(40)
        self.downgrade(OrganizationPlan.BASIC)
        apply_slot_selection(
            self.organization,
            "members",
            [item.pk for item in members[:10]],
        )
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan", "updated_at"])
        self.organization.refresh_from_db()
        self.assertTrue(self.organization.members_slots_resolved)
        self.assertEqual(
            Member.objects.filter(
                organization=self.organization, plan_unlocked=True
            ).count(),
            40,
        )

    def test_member_selection_tenant_isolation(self):
        from members.models import Member

        other_owner = User.objects.create_user(
            email="other-member-lock@example.com",
            password="password12345",
        )
        other_owner.email_verified = True
        other_owner.save(update_fields=["email_verified"])
        other_org = Organization.objects.create_with_owner(owner=other_owner)
        other_org.plan = OrganizationPlan.BUSINESS
        other_org.save(update_fields=["plan", "updated_at"])
        foreign = Member.objects.create_member(
            organization=other_org,
            name="Foreign Member",
        )
        locals_ = self.bulk_members(12)
        self.downgrade(OrganizationPlan.BASIC)
        response = self.client.put(
            "/api/plan-locks/selection/",
            {
                "kind": "members",
                "selected_ids": [foreign.pk] + [item.pk for item in locals_[:9]],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
