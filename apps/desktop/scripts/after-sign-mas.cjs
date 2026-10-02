#!/usr/bin/env node
/**
 * electron-builder afterSign (MAS): ensure ElectronTeamID remains set after
 * nested code signing. Native .node / dylib are signed as nested code with
 * inherit entitlements (no separate app identity / profile).
 */
const path = require("node:path");
const { resolveAppPath, ensureElectronTeamId, run } = require("./mas-bridge-sign.cjs");
const { resolveMasSigning } = require("./resolve-mas-signing.cjs");

exports.default = async function afterSign(context) {
  const distribution = String(process.env.CHECKSTATION_DESKTOP_DISTRIBUTION || "").toLowerCase();
  if (distribution !== "mas") return;

  const appPath = resolveAppPath(context);
  ensureElectronTeamId(appPath);

  const resolved = resolveMasSigning();
  if (!resolved.ready) {
    throw new Error(resolved.identity.ok === false
      ? resolved.identity.message
      : resolved.profile.message);
  }

  const identity = resolved.identity.identity;
  const entitlements = path.join(__dirname, "../build/entitlements.mas.plist");
  // Re-seal outer app (do not use --deep). Nested helper codes are already signed.
  run("codesign", [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--entitlements",
    entitlements,
    "--sign",
    identity,
    appPath,
  ]);
  console.log(`[mas-afterSign] re-sealed outer app with ${identity}`);
};
