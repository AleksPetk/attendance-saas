"""Server-side eligibility and acknowledgement helpers for announcements."""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import Exists, OuterRef, Q, QuerySet
from django.utils import timezone

from content.models import (
    Announcement,
    AnnouncementAcknowledgement,
    AnnouncementAudience,
    PublicationStatus,
)
from organizations.entitlements.service import get_organization_plan_key
from organizations.models import WorkspaceStaffAccount
from organizations.permissions import get_active_workspace_organization


def resolve_announcement_actor(user):
    """
    Return (owner_user_or_none, staff_account_or_none) for acknowledgement ownership.

    Exactly one side is set for eligible workspace actors.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return None, None
    if isinstance(user, WorkspaceStaffAccount):
        return None, user
    return user, None


def published_announcement_queryset(now=None) -> QuerySet:
    now = now or timezone.now()
    return Announcement.objects.filter(
        status=PublicationStatus.PUBLISHED,
        published_at__isnull=False,
        published_at__lte=now,
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))


def eligible_announcements_for_organization(organization, now=None) -> QuerySet:
    """Filter published announcements whose audience matches this Organization."""
    if organization is None:
        return Announcement.objects.none()

    plan_key = get_organization_plan_key(organization)
    base = published_announcement_queryset(now=now)
    return base.filter(
        Q(audience=AnnouncementAudience.ALL)
        | Q(audience=AnnouncementAudience.PLAN, target_plans__contains=[plan_key])
        | Q(
            audience=AnnouncementAudience.WORKSPACES,
            target_workspaces=organization,
        )
    ).distinct()


def actor_acknowledgement_filter(user=None, staff=None) -> Q:
    if staff is not None:
        return Q(workspace_staff_account=staff)
    if user is not None:
        return Q(user=user)
    return Q(pk__in=[])


def annotate_read_state(queryset: QuerySet, user=None, staff=None) -> QuerySet:
    ack_qs = AnnouncementAcknowledgement.objects.filter(
        announcement_id=OuterRef("pk"),
    ).filter(actor_acknowledgement_filter(user=user, staff=staff))
    return queryset.annotate(is_read=Exists(ack_qs))


def list_eligible_announcements_for_actor(actor, *, organization=None, now=None):
    organization = organization or get_active_workspace_organization(actor)
    if organization is None:
        return Announcement.objects.none(), None, None

    user, staff = resolve_announcement_actor(actor)
    qs = eligible_announcements_for_organization(organization, now=now).order_by(
        "-published_at",
        "-id",
    )
    return annotate_read_state(qs, user=user, staff=staff), user, staff


def unread_count_for_actor(actor, *, organization=None, now=None) -> int:
    qs, _user, _staff = list_eligible_announcements_for_actor(
        actor,
        organization=organization,
        now=now,
    )
    return qs.filter(is_read=False).count()


def get_eligible_announcement_for_actor(actor, announcement_id, *, organization=None, now=None):
    qs, user, staff = list_eligible_announcements_for_actor(
        actor,
        organization=organization,
        now=now,
    )
    return qs.filter(pk=announcement_id).first(), user, staff


@transaction.atomic
def acknowledge_announcement(actor, announcement, *, now=None):
    """
    Idempotently mark an announcement read for the authenticated actor.

    Returns (acknowledgement, created).
    """
    now = now or timezone.now()
    user, staff = resolve_announcement_actor(actor)
    if user is None and staff is None:
        raise ValueError("Authenticated workspace actor required.")

    lookup = {"announcement": announcement}
    defaults = {"read_at": now}
    if staff is not None:
        lookup["workspace_staff_account"] = staff
        defaults["user"] = None
    else:
        lookup["user"] = user
        defaults["workspace_staff_account"] = None

    try:
        ack, created = AnnouncementAcknowledgement.objects.get_or_create(
            **lookup,
            defaults=defaults,
        )
    except IntegrityError:
        ack = AnnouncementAcknowledgement.objects.get(**lookup)
        created = False
    return ack, created


@transaction.atomic
def acknowledge_announcements(actor, announcements, *, now=None):
    now = now or timezone.now()
    results = []
    for announcement in announcements:
        results.append(acknowledge_announcement(actor, announcement, now=now))
    return results
