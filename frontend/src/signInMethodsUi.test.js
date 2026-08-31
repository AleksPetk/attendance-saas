/**
 * Run: node --test src/signInMethodsUi.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isOAuthVerifiedResult,
  isPasswordNotAvailableError,
  oauthAccountSecurityResultMessage,
  oauthStartUrl,
  otherLinkedProviderForReauth,
  signInMethodsStatusPills,
  signInMethodsStatusSummary,
} from "./signInMethodsUi.js";

const passwordOnly = {
  password: { enabled: true },
  google: { linked: false },
  apple: { linked: false },
  can_unlink_google: false,
  can_unlink_apple: false,
};

const googleOnly = {
  password: { enabled: false },
  google: { linked: true, provider_email: "owner@gmail.com" },
  apple: { linked: false },
  can_unlink_google: false,
  can_unlink_apple: false,
};

test("sign-in methods summary reflects password and provider state", () => {
  assert.match(signInMethodsStatusSummary(passwordOnly), /Password: Connected/);
  assert.match(signInMethodsStatusSummary(googleOnly), /Password: Not set/);
  assert.match(signInMethodsStatusSummary(googleOnly), /Google: Connected/);
});

test("sign-in methods pills show connected password", () => {
  const pills = signInMethodsStatusPills(passwordOnly);
  assert.equal(pills[0].label, "Password connected");
  assert.equal(pills[0].variant, "live");
});

test("oauth start url uses backend auth route", () => {
  assert.equal(
    oauthStartUrl("http://localhost:8000", "google", "link"),
    "http://localhost:8000/api/auth/google/start/?intent=link",
  );
});

test("oauth account security messages avoid raw provider errors", () => {
  assert.match(
    oauthAccountSecurityResultMessage("google", "linked"),
    /Google is now connected/,
  );
  assert.match(
    oauthAccountSecurityResultMessage("apple", "apple_already_linked"),
    /another CheckStation account/,
  );
});

test("verified oauth result is detected", () => {
  assert.equal(isOAuthVerifiedResult("verified"), true);
  assert.equal(isOAuthVerifiedResult("linked"), false);
});

test("password-not-available errors are detected for sensitive actions", () => {
  assert.equal(
    isPasswordNotAvailableError({ data: { code: "password_not_available" } }),
    true,
  );
});

test("other linked provider excludes provider being unlinked", () => {
  const both = {
    google: { linked: true },
    apple: { linked: true },
  };
  assert.equal(otherLinkedProviderForReauth(both, "google"), "apple");
  assert.equal(otherLinkedProviderForReauth(both, "apple"), "google");
});
