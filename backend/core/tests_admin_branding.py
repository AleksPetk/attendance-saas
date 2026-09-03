from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client, RequestFactory, TestCase
from django.urls import reverse
from unittest.mock import patch

from accounts.testing import force_platform_admin_login
from core.admin_branding import INDEX_TITLE, SITE_HEADER, SITE_TITLE
from core.admin_dashboard import (
    build_nav_groups,
    build_plan_metrics,
    build_summary_metrics,
)
from groups.models import Group
from members.models import Member
from billing.models import BillingStatus, WorkspaceSubscription
from organizations.models import (
    Organization,
    OrganizationPlan,
    OrganizationStatus,
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
        self.assertContains(response, "Platform admin sign in")
        self.assertContains(response, "admin/img/logo.png")
        self.assertContains(response, "admin/img/logo-text.png")
        self.assertContains(response, "admin/img/favicon.ico")
        self.assertContains(response, "admin/img/favicon-32.png")
        self.assertContains(response, "cs-admin-login-panel")
        self.assertContains(response, "checkstation_admin.css")
        self.assertNotContains(response, "theme-toggle")
        self.assertNotContains(response, "admin/js/theme.js")
        self.assertNotContains(response, "admin/css/dark_mode.css")

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

    def test_admin_header_uses_logo_images(self):
        User.objects.create_superuser(
            email="platform-admin@example.com",
            password="secure-password",
        )
        force_platform_admin_login(
            self.client,
            User.objects.get(email="platform-admin@example.com"),
        )
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "admin/img/logo.png")
        self.assertContains(response, "admin/img/logo-text.png")
        self.assertContains(response, "admin/img/favicon.ico")
        self.assertContains(response, "admin/img/favicon-32.png")
        self.assertContains(response, "Platform admin")
        self.assertContains(response, "cs-admin-logo-text")
        self.assertNotContains(response, "theme-toggle")
        self.assertNotContains(response, "admin/js/theme.js")
        self.assertNotContains(response, "admin/css/dark_mode.css")
        self.assertNotContains(response, "Toggle theme")


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
        self.assertContains(response, "Ads Switcher")
        self.assertContains(response, "Promotions")
        self.assertContains(response, "Disable advertising")
        self.assertContains(response, "Manage promotions")
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

    def test_operational_metric_failure_does_not_break_dashboard(self):
        cache.clear()
        self.addCleanup(cache.clear)
        with (
            patch(
                "core.operational_metrics.application_size_bytes",
                side_effect=OSError("sensitive path detail"),
            ),
            self.assertLogs("core.operational_metrics", level="WARNING"),
        ):
            response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Application size")
        self.assertContains(response, "Media storage")
        self.assertContains(response, "Database size")
        self.assertContains(response, "Memory usage")
        self.assertContains(response, '<p class="cs-metric-value">—</p>', html=True)

    def test_plan_metrics_count_active_workspace_entitlements(self):
        self.organization.plan = OrganizationPlan.BASIC
        self.organization.save(update_fields=["plan", "updated_at"])

        plus_owner = User.objects.create_user(
            email="plus-owner@example.com",
            password="secure-password",
        )
        plus_org = Organization.objects.create_with_owner(owner=plus_owner)
        plus_org.plan = OrganizationPlan.PLUS
        plus_org.save(update_fields=["plan", "updated_at"])

        business_owner = User.objects.create_user(
            email="business-owner@example.com",
            password="secure-password",
        )
        business_org = Organization.objects.create_with_owner(
            owner=business_owner,
            internal_label="Plan sandbox",
        )
        business_org.plan = OrganizationPlan.BUSINESS
        business_org.is_checkstation_account = True
        business_org.save(
            update_fields=["plan", "is_checkstation_account", "updated_at"]
        )

        archived_owner = User.objects.create_user(
            email="archived-owner@example.com",
            password="secure-password",
        )
        archived_org = Organization.objects.create_with_owner(owner=archived_owner)
        archived_org.plan = OrganizationPlan.PLUS
        archived_org.status = OrganizationStatus.ARCHIVED
        archived_org.save(update_fields=["plan", "status", "updated_at"])

        blocked_owner = User.objects.create_user(
            email="blocked-owner@example.com",
            password="secure-password",
        )
        blocked_org = Organization.objects.create_with_owner(owner=blocked_owner)
        blocked_org.plan = OrganizationPlan.BUSINESS
        blocked_org.status = OrganizationStatus.BLOCKED
        blocked_org.save(update_fields=["plan", "status", "updated_at"])

        WorkspaceSubscription.objects.create(
            organization=self.organization,
            status=BillingStatus.ACTIVE,
            subscribed_plan=OrganizationPlan.PLUS,
        )

        plans = build_plan_metrics()
        self.assertTrue(plans["available"])
        self.assertEqual(
            [tier["label"] for tier in plans["tiers"]],
            ["Basic", "Plus", "Business"],
        )
        self.assertEqual(
            {tier["key"]: tier["count"] for tier in plans["tiers"]},
            {
                "basic": 1,
                "plus": 1,
                "business": 1,
            },
        )

        response = self.client.get("/admin/")
        self.assertContains(response, "Active workspaces by current entitlement plan.")
        self.assertContains(response, "Basic")
        self.assertContains(response, "Plus")
        self.assertContains(response, "Business")
        self.assertContains(
            response,
            '<span class="cs-plan-count">1</span>',
            html=True,
            count=3,
        )
        self.assertNotContains(response, '<span class="cs-plan-count">—</span>')

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

        # Level-2 category landings remain available at the same URLs.
        by_key = {group["key"]: group for group in groups}
        self.assertEqual(
            by_key["workspaces"]["url"],
            reverse("admin:app_list", kwargs={"app_label": "organizations"}),
        )
        self.assertEqual(
            by_key["operations"]["url"],
            reverse("admin:app_list", kwargs={"app_label": "members"}),
        )
        self.assertTrue(by_key["dashboard"]["open"])
        self.assertFalse(by_key["workspaces"]["open"])
        self.assertContains(response, 'class="cs-nav-group-toggle"')
        self.assertContains(response, 'data-cs-nav-group="workspaces"')
        self.assertContains(
            response,
            reverse("admin:organizations_organization_changelist"),
        )

        workspaces_page = self.client.get(
            reverse("admin:organizations_organization_changelist")
        )
        self.assertContains(workspaces_page, 'data-cs-nav-group="workspaces"')
        self.assertContains(workspaces_page, 'data-cs-default-open="true"')
        self.assertContains(workspaces_page, 'aria-current="page"')

    def test_operations_groups_submenu_highlights_only_current_page(self):
        request = RequestFactory().get("/admin/")
        request.user = self.superuser
        app_list = admin.site.get_app_list(request)
        groups_url = reverse("admin:groups_group_changelist")
        sections_url = reverse("admin:groups_groupsection_changelist")

        operations = next(
            group
            for group in build_nav_groups(app_list, request_path=sections_url)
            if group["key"] == "operations"
        )
        groups_item = next(
            item for item in operations["items"] if item["label"] == "Groups"
        )
        self.assertTrue(operations["open"])
        self.assertFalse(groups_item["current"])
        self.assertTrue(groups_item["child_current"])
        self.assertTrue(groups_item["open"])
        self.assertEqual(
            [child["label"] for child in groups_item["children"]],
            [
                "Group Memberships",
                "Group Sections",
                "Group-only Participants",
            ],
        )
        current_children = [
            child["label"] for child in groups_item["children"] if child["current"]
        ]
        self.assertEqual(current_children, ["Group Sections"])

        response = self.client.get(sections_url)
        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        self.assertEqual(html.count('aria-current="page"'), 1)
        self.assertIn('is-ancestor', html)
        self.assertIn('cs-nav-submodule', html)
        self.assertContains(response, groups_url)
        self.assertContains(response, sections_url)

        groups_page = self.client.get(groups_url)
        groups_html = groups_page.content.decode()
        self.assertEqual(groups_html.count('aria-current="page"'), 1)
        self.assertContains(groups_page, 'class="cs-nav-parent-link is-current"')

    def test_model_changelist_still_works(self):
        response = self.client.get(reverse("admin:accounts_user_changelist"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "owner@example.com")

    def test_listed_changelists_use_collapsible_filters(self):
        other_owner = User.objects.create_user(
            email="second-owner@example.com",
            password="secure-password",
        )
        Organization.objects.create_with_owner(owner=other_owner)
        for url_name in (
            "admin:accounts_user_changelist",
            "admin:organizations_workspacestaffaccount_changelist",
            "admin:billing_workspacesubscription_changelist",
            "admin:members_member_changelist",
            "admin:groups_group_changelist",
            "admin:groups_groupmembership_changelist",
            "admin:groups_groupsection_changelist",
            "admin:groups_grouponlyparticipant_changelist",
            "admin:kiosk_builder_kioskdesign_changelist",
            "admin:kiosk_builder_kiosksettings_changelist",
            "admin:core_platformadminaction_changelist",
        ):
            with self.subTest(url_name=url_name):
                response = self.client.get(reverse(url_name))
                html = response.content.decode()
                self.assertEqual(response.status_code, 200, url_name)
                self.assertEqual(html.count('id="changelist-filter"'), 1, url_name)
                self.assertIn("Show filters", html)
                self.assertIn("Hide filters", html)
                self.assertIn('class="cs-changelist-filter-disclosure"', html)
                self.assertNotIn('cs-changelist-filter-disclosure" open', html)
                self.assertLess(
                    html.find("cs-changelist-filter-disclosure"),
                    html.find('id="changelist-filter"'),
                )
                form_pos = html.find('id="changelist-form"')
                results_pos = html.find('id="result_list"')
                filter_pos = html.find('id="changelist-filter"')
                if results_pos != -1:
                    self.assertLess(filter_pos, results_pos, url_name)
                else:
                    self.assertLess(filter_pos, form_pos, url_name)

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
