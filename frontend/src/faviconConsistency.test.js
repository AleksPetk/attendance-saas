import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CUSTOMER_FAVICON_FILES = [
  "favicon.ico",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon-48x48.png",
  "favicon-192x192.png",
  "apple-touch-icon.png",
];
const CUSTOMER_APP_DIRS = [
  join(ROOT, "frontend/public"),
  join(ROOT, "docs/static"),
  join(ROOT, "status/static"),
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("customer-facing apps share one canonical CheckStation favicon set", () => {
  for (const fileName of CUSTOMER_FAVICON_FILES) {
    const paths = CUSTOMER_APP_DIRS.map((dir) => join(dir, fileName));
    for (const path of paths) {
      assert.ok(existsSync(path), `missing ${path}`);
    }
    const hashes = paths.map(sha256);
    assert.equal(
      new Set(hashes).size,
      1,
      `${fileName} differs across frontend/docs/status: ${hashes.join(", ")}`,
    );
  }
});

test("customer HTML heads reference the shared favicon set, not Vite/React/logo-mark", () => {
  const htmlPaths = [
    join(ROOT, "frontend/index.html"),
    join(ROOT, "docs/static/index.html"),
    join(ROOT, "status/static/index.html"),
  ];
  for (const path of htmlPaths) {
    const html = readFileSync(path, "utf8");
    assert.match(html, /favicon\.ico\?v=20260831/);
    assert.match(html, /favicon-32x32\.png\?v=20260831/);
    assert.match(html, /apple-touch-icon\.png\?v=20260831/);
    assert.doesNotMatch(html, /vite\.svg/);
    assert.doesNotMatch(html, /react\.svg/);
    assert.doesNotMatch(html, /rel="icon"[^>]+logo-mark\.png/);
  }
});

test("Platform Admin keeps a separate favicon set under admin/img", () => {
  const adminIco = join(ROOT, "backend/core/static/admin/img/favicon.ico");
  const customerIco = join(ROOT, "frontend/public/favicon.ico");
  assert.ok(existsSync(adminIco));
  assert.notEqual(sha256(adminIco), sha256(customerIco));
  const adminLinks = readFileSync(
    join(ROOT, "backend/templates/admin/includes/favicon_links.html"),
    "utf8",
  );
  assert.match(adminLinks, /admin\/img\/favicon\.ico/);
  assert.match(adminLinks, /admin\/img\/favicon-32\.png/);
  assert.doesNotMatch(adminLinks, /frontend\/public/);
});

test("compose bind-mounts status and docs so runtime favicons track source", () => {
  const compose = readFileSync(join(ROOT, "docker-compose.yml"), "utf8");
  assert.match(compose, /status:[\s\S]*?-\s*\.\/status:\/app/);
  assert.match(compose, /docs:[\s\S]*?-\s*\.\/docs:\/app/);
});
