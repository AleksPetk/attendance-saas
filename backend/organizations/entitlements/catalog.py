"""Canonical V1 plan catalog — Basic / Plus / Business.

Numeric limits and feature flags live only here. Do not duplicate in views.

Kiosk Card/Input templates are available on every plan and are not plan-gated.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

PLAN_BASIC = "basic"
PLAN_PLUS = "plus"
PLAN_BUSINESS = "business"

PLAN_KEYS = (PLAN_BASIC, PLAN_PLUS, PLAN_BUSINESS)

PLAN_DISPLAY_NAMES = {
    PLAN_BASIC: "Basic",
    PLAN_PLUS: "Plus",
    PLAN_BUSINESS: "Business",
}

# Feature entitlement keys
FEATURE_STRUCTURED_GROUPS = "structured_groups"
FEATURE_STAFF_MANAGEMENT = "staff_management"
FEATURE_REPORT_EXPORT_CSV = "report_export_csv"
FEATURE_REPORT_EXPORT_EXCEL = "report_export_excel"
FEATURE_REPORT_EXPORT_PDF = "report_export_pdf"
FEATURE_GROUP_FORWARD_EMAILS = "group_forward_emails"
FEATURE_STRUCTURED_SNAPSHOT_IMPORT = "structured_snapshot_import"
FEATURE_ADS_REQUIRED = "ads_required"

FEATURE_KEYS = (
    FEATURE_STRUCTURED_GROUPS,
    FEATURE_STAFF_MANAGEMENT,
    FEATURE_REPORT_EXPORT_CSV,
    FEATURE_REPORT_EXPORT_EXCEL,
    FEATURE_REPORT_EXPORT_PDF,
    FEATURE_GROUP_FORWARD_EMAILS,
    FEATURE_STRUCTURED_SNAPSHOT_IMPORT,
    FEATURE_ADS_REQUIRED,
)

# Limit keys
LIMIT_ACTIVE_STANDARD_GROUPS = "active_standard_groups"
LIMIT_ACTIVE_STRUCTURED_GROUPS = "active_structured_groups"
LIMIT_ARCHIVED_GROUPS = "archived_groups"
LIMIT_MEMBERS = "members"
LIMIT_PARTICIPANTS_PER_STANDARD_GROUP = "participants_per_standard_group"
LIMIT_CLASSES_PER_STRUCTURED_GROUP = "classes_per_structured_group"
LIMIT_PARTICIPANTS_PER_CLASS = "participants_per_class"
LIMIT_WORKSPACE_ADMINS = "workspace_admins"
LIMIT_WORKSPACE_STAFF = "workspace_staff"

LIMIT_KEYS = (
    LIMIT_ACTIVE_STANDARD_GROUPS,
    LIMIT_ACTIVE_STRUCTURED_GROUPS,
    LIMIT_ARCHIVED_GROUPS,
    LIMIT_MEMBERS,
    LIMIT_PARTICIPANTS_PER_STANDARD_GROUP,
    LIMIT_CLASSES_PER_STRUCTURED_GROUP,
    LIMIT_PARTICIPANTS_PER_CLASS,
    LIMIT_WORKSPACE_ADMINS,
    LIMIT_WORKSPACE_STAFF,
)

_PLAN_CATALOG: dict[str, dict[str, Any]] = {
    PLAN_BASIC: {
        "key": PLAN_BASIC,
        "display_name": PLAN_DISPLAY_NAMES[PLAN_BASIC],
        "features": {
            FEATURE_STRUCTURED_GROUPS: False,
            FEATURE_STAFF_MANAGEMENT: False,
            FEATURE_REPORT_EXPORT_CSV: False,
            FEATURE_REPORT_EXPORT_EXCEL: False,
            FEATURE_REPORT_EXPORT_PDF: False,
            FEATURE_GROUP_FORWARD_EMAILS: False,
            FEATURE_STRUCTURED_SNAPSHOT_IMPORT: False,
            FEATURE_ADS_REQUIRED: True,
        },
        "limits": {
            LIMIT_ACTIVE_STANDARD_GROUPS: 2,
            LIMIT_ACTIVE_STRUCTURED_GROUPS: 0,
            LIMIT_ARCHIVED_GROUPS: 2,
            LIMIT_MEMBERS: 10,
            LIMIT_PARTICIPANTS_PER_STANDARD_GROUP: 10,
            LIMIT_CLASSES_PER_STRUCTURED_GROUP: 0,
            LIMIT_PARTICIPANTS_PER_CLASS: 0,
            LIMIT_WORKSPACE_ADMINS: 0,
            LIMIT_WORKSPACE_STAFF: 0,
        },
    },
    PLAN_PLUS: {
        "key": PLAN_PLUS,
        "display_name": PLAN_DISPLAY_NAMES[PLAN_PLUS],
        "features": {
            FEATURE_STRUCTURED_GROUPS: False,
            FEATURE_STAFF_MANAGEMENT: True,
            FEATURE_REPORT_EXPORT_CSV: True,
            FEATURE_REPORT_EXPORT_EXCEL: True,
            FEATURE_REPORT_EXPORT_PDF: True,
            FEATURE_GROUP_FORWARD_EMAILS: True,
            FEATURE_STRUCTURED_SNAPSHOT_IMPORT: False,
            FEATURE_ADS_REQUIRED: False,
        },
        "limits": {
            LIMIT_ACTIVE_STANDARD_GROUPS: 10,
            LIMIT_ACTIVE_STRUCTURED_GROUPS: 0,
            LIMIT_ARCHIVED_GROUPS: 10,
            LIMIT_MEMBERS: 50,
            LIMIT_PARTICIPANTS_PER_STANDARD_GROUP: 50,
            LIMIT_CLASSES_PER_STRUCTURED_GROUP: 0,
            LIMIT_PARTICIPANTS_PER_CLASS: 0,
            LIMIT_WORKSPACE_ADMINS: 2,
            LIMIT_WORKSPACE_STAFF: 5,
        },
    },
    PLAN_BUSINESS: {
        "key": PLAN_BUSINESS,
        "display_name": PLAN_DISPLAY_NAMES[PLAN_BUSINESS],
        "features": {
            FEATURE_STRUCTURED_GROUPS: True,
            FEATURE_STAFF_MANAGEMENT: True,
            FEATURE_REPORT_EXPORT_CSV: True,
            FEATURE_REPORT_EXPORT_EXCEL: True,
            FEATURE_REPORT_EXPORT_PDF: True,
            FEATURE_GROUP_FORWARD_EMAILS: True,
            FEATURE_STRUCTURED_SNAPSHOT_IMPORT: True,
            FEATURE_ADS_REQUIRED: False,
        },
        "limits": {
            LIMIT_ACTIVE_STANDARD_GROUPS: 30,
            LIMIT_ACTIVE_STRUCTURED_GROUPS: 15,
            LIMIT_ARCHIVED_GROUPS: 50,
            LIMIT_MEMBERS: 300,
            LIMIT_PARTICIPANTS_PER_STANDARD_GROUP: 150,
            LIMIT_CLASSES_PER_STRUCTURED_GROUP: 30,
            LIMIT_PARTICIPANTS_PER_CLASS: 150,
            LIMIT_WORKSPACE_ADMINS: 5,
            LIMIT_WORKSPACE_STAFF: 25,
        },
    },
}


def normalize_plan_key(plan_key: str | None) -> str:
    key = (plan_key or PLAN_BASIC).strip().lower()
    if key not in _PLAN_CATALOG:
        return PLAN_BASIC
    return key


def get_plan_definition(plan_key: str | None) -> dict[str, Any]:
    return deepcopy(_PLAN_CATALOG[normalize_plan_key(plan_key)])


def plan_limit(plan_key: str | None, limit_key: str) -> int:
    plan = get_plan_definition(plan_key)
    return int(plan["limits"][limit_key])


def plan_has_feature(plan_key: str | None, feature_key: str) -> bool:
    plan = get_plan_definition(plan_key)
    return bool(plan["features"].get(feature_key, False))
