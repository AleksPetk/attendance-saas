#!/usr/bin/env node
/**
 * Resolve Mac App Store signing identity + provisioning profile for MAS builds.
 * Read-only detection — never creates/revokes Apple certificates.
 *
 * Env overrides:
 *   CHECKSTATION_MAS_IDENTITY
 *   CHECKSTATION_MAS_PROVISIONING_PROFILE
 *   CSC_NAME (electron-builder)
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TEAM_ID = "472845AC29";
const BUNDLE_ID = "app.checkstation.client";
const DESKTOP_ROOT = path.resolve(__dirname, "..");

const DEFAULT_PROFILE_CANDIDATES = [
  process.env.CHECKSTATION_MAS_PROVISIONING_PROFILE,
  path.join(DESKTOP_ROOT, "build/mac/AppStore_app.checkstation.client.provisionprofile"),
  path.join(DESKTOP_ROOT, "build/mac/embedded.provisionprofile"),
  path.join(DESKTOP_ROOT, "build/mac/mac_app_store.provisionprofile"),
].filter(Boolean);

function parseIdentityList(text) {
  const identities = [];
  for (const line of String(text || "").split("\n")) {
    const match = line.match(/^\s*\d+\)\s+([A-F0-9]+)\s+"([^"]+)"/i);
    if (match) identities.push({ hash: match[1], name: match[2] });
  }
  return identities;
}

function listCodesigningIdentities() {
  const result = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], {
    encoding: "utf8",
  });
  return parseIdentityList(`${result.stdout || ""}\n${result.stderr || ""}`);
}

/** Installer identities are valid but not under the codesigning policy. */
function listAllIdentities() {
  const result = spawnSync("security", ["find-identity", "-v"], {
    encoding: "utf8",
  });
  return parseIdentityList(`${result.stdout || ""}\n${result.stderr || ""}`);
}

function isMasApplicationIdentity(name) {
  const lower = String(name || "").toLowerCase();
  const hasTeam = name.includes(`(${TEAM_ID})`);
  if (!hasTeam) return false;
  // Preferred Mac App Store application identities.
  if (lower.includes("3rd party mac developer application")) return true;
  if (lower.includes("apple distribution") && !lower.includes("iphone")) return true;
  return false;
}

function isMasInstallerIdentity(name) {
  const lower = String(name || "").toLowerCase();
  if (!name.includes(`(${TEAM_ID})`)) return false;
  // Prefer classic Mac App Store installer identity.
  if (lower.includes("3rd party mac developer installer")) return true;
  // Newer naming sometimes appears as Mac Installer Distribution.
  if (lower.includes("mac installer distribution")) return true;
  return false;
}

function resolveMasIdentity(identities = listCodesigningIdentities()) {
  const forced = String(
    process.env.CHECKSTATION_MAS_IDENTITY || process.env.CSC_NAME || "",
  ).trim();
  if (forced) {
    const found = identities.find((row) => row.name === forced || row.hash === forced);
    if (!found) {
      return {
        ok: false,
        code: "identity_not_in_keychain",
        message: `CHECKSTATION_MAS_IDENTITY/CSC_NAME is set to "${forced}" but that identity is not in the keychain.`,
        identities,
      };
    }
    return { ok: true, identity: found.name, hash: found.hash, identities };
  }
  const preferred = identities.find((row) => isMasApplicationIdentity(row.name));
  if (!preferred) {
    return {
      ok: false,
      code: "missing_mas_identity",
      message: `No Mac App Store application signing identity found for team ${TEAM_ID}.`,
      identities,
    };
  }
  return { ok: true, identity: preferred.name, hash: preferred.hash, identities };
}

function decodeProvisionProfile(filePath) {
  const decoded = spawnSync("security", ["cms", "-D", "-i", filePath], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (decoded.status !== 0) {
    return null;
  }
  const xml = decoded.stdout || "";
  const name = (xml.match(/<key>Name<\/key>\s*<string>([^<]+)<\/string>/) || [])[1] || "";
  const uuid = (xml.match(/<key>UUID<\/key>\s*<string>([^<]+)<\/string>/) || [])[1] || "";
  const team = (xml.match(/<key>com\.apple\.developer\.team-identifier<\/key>\s*<string>([^<]+)<\/string>/) || [])[1]
    || (xml.match(/<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)<\/string>/) || [])[1]
    || "";
  // iOS profiles use application-identifier; Mac App Store profiles use com.apple.application-identifier.
  const appId = (xml.match(/<key>com\.apple\.application-identifier<\/key>\s*<string>([^<]+)<\/string>/) || [])[1]
    || (xml.match(/<key>application-identifier<\/key>\s*<string>([^<]+)<\/string>/) || [])[1]
    || "";
  const platforms = [];
  const platformBlock = xml.match(/<key>Platform<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (platformBlock) {
    for (const m of platformBlock[1].matchAll(/<string>([^<]+)<\/string>/g)) {
      platforms.push(m[1]);
    }
  }
  const hasAppleSignIn = /com\.apple\.developer\.applesignin/.test(xml);
  const hasAppSandbox = /com\.apple\.security\.app-sandbox/.test(xml);
  return {
    path: filePath,
    name,
    uuid,
    team,
    appId,
    platforms,
    hasAppleSignIn,
    hasAppSandbox,
    isMac: platforms.some((p) => /mac|OSX|osx/i.test(p)) || /Mac/.test(name),
    matchesBundle: appId === `${TEAM_ID}.${BUNDLE_ID}` || appId.endsWith(`.${BUNDLE_ID}`),
  };
}

function resolveMasProvisioningProfile() {
  for (const candidate of DEFAULT_PROFILE_CANDIDATES) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const decoded = decodeProvisionProfile(candidate);
    if (!decoded) {
      return {
        ok: false,
        code: "profile_unreadable",
        message: `Provisioning profile exists but could not be decoded: ${candidate}`,
        profilePath: candidate,
      };
    }
    if (decoded.team && decoded.team !== TEAM_ID) {
      return {
        ok: false,
        code: "profile_team_mismatch",
        message: `Provisioning profile team ${decoded.team} != ${TEAM_ID}`,
        profile: decoded,
      };
    }
    if (!decoded.matchesBundle) {
      return {
        ok: false,
        code: "profile_bundle_mismatch",
        message: `Provisioning profile application-identifier ${decoded.appId} does not match ${TEAM_ID}.${BUNDLE_ID}`,
        profile: decoded,
      };
    }
    // Prefer Mac profiles; allow if Platform missing but filename/path is under build/mac.
    if (!decoded.isMac && !String(candidate).includes(`${path.sep}mac${path.sep}`)) {
      return {
        ok: false,
        code: "profile_not_macos",
        message: `Provisioning profile appears non-macOS (platforms=${decoded.platforms.join(",") || "unknown"}): ${candidate}`,
        profile: decoded,
      };
    }
    return { ok: true, profilePath: candidate, profile: decoded };
  }
  return {
    ok: false,
    code: "missing_mas_profile",
    message: `No Mac App Store provisioning profile found for ${BUNDLE_ID}. Expected at build/mac/AppStore_app.checkstation.client.provisionprofile`,
  };
}

function resolveMasSigning() {
  const identity = resolveMasIdentity();
  const profile = resolveMasProvisioningProfile();
  const installer = listAllIdentities().find((row) => isMasInstallerIdentity(row.name))
    || null;
  const warnings = [];
  if (profile.ok && profile.profile && !profile.profile.hasAppleSignIn) {
    warnings.push("Provisioning profile is missing Sign in with Apple (com.apple.developer.applesignin).");
  }
  // App Sandbox is a macOS app entitlement (entitlements.mas.plist), not something
  // Apple Developer always embeds in the Mac App Store provisioning profile.
  if (profile.ok && profile.profile && !profile.profile.hasAppSandbox) {
    warnings.push(
      "Provisioning profile does not list com.apple.security.app-sandbox (normal on some Mac profiles). App Sandbox must still be present in build/entitlements.mas.plist.",
    );
  }
  if (!installer) {
    warnings.push(
      "Mac Installer Distribution (3rd Party Mac Developer Installer) is missing — required to produce the Mac App Store .pkg for App Store Connect upload.",
    );
  }
  return {
    teamId: TEAM_ID,
    bundleId: BUNDLE_ID,
    identity,
    profile,
    installerIdentity: installer ? installer.name : null,
    warnings,
    ready: Boolean(identity.ok && profile.ok),
    readyForMasPkg: Boolean(identity.ok && profile.ok && installer),
  };
}

function printHumanBlocker(resolved = resolveMasSigning()) {
  const lines = [];
  const pkgOnlyGap = Boolean(resolved.ready && !resolved.readyForMasPkg);
  lines.push(
    pkgOnlyGap
      ? "MAS App Store .pkg build is blocked: Mac Installer Distribution certificate is missing."
      : "MAS signing is not ready for real Apple/StoreKit testing.",
  );
  lines.push(`Team ID: ${TEAM_ID}`);
  lines.push(`Bundle ID: ${BUNDLE_ID}`);
  lines.push("");
  if (!resolved.identity.ok) {
    lines.push(`Missing application identity: ${resolved.identity.message}`);
    lines.push("Present codesigning identities:");
    for (const row of resolved.identity.identities || []) {
      lines.push(`  - ${row.name}`);
    }
    if (!(resolved.identity.identities || []).length) {
      lines.push("  (none)");
    }
    lines.push("");
  } else {
    lines.push(`Application identity OK: ${resolved.identity.identity}`);
  }
  if (!resolved.profile.ok) {
    lines.push(`Missing/invalid provisioning profile: ${resolved.profile.message}`);
    lines.push("");
  } else {
    lines.push(`Provisioning profile OK: ${resolved.profile.profilePath}`);
    lines.push(`  Name: ${resolved.profile.profile.name}`);
    lines.push(`  UUID: ${resolved.profile.profile.uuid}`);
    if (resolved.profile.profile.hasAppleSignIn) {
      lines.push("  Sign in with Apple: yes");
    }
    lines.push(
      resolved.profile.profile.hasAppSandbox
        ? "  App Sandbox in profile: yes"
        : "  App Sandbox in profile: no (OK — enforced via entitlements.mas.plist)",
    );
  }
  if (!resolved.installerIdentity) {
    lines.push("");
    lines.push("Missing Mac Installer Distribution (required for real mas .pkg / App Store Connect upload):");
    lines.push("1) Apple Developer → Certificates → + → Mac Installer Distribution");
    lines.push("   → create CSR in Keychain Access → download .cer → double-click to install");
    lines.push("   Do NOT revoke Mac App Distribution or iPhone Distribution certificates.");
    lines.push("2) Re-run: npm run mas:signing:check && npm run build:electron:mas");
  } else {
    lines.push(`Installer identity OK: ${resolved.installerIdentity}`);
  }
  if (!resolved.identity.ok || !resolved.profile.ok) {
    lines.push("");
    lines.push("Also ensure (do NOT revoke the existing iPhone Distribution cert):");
    lines.push("1) Certificates → Mac App Distribution installed in Keychain");
    lines.push("2) Mac App Store profile saved as:");
    lines.push("     apps/desktop/build/mac/AppStore_app.checkstation.client.provisionprofile");
    lines.push("3) App ID capabilities: Sign in with Apple + In-App Purchase (macOS)");
  }
  return lines.join("\n");
}

if (require.main === module) {
  const resolved = resolveMasSigning();
  const entitlementsPath = path.join(DESKTOP_ROOT, "build/entitlements.mas.plist");
  let entitlementsHaveSandbox = false;
  try {
    const ents = fs.readFileSync(entitlementsPath, "utf8");
    entitlementsHaveSandbox = /com\.apple\.security\.app-sandbox/.test(ents);
  } catch {
    entitlementsHaveSandbox = false;
  }
  if (!entitlementsHaveSandbox) {
    console.error(
      "MAS entitlements plist must include com.apple.security.app-sandbox:\n"
      + `  ${entitlementsPath}`,
    );
    process.exit(2);
  }
  if (!resolved.ready) {
    console.error(printHumanBlocker(resolved));
    process.exit(2);
  }
  console.log(JSON.stringify({
    teamId: resolved.teamId,
    bundleId: resolved.bundleId,
    identity: resolved.identity.identity,
    profilePath: resolved.profile.profilePath,
    profileName: resolved.profile.profile.name,
    profileUuid: resolved.profile.profile.uuid,
    profileHasAppSandbox: Boolean(resolved.profile.profile.hasAppSandbox),
    entitlementsHaveAppSandbox: true,
    installerIdentity: resolved.installerIdentity,
    readyForMasPkg: resolved.readyForMasPkg,
    warnings: resolved.warnings || [],
  }, null, 2));
}

module.exports = {
  TEAM_ID,
  BUNDLE_ID,
  listCodesigningIdentities,
  listAllIdentities,
  resolveMasIdentity,
  resolveMasProvisioningProfile,
  resolveMasSigning,
  printHumanBlocker,
  decodeProvisionProfile,
};
