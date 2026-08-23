"""Shared helpers for Group email-sender tests (draft verify → confirm save)."""

from django.contrib.sessions.backends.db import SessionStore
from django.test import RequestFactory

from groups.email_sender import save_group_email_sender, send_group_email_sender_test


def make_session_request():
    request = RequestFactory().post("/")
    session = SessionStore()
    session.create()
    request.session = session
    return request


def save_verified_email_sender(*, group, to_email="verify@example.com", **kwargs):
    """
    Draft-test then confirm-save so helpers produce an active Ready sender.
    Callers should patch the provider send path around this helper when needed.
    """
    request = make_session_request()
    draft = dict(kwargs)
    draft.setdefault("change_password", True)
    send_group_email_sender_test(
        group=group,
        to_email=to_email,
        request=request,
        draft=draft,
    )
    return save_group_email_sender(group=group, request=request, **kwargs)
