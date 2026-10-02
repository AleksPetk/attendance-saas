#!/usr/bin/env node
/**
 * Build a desktop distribution variant without editing source.
 * Usage: node scripts/build-electron-variant.cjs <direct|mas>
 *
 * MAS: real electron-builder `mas` target → App Store .pkg (requires Mac App
 * Distribution + Mac Installer Distribution + provisioning profile).
 * DIRECT: unsigned local dir packaging — never uses MAS identities.
 *
 * Release layout policy:
 * - DIRECT keeps a single persistent artifact under release/direct/
 * - MAS writes temporary artifacts under release/mas/ (clean locally after TestFlight upload)
 * - Stale top-level release/mac-arm64 or mixed outputs are removed before packaging
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeDesktopDistribution,
  getDesktopDistributionInfo,
} = require("../electron/desktopDistribution.cjs");
const {
  resolveMasSigning,
  printHumanBlocker,
} = require("./resolve-mas-signing.cjs");

const distribution = normalizeDesktopDistribution(process.argv[2] || "direct");
const info = getDesktopDistributionInfo({ distribution });
const desktopRoot = path.resolve(__dirname, "..");
const releaseRoot = path.join(desktopRoot, "release");

const env = {
  ...process.env,
  CHECKSTATION_DESKTOP_DISTRIBUTION: distribution,
  VITE_DESKTOP_DISTRIBUTION: distribution,
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

/**
 * DIRECT: wipe the entire release/ tree so only this build remains.
 * MAS: clear prior MAS output only (do not delete a kept DIRECT artifact).
 */
function prepareReleaseOutput() {
  fs.mkdirSync(releaseRoot, { recursive: true });
  if (distribution === "direct") {
    for (const entry of fs.readdirSync(releaseRoot)) {
      rmrf(path.join(releaseRoot, entry));
    }
    console.log(`[checkstation-desktop] cleaned release/ for DIRECT-only output`);
    return;
  }
  rmrf(path.join(releaseRoot, "mas"));
  // Legacy/misconfigured electron-builder output (pre-distribution dirs).
  rmrf(path.join(releaseRoot, "mac-arm64"));
  const topBuilderDebug = path.join(releaseRoot, "builder-debug.yml");
  if (fs.existsSync(topBuilderDebug)) fs.unlinkSync(topBuilderDebug);
  console.log(`[checkstation-desktop] cleaned prior MAS/legacy release outputs`);
}

function listCheckStationApps(rootDir) {
  const found = [];
  if (!fs.existsSync(rootDir)) return found;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "CheckStation.app") found.push(full);
        else stack.push(full);
      }
    }
  }
  return found;
}

console.log(
  `[checkstation-desktop] building distribution=${info.distribution} bundleId=${info.bundleId} output=${info.releaseOutputDir}`,
);

prepareReleaseOutput();

if (distribution === "mas") {
  const signing = resolveMasSigning();
  if (!signing.ready) {
    console.error(printHumanBlocker(signing));
    process.exit(2);
  }
  if (!signing.readyForMasPkg) {
    console.error("MAS App Store .pkg build requires Mac Installer Distribution in Keychain.");
    console.error(printHumanBlocker(signing));
    process.exit(2);
  }
  console.log(`[checkstation-desktop] MAS app identity=${signing.identity.identity}`);
  console.log(`[checkstation-desktop] MAS installer identity=${signing.installerIdentity}`);
  console.log(`[checkstation-desktop] MAS profile=${signing.profile.profilePath}`);
  console.log(
    `[checkstation-desktop] MAS version=${require("../package.json").version} buildVersion=${process.env.CHECKSTATION_MAS_BUILD_VERSION || "7"}`,
  );

  run("node", ["native/MacApple/build-native.cjs"]);
}

run("npx", ["vite", "build"]);

if (distribution === "mas") {
  // Real Mac App Store target (produces signed .app + .pkg). Do not use --dir.
  run("npx", [
    "electron-builder",
    "--config",
    "electron-builder.config.cjs",
    "--mac",
    "mas",
  ]);

  const pkgDir = path.join(desktopRoot, "release/mas");
  function findFiles(rootDir, predicate) {
    const out = [];
    if (!fs.existsSync(rootDir)) return out;
    const stack = [rootDir];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (predicate(entry.name, full)) out.push(full);
        if (entry.isDirectory()) stack.push(full);
      }
    }
    return out;
  }
  const foundPkg = findFiles(pkgDir, (name) => name.endsWith(".pkg"))[0];
  const foundApp = findFiles(pkgDir, (name, full) => name === "CheckStation.app" && full.includes(`${path.sep}mas`))[0]
    || findFiles(pkgDir, (name) => name === "CheckStation.app")[0];

  if (foundApp) {
    run("node", ["scripts/verify-mas-signing.cjs", foundApp]);
  } else {
    console.warn("[checkstation-desktop] CheckStation.app not found for verify; looking under release/mas…");
  }
  console.log(`[checkstation-desktop] MAS pkg=${foundPkg || "(not found)"}`);
  console.log(`[checkstation-desktop] MAS app=${foundApp || "(not found)"}`);
  console.log(
    "[checkstation-desktop] MAS output is temporary — run `npm run clean:mas-release` after TestFlight upload",
  );
} else {
  run("npx", [
    "electron-builder",
    "--config",
    "electron-builder.config.cjs",
    "--dir",
    "--mac",
  ]);

  const apps = listCheckStationApps(releaseRoot);
  if (apps.length !== 1) {
    console.error(`[checkstation-desktop] expected exactly 1 CheckStation.app under release/, found ${apps.length}:`);
    for (const app of apps) console.error(`  - ${app}`);
    process.exit(1);
  }
  const expected = path.join(releaseRoot, "direct", "mac-arm64", "CheckStation.app");
  if (path.resolve(apps[0]) !== path.resolve(expected)) {
    console.error(`[checkstation-desktop] unexpected app path:\n  got ${apps[0]}\n  expected ${expected}`);
    process.exit(1);
  }
}

console.log(
  `[checkstation-desktop] done → ${path.join(desktopRoot, info.releaseOutputDir)}`,
);
