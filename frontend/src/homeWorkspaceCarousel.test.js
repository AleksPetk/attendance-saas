import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const homeSource = readFileSync(new URL("./PublicHomeScreen.jsx", import.meta.url), "utf8");
const imagesSource = readFileSync(
  new URL("./assets/home/homeImages.js", import.meta.url),
  "utf8",
);

test("workspace overview carousel reuses one implementation for EN and JA media", () => {
  assert.match(homeSource, /locale === "ja" \? homeWorkspaceJaImages : homeWorkspaceImages/);
  assert.match(homeSource, /window\.setTimeout\([\s\S]*5000/);
  assert.match(homeSource, /\[activeIndex, images\.length\]/);
  assert.match(homeSource, /onClick=\{\(\) => move\(-1\)\}/);
  assert.match(homeSource, /onClick=\{\(\) => move\(1\)\}/);
});

test("Japanese workspace carousel maps all four prepared screenshots", () => {
  assert.match(imagesSource, /homeWorkspaceJaImages = \[/);
  assert.match(imagesSource, /workspaceDashboardJa1200Webp/);
  assert.match(imagesSource, /workspaceMembersJa1200Webp/);
  assert.match(imagesSource, /workspaceGroupsJa1200Webp/);
  assert.match(imagesSource, /workspaceHistoryJa1200Webp/);
});
