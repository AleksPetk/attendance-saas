"""Localized display strings for Status API and auto-incident templates."""

from status_service.components import COMPONENT_BY_ID, COMPONENTS
from status_service.locale import DEFAULT_LOCALE, normalize_locale
from status_service.states import (
    OVERALL_ALL_OPERATIONAL,
    OVERALL_MAJOR_OUTAGE,
    OVERALL_MAINTENANCE,
    OVERALL_PARTIAL_OUTAGE,
    OVERALL_SOME_DEGRADED,
    OVERALL_UNAVAILABLE,
    STATE_DEGRADED,
    STATE_MAJOR_OUTAGE,
    STATE_MAINTENANCE,
    STATE_OPERATIONAL,
    STATE_PARTIAL_OUTAGE,
    STATE_UNKNOWN,
)

COMPONENT_NAMES = {
    "en": {item["id"]: item["name"] for item in COMPONENTS},
    "ja": {
        "workspace_web_app": "ワークスペース Web アプリ",
        "api_backend": "API / バックエンド",
        "kiosk_operations": "キオスク運用",
        "authentication": "認証",
        "email_delivery": "メール配信",
        "billing_stripe": "お支払い / Stripe",
        "public_website": "公開ウェブサイト",
        "documentation": "ドキュメント",
    },
}

COMPONENT_STATE_LABELS = {
    "en": {
        STATE_OPERATIONAL: "Operational",
        STATE_DEGRADED: "Degraded performance",
        STATE_PARTIAL_OUTAGE: "Partial outage",
        STATE_MAJOR_OUTAGE: "Major outage",
        STATE_MAINTENANCE: "Scheduled maintenance",
        STATE_UNKNOWN: "Unknown",
    },
    "ja": {
        STATE_OPERATIONAL: "正常",
        STATE_DEGRADED: "パフォーマンス低下",
        STATE_PARTIAL_OUTAGE: "一部障害",
        STATE_MAJOR_OUTAGE: "重大な障害",
        STATE_MAINTENANCE: "メンテナンス中",
        STATE_UNKNOWN: "不明",
    },
}

OVERALL_LABELS = {
    "en": {
        OVERALL_ALL_OPERATIONAL: "All systems operational",
        OVERALL_SOME_DEGRADED: "Some systems degraded",
        OVERALL_PARTIAL_OUTAGE: "Partial outage",
        OVERALL_MAJOR_OUTAGE: "Major outage",
        OVERALL_MAINTENANCE: "Scheduled maintenance",
        OVERALL_UNAVAILABLE: "Status unavailable",
    },
    "ja": {
        OVERALL_ALL_OPERATIONAL: "すべてのシステムが正常です",
        OVERALL_SOME_DEGRADED: "一部の機能で問題が発生しています",
        OVERALL_PARTIAL_OUTAGE: "一部の機能で問題が発生しています",
        OVERALL_MAJOR_OUTAGE: "重大な障害が発生しています",
        OVERALL_MAINTENANCE: "メンテナンス中です",
        OVERALL_UNAVAILABLE: "ステータスを取得できません",
    },
}

INCIDENT_STATUS_LABELS = {
    "en": {
        "investigating": "Investigating",
        "identified": "Identified",
        "monitoring": "Monitoring",
        "resolved": "Resolved",
    },
    "ja": {
        "investigating": "調査中です",
        "identified": "原因を特定しました",
        "monitoring": "復旧状況を監視しています",
        "resolved": "復旧しました",
    },
}


KNOWN_PUBLIC_DESCRIPTIONS = {
    "en": {
        "Not configured": "Not configured",
        "Degraded response from this service": "Degraded response from this service",
        "This service is not responding normally": "This service is not responding normally",
    },
    "ja": {
        "Not configured": "未設定",
        "Degraded response from this service": "このサービスの応答が低下しています",
        "This service is not responding normally": "このサービスは正常に応答していません",
    },
}


def localize_public_description(description, locale=DEFAULT_LOCALE):
    text = str(description or "").strip()
    if not text:
        return ""
    lang = normalize_locale(locale)
    mapping = KNOWN_PUBLIC_DESCRIPTIONS.get(lang) or KNOWN_PUBLIC_DESCRIPTIONS[DEFAULT_LOCALE]
    return mapping.get(text, text)


def component_display_name(component_id, locale=DEFAULT_LOCALE):
    lang = normalize_locale(locale)
    names = COMPONENT_NAMES.get(lang) or COMPONENT_NAMES[DEFAULT_LOCALE]
    if component_id in names:
        return names[component_id]
    return COMPONENT_BY_ID.get(component_id, {}).get("name", "Service")


def public_component_label(state, locale=DEFAULT_LOCALE):
    lang = normalize_locale(locale)
    labels = COMPONENT_STATE_LABELS.get(lang) or COMPONENT_STATE_LABELS[DEFAULT_LOCALE]
    return labels.get(state, labels[STATE_UNKNOWN])


def overall_label(state, locale=DEFAULT_LOCALE):
    lang = normalize_locale(locale)
    labels = OVERALL_LABELS.get(lang) or OVERALL_LABELS[DEFAULT_LOCALE]
    return labels.get(state, labels[OVERALL_UNAVAILABLE])


def incident_status_label(value, locale=DEFAULT_LOCALE):
    lang = normalize_locale(locale)
    labels = INCIDENT_STATUS_LABELS.get(lang) or INCIDENT_STATUS_LABELS[DEFAULT_LOCALE]
    if value in labels:
        return labels[value]
    return str(value or "").replace("_", " ").title()


def auto_outage_title(component_id, locale=DEFAULT_LOCALE):
    name = component_display_name(component_id, locale)
    if normalize_locale(locale) == "ja":
        return f"{name}の障害"
    return f"{name} outage"


def auto_outage_summary(component_id, locale=DEFAULT_LOCALE):
    name = component_display_name(component_id, locale)
    if normalize_locale(locale) == "ja":
        return f"{name}で問題が発生しており、調査中です。"
    return f"We're investigating an issue affecting {name}."


def auto_recovery_message(component_id, locale=DEFAULT_LOCALE):
    name = component_display_name(component_id, locale)
    if normalize_locale(locale) == "ja":
        return f"{name}は復旧しました。"
    return f"{name} has recovered."
