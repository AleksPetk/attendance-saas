/**
 * Run: node --test src/ownerOAuthPublicUi.test.js src/OwnerLoginScreen.test.js src/RegisterScreen.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  OAUTH_PUBLIC_RESULT_ACTION,
  oauthPublicResultAction,
  oauthPublicResultMessage,
  oauthPublicStartUrl,
} from "./ownerOAuthPublicUi.js";

test("oauth public start url uses login intent", () => {
  assert.equal(
    oauthPublicStartUrl("http://localhost:8000", "google", "login"),
    "http://localhost:8000/api/auth/google/start/?intent=login",
  );
  assert.equal(
    oauthPublicStartUrl("http://localhost:8000", "apple", "login"),
    "http://localhost:8000/api/auth/apple/start/?intent=login",
  );
});

test("oauth public register url includes legal acknowledgement only when accepted", () => {
  assert.equal(
    oauthPublicStartUrl("http://localhost:8000", "google", "register", {
      legalAcknowledgement: true,
    }),
    "http://localhost:8000/api/auth/google/start/?intent=register&legal_acknowledgement=true",
  );
  assert.equal(
    oauthPublicStartUrl("http://localhost:8000", "apple", "register", {
      legalAcknowledgement: false,
    }),
    "http://localhost:8000/api/auth/apple/start/?intent=register",
  );
});

test("oauth public result actions map success and 2fa", () => {
  assert.equal(oauthPublicResultAction("success"), OAUTH_PUBLIC_RESULT_ACTION.ENTER_WORKSPACE);
  assert.equal(oauthPublicResultAction("two_factor_required"), OAUTH_PUBLIC_RESULT_ACTION.TWO_FACTOR);
});

test("existing-account collision maps to login guidance", () => {
  assert.equal(
    oauthPublicResultAction("existing_account_connect_required"),
    OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR_WITH_LOGIN,
  );
  assert.match(
    oauthPublicResultMessage("google", "existing_account_connect_required"),
    /Account → Security/,
  );
});

test("no-account login maps to register path", () => {
  assert.equal(oauthPublicResultAction("no_account"), OAUTH_PUBLIC_RESULT_ACTION.SHOW_ERROR_WITH_REGISTER);
  assert.match(oauthPublicResultMessage("apple", "no_account"), /Create an account/);
});

test("oauth public messages avoid raw provider errors", () => {
  assert.match(oauthPublicResultMessage("google", "authentication_failed"), /Try again/);
  assert.doesNotMatch(oauthPublicResultMessage("google", "authentication_failed"), /Exception|traceback/i);
});

const loginSource = readFileSync(new URL("./OwnerLoginScreen.jsx", import.meta.url), "utf8");
const registerSource = readFileSync(new URL("./RegisterScreen.jsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const resultSource = readFileSync(new URL("./OwnerOAuthResultScreen.jsx", import.meta.url), "utf8");

test("owner login keeps password form and adds provider buttons", () => {
  assert.match(loginSource, /api\.loginOwner/);
  assert.match(loginSource, /AuthProviderButtons intent="login"/);
  assert.match(loginSource, /owner2faChallenge/);
  assert.match(loginSource, /two_factor/);
});

test("register oauth buttons require legal acknowledgement before start", () => {
  assert.match(registerSource, /legalAcknowledged=\{legalAcknowledgement\}/);
  assert.match(registerSource, /onLegalRequired/);
  assert.match(registerSource, /REGISTRATION_LEGAL_REQUIRED_MESSAGE/);
  assert.match(registerSource, /api\.registerOwner/);
});

test("oauth result routes are registered separately from account security", () => {
  assert.match(appSource, /path="\/auth\/google\/result"/);
  assert.match(appSource, /path="\/auth\/apple\/result"/);
  assert.match(resultSource, /loadWorkspace/);
  assert.match(resultSource, /owner2faChallenge|\/login\?two_factor=1/);
});
