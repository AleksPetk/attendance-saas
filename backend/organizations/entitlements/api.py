"""DRF helpers for plan entitlement denials."""

from rest_framework.exceptions import PermissionDenied

from organizations.entitlements.exceptions import PlanEntitlementDenied


def raise_plan_denied(exc: PlanEntitlementDenied):
    raise PermissionDenied(detail=exc.as_api_detail()) from exc


def deny_plan_feature(organization, feature_key, *, message=None):
    from organizations.entitlements.service import require_feature

    try:
        require_feature(organization, feature_key, message=message)
    except PlanEntitlementDenied as exc:
        raise_plan_denied(exc)


def deny_plan_capacity(
    organization,
    limit_key,
    *,
    delta=1,
    group=None,
    section=None,
    message=None,
):
    from organizations.entitlements.service import require_capacity

    try:
        require_capacity(
            organization,
            limit_key,
            delta=delta,
            group=group,
            section=section,
            message=message,
        )
    except PlanEntitlementDenied as exc:
        raise_plan_denied(exc)
