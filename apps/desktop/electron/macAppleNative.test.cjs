const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

/**
 * macBridge.cjs imports electron at load time. CI/Linux installs the electron
 * npm package without a downloaded binary; mock the module so unit tests stay
 * platform-independent (no Electron download/signing required).
 */
function withMockedElectron(run) {
  const electronPath = require.resolve("electron");
  const previous = Module._cache[electronPath];
  Module._cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      app: {
        isPackaged: false,
        getPath: () => "/tmp",
      },
    },
  };
  try {
    return run();
  } finally {
    if (previous) Module._cache[electronPath] = previous;
    else delete Module._cache[electronPath];
  }
}

test("MAS distribution can resolve native paths helper; DIRECT gate rejects invoke", async () => {
  const previous = process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
  process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = "direct";
  try {
    await withMockedElectron(async () => {
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
    });
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
    await withMockedElectron(async () => {
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
    });
  } finally {
    if (previous == null) delete process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
    else process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = previous;
    delete require.cache[require.resolve("./macBridge.cjs")];
    delete require.cache[require.resolve("./desktopDistribution.cjs")];
  }
});
