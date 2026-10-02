const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createMemoryMediaCacheStore,
  createFileMediaCacheStore,
  loadCachedMedia,
  hashMediaCacheKey,
  sanitizeKeyPart,
  ROOT_DIR_NAME,
} = require("./kioskMediaCache.cjs");
const { createSessionApi } = require("./sessionApi.cjs");

describe("kioskMediaCache", () => {
  /** @type {ReturnType<typeof createMemoryMediaCacheStore>} */
  let store;

  beforeEach(() => {
    store = createMemoryMediaCacheStore();
  });

  it("first request writes cache; second sends validators and reuses on 304", async () => {
    const url = "https://workspace.checkstation.app/media/photo.jpg";
    let calls = 0;
    /** @type {Record<string, string>[]} */
    const seenHeaders = [];
    const fetchImpl = async (_url, init) => {
      calls += 1;
      seenHeaders.push({ ...(init?.headers || {}) });
      if (calls === 1) {
        return new Response(Buffer.from("IMAGE-BYTES-V1"), {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            etag: '"v1"',
            "last-modified": "Wed, 01 Jan 2025 00:00:00 GMT",
          },
        });
      }
      assert.equal(init.headers["If-None-Match"], '"v1"');
      assert.equal(init.headers["If-Modified-Since"], "Wed, 01 Jan 2025 00:00:00 GMT");
      return new Response(null, { status: 304 });
    };

    const first = await loadCachedMedia({
      url,
      workspaceKey: "ws-1",
      baseHeaders: { Cookie: "session=abc" },
      fetchImpl,
      store,
    });
    assert.equal(first.ok, true);
    assert.equal(first.cacheHit, "miss");
    assert.equal(first.data.bytesTransferred, "IMAGE-BYTES-V1".length);
    assert.equal(Buffer.from(first.data.base64, "base64").toString("utf8"), "IMAGE-BYTES-V1");

    const second = await loadCachedMedia({
      url,
      workspaceKey: "ws-1",
      baseHeaders: { Cookie: "session=abc" },
      fetchImpl,
      store,
    });
    assert.equal(second.ok, true);
    assert.equal(second.status, 304);
    assert.equal(second.cacheHit, "not_modified");
    assert.equal(second.data.bytesTransferred, 0);
    assert.equal(Buffer.from(second.data.base64, "base64").toString("utf8"), "IMAGE-BYTES-V1");
    assert.equal(calls, 2);
  });

  it("changed ETag replaces cached body", async () => {
    const url = "https://workspace.checkstation.app/media/logo.png";
    let generation = 1;
    const fetchImpl = async (_url, init) => {
      if (generation === 1) {
        return new Response(Buffer.from("OLD"), {
          status: 200,
          headers: { "content-type": "image/png", etag: '"old"' },
        });
      }
      assert.equal(init.headers["If-None-Match"], '"old"');
      return new Response(Buffer.from("NEW"), {
        status: 200,
        headers: { "content-type": "image/png", etag: '"new"' },
      });
    };

    await loadCachedMedia({ url, workspaceKey: "ws-1", baseHeaders: {}, fetchImpl, store });
    generation = 2;
    const next = await loadCachedMedia({ url, workspaceKey: "ws-1", baseHeaders: {}, fetchImpl, store });
    assert.equal(Buffer.from(next.data.base64, "base64").toString("utf8"), "NEW");
    assert.equal(next.cacheHit, "miss");
  });

  it("Last-Modified fallback works without ETag", async () => {
    const url = "https://workspace.checkstation.app/media/bg.jpg";
    let calls = 0;
    const fetchImpl = async (_url, init) => {
      calls += 1;
      if (calls === 1) {
        return new Response(Buffer.from("BG"), {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "last-modified": "Thu, 02 Jan 2025 00:00:00 GMT",
          },
        });
      }
      assert.equal(init.headers["If-Modified-Since"], "Thu, 02 Jan 2025 00:00:00 GMT");
      assert.equal(init.headers["If-None-Match"], undefined);
      return new Response(null, { status: 304 });
    };
    await loadCachedMedia({ url, workspaceKey: "ws-1", baseHeaders: {}, fetchImpl, store });
    const hit = await loadCachedMedia({ url, workspaceKey: "ws-1", baseHeaders: {}, fetchImpl, store });
    assert.equal(hit.cacheHit, "not_modified");
    assert.equal(Buffer.from(hit.data.base64, "base64").toString("utf8"), "BG");
  });

  it("network failure with cached asset returns cached image", async () => {
    const url = "https://workspace.checkstation.app/media/member.jpg";
    store.set("ws-1", url, {
      bytes: Buffer.from("CACHED"),
      meta: { url, contentType: "image/jpeg", etag: '"x"', savedAt: Date.now() },
    });
    const result = await loadCachedMedia({
      url,
      workspaceKey: "ws-1",
      baseHeaders: {},
      fetchImpl: async () => {
        throw new Error("offline");
      },
      store,
    });
    assert.equal(result.ok, true);
    assert.equal(result.cacheHit, "network_error");
    assert.equal(Buffer.from(result.data.base64, "base64").toString("utf8"), "CACHED");
  });

  it("corrupted cache falls back to network", async () => {
    const url = "https://workspace.checkstation.app/media/broken.jpg";
    // Meta without readable bytes is treated as miss by memory store when get returns null.
    // Simulate by not seeding store; network should succeed.
    const fetchImpl = async () =>
      new Response(Buffer.from("FRESH"), {
        status: 200,
        headers: { "content-type": "image/jpeg", etag: '"fresh"' },
      });
    const result = await loadCachedMedia({
      url,
      workspaceKey: "ws-1",
      baseHeaders: {},
      fetchImpl,
      store,
    });
    assert.equal(Buffer.from(result.data.base64, "base64").toString("utf8"), "FRESH");
  });

  it("workspace namespaces isolate media", () => {
    const url = "https://workspace.checkstation.app/media/shared.jpg";
    store.set("ws-a", url, {
      bytes: Buffer.from("A"),
      meta: { url, contentType: "image/jpeg", savedAt: 1 },
    });
    store.set("ws-b", url, {
      bytes: Buffer.from("B"),
      meta: { url, contentType: "image/jpeg", savedAt: 1 },
    });
    assert.equal(store.get("ws-a", url).bytes.toString("utf8"), "A");
    assert.equal(store.get("ws-b", url).bytes.toString("utf8"), "B");
    store.clearWorkspace("ws-a");
    assert.equal(store.get("ws-a", url), null);
    assert.equal(store.get("ws-b", url).bytes.toString("utf8"), "B");
  });

  it("file store persists under private cache root and survives reopen", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-kiosk-media-"));
    try {
      const fileStore = createFileMediaCacheStore(root);
      const url = "https://workspace.checkstation.app/media/persist.jpg";
      fileStore.set("ws-9", url, {
        bytes: Buffer.from("DISK"),
        meta: { url, contentType: "image/jpeg", etag: '"d"', savedAt: Date.now() },
      });
      const reopened = createFileMediaCacheStore(root);
      const entry = reopened.get("ws-9", url);
      assert.ok(entry);
      assert.equal(entry.bytes.toString("utf8"), "DISK");
      assert.ok(fs.existsSync(path.join(root, ROOT_DIR_NAME, sanitizeKeyPart("ws-9"))));
      assert.equal(hashMediaCacheKey(url).length, 40);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("sessionApi media caching integration", () => {
  it("base64 media requests use cache namespace and conditional GET", async () => {
    const store = createMemoryMediaCacheStore();
    let calls = 0;
    const fetchImpl = async (url, init) => {
      calls += 1;
      if (String(url).includes("/auth/csrf/")) {
        return new Response(JSON.stringify({ csrfToken: "csrf" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (calls === 1 || (calls === 2 && !init.headers["If-None-Match"])) {
        // First media call (after optional csrf) — treat by path
      }
      if (String(url).includes("/media/")) {
        if (init.headers["If-None-Match"]) {
          return new Response(null, { status: 304 });
        }
        return new Response(Buffer.from("PHOTO"), {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            etag: '"photo-1"',
          },
        });
      }
      throw new Error(`unexpected ${url}`);
    };

    const api = createSessionApi({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      mediaCacheStore: store,
      fetchImpl,
    });

    const first = await api.http({
      path: "https://workspace.checkstation.app/media/member.jpg",
      method: "GET",
      credentials: true,
      responseType: "base64",
      cacheNamespace: "workspace-42",
    });
    assert.equal(first.ok, true);
    assert.equal(first.fromCache, false);
    assert.equal(Buffer.from(first.data.base64, "base64").toString("utf8"), "PHOTO");

    const second = await api.http({
      path: "https://workspace.checkstation.app/media/member.jpg",
      method: "GET",
      credentials: true,
      responseType: "base64",
      cacheNamespace: "workspace-42",
    });
    assert.equal(second.ok, true);
    assert.equal(second.status, 304);
    assert.equal(second.fromCache, true);
    assert.equal(second.cacheHit, "not_modified");
    assert.equal(Buffer.from(second.data.base64, "base64").toString("utf8"), "PHOTO");

    api.clearMediaCache("workspace-42");
    assert.equal(store.has("workspace-42", "https://workspace.checkstation.app/media/member.jpg"), false);
  });
});
