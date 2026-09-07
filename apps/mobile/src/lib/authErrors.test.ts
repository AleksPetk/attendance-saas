/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, NetworkError } from "@checkstation/api";
import { signInErrorMessage } from "./authErrors";

const t = (key: string) => key;

describe("signInErrorMessage", () => {
  it("does not expose missing-credentials backend wording", () => {
    const error = new ApiError({
      status: 403,
      data: { detail: "Authentication credentials were not provided." },
      path: "/workspace/",
      method: "GET",
    });
    assert.equal(signInErrorMessage(error, "owner", t), "auth.sessionError");
  });

  it("uses a staff-specific message for rejected credentials", () => {
    const error = new ApiError({
      status: 401,
      data: { detail: "Invalid credentials." },
      path: "/auth/staff-login/",
      method: "POST",
    });
    assert.equal(signInErrorMessage(error, "staff", t), "auth.invalidStaffCredentials");
  });

  it("keeps useful field validation and maps connection failures", () => {
    const validation = new ApiError({
      status: 400,
      data: { email: ["Enter a valid email address."] },
      path: "/auth/login/",
      method: "POST",
    });
    assert.equal(signInErrorMessage(validation, "owner", t), "Enter a valid email address.");
    assert.equal(signInErrorMessage(new NetworkError(), "owner", t), "auth.connectionError");
  });
});
