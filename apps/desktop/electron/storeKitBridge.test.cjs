const assert = require("node:assert/strict");
const test = require("node:test");

const {
  APPLE_PRODUCT_IDS,
  loadStoreKitProducts,
  purchaseStoreKitSubscription,
  restoreStoreKitPurchases,
  openAppleManageSubscriptions,
} = require("./storeKitBridge.cjs");

test("StoreKit bridge product list matches ASC SKUs exactly", () => {
  assert.deepEqual(APPLE_PRODUCT_IDS, [
    "app.checkstation.plus.monthly",
    "app.checkstation.plus.yearly",
    "app.checkstation.business.monthly",
    "app.checkstation.business.yearly",
  ]);
});

test("loadStoreKitProducts maps displayPrice from bridge", async () => {
  const result = await loadStoreKitProducts({
    invoke: async (req) => {
      assert.equal(req.cmd, "products");
      assert.deepEqual(req.productIds, APPLE_PRODUCT_IDS);
      return {
        ok: true,
        products: [
          {
            productId: "app.checkstation.plus.monthly",
            displayPrice: "¥1,200",
            title: "Plus Monthly",
          },
        ],
      };
    },
  });
  assert.equal(result.kind, "success");
  assert.equal(result.products[0].displayPrice, "¥1,200");
  assert.equal(result.products[0].productId, "app.checkstation.plus.monthly");
});

test("purchaseStoreKitSubscription returns signed JWS for backend verify", async () => {
  const result = await purchaseStoreKitSubscription({
    productId: "app.checkstation.plus.monthly",
    appAccountToken: "11111111-1111-1111-1111-111111111111",
    invoke: async (req) => {
      assert.equal(req.cmd, "purchase");
      assert.equal(req.productId, "app.checkstation.plus.monthly");
      assert.equal(req.appAccountToken, "11111111-1111-1111-1111-111111111111");
      return {
        ok: true,
        productId: "app.checkstation.plus.monthly",
        signedTransaction: "eyJhbGciOiJFUzI1NiJ9.payload.sig",
      };
    },
  });
  assert.equal(result.kind, "success");
  assert.equal(result.signedTransaction, "eyJhbGciOiJFUzI1NiJ9.payload.sig");
});

test("restoreStoreKitPurchases returns JWS rows for verify loop", async () => {
  const result = await restoreStoreKitPurchases({
    invoke: async (req) => {
      assert.equal(req.cmd, "restore");
      return {
        ok: true,
        transactions: [
          {
            productId: "app.checkstation.business.yearly",
            signedTransaction: "jws.restore.one",
          },
        ],
      };
    },
  });
  assert.equal(result.kind, "success");
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].signedTransaction, "jws.restore.one");
});

test("openAppleManageSubscriptions maps manage cmd", async () => {
  const result = await openAppleManageSubscriptions({
    invoke: async (req) => {
      assert.equal(req.cmd, "manage");
      return { ok: true };
    },
  });
  assert.equal(result.kind, "success");
});

test("StoreKit bridge reports signing_required when invoke says so", async () => {
  const products = await loadStoreKitProducts({
    invoke: async () => ({ ok: false, code: "signing_required" }),
  });
  assert.equal(products.kind, "signing_required");

  const purchase = await purchaseStoreKitSubscription({
    productId: "app.checkstation.plus.monthly",
    appAccountToken: "11111111-1111-1111-1111-111111111111",
    invoke: async () => ({ ok: false, code: "signing_required" }),
  });
  assert.equal(purchase.kind, "signing_required");
});
