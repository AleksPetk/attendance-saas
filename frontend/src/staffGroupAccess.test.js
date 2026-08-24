/**
 * Run: node --test src/staffGroupAccess.test.js
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import { StaffGroupAccessPanel } from "./staffGroupAccess.js";
import {
  assignedGroupIds,
  clearStaffGroupSelection,
  filterStaffGroupAccessItems,
  groupAccessIsDirty,
  groupTypeBadgeLabel,
  restoreStaffGroupSelection,
  selectVisibleStaffGroups,
  selectedCountLabel,
  selectedGroupCount,
  staffGroupAccessEmptyMessage,
  toggleStaffGroupAssignment,
} from "./staffGroupAccess.js";

function groups() {
  return [
    { group_id: 1, name: "English Class", group_type: "standard", assigned: true },
    { group_id: 2, name: "Gym Members", group_type: "standard", assigned: false },
    { group_id: 3, name: "Kindergarten", group_type: "structured", assigned: true },
    { group_id: 4, name: "Summer Event", group_type: "standard", assigned: false },
  ];
}

function manyGroups(count) {
  return Array.from({ length: count }, (_, index) => ({
    group_id: index + 1,
    name: `Group ${String(index + 1).padStart(3, "0")}`,
    group_type: index % 5 === 0 ? "structured" : "standard",
    assigned: index < 3,
  }));
}

function renderPanel(overrides = {}) {
  const items = overrides.items || groups();
  return renderToStaticMarkup(
    createElement(StaffGroupAccessPanel, {
      username: "natsumi",
      items,
      baselineIds: assignedGroupIds(items),
      search: "",
      filter: "all",
      saving: false,
      savedNotice: "",
      onSearchChange() {},
      onFilterChange() {},
      onToggleGroup() {},
      onSelectVisible() {},
      onClearSelection() {},
      onSave() {},
      onCancel() {},
      ...overrides,
    }),
  );
}

test("search filters Groups by name case-insensitively", () => {
  const visible = filterStaffGroupAccessItems(groups(), { search: "kind", filter: "all" });
  assert.deepEqual(visible.map((item) => item.name), ["Kindergarten"]);
});

test("All/Selected/Unselected filters work", () => {
  const all = filterStaffGroupAccessItems(groups(), { filter: "all" });
  const selected = filterStaffGroupAccessItems(groups(), { filter: "selected" });
  const unselected = filterStaffGroupAccessItems(groups(), { filter: "unselected" });
  assert.equal(all.length, 4);
  assert.deepEqual(selected.map((item) => item.name), ["English Class", "Kindergarten"]);
  assert.deepEqual(unselected.map((item) => item.name), ["Gym Members", "Summer Event"]);
});

test("Standard and Structured filters work", () => {
  const standard = filterStaffGroupAccessItems(groups(), { filter: "standard" });
  const structured = filterStaffGroupAccessItems(groups(), { filter: "structured" });
  assert.equal(standard.length, 3);
  assert.deepEqual(structured.map((item) => item.name), ["Kindergarten"]);
});

test("selected count updates", () => {
  const afterToggle = toggleStaffGroupAssignment(groups(), 2);
  assert.equal(selectedGroupCount(groups()), 2);
  assert.equal(selectedGroupCount(afterToggle), 3);
  assert.equal(selectedCountLabel(3), "3 selected");
});

test("whole row toggles checkbox via labeled row", () => {
  const html = renderPanel();
  assert.match(html, /class="staff-group-access-row is-selected"/);
  assert.match(html, /aria-label="English Class"/);
  assert.match(html, /<label class="staff-group-access-row/);
});

test("Group type badge renders separately from the name", () => {
  const html = renderPanel();
  assert.match(html, /staff-group-access-name">English Class</);
  assert.match(html, /staff-group-access-type is-standard">Standard</);
  assert.match(html, /staff-group-access-type is-structured">Structured</);
  assert.doesNotMatch(html, /English Class\s*standard/i);
  assert.equal(groupTypeBadgeLabel("structured"), "Structured");
  assert.equal(groupTypeBadgeLabel("standard"), "Standard");
});

test("Select all visible only selects filtered Groups", () => {
  const visible = filterStaffGroupAccessItems(groups(), { search: "gym", filter: "all" });
  const next = selectVisibleStaffGroups(groups(), visible.map((item) => item.group_id));
  assert.equal(next.find((item) => item.group_id === 2).assigned, true);
  assert.equal(next.find((item) => item.group_id === 4).assigned, false);
  assert.equal(next.find((item) => item.group_id === 1).assigned, true);
});

test("Clear selection works", () => {
  const next = clearStaffGroupSelection(groups());
  assert.equal(selectedGroupCount(next), 0);
});

test("Save disabled when unchanged", () => {
  const items = groups();
  assert.equal(groupAccessIsDirty(items, assignedGroupIds(items)), false);
  const html = renderPanel({ items, baselineIds: assignedGroupIds(items) });
  assert.match(html, /disabled=""[^>]*>Save access/);
});

test("Save enabled when changed", () => {
  const items = toggleStaffGroupAssignment(groups(), 2);
  assert.equal(groupAccessIsDirty(items, [1, 3]), true);
  const html = renderPanel({ items, baselineIds: [1, 3] });
  assert.match(html, />Save access</);
  assert.doesNotMatch(html, /disabled=""[^>]*>Save access/);
});

test("Cancel restores saved state", () => {
  const draft = toggleStaffGroupAssignment(groups(), 2);
  const restored = restoreStaffGroupSelection(draft, [1, 3]);
  assert.deepEqual(assignedGroupIds(restored), [1, 3]);
  assert.equal(restored.find((item) => item.group_id === 2).assigned, false);
});

test("100 mocked Groups remain usable inside a scrollable list", () => {
  const items = manyGroups(100);
  const html = renderPanel({ items, baselineIds: assignedGroupIds(items) });
  assert.match(html, /class="staff-group-access-scroll"/);
  assert.match(html, /Group 100/);
  assert.equal((html.match(/staff-group-access-row/g) || []).length, 100);
  const gymOnly = filterStaffGroupAccessItems(items, { search: "group 00", filter: "all" });
  assert.ok(gymOnly.length < 100);
  assert.ok(gymOnly.length > 0);
});

test("empty states for no groups, search, and selected filter", () => {
  assert.equal(
    staffGroupAccessEmptyMessage({ workspaceHasGroups: false, visibleCount: 0 }),
    "No active Groups are available.",
  );
  assert.equal(
    staffGroupAccessEmptyMessage({
      workspaceHasGroups: true,
      visibleCount: 0,
      search: "zzz",
    }),
    "No Groups match your search.",
  );
  assert.equal(
    staffGroupAccessEmptyMessage({
      workspaceHasGroups: true,
      visibleCount: 0,
      filter: "selected",
    }),
    "No Groups selected.",
  );
});

test("filter buttons expose selected state", () => {
  const html = renderPanel({ filter: "selected" });
  assert.match(html, /aria-pressed="true"[^>]*>Selected</);
  assert.match(html, /Search groups/);
});
