import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_BUNDLE_IDS,
  desktopAppleAuthMode,
  desktopBillingMode,
  desktopBundleId,
  desktopGoogleAuthEnabled,
  desktopReleaseOutputDir,
  getDesktopDistributionInfo,
  resolveDesktopDistribution,
} from "./desktopDistribution";

const here = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(here, "../../package.json"), "utf8"));
const main = readFileSync(join(here, "../../electron/main.cjs"), "utf8");
const preload = readFileSync(join(here, "../../electron/preload.cjs"), "utf8");
const googleOAuth = readFileSync(join(here, "../../electron/googleOAuth.cjs"), "utf8");
const builderConfig = readFileSync(join(here, "../../electron-builder.config.cjs"), "utf8");

describe("desktopDistribution renderer helper", () => {
  it("defaults to direct desktop identity", () => {
    assert.equal(resolveDesktopDistribution(""), "direct");
    assert.equal(desktopBundleId("direct"), DESKTOP_BUNDLE_IDS.direct);
    assert.equal(desktopBundleId("direct"), "app.checkstation.desktop");
    assert.equal(desktopReleaseOutputDir("direct"), "release/direct");
    assert.equal(desktopBillingMode("direct"), "stripe_web");
    assert.equal(desktopAppleAuthMode("direct"), "web_compatible");
    assert.equal(desktopGoogleAuthEnabled("direct"), true);
  });

  it("maps mas to App Store client identity without enabling IAP", () => {
    const info = getDesktopDistributionInfo("mas");
    assert.equal(info.distribution, "mas");
    assert.equal(info.bundleId, "app.checkstation.client");
    assert.equal(info.releaseOutputDir, "release/mas");
    assert.equal(info.billingMode, "apple_iap");
    assert.equal(info.appleAuthMode, "native");
    assert.equal(info.googleAuthEnabled, true);
    assert.notEqual(info.releaseOutputDir, desktopReleaseOutputDir("direct"));
  });
});

describe("desktop distribution wiring", () => {
  it("exposes build scripts for direct and mas without source edits", () => {
    assert.match(packageJson.scripts["build:electron:direct"], /build-electron-variant\.cjs direct/);
    assert.match(packageJson.scripts["build:electron:mas"], /build-electron-variant\.cjs mas/);
    assert.match(packageJson.scripts["build:electron"], /build-electron-variant\.cjs direct/);
    assert.equal(packageJson.build, undefined);
  });

  it("wires distribution IPC and keeps shared Google OAuth", () => {
    assert.match(main, /getDesktopDistributionInfo/);
    assert.match(main, /checkstation:desktopDistribution/);
    assert.match(preload, /getDesktopDistribution/);
    assert.match(googleOAuth, /requestGoogleIdentityToken/);
    assert.doesNotMatch(googleOAuth, /desktopDistribution|CHECKSTATION_DESKTOP_DISTRIBUTION/);
    assert.match(builderConfig, /desktopBundleId|resolveDesktopDistribution/);
  });
});
