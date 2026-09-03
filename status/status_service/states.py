"""Component states, public labels, and anti-flapping transitions."""

STATE_OPERATIONAL = "operational"
STATE_DEGRADED = "degraded"
STATE_PARTIAL_OUTAGE = "partial_outage"
STATE_MAJOR_OUTAGE = "major_outage"
STATE_MAINTENANCE = "maintenance"
STATE_UNKNOWN = "unknown"

# English defaults kept for backward-compatible imports; localized labels live in i18n.py.
COMPONENT_STATE_LABELS = {
    STATE_OPERATIONAL: "Operational",
    STATE_DEGRADED: "Degraded performance",
    STATE_PARTIAL_OUTAGE: "Partial outage",
    STATE_MAJOR_OUTAGE: "Major outage",
    STATE_MAINTENANCE: "Scheduled maintenance",
    STATE_UNKNOWN: "Unknown",
}

OVERALL_ALL_OPERATIONAL = "all_operational"
OVERALL_SOME_DEGRADED = "some_degraded"
OVERALL_PARTIAL_OUTAGE = "partial_outage"
OVERALL_MAJOR_OUTAGE = "major_outage"
OVERALL_MAINTENANCE = "maintenance"
OVERALL_UNAVAILABLE = "unavailable"

OVERALL_LABELS = {
    OVERALL_ALL_OPERATIONAL: "All systems operational",
    OVERALL_SOME_DEGRADED: "Some systems degraded",
    OVERALL_PARTIAL_OUTAGE: "Partial outage",
    OVERALL_MAJOR_OUTAGE: "Major outage",
    OVERALL_MAINTENANCE: "Scheduled maintenance",
    OVERALL_UNAVAILABLE: "Status unavailable",
}

RESULT_SUCCESS = "success"
RESULT_DEGRADED = "degraded"
RESULT_FAILURE = "failure"
RESULT_UNCONFIGURED = "unconfigured"


def public_component_label(state, locale="en"):
    from status_service.i18n import public_component_label as localized_label

    return localized_label(state, locale)


def apply_probe_result(current_state, consecutive_failures, consecutive_successes, kind):
    """
    Return (state, consecutive_failures, consecutive_successes).

    Never defaults a first result to Operational. One transport failure does
    not become a major outage.
    """
    current_state = current_state or STATE_UNKNOWN
    consecutive_failures = int(consecutive_failures or 0)
    consecutive_successes = int(consecutive_successes or 0)

    if kind == RESULT_UNCONFIGURED:
        return STATE_UNKNOWN, 0, 0

    if kind == RESULT_DEGRADED:
        return STATE_DEGRADED, 0, 0

    if kind == RESULT_FAILURE:
        failures = consecutive_failures + 1
        if failures >= 3:
            state = STATE_MAJOR_OUTAGE
        elif failures >= 2:
            state = STATE_DEGRADED
        elif current_state == STATE_OPERATIONAL:
            state = STATE_OPERATIONAL
        else:
            state = current_state or STATE_UNKNOWN
        return state, failures, 0

    if kind == RESULT_SUCCESS:
        successes = consecutive_successes + 1
        if successes >= 2 or current_state == STATE_OPERATIONAL:
            state = STATE_OPERATIONAL
        else:
            state = current_state or STATE_UNKNOWN
        return state, 0, successes

    return STATE_UNKNOWN, 0, 0
