export const DOCS_LOCALE_STORAGE_KEY = "checkstation.docs.locale";
export const SUPPORTED_LOCALES = ["en", "ja"];

export const DOCS_UI = {
  en: {
    searchPlaceholder: "Search CheckStation help...",
    searchLabel: "Search CheckStation help",
    clear: "Clear",
    loadingDocuments: "Loading documents…",
    loading: "Loading…",
    noPublishedDocuments: "No published documents.",
    onThisPage: "On this page",
    documentNotAvailable: "Document not available",
    documentNotPublished: "This page is not published.",
    docsUnavailable: "Documentation unavailable",
    docsUnavailableMessage:
      "The documentation service could not load canonical content. Try again shortly.",
    noMatchingAnswers: "No matching answers found.",
    noMatchingAnswersHint:
      "Try fewer words, or browse categories. You can also open Support.",
    noMatchingAnswersSupport: "Try fewer words, or browse popular categories below.",
    popularQuestions: "Popular questions",
    faqLede: "Find answers about CheckStation.",
    supportTitle: "CheckStation Support",
    supportLede: "How can we help?",
    popularCategories: "Popular categories",
    systemStatus: "System Status",
    statusUnavailable: "System status unavailable",
    stillNeedHelp: "Still need help?",
    contactHint:
      "If the answers above do not solve it, send a message from the CheckStation Contact page.",
    contactButton: "Contact CheckStation",
    helpUnavailable: "Help articles are not available right now.",
    openNav: "Open document navigation",
    languageMenuAria: "Language",
    languageActiveLabel: "Selected",
    docsKicker: "Docs",
    menuButton: "Menu",
    documentsNavAria: "Documents",
    faqCategoriesAria: "FAQ categories",
    relatedGuide: "Related guide",
    supportLink: "Support",
    versionLabel: "Version",
    effectiveLabel: "Effective",
    updatedLabel: "Updated",
    siteTitle: "CheckStation Docs",
    defaultDescription:
      "Public documentation and legal information for the Check Station platform.",
    localeLabels: {
      en: "English",
      ja: "日本語",
    },
    supportCategories: [
      { id: "getting_started", label: "Getting Started" },
      { id: "members_groups", label: "Members & Groups" },
      { id: "kiosk", label: "Kiosk" },
      { id: "plans", label: "Plans & Billing" },
      { id: "staff", label: "Staff & Permissions" },
      { id: "email", label: "Email & Notifications" },
      { id: "troubleshooting", label: "Troubleshooting" },
    ],
  },
  ja: {
    searchPlaceholder: "CheckStation ヘルプを検索...",
    searchLabel: "CheckStation ヘルプを検索",
    clear: "クリア",
    loadingDocuments: "ドキュメントを読み込み中…",
    loading: "読み込み中…",
    noPublishedDocuments: "公開されているドキュメントはありません。",
    onThisPage: "このページの内容",
    documentNotAvailable: "ドキュメントを利用できません",
    documentNotPublished: "このページは公開されていません。",
    docsUnavailable: "ドキュメントを利用できません",
    docsUnavailableMessage:
      "ドキュメントサービスで正規コンテンツを読み込めませんでした。しばらくしてから再度お試しください。",
    noMatchingAnswers: "一致する回答が見つかりませんでした。",
    noMatchingAnswersHint:
      "キーワードを減らすか、カテゴリを参照してください。サポートもご利用いただけます。",
    noMatchingAnswersSupport:
      "キーワードを減らすか、下の人気カテゴリを参照してください。",
    popularQuestions: "よくある質問",
    faqLede: "CheckStation に関する回答を見つけましょう。",
    supportTitle: "CheckStation サポート",
    supportLede: "お困りですか？",
    popularCategories: "人気のカテゴリ",
    systemStatus: "システムステータス",
    statusUnavailable: "システムステータスを取得できません",
    stillNeedHelp: "まだお困りですか？",
    contactHint:
      "上記の回答で解決しない場合は、CheckStation のお問い合わせページからメッセージをお送りください。",
    contactButton: "CheckStation にお問い合わせ",
    helpUnavailable: "現在、ヘルプ記事を利用できません。",
    openNav: "ドキュメントナビゲーションを開く",
    languageMenuAria: "言語",
    languageActiveLabel: "選択中",
    docsKicker: "Docs",
    menuButton: "メニュー",
    documentsNavAria: "ドキュメント",
    faqCategoriesAria: "FAQ カテゴリ",
    relatedGuide: "関連ガイド",
    supportLink: "サポート",
    versionLabel: "バージョン",
    effectiveLabel: "施行日",
    updatedLabel: "更新日",
    siteTitle: "CheckStation ドキュメント",
    defaultDescription:
      "Check Station プラットフォームの公開ドキュメントおよび法的情報。",
    localeLabels: {
      en: "English",
      ja: "日本語",
    },
    supportCategories: [
      { id: "getting_started", label: "はじめに" },
      { id: "members_groups", label: "メンバーとグループ" },
      { id: "kiosk", label: "キオスク" },
      { id: "plans", label: "プランとお支払い" },
      { id: "staff", label: "スタッフと権限" },
      { id: "email", label: "メールと通知" },
      { id: "troubleshooting", label: "トラブルシューティング" },
    ],
  },
};

export function docsUi(locale) {
  return DOCS_UI[SUPPORTED_LOCALES.includes(locale) ? locale : "en"] || DOCS_UI.en;
}

export function supportPopularCategories(locale) {
  return docsUi(locale).supportCategories || DOCS_UI.en.supportCategories;
}

export function formatMatchingAnswersCount(count, locale) {
  const n = Number(count) || 0;
  const lang = SUPPORTED_LOCALES.includes(locale) ? locale : "en";
  if (lang === "ja") {
    return `${n} 件の一致する回答`;
  }
  return `${n} matching ${n === 1 ? "answer" : "answers"}`;
}

export function resolveDocsLocale(pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "") || "/";
  const match = normalized.match(/^\/(en|ja)(?:\/|$)/);
  return match ? match[1] : null;
}

export function docsPathFor(slug, locale) {
  const lang = SUPPORTED_LOCALES.includes(locale) ? locale : "en";
  if (!slug || slug === "documentation") {
    return `/${lang}/`;
  }
  return `/${lang}/${slug}`;
}

export function saveDocsLocalePreference(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  try {
    const storage =
      typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : null;
    if (!storage) return;
    storage.setItem(DOCS_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
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
    const value = storage.getItem(DOCS_LOCALE_STORAGE_KEY);
    return SUPPORTED_LOCALES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function resolveInitialDocsLocale(pathname) {
  return (
    resolveDocsLocale(pathname) ||
    savedLocalePreference() ||
    browserLocale() ||
    "en"
  );
}
