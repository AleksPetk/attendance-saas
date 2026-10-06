/**
 * Web kiosk load/error/timeout resilience (source + API exports).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ApiTimeoutError, KIOSK_REQUEST_TIMEOUT_MS } from "../api.js";

const root = dirname(fileURLToPath(import.meta.url));
const groupKioskSrc = readFileSync(join(root, "../GroupKioskScreen.jsx"), "utf8");
const apiSrc = readFileSync(join(root, "../api.js"), "utf8");
const kioskUiSrc = readFileSync(join(root, "kioskUi.jsx"), "utf8");
const enKiosk = JSON.parse(readFileSync(join(root, "../i18n/locales/en/kiosk.json"), "utf8"));
const jaKiosk = JSON.parse(readFileSync(join(root, "../i18n/locales/ja/kiosk.json"), "utf8"));

test("kiosk request timeout is 30 seconds and scoped to kiosk calls", () => {
  assert.equal(KIOSK_REQUEST_TIMEOUT_MS, 30_000);
  assert.match(apiSrc, /KIOSK_REQUEST_TIMEOUT_MS = 30_000/);
  assert.match(apiSrc, /const kioskRequestOptions = \{ timeoutMs: KIOSK_REQUEST_TIMEOUT_MS \}/);
  assert.match(apiSrc, /getGroupKioskStart:[\s\S]*kioskRequestOptions/);
  assert.match(apiSrc, /identifyKiosk:[\s\S]*kioskRequestOptions/);
  assert.match(apiSrc, /performKioskAction:[\s\S]*kioskRequestOptions/);
  assert.match(apiSrc, /enterKiosk:[\s\S]*kioskRequestOptions/);
  // Admin history/billing must not inherit the kiosk timeout option by default.
  assert.doesNotMatch(apiSrc, /listHistory:[\s\S]{0,80}kioskRequestOptions/);
  assert.doesNotMatch(apiSrc, /getBilling:[\s\S]{0,80}kioskRequestOptions/);
});

test("ApiTimeoutError carries a stable timeout code", () => {
  const err = new ApiTimeoutError();
  assert.equal(err.name, "ApiTimeoutError");
  assert.equal(err.code, "timeout");
  assert.equal(err.data.code, "timeout");
});

test("kioskErrorCopy maps timeout, setup-incomplete, and offline codes", () => {
  assert.match(kioskUiSrc, /code === "timeout"/);
  assert.match(kioskUiSrc, /group_setup_incomplete/);
  assert.match(kioskUiSrc, /failed to fetch/i);
  assert.match(kioskUiSrc, /errors\.timeoutTitle/);
  assert.match(kioskUiSrc, /errors\.setupIncompleteTitle/);
  assert.match(kioskUiSrc, /errors\.offlineTitle/);
  assert.equal(enKiosk.errors.timeoutTitle.length > 0, true);
  assert.equal(enKiosk.errors.setupIncompleteTitle.length > 0, true);
  assert.equal(enKiosk.errors.offlineTitle.length > 0, true);
  assert.equal(jaKiosk.errors.timeoutTitle.length > 0, true);
  assert.equal(enKiosk.live.retry, "Retry");
  assert.equal(jaKiosk.live.retry, "再試行");
});

test("load failure renders error panel with Retry and clears kiosk body", () => {
  assert.match(groupKioskSrc, /data-testid="kiosk-load-failure"/);
  assert.match(groupKioskSrc, /t\("live\.retry"\)/);
  assert.match(groupKioskSrc, /onClick=\{\(\) => \{\s*void load\(\);/);
  assert.match(groupKioskSrc, /!unavailable && !kiosk && error/);
  // Does not route to admin dashboard from load failure.
  assert.doesNotMatch(
    groupKioskSrc.slice(
      groupKioskSrc.indexOf("loadFailurePanel"),
      groupKioskSrc.indexOf("loadFailurePanel") + 500,
    ),
    /dashboard|StaffManagement|AccountScreen/,
  );
});

test("load catch clears kiosk and maps errors through kioskErrorCopy", () => {
  const loadBlock = groupKioskSrc.slice(
    groupKioskSrc.indexOf("async function load()"),
    groupKioskSrc.indexOf("useEffect(() => {\n    if (!groupId)"),
  );
  assert.match(loadBlock, /setKiosk\(null\)/);
  assert.match(loadBlock, /kioskErrorCopy\(err\)/);
  assert.match(loadBlock, /setUnavailable\(false\)/);
});

test("card people grid surfaces identify errors", () => {
  const startAt = groupKioskSrc.indexOf("people.length > 0 && step === \"start\"");
  assert.notEqual(startAt, -1);
  const peopleStart = groupKioskSrc.slice(startAt, startAt + 1200);
  assert.match(peopleStart, /<KioskInlineError error=\{error\} \/>/);
});

test("identify and perform clear busy flags in finally (timeout-safe)", () => {
  const identify = groupKioskSrc.slice(
    groupKioskSrc.indexOf("async function identifyCardParticipant"),
    groupKioskSrc.indexOf("async function handleCardTap"),
  );
  assert.match(identify, /finally \{\s*setIdentifying\(false\);/);

  const perform = groupKioskSrc.slice(
    groupKioskSrc.indexOf("async function performAction"),
    groupKioskSrc.indexOf("async function handleInputSubmit"),
  );
  assert.match(perform, /catch \(err\)[\s\S]*setStep\("confirm"\)/);
  assert.match(perform, /finally \{[\s\S]*setPerforming\(false\)/);
});

test("class_pin arms inactivity and clears PIN on timeout", () => {
  assert.match(
    groupKioskSrc,
    /participantSensitive = step === "pin"[\s\S]*\|\| step === "class_pin"/,
  );
  assert.match(groupKioskSrc, /setClassPin\(""\)/);
  assert.match(groupKioskSrc, /if \(step === "class_pin"\)/);
  assert.match(groupKioskSrc, /exitOpen/);
});
