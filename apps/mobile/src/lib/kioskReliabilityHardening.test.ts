import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isMissingCredentialsError, ApiError } from "@checkstation/api";

const liveSource = readFileSync(
  fileURLToPath(new URL("../../app/kiosk/[groupId].tsx", import.meta.url)),
  "utf8",
);
const exitView = readFileSync(
  fileURLToPath(new URL("../../../../backend/attendance/views.py", import.meta.url)),
  "utf8",
);
const i18n = readFileSync(
  fileURLToPath(new URL("../../../../packages/i18n/src/index.ts", import.meta.url)),
  "utf8",
);

test("live kiosk wires AppState foreground refresh and one soft-refresh interval", () => {
  assert.match(liveSource, /AppState\.addEventListener\("change"/);
  assert.match(liveSource, /shouldRefreshOnForeground/);
  assert.match(liveSource, /KIOSK_SOFT_REFRESH_MS/);
  assert.match(liveSource, /setInterval/);
  assert.match(liveSource, /clearInterval\(timer\)/);
  assert.match(liveSource, /sub\.remove\(\)/);
  assert.match(liveSource, /refreshKiosk/);
  assert.match(liveSource, /pendingSoftRefresh/);
  assert.match(liveSource, /lastRefreshAtRef/);
  assert.match(liveSource, /wasBackgroundedRef/);
  assert.doesNotMatch(liveSource, /expo-keep-awake|keepAwake|activateKeepAwake/);
  assert.doesNotMatch(liveSource, /offline.?queue|pendingCheckIn|actionQueue/i);
});

test("soft refresh preserves prior state on failure and defers while busy", () => {
  assert.match(liveSource, /Soft refresh failures keep last successful kiosk content/);
  assert.match(liveSource, /isKioskRefreshIdle/);
  assert.match(liveSource, /resolveStructuredClassAfterRefresh/);
});

test("session expiry locks kiosk UI and does not dump into workspace", () => {
  assert.match(liveSource, /sessionExpired/);
  assert.match(liveSource, /kiosk-session-expired/);
  assert.match(liveSource, /kiosk\.sessionExpired\.title/);
  assert.match(liveSource, /markSessionExpired/);
  assert.match(liveSource, /isMissingCredentialsError/);
  assert.doesNotMatch(liveSource, /router\.replace\("\/\(app\)\/\(tabs\)\/home"\)[\s\S]{0,80}sessionExpired/);
  assert.match(i18n, /"kiosk\.sessionExpired\.title": "Session expired"/);
  assert.match(i18n, /"kiosk\.sessionExpired\.body": "An administrator needs to sign in again\."/);
  assert.match(i18n, /セッションの有効期限が切れました/);
  assert.match(i18n, /管理者が再度ログインする必要があります/);
});

test("exit PIN remains required and raw PIN is not persisted", () => {
  assert.match(liveSource, /endpoints\.kioskExit\(\)/);
  assert.match(liveSource, /exit_code: exitCode\.trim\(\)/);
  assert.doesNotMatch(liveSource, /SecureStore\.setItemAsync\([^)]*exitCode/);
  assert.doesNotMatch(liveSource, /AsyncStorage\.setItem\([^)]*exit/i);
  assert.doesNotMatch(liveSource, /exit_code_hash|exitCodeHash/);
  assert.match(exitView, /class GroupKioskExitView/);
  assert.match(exitView, /permission_classes = \[AllowAny\]/);
  assert.match(exitView, /check_exit_code/);
  assert.match(exitView, /kiosk_exit_token/);
});

test("session-expiry exit uses scoped kiosk credential with PIN", () => {
  assert.match(liveSource, /saveKioskExitToken/);
  assert.match(liveSource, /loadKioskExitToken/);
  assert.match(liveSource, /kiosk_exit_token: scopedToken/);
  assert.match(liveSource, /recoveringFromExpiry/);
  assert.match(liveSource, /router\.replace\("\/\(auth\)\/sign-in"\)/);
});

test("missing credentials helper recognizes session-expired API errors", () => {
  assert.equal(
    isMissingCredentialsError(
      new ApiError({
        status: 401,
        data: { detail: "Authentication credentials were not provided." },
        path: "/api/groups/1/kiosk/",
        method: "GET",
      }),
    ),
    true,
  );
  assert.equal(
    isMissingCredentialsError(
      new ApiError({
        status: 400,
        data: { detail: "bad" },
        path: "/api/groups/1/kiosk/perform/",
        method: "POST",
      }),
    ),
    false,
  );
});

test("media cache is namespaced and cleared on logout/account switch", () => {
  const provider = readFileSync(
    fileURLToPath(new URL("./AppProvider.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(provider, /clearAllKioskMediaCache/);
  assert.match(provider, /clearKioskMediaCacheForWorkspace/);
  assert.match(liveSource, /workspaceMediaKey/);
  assert.match(liveSource, /workspaceKey:\s*workspaceMediaKey/);
});
