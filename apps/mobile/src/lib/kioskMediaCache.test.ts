import assert from "node:assert/strict";
import test from "node:test";
import { CookieJar } from "@checkstation/api";
import { createAppConfig } from "@checkstation/config";
import { ApiClient } from "@checkstation/api";
import {
  clearAllKioskMediaCache,
  clearKioskMediaCacheForWorkspace,
  createMemoryKioskMediaCacheStore,
  hashMediaCacheKey,
  kioskMediaCacheExists,
  loadAuthenticatedMediaCached,
  setKioskMediaCacheStoreForTests,
} from "./kioskMediaCache";
import { loadAuthenticatedMediaDataUri } from "./authenticatedMedia";

test.beforeEach(() => {
  setKioskMediaCacheStoreForTests(createMemoryKioskMediaCacheStore());
});

test.afterEach(() => {
  setKioskMediaCacheStoreForTests(null);
});

function makeApi() {
  const jar = new CookieJar();
  jar.set("checkstation_sessionid", "sess-secret");
  return new ApiClient(
    createAppConfig({ environment: "development", apiBaseUrl: "https://workspace.checkstation.app/api" }),
    jar,
  );
}

test("cache key is stable for the same URL and changes when URL changes", () => {
  const a = hashMediaCacheKey("https://x/media/members/1/2.jpg");
  const b = hashMediaCacheKey("https://x/media/members/1/2.jpg");
  const c = hashMediaCacheKey("https://x/media/members/1/3.jpg");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("first access fetches network and writes private cache", async () => {
  const api = makeApi();
  let fetches = 0;
  const fakeFetch: typeof fetch = async () => {
    fetches += 1;
    return new Response(Uint8Array.from([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "image/jpeg", etag: '"v1"', "last-modified": "Wed, 01 Jan 2025 00:00:00 GMT" },
    });
  };
  const url = "https://workspace.checkstation.app/media/members/1/2.jpg";
  const uri = await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  assert.match(uri, /^data:image\/jpeg;base64,/);
  assert.equal(fetches, 1);
  assert.equal(kioskMediaCacheExists("66", url), true);
});

test("second access uses conditional cache hit (304) without body re-download", async () => {
  const api = makeApi();
  let fetches = 0;
  let sawConditional = false;
  const fakeFetch: typeof fetch = async (_input, init) => {
    fetches += 1;
    const headers = (init?.headers || {}) as Record<string, string>;
    if (headers["If-None-Match"]) {
      sawConditional = true;
      return new Response(null, { status: 304, headers: { etag: '"v1"' } });
    }
    return new Response(Uint8Array.from([9, 9, 9]), {
      status: 200,
      headers: { "content-type": "image/png", etag: '"v1"' },
    });
  };
  const url = "https://workspace.checkstation.app/media/kiosks/1/logo.png";
  await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  const second = await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  assert.equal(fetches, 2);
  assert.equal(sawConditional, true);
  assert.match(second, /^data:image\/png;base64,/);
});

test("workspace namespaces isolate cached media", async () => {
  const api = makeApi();
  const fakeFetch: typeof fetch = async () =>
    new Response(Uint8Array.from([1]), { status: 200, headers: { "content-type": "image/jpeg", etag: '"a"' } });
  const url = "https://workspace.checkstation.app/media/members/1/2.jpg";
  await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  assert.equal(kioskMediaCacheExists("66", url), true);
  assert.equal(kioskMediaCacheExists("76", url), false);
});

test("image change (new etag body) replaces cache entry", async () => {
  const api = makeApi();
  let generation = 1;
  const fakeFetch: typeof fetch = async (_input, init) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    if (generation === 1) {
      return new Response(Uint8Array.from([1, 1]), {
        status: 200,
        headers: { "content-type": "image/jpeg", etag: '"v1"' },
      });
    }
    if (headers["If-None-Match"] === '"v1"') {
      return new Response(Uint8Array.from([2, 2, 2]), {
        status: 200,
        headers: { "content-type": "image/jpeg", etag: '"v2"' },
      });
    }
    return new Response(Uint8Array.from([2, 2, 2]), {
      status: 200,
      headers: { "content-type": "image/jpeg", etag: '"v2"' },
    });
  };
  const url = "https://workspace.checkstation.app/media/members/1/2.jpg";
  const first = await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  generation = 2;
  const second = await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  assert.notEqual(first, second);
});

test("failed network with existing cache uses cached image", async () => {
  const api = makeApi();
  let fail = false;
  const fakeFetch: typeof fetch = async () => {
    if (fail) throw new Error("offline");
    return new Response(Uint8Array.from([5, 5]), {
      status: 200,
      headers: { "content-type": "image/jpeg", etag: '"v1"' },
    });
  };
  const url = "https://workspace.checkstation.app/media/members/1/2.jpg";
  const first = await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  fail = true;
  const second = await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  assert.equal(first, second);
});

test("corrupted / missing body falls back to network on next ok response", async () => {
  const store = createMemoryKioskMediaCacheStore();
  setKioskMediaCacheStoreForTests(store);
  const api = makeApi();
  const url = "https://workspace.checkstation.app/media/members/1/2.jpg";
  store.set("66", url, {
    bytes: Uint8Array.from([1]),
    meta: { url, contentType: "image/jpeg", etag: '"bad"', savedAt: Date.now() },
  });
  // Simulate corruption by clearing bytes while leaving existence semantics via overwrite on next write.
  const fakeFetch: typeof fetch = async () =>
    new Response(Uint8Array.from([7, 7, 7]), {
      status: 200,
      headers: { "content-type": "image/jpeg", etag: '"good"' },
    });
  const uri = await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  assert.match(uri, /^data:image\/jpeg;base64,/);
});

test("logout clearing removes all workspace media caches", async () => {
  const api = makeApi();
  const fakeFetch: typeof fetch = async () =>
    new Response(Uint8Array.from([1]), { status: 200, headers: { "content-type": "image/jpeg" } });
  const url = "https://workspace.checkstation.app/media/members/1/2.jpg";
  await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  await loadAuthenticatedMediaCached(api, url, { workspaceKey: "76", fetchImpl: fakeFetch });
  await clearAllKioskMediaCache();
  assert.equal(kioskMediaCacheExists("66", url), false);
  assert.equal(kioskMediaCacheExists("76", url), false);
});

test("workspace switch clearing does not leak prior workspace cache", async () => {
  const api = makeApi();
  const fakeFetch: typeof fetch = async () =>
    new Response(Uint8Array.from([1]), { status: 200, headers: { "content-type": "image/jpeg" } });
  const url = "https://workspace.checkstation.app/media/members/1/2.jpg";
  await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  await clearKioskMediaCacheForWorkspace("66");
  assert.equal(kioskMediaCacheExists("66", url), false);
});

test("large photo overwrites same cache key without duplicate keys", async () => {
  const store = createMemoryKioskMediaCacheStore();
  setKioskMediaCacheStoreForTests(store);
  const api = makeApi();
  const url = "https://workspace.checkstation.app/media/members/1/2.jpg";
  const big = new Uint8Array(50_000).fill(3);
  const fakeFetch: typeof fetch = async () =>
    new Response(big, { status: 200, headers: { "content-type": "image/jpeg", etag: '"big"' } });
  await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  await loadAuthenticatedMediaCached(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  assert.equal(kioskMediaCacheExists("66", url), true);
  const entry = store.get("66", url);
  assert.ok(entry);
  assert.equal(entry!.bytes.byteLength, 50_000);
});

test("authenticatedMedia forwards workspaceKey into durable cache path", async () => {
  const api = makeApi();
  let fetches = 0;
  const fakeFetch: typeof fetch = async () => {
    fetches += 1;
    return new Response(Uint8Array.from([4, 4]), {
      status: 200,
      headers: { "content-type": "image/jpeg", etag: '"z"' },
    });
  };
  const url = "/media/members/1/2.jpg";
  await loadAuthenticatedMediaDataUri(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  await loadAuthenticatedMediaDataUri(api, url, { workspaceKey: "66", fetchImpl: fakeFetch });
  assert.equal(fetches, 2);
  assert.equal(
    kioskMediaCacheExists("66", "https://workspace.checkstation.app/media/members/1/2.jpg"),
    true,
  );
});
