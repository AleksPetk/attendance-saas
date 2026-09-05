"""Test-only helpers. Do not import from production billing code."""

from django.utils import timezone

from billing.models import WorkspaceBuiltinTrial
from organizations.entitlements.transitions import apply_effective_plan
from organizations.models import OrganizationPlan


def simulate_migrated_existing_workspace(organization):
    """Rewrite a just-created org as a pre-trial backfill row.

    Production migration writes this shape for workspaces that already
    existed: consumed, never granted, current plan unchanged. Tests that
    need Basic commercial semantics after create_with_owner call this.
    """
    trial = WorkspaceBuiltinTrial.objects.get(organization=organization)
    trial.started_at = None
    trial.ends_at = None
    trial.expired_at = None
    trial.save(update_fields=["started_at", "ends_at", "expired_at", "updated_at"])
    apply_effective_plan(
        organization,
        OrganizationPlan.BASIC,
        source="test.migrated_ineligible",
    )
    organization.refresh_from_db()
    return organization


def mark_builtin_trial_expired_for_tests(organization, *, now=None):
    """Make builtin trial inactive without rewriting the granted window.

    Paid Plus/Business fixtures must call this so promotion audience and
    retention coupons see a genuine post-trial commercial customer. Does not
    change org.plan by itself — callers set commercial state next.
    """
    try:
        trial = organization.builtin_trial
    except WorkspaceBuiltinTrial.DoesNotExist:
        trial = WorkspaceBuiltinTrial.objects.filter(
            organization_id=organization.pk
        ).first()
    if trial is None or trial.started_at is None:
        return organization
    if trial.expired_at is not None:
        return organization
    moment = now if now is not None else timezone.now()
    trial.expired_at = moment
    trial.save(update_fields=["expired_at", "updated_at"])
    organization.refresh_from_db()
    return organization
