import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const shell = readFileSync(fileURLToPath(new URL("../shell/DesktopShell.tsx", import.meta.url)), "utf8");
const dashboard = readFileSync(fileURLToPath(new URL("../pages/HomePage.tsx", import.meta.url)), "utf8");
const ui = readFileSync(fileURLToPath(new URL("../components/ui.tsx", import.meta.url)), "utf8");
const bell = readFileSync(fileURLToPath(new URL("../components/DesktopAnnouncementBell.tsx", import.meta.url)), "utf8");
const help = readFileSync(fileURLToPath(new URL("../pages/HelpPage.tsx", import.meta.url)), "utf8");
const members = readFileSync(fileURLToPath(new URL("../pages/PeoplePage.tsx", import.meta.url)), "utf8");
const memberDetail = readFileSync(fileURLToPath(new URL("../pages/MemberDetailPage.tsx", import.meta.url)), "utf8");
const groups = readFileSync(fileURLToPath(new URL("../pages/GroupsPage.tsx", import.meta.url)), "utf8");
const groupDetail = readFileSync(fileURLToPath(new URL("../pages/GroupDetailPage.tsx", import.meta.url)), "utf8");
const kioskSettings = readFileSync(fileURLToPath(new URL("../pages/KioskSettingsPage.tsx", import.meta.url)), "utf8");
const history = readFileSync(fileURLToPath(new URL("../pages/HistoryPage.tsx", import.meta.url)), "utf8");
const staff = readFileSync(fileURLToPath(new URL("../pages/StaffPage.tsx", import.meta.url)), "utf8");

test("desktop shell uses canonical branding, Dashboard terminology, and Workspace announcements", () => {
  assert.match(ui, /assets\/icon-ui\.png/);
  assert.match(ui, /export function BrandMark/);
  assert.match(shell, /label: t\("dashboard\.title"\)/);
  assert.doesNotMatch(shell, /label: t\("nav\.home"\)/);
  assert.match(shell, /DesktopAnnouncementBell/);
  assert.match(shell, /topbar-brand-logo/);
  assert.match(shell, /<Brand showMark=\{false\}/);
  assert.match(shell, /<div className="topbar-actions">[\s\S]*<DesktopAnnouncementBell[\s\S]*<BrandMark className="topbar-brand-logo"/);
  assert.match(shell, /className="topbar-copy"/);
  assert.match(shell, /className="topbar-eyebrow"/);
  assert.match(shell, /className="desktop-language-trigger"/);
  assert.match(shell, /className=\{`desktop-refresh-trigger/);
  assert.match(shell, /<div className="topbar-actions"><button aria-label="Refresh"[\s\S]*<DesktopLanguageMenu[\s\S]*<DesktopAnnouncementBell[\s\S]*<BrandMark/);
  assert.match(shell, /M20 11a8 8 0 1 0-2\.34 5\.66/);
  assert.doesNotMatch(shell, /M4 17v-5h5/);
  assert.doesNotMatch(shell, /window\.location\.reload\(\)/);
  assert.match(shell, /desktopRefresh.refresh\(\)/);
  assert.match(shell, /disabled=\{refreshing\}/);
  assert.match(shell, /title="Refresh"/);
  assert.match(shell, /<DesktopLanguageMenu locale=\{locale\} onSelect=\{setLocale\}/);
  assert.match(shell, /role="menuitemradio"/);
  assert.match(shell, /window\.addEventListener\("pointerdown"/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.doesNotMatch(shell, /onClick=\{\(\) => setLocale\(locale === "en" \? "ja" : "en"\)\}/);
  assert.match(shell, /session\?\.workspace\?\.identity/);
  assert.match(shell, /entitlements\?\.plan\?\.display_name/);
  assert.match(shell, /className="sidebar-account-email"/);
  assert.match(shell, />Sign out<\/button>/);
  assert.doesNotMatch(shell, /session\?\.workspace\?\.workspace_id/);
  assert.doesNotMatch(shell, />EN<\/Button>|>JA<\/Button>/);
  assert.match(bell, /endpoints\.announcements\(\)/);
  assert.match(bell, /mark-read\//);
  assert.match(shell, /state: \{ view: "status" \}/);
  assert.match(help, /location\.state/);
});

test("dashboard uses action badges instead of generic activity arrows", () => {
  assert.doesNotMatch(dashboard, /<PageHeader/);
  assert.doesNotMatch(dashboard, /t\("common\.retry"\)/);
  assert.match(dashboard, /<ActionBadge action=\{item\.action\}/);
  assert.match(dashboard, /break_start/);
  assert.match(dashboard, /break_end/);
  assert.doesNotMatch(dashboard, /item\.action === "check_in" \? "→"/);
});

test("desktop History uses the canonical action mapping in a scan-friendly activity list", () => {
  assert.doesNotMatch(history, /<PageHeader/);
  assert.match(history, /className="desktop-history-list"/);
  assert.match(history, /<ActionBadge action=\{action\}/);
  assert.match(history, /action === "check_in"/);
  assert.match(history, /action === "check_out"/);
  assert.match(history, /action === "break_start"/);
  assert.match(history, /action === "break_end"/);
  assert.match(history, /className="desktop-history-when"/);
  assert.doesNotMatch(history, /<Badge tone="blue">\{actionLabel/);
});

test("desktop Staff uses Workspace entitlements and organized account cards", () => {
  assert.doesNotMatch(staff, /<PageHeader/);
  assert.match(staff, /usage_totals\?\.workspace_admins/);
  assert.match(staff, /limits\?\.workspace_admins/);
  assert.match(staff, /usage_totals\?\.workspace_staff/);
  assert.match(staff, /limits\?\.workspace_staff/);
  assert.match(staff, /workspace\?\.workspace_id/);
  assert.match(staff, /navigator\.clipboard\.writeText\(workspaceId\)/);
  assert.match(staff, /staff\.activeAdmins/);
  assert.match(staff, /staff\.inactiveStaff/);
  assert.match(staff, /groupAccess\.slice\(0, 3\)/);
  assert.match(staff, /className="staff-account-card"/);
  assert.doesNotMatch(staff, /group_access\?\.map\(\(g\) => g\.name\)\.join/);
});

test("members page uses Workspace usage, views, and filter controls without a duplicate page heading", () => {
  assert.doesNotMatch(members, /<PageHeader/);
  assert.match(members, /usage_totals\?\.members/);
  assert.match(members, /limits\?\.members/);
  assert.match(members, /members\.activeMembers/);
  assert.match(members, /members\.archivedMembers/);
  assert.match(members, /value="with_email"/);
  assert.match(members, /value="without_phone"/);
  assert.match(members, /value="name_asc"/);
  assert.match(members, /value="name_desc"/);
});

test("desktop Add member uses a hidden photo input with an immediate avatar preview", () => {
  assert.match(members, /className="member-create-photo-button"/);
  assert.match(members, /photoInputRef\.current\?\.click\(\)/);
  assert.match(members, /URL\.createObjectURL\(file\)/);
  assert.match(members, /URL\.revokeObjectURL\(photoPreview\)/);
  assert.match(members, /className="member-create-photo-input"/);
  assert.doesNotMatch(members, /<Field error=\{fields\.photo\} label=\{t\("members\.choosePhoto"\)\}><Input/);
});

test("desktop Edit member uses a compact photo editor and keeps lifecycle actions on list rows", () => {
  assert.match(memberDetail, /className="card member-edit-profile"/);
  assert.match(memberDetail, /className="member-edit-sections"/);
  assert.match(memberDetail, /className="member-edit-photo-menu"/);
  assert.match(memberDetail, /members\.changePhoto/);
  assert.match(memberDetail, /members\.removePhoto/);
  assert.match(memberDetail, /URL\.createObjectURL\(file\)/);
  assert.match(memberDetail, /className="member-create-photo-input"/);
  assert.doesNotMatch(memberDetail, /danger-zone|function mutate/);
  assert.match(members, /lifecycle\(member, "archive"\)/);
  assert.match(members, /lifecycle\(member, "restore"\)/);
  assert.match(members, /lifecycle\(member, "permanently-delete"\)/);
});

test("desktop Groups uses entitlement usage and Workspace filter controls without a duplicate page heading", () => {
  assert.doesNotMatch(groups, /<PageHeader/);
  assert.match(groups, /usage_totals\?\.active_standard_groups/);
  assert.match(groups, /limits\?\.active_structured_groups/);
  assert.match(groups, /groups\.activeGroups/);
  assert.match(groups, /groups\.archivedGroups/);
  assert.match(groups, /value="participants_desc"/);
  assert.match(groups, /value="structured_first"/);
  assert.match(groups, /setType\("all"\)/);
  assert.match(groups, /setSort\("newest"\)/);
  assert.match(groups, /className="groups-card-grid"/);
  assert.match(groups, /enabledGroupActions\(group\.actions\)/);
  assert.match(groups, /groupParticipantCounts\(group\)/);
  assert.match(groups, /groups\.participantComposition/);
  assert.doesNotMatch(groups, /<DataRow/);
});

test("desktop Group Configuration uses the canonical email and lifecycle contracts", () => {
  assert.match(groupDetail, /className="group-configuration-columns"/);
  assert.match(groupDetail, /endpoints\.groupEmailSender\(groupId\)/);
  assert.match(groupDetail, /endpoints\.groupEmailSenderTest\(groupId\)/);
  assert.match(groupDetail, /advanced: \{ forward_emails: savedForwardEmails\(forwardEmails\) \}/);
  assert.match(groupDetail, /notifications, advanced:/);
  assert.match(groupDetail, /value="custom_smtp"/);
  assert.match(groupDetail, /value="gmail"/);
  assert.match(groupDetail, /value="microsoft"/);
  assert.match(groupDetail, /value="yahoo"/);
  assert.match(groupDetail, /groups\.reactivate/);
  assert.doesNotMatch(groupDetail, /className="danger-zone"/);
});

test("desktop Add participant uses canonical Group email and PIN fields", () => {
  assert.match(groupDetail, /participationEmailsForNewMember\(selected\)/);
  assert.match(groupDetail, /memberParticipationPayload\(Number\(memberId\), memberEmails, memberPin\)/);
  assert.match(groupDetail, /visitorParticipationPayload\(visitorName, visitorEmails, visitorPin\)/);
  assert.match(groupDetail, /endpoints\.groupAvailableMembers\(groupId\)/);
  assert.match(groupDetail, /groups\.addAnotherEmail/);
  assert.match(groupDetail, /MAX_PARTICIPATION_EMAILS/);
  assert.match(groupDetail, /required=\{group\.participation\.pin_required\}/);
  assert.doesNotMatch(groupDetail, /name: name\.trim\(\), email: email\.trim\(\)/);
});

test("desktop Add participant remains open, refreshes, resets, and confirms repeated adds", () => {
  assert.match(groupDetail, /<ParticipantCreate[\s\S]*onSaved=\{load\}/);
  assert.match(groupDetail, /submittingRef\.current/);
  assert.match(groupDetail, /setMemberId\(""\)/);
  assert.match(groupDetail, /setMemberEmails\(\[""\]\)/);
  assert.match(groupDetail, /setVisitorName\(""\)/);
  assert.match(groupDetail, /setVisitorEmails\(\[""\]\)/);
  assert.match(groupDetail, /await onSaved\(\)/);
  assert.match(groupDetail, /setTimeout\([\s\S]*1800/);
  assert.match(groupDetail, /<Alert tone="success">\{success\}<\/Alert>/);
});

test("desktop Kiosk launch uses server readiness before navigation", () => {
  assert.match(groupDetail, /kioskSettingsReadiness\(next\)/);
  assert.match(groupDetail, /isKioskLaunchBlocked/);
  assert.match(groupDetail, /await loadSettings\(\)/);
  assert.match(groupDetail, /groupSetupIssueSummary/);
  assert.match(groupDetail, /className="group-setup-summary"/);
  assert.doesNotMatch(groupDetail, /className="kiosk-readiness-warning"/);
  assert.match(groupDetail, /navigate\(`\/groups\/\$\{groupId\}\/kiosk-settings`\)/);
  assert.match(groupDetail, /disabled=\{launchBlocked\}/);
  assert.match(groupDetail, /navigate\(`\/kiosk\/\$\{groupId\}`\)/);
  assert.doesNotMatch(groupDetail, /<Button onClick=\{\(\) => navigate\(`\/kiosk\/\$\{groupId\}`\)\}/);
});

test("desktop Kiosk exit-code editor keeps both inputs aligned in one responsive row", () => {
  assert.match(kioskSettings, /className="kiosk-exit-format-hint"/);
  assert.match(kioskSettings, /className="kiosk-exit-inline-fields"/);
  assert.doesNotMatch(kioskSettings, /className="form-grid"><Field label=\{t\("kiosk\.newExitCode"\)\}/);
});
