/**
 * Cross-platform Node test discovery for CheckStation workspaces.
 *
 * Shell `**` globs are unreliable across macOS/Linux/npm. This helper walks
 * directories and invokes `node --test` with an explicit file list so CI and
 * local runs execute the same tests.
 *
 * Usage:
 *   node scripts/run-node-tests.mjs [--import-tsx] <rootDir> <suffix> [<rootDir> <suffix> ...]
 *
 * Example:
 *   node ../../scripts/run-node-tests.mjs --import-tsx src .test.ts
 *   node ../../scripts/run-node-tests.mjs electron .test.cjs
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

function collectFiles(rootDir, suffix, out = []) {
  let entries;
  try {
    entries = readdirSync(rootDir, { withFileTypes: true });
  } catch (err) {
    console.error(`run-node-tests: cannot read ${rootDir}: ${err.message}`);
    process.exit(1);
  }
  for (const ent of entries) {
    if (
      ent.name === "node_modules"
      || ent.name === "dist"
      || ent.name === "build"
      || ent.name === ".git"
      || ent.name === "coverage"
    ) {
      continue;
    }
    const full = join(rootDir, ent.name);
    if (ent.isDirectory()) {
      collectFiles(full, suffix, out);
    } else if (ent.isFile() && ent.name.endsWith(suffix)) {
      out.push(full);
    }
  }
  return out;
}

const args = process.argv.slice(2);
const importTsx = args.includes("--import-tsx");
const pairs = args.filter((a) => a !== "--import-tsx");

if (pairs.length === 0 || pairs.length % 2 !== 0) {
  console.error(
    "Usage: node scripts/run-node-tests.mjs [--import-tsx] <rootDir> <suffix> [...]",
  );
  process.exit(2);
}

const files = [];
for (let i = 0; i < pairs.length; i += 2) {
  const rootDir = resolve(process.cwd(), pairs[i]);
  const suffix = pairs[i + 1];
  collectFiles(rootDir, suffix, files);
}

files.sort();

if (files.length === 0) {
  console.error("run-node-tests: no test files found");
  process.exit(1);
}

const nodeArgs = [];
if (importTsx) nodeArgs.push("--import", "tsx");
nodeArgs.push("--test", ...files);

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
