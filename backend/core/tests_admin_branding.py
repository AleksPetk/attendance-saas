from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import Client, RequestFactory, TestCase
from django.urls import reverse

from accounts.testing import force_platform_admin_login
from core.admin_branding import INDEX_TITLE, SITE_HEADER, SITE_TITLE
from core.admin_dashboard import (
    build_nav_groups,
    build_plan_metrics,
    build_summary_metrics,
)
from groups.models import Group
from members.models import Member
from organizations.models import (
    Organization,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
)

User = get_user_model()


class PlatformAdminBrandingTests(TestCase):
    def test_site_branding_is_installed(self):
        self.assertEqual(admin.site.site_header, SITE_HEADER)
        self.assertEqual(admin.site.site_title, SITE_TITLE)
        self.assertEqual(admin.site.index_title, INDEX_TITLE)
        self.assertEqual(admin.site.index_template, "admin/platform_dashboard.html")

    def test_app_list_prioritizes_business_models(self):
        User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        request = RequestFactory().get("/admin/")
        request.user = User.objects.get(email="platform-admin@example.com")
        app_labels = [app["app_label"] for app in admin.site.get_app_list(request)]

        self.assertEqual(
            app_labels[:4],
            ["organizations", "accounts", "members", "groups"],
        )
        self.assertEqual(app_labels[-1], "auth")

    def test_organization_models_appear_before_staff(self):
        User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        request = RequestFactory().get("/admin/")
        request.user = User.objects.get(email="platform-admin@example.com")
        organizations = next(
            app
            for app in admin.site.get_app_list(request)
            if app["app_label"] == "organizations"
        )
        model_names = [
            model["object_name"].lower() for model in organizations["models"]
        ]
        self.assertEqual(model_names[0], "organization")
        self.assertEqual(model_names[1], "workspacestaffaccount")

    def test_login_page_shows_check_station_branding(self):
        response = self.client.get("/admin/login/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Check Station")
        self.assertContains(response, "checkstation_admin.css")

    def test_base_site_includes_theme_assets(self):
        User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.client.force_login(
            User.objects.get(email="platform-admin@example.com")
        )
        response = self.client.get("/admin/login/")
        self.assertContains(response, "cs-admin-brand")
        self.assertContains(response, "Inter")


class PlatformAdminDashboardTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.superuser = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Morning class",
        )
        self.member = Member.objects.create(
            organization=self.organization,
            name="Alex",
        )
        force_platform_admin_login(self.client, self.superuser)

    def test_admin_index_renders_custom_dashboard(self):
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Platform dashboard")
        self.assertContains(response, "cs-dashboard")
        self.assertContains(response, "Advertising")
        self.assertContains(response, "Disable advertising")
        self.assertNotContains(response, "class=\"addlink\"")
        self.assertNotContains(response, "class=\"changelink\"")
        self.assertNotContains(response, "Recent actions")

    def test_dashboard_metrics_use_real_counts(self):
        metrics = build_summary_metrics()
        self.assertEqual(metrics["customer_owners"], 1)
        self.assertEqual(metrics["active_workspaces"], 1)
        self.assertEqual(metrics["workspace_staff"], 1)
        self.assertEqual(metrics["groups"], 1)
        self.assertEqual(metrics["members"], 1)
        self.assertGreaterEqual(metrics["registrations_today"], 1)
        self.assertGreaterEqual(metrics["registrations_week"], 1)

        response = self.client.get("/admin/")
        self.assertContains(response, "Customer accounts")
        self.assertContains(response, f'<p class="cs-metric-value">{metrics["customer_owners"]}</p>', html=True)

    def test_plan_metrics_are_placeholders_without_fake_counts(self):
        plans = build_plan_metrics()
        self.assertFalse(plans["available"])
        self.assertEqual(
            [tier["label"] for tier in plans["tiers"]],
            ["Basic", "Plus", "Business"],
        )
        for tier in plans["tiers"]:
            self.assertIsNone(tier["count"])

        response = self.client.get("/admin/")
        self.assertContains(response, "subscription entitlement")
        self.assertContains(response, "Basic")
        self.assertContains(response, "Plus")
        self.assertContains(response, "Business")

    def test_recent_registrations_render(self):
        response = self.client.get("/admin/")
        self.assertContains(response, "New registrations")
        self.assertContains(response, "owner@example.com")
        self.assertContains(response, self.organization.workspace_id)
        self.assertContains(response, "Verified")
        self.assertContains(
            response,
            reverse("admin:accounts_user_change", args=[self.owner.pk]),
        )

    def test_quick_links_point_to_changelists(self):
        response = self.client.get("/admin/")
        for url_name in (
            "admin:accounts_user_changelist",
            "admin:organizations_organization_changelist",
            "admin:organizations_workspacestaffaccount_changelist",
            "admin:groups_group_changelist",
            "admin:members_member_changelist",
            "admin:kiosk_builder_kiosksettings_changelist",
        ):
            self.assertContains(response, reverse(url_name))

    def test_platform_activity_feed_uses_existing_data(self):
        response = self.client.get("/admin/")
        self.assertContains(response, "Recent platform activity")
        self.assertContains(response, "New owner registered")
        self.assertContains(response, "Workspace created")
        self.assertContains(response, "Workspace staff account created")
        self.assertContains(response, "Email verified")

    def test_platform_security_status_renders_when_enabled(self):
        from accounts.testing import login_platform_admin_through_2fa

        client = Client()
        login_platform_admin_through_2fa(
            client,
            self.superuser.email,
            "secure-password",
        )
        response = client.get("/admin/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Platform security")
        self.assertContains(response, "TOTP: Enabled")
        self.assertContains(response, "Manage security")

    def test_grouped_navigation_is_present(self):
        response = self.client.get("/admin/")
        self.assertContains(response, "Customer Accounts")
        self.assertContains(response, "Workspaces")
        self.assertContains(response, "Operations")
        self.assertContains(response, "Kiosks")
        self.assertContains(response, "Security / System")

        request = RequestFactory().get("/admin/")
        request.user = self.superuser
        groups = build_nav_groups(admin.site.get_app_list(request), request_path="/admin/")
        labels = [group["label"] for group in groups]
        self.assertEqual(labels[0], "Dashboard")
        self.assertIn("Customer Accounts", labels)

        # Level-2 category landings must be reachable from sidebar headings.
        by_key = {group["key"]: group for group in groups}
        self.assertEqual(
            by_key["workspaces"]["url"],
            reverse("admin:app_list", kwargs={"app_label": "organizations"}),
        )
        self.assertEqual(
            by_key["operations"]["url"],
            reverse("admin:app_list", kwargs={"app_label": "members"}),
        )
        self.assertContains(response, 'class="cs-nav-category-link"')
        self.assertContains(
            response,
            reverse("admin:app_list", kwargs={"app_label": "organizations"}),
        )

    def test_model_changelist_still_works(self):
        response = self.client.get(reverse("admin:accounts_user_changelist"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "owner@example.com")

    def test_non_platform_user_cannot_access_admin(self):
        client = Client()
        client.force_login(self.owner)
        response = client.get("/admin/")
        self.assertIn(response.status_code, (302, 403))
        if response.status_code == 302:
            self.assertIn("/admin/login/", response.url)


class PlatformAdminCategoryLandingTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.superuser = User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="natsumi",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Morning class",
        )
        self.member = Member.objects.create(
            organization=self.organization,
            name="Alex",
        )
        force_platform_admin_login(self.client, self.superuser)

    def _assert_category_page(self, path, *, title, card_labels, changelist_names):
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "cs-category")
        self.assertContains(response, title)
        self.assertNotContains(response, 'class="addlink"')
        self.assertNotContains(response, 'class="changelink"')
        for label in card_labels:
            self.assertContains(response, label)
        for url_name in changelist_names:
            self.assertContains(response, reverse(url_name))
        return response

    def test_customer_accounts_category_page(self):
        response = self._assert_category_page(
            "/admin/accounts/",
            title="Customer Accounts administration",
            card_labels=["Users"],
            changelist_names=["admin:accounts_user_changelist"],
        )
        # superuser + owner (both counted; verified includes whoever is verified)
        self.assertContains(response, "2 total")
        self.assertContains(response, "Verified:")
        self.assertRegex(response.content.decode(), r"Verified:\s*[12]")

    def test_workspaces_category_page(self):
        response = self._assert_category_page(
            "/admin/organizations/",
            title="Workspaces administration",
            card_labels=["Organizations", "Workspace Staff Accounts", "Workspace Subscriptions"],
            changelist_names=[
                "admin:organizations_organization_changelist",
                "admin:organizations_workspacestaffaccount_changelist",
                "admin:billing_workspacesubscription_changelist",
            ],
        )
        self.assertContains(response, "1 total")

    def test_operations_category_page_from_members_and_groups(self):
        for path in ("/admin/members/", "/admin/groups/"):
            response = self._assert_category_page(
                path,
                title="Operations administration",
                card_labels=[
                    "Members",
                    "Groups",
                    "Group Memberships",
                    "Group Sections",
                    "Group-only Participants",
                ],
                changelist_names=[
                    "admin:members_member_changelist",
                    "admin:groups_group_changelist",
                    "admin:groups_groupmembership_changelist",
                    "admin:groups_groupsection_changelist",
                    "admin:groups_grouponlyparticipant_changelist",
                ],
            )
            self.assertContains(response, "Operations")

    def test_kiosks_category_page(self):
        self._assert_category_page(
            "/admin/kiosk_builder/",
            title="Kiosks administration",
            card_labels=["Kiosk Designs", "Kiosk Settings"],
            changelist_names=[
                "admin:kiosk_builder_kioskdesign_changelist",
                "admin:kiosk_builder_kiosksettings_changelist",
            ],
        )

    def test_security_category_page(self):
        self._assert_category_page(
            "/admin/auth/",
            title="Security / System administration",
            card_labels=["Advertising", "Permission Groups"],
            changelist_names=[
                "admin:core_platformadvertisingsettings_changelist",
                "admin:auth_group_changelist",
            ],
        )
        # Do not expose Permission model card unless configured in category.
        response = self.client.get("/admin/auth/")
        self.assertNotContains(response, ">Permissions</h2>")
        core_page = self.client.get("/admin/core/")
        self.assertEqual(core_page.status_code, 200)
        self.assertContains(core_page, "Advertising")

    def test_category_breadcrumb_from_changelist(self):
        response = self.client.get(reverse("admin:organizations_organization_changelist"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Workspaces")
        self.assertContains(response, reverse("admin:app_list", kwargs={"app_label": "organizations"}))

        groups = self.client.get(reverse("admin:groups_group_changelist"))
        self.assertEqual(groups.status_code, 200)
        self.assertContains(groups, "Operations")
        # Canonical Operations category URL
        self.assertContains(groups, reverse("admin:app_list", kwargs={"app_label": "members"}))

    def test_category_to_changelist_round_trip(self):
        workspaces = self.client.get("/admin/organizations/")
        self.assertEqual(workspaces.status_code, 200)
        org_list = reverse("admin:organizations_organization_changelist")
        self.assertContains(workspaces, org_list)

        changelist = self.client.get(org_list)
        self.assertEqual(changelist.status_code, 200)
        self.assertContains(changelist, "Workspaces")
        back = self.client.get("/admin/organizations/")
        self.assertContains(back, "Workspaces administration")

    def test_non_platform_user_cannot_access_category_pages(self):
        client = Client()
        client.force_login(self.owner)
        for path in (
            "/admin/accounts/",
            "/admin/organizations/",
            "/admin/members/",
            "/admin/groups/",
            "/admin/kiosk_builder/",
            "/admin/auth/",
        ):
            response = client.get(path)
            self.assertIn(response.status_code, (302, 403))
