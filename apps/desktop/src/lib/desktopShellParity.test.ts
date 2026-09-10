import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const shell = readFileSync(fileURLToPath(new URL("../shell/DesktopShell.tsx", import.meta.url)), "utf8");
const dashboard = readFileSync(fileURLToPath(new URL("../pages/HomePage.tsx", import.meta.url)), "utf8");
const ui = readFileSync(fileURLToPath(new URL("../components/ui.tsx", import.meta.url)), "utf8");
const bell = readFileSync(fileURLToPath(new URL("../components/DesktopAnnouncementBell.tsx", import.meta.url)), "utf8");
const help = readFileSync(fileURLToPath(new URL("../pages/HelpPage.tsx", import.meta.url)), "utf8");

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
  assert.match(dashboard, /<ActionBadge action=\{item\.action\}/);
  assert.match(dashboard, /break_start/);
  assert.match(dashboard, /break_end/);
  assert.doesNotMatch(dashboard, /item\.action === "check_in" \? "→"/);
});
