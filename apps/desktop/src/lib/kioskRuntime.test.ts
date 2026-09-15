import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rendererSource = readFileSync(fileURLToPath(new URL("../components/DesktopKioskRenderer.tsx", import.meta.url)), "utf8");
const pageSource = readFileSync(fileURLToPath(new URL("../pages/KioskPage.tsx", import.meta.url)), "utf8");
const flowSource = readFileSync(fileURLToPath(new URL("../components/DesktopKioskFlow.tsx", import.meta.url)), "utf8");
const appSource = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
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

test("desktop success audio reuses the Workspace confirmation effect and server sound gate", () => {
  assert.match(pageSource, /frontend\/src\/kiosk\/confirmationEffects\.js/);
  assert.match(pageSource, /primeConfirmationAudio\(\{ enabled: config\.confirmation\.sound_enabled !== false \}\)/);
  assert.match(pageSource, /shouldRunConfirmationEffects\(/);
  assert.match(pageSource, /playConfirmationTone\(\{ enabled: confirmationEffect!\.sound_enabled \}\)/);
  assert.match(pageSource, /sound_enabled: response\.confirmation\?\.sound_enabled \?\? config\.confirmation\.sound_enabled !== false/);

  const perform = pageSource.slice(pageSource.indexOf("async function perform("), pageSource.indexOf("async function openClass("));
  assert.ok(perform.indexOf("await api.post") < perform.indexOf("setConfirmationEffect"), "sound is scheduled only after a successful perform response");
  assert.ok(perform.indexOf("setConfirmationEffect") < perform.indexOf("} catch (caught)"), "failed actions never schedule the success sound");
});

test("successful kiosk exit clears local lock before navigation and skips remount re-enter", () => {
  assert.match(pageSource, /beginDesktopKioskExitGuard\(\)/);
  assert.match(pageSource, /isDesktopKioskExitGuardActive\(\)/);
  assert.match(pageSource, /exiting\.current = true/);
  assert.match(pageSource, /auth\.applyKioskUnlock\(response\)/);
  assert.match(pageSource, /flushSync\(/);
  assert.match(pageSource, /navigate\("\/", \{ replace: true \}\)/);
  assert.match(pageSource, /endpoints\.kioskExit\(\), \{ exit_code: exitCode \}/);

  const exit = pageSource.slice(pageSource.indexOf("async function exit("), pageSource.indexOf("function reset("));
  assert.ok(exit.indexOf("exiting.current = true") < exit.indexOf("beginDesktopKioskExitGuard"));
  assert.ok(exit.indexOf("beginDesktopKioskExitGuard") < exit.indexOf("applyKioskUnlock"));
  assert.ok(exit.indexOf("applyKioskUnlock") < exit.indexOf('navigate("/", { replace: true })'));
  assert.doesNotMatch(exit, /await auth\.bootstrap\(\)/);
  assert.doesNotMatch(exit, /group_id:/);

  const load = pageSource.slice(pageSource.indexOf("const load = useCallback"), pageSource.indexOf("useEffect(() => {"));
  assert.ok(load.includes("isDesktopKioskExitGuardActive"));
  assert.ok(load.includes("exiting.current"));
  assert.match(load, /if \(exiting\.current \|\| isDesktopKioskExitGuardActive\(\)\)/);
});

test("wrong exit password path does not unlock or navigate away", () => {
  const exit = pageSource.slice(pageSource.indexOf("async function exit("), pageSource.indexOf("function reset("));
  assert.match(exit, /setExitError\(/);
  assert.match(exit, /} catch \(caught\)/);
  // Unlock + navigate only live in the try path before catch.
  const tryBlock = exit.slice(0, exit.indexOf("} catch (caught)"));
  assert.match(tryBlock, /applyKioskUnlock/);
  assert.match(tryBlock, /navigate\("\/", \{ replace: true \}\)/);
  const catchBlock = exit.slice(exit.indexOf("} catch (caught)"));
  assert.match(catchBlock, /setExitError\(/);
  assert.match(catchBlock, /exiting\.current = false/);
  assert.doesNotMatch(catchBlock, /applyKioskUnlock/);
  assert.doesNotMatch(catchBlock, /navigate\(/);
});

test("desktop runtime normalizes and refetches the latest live design", () => {
  assert.match(pageSource, /normalizeKioskDesignDocument\(data\.visual_design\)/);
  assert.match(pageSource, /api\.get<Record<string, any>>\(endpoints\.kiosk\(groupId\)\)/);
  assert.match(pageSource, /useForegroundRefresh\(\(\) => load\(\)\)/);
  assert.match(pageSource, /<DesktopKioskRenderer design=\{design\}/);
});

test("kiosk route stays mounted across lock state; missing lock id uses recovery UI", () => {
  assert.match(appSource, /path="\/kiosk\/:groupId" element=\{<KioskPage \/>\}/);
  assert.equal([...appSource.matchAll(/path="\/kiosk\/:groupId"/g)].length, 1);
  assert.match(appSource, /resolveLockedGroupId/);
  assert.match(appSource, /KioskLockRecoveryPage/);
  assert.match(appSource, /DesktopErrorBoundary/);
  // Exit-guard must not Navigate away while still locked (redirect loop → blank window).
  assert.doesNotMatch(appSource, /function KioskRoute/);
  assert.doesNotMatch(appSource, /isDesktopKioskExitGuardActive/);
});

test("restored locked kiosk skips enter POST when session already locked", () => {
  const load = pageSource.slice(pageSource.indexOf("const load = useCallback"), pageSource.indexOf("useEffect(() => {"));
  assert.match(load, /alreadyLocked/);
  assert.match(load, /if \(!entered\.current && !alreadyLocked\)/);
  assert.match(load, /else if \(!entered\.current && alreadyLocked\)/);
  assert.match(load, /exiting\.current \|\| isDesktopKioskExitGuardActive/);
});

test("class and person initials tolerate null names (no blank React crash)", () => {
  assert.match(pageSource, /from "\.\.\/lib\/kioskInitials"/);
  assert.match(pageSource, /kioskParticipantDisplayName\(person\.name, t\("kiosk\.participantFallback"\)\)/);
  assert.match(pageSource, /kioskParticipantDisplayName\(participant\.name, t\("kiosk\.participantFallback"\)\)/);
  const initialsSource = readFileSync(fileURLToPath(new URL("./kioskInitials.ts", import.meta.url)), "utf8");
  assert.match(initialsSource, /String\(name \|\| ""\)/);
  assert.match(initialsSource, /export function kioskParticipantDisplayName/);
  // Class cards do not invent participantFallback (browser passes section.name through).
  assert.doesNotMatch(pageSource, /kioskParticipantDisplayName\(section/);
});

test("desktop runtime routes every saved media field through authenticated asset loading", () => {
  assert.match(rendererSource, /useAuthenticatedAsset\(design\.header_logo_url\)/);
  assert.match(rendererSource, /useAuthenticatedAsset\(design\.footer_logo_url\)/);
  assert.match(rendererSource, /useAuthenticatedAsset\(design\.main_background_image_url\)/);
});
