"""Group-scoped participant code generation (e.g. G1-5679)."""

import random

CODE_SUFFIX_MIN = 1000
CODE_SUFFIX_MAX = 9999
MAX_GENERATION_ATTEMPTS = 64


def format_group_participant_code(group_id, suffix):
    return f"G{group_id}-{suffix}"


def generate_unique_group_participant_code(group, *, model_class, group_field="group"):
    """
    Return a code unique within the Group.

    Uses a random 4-digit suffix and retries on collision.
    """
    if group is None or not getattr(group, "pk", None):
        raise ValueError("Group must be saved before assigning a participant code.")

    filter_kwargs = {f"{group_field}_id": group.pk}
    for _ in range(MAX_GENERATION_ATTEMPTS):
        suffix = random.randint(CODE_SUFFIX_MIN, CODE_SUFFIX_MAX)
        code = format_group_participant_code(group.pk, suffix)
        if not model_class.objects.filter(**filter_kwargs, group_participant_code=code).exists():
            return code
    raise RuntimeError(
        f"Could not allocate a unique participant code for Group {group.pk}."
    )


def assign_group_participant_code(instance, *, model_class, group_field="group"):
    """Set group_participant_code on instance if missing; caller must save."""
    if getattr(instance, "group_participant_code", ""):
        return instance.group_participant_code
    group = getattr(instance, group_field, None)
    if group is None and getattr(instance, f"{group_field}_id", None):
        from groups.models import Group

        group = Group.objects.filter(pk=getattr(instance, f"{group_field}_id")).first()
    code = generate_unique_group_participant_code(group, model_class=model_class, group_field=group_field)
    instance.group_participant_code = code
    return code
