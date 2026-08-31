import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const loginSource = readFileSync(new URL("./OwnerLoginScreen.jsx", import.meta.url), "utf8");

test("owner login screen does not use fetch for oauth", () => {
  assert.doesNotMatch(loginSource, /fetch\([^)]*google\/start/);
  assert.match(loginSource, /AuthProviderButtons/);
});
