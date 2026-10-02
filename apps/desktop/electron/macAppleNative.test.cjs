const assert = require("node:assert/strict");
const test = require("node:test");

test("MAS distribution can resolve native paths helper; DIRECT gate rejects invoke", async () => {
  const previous = process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
  process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = "direct";
  try {
    delete require.cache[require.resolve("./macBridge.cjs")];
    delete require.cache[require.resolve("./desktopDistribution.cjs")];
    const {
      isMasDistribution,
      isMacBridgeAvailable,
      invokeMacBridge,
      _resetNativeLoadForTests,
    } = require("./macBridge.cjs");
    _resetNativeLoadForTests();
    assert.equal(isMasDistribution(), false);
    assert.equal(isMacBridgeAvailable(), false);
    const result = await invokeMacBridge({ cmd: "products", productIds: [] });
    assert.equal(result.ok, false);
    assert.equal(result.code, "unavailable");
  } finally {
    if (previous == null) delete process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
    else process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = previous;
    delete require.cache[require.resolve("./macBridge.cjs")];
    delete require.cache[require.resolve("./desktopDistribution.cjs")];
  }
});

test("MAS distribution reports signing_required when native artifacts absent", async () => {
  const previous = process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
  process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = "mas";
  try {
    delete require.cache[require.resolve("./macBridge.cjs")];
    delete require.cache[require.resolve("./desktopDistribution.cjs")];
    const {
      isMasDistribution,
      invokeMacBridge,
      resolveNativePaths,
      _resetNativeLoadForTests,
    } = require("./macBridge.cjs");
    _resetNativeLoadForTests();
    assert.equal(isMasDistribution(), true);
    // If artifacts were built locally, invoke may succeed at load; only assert
    // contract when artifacts are missing.
    const paths = resolveNativePaths();
    if (!paths) {
      const result = await invokeMacBridge({ cmd: "ping-ish" });
      assert.equal(result.ok, false);
      assert.equal(result.code, "signing_required");
    } else {
      assert.ok(paths.node.includes("mac_apple_native.node"));
      assert.ok(paths.dylib.includes("libCheckStationMacApple.dylib"));
    }
  } finally {
    if (previous == null) delete process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
    else process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = previous;
    delete require.cache[require.resolve("./macBridge.cjs")];
    delete require.cache[require.resolve("./desktopDistribution.cjs")];
  }
});
