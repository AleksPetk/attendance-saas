#!/usr/bin/env node
/**
 * electron-builder afterPack (MAS): ensure ElectronTeamID; assert no nested
 * CheckStationMacBridge.app (Option A — in-process native module only).
 */
const fs = require("node:fs");
const path = require("node:path");
const { resolveAppPath, ensureElectronTeamId } = require("./mas-bridge-sign.cjs");

function assertNoNestedDuplicateIdentityApp(appPath) {
  const resources = path.join(appPath, "Contents", "Resources");
  const forbidden = path.join(resources, "CheckStationMacBridge.app");
  if (fs.existsSync(forbidden)) {
    throw new Error(
      `MAS package must not contain CheckStationMacBridge.app (found ${forbidden}). ` +
        "Option A uses an in-process native module under the main app identity only.",
    );
  }

  // Fail if any nested .app under Resources claims the main MAS bundle id.
  const mainBundleId = "app.checkstation.client";
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name.endsWith(".app")) {
        const info = path.join(full, "Contents", "Info.plist");
        if (fs.existsSync(info)) {
          const text = fs.readFileSync(info, "utf8");
          if (text.includes(`<string>${mainBundleId}</string>`)) {
            throw new Error(
              `Nested app ${full} must not use bundle id ${mainBundleId} ` +
                "(duplicate Apple application identity).",
            );
          }
        }
      } else if (entry.isDirectory() && entry.name !== "MacOS") {
        walk(full);
      }
    }
  }
  walk(resources);
}

exports.default = async function afterPack(context) {
  const distribution = String(process.env.CHECKSTATION_DESKTOP_DISTRIBUTION || "").toLowerCase();
  if (distribution !== "mas") return;

  const appPath = resolveAppPath(context);
  ensureElectronTeamId(appPath);
  assertNoNestedDuplicateIdentityApp(appPath);

  const nodePath = path.join(appPath, "Contents", "Resources", "mac_apple_native.node");
  const dylibPath = path.join(appPath, "Contents", "Resources", "libCheckStationMacApple.dylib");
  if (!fs.existsSync(nodePath) || !fs.existsSync(dylibPath)) {
    throw new Error(
      "MAS package missing in-process native Apple module " +
        `(need ${path.basename(nodePath)} and ${path.basename(dylibPath)} under Resources).`,
    );
  }
  console.log("[mas-afterPack] ElectronTeamID set; native Apple module present; no MacBridge.app");
};
