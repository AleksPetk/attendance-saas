const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const main = readFileSync(join(__dirname, "main.cjs"), "utf8");

test("Window → Show CheckStation menu is installed only for macOS MAS", () => {
  assert.match(
    main,
    /const masWindowMenuEnabled = process\.platform === "darwin"\s*&& desktopDistributionInfo\.distribution === "mas";/,
  );
  assert.equal(main.match(/Menu\.setApplicationMenu\(/g)?.length, 1);
  assert.match(main, /function installMasApplicationMenu\(\) \{\s*Menu\.setApplicationMenu\(/);
  assert.equal(main.match(/installMasApplicationMenu\(\)/g)?.length, 2);
  assert.match(main, /if \(masWindowMenuEnabled\) installMasApplicationMenu\(\);/);
  assert.match(main, /label: "Show CheckStation", click: \(\) => showMainWindow\(\)/);
  assert.match(main, /\{ role: "editMenu" \}/);
  assert.match(main, /\{ role: "appMenu" \}/);
});

test("DIRECT/Windows window lifecycle handlers are unchanged", () => {
  assert.match(
    main,
    /app\.on\("activate", \(\) => \{\s*if \(BrowserWindow\.getAllWindows\(\)\.length === 0\) createWindow\(\);\s*\}\);/,
  );
  assert.match(
    main,
    /app\.on\("window-all-closed", \(\) => \{\s*if \(process\.platform !== "darwin"\) app\.quit\(\);\s*\}\);/,
  );
  assert.match(main, /if \(masWindowMenuEnabled\) \{\s*mainWindowRevealed = false;\s*win\.once\("show"/);
});
