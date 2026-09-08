const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { csrfOriginFromApiBase, resolveRequestUrl } = require("./sessionApi.cjs");

describe("desktop sessionApi helpers", () => {
  it("derives CSRF origin from API base", () => {
    assert.equal(
      csrfOriginFromApiBase("https://workspace.checkstation.app/api"),
      "https://workspace.checkstation.app",
    );
  });
});

describe("resolveRequestUrl", () => {
  it("resolves API paths against the configured base", () => {
    assert.equal(
      resolveRequestUrl("https://workspace.checkstation.app/api", "/members/", "https://workspace.checkstation.app"),
      "https://workspace.checkstation.app/api/members/",
    );
  });

  it("allows authenticated media only from the API origin", () => {
    assert.equal(
      resolveRequestUrl("https://workspace.checkstation.app/api", "https://workspace.checkstation.app/media/member.jpg", "https://workspace.checkstation.app"),
      "https://workspace.checkstation.app/media/member.jpg",
    );
    assert.throws(
      () => resolveRequestUrl("https://workspace.checkstation.app/api", "https://example.com/member.jpg", "https://workspace.checkstation.app"),
      /External API URLs are not allowed/,
    );
  });
});
