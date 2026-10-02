const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const path = require("node:path");
const {
  DISTRIBUTIONS,
  BUNDLE_IDS,
  BILLING_MODES,
  APPLE_AUTH_MODES,
  resolveDesktopDistribution,
  desktopBundleId,
  desktopReleaseOutputDir,
  desktopBillingMode,
  desktopAppleAuthMode,
  desktopGoogleAuthEnabled,
  getDesktopDistributionInfo,
} = require("./desktopDistribution.cjs");

describe("desktopDistribution", () => {
  it("defaults to direct with desktop bundle id", () => {
    const previous = process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
    const previousVite = process.env.VITE_DESKTOP_DISTRIBUTION;
    delete process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
    delete process.env.VITE_DESKTOP_DISTRIBUTION;
    try {
      assert.equal(resolveDesktopDistribution({ distribution: "" }), DISTRIBUTIONS.DIRECT);
      assert.equal(desktopBundleId("direct"), "app.checkstation.desktop");
      assert.equal(desktopBundleId(DISTRIBUTIONS.DIRECT), BUNDLE_IDS.direct);
      assert.equal(desktopReleaseOutputDir("direct"), "release/direct");
      assert.equal(desktopBillingMode("direct"), BILLING_MODES.direct);
      assert.equal(desktopAppleAuthMode("direct"), APPLE_AUTH_MODES.direct);
      assert.equal(desktopGoogleAuthEnabled("direct"), true);
    } finally {
      if (previous == null) delete process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
      else process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = previous;
      if (previousVite == null) delete process.env.VITE_DESKTOP_DISTRIBUTION;
      else process.env.VITE_DESKTOP_DISTRIBUTION = previousVite;
    }
  });

  it("resolves mas to App Store client bundle id and separate output", () => {
    assert.equal(resolveDesktopDistribution({ distribution: "mas" }), DISTRIBUTIONS.MAS);
    assert.equal(desktopBundleId("mas"), "app.checkstation.client");
    assert.equal(desktopReleaseOutputDir("mas"), "release/mas");
    assert.equal(desktopBillingMode("mas"), "apple_iap");
    assert.equal(desktopAppleAuthMode("mas"), "native");
    assert.equal(desktopGoogleAuthEnabled("mas"), true);
  });

  it("keeps direct and mas outputs from overwriting each other", () => {
    assert.notEqual(desktopReleaseOutputDir("direct"), desktopReleaseOutputDir("mas"));
    assert.equal(path.dirname(desktopReleaseOutputDir("direct")), "release");
    assert.equal(path.dirname(desktopReleaseOutputDir("mas")), "release");
  });

  it("does not switch live billing — modes are foundation labels only", () => {
    const direct = getDesktopDistributionInfo({ distribution: "direct" });
    const mas = getDesktopDistributionInfo({ distribution: "mas" });
    assert.equal(direct.billingMode, "stripe_web");
    assert.equal(mas.billingMode, "apple_iap");
    // Explicit: Google remains enabled for both; no provider activation here.
    assert.equal(direct.googleAuthEnabled, true);
    assert.equal(mas.googleAuthEnabled, true);
  });

  it("honors CHECKSTATION_DESKTOP_DISTRIBUTION env", () => {
    const previous = process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
    process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = "mas";
    try {
      assert.equal(resolveDesktopDistribution(), "mas");
      assert.equal(getDesktopDistributionInfo().bundleId, "app.checkstation.client");
    } finally {
      if (previous == null) delete process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
      else process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = previous;
    }
  });
});

describe("electron-builder variant config", () => {
  it("direct config uses desktop appId and release/direct", () => {
    const previous = process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
    process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = "direct";
    try {
      delete require.cache[require.resolve("../electron-builder.config.cjs")];
      delete require.cache[require.resolve("./desktopDistribution.cjs")];
      const config = require("../electron-builder.config.cjs");
      assert.equal(config.appId, "app.checkstation.desktop");
      assert.equal(config.directories.output, "release/direct");
      assert.equal(config.extraMetadata.checkstationDesktopDistribution, "direct");
    } finally {
      if (previous == null) delete process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
      else process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = previous;
      delete require.cache[require.resolve("../electron-builder.config.cjs")];
      delete require.cache[require.resolve("./desktopDistribution.cjs")];
    }
  });

  it("mas config uses client appId and release/mas (requires signing assets to load)", () => {
    const source = readFileSync(join(__dirname, "../electron-builder.config.cjs"), "utf8");
    assert.match(source, /resolveMasSigning/);
    assert.match(source, /productName: "CheckStation"/);
    assert.match(source, /target: "mas"/);
    assert.match(source, /desktopReleaseOutputDir/);
    assert.match(source, /entitlements\.mas\.plist/);
    assert.match(source, /after-pack-mas/);
    assert.match(source, /ElectronTeamID/);
    // DIRECT stays unsigned; MAS must not hardcode identity: null in the MAS branch.
    assert.match(source, /identity: null/);
    assert.match(source, /distribution === "mas"/);
    assert.doesNotMatch(source, /CheckStation MAS/);

    const previous = process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
    process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = "mas";
    try {
      delete require.cache[require.resolve("../electron-builder.config.cjs")];
      delete require.cache[require.resolve("./desktopDistribution.cjs")];
      delete require.cache[require.resolve("../scripts/resolve-mas-signing.cjs")];
      let config = null;
      let loadError = null;
      try {
        config = require("../electron-builder.config.cjs");
      } catch (err) {
        loadError = err;
      }
      if (config) {
        assert.equal(config.appId, "app.checkstation.client");
        assert.equal(config.directories.output, "release/mas");
        assert.equal(config.extraMetadata.checkstationDesktopDistribution, "mas");
        assert.equal(config.productName, "CheckStation");
        assert.notEqual(config.mac.identity, null);
        assert.ok(config.mac.provisioningProfile);
        assert.equal(config.mac.target[0].target, "mas");
        assert.notEqual(config.directories.output, "release/direct");
      } else {
        assert.match(String(loadError && loadError.message), /MAS signing assets missing/);
      }
    } finally {
      if (previous == null) delete process.env.CHECKSTATION_DESKTOP_DISTRIBUTION;
      else process.env.CHECKSTATION_DESKTOP_DISTRIBUTION = previous;
      delete require.cache[require.resolve("../electron-builder.config.cjs")];
      delete require.cache[require.resolve("./desktopDistribution.cjs")];
      delete require.cache[require.resolve("../scripts/resolve-mas-signing.cjs")];
    }
  });
});
