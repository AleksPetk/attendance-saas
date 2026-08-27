"""Test-only helpers. Do not import from production billing code."""

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
