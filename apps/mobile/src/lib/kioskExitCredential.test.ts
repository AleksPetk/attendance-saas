import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const liveSource = readFileSync(
  fileURLToPath(new URL("../../app/kiosk/[groupId].tsx", import.meta.url)),
  "utf8",
);
const credentialSource = readFileSync(
  fileURLToPath(new URL("./kioskExitCredential.ts", import.meta.url)),
  "utf8",
);
const providerSource = readFileSync(
  fileURLToPath(new URL("./AppProvider.tsx", import.meta.url)),
  "utf8",
);
const exitView = readFileSync(
  fileURLToPath(new URL("../../../../backend/attendance/views.py", import.meta.url)),
  "utf8",
);
const tokenModule = readFileSync(
  fileURLToPath(new URL("../../../../backend/attendance/kiosk_exit_token.py", import.meta.url)),
  "utf8",
);
const apiClient = readFileSync(
  fileURLToPath(new URL("../../../../packages/api/src/client.ts", import.meta.url)),
  "utf8",
);

test("kiosk start persists scoped exit token and exit submits it with PIN", () => {
  assert.match(liveSource, /saveKioskExitToken\(groupId, issued\)/);
  assert.match(liveSource, /kiosk_exit_token/);
  assert.match(liveSource, /loadKioskExitToken\(groupId\)/);
  assert.match(liveSource, /clearKioskExitToken\(groupId\)/);
  assert.match(liveSource, /router\.replace\("\/\(auth\)\/sign-in"\)/);
});

test("raw exit PIN is never written to SecureStore; only opaque token is", () => {
  assert.match(credentialSource, /SecureStore\.setItemAsync\(key, value\)/);
  assert.doesNotMatch(credentialSource, /exit_code|exitPin|exit_pin/i);
  assert.doesNotMatch(liveSource, /SecureStore\.setItemAsync\([^)]*exitCode/);
  assert.doesNotMatch(liveSource, /saveKioskExitToken\([^)]*exitCode/);
});

test("logout and workspace switch clear kiosk exit tokens", () => {
  assert.match(providerSource, /clearAllKioskExitTokens/);
  assert.match(credentialSource, /clearAllKioskExitTokens/);
});

test("backend exit accepts AllowAny plus scoped token path", () => {
  assert.match(exitView, /permission_classes = \[AllowAny\]/);
  assert.match(exitView, /kiosk_exit_token/);
  assert.match(exitView, /lookup_kiosk_exit_token/);
  assert.match(exitView, /session_recovery/);
  assert.match(tokenModule, /DEFAULT_KIOSK_EXIT_TOKEN_TTL_SECONDS = 30 \* 24 \* 60 \* 60/);
  assert.match(tokenModule, /secrets\.token_urlsafe\(32\)/);
  assert.match(tokenModule, /sha256/);
});

test("API client does not treat kiosk exit 401 as global session wipe loop", () => {
  assert.match(apiClient, /"\/kiosk\/exit\/"/);
});

test("session-expired UX remains locked until successful PIN exit", () => {
  assert.match(liveSource, /kiosk-session-expired/);
  assert.match(liveSource, /recoveringFromExpiry/);
  assert.doesNotMatch(liveSource, /offline.?queue|pendingCheckIn/i);
});
