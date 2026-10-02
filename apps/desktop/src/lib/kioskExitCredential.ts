/**
 * Desktop kiosk-exit credential: in-memory fast path + encrypted disk restore.
 *
 * Disk persistence lives in Electron main via safeStorage (see
 * electron/kioskExitCredentialStore.cjs). Stores ONLY the opaque server token
 * (never the exit PIN). Cleared on successful exit, logout, and workspace switch.
 */

import {
  clearDesktopKioskActive,
  markDesktopKioskSessionExpired,
  setDesktopKioskActive,
} from "./kioskSessionLock";

export type KioskExitCredentialScope = {
  workspaceKey?: string | number | null;
};

type MemoryEntry = {
  token: string;
  workspaceKey: string;
  groupId: string;
  savedAt: number;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const memory = new Map<string, MemoryEntry>();

function sanitizeKeyPart(value: string): string {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

function memoryKey(workspaceKey: string, groupId: string | number): string {
  return `${sanitizeKeyPart(workspaceKey)}::${String(groupId)}`;
}

function bridge() {
  return typeof window !== "undefined" ? window.checkstationDesktop : undefined;
}

function isExpired(entry: MemoryEntry, now = Date.now()): boolean {
  return !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now;
}

function pruneMemory(now = Date.now()): void {
  for (const [key, entry] of memory.entries()) {
    if (isExpired(entry, now)) memory.delete(key);
  }
}

export function saveKioskExitToken(
  groupId: string | number,
  token: string,
  scope?: KioskExitCredentialScope,
): Promise<void> {
  const value = String(token || "").trim();
  if (!value) return Promise.resolve();
  const workspaceKey = sanitizeKeyPart(String(scope?.workspaceKey || "unknown"));
  const now = Date.now();
  const entry: MemoryEntry = {
    token: value,
    workspaceKey,
    groupId: String(groupId),
    savedAt: now,
    expiresAt: now + DEFAULT_TTL_MS,
  };
  memory.set(memoryKey(workspaceKey, groupId), entry);
  const desktop = bridge();
  if (!desktop?.kioskExitCredentialSave) return Promise.resolve();
  return desktop.kioskExitCredentialSave({
    workspaceKey,
    groupId: String(groupId),
    token: value,
    ttlMs: DEFAULT_TTL_MS,
  }).then(() => undefined).catch(() => undefined);
}

export function loadKioskExitToken(
  groupId: string | number,
  scope?: KioskExitCredentialScope,
): string | null {
  pruneMemory();
  const workspaceKey = scope?.workspaceKey != null
    ? sanitizeKeyPart(String(scope.workspaceKey))
    : null;

  if (workspaceKey) {
    const direct = memory.get(memoryKey(workspaceKey, groupId));
    if (direct && !isExpired(direct)) return direct.token;
  } else {
    for (const entry of memory.values()) {
      if (entry.groupId === String(groupId) && !isExpired(entry)) return entry.token;
    }
  }
  return null;
}

/** Disk fallback when memory is empty (e.g. after renderer/app restart). */
export async function loadKioskExitTokenPersistent(
  groupId: string | number,
  scope?: KioskExitCredentialScope,
): Promise<string | null> {
  const cached = loadKioskExitToken(groupId, scope);
  if (cached) return cached;

  const desktop = bridge();
  if (!desktop?.kioskExitCredentialLoad && !desktop?.kioskExitCredentialList) return null;

  const remember = (row: {
    token?: string;
    workspaceKey?: string;
    groupId?: string;
    savedAt?: number;
    expiresAt?: number;
  }, fallbackWorkspace: string) => {
    const token = String(row?.token || "").trim();
    if (!token) return null;
    const workspaceKey = sanitizeKeyPart(String(row.workspaceKey || fallbackWorkspace));
    memory.set(memoryKey(workspaceKey, groupId), {
      token,
      workspaceKey,
      groupId: String(row.groupId || groupId),
      savedAt: Number(row.savedAt) || Date.now(),
      expiresAt: Number(row.expiresAt) || Date.now() + DEFAULT_TTL_MS,
    });
    return token;
  };

  try {
    if (scope?.workspaceKey != null && desktop.kioskExitCredentialLoad) {
      const workspaceKey = sanitizeKeyPart(String(scope.workspaceKey));
      const row = await desktop.kioskExitCredentialLoad({
        workspaceKey,
        groupId: String(groupId),
      });
      if (row) return remember(row, workspaceKey);
    }

    if (desktop.kioskExitCredentialList) {
      const rows = await desktop.kioskExitCredentialList();
      const match = Array.isArray(rows)
        ? rows.find((row) => String(row?.groupId) === String(groupId))
        : null;
      if (match) return remember(match, String(match.workspaceKey || "unknown"));
    }
    return null;
  } catch {
    return null;
  }
}

export function clearKioskExitToken(
  groupId: string | number,
  scope?: KioskExitCredentialScope,
): void {
  const workspaceKey = scope?.workspaceKey != null
    ? sanitizeKeyPart(String(scope.workspaceKey))
    : null;
  if (workspaceKey) {
    memory.delete(memoryKey(workspaceKey, groupId));
  } else {
    for (const [key, entry] of [...memory.entries()]) {
      if (entry.groupId === String(groupId)) memory.delete(key);
    }
  }
  const desktop = bridge();
  if (desktop?.kioskExitCredentialClear) {
    void desktop.kioskExitCredentialClear({
      workspaceKey: workspaceKey || undefined,
      groupId: String(groupId),
    }).catch(() => undefined);
  }
}

export function clearAllKioskExitTokens(): void {
  memory.clear();
  const desktop = bridge();
  if (desktop?.kioskExitCredentialClear) {
    void desktop.kioskExitCredentialClear({}).catch(() => undefined);
  }
}

export function clearKioskExitTokensForWorkspace(workspaceKey: string | number): void {
  const prefix = `${sanitizeKeyPart(String(workspaceKey))}::`;
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  const desktop = bridge();
  if (desktop?.kioskExitCredentialClear) {
    void desktop.kioskExitCredentialClear({
      workspaceKey: sanitizeKeyPart(String(workspaceKey)),
    }).catch(() => undefined);
  }
}

/**
 * Restore encrypted credentials after process restart.
 * Rehydrates memory and re-arms the kiosk lock gate when needed.
 */
export async function hydrateKioskExitCredentialsFromDisk(): Promise<{
  groupIds: string[];
  primaryGroupId: string | null;
  primaryWorkspaceKey: string | null;
}> {
  const desktop = bridge();
  if (!desktop?.kioskExitCredentialList) {
    return { groupIds: [], primaryGroupId: null, primaryWorkspaceKey: null };
  }
  try {
    const rows = await desktop.kioskExitCredentialList();
    if (!Array.isArray(rows) || !rows.length) {
      return { groupIds: [], primaryGroupId: null, primaryWorkspaceKey: null };
    }
    memory.clear();
    const groupIds: string[] = [];
    for (const row of rows) {
      const token = String(row?.token || "").trim();
      const groupId = String(row?.groupId || "").trim();
      const workspaceKey = sanitizeKeyPart(String(row?.workspaceKey || "unknown"));
      if (!token || !groupId) continue;
      memory.set(memoryKey(workspaceKey, groupId), {
        token,
        workspaceKey,
        groupId,
        savedAt: Number(row.savedAt) || Date.now(),
        expiresAt: Number(row.expiresAt) || Date.now() + DEFAULT_TTL_MS,
      });
      if (!groupIds.includes(groupId)) groupIds.push(groupId);
    }
    const primary = rows[0];
    const primaryGroupId = primary?.groupId ? String(primary.groupId) : groupIds[0] || null;
    const primaryWorkspaceKey = primary?.workspaceKey
      ? sanitizeKeyPart(String(primary.workspaceKey))
      : null;
    if (primaryGroupId) {
      setDesktopKioskActive(primaryGroupId);
    }
    return { groupIds, primaryGroupId, primaryWorkspaceKey };
  } catch {
    return { groupIds: [], primaryGroupId: null, primaryWorkspaceKey: null };
  }
}

/** After hydrate + auth bootstrap: if anonymous but credential exists, keep lock. */
export function armKioskLockFromRestoredCredentials(authStatus: string): void {
  if (authStatus !== "anonymous") return;
  pruneMemory();
  const first = [...memory.values()][0];
  if (!first) return;
  setDesktopKioskActive(first.groupId);
  markDesktopKioskSessionExpired();
}

/** Test helper — does not expose token values. */
export function hasKioskExitToken(groupId: string | number, scope?: KioskExitCredentialScope): boolean {
  return Boolean(loadKioskExitToken(groupId, scope));
}

/** Test helper — wipe memory only (does not touch disk). */
export function resetKioskExitCredentialMemoryForTests(): void {
  memory.clear();
  clearDesktopKioskActive();
}
