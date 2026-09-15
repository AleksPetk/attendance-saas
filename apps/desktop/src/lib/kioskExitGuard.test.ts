import assert from "node:assert/strict";
import test from "node:test";
import {
  beginDesktopKioskExitGuard,
  isDesktopKioskExitGuardActive,
  resetDesktopKioskExitGuardForTests,
} from "./kioskExitGuard";

test("exit guard is inactive by default and active for a short window after begin", () => {
  resetDesktopKioskExitGuardForTests();
  assert.equal(isDesktopKioskExitGuardActive(1_000), false);
  beginDesktopKioskExitGuard(1_000);
  assert.equal(isDesktopKioskExitGuardActive(1_000), true);
  assert.equal(isDesktopKioskExitGuardActive(1_000 + 4_999), true);
  assert.equal(isDesktopKioskExitGuardActive(1_000 + 5_000), false);
});
