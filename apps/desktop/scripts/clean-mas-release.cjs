#!/usr/bin/env node
/**
 * Remove temporary MAS packaging outputs after TestFlight upload.
 * Keeps DIRECT artifacts under release/direct/ untouched.
 *
 * Usage: node scripts/clean-mas-release.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const releaseRoot = path.resolve(__dirname, "../release");
const targets = [
  path.join(releaseRoot, "mas"),
  path.join(releaseRoot, "mac-arm64"),
  path.join(releaseRoot, "builder-debug.yml"),
];

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[checkstation-desktop] removed ${path.relative(path.resolve(__dirname, ".."), target)}`);
}

console.log("[checkstation-desktop] MAS/legacy release cleanup done");
