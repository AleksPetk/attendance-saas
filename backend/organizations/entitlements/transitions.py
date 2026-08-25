"""Canonical effective plan transitions.

Organization.plan is the entitlement plan. Billing and platform admin must
change it through apply_effective_plan() so plan-lock sync cannot be skipped.

Organization.save() still runs sync_plan_locks_after_plan_change() as a
safety net for existing tests and accidental instance saves.
"""

from __future__ import annotations

from django.db import transaction

from organizations.entitlements.catalog import PLAN_KEYS


class InvalidPlanError(ValueError):
    """Raised when a plan key is not a V1 catalog plan."""


def normalize_required_plan_key(plan_key) -> str:
    key = str(plan_key or "").strip().lower()
    if key not in PLAN_KEYS:
        raise InvalidPlanError(f"Invalid plan {plan_key!r}.")
    return key


@transaction.atomic
def apply_effective_plan(organization, plan, *, source=""):
    """Set the workspace entitlement plan and sync plan locks.

    Idempotent: if the organization is already on ``plan``, return it
    unchanged (lock state is left to the existing entitlement layer).
    ``source`` is a caller label for future auditing (not persisted here).
    """
    from organizations.models import Organization

    target = normalize_required_plan_key(plan)
    locked = Organization.objects.select_for_update().get(pk=organization.pk)
    if locked.plan == target:
        return locked

    # source is reserved for later audit/logging of who changed entitlement.
    _ = source
    locked.plan = target
    locked.save(update_fields=["plan", "updated_at"])
    locked.refresh_from_db()
    return locked
