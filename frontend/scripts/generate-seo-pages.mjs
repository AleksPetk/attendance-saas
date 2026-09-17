import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(frontendDir, "dist");
const publicOrigin = "https://checkstation.app";
const locales = ["en", "ja"];
const trialValues = { days: 7 };

const [baseHtml, routeCatalog, enCatalog, jaCatalog] = await Promise.all([
  readFile(join(distDir, "index.html"), "utf8"),
  readJson(join(frontendDir, "src/promo/seo-routes.json")),
  readJson(join(frontendDir, "src/promo/locales/en/promo.json")),
  readJson(join(frontendDir, "src/promo/locales/ja/promo.json")),
]);

const catalogs = { en: enCatalog, ja: jaCatalog };

for (const locale of locales) {
  for (const route of routeCatalog) {
    const catalog = catalogs[locale];
    const canonicalPath = localizedPath(locale, route.path);
    const alternatePath = localizedPath(locale === "en" ? "ja" : "en", route.path);
    const title = interpolate(catalog.meta[route.metaTitleKey], trialValues);
    const description = interpolate(catalog.meta[route.metaDescriptionKey], trialValues);
    const h1 = interpolate(readPath(catalog, route.h1Key), trialValues);
    const ogLocale = locale === "ja" ? "ja_JP" : "en_US";
    const alternateOgLocale = locale === "ja" ? "en_US" : "ja_JP";

    const head = [
      `<meta name="description" content="${escapeAttribute(description)}" />`,
      `<link rel="canonical" href="${publicOrigin}${canonicalPath}" />`,
      `<link rel="alternate" hreflang="en" href="${publicOrigin}${localizedPath("en", route.path)}" />`,
      `<link rel="alternate" hreflang="ja" href="${publicOrigin}${localizedPath("ja", route.path)}" />`,
      `<link rel="alternate" hreflang="x-default" href="${publicOrigin}${localizedPath("en", route.path)}" />`,
      `<meta property="og:title" content="${escapeAttribute(title)}" />`,
      `<meta property="og:description" content="${escapeAttribute(description)}" />`,
      '<meta property="og:type" content="website" />',
      `<meta property="og:url" content="${publicOrigin}${canonicalPath}" />`,
      '<meta property="og:site_name" content="CheckStation" />',
      `<meta property="og:locale" content="${ogLocale}" />`,
      `<meta property="og:locale:alternate" content="${alternateOgLocale}" />`,
      '<meta name="twitter:card" content="summary" />',
      `<meta name="twitter:title" content="${escapeAttribute(title)}" />`,
      `<meta name="twitter:description" content="${escapeAttribute(description)}" />`,
      `<script type="application/ld+json">${siteJsonLd()}</script>`,
    ].join("\n    ");

    const fallback = `<noscript><main class="seo-fallback" lang="${locale}"><h1>${escapeHtml(h1)}</h1><p>${escapeHtml(description)}</p><p><a href="${alternatePath}">${locale === "ja" ? "English" : "日本語"}</a></p></main></noscript>`;
    const html = baseHtml
      .replace(/<html lang="[^"]*">/, `<html lang="${locale}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>\n    ${head}`)
      .replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);

    const output = route.path === "/"
      ? join(distDir, locale, "index.html")
      : join(distDir, locale, route.path.slice(1), "index.html");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, html, "utf8");
  }
}

await writeFile(join(distDir, "sitemap.xml"), sitemapXml(routeCatalog), "utf8");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function localizedPath(locale, logicalPath) {
  return logicalPath === "/" ? `/${locale}/` : `/${locale}${logicalPath}`;
}

function readPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value) || "";
}

function interpolate(value, values) {
  return String(value || "").replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function siteJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${publicOrigin}/#organization`,
        name: "CheckStation",
        url: `${publicOrigin}/`,
      },
      {
        "@type": "WebSite",
        "@id": `${publicOrigin}/#website`,
        name: "CheckStation",
        url: `${publicOrigin}/`,
        publisher: { "@id": `${publicOrigin}/#organization` },
      },
    ],
  }).replaceAll("<", "\\u003c");
}

function sitemapXml(routes) {
  const entries = [];
  for (const route of routes) {
    for (const locale of locales) {
      const canonical = `${publicOrigin}${localizedPath(locale, route.path)}`;
      entries.push(`  <url>
    <loc>${canonical}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${publicOrigin}${localizedPath("en", route.path)}" />
    <xhtml:link rel="alternate" hreflang="ja" href="${publicOrigin}${localizedPath("ja", route.path)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${publicOrigin}${localizedPath("en", route.path)}" />
  </url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;
}
