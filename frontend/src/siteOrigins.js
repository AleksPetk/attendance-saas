/**
 * Production hosts split promo (checkstation.app) from workspace auth/API
 * (workspace.checkstation.app). Credentialed CORS is workspace-only (DEC-095).
 *
 * Canonical rule:
 * - Public/promo marketing paths → public site origin
 * - Auth / workspace app paths → workspace origin
 */

import { isPromoMarketingPath } from "./promo/locale.js";

function trimOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeAppPath(path) {
  const raw = String(path || "");
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/** Absolute workspace origin from Vite env (API base when it is a full URL). */
export function configuredWorkspaceOrigin(env = import.meta.env) {
  const api = trimOrigin(env?.VITE_API_BASE_URL);
  if (api && /^https?:\/\//i.test(api)) {
    try {
      return new URL(api).origin;
    } catch {
      return "";
    }
  }
  const explicit = trimOrigin(env?.VITE_WORKSPACE_ORIGIN);
  if (explicit && /^https?:\/\//i.test(explicit)) {
    try {
      return new URL(explicit).origin;
    } catch {
      return "";
    }
  }
  return "";
}

export function configuredPublicSiteOrigin(env = import.meta.env) {
  const raw = trimOrigin(env?.VITE_PUBLIC_SITE_URL);
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

export function isWorkspaceBrowserOrigin(locationOrigin, env = import.meta.env) {
  const workspace = configuredWorkspaceOrigin(env);
  if (!workspace) {
    // Local / single-host: treat current origin as the credentialed host.
    return true;
  }
  return trimOrigin(locationOrigin) === workspace;
}

export function isPublicBrowserOrigin(locationOrigin, env = import.meta.env) {
  const pub = configuredPublicSiteOrigin(env);
  if (!pub) return false;
  return trimOrigin(locationOrigin) === pub;
}

/**
 * Auth and account callback paths that must run on the workspace host so
 * credentialed session/CSRF cookies are same-origin.
 */
export function isWorkspaceAuthPath(pathname) {
  const path = String(pathname || "");
  if (
    path === "/login" ||
    path === "/register" ||
    path === "/staff-login" ||
    path === "/check-email" ||
    path === "/forgot-password"
    || path === "/recover-account"
    || path.startsWith("/recover-account/")
  ) {
    return true;
  }
  if (path.startsWith("/verify-email/")) return true;
  if (path.startsWith("/verify-backup-email/")) return true;
  if (path.startsWith("/verify-primary-email/")) return true;
  if (path.startsWith("/reset-password/")) return true;
  if (path.startsWith("/auth/google/")) return true;
  if (path.startsWith("/auth/apple/")) return true;
  return false;
}

/** Authenticated workspace SPA surfaces (not promo marketing). */
export function isWorkspaceAppPath(pathname) {
  if (isWorkspaceAuthPath(pathname)) return true;
  const path = String(pathname || "");
  const prefixes = [
    "/dashboard",
    "/account",
    "/members",
    "/groups",
    "/staff",
    "/history",
    "/kiosk",
  ];
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Absolute workspace URL for an auth path when the browser is on promo;
 * otherwise the same relative path (SPA navigate).
 */
export function resolveAuthHandoffUrl(authPath, locationOrigin, env = import.meta.env) {
  const normalized = normalizeAppPath(authPath);
  const workspace = configuredWorkspaceOrigin(env);
  if (!workspace || isWorkspaceBrowserOrigin(locationOrigin, env)) {
    return normalized;
  }
  return `${workspace}${normalized}`;
}

/**
 * Absolute promo URL when the browser is on the workspace host;
 * otherwise the same relative path (SPA navigate).
 */
export function resolvePromoHandoffUrl(promoPath, locationOrigin, env = import.meta.env) {
  const normalized = normalizeAppPath(promoPath);
  const pub = configuredPublicSiteOrigin(env);
  const workspace = configuredWorkspaceOrigin(env);
  if (!pub || !workspace) {
    return normalized;
  }
  if (trimOrigin(locationOrigin) === workspace) {
    return `${pub}${normalized}`;
  }
  return normalized;
}

/**
 * When promo (or any non-workspace host) serves auth/app deep-links, return the
 * workspace URL to hard-navigate to. Returns "" when no redirect is needed.
 */
export function promoAuthRedirectUrl(pathname, search = "", hash = "", locationOrigin, env = import.meta.env) {
  if (!isWorkspaceAppPath(pathname)) return "";
  if (isWorkspaceBrowserOrigin(locationOrigin, env)) return "";
  const workspace = configuredWorkspaceOrigin(env);
  if (!workspace) return "";
  return `${workspace}${pathname}${search || ""}${hash || ""}`;
}

/**
 * When the workspace host serves a promo marketing route, canonicalize to the
 * public site. Returns "" when no redirect is needed.
 */
export function workspacePromoRedirectUrl(
  pathname,
  search = "",
  hash = "",
  locationOrigin,
  env = import.meta.env,
) {
  if (!isPromoMarketingPath(pathname)) return "";
  const workspace = configuredWorkspaceOrigin(env);
  const pub = configuredPublicSiteOrigin(env);
  if (!workspace || !pub) return "";
  if (trimOrigin(locationOrigin) !== workspace) return "";
  if (pub === workspace) return "";
  return `${pub}${pathname}${search || ""}${hash || ""}`;
}

/**
 * Single entry for bidirectional host canonicalization. Prefer the first
 * matching redirect; never returns a same-origin URL.
 */
export function canonicalHostRedirectUrl(
  pathname,
  search = "",
  hash = "",
  locationOrigin,
  env = import.meta.env,
) {
  const origin = trimOrigin(locationOrigin);
  const candidates = [
    workspacePromoRedirectUrl(pathname, search, hash, locationOrigin, env),
    promoAuthRedirectUrl(pathname, search, hash, locationOrigin, env),
  ];
  for (const target of candidates) {
    if (!target) continue;
    try {
      if (new URL(target).origin === origin) continue;
    } catch {
      continue;
    }
    return target;
  }
  return "";
}
