"""Shared helpers for Group email-sender tests (draft verify → confirm save)."""

from django.contrib.sessions.backends.db import SessionStore
from django.test import RequestFactory

from groups.email_providers.base import EmailSenderProviderError
from groups.email_sender import save_group_email_sender, send_group_email_sender_test

# Django's test runner forces DEBUG=False. Group sender suites intentionally leave
# APP_SECRETS_ENCRYPTION_KEY empty to exercise SECRET_KEY derivation, which
# requires DEBUG=True.
GROUP_EMAIL_CRYPTO_TEST_SETTINGS = {
    "DEBUG": True,
    "APP_SECRETS_ENCRYPTION_KEY": "",
    "SECRET_KEY": "test-secret-key-for-group-email-sender-suite",
}

def mock_batch_send_success(_sender, *, messages):
    """Simulate successful SMTP batch delivery for all recipients."""
    return [
        {"to_email": m["to_email"], "ok": True, "error": None}
        for m in messages
    ]


def mock_batch_send_fail_for(*failing_emails, error_message="Could not send the email"):
    """Return a side_effect that fails only the listed recipient addresses."""
    failing = {email.strip().lower() for email in failing_emails}

    def _side_effect(_sender, *, messages):
        results = []
        for msg in messages:
            to_email = (msg.get("to_email") or "").strip().lower()
            if to_email in failing:
                results.append(
                    {
                        "to_email": to_email,
                        "ok": False,
                        "error": EmailSenderProviderError(error_message),
                    }
                )
            else:
                results.append({"to_email": to_email, "ok": True, "error": None})
        return results

    return _side_effect


def batch_recipients(mock_send):
    """Extract ordered recipient emails from a send_messages_batch mock call."""
    messages = mock_send.call_args.kwargs.get("messages") or []
    return [m["to_email"] for m in messages]


def flush_email_outbox(*, limit=50):
    """Process due outbox jobs (tests that previously expected sync SMTP)."""
    from groups.email_outbox import process_due_email_outbox

    return process_due_email_outbox(limit=limit)


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
