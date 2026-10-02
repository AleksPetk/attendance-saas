#!/usr/bin/env node
/**
 * Build in-process MAS Apple native module:
 *   1) Swift dylib (SIWA + StoreKit 2) → libCheckStationMacApple.dylib
 *   2) N-API addon for Electron 44 → mac_apple_native.node
 *
 * MAS-only artifact. DIRECT packaging must not include these files.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const outDir = path.join(root, "build");
const napiDir = path.join(root, "napi");
const electronVersion = "44.2.0";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    const detail = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(`${command} ${args.join(" ")}\n${detail}`);
  }
  return result;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function buildSwiftDylib() {
  ensureDir(outDir);
  const sources = [
    path.join(root, "Sources/BridgeCore.swift"),
    path.join(root, "Sources/BridgeCApi.swift"),
  ];
  const dylib = path.join(outDir, "libCheckStationMacApple.dylib");
  console.log("[mac-apple-native] compiling Swift dylib…");
  run("swiftc", [
    "-emit-library",
    "-module-name",
    "CheckStationMacApple",
    "-o",
    dylib,
    "-target",
    "arm64-apple-macosx13.0",
    "-O",
    "-framework",
    "Foundation",
    "-framework",
    "AppKit",
    "-framework",
    "AuthenticationServices",
    "-framework",
    "StoreKit",
    ...sources,
  ]);
  if (!fs.existsSync(dylib)) {
    throw new Error(`Swift dylib missing after build: ${dylib}`);
  }
  console.log(`[mac-apple-native] wrote ${dylib}`);
  return dylib;
}

function buildNapiAddon() {
  ensureDir(outDir);
  const desktopRoot = path.join(root, "../..");
  console.log(`[mac-apple-native] rebuilding N-API for Electron ${electronVersion}…`);

  const electronRebuild = path.join(desktopRoot, "node_modules/.bin/electron-rebuild");

  if (fs.existsSync(electronRebuild)) {
    run(electronRebuild, ["-f", "-w", "mac_apple_native", "-v", electronVersion], {
      cwd: napiDir,
      env: { ...process.env },
    });
  } else {
    run(
      "npx",
      [
        "--yes",
        "node-gyp@11",
        "rebuild",
        `--target=${electronVersion}`,
        "--arch=arm64",
        "--dist-url=https://electronjs.org/headers",
      ],
      {
        cwd: napiDir,
        env: { ...process.env },
      },
    );
  }

  const built = path.join(napiDir, "build/Release/mac_apple_native.node");
  if (!fs.existsSync(built)) {
    throw new Error(`N-API addon missing after build: ${built}`);
  }
  const dest = path.join(outDir, "mac_apple_native.node");
  fs.copyFileSync(built, dest);
  console.log(`[mac-apple-native] wrote ${dest}`);
  return dest;
}

function main() {
  if (process.platform !== "darwin") {
    throw new Error("mac-apple-native build is macOS-only");
  }
  buildSwiftDylib();
  buildNapiAddon();
  console.log("[mac-apple-native] done");
}

main();
