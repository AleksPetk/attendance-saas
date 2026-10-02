/**
 * Private persistent cache for authenticated desktop kiosk media.
 * Lives under Electron userData (not Downloads/Pictures). Namespaced by workspace.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT_DIR_NAME = "kiosk-media-v1";

function sanitizeKeyPart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

function hashMediaCacheKey(input) {
  return crypto.createHash("sha256").update(String(input || "")).digest("hex").slice(0, 40);
}

function createMemoryMediaCacheStore() {
  /** @type {Map<string, { bytes: Buffer, meta: object }>} */
  const map = new Map();
  const keyFor = (workspaceKey, absoluteUrl) =>
    `${sanitizeKeyPart(workspaceKey)}::${hashMediaCacheKey(absoluteUrl)}`;
  return {
    get(workspaceKey, absoluteUrl) {
      const entry = map.get(keyFor(workspaceKey, absoluteUrl));
      if (!entry) return null;
      return { bytes: Buffer.from(entry.bytes), meta: { ...entry.meta } };
    },
    set(workspaceKey, absoluteUrl, entry) {
      map.set(keyFor(workspaceKey, absoluteUrl), {
        bytes: Buffer.from(entry.bytes),
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

function createFileMediaCacheStore(rootDir) {
  function workspaceDir(workspaceKey) {
    return path.join(rootDir, ROOT_DIR_NAME, sanitizeKeyPart(workspaceKey));
  }

  function filePaths(workspaceKey, absoluteUrl) {
    const dir = workspaceDir(workspaceKey);
    const cacheKey = hashMediaCacheKey(absoluteUrl);
    return {
      dir,
      dataFile: path.join(dir, `${cacheKey}.bin`),
      metaFile: path.join(dir, `${cacheKey}.json`),
    };
  }

  function readMeta(metaFile) {
    try {
      if (!fs.existsSync(metaFile)) return null;
      const parsed = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      if (!parsed || typeof parsed.url !== "string" || typeof parsed.contentType !== "string") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  return {
    get(workspaceKey, absoluteUrl) {
      try {
        const { dataFile, metaFile } = filePaths(workspaceKey, absoluteUrl);
        const meta = readMeta(metaFile);
        if (!meta || !fs.existsSync(dataFile)) return null;
        const bytes = fs.readFileSync(dataFile);
        if (!bytes?.byteLength) return null;
        return { bytes, meta };
      } catch {
        return null;
      }
    },
    set(workspaceKey, absoluteUrl, entry) {
      try {
        const { dir, dataFile, metaFile } = filePaths(workspaceKey, absoluteUrl);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dataFile, entry.bytes);
        fs.writeFileSync(metaFile, JSON.stringify(entry.meta));
      } catch {
        /* cache write failures must not block rendering */
      }
    },
    clearWorkspace(workspaceKey) {
      try {
        const dir = workspaceDir(workspaceKey);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
    clearAll() {
      try {
        const root = path.join(rootDir, ROOT_DIR_NAME);
        if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
    has(workspaceKey, absoluteUrl) {
      const { dataFile, metaFile } = filePaths(workspaceKey, absoluteUrl);
      return fs.existsSync(dataFile) && fs.existsSync(metaFile);
    },
    _filePaths: filePaths,
  };
}

/**
 * Resolve authenticated media with conditional GET + private cache.
 * @param {object} args
 * @param {string} args.url
 * @param {string} args.workspaceKey
 * @param {Record<string, string>} args.baseHeaders
 * @param {(url: string, init: RequestInit) => Promise<Response>} args.fetchImpl
 * @param {{ get: Function, set: Function }} args.store
 * @param {AbortSignal} [args.signal]
 */
async function loadCachedMedia(args) {
  const workspaceKey = sanitizeKeyPart(args.workspaceKey || "unknown");
  const absoluteUrl = String(args.url || "");
  const store = args.store;
  const existing = store.get(workspaceKey, absoluteUrl);

  const headers = { ...args.baseHeaders };
  if (existing?.meta?.etag) headers["If-None-Match"] = existing.meta.etag;
  if (existing?.meta?.lastModified) headers["If-Modified-Since"] = existing.meta.lastModified;

  let response;
  try {
    response = await args.fetchImpl(absoluteUrl, {
      method: "GET",
      headers,
      signal: args.signal,
    });
  } catch (error) {
    if (existing) {
      return {
        ok: true,
        status: 200,
        fromCache: true,
        cacheHit: "network_error",
        data: {
          base64: existing.bytes.toString("base64"),
          contentType: existing.meta.contentType,
          contentDisposition: "",
          etag: existing.meta.etag || null,
          lastModified: existing.meta.lastModified || null,
          bytesTransferred: 0,
        },
      };
    }
    throw error;
  }

  if (response.status === 304 && existing) {
    return {
      ok: true,
      status: 304,
      fromCache: true,
      cacheHit: "not_modified",
      data: {
        base64: existing.bytes.toString("base64"),
        contentType: existing.meta.contentType,
        contentDisposition: "",
        etag: existing.meta.etag || null,
        lastModified: existing.meta.lastModified || null,
        bytesTransferred: 0,
      },
    };
  }

  if (!response.ok) {
    if (existing) {
      return {
        ok: true,
        status: response.status,
        fromCache: true,
        cacheHit: "http_error_fallback",
        data: {
          base64: existing.bytes.toString("base64"),
          contentType: existing.meta.contentType,
          contentDisposition: "",
          etag: existing.meta.etag || null,
          lastModified: existing.meta.lastModified || null,
          bytesTransferred: 0,
        },
      };
    }
    let errorData = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }
    }
    return {
      ok: false,
      status: response.status,
      fromCache: false,
      data: errorData,
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.byteLength) {
    if (existing) {
      return {
        ok: true,
        status: 200,
        fromCache: true,
        cacheHit: "empty_body_fallback",
        data: {
          base64: existing.bytes.toString("base64"),
          contentType: existing.meta.contentType,
          contentDisposition: "",
          etag: existing.meta.etag || null,
          lastModified: existing.meta.lastModified || null,
          bytesTransferred: 0,
        },
      };
    }
    return {
      ok: false,
      status: response.status,
      fromCache: false,
      data: { detail: "empty media body" },
    };
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  store.set(workspaceKey, absoluteUrl, {
    bytes: buffer,
    meta: {
      url: absoluteUrl,
      contentType,
      etag,
      lastModified,
      contentLength: buffer.byteLength,
      savedAt: Date.now(),
    },
  });

  return {
    ok: true,
    status: response.status,
    fromCache: false,
    cacheHit: "miss",
    data: {
      base64: buffer.toString("base64"),
      contentType,
      contentDisposition: response.headers.get("content-disposition") || "",
      etag,
      lastModified,
      bytesTransferred: buffer.byteLength,
    },
  };
}

module.exports = {
  ROOT_DIR_NAME,
  sanitizeKeyPart,
  hashMediaCacheKey,
  createMemoryMediaCacheStore,
  createFileMediaCacheStore,
  loadCachedMedia,
};
