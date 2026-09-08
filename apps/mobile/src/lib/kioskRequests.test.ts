import assert from "node:assert/strict";
import test from "node:test";
import { kioskActionPayload } from "./kioskRequests";
test("kiosk actions preserve identified Member membership and server action field", () => {
  assert.deepEqual(kioskActionPayload({ participant_kind: "member", membership_id: 24 }, "check_out", "1234", "Asia/Tokyo"), { participant_kind: "member", membership_id: 24, action: "check_out", pin: "1234", timezone: "Asia/Tokyo" });
});
test("Visitor actions never substitute a Member id", () => {
  assert.deepEqual(kioskActionPayload({ participant_kind: "group_only_participant", group_only_participant_id: 9 }, "check_in", "", ""), { participant_kind: "group_only_participant", group_only_participant_id: 9, action: "check_in" });
  assert.throws(() => kioskActionPayload({ participant_kind: "member" }, "check_in", "", ""));
});
