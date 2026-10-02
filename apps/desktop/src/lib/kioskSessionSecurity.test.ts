import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  armKioskLockFromRestoredCredentials,
  clearAllKioskExitTokens,
  clearKioskExitToken,
  clearKioskExitTokensForWorkspace,
  hasKioskExitToken,
  loadKioskExitToken,
  loadKioskExitTokenPersistent,
  resetKioskExitCredentialMemoryForTests,
  saveKioskExitToken,
} from "./kioskExitCredential";
import {
  clearDesktopKioskActive,
  getDesktopKioskActiveGroupId,
  isDesktopKioskSessionExpired,
  setDesktopKioskActive,
} from "./kioskSessionLock";

const pageSource = readFileSync(fileURLToPath(new URL("../pages/KioskPage.tsx", import.meta.url)), "utf8");
const appSource = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
const providerSource = readFileSync(fileURLToPath(new URL("./AppProvider.tsx", import.meta.url)), "utf8");
const credentialSource = readFileSync(fileURLToPath(new URL("./kioskExitCredential.ts", import.meta.url)), "utf8");
const storeSource = readFileSync(
  fileURLToPath(new URL("../../electron/kioskExitCredentialStore.cjs", import.meta.url)),
  "utf8",
);

test("exit token is memory-scoped by group/workspace and never stores a raw PIN", () => {
  resetKioskExitCredentialMemoryForTests();
  clearAllKioskExitTokens();
  saveKioskExitToken(11, "token-a", { workspaceKey: "ws-1" });
  saveKioskExitToken(22, "token-b", { workspaceKey: "ws-1" });
  assert.equal(loadKioskExitToken(11, { workspaceKey: "ws-1" }), "token-a");
  assert.equal(loadKioskExitToken(22, { workspaceKey: "ws-1" }), "token-b");
  assert.equal(hasKioskExitToken(11, { workspaceKey: "ws-1" }), true);
  clearKioskExitToken(11, { workspaceKey: "ws-1" });
  assert.equal(loadKioskExitToken(11, { workspaceKey: "ws-1" }), null);
  assert.equal(loadKioskExitToken(22, { workspaceKey: "ws-1" }), "token-b");
  clearAllKioskExitTokens();
  assert.equal(loadKioskExitToken(22, { workspaceKey: "ws-1" }), null);

  assert.doesNotMatch(credentialSource, /exit_code|exitCode/);
  assert.doesNotMatch(storeSource, /exit_code|exitCode|password/);
  assert.match(credentialSource, /opaque server token/);
  assert.match(credentialSource, /never the[\s*]+exit PIN/);
  assert.match(storeSource, /safeStorage/);
  assert.match(storeSource, /encryption_unavailable/);
  assert.match(pageSource, /saveKioskExitToken\(groupId, issued/);
  assert.doesNotMatch(pageSource, /saveKioskExitToken\([^)]*exitCode/);
  assert.doesNotMatch(pageSource, /localStorage|sessionStorage/);
});

test("group A token cannot be used as group B credential storage", () => {
  clearAllKioskExitTokens();
  saveKioskExitToken("group-a", "scoped-a", { workspaceKey: "ws" });
  assert.equal(loadKioskExitToken("group-b", { workspaceKey: "ws" }), null);
  assert.equal(loadKioskExitToken("group-a", { workspaceKey: "ws" }), "scoped-a");
  clearAllKioskExitTokens();
});

test("workspace A token cannot appear under workspace B", () => {
  clearAllKioskExitTokens();
  saveKioskExitToken(7, "tok-a", { workspaceKey: "ws-a" });
  assert.equal(loadKioskExitToken(7, { workspaceKey: "ws-b" }), null);
  assert.equal(loadKioskExitToken(7, { workspaceKey: "ws-a" }), "tok-a");
  clearKioskExitTokensForWorkspace("ws-a");
  assert.equal(loadKioskExitToken(7, { workspaceKey: "ws-a" }), null);
});

test("kiosk start captures exit token and activates session lock gate", () => {
  assert.match(pageSource, /kiosk_exit_token/);
  assert.match(pageSource, /saveKioskExitToken/);
  assert.match(pageSource, /workspaceKey:/);
  assert.match(pageSource, /setDesktopKioskActive\(groupId\)/);
  assert.match(appSource, /kioskActiveGroupId/);
  assert.match(appSource, /authState\.status === "anonymous" && kioskActiveGroupId/);
  assert.match(appSource, /Navigate to=\{`\/kiosk\/\$\{kioskActiveGroupId\}`\}/);
  assert.match(providerSource, /hydrateKioskExitCredentialsFromDisk/);
  assert.match(providerSource, /armKioskLockFromRestoredCredentials/);
});

test("session expiry keeps kiosk locked and blocks attendance", () => {
  assert.match(pageSource, /markSessionExpired/);
  assert.match(pageSource, /isMissingCredentialsError/);
  assert.match(pageSource, /kiosk\.sessionExpired\.title/);
  assert.match(pageSource, /kiosk-session-expired/);
  assert.match(pageSource, /if \(sessionExpired\) return/);
  assert.match(pageSource, /sessionExpired \|\| !participant/);
  assert.match(appSource, /keep kiosk locked/i);
  assert.doesNotMatch(pageSource, /navigate\("\/sign-in"[\s\S]{0,40}markSessionExpired/);
});

test("expired-session exit sends token + PIN; wrong path stays locked", () => {
  const exit = pageSource.slice(pageSource.indexOf("async function exit("), pageSource.indexOf("function reset("));
  assert.match(exit, /loadKioskExitTokenPersistent\(groupId/);
  assert.match(exit, /kiosk_exit_token: scopedToken/);
  assert.match(exit, /exit_code: exitCode\.trim\(\)/);
  assert.match(exit, /group_id: Number\(groupId\)/);
  assert.match(exit, /recoveringFromExpiry/);
  assert.match(exit, /navigate\("\/sign-in"/);
  assert.match(exit, /clearKioskExitToken/);
  assert.match(exit, /clearDesktopKioskActive/);
  const catchBlock = exit.slice(exit.indexOf("} catch (caught)"));
  assert.doesNotMatch(catchBlock, /navigate\(/);
  assert.doesNotMatch(catchBlock, /clearDesktopKioskActive/);
  assert.match(catchBlock, /setExitError/);
});

test("credential clears on exit, logout, and workspace switch", () => {
  clearAllKioskExitTokens();
  setDesktopKioskActive(99);
  saveKioskExitToken(99, "tok", { workspaceKey: "ws" });
  clearKioskExitToken(99, { workspaceKey: "ws" });
  clearDesktopKioskActive(99);
  assert.equal(hasKioskExitToken(99, { workspaceKey: "ws" }), false);
  assert.equal(getDesktopKioskActiveGroupId(), null);

  assert.match(pageSource, /clearKioskExitToken\(groupId/);
  assert.match(pageSource, /clearAllKioskExitTokens/);
  assert.match(providerSource, /clearAllKioskExitTokens/);
  assert.match(providerSource, /clearKioskExitTokensForWorkspace/);
  assert.match(providerSource, /getDesktopKioskActiveGroupId\(\)/);
  assert.match(providerSource, /Session expiry while kiosk is active must keep the exit token/);
});

test("normal authenticated PIN exit still unlocks to workspace home", () => {
  const exit = pageSource.slice(pageSource.indexOf("async function exit("), pageSource.indexOf("function reset("));
  assert.match(exit, /auth\.applyKioskUnlock\(response\)/);
  assert.match(exit, /navigate\("\/", \{ replace: true \}\)/);
  assert.match(exit, /if \(recoveringFromExpiry\)/);
});

test("simulated restart: memory wipe + persistent restore arms lock and supplies token", async () => {
  resetKioskExitCredentialMemoryForTests();
  clearAllKioskExitTokens();

  const disk = new Map();
  const fakeBridge = {
    kioskExitCredentialSave: async (request: {
      workspaceKey: string;
      groupId: string;
      token: string;
    }) => {
      disk.set(`${request.workspaceKey}::${request.groupId}`, {
        token: request.token,
        workspaceKey: request.workspaceKey,
        groupId: request.groupId,
        savedAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
      return { ok: true };
    },
    kioskExitCredentialLoad: async (request: { workspaceKey: string; groupId: string }) =>
      disk.get(`${request.workspaceKey}::${request.groupId}`) || null,
    kioskExitCredentialList: async () => [...disk.values()],
    kioskExitCredentialClear: async (request: { workspaceKey?: string; groupId?: string } = {}) => {
      if (request.workspaceKey && request.groupId) {
        disk.delete(`${request.workspaceKey}::${request.groupId}`);
      } else if (request.workspaceKey) {
        for (const key of [...disk.keys()]) {
          if (key.startsWith(`${request.workspaceKey}::`)) disk.delete(key);
        }
      } else {
        disk.clear();
      }
      return { ok: true };
    },
  };

  (globalThis as { window?: unknown }).window = {
    checkstationDesktop: fakeBridge,
  };

  await saveKioskExitToken(55, "recover-token", { workspaceKey: "ws-cafe" });
  assert.equal(disk.size, 1);

  // Simulate app/renderer restart: wipe memory only.
  resetKioskExitCredentialMemoryForTests();
  assert.equal(loadKioskExitToken(55, { workspaceKey: "ws-cafe" }), null);

  const { hydrateKioskExitCredentialsFromDisk } = await import("./kioskExitCredential");
  const restored = await hydrateKioskExitCredentialsFromDisk();
  assert.equal(restored.primaryGroupId, "55");
  assert.equal(getDesktopKioskActiveGroupId(), "55");

  armKioskLockFromRestoredCredentials("anonymous");
  assert.equal(isDesktopKioskSessionExpired(), true);

  const token = await loadKioskExitTokenPersistent(55, { workspaceKey: "ws-cafe" });
  assert.equal(token, "recover-token");

  clearKioskExitToken(55, { workspaceKey: "ws-cafe" });
  assert.equal(disk.size, 0);
  assert.equal(await loadKioskExitTokenPersistent(55, { workspaceKey: "ws-cafe" }), null);

  clearAllKioskExitTokens();
  resetKioskExitCredentialMemoryForTests();
  delete (globalThis as { window?: unknown }).window;
});
