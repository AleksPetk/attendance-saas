const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const {
  prepareDesktopBillingReturn,
  openBillingUrlAndWait,
  LOOPBACK_PATH,
} = require("./stripeBrowser.cjs");

test("Stripe checkout loopback focuses CheckStation on valid return", async () => {
  let focusCalls = 0;
  const prepared = await prepareDesktopBillingReturn();
  const resultPromise = openBillingUrlAndWait({
    server: prepared.server,
    url: "https://checkout.stripe.com/c/pay/test_session",
    openExternal: async () => {
      const target = `${prepared.desktopReturnUrl}?checkout=success`;
      await new Promise((resolve, reject) => {
        http.get(target, (res) => {
          res.resume();
          res.on("end", resolve);
        }).on("error", reject);
      });
    },
    bringToForeground: () => {
      focusCalls += 1;
    },
    timeoutMs: 5000,
  });
  const result = await resultPromise;
  assert.equal(result.kind, "returned");
  assert.equal(result.checkout, "success");
  assert.equal(focusCalls, 1);
});

test("Stripe portal loopback focuses CheckStation on valid return", async () => {
  let focusCalls = 0;
  const prepared = await prepareDesktopBillingReturn();
  const result = await openBillingUrlAndWait({
    server: prepared.server,
    url: "https://billing.stripe.com/p/session/test",
    openExternal: async () => {
      const target = `${prepared.desktopReturnUrl}?portal=return`;
      await new Promise((resolve, reject) => {
        http.get(target, (res) => {
          res.resume();
          res.on("end", resolve);
        }).on("error", reject);
      });
    },
    bringToForeground: () => {
      focusCalls += 1;
    },
    timeoutMs: 5000,
  });
  assert.equal(result.kind, "returned");
  assert.equal(result.portal, "return");
  assert.equal(focusCalls, 1);
});

test("Stripe timeout does not focus", async () => {
  let focusCalls = 0;
  const prepared = await prepareDesktopBillingReturn();
  const result = await openBillingUrlAndWait({
    server: prepared.server,
    url: "https://checkout.stripe.com/c/pay/test_session",
    openExternal: async () => {},
    bringToForeground: () => {
      focusCalls += 1;
    },
    timeoutMs: 200,
  });
  assert.equal(result.kind, "timeout");
  assert.equal(focusCalls, 0);
});

test("Stripe loopback path constant", () => {
  assert.equal(LOOPBACK_PATH, "/stripe-billing-return");
});
