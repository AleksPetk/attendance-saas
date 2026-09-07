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
  "auth.staffSignIn": "Staff login",
  "auth.staffPrompt": "Staff member?",
  "auth.newHere": "New here?",
  "auth.createAccount": "Create account",
  "auth.ownerPrompt": "Workspace owner?",
  "auth.customerLogin": "Customer login",
  "auth.customerTab": "Customer",
  "auth.staffTab": "Staff",
  "auth.signInType": "Sign-in type",
  "auth.ownerTitle": "Customer login",
  "auth.ownerLead": "Sign in as the paying workspace owner with your email and password.",
  "auth.staffTitle": "Staff login",
  "auth.staffLead": "Sign in with the Workspace ID, username, and password provided by your workspace owner.",
  "auth.workspaceIdHint": "Provided by your workspace owner. Not your email or company name.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.workspaceId": "Workspace ID",
  "auth.username": "Username",
  "auth.signIn": "Sign in",
  "auth.enterWorkspace": "Enter workspace",
  "auth.signingIn": "Signing in…",
  "auth.twoFactor": "Two-factor code",
  "auth.twoFactorTitle": "Two-factor authentication",
  "auth.twoFactorLead": "Enter the 6-digit code from your authenticator app.",
  "auth.continue": "Continue",
  "auth.verify": "Verify",
  "auth.forgotPassword": "Forgot password?",
  "auth.recoverAccount": "Lost access to your login email? Recover account",
  "auth.showPassword": "Show password",
  "auth.hidePassword": "Hide password",
  "auth.languageControl": "Change language",
  "auth.twoFactorRequired": "Enter your authenticator or recovery code.",
  "auth.authenticatorCodePlaceholder": "6-digit code",
  "auth.recoveryCodePlaceholder": "e.g. ABCD-EFGH",
  "auth.useAuthenticator": "Use an authenticator code",
  "auth.useRecovery": "Use a recovery code",
  "auth.oauthUnavailable": "Google/Apple sign-in needs native OAuth configuration (see APPS.md).",
  "auth.requiredOwnerFields": "Enter your email and password.",
  "auth.requiredStaffFields": "Enter your Workspace ID, username, and password.",
  "auth.invalidOwnerCredentials": "The email or password is incorrect.",
  "auth.invalidStaffCredentials": "The Workspace ID, username, or password is incorrect.",
  "auth.connectionError": "Unable to sign in. Check your connection and try again.",
  "auth.sessionError": "Your credentials were accepted, but the secure session could not be established. Please try again.",
  "auth.rateLimited": "Too many sign-in attempts. Please wait and try again.",
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
  "auth.staffPrompt": "スタッフの方ですか？",
  "auth.newHere": "初めてですか？",
  "auth.createAccount": "アカウントを作成",
  "auth.ownerPrompt": "ワークスペースオーナーですか？",
  "auth.customerLogin": "お客様ログイン",
  "auth.customerTab": "お客様",
  "auth.staffTab": "スタッフ",
  "auth.signInType": "サインインの種類",
  "auth.ownerTitle": "お客様ログイン",
  "auth.ownerLead": "有料ワークスペースオーナーとして、メールとパスワードでサインインします。",
  "auth.staffTitle": "スタッフログイン",
  "auth.staffLead": "ワークスペースオーナーから提供されたワークスペース ID、ユーザー名、パスワードでサインインします。",
  "auth.workspaceIdHint": "ワークスペースオーナーから提供されます。メールや会社名ではありません。",
  "auth.email": "メールアドレス",
  "auth.password": "パスワード",
  "auth.workspaceId": "ワークスペースID",
  "auth.username": "ユーザー名",
  "auth.signIn": "ログイン",
  "auth.enterWorkspace": "ワークスペースに入る",
  "auth.signingIn": "サインイン中…",
  "auth.twoFactor": "二要素認証コード",
  "auth.twoFactorTitle": "二段階認証",
  "auth.twoFactorLead": "認証アプリの 6 桁コードを入力してください。",
  "auth.continue": "続行",
  "auth.verify": "確認",
  "auth.forgotPassword": "パスワードをお忘れですか？",
  "auth.recoverAccount": "ログイン用メールにアクセスできませんか？アカウントを復旧",
  "auth.showPassword": "パスワードを表示",
  "auth.hidePassword": "パスワードを非表示",
  "auth.languageControl": "言語を変更",
  "auth.twoFactorRequired": "認証アプリまたはリカバリーコードを入力してください。",
  "auth.authenticatorCodePlaceholder": "6 桁のコード",
  "auth.recoveryCodePlaceholder": "例: ABCD-EFGH",
  "auth.useAuthenticator": "認証アプリのコードを使う",
  "auth.useRecovery": "リカバリーコードを使う",
  "auth.oauthUnavailable": "Google/AppleログインにはネイティブOAuth設定が必要です（APPS.md参照）。",
  "auth.requiredOwnerFields": "メールアドレスとパスワードを入力してください。",
  "auth.requiredStaffFields": "ワークスペース ID、ユーザー名、パスワードを入力してください。",
  "auth.invalidOwnerCredentials": "メールアドレスまたはパスワードが正しくありません。",
  "auth.invalidStaffCredentials": "ワークスペース ID、ユーザー名、またはパスワードが正しくありません。",
  "auth.connectionError": "サインインできません。接続を確認して、もう一度お試しください。",
  "auth.sessionError": "認証情報は確認されましたが、安全なセッションを確立できませんでした。もう一度お試しください。",
  "auth.rateLimited": "サインインの試行回数が多すぎます。しばらく待ってから、もう一度お試しください。",
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
