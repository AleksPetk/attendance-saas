"""Overall status rollup from component states."""

from status_service.components import CORE_IDS, PERIPHERAL_IDS, SUPPORTING_IDS
from status_service.i18n import overall_label
from status_service.locale import DEFAULT_LOCALE
from status_service.states import (
    OVERALL_ALL_OPERATIONAL,
    OVERALL_MAJOR_OUTAGE,
    OVERALL_MAINTENANCE,
    OVERALL_PARTIAL_OUTAGE,
    OVERALL_SOME_DEGRADED,
    OVERALL_UNAVAILABLE,
    STATE_DEGRADED,
    STATE_MAJOR_OUTAGE,
    STATE_MAINTENANCE,
    STATE_OPERATIONAL,
    STATE_PARTIAL_OUTAGE,
    STATE_UNKNOWN,
)


def _states_for(components, ids):
    by_id = {item["id"]: item["state"] for item in components}
    return [by_id.get(component_id, STATE_UNKNOWN) for component_id in ids]


def overall_status(components, locale=DEFAULT_LOCALE):
    """
    Return (overall_state, overall_label).

    Unknown Documentation / unconfigured supporting components do not
    block All systems operational. Unknown core does.
    """
    core = _states_for(components, CORE_IDS)
    supporting = _states_for(components, SUPPORTING_IDS)
    peripheral = _states_for(components, PERIPHERAL_IDS)

    core_major = sum(1 for state in core if state == STATE_MAJOR_OUTAGE)
    if core_major >= 2:
        return OVERALL_MAJOR_OUTAGE, overall_label(OVERALL_MAJOR_OUTAGE, locale)
    if core_major == 1:
        return OVERALL_PARTIAL_OUTAGE, overall_label(OVERALL_PARTIAL_OUTAGE, locale)

    supporting_major = sum(1 for state in supporting if state == STATE_MAJOR_OUTAGE)
    if supporting_major >= 2:
        return OVERALL_PARTIAL_OUTAGE, overall_label(OVERALL_PARTIAL_OUTAGE, locale)

    impairing = {
        STATE_DEGRADED,
        STATE_PARTIAL_OUTAGE,
        STATE_MAJOR_OUTAGE,
    }
    if any(state in impairing for state in core + supporting + peripheral):
        return OVERALL_SOME_DEGRADED, overall_label(OVERALL_SOME_DEGRADED, locale)

    if any(state == STATE_MAINTENANCE for state in core + supporting + peripheral):
        return OVERALL_MAINTENANCE, overall_label(OVERALL_MAINTENANCE, locale)

    if any(state == STATE_UNKNOWN for state in core):
        return OVERALL_UNAVAILABLE, overall_label(OVERALL_UNAVAILABLE, locale)

    if all(state == STATE_OPERATIONAL for state in core):
        return OVERALL_ALL_OPERATIONAL, overall_label(OVERALL_ALL_OPERATIONAL, locale)

    return OVERALL_UNAVAILABLE, overall_label(OVERALL_UNAVAILABLE, locale)
