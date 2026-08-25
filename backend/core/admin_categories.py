"""Check Station Platform Admin level-2 category landing pages."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group as AuthGroup
from django.urls import NoReverseMatch, reverse

from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupSection,
)
from members.models import Member
from organizations.models import Organization, WorkspaceStaffAccount
from billing.models import WorkspaceSubscription

User = get_user_model()

# Map Django admin app_label → platform category key.
APP_LABEL_TO_CATEGORY = {
    "accounts": "customers",
    "organizations": "workspaces",
    "members": "operations",
    "groups": "operations",
    "kiosk_builder": "kiosks",
    "billing": "workspaces",
    "core": "security",
    "auth": "security",
}

# Canonical app_label used for category breadcrumb /app_list/ URLs.
CATEGORY_PRIMARY_APP = {
    "customers": "accounts",
    "workspaces": "organizations",
    "operations": "members",
    "kiosks": "kiosk_builder",
    "security": "auth",
}

CATEGORY_DEFINITIONS = (
    {
        "key": "customers",
        "label": "Customer Accounts",
        "title": "Customer Accounts administration",
        "description": (
            "Paying customer owner accounts for Check Station workspaces."
        ),
        "models": (
            {
                "app_label": "accounts",
                "object_name": "user",
                "label": "Users",
                "description": "Customer owners and platform User accounts.",
                "prefer_add": False,
                "count": lambda: User.objects.count(),
                "stats": lambda: [
                    {
                        "label": "Verified",
                        "value": User.objects.filter(email_verified=True).count(),
                    }
                ],
            },
        ),
    },
    {
        "key": "workspaces",
        "label": "Workspaces",
        "title": "Workspaces administration",
        "description": (
            "Customer workspaces and the admin/staff logins scoped to them."
        ),
        "models": (
            {
                "app_label": "organizations",
                "object_name": "organization",
                "label": "Organizations",
                "description": "Customer workspaces (tenant boundary).",
                "prefer_add": False,
                "count": lambda: Organization.objects.count(),
                "stats": lambda: [],
            },
            {
                "app_label": "organizations",
                "object_name": "workspacestaffaccount",
                "label": "Workspace Staff Accounts",
                "description": "Workspace admins and staff logins.",
                "prefer_add": False,
                "count": lambda: WorkspaceStaffAccount.objects.count(),
                "stats": lambda: [],
            },
            {
                "app_label": "billing",
                "object_name": "workspacesubscription",
                "label": "Workspace Subscriptions",
                "description": "Commercial billing state for a workspace.",
                "prefer_add": False,
                "count": lambda: WorkspaceSubscription.objects.count(),
                "stats": lambda: [],
            },
        ),
    },
    {
        "key": "operations",
        "label": "Operations",
        "title": "Operations administration",
        "description": (
            "Members, Groups, and participation records used for check-in."
        ),
        "models": (
            {
                "app_label": "members",
                "object_name": "member",
                "label": "Members",
                "description": "Tracked people inside customer workspaces.",
                "prefer_add": False,
                "count": lambda: Member.objects.count(),
                "stats": lambda: [],
            },
            {
                "app_label": "groups",
                "object_name": "group",
                "label": "Groups",
                "description": "Reusable check-in / participation contexts.",
                "prefer_add": False,
                "count": lambda: Group.objects.count(),
                "stats": lambda: [],
            },
            {
                "app_label": "groups",
                "object_name": "groupmembership",
                "label": "Group Memberships",
                "description": "Member participation in a Group.",
                "prefer_add": False,
                "count": lambda: GroupMembership.objects.count(),
                "stats": lambda: [],
            },
            {
                "app_label": "groups",
                "object_name": "groupsection",
                "label": "Group Sections",
                "description": "Classes / sections inside structured Groups.",
                "prefer_add": False,
                "count": lambda: GroupSection.objects.count(),
                "stats": lambda: [],
            },
            {
                "app_label": "groups",
                "object_name": "grouponlyparticipant",
                "label": "Group-only Participants",
                "description": "Participants that exist only inside a Group.",
                "prefer_add": False,
                "count": lambda: GroupOnlyParticipant.objects.count(),
                "stats": lambda: [],
            },
        ),
    },
    {
        "key": "kiosks",
        "label": "Kiosks",
        "title": "Kiosks administration",
        "description": "Kiosk design and runtime settings for Groups.",
        "models": (
            {
                "app_label": "kiosk_builder",
                "object_name": "kioskdesign",
                "label": "Kiosk Designs",
                "description": "Visual kiosk layouts and media.",
                "prefer_add": False,
                "count": lambda: _safe_model_count("kiosk_builder", "KioskDesign"),
                "stats": lambda: [],
            },
            {
                "app_label": "kiosk_builder",
                "object_name": "kiosksettings",
                "label": "Kiosk Settings",
                "description": "Kiosk mode and operational settings.",
                "prefer_add": False,
                "count": lambda: _safe_model_count("kiosk_builder", "KioskSettings"),
                "stats": lambda: [],
            },
        ),
    },
    {
        "key": "security",
        "label": "Security / System",
        "title": "Security / System administration",
        "description": "Platform permission groups used by Django admin.",
        "models": (
            {
                "app_label": "core",
                "object_name": "platformadvertisingsettings",
                "label": "Advertising",
                "description": "Global advertising kill switch for all workspaces.",
                "prefer_add": False,
                "count": lambda: 1,
                "stats": lambda: _advertising_stats(),
            },
            {
                "app_label": "auth",
                "object_name": "group",
                "label": "Permission Groups",
                "description": "Django auth groups for platform operators.",
                "prefer_add": True,
                "count": lambda: AuthGroup.objects.count(),
                "stats": lambda: [],
            },
        ),
    },
)


def _advertising_stats():
    from core.models import PlatformAdvertisingSettings

    enabled = PlatformAdvertisingSettings.load().ads_globally_enabled
    return [
        {
            "label": "Status",
            "value": "Enabled" if enabled else "Disabled",
        }
    ]


def _safe_model_count(app_label, model_name):
    from django.apps import apps

    model = apps.get_model(app_label, model_name)
    return model.objects.count()


def _safe_reverse(url_name, *args, **kwargs):
    try:
        return reverse(url_name, args=args, kwargs=kwargs)
    except NoReverseMatch:
        return ""


def category_key_for_app_label(app_label):
    return APP_LABEL_TO_CATEGORY.get(app_label)


def get_category_definition(category_key):
    for category in CATEGORY_DEFINITIONS:
        if category["key"] == category_key:
            return category
    return None


def category_url_for_app_label(app_label):
    category_key = category_key_for_app_label(app_label)
    if not category_key:
        return _safe_reverse("admin:app_list", app_label=app_label)
    primary = CATEGORY_PRIMARY_APP.get(category_key, app_label)
    return _safe_reverse("admin:app_list", app_label=primary)


def category_label_for_app_label(app_label):
    category_key = category_key_for_app_label(app_label)
    definition = get_category_definition(category_key) if category_key else None
    if definition:
        return definition["label"]
    return app_label


def _model_index(available_apps):
    index = {}
    for app in available_apps or []:
        for model in app.get("models", []):
            key = (app["app_label"], model["object_name"].lower())
            index[key] = model
    return index


def build_category_page(category_key, available_apps):
    """Build template context for one platform category landing page."""
    definition = get_category_definition(category_key)
    if definition is None:
        return None

    model_index = _model_index(available_apps)
    cards = []
    for model_spec in definition["models"]:
        model = model_index.get(
            (model_spec["app_label"], model_spec["object_name"])
        )
        if model is None or not model.get("admin_url"):
            continue

        stats = []
        try:
            stats = list(model_spec.get("stats", lambda: [])())
        except Exception:
            stats = []

        try:
            count = model_spec["count"]()
        except Exception:
            count = None

        show_add = bool(
            model_spec.get("prefer_add") and model.get("add_url")
        )
        cards.append(
            {
                "label": model_spec["label"],
                "description": model_spec["description"],
                "count": count,
                "stats": stats,
                "open_url": model["admin_url"],
                "add_url": model.get("add_url") if show_add else "",
            }
        )

    if not cards:
        return None

    primary_app = CATEGORY_PRIMARY_APP[category_key]
    return {
        "category_key": category_key,
        "category_label": definition["label"],
        "category_title": definition["title"],
        "category_description": definition["description"],
        "category_cards": cards,
        "category_primary_app": primary_app,
        "title": definition["title"],
    }


def build_category_page_for_app(app_label, available_apps):
    category_key = category_key_for_app_label(app_label)
    if not category_key:
        return None
    return build_category_page(category_key, available_apps)


def install_category_verbose_names():
    """Align Django app verbose names with platform category labels."""
    from django.apps import apps

    mapping = {
        "accounts": "Customer Accounts",
        "organizations": "Workspaces",
        "members": "Operations",
        "groups": "Operations",
        "kiosk_builder": "Kiosks",
        "billing": "Workspaces",
        "core": "Security / System",
        "auth": "Security / System",
    }
    for app_label, verbose_name in mapping.items():
        try:
            apps.get_app_config(app_label).verbose_name = verbose_name
        except LookupError:
            continue
