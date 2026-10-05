import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  kioskLockRedirectHref,
  resolveKioskAndroidBack,
  shouldRedirectAppRoutesWhileKioskLocked,
} from "./kioskAndroidBack";

describe("kiosk Android back / lock redirect", () => {
  it("opens exit PIN when Back is pressed on active kiosk", () => {
    assert.equal(
      resolveKioskAndroidBack({ exitOpen: false, sessionExpired: false }),
      "open_exit",
    );
  });

  it("closes exit sheet on Back when not session-expired", () => {
    assert.equal(
      resolveKioskAndroidBack({ exitOpen: true, sessionExpired: false }),
      "close_exit",
    );
  });

  it("keeps exit open / opens exit when session expired", () => {
    assert.equal(
      resolveKioskAndroidBack({ exitOpen: false, sessionExpired: true }),
      "open_exit",
    );
    assert.equal(
      resolveKioskAndroidBack({ exitOpen: true, sessionExpired: true }),
      "ignore",
    );
  });

  it("redirects (app) routes only while kiosk_locked with a group id", () => {
    assert.equal(shouldRedirectAppRoutesWhileKioskLocked("authenticated", 12), false);
    assert.equal(shouldRedirectAppRoutesWhileKioskLocked("kiosk_locked", null), false);
    assert.equal(shouldRedirectAppRoutesWhileKioskLocked("kiosk_locked", ""), false);
    assert.equal(shouldRedirectAppRoutesWhileKioskLocked("kiosk_locked", 42), true);
    assert.equal(kioskLockRedirectHref(42), "/kiosk/42");
  });
});
