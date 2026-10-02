const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  looksLikeGoogleClientId,
  resolveDesktopClientId,
  resolveDesktopClientSecret,
  isGoogleDesktopOAuthConfigured,
  requestGoogleIdentityToken,
  _createPkce,
  _base64Url,
  _exchangeCodeForIdToken,
  LOOPBACK_PATH,
} = require("./googleOAuth.cjs");

describe("googleOAuth helpers", () => {
  it("accepts real Google client IDs and rejects placeholders", () => {
    assert.equal(
      looksLikeGoogleClientId("533996414208-meftj1qs2q24cq1hejafcusnblhuqlnp.apps.googleusercontent.com"),
      true,
    );
    assert.equal(looksLikeGoogleClientId(""), false);
    assert.equal(looksLikeGoogleClientId("REPLACE_ME.apps.googleusercontent.com"), false);
    assert.equal(looksLikeGoogleClientId("not-a-client"), false);
  });

  it("resolves desktop client ID and secret from options over env", () => {
    const previousId = process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID;
    const previousSecret = process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET;
    process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID = "env-id.apps.googleusercontent.com";
    process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET = "env-secret-value";
    try {
      assert.equal(
        resolveDesktopClientId({ clientId: "opt-id.apps.googleusercontent.com" }),
        "opt-id.apps.googleusercontent.com",
      );
      assert.equal(
        resolveDesktopClientSecret({ clientSecret: "opt-secret" }),
        "opt-secret",
      );
      assert.equal(resolveDesktopClientSecret({}), "env-secret-value");
      assert.equal(
        isGoogleDesktopOAuthConfigured({
          clientId: "opt-id.apps.googleusercontent.com",
          clientSecret: "opt-secret",
        }),
        true,
      );
      // Empty option falls through to env, so clear env to assert missing secret.
      delete process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET;
      assert.equal(
        isGoogleDesktopOAuthConfigured({
          clientId: "opt-id.apps.googleusercontent.com",
          clientSecret: "",
        }),
        false,
      );
      process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET = "env-secret-value";
      assert.equal(isGoogleDesktopOAuthConfigured({ clientId: "", clientSecret: "x" }), true); // falls back to env id
    } finally {
      if (previousId == null) delete process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID;
      else process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID = previousId;
      if (previousSecret == null) delete process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET;
      else process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET = previousSecret;
    }
  });

  it("creates PKCE verifier/challenge pair", () => {
    const { verifier, challenge } = _createPkce();
    assert.ok(verifier.length > 20);
    assert.ok(challenge.length > 20);
    assert.notEqual(verifier, challenge);
    assert.equal(_base64Url(Buffer.from("hi")).includes("+"), false);
  });
});

describe("requestGoogleIdentityToken", () => {
  it("returns misconfigured when client ID or secret is missing", async () => {
    const previousId = process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID;
    const previousSecret = process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET;
    try {
      assert.equal((await requestGoogleIdentityToken({ clientId: "", clientSecret: "s" })).kind, "misconfigured");
      assert.equal(
        (await requestGoogleIdentityToken({
          clientId: "1234567890-desktop.apps.googleusercontent.com",
          clientSecret: "",
        })).kind,
        "misconfigured",
      );
    } finally {
      if (previousId != null) process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID = previousId;
      if (previousSecret != null) process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET = previousSecret;
    }
  });

  it("maps provider cancel to cancelled", async () => {
    const clientId = "1234567890-desktop.apps.googleusercontent.com";
    let focusCalls = 0;
    const result = await requestGoogleIdentityToken({
      clientId,
      clientSecret: "test-secret",
      timeoutMs: 5000,
      bringToForeground: () => { focusCalls += 1; },
      openExternal: async (url) => {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("client_id"), clientId);
        assert.equal(parsed.searchParams.get("response_type"), "code");
        assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
        const redirectUri = parsed.searchParams.get("redirect_uri");
        assert.ok(redirectUri?.startsWith("http://127.0.0.1:"));
        assert.ok(redirectUri?.endsWith(LOOPBACK_PATH));
        // Simulate Google cancel redirect into the loopback server.
        await fetch(`${redirectUri}?error=access_denied&state=${parsed.searchParams.get("state")}`);
      },
    });
    assert.equal(result.kind, "cancelled");
    assert.equal(focusCalls, 0);
  });

  it("maps provider error without exposing tokens", async () => {
    const clientId = "1234567890-desktop.apps.googleusercontent.com";
    let focusCalls = 0;
    const result = await requestGoogleIdentityToken({
      clientId,
      clientSecret: "test-secret",
      timeoutMs: 5000,
      bringToForeground: () => { focusCalls += 1; },
      openExternal: async (url) => {
        const parsed = new URL(url);
        const redirectUri = parsed.searchParams.get("redirect_uri");
        await fetch(
          `${redirectUri}?error=server_error&error_description=boom&state=${parsed.searchParams.get("state")}`,
        );
      },
    });
    assert.equal(result.kind, "error");
    assert.equal("identityToken" in result, false);
    assert.equal(focusCalls, 0);
  });

  it("completes successful code exchange into identity token with client secret", async () => {
    const clientId = "1234567890-desktop.apps.googleusercontent.com";
    const clientSecret = "desktop-client-secret-value";
    let focusCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async (input, init) => {
      const target = String(input);
      if (target.includes("oauth2.googleapis.com/token")) {
        const body = String(init?.body || "");
        assert.match(body, /code=auth-code/);
        assert.match(body, /code_verifier=/);
        assert.match(body, /client_id=/);
        assert.match(body, /client_secret=desktop-client-secret-value/);
        return new Response(JSON.stringify({ id_token: "desktop-id-token-value" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };
    try {
      const result = await requestGoogleIdentityToken({
        clientId,
        clientSecret,
        timeoutMs: 5000,
        bringToForeground: () => { focusCalls += 1; },
        openExternal: async (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get("redirect_uri");
          const state = parsed.searchParams.get("state");
          await fetch(`${redirectUri}?code=auth-code&state=${state}`);
        },
      });
      assert.equal(result.kind, "success");
      assert.equal(result.identityToken, "desktop-id-token-value");
      assert.equal(focusCalls, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("does not focus when token exchange fails", async () => {
    const clientId = "1234567890-desktop.apps.googleusercontent.com";
    let focusCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async (input, init) => {
      const target = String(input);
      if (target.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ error: "invalid_client" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };
    try {
      const result = await requestGoogleIdentityToken({
        clientId,
        clientSecret: "bad-secret",
        timeoutMs: 5000,
        bringToForeground: () => { focusCalls += 1; },
        openExternal: async (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get("redirect_uri");
          const state = parsed.searchParams.get("state");
          await fetch(`${redirectUri}?code=auth-code&state=${state}`);
        },
      });
      assert.equal(result.kind, "missing_token");
      assert.equal(focusCalls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("exchangeCodeForIdToken", () => {
  it("rejects missing id_token from Google", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ access_token: "x" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    try {
      await assert.rejects(
        () => _exchangeCodeForIdToken({
          clientId: "id.apps.googleusercontent.com",
          clientSecret: "secret",
          code: "c",
          redirectUri: "http://127.0.0.1/cb",
          codeVerifier: "v",
        }),
        /missing_token/,
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("success callback HTML", () => {
  it("auto-closes and tells the user login succeeded", () => {
    const { _closePage } = require("./googleOAuth.cjs");
    const html = _closePage("Signed in with Google", "Returning to CheckStation…", { autoClose: true });
    assert.match(html, /Signed in with Google/);
    assert.match(html, /Returning to CheckStation/);
    assert.match(html, /window\.close\(\)/);
    assert.doesNotMatch(html, /You can close this window and return/);
  });
});
