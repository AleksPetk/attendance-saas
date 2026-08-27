"""Central plan entitlement helpers."""

from __future__ import annotations

from organizations.entitlements.catalog import (
    FEATURE_KEYS,
    LIMIT_ACTIVE_STANDARD_GROUPS,
    LIMIT_ACTIVE_STRUCTURED_GROUPS,
    LIMIT_ARCHIVED_GROUPS,
    LIMIT_KEYS,
    LIMIT_MEMBERS,
    LIMIT_WORKSPACE_ADMINS,
    LIMIT_WORKSPACE_STAFF,
    PLAN_BASIC,
    PLAN_DISPLAY_NAMES,
    get_plan_definition,
    normalize_plan_key,
    plan_has_feature,
    plan_limit,
)
from organizations.entitlements.exceptions import PlanEntitlementDenied
from organizations.entitlements.usage import (
    get_usage_for_limit,
    get_workspace_record_totals,
    get_workspace_usage,
)

WORKSPACE_OVERVIEW_LIMIT_KEYS = (
    LIMIT_ACTIVE_STANDARD_GROUPS,
    LIMIT_ACTIVE_STRUCTURED_GROUPS,
    LIMIT_ARCHIVED_GROUPS,
    LIMIT_MEMBERS,
    LIMIT_WORKSPACE_ADMINS,
    LIMIT_WORKSPACE_STAFF,
)


def get_organization_plan_key(organization) -> str:
    if organization is None:
        return PLAN_BASIC
    return normalize_plan_key(getattr(organization, "plan", None))


def get_workspace_plan(organization) -> dict:
    return get_plan_definition(get_organization_plan_key(organization))


def get_plan_limit(organization, limit_key: str) -> int:
    return plan_limit(get_organization_plan_key(organization), limit_key)


def has_feature(organization, feature_key: str) -> bool:
    return plan_has_feature(get_organization_plan_key(organization), feature_key)


def get_usage(organization, resource_key: str, *, group=None, section=None) -> int:
    return get_usage_for_limit(
        organization,
        resource_key,
        group=group,
        section=section,
    )


def require_feature(organization, feature_key: str, *, message: str | None = None):
    if has_feature(organization, feature_key):
        return
    plan_key = get_organization_plan_key(organization)
    display = PLAN_DISPLAY_NAMES.get(plan_key, plan_key)
    raise PlanEntitlementDenied(
        code="plan_feature_locked",
        message=message
        or f"Your {display} plan does not include this feature.",
        feature=feature_key,
        plan_key=plan_key,
    )


def can_create_resource(
    organization,
    limit_key: str,
    *,
    delta: int = 1,
    group=None,
    section=None,
) -> bool:
    limit = get_plan_limit(organization, limit_key)
    if limit <= 0 and delta > 0:
        return False
    usage = get_usage(organization, limit_key, group=group, section=section)
    return usage + delta <= limit


def require_capacity(
    organization,
    limit_key: str,
    *,
    delta: int = 1,
    group=None,
    section=None,
    message: str | None = None,
):
    limit = get_plan_limit(organization, limit_key)
    usage = get_usage(organization, limit_key, group=group, section=section)
    plan_key = get_organization_plan_key(organization)
    display = PLAN_DISPLAY_NAMES.get(plan_key, plan_key)
    if usage + delta <= limit:
        return
    raise PlanEntitlementDenied(
        code="plan_limit_exceeded",
        message=message
        or f"Your {display} plan limit for this resource has been reached.",
        limit_key=limit_key,
        usage=usage,
        limit=limit,
        plan_key=plan_key,
    )


def get_over_limit_state(organization) -> list[dict]:
    plan_key = get_organization_plan_key(organization)
    usage_map = get_workspace_record_totals(organization)
    over = []
    for limit_key in WORKSPACE_OVERVIEW_LIMIT_KEYS:
        limit = plan_limit(plan_key, limit_key)
        usage = int(usage_map.get(limit_key, 0))
        if usage > limit:
            over.append(
                {
                    "resource": limit_key,
                    "usage": usage,
                    "limit": limit,
                    "over_by": usage - limit,
                }
            )
    return over


def build_entitlement_payload(organization) -> dict:
    from organizations.entitlements.plan_locks import (
        ensure_plan_locks_consistent,
        get_plan_lock_state,
        plan_locks_are_inconsistent,
    )

    # Self-heal workspaces that are over capacity but still fully unlocked
    # (e.g. plan was Basic before lock-sync shipped, or plan changed outside save()).
    if plan_locks_are_inconsistent(organization):
        organization = ensure_plan_locks_consistent(organization)

    from billing.builtin_trial import expire_due_builtin_trial

    expire_due_builtin_trial(organization)
    organization.refresh_from_db()
    plan = get_workspace_plan(organization)
    plan_key = plan["key"]
    usage_map = get_workspace_usage(organization)
    limits = {key: plan_limit(plan_key, key) for key in LIMIT_KEYS}
    usage = {key: int(usage_map.get(key, 0)) for key in WORKSPACE_OVERVIEW_LIMIT_KEYS}
    total_map = get_workspace_record_totals(organization)
    usage_totals = {
        key: int(total_map.get(key, 0)) for key in WORKSPACE_OVERVIEW_LIMIT_KEYS
    }
    features = {key: bool(plan["features"][key]) for key in FEATURE_KEYS}
    over_limit = get_over_limit_state(organization)
    plan_locks = get_plan_lock_state(organization)
    selection_required = {
        LIMIT_ACTIVE_STANDARD_GROUPS: plan_locks["groups_selection_required"],
        LIMIT_ARCHIVED_GROUPS: plan_locks[
            "archived_groups_selection_required"
        ],
        LIMIT_MEMBERS: plan_locks["members_selection_required"],
        LIMIT_WORKSPACE_ADMINS: plan_locks["admins_selection_required"],
        LIMIT_WORKSPACE_STAFF: plan_locks["staff_selection_required"],
    }
    return {
        "plan": {
            "key": plan_key,
            "display_name": plan["display_name"],
        },
        "features": features,
        "limits": limits,
        "usage": usage,
        "usage_totals": usage_totals,
        "plan_locks": plan_locks,
        "selection_required": selection_required,
        "over_limit": over_limit,
        "is_over_limit": bool(over_limit),
    }
