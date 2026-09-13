import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiClient } from "@checkstation/api";
import { AuthController } from "@checkstation/auth";
import { createAppConfig } from "@checkstation/config";

const account = readFileSync(new URL("../pages/AccountPage.tsx", import.meta.url), "utf8");
const security = readFileSync(new URL("../components/AccountSecurity.tsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("../pages/SecurityPage.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../pages/SignInPage.tsx", import.meta.url), "utf8");

test("Account uses canonical account state and removes duplicate heading and language settings", () => {
  assert.match(account, /endpoints\.account\(\)/);
  assert.match(account, /window\.addEventListener\("focus"/);
  assert.doesNotMatch(account, /PageHeader|setLocale|more\.language/);
  assert.match(account, /accountPrimaryEmail|accountBackupEmailRemove/);
  assert.match(account, /AccountSecurity account=\{account\}/);
});

test("Account sign-in methods and sensitive operations preserve browser contracts", () => {
  assert.match(security, /can_unlink_\$\{provider\}/);
  assert.match(security, /provider_email/);
  assert.match(security, /\/auth\/account\/delete\//);
  assert.match(security, /\/auth\/\$\{action\}\/unlink\//);
  assert.match(security, /confirmation\.trim\(\) !== "DELETE"/);
  assert.match(security, /window\.confirm\(text\.finalDeleteConfirmation\)/);
  assert.match(security, /current_password: password/);
  assert.match(security, /two_factor_status === "enabled" \? \{ \[codeType\]: code \}/);
  assert.match(security, /if \(isDelete\) await auth\.logout\(\)/);
  assert.doesNotMatch(security, /window\.open|openExternal|localStorage/);
});

test("Account reuses production 2FA setup and login challenge endpoints", () => {
  for (const endpoint of ["ownerTwoFactorSetup", "ownerTwoFactorVerify", "ownerTwoFactorRegenerate", "ownerTwoFactorDisable", "changePassword"]) assert.match(modal, new RegExp(`endpoints\\.${endpoint}\\(`));
  assert.match(modal, /qr_data_uri/);
  assert.match(modal, /setup_key/);
  assert.match(modal, /recovery_codes/);
  assert.match(modal, /!setup \? <Segmented/);
  assert.match(login, /authState\.status === "needs_2fa"/);
  assert.match(login, /auth\.completeOwnerTwoFactor\(recovery \? \{ recovery_code:/);
});

test("owner first factor cannot enter Workspace until TOTP or recovery challenge succeeds", async () => {
  for (const recovery of [false, true]) {
    let workspaceRequests = 0;
    const api = new ApiClient(createAppConfig({ apiBaseUrl: "https://workspace.checkstation.app/api" }), undefined, { fetchImpl: async (input, init) => {
      const path = new URL(String(input)).pathname;
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      if (path.endsWith("/auth/csrf/")) return json({ csrfToken: "unit-test-csrf" });
      if (path.endsWith("/auth/login/")) return json({ code: "two_factor_required" }, 403);
      if (path.endsWith("/auth/owner-2fa/challenge/")) {
        const body = JSON.parse(String(init?.body));
        return body[recovery ? "recovery_code" : "code"] === "valid-unit-test-code" ? json({}) : json({ code: "invalid_code", detail: "Invalid code" }, 400);
      }
      if (path.endsWith("/workspace/")) { workspaceRequests++; return json({ account_kind: "owner", role: "owner", workspace: { workspace_id: "UNIT01" } }); }
      throw new Error(`Unexpected request ${path}`);
    } });
    const auth = new AuthController(api);
    await api.init();
    assert.equal((await auth.loginOwner("unit@example.com", "unit-password")).kind, "two_factor_required");
    assert.equal(auth.getState().session, null);
    assert.equal(workspaceRequests, 0);
    await assert.rejects(auth.completeOwnerTwoFactor(recovery ? { recovery_code: "invalid" } : { code: "invalid" }));
    assert.equal(auth.getState().status, "needs_2fa");
    assert.equal(workspaceRequests, 0);
    await auth.completeOwnerTwoFactor(recovery ? { recovery_code: "valid-unit-test-code" } : { code: "valid-unit-test-code" });
    assert.equal(auth.getState().status, "authenticated");
    assert.equal(workspaceRequests, 1);
  }
});
