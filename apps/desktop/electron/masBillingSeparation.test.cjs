const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const {
  TEAM_ID,
  BUNDLE_ID,
  resolveMasSigning,
  printHumanBlocker,
} = require("../scripts/resolve-mas-signing.cjs");

const root = join(__dirname, "..");

test("MAS IPC gates Apple IAP on; Stripe billing return off", () => {
  const main = readFileSync(join(root, "electron/main.cjs"), "utf8");
  assert.match(main, /billingMode !== "apple_iap"/);
  assert.match(main, /billingMode !== "stripe_web"/);
  assert.match(main, /checkstation:storeKitProducts/);
  assert.match(main, /checkstation:storeKitPurchase/);
  assert.match(main, /checkstation:storeKitRestore/);
  assert.match(main, /checkstation:storeKitManage/);
  assert.match(main, /checkstation:prepareBillingReturn/);
});

test("MAS entitlements: main has SIWA/sandbox/JIT/app-groups/network; inherit is sandbox-only", () => {
  const main = readFileSync(join(root, "build/entitlements.mas.plist"), "utf8");
  const inherit = readFileSync(join(root, "build/entitlements.mas.inherit.plist"), "utf8");

  assert.match(main, /com\.apple\.developer\.applesignin/);
  assert.match(main, /com\.apple\.security\.app-sandbox/);
  assert.match(main, /com\.apple\.security\.network\.client/);
  assert.match(main, /com\.apple\.security\.network\.server/);
  assert.match(main, /com\.apple\.application-identifier/);
  assert.match(main, /472845AC29\.app\.checkstation\.client/);
  assert.match(main, /com\.apple\.developer\.team-identifier/);
  assert.match(main, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(main, /com\.apple\.security\.cs\.allow-unsigned-executable-memory/);
  assert.match(main, /com\.apple\.security\.application-groups/);
  assert.doesNotMatch(main, /disable-library-validation/);

  assert.match(inherit, /com\.apple\.security\.app-sandbox/);
  assert.match(inherit, /com\.apple\.security\.inherit/);
  assert.doesNotMatch(inherit, /applesignin/);
  assert.doesNotMatch(inherit, /network\.client/);
  assert.doesNotMatch(inherit, /network\.server/);
  assert.doesNotMatch(inherit, /allow-jit/);
  assert.doesNotMatch(inherit, /allow-unsigned-executable-memory/);
  assert.doesNotMatch(inherit, /application-groups/);
  assert.doesNotMatch(inherit, /disable-library-validation/);
});

test("electron-builder MAS packs in-process native module, not MacBridge.app", () => {
  const config = readFileSync(join(root, "electron-builder.config.cjs"), "utf8");
  assert.match(config, /mac_apple_native\.node/);
  assert.match(config, /libCheckStationMacApple\.dylib/);
  assert.match(config, /never package CheckStationMacBridge\.app/);
  assert.match(config, /entitlements\.mas\.plist/);
  assert.match(config, /entitlements\.mas\.inherit\.plist/);
  assert.match(config, /resolveMasSigning/);
  assert.match(config, /after-pack-mas/);
  assert.match(config, /ElectronTeamID/);
  assert.match(config, /distribution === "mas"/);
  assert.match(config, /target: "mas"/);
  assert.match(config, /productName: "CheckStation"/);
  assert.match(config, /identity: null/);
  assert.match(config, /MAS_BUILD_VERSION.*\|\| "7"/);
  assert.doesNotMatch(config, /from: macBridgeApp/);
});

test("MAS signing resolver targets team + bundle and explains blocker", () => {
  assert.equal(TEAM_ID, "472845AC29");
  assert.equal(BUNDLE_ID, "app.checkstation.client");
  const resolved = resolveMasSigning();
  assert.equal(resolved.teamId, TEAM_ID);
  assert.equal(resolved.bundleId, BUNDLE_ID);
  if (!resolved.ready) {
    const text = printHumanBlocker(resolved);
    assert.match(text, /Mac App Distribution/);
    assert.match(text, /AppStore_app\.checkstation\.client\.provisionprofile/);
    assert.match(text, /do NOT revoke the existing iPhone Distribution/);
  }
});

test("build/mac profile drop folder documents the provisioning drop path", () => {
  // Committed README only — never require a local .provisionprofile in CI.
  const readme = join(root, "build/mac/README.txt");
  assert.equal(existsSync(readme), true);
  const text = readFileSync(readme, "utf8");
  assert.match(text, /AppStore_app\.checkstation\.client\.provisionprofile/);
  assert.match(text, /472845AC29/);
});

test("Swift MacApple exposes products/purchase/restore/manage + appleSignIn", () => {
  const swift = readFileSync(join(root, "native/MacApple/Sources/BridgeCore.swift"), "utf8");
  assert.match(swift, /case "appleSignIn"/);
  assert.match(swift, /case "products"/);
  assert.match(swift, /case "purchase"/);
  assert.match(swift, /case "restore"/);
  assert.match(swift, /case "manage"/);
  assert.match(swift, /product\.displayPrice/);
  assert.match(swift, /signedTransaction/);
  assert.match(swift, /AppStore\.sync/);
  assert.match(swift, /apps\.apple\.com\/account\/subscriptions/);
  assert.match(swift, /app\.checkstation\.plus\.monthly/);
  assert.match(swift, /app\.checkstation\.business\.yearly/);
  assert.match(swift, /ensureHostAppIconImage/);
  assert.match(swift, /applicationIconImage/);
  assert.match(swift, /styleMask\.contains\(\.titled\)/);
});

test("MAS main reinforces dock icon from bundled icns for native Apple sheet", () => {
  const main = readFileSync(join(root, "electron/main.cjs"), "utf8");
  assert.match(main, /distribution === "mas"/);
  assert.match(main, /icon\.icns/);
  assert.match(main, /dock\.setIcon/);
  assert.match(main, /nativeImage\.createFromPath/);
});

test("macBridge loads in-process native module for MAS only", () => {
  const source = readFileSync(join(root, "electron/macBridge.cjs"), "utf8");
  assert.match(source, /mac_apple_native\.node/);
  assert.match(source, /libCheckStationMacApple\.dylib/);
  assert.match(source, /isMasDistribution/);
  assert.match(source, /Native Apple provider is MAS-only/);
  assert.doesNotMatch(source, /spawn\(/);
  assert.doesNotMatch(source, /CheckStationMacBridge\.app/);
});

test("afterPack asserts no nested MacBridge.app and requires native module", () => {
  const source = readFileSync(join(root, "scripts/after-pack-mas.cjs"), "utf8");
  assert.match(source, /CheckStationMacBridge\.app/);
  assert.match(source, /must not contain/);
  assert.match(source, /mac_apple_native\.node/);
  assert.match(source, /libCheckStationMacApple\.dylib/);
  assert.doesNotMatch(source, /signMacBridge/);
});

test("backend Apple contracts and product IDs remain unchanged in bridges", () => {
  const appleAuth = readFileSync(join(root, "electron/appleNativeAuth.cjs"), "utf8");
  const storeKit = readFileSync(join(root, "electron/storeKitBridge.cjs"), "utf8");
  assert.match(appleAuth, /\/api\/auth\/apple\/native\//);
  assert.deepEqual(
    require("./storeKitBridge.cjs").APPLE_PRODUCT_IDS,
    [
      "app.checkstation.plus.monthly",
      "app.checkstation.plus.yearly",
      "app.checkstation.business.monthly",
      "app.checkstation.business.yearly",
    ],
  );
  assert.match(storeKit, /APPLE_PRODUCT_IDS/);
});

test("iOS mobile sources are not modified by this Option A desktop change", () => {
  // Guard: this test file lives only under apps/desktop; if a future edit
  // accidentally touches iOS paths from desktop scripts, fail loudly in CI.
  const buildVariant = readFileSync(join(root, "scripts/build-electron-variant.cjs"), "utf8");
  assert.doesNotMatch(buildVariant, /apps\/mobile/);
  assert.doesNotMatch(buildVariant, /ios/);
  assert.match(buildVariant, /native\/MacApple\/build-native\.cjs/);
  assert.doesNotMatch(buildVariant, /build-mac-bridge/);
  assert.doesNotMatch(buildVariant, /package-mac-bridge-app/);
});
