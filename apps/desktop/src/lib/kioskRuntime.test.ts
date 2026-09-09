import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rendererSource = readFileSync(fileURLToPath(new URL("../components/DesktopKioskRenderer.tsx", import.meta.url)), "utf8");
const pageSource = readFileSync(fileURLToPath(new URL("../pages/KioskPage.tsx", import.meta.url)), "utf8");
const flowSource = readFileSync(fileURLToPath(new URL("../components/DesktopKioskFlow.tsx", import.meta.url)), "utf8");
const styles = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

test("desktop runtime uses the canonical Workspace kiosk render contract", () => {
  for (const marker of [
    "data-card-template",
    "data-flow-template",
    "kr-header-inner",
    "kr-main-bg-image",
    "kr-main-overlay",
    "kr-main-content",
    "kr-main-slot",
    "data-kr-footer-layout",
  ]) {
    assert.match(rendererSource, new RegExp(marker));
  }
  assert.match(styles, /kioskRenderer\.css/);
  assert.match(styles, /kioskFlowStages\.css/);
  assert.doesNotMatch(styles, /\.kiosk-runtime>main/);
});

test("desktop action, processing, confirmation, PIN, and exit states use Workspace kiosk contracts", () => {
  assert.match(pageSource, /kiosk-flow kiosk-flow--action/);
  assert.match(pageSource, /DesktopKioskProcessing/);
  assert.match(pageSource, /DesktopKioskConfirmation/);
  assert.match(pageSource, /DesktopKioskPinDialog/);
  assert.match(pageSource, /DesktopKioskExitDialog/);
  assert.match(flowSource, /kiosk-confirmation--unified/);
  assert.match(flowSource, /kiosk-processing--unified/);
  assert.match(flowSource, /kiosk-modal-backdrop/);
  assert.match(styles, /confirmationFlow\.css/);
  assert.match(styles, /processingFlow\.css/);
});

test("desktop runtime normalizes and refetches the latest live design", () => {
  assert.match(pageSource, /normalizeKioskDesignDocument\(data\.visual_design\)/);
  assert.match(pageSource, /api\.get<Record<string, any>>\(endpoints\.kiosk\(groupId\)\)/);
  assert.match(pageSource, /window\.addEventListener\("focus", refresh\)/);
  assert.match(pageSource, /document\.addEventListener\("visibilitychange", refresh\)/);
  assert.match(pageSource, /<DesktopKioskRenderer design=\{design\}/);
});

test("desktop runtime routes every saved media field through authenticated asset loading", () => {
  assert.match(rendererSource, /useAuthenticatedAsset\(design\.header_logo_url\)/);
  assert.match(rendererSource, /useAuthenticatedAsset\(design\.footer_logo_url\)/);
  assert.match(rendererSource, /useAuthenticatedAsset\(design\.main_background_image_url\)/);
});
