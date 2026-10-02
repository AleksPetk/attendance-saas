import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const host = readFileSync(fileURLToPath(new URL("./ProductTourHost.tsx", import.meta.url)), "utf8");
const app = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
const styles = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");
const signIn = readFileSync(fileURLToPath(new URL("../pages/SignInPage.tsx", import.meta.url)), "utf8");

test("first-launch tour opens without waiting on localeSynced", () => {
  assert.match(host, /if \(!ready \|\| !prefsReady\) return;/);
  assert.doesNotMatch(
    host,
    /if \(!ready \|\| !prefsReady \|\| !localeSynced\) return;[\s\S]*setMode\("first-launch"\)/,
  );
  assert.match(host, /setMode\("first-launch"\)/);
});

test("App holds splash and login until required first-launch tour is open", () => {
  assert.match(app, /awaitingFirstTour/);
  assert.match(app, /!prefs\.seen/);
  assert.match(app, /open && mode === "first-launch"/);
  assert.match(app, /if \(awaitingFirstTour\) return;/);
  assert.match(app, /authState\.status === "unknown" \|\| awaitingFirstTour/);
});

test("Customer Login keeps What is CheckStation replay control", () => {
  assert.match(signIn, /openReplay\("replay-auth"\)/);
  assert.match(signIn, /auth-product-tour-link/);
  assert.match(signIn, /tourUi\.whatIsCheckStation/);
});

test("auth form column can shrink and scroll so the replay link stays reachable", () => {
  assert.match(styles, /\.auth-page\{height:100%;min-height:100%;/);
  assert.match(styles, /\.auth-form-side\{[^}]*min-height:0/);
  assert.match(styles, /align-items:safe center/);
});
