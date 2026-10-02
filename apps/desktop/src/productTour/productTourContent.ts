import type { AppLocale } from "@checkstation/i18n";

export type ProductTourSlideId =
  | "platforms"
  | "simplicity"
  | "workspace"
  | "kiosk"
  | "email"
  | "plans"
  | "security";

export type ProductTourPlanCard = {
  name: string;
  badge?: string;
  body: string;
  bullets: string[];
  emphasis?: "lead" | "secondary";
};

export type ProductTourSlideCopy = {
  id: ProductTourSlideId;
  headline: string;
  body: string;
  banner?: string;
  points?: string[];
  plans?: ProductTourPlanCard[];
};

export type ProductTourVisualLabels = {
  platforms: {
    workspace: string;
    browser: string;
    desktop: string;
    tablet: string;
    phone: string;
  };
  simplicity: {
    dashboard: string;
    members: string;
    groups: string;
    history: string;
    kiosk: string;
    calloutNav: string;
    calloutActions: string;
    calloutSettings: string;
  };
  workspace: {
    dashboard: string;
    members: string;
    groups: string;
    recent: string;
    checkIn: string;
    checkOut: string;
    memberLabel: string;
    reused: string;
    standard: string;
    structured: string;
    classA: string;
    classB: string;
  };
  kiosk: {
    groupTitle: string;
    tapHint: string;
    editor: string;
    logo: string;
    background: string;
    colors: string;
    cardsInput: string;
    layout: string;
    actions: string;
  };
  email: {
    smtp: string;
    gmail: string;
    microsoft: string;
    yahoo: string;
    senderCard: string;
    connected: string;
    previewSubject: string;
    previewBody: string;
    afterAction: string;
    checkIn: string;
  };
  security: {
    owner: string;
    staff: string;
    twoStep: string;
    recovery: string;
    adminWorkspace: string;
    participantKiosk: string;
    roleOwner: string;
    roleStaff: string;
    privateLabel: string;
    focusedLabel: string;
    checkIn: string;
  };
};

export type ProductTourUiCopy = {
  skip: string;
  back: string;
  next: string;
  createAccount: string;
  signIn: string;
  languageLabel: string;
  progressLabel: (current: number, total: number) => string;
  brand: string;
  whatIsCheckStation: string;
  discoverCheckStation: string;
  discoverLead: string;
  discoverAction: string;
};

/**
 * Plan bullets mirror promo pricing.features + prior tour positioning without
 * hardcoded capacity numbers (see frontend promo locales pricing.features).
 */
const slidesEn: ProductTourSlideCopy[] = [
  {
    id: "platforms",
    headline: "CheckStation, everywhere you work.",
    body: "One attendance workspace across browser, desktop, tablet, and mobile. Keep your people, Groups, kiosks, and activity connected wherever you work.",
    banner: "One workspace. Every device.",
  },
  {
    id: "simplicity",
    headline: "Simple to use. Powerful when you need it.",
    body: "A clear interface keeps everyday work fast and easy, while flexible settings give you the control to shape CheckStation around your organization.",
    points: ["Clear navigation", "Fast everyday actions", "Flexible settings"],
  },
  {
    id: "workspace",
    headline: "Everything organized in one workspace.",
    body: "See recent activity from your Dashboard, create reusable Members, and organize them with Standard or Structured Groups that match the way your organization works.",
    banner: "See activity. Reuse people. Organize your way.",
  },
  {
    id: "kiosk",
    headline: "Your kiosk. Your brand. Your way.",
    body: "Create a kiosk that fits your organization with flexible layouts, branding, participant cards or code input, custom actions, backgrounds, colors, and more.",
    points: ["Your branding", "Your layout", "Your check-in flow"],
  },
  {
    id: "email",
    headline: "Send messages from your own email.",
    body: "Connect your organization’s email sender and automatically send the messages you choose after CheckStation actions.",
    banner: "Your sender. Your message. Automatically.",
  },
  {
    id: "plans",
    headline: "Start with CheckStation for free.",
    body: "Basic gives you a real CheckStation attendance setup at no cost. When your organization needs more features or capacity, Plus and Business are ready to grow with you.",
    banner: "Basic — Free",
    points: ["Start free. Grow when you need more."],
    plans: [
      {
        name: "Basic",
        badge: "Free",
        emphasis: "lead",
        body: "Keep a straightforward workspace running without a paid plan.",
        bullets: ["Kiosk check-in", "Action history", "Core CheckStation experience"],
      },
      {
        name: "Plus",
        emphasis: "secondary",
        body: "Expanded workspace tools for growing organizations.",
        bullets: [
          "Everything in Basic",
          "Workspace Staff management",
          "Attendance Report export",
          "Group Forward Emails",
        ],
      },
      {
        name: "Business",
        emphasis: "secondary",
        body: "Full CheckStation access for larger or more structured organizations.",
        bullets: [
          "Everything in Plus",
          "Structured Groups",
          "Higher Group and Member capacity",
          "Additional Admin and Staff seats",
        ],
      },
    ],
  },
  {
    id: "security",
    headline: "Secure for you. Simple for your team.",
    body: "Protect your workspace with secure sign-in, optional two-step verification, and recovery tools. Add staff accounts and give each person access only to the Groups they need.",
    points: ["Secure owner access", "Optional two-step verification", "Group-based staff access"],
  },
];

const slidesJa: ProductTourSlideCopy[] = [
  {
    id: "platforms",
    headline: "どこでも使える、CheckStation。",
    body: "ブラウザ、デスクトップ、タブレット、スマートフォンから、ひとつの出席管理ワークスペースを利用できます。メンバー、グループ、キオスク、アクション履歴をいつでも同じ環境で管理できます。",
    banner: "ひとつのワークスペースを、どのデバイスからでも。",
  },
  {
    id: "simplicity",
    headline: "かんたん操作。必要な機能はしっかり。",
    body: "わかりやすい画面で日々の操作をスムーズに。豊富な設定で、組織に合わせたCheckStation環境を作れます。",
    points: ["わかりやすいナビゲーション", "スムーズな日常操作", "柔軟な設定"],
  },
  {
    id: "workspace",
    headline: "必要な情報を、ひとつのワークスペースに。",
    body: "ダッシュボードで最新のアクションを確認し、再利用できるメンバーを登録。スタンダードグループや構造化グループで、組織に合った形に整理できます。",
    banner: "履歴を確認。メンバーを再利用。自由に整理。",
  },
  {
    id: "kiosk",
    headline: "あなたの組織だけのキオスクを。",
    body: "レイアウト、ロゴ、背景、色、参加者カードやコード入力、アクションなどを自由に設定。組織に合ったキオスクを作れます。",
    points: ["あなたのブランド", "あなたのレイアウト", "あなたのチェックインフロー"],
  },
  {
    id: "email",
    headline: "いつものメールから、自動でメッセージ送信。",
    body: "組織のメール送信元をCheckStationに接続し、アクション後に設定したメッセージを参加者へ自動送信できます。",
    banner: "あなたの送信元から、あなたのメッセージを自動送信。",
  },
  {
    id: "plans",
    headline: "CheckStationは無料ではじめられます。",
    body: "Basicなら、実際の出席管理を無料でスタートできます。より多くの機能や容量が必要になったときは、PlusやBusinessへアップグレードできます。",
    banner: "Basic — 完全無料",
    points: ["無料ではじめて、必要になったときにアップグレード。"],
    plans: [
      {
        name: "Basic",
        badge: "完全無料",
        emphasis: "lead",
        body: "有料プランなしでも、シンプルなワークスペースを運用できます。",
        bullets: ["キオスクチェックイン", "アクション履歴", "CheckStationの基本体験"],
      },
      {
        name: "Plus",
        emphasis: "secondary",
        body: "成長する組織向けに、ワークスペース機能を拡張。",
        bullets: [
          "Basicのすべて",
          "ワークスペーススタッフ管理",
          "出席レポートのエクスポート",
          "グループごとの転送メール",
        ],
      },
      {
        name: "Business",
        emphasis: "secondary",
        body: "より大規模・構造化された組織向けのフル機能。",
        bullets: [
          "Plusのすべて",
          "構造化グループ",
          "より高いグループ・メンバー上限",
          "追加の管理者・スタッフ席",
        ],
      },
    ],
  },
  {
    id: "security",
    headline: "安心のセキュリティ。スタッフにも使いやすく。",
    body: "安全なサインイン、二段階認証、アカウント復旧機能でワークスペースを保護。スタッフアカウントには、必要なグループだけアクセスを設定できます。",
    points: ["安全なオーナーアクセス", "二段階認証", "グループごとのスタッフアクセス"],
  },
];

const visualEn: ProductTourVisualLabels = {
  platforms: {
    workspace: "CheckStation Workspace",
    browser: "Browser",
    desktop: "Desktop",
    tablet: "Tablet",
    phone: "Phone",
  },
  simplicity: {
    dashboard: "Dashboard",
    members: "Members",
    groups: "Groups",
    history: "History",
    kiosk: "Kiosk",
    calloutNav: "Clear navigation",
    calloutActions: "Everyday actions",
    calloutSettings: "Flexible settings",
  },
  workspace: {
    dashboard: "Dashboard",
    members: "Members",
    groups: "Groups",
    recent: "Recent actions",
    checkIn: "Check-in",
    checkOut: "Check-out",
    memberLabel: "Members",
    reused: "Reusable across Groups",
    standard: "Standard Group",
    structured: "Structured Group",
    classA: "Class A",
    classB: "Class B",
  },
  kiosk: {
    groupTitle: "Studio Group",
    tapHint: "Tap your card",
    editor: "Kiosk Editor",
    logo: "Logo",
    background: "Background",
    colors: "Colors",
    cardsInput: "Cards / Input",
    layout: "Layout",
    actions: "Actions",
  },
  email: {
    smtp: "Custom SMTP",
    gmail: "Gmail",
    microsoft: "Microsoft",
    yahoo: "Yahoo",
    senderCard: "Organization sender",
    connected: "Connected",
    previewSubject: "You’re checked in",
    previewBody: "Thanks — your CheckStation action was recorded.",
    afterAction: "After action",
    checkIn: "Check-in",
  },
  security: {
    owner: "Workspace owner",
    staff: "Staff accounts",
    twoStep: "Two-step verification",
    recovery: "Recovery tools",
    adminWorkspace: "Admin workspace",
    participantKiosk: "Participant kiosk",
    roleOwner: "Owner",
    roleStaff: "Staff",
    privateLabel: "Private",
    focusedLabel: "Focused",
    checkIn: "Check-in",
  },
};

const visualJa: ProductTourVisualLabels = {
  platforms: {
    workspace: "CheckStation ワークスペース",
    browser: "ブラウザ",
    desktop: "デスクトップ",
    tablet: "タブレット",
    phone: "スマートフォン",
  },
  simplicity: {
    dashboard: "ダッシュボード",
    members: "メンバー",
    groups: "グループ",
    history: "履歴",
    kiosk: "キオスク",
    calloutNav: "わかりやすいナビ",
    calloutActions: "日常の操作",
    calloutSettings: "柔軟な設定",
  },
  workspace: {
    dashboard: "ダッシュボード",
    members: "メンバー",
    groups: "グループ",
    recent: "最近のアクション",
    checkIn: "チェックイン",
    checkOut: "チェックアウト",
    memberLabel: "メンバー",
    reused: "複数グループで再利用",
    standard: "スタンダードグループ",
    structured: "構造化グループ",
    classA: "クラス A",
    classB: "クラス B",
  },
  kiosk: {
    groupTitle: "スタジオグループ",
    tapHint: "カードをタップ",
    editor: "キオスクエディタ",
    logo: "ロゴ",
    background: "背景",
    colors: "カラー",
    cardsInput: "カード / 入力",
    layout: "レイアウト",
    actions: "アクション",
  },
  email: {
    smtp: "カスタム SMTP",
    gmail: "Gmail",
    microsoft: "Microsoft",
    yahoo: "Yahoo",
    senderCard: "組織の送信元",
    connected: "接続済み",
    previewSubject: "チェックイン完了",
    previewBody: "CheckStationでアクションが記録されました。",
    afterAction: "アクション後",
    checkIn: "チェックイン",
  },
  security: {
    owner: "ワークスペースオーナー",
    staff: "スタッフアカウント",
    twoStep: "二段階認証",
    recovery: "アカウント復旧",
    adminWorkspace: "管理ワークスペース",
    participantKiosk: "参加者キオスク",
    roleOwner: "オーナー",
    roleStaff: "スタッフ",
    privateLabel: "非公開",
    focusedLabel: "チェックイン専用",
    checkIn: "チェックイン",
  },
};

const uiEn: ProductTourUiCopy = {
  skip: "Skip",
  back: "Back",
  next: "Next",
  createAccount: "Create account",
  signIn: "Sign in",
  languageLabel: "Language",
  progressLabel: (current, total) => `Slide ${current} of ${total}`,
  brand: "CheckStation",
  whatIsCheckStation: "What is CheckStation?",
  discoverCheckStation: "Discover CheckStation",
  discoverLead: "A short product introduction — separate from Guided Help.",
  discoverAction: "Open product tour",
};

const uiJa: ProductTourUiCopy = {
  skip: "スキップ",
  back: "戻る",
  next: "次へ",
  createAccount: "アカウント作成",
  signIn: "ログイン",
  languageLabel: "言語",
  progressLabel: (current, total) => `${current} / ${total}`,
  brand: "CheckStation",
  whatIsCheckStation: "CheckStationとは？",
  discoverCheckStation: "CheckStationを知る",
  discoverLead: "製品紹介ツアーです。ガイド付きヘルプとは別です。",
  discoverAction: "製品ツアーを開く",
};

export const PRODUCT_TOUR_SLIDE_COUNT = slidesEn.length;

export function productTourSlides(locale: AppLocale): ProductTourSlideCopy[] {
  return locale === "ja" ? slidesJa : slidesEn;
}

export function productTourUi(locale: AppLocale): ProductTourUiCopy {
  return locale === "ja" ? uiJa : uiEn;
}

export function productTourVisualLabels(locale: AppLocale): ProductTourVisualLabels {
  return locale === "ja" ? visualJa : visualEn;
}
