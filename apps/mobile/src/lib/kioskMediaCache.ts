/**
 * Private persistent cache for authenticated kiosk media (photos/logos/backgrounds).
 *
 * Stores bytes under Paths.cache namespaced by workspace id. WebView still needs
 * data: URIs, so cache hits avoid re-downloading when revalidation returns 304
 * or the network fails.
 *
 * expo-file-system is loaded lazily so Node unit tests can use an in-memory store
 * without importing react-native.
 */

import type { ApiClient } from "@checkstation/api";

const ROOT_DIR_NAME = "kiosk-media-v1";

export type KioskMediaCacheOptions = {
  workspaceKey: string;
  fetchImpl?: typeof fetch;
};

export type CacheMeta = {
  url: string;
  contentType: string;
  etag?: string | null;
  lastModified?: string | null;
  contentLength?: number | null;
  savedAt: number;
};

export type KioskMediaCacheEntry = {
  bytes: Uint8Array;
  meta: CacheMeta;
};

/** Injectable store so Node tests do not need native filesystem. */
export type KioskMediaCacheStore = {
  get(workspaceKey: string, absoluteUrl: string): KioskMediaCacheEntry | null;
  set(workspaceKey: string, absoluteUrl: string, entry: KioskMediaCacheEntry): void;
  clearWorkspace(workspaceKey: string): void;
  clearAll(): void;
  has(workspaceKey: string, absoluteUrl: string): boolean;
};

function sanitizeKeyPart(value: string): string {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

export function hashMediaCacheKey(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

type ExpoFs = typeof import("expo-file-system");

let expoFsModule: ExpoFs | null = null;

function expoFs(): ExpoFs {
  if (!expoFsModule) {
    // Lazy load — keeps Node tests free of react-native transforms.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expoFsModule = require("expo-file-system") as ExpoFs;
  }
  return expoFsModule;
}

function workspaceDir(workspaceKey: string) {
  const { Directory, Paths } = expoFs();
  return new Directory(Paths.cache, ROOT_DIR_NAME, sanitizeKeyPart(workspaceKey));
}

function ensureWorkspaceDir(workspaceKey: string) {
  const dir = workspaceDir(workspaceKey);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function fileStorePaths(workspaceKey: string, absoluteUrl: string) {
  const { File } = expoFs();
  const cacheKey = hashMediaCacheKey(absoluteUrl);
  const dir = ensureWorkspaceDir(workspaceKey);
  return {
    cacheKey,
    dataFile: new File(dir, `${cacheKey}.bin`),
    metaFile: new File(dir, `${cacheKey}.json`),
  };
}

function readMeta(metaFile: { exists: boolean; textSync: () => string }): CacheMeta | null {
  try {
    if (!metaFile.exists) return null;
    const raw = metaFile.textSync();
    const parsed = JSON.parse(raw) as CacheMeta;
    if (!parsed || typeof parsed.url !== "string" || typeof parsed.contentType !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCacheFiles(
  dataFile: { exists: boolean; create: (opts: object) => void; write: (data: Uint8Array | string) => void },
  metaFile: { exists: boolean; create: (opts: object) => void; write: (data: Uint8Array | string) => void },
  bytes: Uint8Array,
  meta: CacheMeta,
): void {
  if (!dataFile.exists) dataFile.create({ intermediates: true, idempotent: true });
  dataFile.write(bytes);
  if (!metaFile.exists) metaFile.create({ intermediates: true, idempotent: true });
  metaFile.write(JSON.stringify(meta));
}

export function createMemoryKioskMediaCacheStore(): KioskMediaCacheStore {
  const map = new Map<string, KioskMediaCacheEntry>();
  const keyFor = (workspaceKey: string, absoluteUrl: string) =>
    `${sanitizeKeyPart(workspaceKey)}::${hashMediaCacheKey(absoluteUrl)}`;
  return {
    get(workspaceKey, absoluteUrl) {
      return map.get(keyFor(workspaceKey, absoluteUrl)) || null;
    },
    set(workspaceKey, absoluteUrl, entry) {
      map.set(keyFor(workspaceKey, absoluteUrl), {
        bytes: entry.bytes,
        meta: { ...entry.meta },
      });
    },
    clearWorkspace(workspaceKey) {
      const prefix = `${sanitizeKeyPart(workspaceKey)}::`;
      for (const key of [...map.keys()]) {
        if (key.startsWith(prefix)) map.delete(key);
      }
    },
    clearAll() {
      map.clear();
    },
    has(workspaceKey, absoluteUrl) {
      return map.has(keyFor(workspaceKey, absoluteUrl));
    },
  };
}

let activeStore: KioskMediaCacheStore | null = null;

/** Tests install a memory store; production uses the filesystem path below. */
export function setKioskMediaCacheStoreForTests(store: KioskMediaCacheStore | null): void {
  activeStore = store;
}

export function kioskMediaCacheFilePaths(workspaceKey: string, absoluteUrl: string) {
  return fileStorePaths(sanitizeKeyPart(workspaceKey), absoluteUrl);
}

function bytesToDataUri(bytes: Uint8Array, contentType: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  const safeType = (contentType || "image/jpeg").split(";")[0].trim() || "image/jpeg";
  return `data:${safeType};base64,${btoa(binary)}`;
}

export async function clearKioskMediaCacheForWorkspace(workspaceKey: string): Promise<void> {
  if (activeStore) {
    activeStore.clearWorkspace(workspaceKey);
    return;
  }
  const dir = workspaceDir(workspaceKey);
  if (dir.exists) dir.delete();
}

export async function clearAllKioskMediaCache(): Promise<void> {
  if (activeStore) {
    activeStore.clearAll();
    return;
  }
  const { Directory, Paths } = expoFs();
  const root = new Directory(Paths.cache, ROOT_DIR_NAME);
  if (root.exists) root.delete();
}

async function readFileEntry(workspaceKey: string, absoluteUrl: string): Promise<KioskMediaCacheEntry | null> {
  if (activeStore) {
    return activeStore.get(workspaceKey, absoluteUrl);
  }
  try {
    const { dataFile, metaFile } = fileStorePaths(workspaceKey, absoluteUrl);
    const meta = readMeta(metaFile);
    if (!meta || !dataFile.exists) return null;
    const bytes = await dataFile.bytes();
    if (!bytes?.byteLength) return null;
    return { bytes, meta };
  } catch {
    return null;
  }
}

async function writeFileEntry(
  workspaceKey: string,
  absoluteUrl: string,
  entry: KioskMediaCacheEntry,
): Promise<void> {
  if (activeStore) {
    activeStore.set(workspaceKey, absoluteUrl, entry);
    return;
  }
  try {
    const { dataFile, metaFile } = fileStorePaths(workspaceKey, absoluteUrl);
    writeCacheFiles(dataFile, metaFile, entry.bytes, entry.meta);
  } catch {
    // Cache write failures must not block rendering.
  }
}

/**
 * Load authenticated media using private disk/memory cache when valid.
 * Returns a data: URI suitable for WebView/RN Image.
 */
export async function loadAuthenticatedMediaCached(
  api: ApiClient,
  absoluteUrl: string,
  options: KioskMediaCacheOptions,
): Promise<string> {
  const workspaceKey = sanitizeKeyPart(options.workspaceKey || "unknown");
  const fetchImpl = options.fetchImpl || fetch;
  const existing = await readFileEntry(workspaceKey, absoluteUrl);

  const headers: Record<string, string> = {};
  const cookie = api.jar.cookieHeader();
  if (cookie) headers.Cookie = cookie;
  if (existing?.meta.etag) headers["If-None-Match"] = existing.meta.etag;
  if (existing?.meta.lastModified) headers["If-Modified-Since"] = existing.meta.lastModified;

  let response: Response;
  try {
    response = await fetchImpl(absoluteUrl, {
      method: "GET",
      headers,
      credentials: "include",
    });
  } catch (error) {
    if (existing) {
      return bytesToDataUri(existing.bytes, existing.meta.contentType);
    }
    throw error;
  }

  if (response.status === 304 && existing) {
    return bytesToDataUri(existing.bytes, existing.meta.contentType);
  }

  if (!response.ok) {
    if (existing) {
      return bytesToDataUri(existing.bytes, existing.meta.contentType);
    }
    throw new Error(`media request failed (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) {
    if (existing) {
      return bytesToDataUri(existing.bytes, existing.meta.contentType);
    }
    throw new Error("empty media body");
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const bytes = new Uint8Array(buffer);
  await writeFileEntry(workspaceKey, absoluteUrl, {
    bytes,
    meta: {
      url: absoluteUrl,
      contentType,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      contentLength: buffer.byteLength,
      savedAt: Date.now(),
    },
  });
  return bytesToDataUri(bytes, contentType);
}

/** Test/helper: inspect whether a URL is cached for a workspace. */
export function kioskMediaCacheExists(workspaceKey: string, absoluteUrl: string): boolean {
  if (activeStore) {
    return activeStore.has(workspaceKey, absoluteUrl);
  }
  const { dataFile, metaFile } = fileStorePaths(workspaceKey, absoluteUrl);
  return dataFile.exists && metaFile.exists;
}
