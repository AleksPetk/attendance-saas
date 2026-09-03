import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const profileSource = readFileSync(new URL("./MemberProfileScreen.jsx", import.meta.url), "utf8");
const createSource = readFileSync(new URL("./MemberCreateScreen.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./index.css", import.meta.url), "utf8");

test("Member profile exposes clear list and create actions", () => {
  assert.match(profileSource, /className="member-profile-nav"/);
  assert.match(profileSource, /className="btn-secondary"[\s\S]*name: "members"/);
  assert.match(profileSource, /className="btn-primary"[\s\S]*name: "member-create"/);
  assert.match(profileSource, /t\("profile\.back"\)/);
  assert.match(profileSource, /t\("profile\.addNewMember"\)/);
});

test("Add New Member reuses the fresh existing create form", () => {
  assert.match(createSource, /useState\(emptyMemberValues\)/);
  assert.match(createSource, /api\.createMember/);
  assert.doesNotMatch(profileSource, /prefill|copyMember|valuesFromMember\(member\).*member-create/);
});

test("Member profile actions distribute on desktop and stack on narrow screens", () => {
  assert.match(styles, /\.member-profile-nav \{[\s\S]*justify-content: space-between;[\s\S]*flex-wrap: wrap;/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.member-profile-nav \{[\s\S]*flex-direction: column;[\s\S]*align-items: stretch;/);
});
