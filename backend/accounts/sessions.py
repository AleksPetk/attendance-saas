"""Invalidate Django DB sessions for an accounts.User without touching staff."""

from django.contrib.sessions.models import Session
from django.utils import timezone

OWNER_BACKEND = "django.contrib.auth.backends.ModelBackend"


def invalidate_owner_sessions(user, *, keep_session_key=None):
    """
    Delete browser sessions for this paying customer / platform User.

    WorkspaceStaffAccount sessions use a different authentication backend, so
    they are left alone even if primary keys happen to overlap.
    """
    if user is None or not getattr(user, "pk", None):
        return
    user_id = str(user.pk)
    now = timezone.now()
    for session in Session.objects.filter(expire_date__gte=now):
        if keep_session_key and session.session_key == keep_session_key:
            continue
        data = session.get_decoded()
        if str(data.get("_auth_user_id")) != user_id:
            continue
        backend = data.get("_auth_user_backend") or ""
        if backend != OWNER_BACKEND:
            continue
        session.delete()
