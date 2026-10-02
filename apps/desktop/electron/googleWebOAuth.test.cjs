const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { requestGoogleWebOAuth, LOOPBACK_PATH } = require("./googleWebOAuth.cjs");

function openAndHitReturn(startUrl, query) {
  const parsed = new URL(startUrl);
  const returnUrl = parsed.searchParams.get("desktop_return_url");
  assert.ok(returnUrl);
  assert.match(returnUrl, /127\.0\.0\.1/);
  assert.match(returnUrl, /google-oauth-result/);
  assert.match(parsed.pathname, /\/auth\/google\/start\/?$/);
  assert.equal(parsed.searchParams.get("intent"), "login");
  const target = new URL(returnUrl);
  for (const [key, value] of Object.entries(query)) {
    target.searchParams.set(key, value);
  }
  return new Promise((resolve, reject) => {
    http.get(target.toString(), (res) => {
      res.resume();
      res.on("end", resolve);
    }).on("error", reject);
  });
}

test("Google web success loopback focuses CheckStation (Apple parity)", async () => {
  let focusCalls = 0;
  const result = await requestGoogleWebOAuth({
    intent: "login",
    openExternal: async (url) => {
      await openAndHitReturn(url, { result: "success", handoff: "google-handoff-token" });
    },
    bringToForeground: () => {
      focusCalls += 1;
    },
    timeoutMs: 5000,
    apiBaseUrl: "https://workspace.checkstation.app/api",
  });
  assert.equal(result.kind, "success");
  assert.equal(result.handoff, "google-handoff-token");
  assert.equal(focusCalls, 1);
});

test("Google web timeout does not focus", async () => {
  let focusCalls = 0;
  const result = await requestGoogleWebOAuth({
    intent: "login",
    openExternal: async () => {},
    bringToForeground: () => {
      focusCalls += 1;
    },
    timeoutMs: 200,
    apiBaseUrl: "https://workspace.checkstation.app/api",
  });
  assert.equal(result.kind, "error");
  assert.equal(focusCalls, 0);
});

test("Google web failed business result focuses without handoff", async () => {
  let focusCalls = 0;
  const result = await requestGoogleWebOAuth({
    intent: "login",
    openExternal: async (url) => {
      await openAndHitReturn(url, { result: "no_account" });
    },
    bringToForeground: () => {
      focusCalls += 1;
    },
    timeoutMs: 5000,
    apiBaseUrl: "https://workspace.checkstation.app/api",
  });
  assert.equal(result.kind, "failed");
  assert.equal(result.resultCode, "no_account");
  assert.equal(focusCalls, 1);
});

test("Google web loopback path matches LOOPBACK_PATH constant", () => {
  assert.equal(LOOPBACK_PATH, "/google-oauth-result");
});

test("Google web path never uses native Desktop client credentials", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "googleWebOAuth.cjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /GOOGLE_DESKTOP_OAUTH_CLIENT/);
  assert.doesNotMatch(source, /code_challenge/);
  assert.doesNotMatch(source, /client_secret/);
  assert.doesNotMatch(source, /identityToken/);
  assert.match(source, /auth\/google\/start\//);
  assert.match(source, /desktop_return_url/);
  assert.match(source, /handoff/);
});
