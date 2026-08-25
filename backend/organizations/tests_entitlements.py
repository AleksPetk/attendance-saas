"""Plan catalog, entitlement, usage, and enforcement tests."""

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from groups.models import Group, GroupType
from members.models import Member
from organizations.entitlements import (
    FEATURE_GROUP_FORWARD_EMAILS,
    FEATURE_REPORT_EXPORT_CSV,
    FEATURE_STAFF_MANAGEMENT,
    FEATURE_STRUCTURED_GROUPS,
    FEATURE_STRUCTURED_SNAPSHOT_IMPORT,
    LIMIT_ACTIVE_STANDARD_GROUPS,
    LIMIT_ACTIVE_STRUCTURED_GROUPS,
    LIMIT_ARCHIVED_GROUPS,
    LIMIT_CLASSES_PER_STRUCTURED_GROUP,
    LIMIT_MEMBERS,
    LIMIT_PARTICIPANTS_PER_CLASS,
    LIMIT_PARTICIPANTS_PER_STANDARD_GROUP,
    LIMIT_WORKSPACE_ADMINS,
    LIMIT_WORKSPACE_STAFF,
    PLAN_BASIC,
    PLAN_BUSINESS,
    PLAN_PLUS,
    build_entitlement_payload,
    get_over_limit_state,
    get_plan_definition,
    get_usage,
    has_feature,
    plan_limit,
)
from organizations.models import Organization, OrganizationPlan, WorkspaceStaffRole


def plan_error_payload(response):
    data = response.data
    if isinstance(data, dict) and "code" in data:
        return data
    detail = data.get("detail") if isinstance(data, dict) else None
    if isinstance(detail, dict):
        return detail
    return data


class PlanCatalogTests(TestCase):
    def test_basic_frozen_limits_and_features(self):
        plan = get_plan_definition(PLAN_BASIC)
        self.assertEqual(plan["limits"][LIMIT_ACTIVE_STANDARD_GROUPS], 2)
        self.assertEqual(plan["limits"][LIMIT_ACTIVE_STRUCTURED_GROUPS], 0)
        self.assertEqual(plan["limits"][LIMIT_ARCHIVED_GROUPS], 2)
        self.assertEqual(plan["limits"][LIMIT_MEMBERS], 10)
        self.assertEqual(plan["limits"][LIMIT_PARTICIPANTS_PER_STANDARD_GROUP], 10)
        self.assertEqual(plan["limits"][LIMIT_WORKSPACE_ADMINS], 0)
        self.assertEqual(plan["limits"][LIMIT_WORKSPACE_STAFF], 0)
        self.assertFalse(plan["features"][FEATURE_STRUCTURED_GROUPS])
        self.assertFalse(plan["features"][FEATURE_STAFF_MANAGEMENT])
        self.assertFalse(plan["features"][FEATURE_REPORT_EXPORT_CSV])
        self.assertFalse(plan["features"][FEATURE_GROUP_FORWARD_EMAILS])
        self.assertTrue(plan["features"]["ads_required"])
        self.assertNotIn("basic_kiosk_card_template_ids", plan)
        self.assertNotIn("full_kiosk_templates", plan["features"])

    def test_plus_frozen_limits_and_features(self):
        plan = get_plan_definition(PLAN_PLUS)
        self.assertEqual(plan["limits"][LIMIT_ACTIVE_STANDARD_GROUPS], 10)
        self.assertEqual(plan["limits"][LIMIT_MEMBERS], 50)
        self.assertEqual(plan["limits"][LIMIT_PARTICIPANTS_PER_STANDARD_GROUP], 50)
        self.assertEqual(plan["limits"][LIMIT_WORKSPACE_ADMINS], 2)
        self.assertEqual(plan["limits"][LIMIT_WORKSPACE_STAFF], 5)
        self.assertEqual(plan["limits"][LIMIT_ARCHIVED_GROUPS], 10)
        self.assertFalse(plan["features"][FEATURE_STRUCTURED_GROUPS])
        self.assertFalse(plan["features"][FEATURE_STRUCTURED_SNAPSHOT_IMPORT])
        self.assertTrue(plan["features"][FEATURE_STAFF_MANAGEMENT])
        self.assertTrue(plan["features"][FEATURE_REPORT_EXPORT_CSV])
        self.assertTrue(plan["features"][FEATURE_GROUP_FORWARD_EMAILS])
        self.assertFalse(plan["features"]["ads_required"])

    def test_business_frozen_limits_and_features(self):
        plan = get_plan_definition(PLAN_BUSINESS)
        self.assertEqual(plan["limits"][LIMIT_ACTIVE_STANDARD_GROUPS], 30)
        self.assertEqual(plan["limits"][LIMIT_ACTIVE_STRUCTURED_GROUPS], 15)
        self.assertEqual(plan["limits"][LIMIT_ARCHIVED_GROUPS], 50)
        self.assertEqual(plan["limits"][LIMIT_MEMBERS], 300)
        self.assertEqual(plan["limits"][LIMIT_PARTICIPANTS_PER_STANDARD_GROUP], 150)
        self.assertEqual(plan["limits"][LIMIT_CLASSES_PER_STRUCTURED_GROUP], 30)
        self.assertEqual(plan["limits"][LIMIT_PARTICIPANTS_PER_CLASS], 150)
        self.assertEqual(plan["limits"][LIMIT_WORKSPACE_ADMINS], 5)
        self.assertEqual(plan["limits"][LIMIT_WORKSPACE_STAFF], 25)
        self.assertTrue(plan["features"][FEATURE_STRUCTURED_GROUPS])
        self.assertTrue(plan["features"][FEATURE_STRUCTURED_SNAPSHOT_IMPORT])


class EntitlementApiFixtureMixin:
    def setUp(self):
        self.owner = User.objects.create_user(
            email="owner-plan@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Plan Org",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def set_plan(self, plan):
        self.org.plan = plan
        self.org.save(update_fields=["plan", "updated_at"])
        self.org.refresh_from_db()

    def create_standard_group(self, name):
        return self.client.post(
            "/api/groups/",
            {"name": name, "group_type": GroupType.STANDARD},
            format="json",
        )

    def create_structured_group(self, name):
        return self.client.post(
            "/api/groups/",
            {"name": name, "group_type": GroupType.STRUCTURED},
            format="json",
        )

    def create_member(self, name):
        return self.client.post(
            "/api/members/",
            {"name": name},
            format="json",
        )


class BasicPlanEnforcementTests(EntitlementApiFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.set_plan(OrganizationPlan.BASIC)

    def test_default_plan_is_basic(self):
        org = Organization.objects.create_with_owner(
            owner=User.objects.create_user(
                email="new@example.com", password="password12345"
            )
        )
        self.assertEqual(org.plan, OrganizationPlan.BASIC)

    def test_two_standard_groups_allowed_third_blocked(self):
        self.assertEqual(self.create_standard_group("G1").status_code, 201)
        self.assertEqual(self.create_standard_group("G2").status_code, 201)
        blocked = self.create_standard_group("G3")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(plan_error_payload(blocked).get("code"), "plan_limit_exceeded")

    def test_structured_group_blocked(self):
        resp = self.create_structured_group("Structured")
        self.assertEqual(resp.status_code, 403)
        payload = plan_error_payload(resp)
        self.assertEqual(payload.get("code"), "plan_feature_locked")
        self.assertEqual(payload.get("feature"), FEATURE_STRUCTURED_GROUPS)

    def test_ten_members_allowed_eleventh_blocked(self):
        for i in range(10):
            self.assertEqual(self.create_member(f"M{i}").status_code, 201)
        blocked = self.create_member("M10")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(plan_error_payload(blocked).get("limit_key"), LIMIT_MEMBERS)

    def test_ten_participants_allowed_eleventh_blocked(self):
        group_resp = self.create_standard_group("Participants")
        self.assertEqual(group_resp.status_code, 201)
        group_id = group_resp.data["id"]
        for i in range(10):
            resp = self.client.post(
                f"/api/groups/{group_id}/participants/",
                {"name": f"P{i}"},
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.data)
        blocked = self.client.post(
            f"/api/groups/{group_id}/participants/",
            {"name": "P10"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(
            plan_error_payload(blocked).get("limit_key"),
            LIMIT_PARTICIPANTS_PER_STANDARD_GROUP,
        )

    def test_admin_and_staff_creation_blocked(self):
        admin = self.client.post(
            "/api/workspace-staff/",
            {
                "username": "admin1",
                "password": "password12345",
                "role": WorkspaceStaffRole.ADMIN,
                "email": "admin1@example.com",
            },
            format="json",
        )
        self.assertEqual(admin.status_code, 403)
        staff = self.client.post(
            "/api/workspace-staff/",
            {
                "username": "staff1",
                "password": "password12345",
                "role": WorkspaceStaffRole.STAFF,
            },
            format="json",
        )
        self.assertEqual(staff.status_code, 403)
        listing = self.client.get("/api/workspace-staff/")
        self.assertEqual(listing.status_code, 403)

    def test_export_and_forward_emails_blocked(self):
        group_resp = self.create_standard_group("Export Group")
        group_id = group_resp.data["id"]
        export = self.client.get(
            "/api/history/attendance-report/export/",
            {"source_group_id": group_id, "preset": "today", "export_format": "csv"},
        )
        self.assertEqual(export.status_code, 403)

        patch = self.client.patch(
            f"/api/groups/{group_id}/",
            {"forward_emails": ["copy@example.com"]},
            format="json",
        )
        self.assertEqual(patch.status_code, 403)
        self.assertEqual(
            plan_error_payload(patch).get("feature"), FEATURE_GROUP_FORWARD_EMAILS
        )

    def test_workspace_payload_includes_entitlements(self):
        resp = self.client.get("/api/workspace/")
        self.assertEqual(resp.status_code, 200)
        entitlements = resp.data["entitlements"]
        self.assertEqual(entitlements["plan"]["key"], PLAN_BASIC)
        self.assertEqual(entitlements["usage"][LIMIT_ACTIVE_STANDARD_GROUPS], 0)
        self.assertFalse(entitlements["features"][FEATURE_STAFF_MANAGEMENT])
        self.assertTrue(entitlements["features"]["ads_required"])
        self.assertNotIn("basic_kiosk_templates_confirmed", entitlements)
        self.assertNotIn("full_kiosk_templates", entitlements["features"])


class PlusPlanEnforcementTests(EntitlementApiFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.set_plan(OrganizationPlan.PLUS)

    def test_ten_groups_ok_eleventh_blocked(self):
        for i in range(10):
            self.assertEqual(self.create_standard_group(f"G{i}").status_code, 201)
        self.assertEqual(self.create_standard_group("G10").status_code, 403)

    def test_structured_blocked_exports_and_forward_allowed(self):
        self.assertEqual(self.create_structured_group("S1").status_code, 403)
        group_id = self.create_standard_group("Plus Group").data["id"]
        patch = self.client.patch(
            f"/api/groups/{group_id}/",
            {"forward_emails": ["copy@example.com"]},
            format="json",
        )
        self.assertEqual(patch.status_code, 200)
        self.assertTrue(has_feature(self.org, FEATURE_REPORT_EXPORT_CSV))
        self.assertFalse(has_feature(self.org, FEATURE_STRUCTURED_SNAPSHOT_IMPORT))

    def test_staff_admin_limits(self):
        for i in range(2):
            resp = self.client.post(
                "/api/workspace-staff/",
                {
                    "username": f"admin{i}",
                    "password": "PlanTest-Passw0rd!",
                    "role": WorkspaceStaffRole.ADMIN,
                    "email": f"admin{i}@example.com",
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.data)
        blocked_admin = self.client.post(
            "/api/workspace-staff/",
            {
                "username": "admin2",
                "password": "PlanTest-Passw0rd!",
                "role": WorkspaceStaffRole.ADMIN,
                "email": "admin2@example.com",
            },
            format="json",
        )
        self.assertEqual(blocked_admin.status_code, 403)

        for i in range(5):
            resp = self.client.post(
                "/api/workspace-staff/",
                {
                    "username": f"staff{i}",
                    "password": "PlanTest-Passw0rd!",
                    "role": WorkspaceStaffRole.STAFF,
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.data)
        blocked_staff = self.client.post(
            "/api/workspace-staff/",
            {
                "username": "staff5",
                "password": "PlanTest-Passw0rd!",
                "role": WorkspaceStaffRole.STAFF,
            },
            format="json",
        )
        self.assertEqual(blocked_staff.status_code, 403)

    def test_member_and_participant_limits(self):
        for i in range(50):
            self.assertEqual(self.create_member(f"PlusM{i}").status_code, 201)
        self.assertEqual(self.create_member("PlusM50").status_code, 403)

        group_id = self.create_standard_group("Plus Participants").data["id"]
        for i in range(50):
            resp = self.client.post(
                f"/api/groups/{group_id}/participants/",
                {"name": f"PP{i}"},
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.data)
        blocked = self.client.post(
            f"/api/groups/{group_id}/participants/",
            {"name": "PP50"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 403)


class BusinessPlanEnforcementTests(EntitlementApiFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.set_plan(OrganizationPlan.BUSINESS)

    def test_structured_group_and_class_allowed(self):
        group = self.create_structured_group("Biz Structured")
        self.assertEqual(group.status_code, 201, group.data)
        group_id = group.data["id"]
        section = self.client.post(
            f"/api/groups/{group_id}/classes/",
            {"name": "Class A"},
            format="json",
        )
        self.assertEqual(section.status_code, 201, section.data)
        self.assertEqual(
            get_usage(self.org, LIMIT_CLASSES_PER_STRUCTURED_GROUP, group=Group.objects.get(pk=group_id)),
            1,
        )

    def test_snapshot_import_feature_enabled(self):
        self.assertTrue(has_feature(self.org, FEATURE_STRUCTURED_SNAPSHOT_IMPORT))
        self.assertEqual(plan_limit(PLAN_BUSINESS, LIMIT_ACTIVE_STRUCTURED_GROUPS), 15)
        self.assertEqual(plan_limit(PLAN_BUSINESS, LIMIT_PARTICIPANTS_PER_CLASS), 150)
        payload = build_entitlement_payload(self.org)
        self.assertEqual(payload["limits"][LIMIT_MEMBERS], 300)
        self.assertEqual(payload["limits"][LIMIT_WORKSPACE_ADMINS], 5)
        self.assertEqual(payload["limits"][LIMIT_WORKSPACE_STAFF], 25)


class DowngradeOverLimitTests(EntitlementApiFixtureMixin, TestCase):
    def test_downgrade_keeps_data_and_blocks_growth(self):
        self.set_plan(OrganizationPlan.BUSINESS)
        ids = []
        for i in range(5):
            resp = self.create_standard_group(f"Keep{i}")
            self.assertEqual(resp.status_code, 201)
            ids.append(resp.data["id"])

        self.set_plan(OrganizationPlan.BASIC)
        over = get_over_limit_state(self.org)
        self.assertTrue(
            any(item["resource"] == LIMIT_ACTIVE_STANDARD_GROUPS for item in over)
        )
        payload = build_entitlement_payload(self.org)
        self.assertTrue(payload["is_over_limit"])
        self.assertEqual(payload["usage"][LIMIT_ACTIVE_STANDARD_GROUPS], 0)
        self.assertEqual(payload["usage_totals"][LIMIT_ACTIVE_STANDARD_GROUPS], 5)
        self.assertEqual(payload["limits"][LIMIT_ACTIVE_STANDARD_GROUPS], 2)

        self.assertEqual(Group.objects.filter(organization=self.org).count(), 5)
        blocked = self.create_standard_group("Extra")
        self.assertEqual(blocked.status_code, 403)

        selection = self.client.put(
            "/api/plan-locks/selection/",
            {
                "kind": LIMIT_ACTIVE_STANDARD_GROUPS,
                "selected_ids": ids[:2],
            },
            format="json",
        )
        self.assertEqual(selection.status_code, 200, selection.data)
        for group_id in ids[:2]:
            archive = self.client.post(f"/api/groups/{group_id}/archive/")
            self.assertEqual(archive.status_code, 200, archive.data)

        workspace = self.client.get("/api/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertTrue(workspace.data["entitlements"]["is_over_limit"])


class TenantIsolationUsageTests(TestCase):
    def test_usage_does_not_count_other_workspace(self):
        owner_a = User.objects.create_user(
            email="tenant-a@example.com", password="password12345"
        )
        owner_a.email_verified = True
        owner_a.save(update_fields=["email_verified"])
        owner_b = User.objects.create_user(
            email="tenant-b@example.com", password="password12345"
        )
        owner_b.email_verified = True
        owner_b.save(update_fields=["email_verified"])
        org_a = Organization.objects.create_with_owner(owner=owner_a)
        org_b = Organization.objects.create_with_owner(owner=owner_b)
        client_a = APIClient()
        client_a.force_authenticate(user=owner_a)
        client_b = APIClient()
        client_b.force_authenticate(user=owner_b)

        for i in range(2):
            self.assertEqual(
                client_a.post(
                    "/api/groups/",
                    {"name": f"A{i}", "group_type": GroupType.STANDARD},
                    format="json",
                ).status_code,
                201,
            )
            self.assertEqual(
                client_a.post("/api/members/", {"name": f"AM{i}"}, format="json").status_code,
                201,
            )

        payload_b = client_b.get("/api/workspace/").data["entitlements"]
        self.assertEqual(payload_b["usage"][LIMIT_ACTIVE_STANDARD_GROUPS], 0)
        self.assertEqual(payload_b["usage"][LIMIT_MEMBERS], 0)
        self.assertEqual(get_usage(org_a, LIMIT_ACTIVE_STANDARD_GROUPS), 2)
        self.assertEqual(get_usage(org_b, LIMIT_ACTIVE_STANDARD_GROUPS), 0)
        self.assertEqual(Member.objects.filter(organization=org_a).count(), 2)


class KioskTemplatePlanAccessTests(EntitlementApiFixtureMixin, TestCase):
    """All plans may save any valid Card/Input template; plan must not reject."""

    def _put_templates(self, group_id, card_template, input_template):
        import json

        from kiosk_builder.config_schema import default_config

        url = f"/api/groups/{group_id}/kiosk-design/"
        self.client.get(url)
        config = default_config()
        config["main"]["card_template"] = card_template
        config["main"]["input_template"] = input_template
        return self.client.put(
            url,
            data={"config": json.dumps(config)},
            format="multipart",
        )

    def _assert_plan_accepts_full_catalog_templates(self, plan):
        self.set_plan(plan)
        group_id = self.create_standard_group(f"Templates {plan}").data["id"]
        # Non-default catalog IDs that were never part of a Basic allowlist.
        card_template = "cyber_hex"
        input_template = "ticket"
        resp = self._put_templates(group_id, card_template, input_template)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["config"]["main"]["card_template"], card_template)
        self.assertEqual(resp.data["config"]["main"]["input_template"], input_template)
        payload = plan_error_payload(resp)
        self.assertNotEqual(payload.get("code"), "plan_feature_locked")
        self.assertNotEqual(payload.get("code"), "plan_limit_exceeded")

    def test_basic_can_use_any_kiosk_template(self):
        self._assert_plan_accepts_full_catalog_templates(OrganizationPlan.BASIC)

    def test_plus_can_use_any_kiosk_template(self):
        self._assert_plan_accepts_full_catalog_templates(OrganizationPlan.PLUS)

    def test_business_can_use_any_kiosk_template(self):
        self._assert_plan_accepts_full_catalog_templates(OrganizationPlan.BUSINESS)
