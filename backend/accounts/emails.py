"""Platform account emails (verification and password reset)."""

from django.conf import settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from accounts.language import normalize_language
from accounts.tokens import (
    backup_email_verification_token_generator,
    email_verification_token_generator,
    password_reset_token_generator,
    primary_email_change_token_generator,
)
from core.email_branding import product_name, render_branded_email
from core.mail import frontend_url, send_transactional_email


def _hours(timeout_seconds):
    seconds = int(timeout_seconds or 0)
    return max(1, seconds // 3600)


def _uid(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


def _email_language(user, language=None):
    value = language if language is not None else getattr(user, "preferred_language", None)
    return normalize_language(value)


def verification_url(user):
    token = email_verification_token_generator.make_token(user)
    return frontend_url("verify-email", _uid(user), token)


def password_reset_url(user):
    token = password_reset_token_generator.make_token(user)
    return frontend_url("reset-password", _uid(user), token)


def send_verification_email(user, *, language=None):
    name = product_name()
    url = verification_url(user)
    resolved_language = _email_language(user, language)
    expiry_hours = _hours(getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 86400))

    if resolved_language == "ja":
        subject = "メールアドレスを確認してください"
        heading = subject
        intro = (
            f"{name}へのご登録ありがとうございます。"
            "以下のボタンからメールアドレスを確認すると、"
            "ワークスペースをご利用いただけます。"
        )
        action_label = "メールアドレスを確認"
        security_note = "このメールに心当たりがない場合は、そのまま破棄してください。"
        expiry_text = f"このリンクの有効期限は{expiry_hours}時間です。"
        action_help_text = (
            "ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください。"
        )
    else:
        subject = f"Verify your {name} email"
        heading = subject
        intro = (
            f"Thanks for creating a {name} account. Confirm this email "
            "address so you can sign in and use your workspace."
        )
        action_label = "Verify email"
        security_note = f"If you did not create a {name} account, you can ignore this email."
        expiry_text = ""
        action_help_text = ""

    html_body, text_body = render_branded_email(
        heading=heading,
        intro=intro,
        action_label=action_label,
        action_url=url,
        security_note=security_note,
        expiry_hours=expiry_hours,
        language=resolved_language,
        expiry_text=expiry_text,
        action_help_text=action_help_text,
    )
    send_transactional_email(
        to_email=user.email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def send_password_reset_email(user, *, language=None):
    name = product_name()
    url = password_reset_url(user)
    resolved_language = _email_language(user, language)
    expiry_hours = _hours(getattr(settings, "PASSWORD_RESET_TIMEOUT", 86400))

    if resolved_language == "ja":
        subject = "パスワードを再設定"
        heading = subject
        intro = f"{name}アカウントのパスワード再設定リクエストを受け付けました。"
        action_label = "パスワードを再設定"
        security_note = "この操作に心当たりがない場合は、このメールを無視してください。"
        expiry_text = "このリンクには有効期限があります。"
        action_help_text = (
            "ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください。"
        )
    else:
        subject = f"Reset your {name} password"
        heading = subject
        intro = (
            f"We received a request to reset the password for this {name} "
            "account. Choose a new password using the button below."
        )
        action_label = "Reset password"
        security_note = (
            "If you did not request a password reset, you can ignore this email. "
            "Your password will stay the same."
        )
        expiry_text = ""
        action_help_text = ""

    html_body, text_body = render_branded_email(
        heading=heading,
        intro=intro,
        action_label=action_label,
        action_url=url,
        security_note=security_note,
        expiry_hours=expiry_hours,
        language=resolved_language,
        expiry_text=expiry_text,
        action_help_text=action_help_text,
    )
    send_transactional_email(
        to_email=user.email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def backup_email_verification_url(user):
    token = backup_email_verification_token_generator.make_token(user)
    return frontend_url("verify-backup-email", _uid(user), token)


def primary_email_change_url(user):
    token = primary_email_change_token_generator.make_token(user)
    return frontend_url("verify-primary-email", _uid(user), token)


def send_backup_email_verification(user, *, language=None):
    pending = user.pending_backup_email
    if not pending:
        raise ValueError("No pending backup email to verify.")
    name = product_name()
    url = backup_email_verification_url(user)
    resolved_language = _email_language(user, language)
    expiry_hours = _hours(getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 86400))

    if resolved_language == "ja":
        subject = f"{name} バックアップメールを確認"
        heading = subject
        intro = (
            f"{name} オーナーアカウントのバックアップメールを追加または更新する"
            "リクエストを受け付けました。以下のボタンでこのアドレスを確認してください。"
        )
        action_label = "バックアップメールを確認"
        security_note = "このバックアップメール変更に心当たりがない場合は、このメールを無視してください。"
        expiry_text = f"このリンクの有効期限は{expiry_hours}時間です。"
        action_help_text = "ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください。"
    else:
        subject = f"Verify your {name} backup email"
        heading = subject
        intro = (
            f"You asked to add or update the backup email for your {name} "
            "owner account. Confirm this address using the button below."
        )
        action_label = "Verify backup email"
        security_note = (
            "If you did not request this backup email change, you can ignore this email."
        )
        expiry_text = ""
        action_help_text = ""

    html_body, text_body = render_branded_email(
        heading=heading,
        intro=intro,
        action_label=action_label,
        action_url=url,
        security_note=security_note,
        expiry_hours=expiry_hours,
        language=resolved_language,
        expiry_text=expiry_text,
        action_help_text=action_help_text,
    )
    send_transactional_email(
        to_email=pending,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def send_primary_email_change_verification(user, *, language=None):
    pending = user.pending_primary_email
    if not pending:
        raise ValueError("No pending primary email change.")
    name = product_name()
    url = primary_email_change_url(user)
    resolved_language = _email_language(user, language)
    expiry_hours = _hours(getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 86400))

    if resolved_language == "ja":
        subject = f"新しい {name} ログインメールを確認"
        heading = subject
        intro = (
            "このメールアドレスを "
            f"{name} オーナーアカウントのログインメールとして使用するリクエストを"
            "受け付けました。以下のボタンで変更を確認してください。"
        )
        action_label = "ログインメールを確認"
        security_note = "このログインメール変更に心当たりがない場合は、このメールを無視してください。"
        expiry_text = f"このリンクの有効期限は{expiry_hours}時間です。"
        action_help_text = "ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください。"
    else:
        subject = f"Confirm your new {name} login email"
        heading = subject
        intro = (
            "You requested to use this email address as the login email for your "
            f"{name} owner account. Confirm the change using the button below."
        )
        action_label = "Confirm login email"
        security_note = (
            "If you did not request this login email change, you can ignore this email."
        )
        expiry_text = ""
        action_help_text = ""

    html_body, text_body = render_branded_email(
        heading=heading,
        intro=intro,
        action_label=action_label,
        action_url=url,
        security_note=security_note,
        expiry_hours=expiry_hours,
        language=resolved_language,
        expiry_text=expiry_text,
        action_help_text=action_help_text,
    )
    send_transactional_email(
        to_email=pending,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def send_primary_email_changed_notice(*, old_email, language=None):
    if not old_email:
        return
    name = product_name()
    resolved_language = normalize_language(language)

    if resolved_language == "ja":
        subject = f"{name} のログインメールが変更されました"
        heading = subject
        intro = (
            f"{name} オーナーアカウントのログインメールが変更されました。"
            "ご自身による変更であれば、追加の操作は不要です。"
        )
        action_label = f"{name} にサインイン"
        security_note = (
            f"ログインメールを変更していない場合は、すぐに {name} サポートに連絡してください。"
        )
    else:
        subject = f"Your {name} login email was changed"
        heading = subject
        intro = (
            f"The login email for your {name} owner account was changed. "
            "If you made this change, no further action is needed."
        )
        action_label = f"Sign in to {name}"
        security_note = (
            f"If you did not change your login email, contact {name} support immediately."
        )

    html_body, text_body = render_branded_email(
        heading=heading,
        intro=intro,
        action_label=action_label,
        action_url=frontend_url("login"),
        security_note=security_note,
        language=resolved_language,
    )
    send_transactional_email(
        to_email=old_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def send_account_recovery_email(user, *, uid, token, language=None):
    name = product_name()
    url = frontend_url("recover-account", uid, token)
    resolved_language = _email_language(user, language)
    expiry_hours = _hours(getattr(settings, "ACCOUNT_RECOVERY_TIMEOUT", 3600))
    backup = getattr(user, "backup_email", "") or ""

    if resolved_language == "ja":
        subject = f"{name} アカウント復旧"
        heading = subject
        intro = (
            f"{name} オーナーアカウントの復旧リクエストを受け付けました。"
            "ログインメールにアクセスできない場合は、以下のボタンから復旧を続行してください。"
        )
        action_label = "アカウントを復旧"
        security_note = (
            "このメールに心当たりがない場合は無視してください。"
            "バックアップメールは通常のログインには使えません。"
        )
        expiry_text = f"このリンクの有効期限は{expiry_hours}時間です。"
        action_help_text = "ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください。"
    else:
        subject = f"Recover your {name} account"
        heading = subject
        intro = (
            f"We received a request to recover a {name} owner account using this "
            "verified backup email. If you lost access to your login email, continue below."
        )
        action_label = "Continue account recovery"
        security_note = (
            f"If you did not request this, you can ignore this email. "
            f"Backup email cannot be used for normal {name} Customer Login."
        )
        expiry_text = ""
        action_help_text = ""

    html_body, text_body = render_branded_email(
        heading=heading,
        intro=intro,
        action_label=action_label,
        action_url=url,
        security_note=security_note,
        expiry_hours=expiry_hours,
        language=resolved_language,
        expiry_text=expiry_text,
        action_help_text=action_help_text,
    )
    send_transactional_email(
        to_email=backup,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def send_account_recovery_primary_verification_email(
    user, *, uid, token, new_email, language=None
):
    name = product_name()
    url = frontend_url("recover-account/verify-primary", uid, token)
    resolved_language = _email_language(user, language)
    expiry_hours = _hours(getattr(settings, "ACCOUNT_RECOVERY_TIMEOUT", 3600))

    if resolved_language == "ja":
        subject = f"{name} 新しいログインメールを確認"
        heading = subject
        intro = (
            f"アカウント復旧のため、このアドレスを新しい {name} ログインメールとして確認してください。"
        )
        action_label = "ログインメールを確認"
        security_note = "心当たりがない場合は、このメールを無視してください。"
        expiry_text = f"このリンクの有効期限は{expiry_hours}時間です。"
        action_help_text = "ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください。"
    else:
        subject = f"Confirm your new {name} login email"
        heading = subject
        intro = (
            f"To finish recovering your {name} owner account, confirm this address "
            "as your new login email."
        )
        action_label = "Confirm login email"
        security_note = (
            f"If you did not start account recovery, you can ignore this email."
        )
        expiry_text = ""
        action_help_text = ""

    html_body, text_body = render_branded_email(
        heading=heading,
        intro=intro,
        action_label=action_label,
        action_url=url,
        security_note=security_note,
        expiry_hours=expiry_hours,
        language=resolved_language,
        expiry_text=expiry_text,
        action_help_text=action_help_text,
    )
    send_transactional_email(
        to_email=new_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def send_account_recovery_completed_notice(*, to_email, language=None):
    if not to_email:
        return
    name = product_name()
    resolved_language = normalize_language(language)
    login_url = frontend_url("login")

    if resolved_language == "ja":
        subject = f"{name} アカウント復旧が完了しました"
        heading = subject
        intro = (
            f"{name} オーナーアカウントの復旧が完了し、ログインメールとパスワードが更新されました。"
            "通常のサインイン画面から新しいログインメールでサインインしてください。"
        )
        action_label = "サインイン"
        security_note = (
            f"ご自身で復旧していない場合は、すぐに {name} サポートへ連絡してください。"
        )
    else:
        subject = f"Your {name} account was recovered"
        heading = subject
        intro = (
            f"Account recovery finished for a {name} owner account. The login email "
            "and password were updated. Sign in from the normal login screen with the "
            "new login email."
        )
        action_label = "Sign in"
        security_note = (
            f"If you did not recover this account, contact {name} support immediately."
        )

    html_body, text_body = render_branded_email(
        heading=heading,
        intro=intro,
        action_label=action_label,
        action_url=login_url,
        security_note=security_note,
        language=resolved_language,
    )
    send_transactional_email(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )
