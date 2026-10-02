const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

test("productTourPrefs persists seen and locale in userData", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-tour-prefs-"));
  const electronPath = require.resolve("electron");
  const previous = Module._cache[electronPath];
  Module._cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { app: { getPath: () => dir } },
  };
  try {
    delete require.cache[require.resolve("./productTourPrefs.cjs")];
    const { readProductTourPrefs, writeProductTourPrefs } = require("./productTourPrefs.cjs");
    assert.deepEqual(readProductTourPrefs(), { version: 1, seen: false });
    const saved = writeProductTourPrefs({ seen: true, locale: "ja" });
    assert.equal(saved.seen, true);
    assert.equal(saved.locale, "ja");
    assert.deepEqual(readProductTourPrefs(), { version: 1, seen: true, locale: "ja" });
    const file = path.join(dir, "product-tour.json");
    assert.equal(fs.existsSync(file), true);
  } finally {
    if (previous) Module._cache[electronPath] = previous;
    else delete Module._cache[electronPath];
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
