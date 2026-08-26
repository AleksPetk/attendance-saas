import assert from "node:assert/strict";
import { test } from "node:test";

import { externalLinkProps, openStripePortalSafely } from "./billingExternalLinks.js";

function withMockWindow(mockOpen, run) {
  const previousWindow = globalThis.window;
  globalThis.window = { open: mockOpen };
  try {
    return run();
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
}

test("externalLinkProps uses safe new-tab attributes", () => {
  const props = externalLinkProps("https://invoice.stripe.test/i/abc");
  assert.equal(props.href, "https://invoice.stripe.test/i/abc");
  assert.equal(props.target, "_blank");
  assert.equal(props.rel, "noopener noreferrer");
});

test("openStripePortalSafely opens blank tab then assigns portal URL", async () => {
  const calls = [];
  const tab = {
    closed: false,
    location: { href: "" },
    opener: {},
    close() {
      this.closed = true;
    },
  };
  await withMockWindow((...args) => {
    calls.push(args);
    return tab;
  }, async () => {
    await openStripePortalSafely(async () => "https://billing.stripe.test/session/cus_1");
    assert.deepEqual(calls[0], ["about:blank", "_blank"]);
    assert.equal(tab.location.href, "https://billing.stripe.test/session/cus_1");
    assert.equal(tab.opener, null);
    assert.equal(tab.closed, false);
  });
});

test("openStripePortalSafely closes tab and rethrows when portal URL fetch fails", async () => {
  const tab = {
    closed: false,
    location: { href: "" },
    opener: {},
    close() {
      this.closed = true;
    },
  };
  await withMockWindow(() => tab, async () => {
    await assert.rejects(
      () =>
        openStripePortalSafely(async () => {
          throw new Error("portal failed");
        }),
      /portal failed/,
    );
    assert.equal(tab.closed, true);
  });
});

test("openStripePortalSafely throws when popup is blocked", async () => {
  await withMockWindow(() => null, async () => {
    await assert.rejects(
      () => openStripePortalSafely(async () => "https://billing.stripe.test/session/cus_1"),
      /blocked the billing portal tab/,
    );
  });
});
