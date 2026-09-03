import assert from "node:assert/strict";
import test from "node:test";

import { isMissingCredentialsError } from "./api.js";

test("isMissingCredentialsError detects DRF missing-credentials payloads", () => {
  assert.equal(
    isMissingCredentialsError({
      status: 403,
      data: { detail: "Authentication credentials were not provided." },
    }),
    true,
  );
  assert.equal(
    isMissingCredentialsError({
      status: 401,
      data: { detail: "Authentication credentials were not provided." },
    }),
    true,
  );
  assert.equal(
    isMissingCredentialsError({
      status: 401,
      data: { code: "not_authenticated", detail: "Authentication credentials were not provided." },
    }),
    true,
  );
});

test("isMissingCredentialsError ignores normal login failures", () => {
  assert.equal(
    isMissingCredentialsError({
      status: 401,
      data: { detail: "Invalid email or password." },
    }),
    false,
  );
  assert.equal(
    isMissingCredentialsError({
      status: 403,
      data: { detail: "CSRF Failed: CSRF token missing." },
    }),
    false,
  );
});
