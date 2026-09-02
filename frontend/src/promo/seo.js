import { publicSiteOrigin } from "../contactForm.js";
import { savePromoLocalePreference } from "./locale.js";

function ensureMeta(selector, attrName, attrValue) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  return el;
}

function ensureLink(rel, hreflang) {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    if (hreflang) el.setAttribute("hreflang", hreflang);
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Apply locale-aware SEO for promotional marketing pages.
 */
export function applyPromoSeo({
  locale,
  title,
  description,
  canonicalPath,
  ogDescription,
}) {
  const lang = locale === "ja" ? "ja" : "en";
  const desc = description || "";
  const ogDesc = ogDescription || desc;

  document.title = title || "CheckStation";
  document.documentElement.lang = lang === "ja" ? "ja" : "en";

  ensureMeta('meta[name="description"]', "name", "description").setAttribute("content", desc);
  ensureMeta('meta[property="og:title"]', "property", "og:title").setAttribute("content", title || "");
  ensureMeta('meta[property="og:description"]', "property", "og:description").setAttribute(
    "content",
    ogDesc,
  );
  ensureMeta('meta[property="og:type"]', "property", "og:type").setAttribute("content", "website");
  ensureMeta('meta[property="og:locale"]', "property", "og:locale").setAttribute(
    "content",
    lang === "ja" ? "ja_JP" : "en_US",
  );

  const origin = publicSiteOrigin();
  const path = String(canonicalPath || "/").startsWith("/")
    ? canonicalPath
    : `/${canonicalPath || ""}`;
  if (origin && path) {
    ensureLink("canonical").setAttribute("href", `${origin}${path}`);

    const logical = path.replace(/^\/(en|ja)(?=\/|$)/, "") || "/";
    const enPath = logical === "/" ? "/en/" : `/en${logical}`;
    const jaPath = logical === "/" ? "/ja/" : `/ja${logical}`;
    ensureLink("alternate", "en").setAttribute("href", `${origin}${enPath}`);
    ensureLink("alternate", "ja").setAttribute("href", `${origin}${jaPath}`);
    ensureLink("alternate", "x-default").setAttribute("href", `${origin}${enPath}`);
  }

  savePromoLocalePreference(lang);
}
