const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const main = readFileSync(join(__dirname, "main.cjs"), "utf8");

test("CheckStation application and Window menus are installed only for macOS MAS", () => {
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
  assert.doesNotMatch(main, /role: "appMenu"/);
  assert.match(main, /label: "CheckStation",\s*submenu: \[/);
  assert.match(main, /\{ role: "about", label: "About CheckStation" \}/);
  assert.match(main, /\{ role: "services" \}/);
  assert.match(main, /\{ role: "hide", label: "Hide CheckStation" \}/);
  assert.match(main, /\{ role: "hideOthers" \}/);
  assert.match(main, /\{ role: "unhide" \}/);
  assert.match(main, /\{ role: "quit", label: "Quit CheckStation" \}/);
  assert.doesNotMatch(main, /accelerator:/);
  assert.doesNotMatch(main, /app\.setName\(|app\.name\s*=/);
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
