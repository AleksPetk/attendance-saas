from django.db import transaction
from django.utils import timezone

from organizations.models import (
    WorkspaceTutorialModuleCompletion,
    WorkspaceTutorialState,
    WorkspaceTutorialStatus,
)

INTRO_TUTORIAL_ID = "workspace-introduction"
INTRO_TUTORIAL_VERSION = 1
TERMINAL_TUTORIAL_STATUSES = {
    WorkspaceTutorialStatus.COMPLETED,
    WorkspaceTutorialStatus.SKIPPED,
}


def get_workspace_tutorial_state(organization):
    state, _created = WorkspaceTutorialState.objects.get_or_create(
        organization=organization,
        defaults={
            "tutorial_id": INTRO_TUTORIAL_ID,
            "version": INTRO_TUTORIAL_VERSION,
        },
    )
    return state


def tutorial_state_payload(state):
    return {
        "tutorial_id": state.tutorial_id,
        "version": state.version,
        "status": state.status,
        "last_module": state.last_module,
        "last_step": state.last_step,
        "started_at": state.started_at,
        "completed_at": state.completed_at,
        "skipped_at": state.skipped_at,
        "updated_at": state.updated_at,
        "completed_module_ids": list(
            WorkspaceTutorialModuleCompletion.objects.filter(
                organization=state.organization,
            ).values_list("module_id", flat=True)
        ),
        "automatic_eligible": state.status
        in {WorkspaceTutorialStatus.NOT_STARTED, WorkspaceTutorialStatus.IN_PROGRESS},
    }


@transaction.atomic
def complete_workspace_tutorial_module(organization, *, module_id):
    """Idempotently record a focused tutorial completion for this owner Workspace."""

    completion, _created = WorkspaceTutorialModuleCompletion.objects.update_or_create(
        organization=organization,
        module_id=module_id,
        defaults={"completed_at": timezone.now()},
    )
    return completion


@transaction.atomic
def update_workspace_tutorial_state(
    organization,
    *,
    status,
    last_module="",
    last_step="",
):
    state = (
        WorkspaceTutorialState.objects.select_for_update()
        .filter(organization=organization)
        .first()
    )
    if state is None:
        state = WorkspaceTutorialState.objects.create(
            organization=organization,
            tutorial_id=INTRO_TUTORIAL_ID,
            version=INTRO_TUTORIAL_VERSION,
        )

    now = timezone.now()
    if state.status in TERMINAL_TUTORIAL_STATUSES and status == WorkspaceTutorialStatus.IN_PROGRESS:
        return state

    state.status = status
    state.last_module = (last_module or "")[:80]
    state.last_step = (last_step or "")[:80]
    if status == WorkspaceTutorialStatus.IN_PROGRESS and state.started_at is None:
        state.started_at = now
    if status == WorkspaceTutorialStatus.COMPLETED:
        state.completed_at = state.completed_at or now
        state.skipped_at = None
    elif status == WorkspaceTutorialStatus.SKIPPED:
        state.skipped_at = state.skipped_at or now
        state.completed_at = None
    state.save()
    return state


def attach_workspace_tutorial(payload, organization):
    payload["tutorial"] = tutorial_state_payload(
        get_workspace_tutorial_state(organization)
    )
    return payload
