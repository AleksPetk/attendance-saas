import assert from "node:assert/strict";
import test from "node:test";
import { parseAccountLink } from "./accountLinks";
test("maps only real Workspace email routes to fixed native API endpoints", () => {
  for (const [route, endpoint] of [
    ["reset-password", "/auth/reset-password/"],
    ["verify-email", "/auth/verify-email/"],
    ["verify-primary-email", "/auth/verify-primary-email/"],
    ["verify-backup-email", "/auth/verify-backup-email/"],
    ["recover-account", "/auth/recover-account/confirm/"],
    ["recover-account/verify-primary", "/auth/recover-account/verify-primary/"],
  ]) {
    assert.deepEqual(parseAccountLink("https://workspace.checkstation.app/" + route + "/uid/token")?.endpoint, endpoint);
  }
});
test("rejects unrelated links without ever navigating to them", () => {
  for (const link of ["https://example.com/verify-email/a/b", "http://workspace.checkstation.app/verify-email/a/b", "https://workspace.checkstation.app/api/auth/logout/", "https://workspace.checkstation.app/verify-email/a", "not a url"]) assert.equal(parseAccountLink(link), null);
});
