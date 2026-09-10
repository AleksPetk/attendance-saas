import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const appSource = await readFile(new URL("./App.jsx", import.meta.url), "utf8");

describe("workspace root redirect wiring", () => {
  it("routes bare / through WorkspaceRootRedirect instead of promo locale", () => {
    assert.match(
      appSource,
      /path="\/"\s*\n\s*element=\{<WorkspaceRootRedirect loadingSession=\{loadingSession\} session=\{session\} \/>\}/,
    );
    assert.doesNotMatch(
      appSource,
      /path="\/"\s+element=\{<RedirectToPromoLocale logicalPath="\/" \/>\}/,
    );
  });

  it("sends unauthenticated bare root to /login and authenticated root to /dashboard", () => {
    assert.match(
      appSource,
      /function WorkspaceRootRedirect\([\s\S]*?return <Navigate to="\/login" replace \/>;/,
    );
    assert.match(
      appSource,
      /function WorkspaceRootRedirect\([\s\S]*?return <Navigate to="\/dashboard" replace \/>;/,
    );
  });

  it("preserves kiosk-lock redirect for authenticated bare root and /login", () => {
    assert.match(
      appSource,
      /function WorkspaceRootRedirect\([\s\S]*?kiosk_locked[\s\S]*?kioskTargetPath\(session\.workspace\)/,
    );
    assert.match(
      appSource,
      /function RedirectIfSignedIn\([\s\S]*?kiosk_locked[\s\S]*?kioskTargetPath\(session\.workspace\)/,
    );
  });

  it("keeps protected-route and signed-in login redirects", () => {
    assert.match(appSource, /function RequireSession\([\s\S]*?Navigate to="\/login"/);
    assert.match(
      appSource,
      /function RedirectIfSignedIn\([\s\S]*?Navigate to="\/dashboard"/,
    );
    assert.match(appSource, /path="\/\*"\s*\n\s*element=\{\s*\n\s*<RequireSession/);
  });

  it("keeps unprefixed promo paths on RedirectToPromoLocale", () => {
    assert.match(
      appSource,
      /path="\/features" element=\{<RedirectToPromoLocale logicalPath="\/features" \/>\}/,
    );
    assert.match(
      appSource,
      /path="\/pricing" element=\{<RedirectToPromoLocale logicalPath="\/pricing" \/>\}/,
    );
  });
});
