from rest_framework.exceptions import APIException


class MissingRequiredFields(APIException):
    status_code = 400
    default_code = "missing_required_fields"

    def __init__(self, missing_fields, detail=None):
        super().__init__(requirement_error_payload(missing_fields, detail=detail))


class RequirementConflict(APIException):
    status_code = 409
    default_code = "requirement_conflicts"
    default_detail = (
        "This change would leave some people without required information."
    )

    def __init__(self, conflicts, detail=None):
        super().__init__(
            {
                "code": "requirement_conflicts",
                "detail": detail or self.default_detail,
                "conflicts": conflicts,
            }
        )


REQUIRED_FIELD_MESSAGES = {
    "name": "This Group requires a name for every participant.",
    "email": "This Group requires an email address for every participant.",
    "photo": "This Group requires a photo for every participant.",
    "check_in_identifier": (
        "This Group requires a member identifier for every participant."
    ),
    "pin": "This Group requires a PIN for every participant.",
}


def requirement_error_payload(missing_fields, *, detail=None):
    fields = list(missing_fields)
    field_messages = {
        field: REQUIRED_FIELD_MESSAGES[field]
        for field in fields
        if field in REQUIRED_FIELD_MESSAGES
    }
    first_detail = detail or next(iter(field_messages.values()), "Required information is missing.")
    return {
        "code": "missing_required_fields",
        "detail": first_detail,
        "missing_fields": fields,
        "field_messages": field_messages,
    }


def values_are_present(values, field):
    if field == "photo":
        return bool(values.get("has_photo"))
    if field == "pin":
        return bool(values.get("has_pin"))
    return bool((values.get(field) or "").strip())


def missing_required_fields(requirements, values):
    missing = []
    if not values_are_present(values, "name"):
        missing.append("name")
    if requirements.require_email and not values_are_present(values, "email"):
        missing.append("email")
    if requirements.require_photo and not values_are_present(values, "photo"):
        missing.append("photo")
    if requirements.require_check_in_identifier and not values_are_present(
        values, "check_in_identifier"
    ):
        missing.append("check_in_identifier")
    if requirements.require_pin and not values_are_present(values, "pin"):
        missing.append("pin")
    return missing


def member_profile_values(member):
    return {
        "name": member.name,
        "email": member.email,
        "check_in_identifier": member.check_in_identifier,
        "has_photo": member.has_photo,
        "has_pin": member.has_pin,
    }


def first_present(*candidates):
    for candidate in candidates:
        if candidate is None:
            continue
        if isinstance(candidate, str) and not candidate.strip():
            continue
        if candidate == "":
            continue
        return candidate
    return ""


def membership_effective_values(membership, *, pending=None):
    pending = pending or {}
    member = membership.member
    name = pending.get(
        "override_name",
        membership.override_name if membership.pk else "",
    )
    email = pending.get(
        "override_email",
        membership.override_email if membership.pk else "",
    )
    check_in_identifier = pending.get(
        "override_check_in_identifier",
        membership.override_check_in_identifier if membership.pk else "",
    )
    pending_photo = pending.get("has_override_photo")
    if pending_photo is None:
        has_override_photo = bool(membership.override_photo) if membership.pk else False
    else:
        has_override_photo = pending_photo
    pending_pin = pending.get("has_override_pin")
    if pending_pin is None:
        has_override_pin = bool(membership.override_pin_hash) if membership.pk else False
    else:
        has_override_pin = pending_pin
    return {
        "name": first_present(name, member.name),
        "email": first_present(email, member.email),
        "check_in_identifier": first_present(
            check_in_identifier,
            member.check_in_identifier,
        ),
        "has_photo": has_override_photo or member.has_photo,
        "has_pin": has_override_pin or member.has_pin,
    }


def participant_values(participant, *, pending=None):
    pending = pending or {}
    has_photo = pending.get("has_photo")
    if has_photo is None:
        has_photo = participant.has_photo if participant.pk else False
    has_pin = pending.get("has_pin")
    if has_pin is None:
        has_pin = participant.has_pin if participant.pk else False
    return {
        "name": pending.get("name", participant.name if participant.pk else ""),
        "email": pending.get("email", participant.email if participant.pk else ""),
        "check_in_identifier": pending.get(
            "check_in_identifier",
            participant.check_in_identifier if participant.pk else "",
        ),
        "has_photo": has_photo,
        "has_pin": has_pin,
    }


def conflict_item(*, kind, record, missing_fields):
    return {
        "kind": kind,
        "id": record.pk,
        "name": record.display_name,
        "missing_fields": missing_fields,
        "field_messages": {
            field: REQUIRED_FIELD_MESSAGES[field]
            for field in missing_fields
            if field in REQUIRED_FIELD_MESSAGES
        },
    }


def find_requirement_conflicts(group, requirements=None):
    from groups.models import GroupMembershipStatus, GroupOnlyParticipantStatus

    spec = requirements or group
    conflicts = []
    memberships = group.memberships.select_related("member").filter(
        status=GroupMembershipStatus.ACTIVE
    )
    for membership in memberships:
        missing = missing_required_fields(spec, membership_effective_values(membership))
        if missing:
            conflicts.append(
                conflict_item(
                    kind="membership",
                    record=membership,
                    missing_fields=missing,
                )
            )
    participants = group.group_only_participants.filter(
        status=GroupOnlyParticipantStatus.ACTIVE
    )
    for participant in participants:
        missing = missing_required_fields(spec, participant_values(participant))
        if missing:
            conflicts.append(
                conflict_item(
                    kind="group_only_participant",
                    record=participant,
                    missing_fields=missing,
                )
            )
    return conflicts
