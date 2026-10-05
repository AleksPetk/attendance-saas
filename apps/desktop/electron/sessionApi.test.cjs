const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createSessionApi,
  csrfOriginFromApiBase,
  resolveRequestUrl,
  SESSION_JAR_FILE_NAME,
} = require("./sessionApi.cjs");

function mockSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(Buffer.from(value, "utf8").toString("base64"), "utf8"),
    decryptString: (buf) => Buffer.from(Buffer.from(buf).toString("utf8"), "base64").toString("utf8"),
  };
}

describe("desktop sessionApi helpers", () => {
  it("derives CSRF origin from API base", () => {
    assert.equal(
      csrfOriginFromApiBase("https://workspace.checkstation.app/api"),
      "https://workspace.checkstation.app",
    );
  });
});

describe("resolveRequestUrl", () => {
  it("resolves API paths against the configured base", () => {
    assert.equal(
      resolveRequestUrl("https://workspace.checkstation.app/api", "/members/", "https://workspace.checkstation.app"),
      "https://workspace.checkstation.app/api/members/",
    );
  });

  it("allows authenticated media only from the API origin", () => {
    assert.equal(
      resolveRequestUrl("https://workspace.checkstation.app/api", "https://workspace.checkstation.app/media/member.jpg", "https://workspace.checkstation.app"),
      "https://workspace.checkstation.app/media/member.jpg",
    );
    assert.throws(
      () => resolveRequestUrl("https://workspace.checkstation.app/api", "https://example.com/member.jpg", "https://workspace.checkstation.app"),
      /External API URLs are not allowed/,
    );
  });
});

describe("desktop session jar persistence security", () => {
  /** @type {string} */
  let root;
  /** @type {string} */
  let jarPath;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-session-jar-"));
    jarPath = path.join(root, SESSION_JAR_FILE_NAME);
  });

  it("persists encrypted cookies when safeStorage is available", async () => {
    const api = createSessionApi({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      jarFilePath: jarPath,
      safeStorage: mockSafeStorage(),
      mediaCacheStore: { clearWorkspace() {}, clearAll() {} },
    });
    api._setCookie(api._SESSION_COOKIE, "session-secret");
    api._setCookie(api._CSRF_COOKIE, "csrf-secret");
    api._persist();
    assert.equal(fs.existsSync(jarPath), true);
    const raw = fs.readFileSync(jarPath);
    assert.ok(!raw.toString("utf8").includes("session-secret"));
    assert.ok(!raw.toString("utf8").includes("csrf-secret"));

    const restored = createSessionApi({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      jarFilePath: jarPath,
      safeStorage: mockSafeStorage(),
      mediaCacheStore: { clearWorkspace() {}, clearAll() {} },
    });
    await restored.initSession();
    assert.equal(restored._getCookie(api._SESSION_COOKIE), "session-secret");
    assert.equal(restored._getCookie(api._CSRF_COOKIE), "csrf-secret");
  });

  it("keeps runtime cookies in memory but writes no file when encryption unavailable", () => {
    const api = createSessionApi({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      jarFilePath: jarPath,
      safeStorage: { isEncryptionAvailable: () => false },
      mediaCacheStore: { clearWorkspace() {}, clearAll() {} },
    });
    api._setCookie(api._SESSION_COOKIE, "session-secret");
    api._setCookie(api._CSRF_COOKIE, "csrf-secret");
    api._persist();
    assert.equal(fs.existsSync(jarPath), false);
    assert.equal(api._getCookie(api._SESSION_COOKIE), "session-secret");
    assert.equal(api._getCookie(api._CSRF_COOKIE), "csrf-secret");
  });

  it("does not hydrate from disk without encryption (restart appears signed out)", async () => {
    fs.writeFileSync(jarPath, Buffer.from(JSON.stringify([
      { name: "checkstation_sessionid", value: "leaked-session", expires: null },
      { name: "checkstation_csrftoken", value: "leaked-csrf", expires: null },
    ]), "utf8"));
    const api = createSessionApi({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      jarFilePath: jarPath,
      safeStorage: { isEncryptionAvailable: () => false },
      mediaCacheStore: { clearWorkspace() {}, clearAll() {} },
    });
    await api.initSession();
    assert.equal(api._getCookie(api._SESSION_COOKIE), "");
    assert.equal(api._getCookie(api._CSRF_COOKIE), "");
    assert.equal(fs.existsSync(jarPath), false);
  });

  it("removes corrupted encrypted jar safely", async () => {
    fs.writeFileSync(jarPath, Buffer.from("not-valid-encrypted", "utf8"));
    const api = createSessionApi({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      jarFilePath: jarPath,
      safeStorage: mockSafeStorage(),
      mediaCacheStore: { clearWorkspace() {}, clearAll() {} },
    });
    await api.initSession();
    assert.equal(api._getCookie(api._SESSION_COOKIE), "");
    assert.equal(fs.existsSync(jarPath), false);
  });

  it("logout clears memory and deletes jar", async () => {
    const api = createSessionApi({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      jarFilePath: jarPath,
      safeStorage: mockSafeStorage(),
      mediaCacheStore: { clearWorkspace() {}, clearAll() {} },
    });
    api._setCookie(api._SESSION_COOKIE, "session-secret");
    api._persist();
    assert.equal(fs.existsSync(jarPath), true);
    await api.clearSession();
    assert.equal(api._getCookie(api._SESSION_COOKIE), "");
    assert.equal(fs.existsSync(jarPath), false);
  });

  it("never writes plaintext cookie/token material when encryption is unavailable", () => {
    const api = createSessionApi({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      jarFilePath: jarPath,
      safeStorage: { isEncryptionAvailable: () => false },
      mediaCacheStore: { clearWorkspace() {}, clearAll() {} },
    });
    api._setCookie(api._SESSION_COOKIE, "session-secret-value");
    api._setCookie(api._CSRF_COOKIE, "csrf-secret-value");
    api._persist();
    const entries = fs.readdirSync(root);
    assert.deepEqual(entries, []);
  });
});
