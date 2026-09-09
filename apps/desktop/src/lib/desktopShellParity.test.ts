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
  assert.match(ui, /assets\/brand\/logo-mark\.png/);
  assert.match(ui, /export function BrandMark/);
  assert.match(shell, /label: t\("dashboard\.title"\)/);
  assert.doesNotMatch(shell, /label: t\("nav\.home"\)/);
  assert.match(shell, /DesktopAnnouncementBell/);
  assert.match(shell, /topbar-brand-logo/);
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
