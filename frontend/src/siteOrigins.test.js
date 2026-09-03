import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalHostRedirectUrl,
  configuredPublicSiteOrigin,
  configuredWorkspaceOrigin,
  isWorkspaceAppPath,
  isWorkspaceAuthPath,
  isWorkspaceBrowserOrigin,
  promoAuthRedirectUrl,
  resolveAuthHandoffUrl,
  resolvePromoHandoffUrl,
  workspacePromoRedirectUrl,
} from "./siteOrigins.js";

const prodEnv = {
  VITE_API_BASE_URL: "https://workspace.checkstation.app",
  VITE_PUBLIC_SITE_URL: "https://checkstation.app",
};

describe("siteOrigins", () => {
  it("reads workspace and public origins from Vite env", () => {
    assert.equal(
      configuredWorkspaceOrigin(prodEnv),
      "https://workspace.checkstation.app",
    );
    assert.equal(configuredPublicSiteOrigin(prodEnv), "https://checkstation.app");
  });

  it("treats only the configured workspace host as credentialed", () => {
    assert.equal(
      isWorkspaceBrowserOrigin("https://workspace.checkstation.app", prodEnv),
      true,
    );
    assert.equal(
      isWorkspaceBrowserOrigin("https://checkstation.app", prodEnv),
      false,
    );
  });

  it("classifies auth and workspace app paths", () => {
    assert.equal(isWorkspaceAuthPath("/login"), true);
    assert.equal(isWorkspaceAuthPath("/register"), true);
    assert.equal(isWorkspaceAuthPath("/staff-login"), true);
    assert.equal(isWorkspaceAuthPath("/forgot-password"), true);
    assert.equal(isWorkspaceAuthPath("/reset-password/u/t"), true);
    assert.equal(isWorkspaceAuthPath("/auth/google/result"), true);
    assert.equal(isWorkspaceAuthPath("/en/pricing"), false);
    assert.equal(isWorkspaceAuthPath("/contact"), false);
    assert.equal(isWorkspaceAppPath("/dashboard"), true);
    assert.equal(isWorkspaceAppPath("/groups/1"), true);
    assert.equal(isWorkspaceAppPath("/kiosk/abc"), true);
    assert.equal(isWorkspaceAppPath("/en/features"), false);
  });

  it("hands promo Login off to the workspace origin", () => {
    assert.equal(
      resolveAuthHandoffUrl("/login", "https://checkstation.app", prodEnv),
      "https://workspace.checkstation.app/login",
    );
    assert.equal(
      resolveAuthHandoffUrl("/login", "https://workspace.checkstation.app", prodEnv),
      "/login",
    );
  });

  it("hands workspace promo links off to the public origin", () => {
    assert.equal(
      resolvePromoHandoffUrl("/en/features", "https://workspace.checkstation.app", prodEnv),
      "https://checkstation.app/en/features",
    );
    assert.equal(
      resolvePromoHandoffUrl("/en/features", "https://checkstation.app", prodEnv),
      "/en/features",
    );
    assert.equal(
      resolvePromoHandoffUrl("/", "https://workspace.checkstation.app", prodEnv),
      "https://checkstation.app/",
    );
  });

  it("redirects promo auth deep-links to workspace", () => {
    assert.equal(
      promoAuthRedirectUrl(
        "/login",
        "?verified=1",
        "",
        "https://checkstation.app",
        prodEnv,
      ),
      "https://workspace.checkstation.app/login?verified=1",
    );
    assert.equal(
      promoAuthRedirectUrl(
        "/login",
        "",
        "",
        "https://workspace.checkstation.app",
        prodEnv,
      ),
      "",
    );
    assert.equal(
      promoAuthRedirectUrl(
        "/en/pricing",
        "",
        "",
        "https://checkstation.app",
        prodEnv,
      ),
      "",
    );
    assert.equal(
      promoAuthRedirectUrl(
        "/dashboard",
        "",
        "#top",
        "https://checkstation.app",
        prodEnv,
      ),
      "https://workspace.checkstation.app/dashboard#top",
    );
  });

  it("redirects workspace promo deep-links to the public site", () => {
    assert.equal(
      workspacePromoRedirectUrl(
        "/en/features",
        "?ref=1",
        "#cta",
        "https://workspace.checkstation.app",
        prodEnv,
      ),
      "https://checkstation.app/en/features?ref=1#cta",
    );
    assert.equal(
      workspacePromoRedirectUrl(
        "/ja/pricing",
        "",
        "",
        "https://workspace.checkstation.app",
        prodEnv,
      ),
      "https://checkstation.app/ja/pricing",
    );
    assert.equal(
      workspacePromoRedirectUrl(
        "/how-it-works",
        "",
        "",
        "https://workspace.checkstation.app",
        prodEnv,
      ),
      "https://checkstation.app/how-it-works",
    );
    assert.equal(
      workspacePromoRedirectUrl(
        "/en/features",
        "",
        "",
        "https://checkstation.app",
        prodEnv,
      ),
      "",
    );
    assert.equal(
      workspacePromoRedirectUrl(
        "/login",
        "",
        "",
        "https://workspace.checkstation.app",
        prodEnv,
      ),
      "",
    );
  });

  it("canonicalizes both directions without same-origin loops", () => {
    assert.equal(
      canonicalHostRedirectUrl(
        "/en/features",
        "",
        "",
        "https://workspace.checkstation.app",
        prodEnv,
      ),
      "https://checkstation.app/en/features",
    );
    assert.equal(
      canonicalHostRedirectUrl(
        "/login",
        "",
        "",
        "https://checkstation.app",
        prodEnv,
      ),
      "https://workspace.checkstation.app/login",
    );
    assert.equal(
      canonicalHostRedirectUrl(
        "/login",
        "",
        "",
        "https://workspace.checkstation.app",
        prodEnv,
      ),
      "",
    );
    assert.equal(
      canonicalHostRedirectUrl(
        "/en/features",
        "",
        "",
        "https://checkstation.app",
        prodEnv,
      ),
      "",
    );
  });

  it("keeps local single-host handoff relative when no workspace origin is set", () => {
    assert.equal(resolveAuthHandoffUrl("/login", "http://localhost:5173", {}), "/login");
    assert.equal(
      resolvePromoHandoffUrl("/en/features", "http://localhost:5173", {}),
      "/en/features",
    );
    assert.equal(
      promoAuthRedirectUrl("/login", "", "", "http://localhost:5173", {}),
      "",
    );
    assert.equal(
      workspacePromoRedirectUrl(
        "/en/features",
        "",
        "",
        "http://localhost:5173",
        {},
      ),
      "",
    );
  });
});
