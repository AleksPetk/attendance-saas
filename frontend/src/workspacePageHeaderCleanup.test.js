import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("Dashboard removes duplicate Overview/title/subtitle from page content", () => {
  const source = read("DashboardScreen.jsx");
  assert.doesNotMatch(source, /PageHeader/);
  assert.doesNotMatch(source, /dashboard\.eyebrow/);
  assert.doesNotMatch(source, /dashboard\.description/);
  assert.match(source, /dashboard-metrics/);
  assert.match(source, /PLACEMENT_DASHBOARD_BANNER/);
});

test("Members removes duplicate title and aligns Add Member with usage", () => {
  const source = read("MembersScreen.jsx");
  assert.doesNotMatch(source, /PageHeader/);
  assert.match(source, /members-usage-row/);
  assert.match(source, /members-usage-actions/);
  assert.match(source, /data-tutorial-target="members-add"/);
  assert.match(source, /members-usage/);
});

test("Groups removes duplicate title and aligns Create Group with usage", () => {
  const source = read("GroupsScreen.jsx");
  assert.doesNotMatch(source, /PageHeader/);
  assert.match(source, /groups-usage-row/);
  assert.match(source, /groups-usage-actions/);
  assert.match(source, /data-tutorial-target="groups-create"/);
  assert.match(source, /groups-usage/);
});

test("History removes duplicate page-content title", () => {
  const source = read("HistoryScreen.jsx");
  assert.doesNotMatch(source, /PageHeader/);
  assert.match(source, /history-view-switch/);
});

test("Staff header title is Staff and page content starts with usage", () => {
  const en = JSON.parse(read("i18n/locales/en/workspace.json"));
  const ja = JSON.parse(read("i18n/locales/ja/workspace.json"));
  assert.equal(en.pageTitles.staff, "Staff");
  assert.equal(ja.pageTitles.staff, "スタッフ");
  assert.equal(en.nav.staff, "Staff");
  const source = read("StaffManagementScreen.jsx");
  assert.doesNotMatch(source, /PageHeader/);
  assert.doesNotMatch(source, /staff:management\.descriptionOwner/);
  assert.doesNotMatch(source, /staff:management\.descriptionAdmin/);
  assert.match(source, /groups-usage staff-usage/);
  assert.match(source, /usePageTitle\("pageTitles\.staff"\)/);
});

test("Account removes duplicate page-content title and subtitle", () => {
  const source = read("AccountScreen.jsx");
  assert.doesNotMatch(source, /PageHeader/);
  assert.doesNotMatch(source, /accountSectionDescriptions/);
  assert.match(source, /AccountSubNav/);
});

test("Members and Groups usage actions wrap cleanly on narrow widths", () => {
  const styles = read("index.css");
  assert.match(styles, /\.members-usage-row,\s*\.groups-usage-row\s*\{/);
  assert.match(
    styles,
    /@media \(max-width: 720px\)\s*\{[\s\S]*?\.members-usage-actions,\s*\.groups-usage-actions\s*\{[\s\S]*?width:\s*100%;/,
  );
});
