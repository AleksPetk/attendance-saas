/**
 * Main-process encrypted persistence for scoped kiosk-exit credentials.
 *
 * Uses Electron safeStorage (same mechanism as the Django session jar).
 * Refuses to write plaintext if encryption is unavailable.
 *
 * Stores ONLY opaque server tokens + scope metadata — never the exit PIN.
 */

const fs = require("fs");
const path = require("path");

const FILE_NAME = "kiosk-exit-credentials.bin";
const STORE_VERSION = 1;
/** Backend TTL is 30 days; local credentials older than this are discarded. */
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sanitizeKeyPart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

function entryKey(workspaceKey, groupId) {
  return `${sanitizeKeyPart(workspaceKey)}::${String(groupId)}`;
}

/**
 * @param {object} [options]
 * @param {string} [options.rootDir] - userData directory
 * @param {{ isEncryptionAvailable?: () => boolean, encryptString?: (s: string) => Buffer, decryptString?: (b: Buffer) => string }} [options.safeStorage]
 * @param {typeof fs} [options.fs]
 * @param {() => number} [options.now]
 */
function createKioskExitCredentialStore(options = {}) {
  const io = options.fs || fs;
  const nowFn = options.now || (() => Date.now());
  const safeStorage = options.safeStorage;
  const rootDir = options.rootDir;

  function filePath() {
    if (!rootDir) throw new Error("kiosk exit credential rootDir required");
    return path.join(rootDir, FILE_NAME);
  }

  function encryptionAvailable() {
    try {
      return Boolean(safeStorage?.isEncryptionAvailable?.());
    } catch {
      return false;
    }
  }

  function emptyDoc() {
    return { version: STORE_VERSION, entries: {} };
  }

  function readDoc() {
    const file = filePath();
    if (!io.existsSync(file)) return emptyDoc();
    if (!encryptionAvailable()) {
      // Corrupt/unreadable without encryption — remove rather than keep plaintext.
      try {
        io.unlinkSync(file);
      } catch {
        /* ignore */
      }
      return emptyDoc();
    }
    try {
      const buf = io.readFileSync(file);
      const raw = safeStorage.decryptString(buf);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || typeof parsed.entries !== "object") {
        return emptyDoc();
      }
      return { version: STORE_VERSION, entries: { ...parsed.entries } };
    } catch {
      try {
        io.unlinkSync(file);
      } catch {
        /* ignore */
      }
      return emptyDoc();
    }
  }

  function writeDoc(doc) {
    if (!encryptionAvailable()) {
      return { ok: false, reason: "encryption_unavailable" };
    }
    const file = filePath();
    io.mkdirSync(path.dirname(file), { recursive: true });
    const payload = JSON.stringify({
      version: STORE_VERSION,
      entries: doc.entries || {},
    });
    const encrypted = safeStorage.encryptString(payload);
    io.writeFileSync(file, encrypted);
    return { ok: true };
  }

  function isExpired(entry, now) {
    const expiresAt = Number(entry?.expiresAt);
    if (!Number.isFinite(expiresAt)) return true;
    return expiresAt <= now;
  }

  function prune(doc, now) {
    let changed = false;
    for (const [key, entry] of Object.entries(doc.entries || {})) {
      if (!entry || isExpired(entry, now)) {
        delete doc.entries[key];
        changed = true;
      }
    }
    return changed;
  }

  function save(input) {
    const workspaceKey = sanitizeKeyPart(input.workspaceKey || "unknown");
    const groupId = String(input.groupId || "").trim();
    const token = String(input.token || "").trim();
    if (!groupId || !token) return { ok: false, reason: "invalid_input" };
    if (!encryptionAvailable()) return { ok: false, reason: "encryption_unavailable" };

    const now = nowFn();
    const ttlMs = Number.isFinite(input.ttlMs) ? Number(input.ttlMs) : DEFAULT_TTL_MS;
    const doc = readDoc();
    prune(doc, now);
    const key = entryKey(workspaceKey, groupId);
    doc.entries[key] = {
      token,
      groupId,
      workspaceKey,
      savedAt: now,
      expiresAt: now + Math.max(60_000, ttlMs),
    };
    const written = writeDoc(doc);
    if (!written.ok) return written;
    return { ok: true, key, expiresAt: doc.entries[key].expiresAt };
  }

  function load(input) {
    const workspaceKey = sanitizeKeyPart(input.workspaceKey || "unknown");
    const groupId = String(input.groupId || "").trim();
    if (!groupId) return null;
    const now = nowFn();
    const doc = readDoc();
    const changed = prune(doc, now);
    if (changed) writeDoc(doc);

    const key = entryKey(workspaceKey, groupId);
    const direct = doc.entries[key];
    if (direct && !isExpired(direct, now)) {
      return {
        token: String(direct.token || ""),
        groupId: String(direct.groupId),
        workspaceKey: String(direct.workspaceKey),
        savedAt: Number(direct.savedAt) || now,
        expiresAt: Number(direct.expiresAt) || now,
      };
    }
    return null;
  }

  function clear(input = {}) {
    const doc = readDoc();
    const now = nowFn();
    prune(doc, now);
    const workspaceKey = input.workspaceKey != null ? sanitizeKeyPart(input.workspaceKey) : null;
    const groupId = input.groupId != null ? String(input.groupId).trim() : null;

    if (workspaceKey && groupId) {
      delete doc.entries[entryKey(workspaceKey, groupId)];
    } else if (workspaceKey && !groupId) {
      const prefix = `${workspaceKey}::`;
      for (const key of Object.keys(doc.entries)) {
        if (key.startsWith(prefix)) delete doc.entries[key];
      }
    } else if (!workspaceKey && groupId) {
      for (const [key, entry] of Object.entries(doc.entries)) {
        if (String(entry?.groupId) === groupId) delete doc.entries[key];
      }
    } else {
      doc.entries = {};
    }

    if (!encryptionAvailable()) {
      try {
        const file = filePath();
        if (io.existsSync(file)) io.unlinkSync(file);
      } catch {
        /* ignore */
      }
      return { ok: true };
    }
    return writeDoc(doc);
  }

  /** Restore all non-expired entries (for process restart hydrate). */
  function listValid() {
    const now = nowFn();
    const doc = readDoc();
    const changed = prune(doc, now);
    if (changed) writeDoc(doc);
    const rows = [];
    for (const entry of Object.values(doc.entries || {})) {
      if (!entry || isExpired(entry, now)) continue;
      rows.push({
        token: String(entry.token || ""),
        groupId: String(entry.groupId),
        workspaceKey: String(entry.workspaceKey),
        savedAt: Number(entry.savedAt) || now,
        expiresAt: Number(entry.expiresAt) || now,
      });
    }
    rows.sort((a, b) => b.savedAt - a.savedAt);
    return rows;
  }

  return {
    FILE_NAME,
    DEFAULT_TTL_MS,
    encryptionAvailable,
    entryKey,
    save,
    load,
    clear,
    listValid,
    // test helpers
    _readDoc: readDoc,
    _filePath: filePath,
  };
}

module.exports = {
  createKioskExitCredentialStore,
  FILE_NAME,
  DEFAULT_TTL_MS,
  sanitizeKeyPart,
  entryKey,
};
