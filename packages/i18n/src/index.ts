export type AppLocale = "en" | "ja";

export const SUPPORTED_LOCALES: AppLocale[] = ["en", "ja"];

type Dict = Record<string, string>;

const en: Dict = {
  "app.name": "CheckStation",
  "nav.home": "Home",
  "nav.groups": "Groups",
  "nav.people": "People",
  "nav.history": "History",
  "nav.more": "More",
  "nav.account": "Account",
  "nav.settings": "Settings",
  "nav.staff": "Staff",
  "nav.plan": "Plan",
  "nav.help": "Help",
  "nav.logout": "Log out",
  "auth.ownerSignIn": "Owner sign in",
  "auth.staffSignIn": "Staff sign in",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.workspaceId": "Workspace ID",
  "auth.username": "Username",
  "auth.signIn": "Sign in",
  "auth.twoFactor": "Two-factor code",
  "auth.continue": "Continue",
  "auth.oauthUnavailable": "Google/Apple sign-in needs native OAuth configuration (see APPS.md).",
  "common.loading": "Loading…",
  "common.retry": "Retry",
  "common.error": "Something went wrong",
  "common.empty": "Nothing here yet",
  "home.welcome": "Welcome",
  "home.plan": "Current plan",
  "groups.title": "Groups",
  "people.title": "People",
  "history.title": "History",
  "kiosk.title": "Kiosk",
  "kiosk.exit": "Exit kiosk",
  "kiosk.identify": "Identify",
  "kiosk.perform": "Confirm action",
  "account.title": "Account",
  "plan.title": "Plan & subscription",
  "plan.nativeBillingNote": "Native store billing comes later. Entitlements still come from the workspace API.",
  "help.title": "Help",
  "help.openDocs": "Open Docs",
  "help.openStatus": "Open Status",
};

const ja: Dict = {
  "app.name": "CheckStation",
  "nav.home": "ホーム",
  "nav.groups": "グループ",
  "nav.people": "メンバー",
  "nav.history": "履歴",
  "nav.more": "その他",
  "nav.account": "アカウント",
  "nav.settings": "設定",
  "nav.staff": "スタッフ",
  "nav.plan": "プラン",
  "nav.help": "ヘルプ",
  "nav.logout": "ログアウト",
  "auth.ownerSignIn": "オーナーログイン",
  "auth.staffSignIn": "スタッフログイン",
  "auth.email": "メールアドレス",
  "auth.password": "パスワード",
  "auth.workspaceId": "ワークスペースID",
  "auth.username": "ユーザー名",
  "auth.signIn": "ログイン",
  "auth.twoFactor": "二要素認証コード",
  "auth.continue": "続行",
  "auth.oauthUnavailable": "Google/AppleログインにはネイティブOAuth設定が必要です（APPS.md参照）。",
  "common.loading": "読み込み中…",
  "common.retry": "再試行",
  "common.error": "エラーが発生しました",
  "common.empty": "まだありません",
  "home.welcome": "ようこそ",
  "home.plan": "現在のプラン",
  "groups.title": "グループ",
  "people.title": "メンバー",
  "history.title": "履歴",
  "kiosk.title": "キオスク",
  "kiosk.exit": "キオスクを終了",
  "kiosk.identify": "本人確認",
  "kiosk.perform": "操作を確認",
  "account.title": "アカウント",
  "plan.title": "プランとサブスクリプション",
  "plan.nativeBillingNote": "ストア課金は後日対応します。権限情報はワークスペースAPIから取得します。",
  "help.title": "ヘルプ",
  "help.openDocs": "Docsを開く",
  "help.openStatus": "Statusを開く",
};

const catalogs: Record<AppLocale, Dict> = { en, ja };

export function resolveLocale(input?: string | null): AppLocale {
  const raw = String(input || "").toLowerCase();
  if (raw.startsWith("ja")) return "ja";
  return "en";
}

export function createTranslator(locale: AppLocale) {
  const dict = catalogs[locale] || catalogs.en;
  return function t(key: string, vars?: Record<string, string | number>): string {
    let text = dict[key] ?? catalogs.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return text;
  };
}

export function formatDateTime(value: string | Date, locale: AppLocale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
