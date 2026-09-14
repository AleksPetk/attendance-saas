import assert from "node:assert/strict";
import test from "node:test";
import { endpoints } from "./endpoints.js";

test("saved sender endpoints match the production API", () => {
  assert.equal(endpoints.savedEmailSenders(), "/saved-email-senders/");
  assert.equal(endpoints.savedEmailSender(12), "/saved-email-senders/12/");
  assert.equal(endpoints.groupEmailSender(4), "/groups/4/email-sender/");
  assert.equal(endpoints.groupEmailSenderTest(4), "/groups/4/email-sender/test/");
});
