export const STATUS_LOCALE_STORAGE_KEY = "checkstation.status.locale";
export const SUPPORTED_LOCALES = ["en", "ja"];

export const STATUS_UI = {
  en: {
    siteTitle: "CheckStation Status",
    siteDescription: "Live CheckStation service status.",
    systemStatus: "System Status",
    languageMenuAria: "Language",
    languageActiveLabel: "Selected",
    loadingStatus: "Loading status…",
    loading: "Loading…",
    checkingServices: "Checking services",
    componentsAria: "Components",
    activeIncidents: "Active incidents",
    recentIncidents: "Recent incidents",
    scheduledMaintenance: "Scheduled maintenance",
    noActiveIncidents: "No active incidents",
    noRecentIncidents: "No recent incidents",
    noScheduledMaintenance: "No scheduled maintenance",
    statusUnavailable: "Status unavailable",
    dataUnavailable: "Status data is unavailable.",
    liveDataUnavailable: "Live status data is not available.",
    allComponents: "All components",
    unknown: "Unknown",
    investigating: "Investigating",
    resolved: "Resolved",
    started: "Started",
    lasted: "Lasted",
    maintenanceInProgress: "Scheduled maintenance is in progress.",
    issueWithOne: "We're currently experiencing an issue with {{name}}.",
    issueWithTwo: "We're currently experiencing issues with {{a}} and {{b}}.",
    issueWithMany: "We're currently experiencing issues with {{leading}}, and {{last}}.",
    lastChecked: "Last checked {{time}}",
    lastCheckedNever: "Last checked — not yet checked",
    autoUpdate: "Auto-updates every {{count}} seconds",
    autoUpdateOne: "Auto-updates every 1 second",
    at: "at",
    justNow: "just now",
    inAMoment: "in a moment",
    minutesAgo: "{{count}} minutes ago",
    minuteAgo: "1 minute ago",
    hoursAgo: "{{count}} hours ago",
    hourAgo: "1 hour ago",
    daysAgo: "{{count}} days ago",
    dayAgo: "1 day ago",
    inMinutes: "in {{count}} minutes",
    inMinute: "in 1 minute",
    inHours: "in {{count}} hours",
    inHour: "in 1 hour",
    inDays: "in {{count}} days",
    inDay: "in 1 day",
    lessThanMinute: "less than a minute",
    minute: "1 minute",
    minutes: "{{count}} minutes",
    hour: "1 hour",
    hours: "{{count}} hours",
    investigatingAffecting: "We're investigating an issue affecting {{name}}.",
    hasRecovered: "{{name}} has recovered.",
    service: "Service",
    layerCore: "Core services",
    layerSupporting: "Supporting services",
    layerPeripheral: "Public services",
    localeLabels: {
      en: "English",
      ja: "日本語",
    },
  },
  ja: {
    siteTitle: "CheckStation ステータス",
    siteDescription: "CheckStation サービスの稼働状況。",
    systemStatus: "システムステータス",
    languageMenuAria: "言語",
    languageActiveLabel: "選択中",
    loadingStatus: "ステータスを読み込み中…",
    loading: "読み込み中…",
    checkingServices: "サービスを確認中",
    componentsAria: "コンポーネント",
    activeIncidents: "発生中のインシデント",
    recentIncidents: "最近のインシデント",
    scheduledMaintenance: "予定メンテナンス",
    noActiveIncidents: "発生中のインシデントはありません",
    noRecentIncidents: "最近のインシデントはありません",
    noScheduledMaintenance: "予定メンテナンスはありません",
    statusUnavailable: "ステータスを取得できません",
    dataUnavailable: "ステータスデータを取得できません。",
    liveDataUnavailable: "ライブのステータスデータを取得できません。",
    allComponents: "すべてのコンポーネント",
    unknown: "不明",
    investigating: "調査中です",
    resolved: "復旧しました",
    started: "開始",
    lasted: "継続時間",
    maintenanceInProgress: "メンテナンス中です。",
    issueWithOne: "{{name}} で問題が発生しています。",
    issueWithTwo: "{{a}} と {{b}} で問題が発生しています。",
    issueWithMany: "{{leading}}、および {{last}} で問題が発生しています。",
    lastChecked: "最終確認 {{time}}",
    lastCheckedNever: "最終確認 — 未確認",
    autoUpdate: "{{count}} 秒ごとに自動更新",
    autoUpdateOne: "1 秒ごとに自動更新",
    at: "",
    justNow: "たった今",
    inAMoment: "まもなく",
    minutesAgo: "{{count}} 分前",
    minuteAgo: "1 分前",
    hoursAgo: "{{count}} 時間前",
    hourAgo: "1 時間前",
    daysAgo: "{{count}} 日前",
    dayAgo: "1 日前",
    inMinutes: "{{count}} 分後",
    inMinute: "1 分後",
    inHours: "{{count}} 時間後",
    inHour: "1 時間後",
    inDays: "{{count}} 日後",
    inDay: "1 日後",
    lessThanMinute: "1 分未満",
    minute: "1 分",
    minutes: "{{count}} 分",
    hour: "1 時間",
    hours: "{{count}} 時間",
    investigatingAffecting: "{{name}} で問題が発生しており、調査中です。",
    hasRecovered: "{{name}} は復旧しました。",
    service: "サービス",
    layerCore: "コアサービス",
    layerSupporting: "サポートサービス",
    layerPeripheral: "公開サービス",
    localeLabels: {
      en: "English",
      ja: "日本語",
    },
  },
};

function normalizeLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : "en";
}

export function statusUi(locale) {
  return STATUS_UI[normalizeLocale(locale)] || STATUS_UI.en;
}

export function resolveStatusLocale(pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "") || "/";
  const match = normalized.match(/^\/(en|ja)(?:\/|$)/);
  return match ? match[1] : null;
}

export function statusPathFor(locale) {
  const lang = normalizeLocale(locale);
  return `/${lang}/`;
}

export function saveStatusLocalePreference(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  try {
    const storage =
      typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : null;
    if (!storage) return;
    storage.setItem(STATUS_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures.
  }
}

function browserLocale() {
  const raw = String(
    (typeof navigator !== "undefined" && navigator.language) || "",
  ).toLowerCase();
  if (raw.startsWith("ja")) return "ja";
  return "en";
}

function savedLocalePreference() {
  try {
    const storage =
      typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : null;
    if (!storage) return null;
    const value = storage.getItem(STATUS_LOCALE_STORAGE_KEY);
    return SUPPORTED_LOCALES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function resolveInitialStatusLocale(pathname) {
  return (
    resolveStatusLocale(pathname) ||
    savedLocalePreference() ||
    browserLocale() ||
    "en"
  );
}

export function fillTemplate(template, values = {}) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) =>
    values[key] == null ? "" : String(values[key]),
  );
}
