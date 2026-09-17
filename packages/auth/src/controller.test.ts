import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthController } from "./controller.js";
import { ApiClient } from "@checkstation/api";
import { createAppConfig } from "@checkstation/config";

describe("AuthController", () => {
  it("starts unknown and documents browser Google redirect vs native completion", () => {
    const api = new ApiClient(createAppConfig());
    const auth = new AuthController(api);
    assert.equal(auth.getState().status, "unknown");
    assert.match(auth.getOAuthGapNote(), /google\/callback/i);
    assert.match(auth.getOAuthGapNote(), /google\/native/i);
    assert.match(auth.getOAuthGapNote(), /apple\/native/i);
  });

  it("retains Django cookies through login, authenticated verification, and logout", async () => {
    const seenCookies: string[] = [];
    const session = {
      account_kind: "owner",
      role: "owner",
      workspace_id: "REAL01",
      name: "Production workspace",
    };
    const fakeFetch: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const requestHeaders = init?.headers as Record<string, string>;
      if (path.endsWith("/auth/csrf/")) {
        const response = new Response(JSON.stringify({ csrfToken: "csrf-initial" }), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [["set-cookie", "checkstation_csrftoken=csrf-initial; Path=/; Secure"]] });
        return response;
      }
      if (path.endsWith("/auth/login/")) {
        assert.equal(requestHeaders["X-CSRFToken"], "csrf-initial");
        const response = new Response(JSON.stringify(session), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [
          ["set-cookie", "checkstation_csrftoken=csrf-rotated; Path=/; Secure"],
          ["set-cookie", "checkstation_sessionid=session-production; Path=/; HttpOnly; Secure"],
        ] });
        return response;
      }
      if (path.endsWith("/workspace/")) {
        seenCookies.push(requestHeaders.Cookie || "");
        return new Response(JSON.stringify(session), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.endsWith("/auth/logout/")) {
        seenCookies.push(requestHeaders.Cookie || "");
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const api = new ApiClient(createAppConfig({ apiBaseUrl: "https://workspace.checkstation.app/api" }), undefined, { fetchImpl: fakeFetch });
    const auth = new AuthController(api);
    await api.init();
    const result = await auth.loginOwner("owner@example.com", "correct-password");
    assert.equal(result.kind, "authenticated");
    if (result.kind === "authenticated") {
      assert.equal(result.session.workspace?.workspace_id, "REAL01");
      assert.equal(result.session.workspace?.name, "Production workspace");
    }
    assert.match(seenCookies[0] || "", /checkstation_sessionid=session-production/);
    assert.equal(auth.getState().status, "authenticated");
    await auth.logout();
    assert.match(seenCookies[1] || "", /checkstation_sessionid=session-production/);
    assert.equal(api.jar.cookieHeader(), "");
    assert.equal(auth.getState().status, "anonymous");
  });

  it("refreshWorkspace replaces entitlements from the shared workspace snapshot", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (!path.endsWith("/workspace/")) throw new Error(`Unexpected request: ${path}`);
      calls += 1;
      const selectionRequired = calls === 1;
      return new Response(JSON.stringify({
        role: "owner",
        workspace: {
          entitlements: {
            plan: { key: "basic", display_name: "Basic" },
            limits: { members: 25 },
            selection_required: { members: selectionRequired },
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const api = new ApiClient(createAppConfig({ apiBaseUrl: "https://workspace.checkstation.app/api" }), undefined, { fetchImpl: fakeFetch });
    const auth = new AuthController(api);
    await api.init();
    const first = await auth.refreshWorkspace();
    assert.equal(first.workspace?.entitlements?.selection_required?.members, true);
    const second = await auth.refreshWorkspace();
    assert.equal(second.workspace?.entitlements?.limits?.members, 25);
    assert.equal(second.workspace?.entitlements?.selection_required?.members, false);
    assert.equal(auth.getState().session?.workspace?.entitlements?.selection_required?.members, false);
  });

  it("completeAppleNative posts to native endpoint and retains Django session cookies", async () => {
    const seenCookies: string[] = [];
    const session = {
      account_kind: "owner",
      role: "owner",
      workspace_id: "REAL01",
      name: "Apple workspace",
    };
    const fakeFetch: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const requestHeaders = init?.headers as Record<string, string>;
      if (path.endsWith("/auth/csrf/")) {
        const response = new Response(JSON.stringify({ csrfToken: "csrf-initial" }), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [["set-cookie", "checkstation_csrftoken=csrf-initial; Path=/; Secure"]] });
        return response;
      }
      if (path.endsWith("/auth/apple/native/")) {
        const body = JSON.parse(String(init?.body || "{}"));
        assert.equal(body.intent, "login");
        assert.equal(body.identity_token, "id-token");
        assert.equal(body.nonce, "raw-nonce");
        assert.equal(requestHeaders["X-CSRFToken"], "csrf-initial");
        const response = new Response(JSON.stringify(session), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [
          ["set-cookie", "checkstation_csrftoken=csrf-rotated; Path=/; Secure"],
          ["set-cookie", "checkstation_sessionid=session-apple; Path=/; HttpOnly; Secure"],
        ] });
        return response;
      }
      if (path.endsWith("/workspace/")) {
        seenCookies.push(requestHeaders.Cookie || "");
        return new Response(JSON.stringify(session), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const api = new ApiClient(createAppConfig({ apiBaseUrl: "https://workspace.checkstation.app/api" }), undefined, { fetchImpl: fakeFetch });
    const auth = new AuthController(api);
    await api.init();
    const result = await auth.completeAppleNative({
      identityToken: "id-token",
      nonce: "raw-nonce",
      intent: "login",
    });
    assert.equal(result.kind, "authenticated");
    assert.match(seenCookies[0] || "", /checkstation_sessionid=session-apple/);
    assert.equal(auth.getState().status, "authenticated");
  });

  it("completeAppleNative maps two_factor_required like password login", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/auth/csrf/")) {
        const response = new Response(JSON.stringify({ csrfToken: "csrf-initial" }), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [["set-cookie", "checkstation_csrftoken=csrf-initial; Path=/; Secure"]] });
        return response;
      }
      if (path.endsWith("/auth/apple/native/")) {
        return new Response(JSON.stringify({ code: "two_factor_required", detail: "Two-factor authentication is required.", email: "owner@example.com" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const api = new ApiClient(createAppConfig({ apiBaseUrl: "https://workspace.checkstation.app/api" }), undefined, { fetchImpl: fakeFetch });
    const auth = new AuthController(api);
    await api.init();
    const result = await auth.completeAppleNative({
      identityToken: "id-token",
      nonce: "raw-nonce",
      intent: "login",
    });
    assert.equal(result.kind, "two_factor_required");
    assert.equal(auth.getState().status, "needs_2fa");
  });

  it("verifyAppleNative posts intent=verify on the same cookie session without finishOwnerFirstFactor", async () => {
    let workspaceHits = 0;
    let verifyBody: Record<string, unknown> | null = null;
    const fakeFetch: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const requestHeaders = init?.headers as Record<string, string>;
      if (path.endsWith("/auth/csrf/")) {
        const response = new Response(JSON.stringify({ csrfToken: "csrf-initial" }), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [["set-cookie", "checkstation_csrftoken=csrf-initial; Path=/; Secure"]] });
        return response;
      }
      if (path.endsWith("/auth/apple/native/")) {
        verifyBody = JSON.parse(String(init?.body || "{}"));
        assert.equal(requestHeaders["X-CSRFToken"], "csrf-initial");
        assert.match(requestHeaders.Cookie || "", /checkstation_csrftoken=csrf-initial/);
        return new Response(JSON.stringify({ code: "verified", detail: "Identity confirmed with Apple." }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (path.endsWith("/workspace/")) {
        workspaceHits += 1;
        return new Response(JSON.stringify({ role: "owner" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const api = new ApiClient(createAppConfig({ apiBaseUrl: "https://workspace.checkstation.app/api" }), undefined, { fetchImpl: fakeFetch });
    const auth = new AuthController(api);
    await api.init();
    const result = await auth.verifyAppleNative({ identityToken: "id-token", nonce: "raw-nonce" });
    assert.equal(result.code, "verified");
    assert.equal(verifyBody?.intent, "verify");
    assert.equal(verifyBody?.identity_token, "id-token");
    assert.equal(verifyBody?.nonce, "raw-nonce");
    assert.equal(workspaceHits, 0);
  });

  it("completeGoogleNative posts to native endpoint and retains Django session cookies", async () => {
    const seenCookies: string[] = [];
    const session = {
      account_kind: "owner",
      role: "owner",
      workspace_id: "REAL01",
      name: "Google workspace",
    };
    const fakeFetch: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const requestHeaders = init?.headers as Record<string, string>;
      if (path.endsWith("/auth/csrf/")) {
        const response = new Response(JSON.stringify({ csrfToken: "csrf-initial" }), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [["set-cookie", "checkstation_csrftoken=csrf-initial; Path=/; Secure"]] });
        return response;
      }
      if (path.endsWith("/auth/google/native/")) {
        const body = JSON.parse(String(init?.body || "{}"));
        assert.equal(body.intent, "login");
        assert.equal(body.identity_token, "id-token");
        assert.equal(body.nonce, "raw-nonce");
        assert.equal(requestHeaders["X-CSRFToken"], "csrf-initial");
        const response = new Response(JSON.stringify(session), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [
          ["set-cookie", "checkstation_csrftoken=csrf-rotated; Path=/; Secure"],
          ["set-cookie", "checkstation_sessionid=session-google; Path=/; HttpOnly; Secure"],
        ] });
        return response;
      }
      if (path.endsWith("/workspace/")) {
        seenCookies.push(requestHeaders.Cookie || "");
        return new Response(JSON.stringify(session), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const api = new ApiClient(createAppConfig({ apiBaseUrl: "https://workspace.checkstation.app/api" }), undefined, { fetchImpl: fakeFetch });
    const auth = new AuthController(api);
    await api.init();
    const result = await auth.completeGoogleNative({
      identityToken: "id-token",
      nonce: "raw-nonce",
      intent: "login",
    });
    assert.equal(result.kind, "authenticated");
    assert.match(seenCookies[0] || "", /checkstation_sessionid=session-google/);
    assert.equal(auth.getState().status, "authenticated");
  });

  it("completeGoogleNative maps two_factor_required like password login", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/auth/csrf/")) {
        const response = new Response(JSON.stringify({ csrfToken: "csrf-initial" }), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [["set-cookie", "checkstation_csrftoken=csrf-initial; Path=/; Secure"]] });
        return response;
      }
      if (path.endsWith("/auth/google/native/")) {
        return new Response(JSON.stringify({ code: "two_factor_required", detail: "Two-factor authentication is required.", email: "owner@example.com" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const api = new ApiClient(createAppConfig({ apiBaseUrl: "https://workspace.checkstation.app/api" }), undefined, { fetchImpl: fakeFetch });
    const auth = new AuthController(api);
    await api.init();
    const result = await auth.completeGoogleNative({
      identityToken: "id-token",
      nonce: "raw-nonce",
      intent: "login",
    });
    assert.equal(result.kind, "two_factor_required");
    assert.equal(auth.getState().status, "needs_2fa");
  });

  it("verifyGoogleNative posts intent=verify on the same cookie session without finishOwnerFirstFactor", async () => {
    let workspaceHits = 0;
    let verifyBody: Record<string, unknown> | null = null;
    const fakeFetch: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const requestHeaders = init?.headers as Record<string, string>;
      if (path.endsWith("/auth/csrf/")) {
        const response = new Response(JSON.stringify({ csrfToken: "csrf-initial" }), { status: 200, headers: { "content-type": "application/json" } });
        Object.defineProperty(response, "_rawHeaders", { value: [["set-cookie", "checkstation_csrftoken=csrf-initial; Path=/; Secure"]] });
        return response;
      }
      if (path.endsWith("/auth/google/native/")) {
        verifyBody = JSON.parse(String(init?.body || "{}"));
        assert.equal(requestHeaders["X-CSRFToken"], "csrf-initial");
        assert.match(requestHeaders.Cookie || "", /checkstation_csrftoken=csrf-initial/);
        return new Response(JSON.stringify({ code: "verified", detail: "Identity confirmed with Google." }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (path.endsWith("/workspace/")) {
        workspaceHits += 1;
        return new Response(JSON.stringify({ role: "owner" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const api = new ApiClient(createAppConfig({ apiBaseUrl: "https://workspace.checkstation.app/api" }), undefined, { fetchImpl: fakeFetch });
    const auth = new AuthController(api);
    await api.init();
    const result = await auth.verifyGoogleNative({ identityToken: "id-token", nonce: "raw-nonce" });
    assert.equal(result.code, "verified");
    assert.equal(verifyBody?.intent, "verify");
    assert.equal(verifyBody?.identity_token, "id-token");
    assert.equal(verifyBody?.nonce, "raw-nonce");
    assert.equal(workspaceHits, 0);
  });

  it("applyKioskUnlock clears locked status without requiring a workspace refetch", () => {
    const api = new ApiClient(createAppConfig());
    const auth = new AuthController(api);
    (auth as { setState: (patch: Record<string, unknown>) => void }).setState({
      status: "kiosk_locked",
      session: {
        role: "owner",
        kiosk_locked: true,
        kiosk_group_id: 42,
        workspace: {
          workspace_id: "REAL01",
          name: "Locked workspace",
          kiosk_locked: true,
          kiosk_group_id: 42,
        },
      },
      twoFactorPending: false,
      bootstrapError: null,
    });
    const state = auth.applyKioskUnlock({ kiosk_locked: false, kiosk_group_id: null, kiosk_available: false });
    assert.equal(state.status, "authenticated");
    assert.equal(state.session?.kiosk_locked, false);
    assert.equal(state.session?.kiosk_group_id, null);
    assert.equal(state.session?.workspace?.kiosk_locked, false);
    assert.equal(state.session?.workspace?.kiosk_group_id, null);
  });
});
