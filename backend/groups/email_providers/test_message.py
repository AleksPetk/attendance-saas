"""Shared CheckStation copy for Group sender test messages."""

from core.email_branding import product_name, render_branded_email


def group_sender_test_email():
    name = product_name()
    html_body, text_body = render_branded_email(
        heading=f"{name} test email",
        intro=(
            f"This is a test message from {name}. "
            "Your Group email sender is working."
        ),
    )
    return f"{name} test email", html_body, text_body
