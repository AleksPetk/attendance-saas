const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { csrfOriginFromApiBase } = require("./sessionApi.cjs");

describe("desktop sessionApi helpers", () => {
  it("derives CSRF origin from API base", () => {
    assert.equal(
      csrfOriginFromApiBase("https://workspace.checkstation.app/api"),
      "https://workspace.checkstation.app",
    );
  });
});
