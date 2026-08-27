"""Platform billing emails. Uses CheckStation Resend, not Group SMTP."""

from billing.catalog import PAYMENT_GRACE_DAYS
from core.email_branding import product_name, render_branded_email
from core.mail import frontend_url, send_transactional_email


def send_payment_failure_warning(*, owner, organization, billing):
    name = product_name()
    manage_url = frontend_url("account", "billing")
    deadline = billing.payment_grace_deadline
    deadline_text = deadline.strftime("%Y-%m-%d %H:%M UTC") if deadline else "soon"
    intro = (
        f"We could not process the subscription payment for workspace "
        f"{organization.workspace_id}. Your current plan stays active during a "
        f"{PAYMENT_GRACE_DAYS}-day grace period, which ends {deadline_text}. "
        "Update your payment method to keep Plus or Business access."
    )
    html_body, text_body = render_branded_email(
        heading=f"{name} payment problem",
        intro=intro,
        action_label="Manage billing",
        action_url=manage_url,
        security_note=(
            "If you did not expect this message, sign in and review Account → Billing."
        ),
    )
    send_transactional_email(
        to_email=owner.email,
        subject=f"{name}: payment problem on your subscription",
        html_body=html_body,
        text_body=text_body,
    )
