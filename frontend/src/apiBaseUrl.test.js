import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const apiSource = readFileSync(join(root, "api.js"), "utf8");
const viteSource = readFileSync(join(root, "../vite.config.js"), "utf8");

test("api.js has production-safe API base resolver", () => {
  assert.match(apiSource, /function resolveApiBaseUrl/);
  assert.match(apiSource, /import\.meta\.env\?\.PROD/);
  assert.match(apiSource, /Production build refused VITE_API_BASE_URL pointing at localhost/);
  // Default localhost is only for non-production branch.
  const prodBranch = apiSource.match(/if \(isProd\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(prodBranch.includes("isProd"));
  assert.doesNotMatch(prodBranch, /return "http:\/\/localhost:8000"/);
});

test("api.js prefers same-origin API when already on workspace host", () => {
  assert.match(apiSource, /window\.location\.origin === new URL\(normalized\)\.origin/);
});

test("vite production build refuses localhost API URL", () => {
  assert.match(viteSource, /assertProductionEnv/);
  assert.match(viteSource, /Production Vite build refused VITE_API_BASE_URL pointing at localhost/);
});
