/**
 * Run: node --test src/groupEditorForm.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupConfigFromApi,
  isGroupConfigDirty,
  normalizeGroupConfig,
} from "./groupEditorForm.js";

const EMPTY_GROUP = {
  name: "",
  actions: {
    check_in_enabled: true,
    check_out_enabled: false,
    breaks_enabled: false,
    max_breaks: 1,
  },
  participation: {
    email_required: false,
    pin_required: false,
  },
  notifications: {
    check_in: { send_email: false, email_template: "in" },
    check_out: { send_email: false, email_template: "out" },
    break: { send_email: false, email_template: "break" },
  },
};

test("hydrated config is not dirty", () => {
  const saved = groupConfigFromApi(
    {
      name: "Lobby",
      actions: { check_in_enabled: true, check_out_enabled: false, breaks_enabled: false },
      participation: { email_required: false, pin_required: false },
      notifications: {},
    },
    EMPTY_GROUP,
  );
  assert.equal(isGroupConfigDirty(saved, saved), false);
});

test("name change marks dirty", () => {
  const saved = { ...EMPTY_GROUP, name: "Lobby" };
  const draft = { ...saved, name: "Lobby 2" };
  assert.equal(isGroupConfigDirty(draft, saved), true);
});

test("disabled breaks ignore max_breaks in comparison", () => {
  const a = normalizeGroupConfig({
    ...EMPTY_GROUP,
    actions: { ...EMPTY_GROUP.actions, breaks_enabled: false, max_breaks: 3 },
  });
  const b = normalizeGroupConfig({
    ...EMPTY_GROUP,
    actions: { ...EMPTY_GROUP.actions, breaks_enabled: false, max_breaks: 1 },
  });
  assert.deepEqual(a.actions, b.actions);
});

test("disabled action omits notification block from comparison", () => {
  const saved = normalizeGroupConfig(EMPTY_GROUP);
  const draft = normalizeGroupConfig({
    ...EMPTY_GROUP,
    notifications: {
      ...EMPTY_GROUP.notifications,
      check_out: { send_email: true, email_template: "changed" },
    },
  });
  assert.equal(JSON.stringify(saved), JSON.stringify(draft));
});
