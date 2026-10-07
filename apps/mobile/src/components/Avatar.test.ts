import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { shouldLoadProtectedMediaViaFetch } from "../lib/authenticatedMedia";

const avatarSource = readFileSync(fileURLToPath(new URL("./Avatar.tsx", import.meta.url)), "utf8");
const tabsSource = readFileSync(
  fileURLToPath(new URL("../../app/(app)/(tabs)/_layout.tsx", import.meta.url)),
  "utf8",
);
const appJson = readFileSync(fileURLToPath(new URL("../../app.json", import.meta.url)), "utf8");

test("Android loads protected avatars via authenticated fetch, not Image Cookie headers", () => {
  assert.equal(shouldLoadProtectedMediaViaFetch("android"), true);
  assert.equal(shouldLoadProtectedMediaViaFetch("ios"), false);
  assert.match(avatarSource, /loadAuthenticatedMediaDataUri/);
  assert.match(avatarSource, /shouldLoadProtectedMediaViaFetch\(Platform\.OS\)/);
});

test("iOS Avatar path still attaches Cookie headers on Image when cookies exist", () => {
  assert.match(avatarSource, /headers: useFetch \|\| !cookie \? undefined : \{ Cookie: cookie \}/);
});

test("failed or missing photos fall back to initials AvatarFallback", () => {
  assert.match(avatarSource, /AvatarFallback/);
  assert.match(avatarSource, /onError=\{\(\) => setImageFailed\(true\)\}/);
});

test("Android tab bar restores height and applies bottom safe-area inset only", () => {
  assert.match(tabsSource, /Platform\.OS === "android"/);
  assert.match(tabsSource, /height: TAB_BAR_CONTENT_HEIGHT \+ TAB_BAR_TOP_PAD \+ insets\.bottom/);
  assert.match(tabsSource, /paddingBottom: insets\.bottom/);
  assert.match(tabsSource, /\?\s*\{\s*height:[\s\S]*\}\s*:\s*null/);
});

test("Android adaptive icon background is white", () => {
  assert.match(appJson, /"adaptiveIcon"[\s\S]*"backgroundColor":\s*"#FFFFFF"/);
  assert.doesNotMatch(appJson, /"adaptiveIcon"[\s\S]*"backgroundColor":\s*"#071426"/);
});
