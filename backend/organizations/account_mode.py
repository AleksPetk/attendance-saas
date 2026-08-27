"""Organization account-mode and access helpers."""

from organizations.models import OrganizationStatus

ACCOUNT_MODE_NORMAL = "normal"
ACCOUNT_MODE_CHECKSTATION = "checkstation"


def is_checkstation_account(organization) -> bool:
    return bool(organization is not None and organization.is_checkstation_account)


def account_mode_key(organization) -> str:
    if is_checkstation_account(organization):
        return ACCOUNT_MODE_CHECKSTATION
    return ACCOUNT_MODE_NORMAL


def is_workspace_operational(organization) -> bool:
    """True when owner/staff/kiosk/workspace APIs may operate."""
    return (
        organization is not None
        and getattr(organization, "status", None) == OrganizationStatus.ACTIVE
    )
