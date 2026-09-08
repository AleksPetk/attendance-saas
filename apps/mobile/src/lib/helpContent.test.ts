import assert from "node:assert/strict";
import test from "node:test";
import { classifyContentHref, stripLeadingDocumentTitle } from "../features/help/markdown";
import { statusPollDelay, type StatusSnapshot } from "../features/help/api";

test("Help content links follow Workspace safety and native routing rules", () => {
  assert.deepEqual(classifyContentHref("/kiosk-setup"), { kind: "internal-document", slug: "kiosk-setup" });
  assert.deepEqual(classifyContentHref("/"), { kind: "internal-document", slug: "documentation" });
  assert.deepEqual(classifyContentHref("mailto:support@checkstation.app"), { kind: "external", href: "mailto:support@checkstation.app" });
  assert.equal(classifyContentHref("javascript:alert(1)").kind, "unsafe");
  assert.equal(classifyContentHref("//example.com").kind, "unsafe");
});

test("Help content removes the duplicate canonical Markdown title", () => {
  assert.equal(stripLeadingDocumentTitle("# Help\n\nBody", "Help"), "Body");
  assert.equal(stripLeadingDocumentTitle("# Other\nBody", "Help"), "# Other\nBody");
});

test("Status polling honors the canonical server interval and has a safe fallback", () => {
  assert.equal(statusPollDelay(null), 30_000);
  assert.equal(statusPollDelay({ current: { poll_interval_seconds: 45 } } as StatusSnapshot), 45_000);
});
