import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthController } from "./controller.js";
import { ApiClient } from "@checkstation/api";
import { createAppConfig } from "@checkstation/config";

describe("AuthController", () => {
  it("starts unknown and documents oauth gap", () => {
    const api = new ApiClient(createAppConfig());
    const auth = new AuthController(api);
    assert.equal(auth.getState().status, "unknown");
    assert.match(auth.getOAuthGapNote(), /deep link/i);
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
});
