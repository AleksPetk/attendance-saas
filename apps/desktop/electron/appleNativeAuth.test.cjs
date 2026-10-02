const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const test = require("node:test");

const {
  requestAppleNativeIdentity,
  createAppleRawNonce,
  hashAppleNonceForRequest,
} = require("./appleNativeAuth.cjs");

test("appleNativeAuth hashes nonce the same way iOS expects for /auth/apple/native/", async () => {
  const raw = "abc123nonce";
  const hashed = hashAppleNonceForRequest(raw);
  assert.equal(hashed, createHash("sha256").update(raw, "utf8").digest("hex"));
  assert.equal(createAppleRawNonce().length, 64);
});

test("appleNativeAuth returns signing_required when bridge binary is missing", async () => {
  const result = await requestAppleNativeIdentity({
    invoke: async () => ({ ok: false, code: "signing_required" }),
  });
  // When invoke is injected, missing-binary check is skipped — simulate bridge response.
  assert.equal(result.kind, "signing_required");
});

test("appleNativeAuth maps success identity token + raw nonce for backend", async () => {
  const result = await requestAppleNativeIdentity({
    invoke: async (req) => {
      assert.equal(req.cmd, "appleSignIn");
      assert.equal(typeof req.hashedNonce, "string");
      assert.equal(req.hashedNonce.length, 64);
      return {
        ok: true,
        identityToken: "header.payload.sig",
        fullName: { givenName: "Ada" },
      };
    },
  });
  assert.equal(result.kind, "success");
  assert.equal(result.identityToken, "header.payload.sig");
  assert.equal(typeof result.nonce, "string");
  assert.equal(result.nonce.length, 64);
  assert.equal(result.fullName.givenName, "Ada");
});

test("appleNativeAuth maps cancelled / missing_token", async () => {
  const cancelled = await requestAppleNativeIdentity({
    invoke: async () => ({ ok: false, code: "cancelled" }),
  });
  assert.equal(cancelled.kind, "cancelled");

  const missing = await requestAppleNativeIdentity({
    invoke: async () => ({ ok: true, identityToken: "" }),
  });
  assert.equal(missing.kind, "missing_token");
});
