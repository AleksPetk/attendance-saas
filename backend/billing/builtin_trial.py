"""Built-in one-time 7-day Business trial.

Provider-neutral. Does not use Stripe/Apple trial states, promotions, or cards.
Entitlement changes go only through apply_effective_plan().
"""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from billing.catalog import PAID_PLAN_KEYS, PLAN_BUSINESS
from billing.models import BillingStatus, WorkspaceBuiltinTrial, WorkspaceSubscription
from organizations.entitlements.catalog import PLAN_BASIC
from organizations.entitlements.transitions import apply_effective_plan
from organizations.models import Organization, OrganizationPlan

BUILTIN_TRIAL_DAYS = 7

_LIVE_COMMERCIAL = frozenset(
    {BillingStatus.TRIALING, BillingStatus.ACTIVE, BillingStatus.PAST_DUE}
)


def _now(now):
    return now if now is not None else timezone.now()


def get_builtin_trial(organization) -> WorkspaceBuiltinTrial | None:
    if organization is None or not organization.pk:
        return None
    try:
        return organization.builtin_trial
    except WorkspaceBuiltinTrial.DoesNotExist:
        return WorkspaceBuiltinTrial.objects.filter(
            organization_id=organization.pk
        ).first()


def builtin_trial_was_granted(trial: WorkspaceBuiltinTrial | None) -> bool:
    return bool(trial is not None and trial.started_at is not None and trial.ends_at)


def builtin_trial_is_active(organization, *, now=None) -> bool:
    trial = get_builtin_trial(organization)
    if not builtin_trial_was_granted(trial):
        return False
    if trial.expired_at is not None:
        return False
    return _now(now) < trial.ends_at


def billing_start_at_for_checkout(organization, *, now=None):
    """Future datetime when a paid Stripe period may begin, or None."""
    if not builtin_trial_is_active(organization, now=now):
        return None
    trial = get_builtin_trial(organization)
    moment = _now(now)
    if trial.ends_at <= moment:
        return None
    return trial.ends_at


def builtin_trial_public_payload(organization, *, now=None) -> dict:
    trial = get_builtin_trial(organization)
    moment = _now(now)
    granted = builtin_trial_was_granted(trial)
    active = bool(
        granted and trial.expired_at is None and moment < trial.ends_at
    )
    return {
        "days": BUILTIN_TRIAL_DAYS,
        "granted": granted,
        "consumed": bool(trial.consumed) if trial is not None else False,
        "active": active,
        "started_at": trial.started_at.isoformat() if granted else None,
        "ends_at": trial.ends_at.isoformat() if granted else None,
        "expired_at": (
            trial.expired_at.isoformat()
            if trial is not None and trial.expired_at
            else None
        ),
    }


def attach_builtin_trial(payload: dict, organization) -> dict:
    expire_due_builtin_trial(organization)
    organization.refresh_from_db()
    payload["builtin_trial"] = builtin_trial_public_payload(organization)
    return payload


def _mark_expired(trial: WorkspaceBuiltinTrial, moment):
    if trial.expired_at is not None:
        return trial
    trial.expired_at = moment
    trial.save(update_fields=["expired_at", "updated_at"])
    return trial


@transaction.atomic
def grant_builtin_trial_for_new_workspace(organization, *, now=None):
    """Create the write-once trial row. Grants Business only for new normal orgs."""
    if organization is None or not organization.pk:
        return None
    org = Organization.objects.select_for_update().get(pk=organization.pk)
    existing = WorkspaceBuiltinTrial.objects.select_for_update().filter(
        organization=org
    ).first()
    if existing is not None:
        return existing

    if org.is_checkstation_account:
        return WorkspaceBuiltinTrial.objects.create(
            organization=org,
            consumed=True,
            started_at=None,
            ends_at=None,
        )

    moment = _now(now)
    ends = moment + timedelta(days=BUILTIN_TRIAL_DAYS)
    trial = WorkspaceBuiltinTrial.objects.create(
        organization=org,
        consumed=True,
        started_at=moment,
        ends_at=ends,
    )
    apply_effective_plan(org, PLAN_BUSINESS, source="builtin_trial.grant")
    organization.refresh_from_db()
    return trial


@transaction.atomic
def mark_ineligible_without_grant(organization, *, now=None):
    """Existing-workspace / CheckStation semantics: consumed, never granted.

    If a grant already happened, this does not rewind consumed or timestamps.
    It only creates an ineligible row when none exists, then sets Basic when
    the trial was never granted.
    """
    _ = now
    org = Organization.objects.select_for_update().get(pk=organization.pk)
    trial = WorkspaceBuiltinTrial.objects.select_for_update().filter(
        organization=org
    ).first()
    if trial is None:
        trial = WorkspaceBuiltinTrial.objects.create(
            organization=org,
            consumed=True,
            started_at=None,
            ends_at=None,
        )
    if trial.started_at is None and not org.is_checkstation_account:
        if org.plan != OrganizationPlan.BASIC:
            apply_effective_plan(org, PLAN_BASIC, source="builtin_trial.mark_ineligible")
    return trial


@transaction.atomic
def expire_due_builtin_trial(organization, *, now=None):
    """Apply post-trial entitlement when the free week has ended.

    If a paid subscription was selected during the week, keep Business until
    that paid plan is commercially active, then apply the paid plan.
    """
    if organization is None or not organization.pk:
        return organization
    moment = _now(now)
    org = Organization.objects.select_for_update().get(pk=organization.pk)
    trial = WorkspaceBuiltinTrial.objects.select_for_update().filter(
        organization=org
    ).first()
    if trial is None or not builtin_trial_was_granted(trial):
        return org
    if moment < trial.ends_at:
        return org
    if org.is_checkstation_account:
        _mark_expired(trial, moment)
        return org

    billing = WorkspaceSubscription.objects.select_for_update().filter(
        organization=org
    ).first()
    subscribed = (billing.subscribed_plan if billing else "") or ""
    live_paid = bool(
        billing
        and billing.status in {BillingStatus.ACTIVE, BillingStatus.PAST_DUE}
        and subscribed in PAID_PLAN_KEYS
    )
    deferred_paid = bool(
        billing
        and billing.status == BillingStatus.TRIALING
        and subscribed in PAID_PLAN_KEYS
    )
    if live_paid:
        apply_effective_plan(
            org, subscribed, source="builtin_trial.expire_to_paid"
        )
        _mark_expired(trial, moment)
        org.refresh_from_db()
        return org
    if deferred_paid:
        # Paid period has not started yet — do not shorten the free week
        # and do not drop to Basic.
        return org

    apply_effective_plan(org, PLAN_BASIC, source="builtin_trial.expire_to_basic")
    _mark_expired(trial, moment)
    org.refresh_from_db()
    return org


def close_builtin_trial_for_checkstation(organization, *, now=None):
    """Stop an in-progress grant without restoring eligibility.

    Start/end timestamps stay immutable. Used when a workspace becomes
    CheckStation-managed during the free week.
    """
    trial = get_builtin_trial(organization)
    if trial is None or not builtin_trial_was_granted(trial):
        return trial
    return _mark_expired(trial, _now(now))


def expire_due_builtin_trials(*, now=None) -> dict:
    """Expire every granted trial whose window has ended. Used by the command."""
    moment = _now(now)
    rows = WorkspaceBuiltinTrial.objects.filter(
        started_at__isnull=False,
        ends_at__isnull=False,
        ends_at__lte=moment,
        expired_at__isnull=True,
    ).select_related("organization")
    expired = 0
    skipped = 0
    for trial in rows:
        org = trial.organization
        if org is None:
            skipped += 1
            continue
        expire_due_builtin_trial(org, now=moment)
        trial.refresh_from_db()
        if trial.expired_at is not None:
            expired += 1
        else:
            skipped += 1
    return {"expired": expired, "skipped": skipped}


def commercial_access_active(billing) -> bool:
    if billing is None:
        return False
    return billing.status in _LIVE_COMMERCIAL
