import { canManageOwnerAccount, canManageStaffAccounts, canViewBilling, canViewGlobalMembers, canManageWorkspace } from "@checkstation/domain";
import type { WorkspaceSession } from "@checkstation/domain";
export type Copy = [string, string];
export type Step = { title: Copy; body: Copy; route: string; selector: string; tab?: number; reveal?: "member-edit" | "email-sender"; access?: "members" | "staff" | "account" | "plan" | "configure" };
export type Guide = { id: string; title: Copy; description: Copy; minutes: number; steps: Step[] };
const s = (title: Copy, body: Copy, route: string, selector: string, access?: Step["access"], tab?: number): Step => ({ title, body, route, selector, access, tab });
const members: Step[] = [
  s(["Reusable people", "共通のメンバー"], ["Members are reusable workspace profiles. The same Member can join several Groups.", "メンバーは共通プロフィールです。同じ人を複数のグループに追加できます。"], "/people", ".members-controls-head", "members"),
  s(["Search and filters", "検索と絞り込み"], ["Search name, contact details, or ID. Profile and sort refine results; Search applies and Clear resets.", "名前・連絡先・IDで検索できます。プロフィールと並び順で絞り込み、検索で適用、クリアでリセットします。"], "/people", ".members-filter-card", "members"),
  s(["Add a Member", "メンバーを追加"], ["Add member opens the name, contact, photo, and notes form. This guide will not create records.", "名前・連絡先・写真・メモを登録できます。このガイドでは実際のデータを作成しません。"], "/people", ".members-controls-head .button", "configure"),
  { ...s(["Profile and photo", "プロフィールと写真"], ["Open a Member to edit. The avatar camera menu changes or removes the photo. Save commits; Cancel discards.", "メンバーを開いて編集します。カメラメニューで写真を変更・削除できます。保存で確定、キャンセルで取り消します。"], "/people/$member", ".member-edit-profile", "members"), reveal: "member-edit" },
  s(["Archive and restore", "アーカイブと復元"], ["Archive is on the list. Archived Members can be restored. Group-specific emails and PINs do not edit the reusable profile.", "一覧からアーカイブし、アーカイブ済みから復元できます。グループ用メール・PINは共通プロフィールとは別の設定です。"], "/people", ".members-status-switch", "members"),
];
const groups = [
  s(["Group types and capacity", "グループ種類と利用枠"], ["Usage follows your plan. Standard Groups manage participants directly; Structured Groups organize participants into Classes.", "利用枠はプランに従います。通常グループは参加者を直接管理し、構造化グループはクラス単位で管理します。"], "/groups", ".groups-usage"),
  s(["Find or create a Group", "グループを探す・作成"], ["Use Active/Archived, search, type, and sort. Create Group follows existing permissions and plan limits.", "有効・アーカイブ、検索、種類、並び順で探せます。作成は既存の権限とプラン上限に従います。"], "/groups", ".groups-filter-card"),
  s(["Group cards", "グループカード"], ["Cards show Group ID, type, enabled actions, and participant counts. Open a card to manage the Group.", "カードにID・種類・有効アクション・参加者数が表示されます。開いて管理します。"], "/groups", ".groups-card-grid"),
  s(["Configuration", "設定"], ["Group Configuration owns name, attendance actions, email/PIN requirements, and notifications.", "名前・出席アクション・メール／PIN要件・通知はグループ設定で管理します。"], "/groups/$group", ".group-configuration", "configure", 2),
  s(["Participants", "参加者"], ["Add existing Members or Group-only Visitors. Group email overrides leave Member profiles unchanged. Structured participants belong to Classes.", "既存メンバーやグループ限定ビジターを追加します。グループ用メールは共通プロフィールを変更しません。構造化グループではクラス内で管理します。"], "/groups/$group", ".page > .card", undefined, 1),
  s(["Kiosk area", "キオスク"], ["Settings govern operation, Design governs appearance, and Launch requires readiness. Every client shares the same saved configuration.", "設定は動作、デザインは見た目を管理します。起動には準備完了が必要です。全アプリで同じ保存設定を共有します。"], "/groups/$group", ".page > .card-grid", undefined, 3),
];
const kiosks = [
  s(["Card or Input", "カード・入力"], ["Kiosk Settings selects Card or Input identification. The Group determines available email and PIN options.", "キオスク設定でカード・入力モードを選びます。メール・PINの選択肢はグループ設定に従います。"], "/groups/$group/kiosk-settings", ".desktop-kiosk-settings-grid", "configure"),
  s(["Exit code", "終了コード"], ["An exit code is required before launch. The saved code is never displayed. This is not a participant or Class PIN.", "起動前に終了コードが必要です。保存済みコードは表示されません。参加者PIN・クラスPINとは別です。"], "/groups/$group/kiosk-settings", ".kiosk-exit-configured, .kiosk-exit-editor", "configure"),
  s(["Identification", "本人識別"], ["Choose visible details and verification. Locked email/PIN options must first be enabled in Group Configuration.", "表示情報と本人確認を選びます。ロックされたメール・PIN項目は先にグループ設定で有効にします。"], "/groups/$group/kiosk-settings", ".kiosk-identification-columns, .kiosk-input-settings", "configure"),
  s(["Confirmation and reset", "確認画面とリセット"], ["Messages, return delay, sound, and vibration follow saved settings. Daily/Rolling reset defines attendance cycles; Reset now is a manual utility.", "メッセージ・戻り時間・音・振動は保存設定に従います。毎日・ローリングで出席サイクルを管理し、今すぐリセットは手動操作です。"], "/groups/$group/kiosk-settings", ".desktop-kiosk-settings-lower", "configure"),
  s(["Design and safe launch", "デザインと安全な起動"], ["Edit Kiosk Design opens the full-screen builder: Header, Main, Footer, and Cards/Input. Launch stays locked until ready. This tour never launches a live Kiosk.", "デザイン編集は全画面でヘッダー・メイン・フッター・カード／入力を編集します。準備完了まで起動はロックされ、このガイドでは起動しません。"], "/groups/$group", ".page > .card-grid", undefined, 3),
];
const history = [
  s(["Activity and attendance", "アクティビティと出席"], ["Activity Log records check-in, check-out, break start, and break end. Attendance Report summarizes real attendance records.", "ログにチェックイン・アウト・休憩開始・終了が記録されます。出席レポートは実データを集計します。"], "/history", ".page > .segmented", undefined, 0),
  s(["Find records", "記録を探す"], ["Filter by Group, action, search, and date. Rows show participant, Group, source, and the actual timestamp.", "グループ・アクション・検索・日付で絞り込みます。参加者・グループ・発生元・日時が表示されます。"], "/history", ".page > .card", undefined, 0),
  s(["Reports and exports", "レポートと出力"], ["Choose report mode, participant selection, and date range. PDF, Excel, and CSV use server-generated reports and desktop file saving.", "レポート種類・参加者・期間を選びます。PDF・Excel・CSVはサーバー生成レポートをデスクトップで保存します。"], "/history", ".page > .card", undefined, 1),
];
const email: Step[] = [
  s(["After-action emails", "アクション後のメール"], ["Group Configuration owns notifications. Options follow enabled actions and require a ready sender where applicable.", "通知はグループ設定で管理します。有効なアクションに従い、必要な場合は送信者の準備完了が必要です。"], "/groups/$group", ".after-action-settings", "configure", 2),
  { ...s(["Email sender", "メール送信者"], ["Expand Email sender to select Custom SMTP, Gmail, Microsoft 365, or Yahoo. Follow the existing test/save flow. This guide never asks for credentials or sends email.", "送信者を開いてカスタムSMTP・Gmail・Microsoft 365・Yahooを選び、テスト・保存手順に従います。このガイドでは認証情報を求めず、送信しません。"], "/groups/$group", ".email-sender-status", "configure", 2), reveal: "email-sender" },
  s(["Forwarding and overrides", "転送先とグループ用メール"], ["Forwarding supports up to three addresses. Participants also support Group email overrides without changing the linked Member profile.", "転送先は最大3件です。参加者のグループ用メール変更は、紐づくメンバープロフィールに影響しません。"], "/groups/$group", ".group-configuration-columns", "configure", 2),
];
const staff = [
  s(["Workspace ID", "ワークスペースID"], ["Staff use this ID, username, and password to sign in. Copy ID shares the real identifier.", "スタッフはこのID・ユーザー名・パスワードでログインします。IDコピーで正しいIDを共有できます。"], "/staff", ".staff-workspace-id-card", "staff"),
  s(["Admins and Staff", "管理者とスタッフ"], ["Usage comes from your plan. Accounts are grouped by role and active/inactive status. Create account keeps existing rules.", "利用枠はプランに従います。役割と有効・無効で分類され、作成は既存ルールに従います。"], "/staff", ".staff-controls-head", "staff"),
  s(["Group access and status", "グループ権限と状態"], ["Group chips summarize Staff access. Existing actions edit, reset passwords, deactivate/reactivate, and separately delete permanently. This guide performs none of them.", "グループチップにスタッフ権限が表示されます。編集・パスワードリセット・無効化／再有効化・完全削除は既存の操作です。このガイドでは行いません。"], "/staff", ".staff-account-groups", "staff"),
];
const account = [
  s(["Email and recovery", "メールと復旧"], ["Login and backup email verification state is shared with Workspace. Keep recovery details current.", "ログインメール・予備メールの確認状態はWorkspaceと共通です。復旧情報を最新に保ちましょう。"], "/account", ".desktop-account-email-grid", "account"),
  s(["Sign-in methods", "ログイン方法"], ["Password, Google, and Apple state comes from one account. Desktop OAuth availability is shown honestly; this guide does not connect or disconnect anything.", "パスワード・Google・Appleは同じアカウントの状態です。OAuth対応状況が表示され、このガイドでは連携を変更しません。"], "/account", ".desktop-account-email-grid + .card", "account"),
  s(["Password and 2FA", "パスワードと二要素認証"], ["Manage passwords, authenticator setup, and recovery codes here. Enabled 2FA protects desktop password login too. The guide never changes security settings.", "パスワード・認証アプリ・復旧コードを管理します。二要素認証はデスクトップログインも保護します。このガイドでは変更しません。"], "/account", ".desktop-account-security-summary", "account"),
  s(["Account deletion", "アカウント削除"], ["Account deletion is permanent and uses the existing confirmation flow. It is different from archiving Groups or deactivating Staff.", "アカウント削除は完全削除で確認手順が必要です。グループのアーカイブ・スタッフの無効化とは異なります。"], "/account", ".page > .card:last-of-type", "account"),
  s(["Plan and limits", "プランと利用枠"], ["Plan shows current access, subscription status, offers, and real limits. Desktop purchase controls are disabled; the guide cannot change billing.", "プランには利用権・契約状態・オファー・利用枠が表示されます。購入操作は無効で、このガイドから課金を変更できません。"], "/plan", ".desktop-plan-preview", "plan"),
];
const overview = [
  s(["Your desktop Workspace", "デスクトップWorkspace"], ["The sidebar keeps workspace areas within reach. This tour highlights real UI without changing your data.", "サイドバーから各機能へアクセスできます。このガイドは実際の画面を案内し、データを変更しません。"], "/", ".sidebar nav"),
  s(["Dashboard", "ダッシュボード"], ["Real counts and recent attendance give a quick workspace summary.", "実際の利用数と最近の出席から状況を確認できます。"], "/", ".stats"),
  members[0], groups[0], history[0], staff[0], account[0], account[4],
  s(["Help", "ヘルプ"], ["Replay desktop guides here. Resources, FAQ, and live System status are also available.", "操作ガイドを再実行できます。資料・FAQ・システム状態も確認できます。"], "/help", ".page > .segmented"),
  s(["Refresh", "更新"], ["Reload current page data without restarting the app.", "再起動せず現在のページのデータを再取得します。"], "/", ".desktop-refresh-trigger"),
  s(["Language", "言語"], ["The globe opens a selector. Explicitly choose English or 日本語.", "地球アイコンでメニューを開き、Englishまたは日本語を選びます。"], "/", ".desktop-language-trigger"),
  s(["Announcements", "お知らせ"], ["The bell shows real announcements and unread state.", "ベルに実際のお知らせと未読状態が表示されます。"], "/", ".workspace-announcement-bell", "account"),
  // Read configuration last so its existing leave guard is never triggered by a tour tab switch.
  groups[4], groups[5], kiosks[4], groups[3], history[2],
];
export const guides: Guide[] = [
  { id: "workspace-overview", title: ["Workspace Overview", "Workspaceの概要"], description: ["Meet the desktop workspace and how its parts fit together.", "デスクトップの各機能とつながりを確認します。"], minutes: 6, steps: overview },
  { id: "members", title: ["Members", "メンバー"], description: ["Profiles, photos, search, and archiving.", "プロフィール・写真・検索・アーカイブ。"], minutes: 2, steps: members },
  { id: "groups", title: ["Groups", "グループ"], description: ["Types, participants, configuration, and Kiosks.", "種類・参加者・設定・キオスク。"], minutes: 3, steps: [groups[0], groups[1], groups[2], groups[4], groups[5], groups[3]] },
  { id: "kiosks", title: ["Kiosks Overview", "キオスクの概要"], description: ["Settings, design, readiness, and safe launch.", "設定・デザイン・準備状態・安全な起動。"], minutes: 3, steps: kiosks },
  { id: "history", title: ["Attendance & History", "出席と履歴"], description: ["Activity, reports, filtering, and exports.", "アクティビティ・レポート・絞り込み・出力。"], minutes: 2, steps: history },
  { id: "email", title: ["Email & Notifications", "メールと通知"], description: ["Notification rules, senders, and email overrides.", "通知ルール・送信者・グループ用メール。"], minutes: 2, steps: email },
  { id: "staff", title: ["Staff & Permissions", "スタッフと権限"], description: ["Workspace ID, roles, access, and account status.", "ID・役割・権限・アカウント状態。"], minutes: 2, steps: staff },
  { id: "account", title: ["Account & Security", "アカウントとセキュリティ"], description: ["Recovery, sign-in methods, 2FA, and Plan.", "復旧・ログイン方法・二要素認証・プラン。"], minutes: 3, steps: account },
];
export function availableSteps(guide: Guide, session: WorkspaceSession | null | undefined) {
  const access = { members: canViewGlobalMembers(session), staff: canManageStaffAccounts(session), account: canManageOwnerAccount(session), plan: canViewBilling(session), configure: canManageWorkspace(session) };
  return guide.steps.filter(item => !item.access || access[item.access]);
}
export const completionId = (id: string) => "desktop-guide-" + id + "-v1";
export const dismissalId = "desktop-auto-onboarding-dismissed-v1";
export function shouldAutoStart(ids: string[], owner: boolean) { return owner && !ids.includes(dismissalId) && !ids.includes(completionId("workspace-overview")); }
export function bubblePosition(rect: DOMRect | null, width: number, height: number, viewport: { width: number; height: number }) {
  const gap = 16;
  let left = rect ? rect.right + gap : (viewport.width - width) / 2;
  if (left + width > viewport.width - gap) left = rect ? rect.left - width - gap : left;
  if (left < gap) left = (viewport.width - width) / 2;
  let top = rect ? rect.top : (viewport.height - height) / 2;
  if (rect && left < rect.right && left + width > rect.left) top = rect.bottom + gap + height < viewport.height ? rect.bottom + gap : rect.top - height - gap;
  return { left: Math.max(gap, Math.min(left, viewport.width - width - gap)), top: Math.max(gap, Math.min(top, viewport.height - height - gap)) };
}
