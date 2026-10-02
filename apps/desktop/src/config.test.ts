import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAppConfig } from "@checkstation/config";

describe("desktop config", () => {
  it("accepts production api base", () => {
    const config = createAppConfig({
      environment: "production",
      apiBaseUrl: "https://workspace.checkstation.app/api",
    });
    assert.equal(config.apiBaseUrl, "https://workspace.checkstation.app/api");
  });

  it("keeps direct macOS bundle id and exposes MAS client id", () => {
    const config = createAppConfig();
    assert.equal(config.macosBundleId, "app.checkstation.desktop");
    assert.equal(config.macosMasBundleId, "app.checkstation.client");
    assert.notEqual(config.macosBundleId, config.macosMasBundleId);
  });
});
