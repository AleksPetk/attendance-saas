import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  configuredWorkspaceOrigin,
  isWorkspaceAuthPath,
  isWorkspaceBrowserOrigin,
  promoAuthRedirectUrl,
  resolveAuthHandoffUrl,
} from "./siteOrigins.js";

const prodEnv = {
  VITE_API_BASE_URL: "https://workspace.checkstation.app",
  VITE_PUBLIC_SITE_URL: "https://checkstation.app",
};

describe("siteOrigins", () => {
  it("reads workspace origin from VITE_API_BASE_URL", () => {
    assert.equal(
      configuredWorkspaceOrigin(prodEnv),
      "https://workspace.checkstation.app",
    );
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

  it("classifies auth paths that must live on workspace", () => {
    assert.equal(isWorkspaceAuthPath("/login"), true);
    assert.equal(isWorkspaceAuthPath("/register"), true);
    assert.equal(isWorkspaceAuthPath("/staff-login"), true);
    assert.equal(isWorkspaceAuthPath("/forgot-password"), true);
    assert.equal(isWorkspaceAuthPath("/reset-password/u/t"), true);
    assert.equal(isWorkspaceAuthPath("/auth/google/result"), true);
    assert.equal(isWorkspaceAuthPath("/en/pricing"), false);
    assert.equal(isWorkspaceAuthPath("/contact"), false);
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
  });

  it("keeps local single-host handoff relative when no workspace origin is set", () => {
    assert.equal(resolveAuthHandoffUrl("/login", "http://localhost:5173", {}), "/login");
    assert.equal(
      promoAuthRedirectUrl("/login", "", "", "http://localhost:5173", {}),
      "",
    );
  });
});
