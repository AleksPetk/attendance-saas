import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthController } from "./controller.js";
import { ApiClient } from "@checkstation/api";
import { createAppConfig } from "@checkstation/config";

describe("AuthController", () => {
  it("starts unknown and documents oauth gap", () => {
    const api = new ApiClient(createAppConfig());
    const auth = new AuthController(api);
    assert.equal(auth.getState().status, "unknown");
    assert.match(auth.getOAuthGapNote(), /deep link/i);
  });
});
