const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createKioskExitCredentialStore,
  DEFAULT_TTL_MS,
  FILE_NAME,
  entryKey,
} = require("./kioskExitCredentialStore.cjs");

function mockSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(Buffer.from(value, "utf8").toString("base64"), "utf8"),
    decryptString: (buf) => Buffer.from(Buffer.from(buf).toString("utf8"), "base64").toString("utf8"),
  };
}

describe("kioskExitCredentialStore", () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof createKioskExitCredentialStore>} */
  let store;
  let now;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-kiosk-exit-"));
    now = 1_700_000_000_000;
    store = createKioskExitCredentialStore({
      rootDir: root,
      safeStorage: mockSafeStorage(),
      now: () => now,
    });
  });

  it("refuses plaintext when encryption is unavailable", () => {
    const locked = createKioskExitCredentialStore({
      rootDir: root,
      safeStorage: { isEncryptionAvailable: () => false },
      now: () => now,
    });
    const result = locked.save({
      workspaceKey: "ws-1",
      groupId: "10",
      token: "secret-token",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "encryption_unavailable");
    assert.equal(fs.existsSync(path.join(root, FILE_NAME)), false);
  });

  it("persists encrypted token and restores after new store instance (app restart)", () => {
    const saved = store.save({
      workspaceKey: "ws-1",
      groupId: "42",
      token: "opaque-exit-token",
    });
    assert.equal(saved.ok, true);
    assert.ok(fs.existsSync(path.join(root, FILE_NAME)));
    const raw = fs.readFileSync(path.join(root, FILE_NAME));
    assert.ok(!raw.toString("utf8").includes("opaque-exit-token"));

    const restored = createKioskExitCredentialStore({
      rootDir: root,
      safeStorage: mockSafeStorage(),
      now: () => now + 1000,
    });
    const loaded = restored.load({ workspaceKey: "ws-1", groupId: "42" });
    assert.equal(loaded?.token, "opaque-exit-token");
    assert.equal(loaded?.groupId, "42");
    assert.equal(loaded?.workspaceKey, "ws-1");
  });

  it("group A token cannot be loaded for group B", () => {
    store.save({ workspaceKey: "ws-1", groupId: "A", token: "tok-a" });
    assert.equal(store.load({ workspaceKey: "ws-1", groupId: "B" }), null);
    assert.equal(store.load({ workspaceKey: "ws-1", groupId: "A" })?.token, "tok-a");
  });

  it("workspace A token cannot appear in workspace B", () => {
    store.save({ workspaceKey: "ws-a", groupId: "7", token: "tok-a" });
    assert.equal(store.load({ workspaceKey: "ws-b", groupId: "7" }), null);
    assert.equal(store.load({ workspaceKey: "ws-a", groupId: "7" })?.token, "tok-a");
  });

  it("replaces token on new kiosk launch for same group", () => {
    store.save({ workspaceKey: "ws-1", groupId: "7", token: "old" });
    store.save({ workspaceKey: "ws-1", groupId: "7", token: "new" });
    assert.equal(store.load({ workspaceKey: "ws-1", groupId: "7" })?.token, "new");
  });

  it("clears on exit, logout (all), and workspace switch", () => {
    store.save({ workspaceKey: "ws-1", groupId: "1", token: "a" });
    store.save({ workspaceKey: "ws-1", groupId: "2", token: "b" });
    store.save({ workspaceKey: "ws-2", groupId: "3", token: "c" });

    store.clear({ workspaceKey: "ws-1", groupId: "1" });
    assert.equal(store.load({ workspaceKey: "ws-1", groupId: "1" }), null);
    assert.equal(store.load({ workspaceKey: "ws-1", groupId: "2" })?.token, "b");

    store.clear({ workspaceKey: "ws-1" });
    assert.equal(store.load({ workspaceKey: "ws-1", groupId: "2" }), null);
    assert.equal(store.load({ workspaceKey: "ws-2", groupId: "3" })?.token, "c");

    store.clear({});
    assert.equal(store.listValid().length, 0);
  });

  it("treats credentials past backend TTL as invalid and removes them", () => {
    store.save({ workspaceKey: "ws-1", groupId: "9", token: "stale" });
    now += DEFAULT_TTL_MS + 1;
    assert.equal(store.load({ workspaceKey: "ws-1", groupId: "9" }), null);
    assert.equal(store.listValid().length, 0);
  });

  it("corrupted ciphertext is discarded", () => {
    store.save({ workspaceKey: "ws-1", groupId: "1", token: "good" });
    fs.writeFileSync(path.join(root, FILE_NAME), Buffer.from("not-encrypted"));
    const loaded = store.load({ workspaceKey: "ws-1", groupId: "1" });
    assert.equal(loaded, null);
  });

  it("never stores pin/exit_code fields", () => {
    store.save({ workspaceKey: "ws-1", groupId: "1", token: "tok", exit_code: "ABCD", pin: "1234" });
    const doc = store._readDoc();
    const entry = doc.entries[entryKey("ws-1", "1")];
    assert.equal(entry.token, "tok");
    assert.equal("exit_code" in entry, false);
    assert.equal("pin" in entry, false);
  });

  it("restart recovery scenario: save → clear memory-equivalent → restore → clear after exit", () => {
    store.save({ workspaceKey: "ws-cafe", groupId: "55", token: "recover-me" });
    // Simulate process restart with a fresh store instance reading the same file.
    const afterRestart = createKioskExitCredentialStore({
      rootDir: root,
      safeStorage: mockSafeStorage(),
      now: () => now + 5_000,
    });
    const rows = afterRestart.listValid();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].token, "recover-me");
    assert.equal(rows[0].groupId, "55");
    afterRestart.clear({ workspaceKey: "ws-cafe", groupId: "55" });
    assert.equal(afterRestart.load({ workspaceKey: "ws-cafe", groupId: "55" }), null);
  });
});
