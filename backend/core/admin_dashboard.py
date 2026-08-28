"""Platform dashboard data and navigation for Check Station Django admin."""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.urls import NoReverseMatch, reverse
from django.utils import timezone

from core.admin_categories import CATEGORY_PRIMARY_APP, category_url_for_app_label
from groups.models import Group, GroupStatus
from members.models import Member, MemberStatus
from organizations.models import (
    Organization,
    OrganizationStatus,
    WorkspaceStaffAccount,
    WorkspaceStaffStatus,
)

User = get_user_model()

PLAN_TIERS = (
    {"key": "basic", "label": "Basic"},
    {"key": "plus", "label": "Plus"},
    {"key": "business", "label": "Business"},
)

# Human-facing sidebar groups. Models are matched against available_apps.
NAV_GROUPS = (
    {
        "key": "dashboard",
        "label": "Dashboard",
        "kind": "links",
        "links": (
            {"label": "Overview", "url_name": "admin:index"},
        ),
    },
    {
        "key": "customers",
        "label": "Customer Accounts",
        "kind": "models",
        "models": (
            {"app_label": "accounts", "object_name": "user", "label": "Users"},
        ),
    },
    {
        "key": "workspaces",
        "label": "Workspaces",
        "kind": "models",
        "models": (
            {
                "app_label": "organizations",
                "object_name": "organization",
                "label": "Organizations",
            },
            {
                "app_label": "organizations",
                "object_name": "workspacestaffaccount",
                "label": "Workspace Staff Accounts",
            },
            {
                "app_label": "billing",
                "object_name": "workspacesubscription",
                "label": "Workspace Subscriptions",
            },
        ),
    },
    {
        "key": "operations",
        "label": "Operations",
        "kind": "models",
        "models": (
            {"app_label": "members", "object_name": "member", "label": "Members"},
            {
                "app_label": "groups",
                "object_name": "group",
                "label": "Groups",
                "children": (
                    {
                        "app_label": "groups",
                        "object_name": "groupmembership",
                        "label": "Group Memberships",
                    },
                    {
                        "app_label": "groups",
                        "object_name": "groupsection",
                        "label": "Group Sections",
                    },
                    {
                        "app_label": "groups",
                        "object_name": "grouponlyparticipant",
                        "label": "Group-only Participants",
                    },
                ),
            },
        ),
    },
    {
        "key": "kiosks",
        "label": "Kiosks",
        "kind": "models",
        "models": (
            {
                "app_label": "kiosk_builder",
                "object_name": "kioskdesign",
                "label": "Kiosk Designs",
            },
            {
                "app_label": "kiosk_builder",
                "object_name": "kiosksettings",
                "label": "Kiosk Settings",
            },
        ),
    },
    {
        "key": "security",
        "label": "Security / System",
        "kind": "models",
        "models": (
            {
                "app_label": "core",
                "object_name": "platformpricingtemplatesettings",
                "label": "Price Templates",
            },
            {
                "app_label": "core",
                "object_name": "platformpromotionaltextsettings",
                "label": "Promotional Text",
            },
            {
                "app_label": "core",
                "object_name": "platformpromotionsettings",
                "label": "Promotions",
            },
            {
                "app_label": "core",
                "object_name": "platformadvertisingsettings",
                "label": "Advertising",
            },
            {
                "app_label": "core",
                "object_name": "platformadminaction",
                "label": "Platform admin actions",
            },
            {"app_label": "auth", "object_name": "group", "label": "Permission Groups"},
        ),
    },
)

def build_advertising_status():
    from django.urls import NoReverseMatch, reverse

    from core.models import PlatformAdvertisingSettings

    settings_obj = PlatformAdvertisingSettings.load()
    try:
        toggle_url = reverse("admin:core_platformadvertisingsettings_toggle")
        change_url = reverse(
            "admin:core_platformadvertisingsettings_change",
            args=[settings_obj.pk],
        )
    except NoReverseMatch:
        toggle_url = ""
        change_url = ""
    enabled = bool(settings_obj.ads_globally_enabled)
    return {
        "enabled": enabled,
        "label": "Enabled" if enabled else "Disabled",
        "action_label": (
            "Disable advertising" if enabled else "Enable advertising"
        ),
        "toggle_url": toggle_url,
        "change_url": change_url,
        "updated_at": settings_obj.updated_at,
    }


def build_promotion_status():
    from django.urls import NoReverseMatch, reverse

    from billing.promotion import admin_groups_snapshot
    from core.models import PlatformPromotionSettings

    settings_obj = PlatformPromotionSettings.load()
    try:
        change_url = reverse(
            "admin:core_platformpromotionsettings_change",
            args=[settings_obj.pk],
        )
    except NoReverseMatch:
        change_url = ""
    cards = admin_groups_snapshot(settings_obj=settings_obj)
    active_count = sum(1 for card in cards if card["value"] != "off")
    return {
        "mode": f"{active_count}/4 active",
        "label": f"{active_count} of 4 groups active",
        "summary": " · ".join(
            f"{card['label']}: {card['value'].upper()}" for card in cards
        ),
        "change_url": change_url,
        "updated_at": settings_obj.updated_at,
    }


def build_pricing_template_status():
    from django.urls import NoReverseMatch, reverse

    from core.models import PlatformPricingTemplateSettings, PricingCardTemplate
    from core.pricing_templates import pricing_template_payload

    settings_obj = PlatformPricingTemplateSettings.load()
    active = pricing_template_payload(settings_obj=settings_obj)
    try:
        change_url = reverse(
            "admin:core_platformpricingtemplatesettings_change",
            args=[settings_obj.pk],
        )
        set_url = reverse(
            "admin:core_platformpricingtemplatesettings_set_template"
        )
    except NoReverseMatch:
        change_url = ""
        set_url = ""

    return {
        "key": active["key"],
        "label": active["display_name"],
        "change_url": change_url,
        "set_url": set_url,
        "choices": [
            {
                "value": value,
                "label": label,
                "selected": value == active["key"],
            }
            for value, label in PricingCardTemplate.choices
        ],
        "updated_at": settings_obj.updated_at,
    }


def build_promotional_text_status():
    from django.urls import NoReverseMatch, reverse

    from core.models import PlatformPromotionalTextSettings
    from core.promotional_text import promotional_text_payload

    settings_obj = PlatformPromotionalTextSettings.load()
    payload = promotional_text_payload(settings_obj=settings_obj)
    try:
        change_url = reverse(
            "admin:core_platformpromotionaltextsettings_change",
            args=[settings_obj.pk],
        )
    except NoReverseMatch:
        change_url = ""

    return {
        **payload,
        "label": "Enabled" if payload["enabled"] else "Disabled",
        "change_url": change_url,
        "updated_at": settings_obj.updated_at,
    }


QUICK_LINKS = (
    {
        "key": "users",
        "label": "Users",
        "description": "Customer owners",
        "url_name": "admin:accounts_user_changelist",
    },
    {
        "key": "workspaces",
        "label": "Workspaces",
        "description": "Organizations",
        "url_name": "admin:organizations_organization_changelist",
    },
    {
        "key": "staff",
        "label": "Workspace Staff",
        "description": "Admin & staff logins",
        "url_name": "admin:organizations_workspacestaffaccount_changelist",
    },
    {
        "key": "groups",
        "label": "Groups",
        "description": "Check-in contexts",
        "url_name": "admin:groups_group_changelist",
    },
    {
        "key": "members",
        "label": "Members",
        "description": "Tracked people",
        "url_name": "admin:members_member_changelist",
    },
    {
        "key": "kiosks",
        "label": "Kiosks",
        "description": "Settings & designs",
        "url_name": "admin:kiosk_builder_kiosksettings_changelist",
    },
)

ACTIVITY_LIMIT = 10
REGISTRATION_LIMIT = 8


def customer_owners_queryset():
    """Paying customer Users (not platform operators)."""
    return User.objects.filter(is_staff=False, is_superuser=False)


def _safe_reverse(url_name, *args):
    try:
        return reverse(url_name, args=args)
    except NoReverseMatch:
        return ""


def _path_matches_admin_url(admin_url, path):
    if not admin_url:
        return False
    prefix = admin_url.rstrip("/")
    normalized = (path or "").rstrip("/")
    return normalized == prefix or normalized.startswith(prefix + "/")


def _nav_item_from_model(model_spec, model_index, path):
    model = model_index.get((model_spec["app_label"], model_spec["object_name"]))
    if model is None or not model.get("admin_url"):
        return None
    children = []
    for child_spec in model_spec.get("children") or ():
        child = _nav_item_from_model(child_spec, model_index, path)
        if child is not None:
            children.append(child)
    child_current = any(
        child["current"] or child.get("child_current") for child in children
    )
    return {
        "label": model_spec["label"],
        "url": model["admin_url"],
        "current": _path_matches_admin_url(model["admin_url"], path),
        "child_current": child_current,
        "open": child_current or _path_matches_admin_url(model["admin_url"], path),
        "children": children,
    }


def _model_index(available_apps):
    index = {}
    for app in available_apps or []:
        for model in app.get("models", []):
            key = (app["app_label"], model["object_name"].lower())
            index[key] = model
    return index


def build_nav_groups(available_apps, *, request_path=""):
    """Group Django admin models into a Check Station sidebar hierarchy."""
    model_index = _model_index(available_apps)
    path = (request_path or "").rstrip("/")
    groups = []
    for spec in NAV_GROUPS:
        items = []
        if spec["kind"] == "links":
            for link in spec["links"]:
                url = _safe_reverse(link["url_name"])
                if not url:
                    continue
                items.append(
                    {
                        "label": link["label"],
                        "url": url,
                        "current": path == url.rstrip("/")
                        or (
                            link["url_name"] == "admin:index"
                            and path in ("", "/admin")
                        ),
                    }
                )
            category_url = _safe_reverse("admin:index")
        else:
            for model_spec in spec["models"]:
                item = _nav_item_from_model(model_spec, model_index, path)
                if item is not None:
                    items.append(item)
            primary_app = CATEGORY_PRIMARY_APP.get(spec["key"])
            category_url = (
                category_url_for_app_label(primary_app) if primary_app else ""
            )

        if not items:
            continue

        category_current = bool(
            category_url and path == category_url.rstrip("/")
        )
        item_current = any(
            item["current"] or item.get("child_current") for item in items
        )
        groups.append(
            {
                "key": spec["key"],
                "label": spec["label"],
                "url": category_url,
                "current": category_current or item_current,
                "open": category_current or item_current,
                "items": items,
            }
        )
    return groups


def build_summary_metrics():
    now = timezone.now()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)
    owners = customer_owners_queryset()

    return {
        "customer_owners": owners.count(),
        "active_workspaces": Organization.objects.filter(
            status=OrganizationStatus.ACTIVE
        ).count(),
        "workspace_staff": WorkspaceStaffAccount.objects.filter(
            status=WorkspaceStaffStatus.ACTIVE
        ).count(),
        "groups": Group.objects.filter(status=GroupStatus.ACTIVE).count(),
        "members": Member.objects.filter(status=MemberStatus.ACTIVE).count(),
        "registrations_today": owners.filter(date_joined__gte=start_of_day).count(),
        "registrations_week": owners.filter(date_joined__gte=week_ago).count(),
    }


def build_plan_metrics():
    """Count active workspaces by current Organization.plan entitlement."""
    counts = {
        row["plan"]: row["total"]
        for row in (
            Organization.objects.filter(status=OrganizationStatus.ACTIVE)
            .values("plan")
            .annotate(total=Count("id"))
        )
    }
    return {
        "available": True,
        "tiers": [
            {**tier, "count": counts.get(tier["key"], 0)} for tier in PLAN_TIERS
        ],
        "note": "Active workspaces by current entitlement plan.",
    }


def build_quick_links():
    links = []
    for item in QUICK_LINKS:
        url = _safe_reverse(item["url_name"])
        if not url:
            continue
        links.append(
            {
                "key": item["key"],
                "label": item["label"],
                "description": item["description"],
                "url": url,
            }
        )
    return links


def build_recent_registrations(limit=REGISTRATION_LIMIT):
    owners = (
        customer_owners_queryset()
        .select_related("owned_organization")
        .order_by("-date_joined")[:limit]
    )
    rows = []
    for user in owners:
        try:
            workspace = user.owned_organization
        except Organization.DoesNotExist:
            workspace = None
        rows.append(
            {
                "email": user.email,
                "date_joined": user.date_joined,
                "email_verified": bool(user.email_verified),
                "workspace_id": workspace.workspace_id if workspace else "",
                "url": _safe_reverse("admin:accounts_user_change", user.pk),
            }
        )
    return rows


def _activity_event(*, when, kind, title, detail="", url=""):
    if when is None:
        return None
    return {
        "when": when,
        "kind": kind,
        "title": title,
        "detail": detail,
        "url": url,
    }


def build_recent_activity(limit=ACTIVITY_LIMIT):
    """Compose a compact feed from existing model timestamps (no audit subsystem)."""
    events = []

    for user in customer_owners_queryset().order_by("-date_joined")[:limit]:
        events.append(
            _activity_event(
                when=user.date_joined,
                kind="registration",
                title="New owner registered",
                detail=user.email,
                url=_safe_reverse("admin:accounts_user_change", user.pk),
            )
        )

    for user in (
        customer_owners_queryset()
        .exclude(email_verified_at=None)
        .order_by("-email_verified_at")[:limit]
    ):
        events.append(
            _activity_event(
                when=user.email_verified_at,
                kind="verification",
                title="Email verified",
                detail=user.email,
                url=_safe_reverse("admin:accounts_user_change", user.pk),
            )
        )

    for org in Organization.objects.select_related("owner").order_by("-created_at")[
        :limit
    ]:
        owner_email = org.owner.email if org.owner_id else ""
        events.append(
            _activity_event(
                when=org.created_at,
                kind="workspace",
                title="Workspace created",
                detail=f"{org.workspace_id}"
                + (f" · {owner_email}" if owner_email else ""),
                url=_safe_reverse(
                    "admin:organizations_organization_change", org.pk
                ),
            )
        )

    for org in (
        Organization.objects.filter(status=OrganizationStatus.ARCHIVED)
        .exclude(archived_at=None)
        .order_by("-archived_at")[:limit]
    ):
        events.append(
            _activity_event(
                when=org.archived_at,
                kind="archive",
                title="Workspace archived",
                detail=org.workspace_id,
                url=_safe_reverse(
                    "admin:organizations_organization_change", org.pk
                ),
            )
        )

    for staff in (
        WorkspaceStaffAccount.objects.select_related("organization")
        .order_by("-created_at")[:limit]
    ):
        events.append(
            _activity_event(
                when=staff.created_at,
                kind="staff",
                title="Workspace staff account created",
                detail=(
                    f"{staff.username} ({staff.role}) · "
                    f"{staff.organization.workspace_id}"
                ),
                url=_safe_reverse(
                    "admin:organizations_workspacestaffaccount_change",
                    staff.pk,
                ),
            )
        )

    events = [event for event in events if event is not None]
    events.sort(key=lambda item: item["when"], reverse=True)

    # De-duplicate near-identical registration + workspace creation noise by
    # keeping chronological uniqueness on (kind, detail, when minute).
    seen = set()
    unique = []
    for event in events:
        stamp = event["when"].replace(second=0, microsecond=0)
        key = (event["kind"], event["detail"], stamp)
        if key in seen:
            continue
        seen.add(key)
        unique.append(event)
        if len(unique) >= limit:
            break
    return unique


def build_dashboard_context(request):
    return {
        "dashboard_metrics": build_summary_metrics(),
        "dashboard_plans": build_plan_metrics(),
        "dashboard_advertising": build_advertising_status(),
        "dashboard_promotion": build_promotion_status(),
        "dashboard_pricing_template": build_pricing_template_status(),
        "dashboard_promotional_text": build_promotional_text_status(),
        "dashboard_activity": build_recent_activity(),
        "dashboard_registrations": build_recent_registrations(),
        "dashboard_quick_links": build_quick_links(),
        "title": "Platform dashboard",
    }
