import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAccountLink } from "./accountLinks";

describe("parseAccountLink", () => {
  it("maps canonical Workspace account links to API operations", () => {
    assert.deepEqual(parseAccountLink("https://workspace.checkstation.app/reset-password/user/token"), {
      kind: "reset", endpoint: "/auth/reset-password/", uid: "user", token: "token",
    });
    assert.deepEqual(parseAccountLink("https://workspace.checkstation.app/recover-account/user/token"), {
      kind: "recover", endpoint: "/auth/recover-account/confirm/", uid: "user", token: "token",
    });
  });

  it("rejects external, insecure, and API URLs", () => {
    for (const value of ["https://example.com/verify-email/a/b", "http://workspace.checkstation.app/verify-email/a/b", "https://workspace.checkstation.app/api/auth/logout/", "not a url"]) {
      assert.equal(parseAccountLink(value), null);
    }
  });
});
