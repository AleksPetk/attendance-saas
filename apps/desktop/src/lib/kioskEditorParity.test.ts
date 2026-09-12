import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "../pages/KioskDesignPage.tsx"), "utf8");
const app = fs.readFileSync(path.join(here, "../App.tsx"), "utf8");

test("desktop Kiosk editor is a full-screen route outside DesktopShell", () => {
  const editorRoute = app.indexOf('<Route path="/groups/:id/kiosk-design"');
  const shellRoute = app.indexOf('<Route element={<DesktopShell />}');
  assert.ok(editorRoute > -1 && editorRoute < shellRoute);
  assert.match(source, /className="desktop-kiosk-builder"/);
  assert.doesNotMatch(source, /<Page>/);
});

test("desktop Kiosk editor loads design, group, settings, and mode-specific sections", () => {
  assert.match(source, /endpoints\.kioskDesign\(id\)/);
  assert.match(source, /endpoints\.group\(id\)/);
  assert.match(source, /endpoints\.kioskSettings\(id\)/);
  assert.match(source, /mode === "input" \? "input" : "cards"/);
  assert.match(source, /showExit=\{false\}/);
});

test("desktop Kiosk editor preserves Workspace media and history contracts", () => {
  for (const field of ["header_logo", "footer_logo", "main_background_image", "remove_header_logo", "remove_footer_logo", "remove_main_background_image"]) {
    assert.match(source, new RegExp(`body\\.append\\(\\"${field}\\"`));
  }
  assert.match(source, /setHistoryIndex\(\(value\) => Math\.max\(0, value - 1\)\)/);
  assert.match(source, /setHistoryIndex\(\(value\) => Math\.min\(history\.length - 1, value \+ 1\)\)/);
  assert.match(source, /disabled=\{!dirty \|\| saving\}/);
});

test("desktop Kiosk editor provides bounded drag and minimize controls", () => {
  assert.match(source, /setPointerCapture/);
  assert.match(source, /window\.addEventListener\("resize", reclamp\)/);
  assert.match(source, /Math\.min\(x, window\.innerWidth - width - 16\)/);
  assert.match(source, /setMinimized\(true\)/);
  assert.match(source, /setMinimized\(false\)/);
});
