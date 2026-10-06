const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  CLIENT_ID_KEY,
  CLIENT_SECRET_KEY,
  resolveMasGoogleDesktopOAuth,
  assertMasGoogleDesktopOAuthConfigured,
  formatMasGooglePreflightError,
  writeMasGooglePackagedEnv,
  cleanupMasGooglePackagedEnv,
  stagedMasGoogleEnvPath,
  prepareMasGoogleReleaseEnv,
  loadOptionalLocalDotEnv,
} = require("./stage-mas-google-env.cjs");

const VALID_ID = "123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com";
const VALID_SECRET = "GOCSPX-test-secret-value-not-real";

test("MAS Google configured when both env vars are valid", () => {
  const resolved = resolveMasGoogleDesktopOAuth({
    [CLIENT_ID_KEY]: VALID_ID,
    [CLIENT_SECRET_KEY]: VALID_SECRET,
  });
  assert.equal(resolved.configured, true);
  assert.equal(resolved.missingClientId, false);
  assert.equal(resolved.missingSecret, false);
});

test("MAS Google preflight fails closed when client ID missing", () => {
  const env = { [CLIENT_SECRET_KEY]: VALID_SECRET };
  assert.throws(
    () => assertMasGoogleDesktopOAuthConfigured(env),
    (error) => {
      assert.match(String(error.message), /GOOGLE_DESKTOP_OAUTH_CLIENT_ID/);
      assert.doesNotMatch(String(error.message), new RegExp(VALID_SECRET));
      return error.code === "MAS_GOOGLE_OAUTH_PREFLIGHT";
    },
  );
});

test("MAS Google preflight fails closed when secret missing", () => {
  const env = { [CLIENT_ID_KEY]: VALID_ID };
  assert.throws(
    () => assertMasGoogleDesktopOAuthConfigured(env),
    (error) => {
      assert.match(String(error.message), /GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET/);
      assert.doesNotMatch(String(error.message), new RegExp(VALID_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      return true;
    },
  );
});

test("preflight error formatter never includes secret values", () => {
  const message = formatMasGooglePreflightError({
    missingClientId: true,
    missingSecret: true,
    clientId: VALID_ID,
    clientSecret: VALID_SECRET,
  });
  assert.doesNotMatch(message, /GOCSPX/);
  assert.doesNotMatch(message, new RegExp(VALID_SECRET));
});

test("staged MAS packaged env contains only required keys and is cleaned up", () => {
  const desktopRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cs-mas-google-"));
  try {
    const env = {
      [CLIENT_ID_KEY]: VALID_ID,
      [CLIENT_SECRET_KEY]: VALID_SECRET,
    };
    const staged = writeMasGooglePackagedEnv(desktopRoot, env);
    assert.equal(staged, stagedMasGoogleEnvPath(desktopRoot));
    const body = fs.readFileSync(staged, "utf8");
    assert.match(body, new RegExp(`^${CLIENT_ID_KEY}=`, "m"));
    assert.match(body, new RegExp(`^${CLIENT_SECRET_KEY}=`, "m"));
    assert.match(body, /do not commit/i);
    cleanupMasGooglePackagedEnv(desktopRoot);
    assert.equal(fs.existsSync(staged), false);
  } finally {
    fs.rmSync(desktopRoot, { recursive: true, force: true });
  }
});

test("prepareMasGoogleReleaseEnv can use release env without a local .env file", () => {
  const desktopRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cs-mas-google-clean-"));
  try {
    assert.equal(fs.existsSync(path.join(desktopRoot, ".env")), false);
    const env = {
      [CLIENT_ID_KEY]: VALID_ID,
      [CLIENT_SECRET_KEY]: VALID_SECRET,
    };
    const staged = prepareMasGoogleReleaseEnv(desktopRoot, env);
    assert.equal(fs.existsSync(staged), true);
    cleanupMasGooglePackagedEnv(desktopRoot);
  } finally {
    fs.rmSync(desktopRoot, { recursive: true, force: true });
  }
});

test("optional local .env fills missing release env for developer convenience", () => {
  const desktopRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cs-mas-google-local-"));
  try {
    fs.writeFileSync(
      path.join(desktopRoot, ".env"),
      `${CLIENT_ID_KEY}=${VALID_ID}\n${CLIENT_SECRET_KEY}=${VALID_SECRET}\n`,
      "utf8",
    );
    const env = {};
    loadOptionalLocalDotEnv(desktopRoot, env);
    assert.equal(env[CLIENT_ID_KEY], VALID_ID);
    assert.equal(env[CLIENT_SECRET_KEY], VALID_SECRET);
  } finally {
    fs.rmSync(desktopRoot, { recursive: true, force: true });
  }
});

test("build script and electron-builder use staged MAS Google env; DIRECT stays web Google", () => {
  const root = path.resolve(__dirname, "..");
  const buildScript = fs.readFileSync(path.join(root, "scripts/build-electron-variant.cjs"), "utf8");
  const builder = fs.readFileSync(path.join(root, "electron-builder.config.cjs"), "utf8");
  const googleOAuth = fs.readFileSync(path.join(root, "electron/googleOAuth.cjs"), "utf8");
  const googleWeb = fs.readFileSync(path.join(root, "electron/googleWebOAuth.cjs"), "utf8");
  const buttons = fs.readFileSync(path.join(root, "src/components/DesktopAuthProviderButtons.tsx"), "utf8");

  assert.match(buildScript, /prepareMasGoogleReleaseEnv/);
  assert.match(buildScript, /cleanupMasGooglePackagedEnv/);
  assert.match(builder, /\.env\.mas-packaged/);
  assert.match(builder, /distribution === "mas"/);
  assert.match(googleOAuth, /\/auth\/google\/native\//);
  assert.doesNotMatch(googleWeb, /GOOGLE_DESKTOP_OAUTH_CLIENT/);
  assert.match(buttons, /distribution === "mas"/);
  assert.match(buttons, /onGoogleDirectClick|requestGoogleWebOAuth/);
});
