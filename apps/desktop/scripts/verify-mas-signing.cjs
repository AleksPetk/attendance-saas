#!/usr/bin/env node
/**
 * Verify a signed MAS .app after build (Option A: in-process native module).
 * Usage: node scripts/verify-mas-signing.cjs [path-to-CheckStation.app]
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { TEAM_ID, BUNDLE_ID } = require("./resolve-mas-signing.cjs");

const DESKTOP_ROOT = path.resolve(__dirname, "..");
const DEFAULT_APP = path.join(
  DESKTOP_ROOT,
  "release/mas/mas-arm64/CheckStation.app",
);

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

function main() {
  const appPath = path.resolve(process.argv[2] || DEFAULT_APP);
  const report = {
    appPath,
    exists: fs.existsSync(appPath),
    bundleId: null,
    teamId: null,
    buildVersion: null,
    signature: null,
    entitlements: null,
    profileEmbedded: false,
    macBridgeApp: {
      exists: false,
    },
    nativeModule: {
      nodeExists: false,
      dylibExists: false,
      nodeSignature: null,
      dylibSignature: null,
    },
    ok: false,
    errors: [],
  };

  if (!report.exists) {
    report.errors.push(`App not found: ${appPath}`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const info = run("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleIdentifier",
    path.join(appPath, "Contents/Info.plist"),
  ]);
  report.bundleId = String(info.stdout || "").trim();
  if (report.bundleId !== BUNDLE_ID) {
    report.errors.push(`CFBundleIdentifier ${report.bundleId} != ${BUNDLE_ID}`);
  }

  const buildVersion = run("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleVersion",
    path.join(appPath, "Contents/Info.plist"),
  ]);
  report.buildVersion = String(buildVersion.stdout || "").trim() || null;

  const team = run("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :ElectronTeamID",
    path.join(appPath, "Contents/Info.plist"),
  ]);
  report.teamId = String(team.stdout || "").trim() || null;

  const verify = run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  report.signature = {
    status: verify.status,
    stdout: (verify.stdout || "").trim(),
    stderr: (verify.stderr || "").trim(),
  };
  if (verify.status !== 0) {
    report.errors.push("codesign --verify failed");
  }

  const ents = run("codesign", ["-d", "--entitlements", ":-", appPath]);
  report.entitlements = ents.stdout || ents.stderr || "";
  if (!/com\.apple\.security\.app-sandbox/.test(report.entitlements)) {
    report.errors.push("main app missing app-sandbox entitlement");
  }
  if (!/com\.apple\.security\.network\.client/.test(report.entitlements)) {
    report.errors.push("main app missing com.apple.security.network.client");
  }
  if (!/com\.apple\.security\.network\.server/.test(report.entitlements)) {
    report.errors.push("main app missing com.apple.security.network.server");
  }
  if (!/com\.apple\.developer\.applesignin/.test(report.entitlements)) {
    report.errors.push("main app missing Sign in with Apple entitlement");
  }
  if (!/com\.apple\.application-identifier/.test(report.entitlements)
    || !/472845AC29\.app\.checkstation\.client/.test(report.entitlements)) {
    report.errors.push("main app missing com.apple.application-identifier for profile match");
  }
  if (!/com\.apple\.security\.cs\.allow-jit/.test(report.entitlements)) {
    report.errors.push("main app missing com.apple.security.cs.allow-jit");
  }
  if (!/com\.apple\.security\.cs\.allow-unsigned-executable-memory/.test(report.entitlements)) {
    report.errors.push("main app missing com.apple.security.cs.allow-unsigned-executable-memory");
  }
  if (!/com\.apple\.security\.application-groups/.test(report.entitlements)
    || !/472845AC29\.app\.checkstation\.client/.test(report.entitlements)) {
    report.errors.push("main app missing application-groups 472845AC29.app.checkstation.client");
  }
  if (/disable-library-validation/.test(report.entitlements)) {
    report.errors.push("main app must not include disable-library-validation");
  }

  report.profileEmbedded = fs.existsSync(
    path.join(appPath, "Contents/embedded.provisionprofile"),
  );
  if (!report.profileEmbedded) {
    report.errors.push("embedded.provisionprofile missing from app");
  }

  const bridgeApp = path.join(appPath, "Contents/Resources/CheckStationMacBridge.app");
  report.macBridgeApp.exists = fs.existsSync(bridgeApp);
  if (report.macBridgeApp.exists) {
    report.errors.push("CheckStationMacBridge.app must not be packaged (Option A)");
  }

  const nodePath = path.join(appPath, "Contents/Resources/mac_apple_native.node");
  const dylibPath = path.join(appPath, "Contents/Resources/libCheckStationMacApple.dylib");
  report.nativeModule.nodeExists = fs.existsSync(nodePath);
  report.nativeModule.dylibExists = fs.existsSync(dylibPath);
  if (!report.nativeModule.nodeExists) {
    report.errors.push("mac_apple_native.node missing from Resources");
  }
  if (!report.nativeModule.dylibExists) {
    report.errors.push("libCheckStationMacApple.dylib missing from Resources");
  }
  if (report.nativeModule.nodeExists) {
    const nodeVerify = run("codesign", ["--verify", "--strict", "--verbose=2", nodePath]);
    report.nativeModule.nodeSignature = {
      status: nodeVerify.status,
      stderr: (nodeVerify.stderr || "").trim(),
    };
    if (nodeVerify.status !== 0) {
      report.errors.push("mac_apple_native.node codesign verify failed");
    }
  }
  if (report.nativeModule.dylibExists) {
    const dylibVerify = run("codesign", ["--verify", "--strict", "--verbose=2", dylibPath]);
    report.nativeModule.dylibSignature = {
      status: dylibVerify.status,
      stderr: (dylibVerify.stderr || "").trim(),
    };
    if (dylibVerify.status !== 0) {
      report.errors.push("libCheckStationMacApple.dylib codesign verify failed");
    }
  }

  if (report.teamId && report.teamId !== TEAM_ID) {
    report.errors.push(`ElectronTeamID ${report.teamId} != ${TEAM_ID}`);
  }

  report.ok = report.errors.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
