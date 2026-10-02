const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { requestAppleWebOAuth, LOOPBACK_PATH } = require("./appleOAuth.cjs");

function openAndHitReturn(startUrl, query) {
  const parsed = new URL(startUrl);
  const returnUrl = parsed.searchParams.get("desktop_return_url");
  assert.ok(returnUrl);
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

test("Apple success loopback focuses CheckStation (same helper path as Google)", async () => {
  let focusCalls = 0;
  const resultPromise = requestAppleWebOAuth({
    intent: "login",
    openExternal: async (url) => {
      await openAndHitReturn(url, { result: "success", handoff: "handoff-token" });
    },
    bringToForeground: () => {
      focusCalls += 1;
    },
    timeoutMs: 5000,
    apiBaseUrl: "https://workspace.checkstation.app/api",
  });
  const result = await resultPromise;
  assert.equal(result.kind, "success");
  assert.equal(result.handoff, "handoff-token");
  assert.equal(focusCalls, 1);
});

test("Apple timeout does not focus", async () => {
  let focusCalls = 0;
  const result = await requestAppleWebOAuth({
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

test("Apple loopback path matches LOOPBACK_PATH constant", () => {
  assert.equal(LOOPBACK_PATH, "/apple-oauth-result");
});
