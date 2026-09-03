/**
 * Production hosts split promo (checkstation.app) from workspace auth/API
 * (workspace.checkstation.app). Credentialed CORS is workspace-only (DEC-095).
 * Auth UI must not run on the promo origin when a workspace origin is configured.
 */

function trimOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
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

/**
 * Absolute workspace URL for an auth path when the browser is on promo;
 * otherwise the same relative path (SPA navigate).
 */
export function resolveAuthHandoffUrl(authPath, locationOrigin, env = import.meta.env) {
  const path = String(authPath || "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const workspace = configuredWorkspaceOrigin(env);
  if (!workspace || isWorkspaceBrowserOrigin(locationOrigin, env)) {
    return normalized;
  }
  return `${workspace}${normalized}`;
}

/**
 * When promo serves an auth deep-link, return the workspace URL to hard-navigate to.
 * Returns "" when no redirect is needed.
 */
export function promoAuthRedirectUrl(pathname, search = "", hash = "", locationOrigin, env = import.meta.env) {
  if (!isWorkspaceAuthPath(pathname)) return "";
  if (isWorkspaceBrowserOrigin(locationOrigin, env)) return "";
  const workspace = configuredWorkspaceOrigin(env);
  if (!workspace) return "";
  return `${workspace}${pathname}${search || ""}${hash || ""}`;
}
