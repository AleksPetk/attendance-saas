/**
 * Mobile storage for the scoped kiosk-exit credential issued at kiosk start.
 *
 * Stores ONLY the opaque server token (never the exit PIN). Cleared on exit,
 * logout, and workspace/account switch.
 */

import * as SecureStore from "expo-secure-store";

const KEY_PREFIX = "checkstation.kioskExitToken.v1.";
const INDEX_KEY = "checkstation.kioskExitToken.index.v1";

function storageKey(groupId: string | number): string {
  return `${KEY_PREFIX}${String(groupId)}`;
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => String(entry));
  } catch {
    return [];
  }
}

async function writeIndex(groupIds: string[]): Promise<void> {
  const unique = [...new Set(groupIds.map(String).filter(Boolean))];
  if (!unique.length) {
    await SecureStore.deleteItemAsync(INDEX_KEY);
    return;
  }
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(unique));
}

export async function saveKioskExitToken(
  groupId: string | number,
  token: string,
): Promise<void> {
  const value = String(token || "").trim();
  if (!value) return;
  const key = storageKey(groupId);
  await SecureStore.setItemAsync(key, value);
  const index = await readIndex();
  const id = String(groupId);
  if (!index.includes(id)) {
    index.push(id);
    await writeIndex(index);
  }
}

export async function loadKioskExitToken(
  groupId: string | number,
): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(storageKey(groupId));
    const trimmed = String(value || "").trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export async function clearKioskExitToken(groupId: string | number): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(storageKey(groupId));
  } catch {
    /* ignore */
  }
  const index = await readIndex();
  await writeIndex(index.filter((entry) => entry !== String(groupId)));
}

export async function clearAllKioskExitTokens(): Promise<void> {
  const index = await readIndex();
  await Promise.all(
    index.map(async (groupId) => {
      try {
        await SecureStore.deleteItemAsync(storageKey(groupId));
      } catch {
        /* ignore */
      }
    }),
  );
  await writeIndex([]);
}
