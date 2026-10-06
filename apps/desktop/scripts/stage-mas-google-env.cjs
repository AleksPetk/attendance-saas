#!/usr/bin/env node
/**
 * MAS Google Desktop OAuth release staging + fail-closed preflight.
 *
 * Required release environment (never commit secrets):
 *   GOOGLE_DESKTOP_OAUTH_CLIENT_ID
 *   GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET
 *
 * Optionally loads apps/desktop/.env into process.env for local developer
 * convenience when those keys are unset — but a clean clone with only the
 * documented release env vars must succeed without a local .env file.
 *
 * Writes a release-only staged file (gitignored via .env.*) that
 * electron-builder packages as Resources/.env for MAS. Never logs secret values.
 */

const fs = require("node:fs");
const path = require("node:path");

const CLIENT_ID_KEY = "GOOGLE_DESKTOP_OAUTH_CLIENT_ID";
const CLIENT_SECRET_KEY = "GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET";

function looksLikeGoogleClientId(value) {
  const id = String(value || "").trim();
  if (!id) return false;
  if (id.includes("REPLACE_ME") || id.includes("PLACEHOLDER")) return false;
  return id.includes(".apps.googleusercontent.com");
}

function parseDotEnv(raw) {
  const out = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadOptionalLocalDotEnv(desktopRoot, env = process.env) {
  const localPath = path.join(desktopRoot, ".env");
  if (!fs.existsSync(localPath)) return;
  let raw;
  try {
    raw = fs.readFileSync(localPath, "utf8");
  } catch {
    return;
  }
  const parsed = parseDotEnv(raw);
  for (const key of [CLIENT_ID_KEY, CLIENT_SECRET_KEY]) {
    if (env[key]) continue;
    if (parsed[key]) env[key] = parsed[key];
  }
}

function resolveMasGoogleDesktopOAuth(env = process.env) {
  const clientId = String(env[CLIENT_ID_KEY] || "").trim();
  const clientSecret = String(env[CLIENT_SECRET_KEY] || "").trim();
  return {
    clientId,
    clientSecret,
    configured: looksLikeGoogleClientId(clientId) && Boolean(clientSecret),
    missingClientId: !looksLikeGoogleClientId(clientId),
    missingSecret: !clientSecret,
  };
}

function formatMasGooglePreflightError(resolved) {
  const missing = [];
  if (resolved.missingClientId) missing.push(CLIENT_ID_KEY);
  if (resolved.missingSecret) missing.push(CLIENT_SECRET_KEY);
  return [
    "[checkstation-desktop] MAS Google OAuth preflight failed.",
    `Missing or invalid: ${missing.join(", ") || "(unknown)"}`,
    "Set these as release environment variables before building MAS.",
    "Do not commit .env or secret values. Values are never printed here.",
  ].join("\n");
}

function assertMasGoogleDesktopOAuthConfigured(env = process.env) {
  const resolved = resolveMasGoogleDesktopOAuth(env);
  if (!resolved.configured) {
    const error = new Error(formatMasGooglePreflightError(resolved));
    error.code = "MAS_GOOGLE_OAUTH_PREFLIGHT";
    throw error;
  }
  return resolved;
}

function stagedMasGoogleEnvPath(desktopRoot) {
  return path.join(desktopRoot, ".env.mas-packaged");
}

function writeMasGooglePackagedEnv(desktopRoot, env = process.env) {
  const resolved = assertMasGoogleDesktopOAuthConfigured(env);
  const target = stagedMasGoogleEnvPath(desktopRoot);
  const body = [
    "# Generated for MAS packaging only — do not commit.",
    `${CLIENT_ID_KEY}=${resolved.clientId}`,
    `${CLIENT_SECRET_KEY}=${resolved.clientSecret}`,
    "",
  ].join("\n");
  fs.writeFileSync(target, body, { encoding: "utf8", mode: 0o600 });
  return target;
}

function cleanupMasGooglePackagedEnv(desktopRoot) {
  const target = stagedMasGoogleEnvPath(desktopRoot);
  if (fs.existsSync(target)) {
    try {
      fs.unlinkSync(target);
    } catch {
      /* best-effort */
    }
  }
}

function prepareMasGoogleReleaseEnv(desktopRoot, env = process.env) {
  loadOptionalLocalDotEnv(desktopRoot, env);
  assertMasGoogleDesktopOAuthConfigured(env);
  return writeMasGooglePackagedEnv(desktopRoot, env);
}

module.exports = {
  CLIENT_ID_KEY,
  CLIENT_SECRET_KEY,
  looksLikeGoogleClientId,
  parseDotEnv,
  loadOptionalLocalDotEnv,
  resolveMasGoogleDesktopOAuth,
  formatMasGooglePreflightError,
  assertMasGoogleDesktopOAuthConfigured,
  stagedMasGoogleEnvPath,
  writeMasGooglePackagedEnv,
  cleanupMasGooglePackagedEnv,
  prepareMasGoogleReleaseEnv,
};

if (require.main === module) {
  const desktopRoot = path.resolve(__dirname, "..");
  try {
    const staged = prepareMasGoogleReleaseEnv(desktopRoot);
    console.log(`[checkstation-desktop] MAS Google OAuth staged → ${path.basename(staged)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
