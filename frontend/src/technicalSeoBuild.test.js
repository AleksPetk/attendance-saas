import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const routes = JSON.parse(
  await readFile(new URL("./promo/seo-routes.json", import.meta.url), "utf8"),
);
const distUrl = new URL("../dist/", import.meta.url);

function localizedPath(locale, path) {
  return path === "/" ? `/${locale}/` : `/${locale}${path}`;
}

function outputUrl(locale, path) {
  const suffix = path === "/" ? `${locale}/index.html` : `${locale}/${path.slice(1)}/index.html`;
  return new URL(suffix, distUrl);
}

test("build emits ten canonical marketing HTML documents with raw SEO metadata", async () => {
  let count = 0;
  for (const route of routes) {
    for (const locale of ["en", "ja"]) {
      const path = localizedPath(locale, route.path);
      const html = await readFile(outputUrl(locale, route.path), "utf8");
      assert.match(html, new RegExp(`<html lang="${locale}">`));
      assert.match(html, /<title>[^<]+<\/title>/);
      assert.match(html, /<meta name="description" content="[^"]+" \/>/);
      assert.ok(
        html.includes('<meta name="google-adsense-account" content="ca-pub-7946536524469970" />'),
      );
      assert.ok(html.includes(`<link rel="canonical" href="https://checkstation.app${path}" />`));
      assert.ok(html.includes('hreflang="en"'));
      assert.ok(html.includes('hreflang="ja"'));
      assert.ok(html.includes('hreflang="x-default"'));
      assert.ok(html.includes(`<meta property="og:url" content="https://checkstation.app${path}" />`));
      assert.ok(html.includes('<meta name="twitter:card" content="summary" />'));
      assert.ok(html.includes('type="application/ld+json"'));
      assert.ok(html.includes("<noscript><main"));
      count += 1;
    }
  }
  assert.equal(count, 10);
});

test("generated sitemap contains only the ten absolute canonical marketing URLs", async () => {
  const sitemap = await readFile(new URL("sitemap.xml", distUrl), "utf8");
  assert.equal((sitemap.match(/<url>/g) || []).length, 10);
  assert.equal((sitemap.match(/<loc>https:\/\/checkstation\.app\//g) || []).length, 10);
  assert.equal((sitemap.match(/hreflang="x-default"/g) || []).length, 10);
  assert.doesNotMatch(sitemap, /workspace|manager|<lastmod>/);
  assert.doesNotMatch(sitemap, /<(loc|xhtml:link)[^>]*>[^<]*\?/);
  for (const route of routes) {
    for (const locale of ["en", "ja"]) {
      assert.ok(sitemap.includes(`<loc>https://checkstation.app${localizedPath(locale, route.path)}</loc>`));
    }
  }
});

test("robots policies are host-specific", async () => {
  const marketing = await readFile(new URL("robots.txt", distUrl), "utf8");
  const workspace = await readFile(new URL("robots-workspace.txt", distUrl), "utf8");
  assert.match(marketing, /Sitemap: https:\/\/checkstation\.app\/sitemap\.xml/);
  assert.doesNotMatch(marketing, /Disallow: \/dashboard/);
  assert.match(workspace, /Disallow: \//);
  assert.doesNotMatch(workspace, /Sitemap:/);
});

test("marketing redirects stay relative behind the TLS reverse proxy", async () => {
  const nginx = await readFile(new URL("../nginx.conf", import.meta.url), "utf8");
  assert.match(nginx, /server_name checkstation\.app;\s+absolute_redirect off;/);
});
