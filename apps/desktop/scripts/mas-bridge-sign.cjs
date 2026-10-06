#!/usr/bin/env node
/**
 * Shared MAS MacBridge signing helpers.
 * Used by afterPack (embed profile) and afterSign (final entitlements after
 * electron-builder may have re-signed nested code with inherit-only ents).
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { resolveMasSigning, TEAM_ID } = require("./resolve-mas-signing.cjs");

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed:\n${detail}`);
  }
  return result;
}

function resolveAppPath(context) {
  const appOutDir = context.appOutDir;
  const productFilename = context.packager.appInfo.productFilename;
  return path.join(appOutDir, `${productFilename}.app`);
}

function resolveBridgeApp(appPath) {
  return path.join(appPath, "Contents", "Resources", "CheckStationMacBridge.app");
}

function ensureElectronTeamId(appPath) {
  const infoPlist = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(infoPlist)) return;
  const existing = spawnSync("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :ElectronTeamID",
    infoPlist,
  ], { encoding: "utf8" });
  if (existing.status === 0) {
    run("/usr/libexec/PlistBuddy", ["-c", `Set :ElectronTeamID ${TEAM_ID}`, infoPlist]);
  } else {
    run("/usr/libexec/PlistBuddy", ["-c", `Add :ElectronTeamID string ${TEAM_ID}`, infoPlist]);
  }
}

function signMacBridge(appPath, label) {
  const bridgeApp = resolveBridgeApp(appPath);
  const bridgeBinary = path.join(bridgeApp, "Contents", "MacOS", "CheckStationMacBridge");
  if (!fs.existsSync(bridgeBinary)) {
    console.warn(`[${label}] CheckStationMacBridge.app missing; skip bridge signing`);
    return false;
  }

  const resolved = resolveMasSigning();
  if (!resolved.ready) {
    throw new Error(resolved.identity.ok === false
      ? resolved.identity.message
      : resolved.profile.message);
  }

  const identity = resolved.identity.identity;
  const profilePath = resolved.profile.profilePath;
  const entitlements = path.join(__dirname, "../build/entitlements.mas.bridge.plist");

  fs.copyFileSync(
    profilePath,
    path.join(bridgeApp, "Contents", "embedded.provisionprofile"),
  );

  run("codesign", [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--entitlements",
    entitlements,
    "--sign",
    identity,
    bridgeBinary,
  ]);
  run("codesign", [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--entitlements",
    entitlements,
    "--sign",
    identity,
    bridgeApp,
  ]);

  console.log(`[${label}] signed CheckStationMacBridge.app with bridge entitlements (${identity})`);
  return true;
}

module.exports = {
  run,
  resolveAppPath,
  resolveBridgeApp,
  ensureElectronTeamId,
  signMacBridge,
};
