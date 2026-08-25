"""Effective advertising state — not a normal plan entitlement gate.

FEATURE_ADS_REQUIRED polarity is inverted from other catalog features:
True means the workspace is eligible/required to show ads.

Do not use require_feature() or deny_plan_feature() for ads.
"""

from __future__ import annotations

from organizations.entitlements.catalog import FEATURE_ADS_REQUIRED
from organizations.entitlements.service import has_feature

AD_PROVIDER_MOCK = "mock"

PLACEMENT_DASHBOARD_BANNER = "dashboard_banner"
PLACEMENT_GROUPS_BANNER = "groups_banner"
PLACEMENT_KIOSK_LAUNCH = "kiosk_launch_interstitial"
PLACEMENT_KIOSK_EXIT = "kiosk_exit_interstitial"
PLACEMENT_KIOSK_BUILDER_EXIT = "kiosk_builder_exit_interstitial"

AD_PLACEMENTS = (
    PLACEMENT_DASHBOARD_BANNER,
    PLACEMENT_GROUPS_BANNER,
    PLACEMENT_KIOSK_LAUNCH,
    PLACEMENT_KIOSK_EXIT,
    PLACEMENT_KIOSK_BUILDER_EXIT,
)


def workspace_requires_ads(organization) -> bool:
    """True when the workspace plan carries ads_required."""
    return bool(has_feature(organization, FEATURE_ADS_REQUIRED))


def ads_globally_enabled() -> bool:
    from core.models import PlatformAdvertisingSettings

    return bool(PlatformAdvertisingSettings.load().ads_globally_enabled)


def advertising_is_active(organization) -> bool:
    """Workspace requires ads AND the platform kill switch is on."""
    if organization is None:
        return False
    return workspace_requires_ads(organization) and ads_globally_enabled()


def build_advertising_payload(organization) -> dict:
    enabled = advertising_is_active(organization)
    return {
        "enabled": enabled,
        "provider": AD_PROVIDER_MOCK,
        "placements": list(AD_PLACEMENTS) if enabled else [],
    }


def attach_workspace_advertising(payload: dict, organization) -> dict:
    payload["advertising"] = build_advertising_payload(organization)
    return payload
