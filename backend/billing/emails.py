"""Platform billing emails. Uses CheckStation Resend, not Group SMTP."""

from billing.catalog import PAYMENT_GRACE_DAYS
from accounts.language import normalize_language
from core.email_branding import product_name, render_branded_email
from core.mail import frontend_url, send_transactional_email


def send_payment_failure_warning(*, owner, organization, billing, language=None):
    name = product_name()
    manage_url = frontend_url("account", "billing")
    deadline = billing.payment_grace_deadline
    deadline_text = deadline.strftime("%Y-%m-%d %H:%M UTC") if deadline else "soon"
    resolved_language = normalize_language(
        language if language is not None else getattr(owner, "preferred_language", None)
    )

    if resolved_language == "ja":
        subject = f"{name}: サブスクリプションの支払いに問題があります"
        heading = f"{name} の支払い問題"
        intro = (
            f"ワークスペース {organization.workspace_id} のサブスクリプション支払いを"
            f"処理できませんでした。現在のプランは {PAYMENT_GRACE_DAYS} 日間の猶予期間中は"
            f"有効のままです（{deadline_text} まで）。"
            "Plus または Business アクセスを維持するには支払い方法を更新してください。"
        )
        action_label = "請求を管理"
        security_note = "このメールに心当たりがない場合は、サインインしてアカウント → 請求を確認してください。"
    else:
        subject = f"{name}: payment problem on your subscription"
        heading = f"{name} payment problem"
        intro = (
            f"We could not process the subscription payment for workspace "
            f"{organization.workspace_id}. Your current plan stays active during a "
            f"{PAYMENT_GRACE_DAYS}-day grace period, which ends {deadline_text}. "
            "Update your payment method to keep Plus or Business access."
        )
        action_label = "Manage billing"
        security_note = (
            "If you did not expect this message, sign in and review Account → Billing."
        )

    html_body, text_body = render_branded_email(
        heading=heading,
        intro=intro,
        action_label=action_label,
        action_url=manage_url,
        security_note=security_note,
        language=resolved_language,
    )
    send_transactional_email(
        to_email=owner.email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )
