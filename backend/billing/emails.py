"""Platform billing emails. Uses Check Station Resend, not Group SMTP."""

from django.conf import settings

from billing.catalog import PAYMENT_GRACE_DAYS
from core.mail import frontend_url, send_transactional_email


def send_payment_failure_warning(*, owner, organization, billing):
    product = getattr(settings, "PRODUCT_NAME", "Check Station")
    manage_url = frontend_url("account", "billing")
    deadline = billing.payment_grace_deadline
    deadline_text = deadline.strftime("%Y-%m-%d %H:%M UTC") if deadline else "soon"
    intro = (
        f"We could not process the subscription payment for workspace "
        f"{organization.workspace_id}. Your current plan stays active during a "
        f"{PAYMENT_GRACE_DAYS}-day grace period, which ends {deadline_text}. "
        "Update your payment method to keep Plus or Business access."
    )
    html_body = (
        f"<p>{intro}</p>"
        f"<p><a href=\"{manage_url}\">Manage billing</a></p>"
        "<p>If you did not expect this message, sign in and review Account → Billing.</p>"
    )
    text_body = (
        f"{intro}\n\nManage billing: {manage_url}\n"
    )
    send_transactional_email(
        to_email=owner.email,
        subject=f"{product}: payment problem on your subscription",
        html_body=html_body,
        text_body=text_body,
    )
