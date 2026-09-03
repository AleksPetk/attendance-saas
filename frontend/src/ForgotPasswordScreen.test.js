import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./ForgotPasswordScreen.jsx", import.meta.url), "utf8");

test("password reset request submits the current UI locale", () => {
  assert.match(source, /const \{ locale \} = useLanguage\(\)/);
  assert.match(source, /api\.forgotPassword\(\{ email, locale \}\)/);
});

test("password reset locale wiring does not key or reset the email field", () => {
  assert.doesNotMatch(source, /key=\{[^}]*language|key=\{[^}]*locale/);
  assert.match(source, /const \[email, setEmail\] = useState\(""\)/);
});
