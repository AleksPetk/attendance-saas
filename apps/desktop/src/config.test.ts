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
});
