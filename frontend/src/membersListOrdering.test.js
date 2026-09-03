import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterAndSortMembers,
  isMemberPlanLocked,
  partitionMembersByPlanAvailability,
} from "./membersListOrdering.js";

const filterMembers = [
  { id: 1, name: "Beta", email: "beta@example.com", phone: "", created_at: "2026-01-02T00:00:00Z" },
  { id: 2, name: "Alpha", email: "", phone: "090-0000", created_at: "2026-01-03T00:00:00Z" },
  { id: 3, name: "Zulu", email: "zulu@example.com", phone: "090-1111", created_at: "2026-01-01T00:00:00Z" },
  { id: 4, name: "Delta", email: "", phone: "", created_at: "2026-01-04T00:00:00Z" },
];

test("Members reuse the Groups responsive toolbar and segmented view patterns", () => {
  const source = readFileSync(new URL("./MembersScreen.jsx", import.meta.url), "utf8");
  assert.match(source, /history-view-switch groups-view-switch members-view-switch/);
  assert.match(source, /groups-toolbar members-toolbar card-surface/);
  assert.doesNotMatch(source, /<select value=\{statusFilter\}/);
});

test("partitionMembersByPlanAvailability keeps unlocked first semantics", () => {
  const members = [
    { id: 1, name: "Zulu Locked", plan_unlocked: false },
    { id: 2, name: "Alpha Available", plan_unlocked: true },
    { id: 3, name: "Mike Available", is_plan_locked: false },
    { id: 4, name: "Beta Locked", is_plan_locked: true },
  ];
  const { available, locked } = partitionMembersByPlanAvailability(members);
  assert.deepEqual(
    available.map((item) => item.id),
    [2, 3],
  );
  assert.deepEqual(
    locked.map((item) => item.id),
    [1, 4],
  );
  assert.equal(isMemberPlanLocked(locked[0]), true);
  assert.equal(isMemberPlanLocked(available[0]), false);
});

test("Members sort by creation time and canonical name fields", () => {
  assert.deepEqual(
    filterAndSortMembers(filterMembers, { sort: "newest" }).map((member) => member.name),
    ["Delta", "Alpha", "Beta", "Zulu"],
  );
  assert.deepEqual(
    filterAndSortMembers(filterMembers, { sort: "oldest" }).map((member) => member.name),
    ["Zulu", "Beta", "Alpha", "Delta"],
  );
  assert.deepEqual(
    filterAndSortMembers(filterMembers, { sort: "name_asc" }).map((member) => member.name),
    ["Alpha", "Beta", "Delta", "Zulu"],
  );
  assert.deepEqual(
    filterAndSortMembers(filterMembers, { sort: "name_desc" }).map((member) => member.name),
    ["Zulu", "Delta", "Beta", "Alpha"],
  );
});

test("Member Profile filters use canonical email and phone fields", () => {
  assert.deepEqual(
    filterAndSortMembers(filterMembers, { profile: "with_email", sort: "name_asc" }).map(
      (member) => member.name,
    ),
    ["Beta", "Zulu"],
  );
  assert.deepEqual(
    filterAndSortMembers(filterMembers, { profile: "without_email", sort: "name_asc" }).map(
      (member) => member.name,
    ),
    ["Alpha", "Delta"],
  );
  assert.deepEqual(
    filterAndSortMembers(filterMembers, { profile: "with_phone", sort: "name_asc" }).map(
      (member) => member.name,
    ),
    ["Alpha", "Zulu"],
  );
  assert.deepEqual(
    filterAndSortMembers(filterMembers, { profile: "without_phone", sort: "name_asc" }).map(
      (member) => member.name,
    ),
    ["Beta", "Delta"],
  );
});

test("server search results combine cleanly with Profile filtering and sorting", () => {
  const searchedMembers = filterMembers.filter((member) => member.name.toLowerCase().includes("a"));
  assert.deepEqual(
    filterAndSortMembers(searchedMembers, { profile: "without_email", sort: "name_desc" }).map(
      (member) => member.name,
    ),
    ["Delta", "Alpha"],
  );
});
