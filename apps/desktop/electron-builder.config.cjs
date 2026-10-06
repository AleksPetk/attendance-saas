/**
 * electron-builder config for CheckStation desktop macOS variants.
 * Driven by CHECKSTATION_DESKTOP_DISTRIBUTION=direct|mas (default: direct).
 *
 * MAS (real Mac App Store):
 *   - target: mas → signed .app + .pkg for App Store Connect / TestFlight
 *   - Mac App Distribution + Mac Installer Distribution identities
 *   - provisioning profile + MAS entitlements
 *
 * DIRECT:
 *   - unsigned local dir packaging (identity: null) — never uses MAS signing
 */

const fs = require("fs");
const path = require("path");
const {
  resolveDesktopDistribution,
  desktopBundleId,
  desktopReleaseOutputDir,
  getDesktopDistributionInfo,
} = require("./electron/desktopDistribution.cjs");
const {
  resolveMasSigning,
  printHumanBlocker,
  TEAM_ID,
} = require("./scripts/resolve-mas-signing.cjs");

const distribution = resolveDesktopDistribution();
const info = getDesktopDistributionInfo({ distribution });

if (info.bundleId !== desktopBundleId(distribution)) {
  throw new Error("desktop distribution bundle id mismatch");
}

const macAppleNativeNode = path.join(
  __dirname,
  "native/MacApple/build/mac_apple_native.node",
);
const macAppleNativeDylib = path.join(
  __dirname,
  "native/MacApple/build/libCheckStationMacApple.dylib",
);

const extraResources = [];
if (distribution === "mas") {
  const masPackagedEnv = path.join(__dirname, ".env.mas-packaged");
  if (!fs.existsSync(masPackagedEnv)) {
    throw new Error(
      "MAS packaging requires .env.mas-packaged (run stage-mas-google-env via build:electron:mas). "
      + "Set GOOGLE_DESKTOP_OAUTH_CLIENT_ID and GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET in the release environment.",
    );
  }
  extraResources.push({
    from: ".env.mas-packaged",
    to: ".env",
  });
  // In-process native module only — never package CheckStationMacBridge.app.
  // Presence is required at build time (build-electron-variant / afterPack).
  if (fs.existsSync(macAppleNativeNode) && fs.existsSync(macAppleNativeDylib)) {
    extraResources.push(
      { from: macAppleNativeNode, to: "mac_apple_native.node" },
      { from: macAppleNativeDylib, to: "libCheckStationMacApple.dylib" },
    );
  }
} else if (fs.existsSync(path.join(__dirname, ".env"))) {
  // DIRECT may optionally ship a local .env for API base URL; Google Desktop
  // credentials are not required (DIRECT uses web Google OAuth + handoff).
  extraResources.push({
    from: ".env",
    to: ".env",
  });
}

let masSigning = null;
if (distribution === "mas") {
  masSigning = resolveMasSigning();
  if (!masSigning.ready) {
    console.error(printHumanBlocker(masSigning));
    throw new Error("MAS signing assets missing — see message above");
  }
}

/**
 * electron-builder rejects certificate-type prefixes on identity names and
 * selects "3rd Party Mac Developer Application" automatically for the mas target.
 */
function electronBuilderMacIdentity(fullIdentityName) {
  return String(fullIdentityName || "")
    .replace(/^3rd Party Mac Developer Application:\s*/i, "")
    .replace(/^Apple Distribution:\s*/i, "")
    .trim();
}

const masElectronBuilderIdentity = masSigning
  ? electronBuilderMacIdentity(masSigning.identity.identity)
  : null;

// macOS App Store / TestFlight build for this desktop line.
// CFBundleShortVersionString ← package.json version; CFBundleVersion ← buildVersion.
const MAS_BUILD_VERSION = process.env.CHECKSTATION_MAS_BUILD_VERSION || "7";

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: info.bundleId,
  // App Store product name is CheckStation (local MAS test label was temporary).
  productName: "CheckStation",
  electronVersion: "44.2.0",
  buildVersion: distribution === "mas" ? MAS_BUILD_VERSION : undefined,
  extraMetadata: {
    checkstationDesktopDistribution: distribution,
  },
  directories: {
    output: desktopReleaseOutputDir(distribution),
    buildResources: "assets",
  },
  files: [
    "dist/**/*",
    "electron/**/*",
    "assets/app-icon.png",
  ],
  extraResources,
  afterPack: distribution === "mas" ? "./scripts/after-pack-mas.cjs" : undefined,
  afterSign: distribution === "mas" ? "./scripts/after-sign-mas.cjs" : undefined,
  mac: {
    icon: "app-icon.png",
    category: "public.app-category.business",
    ...(distribution === "mas"
      ? {
          // Real Mac App Store packaging (not local dir).
          target: [
            {
              target: "mas",
              arch: ["arm64"],
            },
          ],
          type: "distribution",
          identity: masElectronBuilderIdentity,
          hardenedRuntime: false,
          gatekeeperAssess: false,
          entitlements: "build/entitlements.mas.plist",
          entitlementsInherit: "build/entitlements.mas.inherit.plist",
          provisioningProfile: masSigning.profile.profilePath,
          extendInfo: {
            ElectronTeamID: TEAM_ID,
            ITSAppUsesNonExemptEncryption: false,
            CFBundleDevelopmentRegion: "en",
            CFBundleLocalizations: ["en", "ja"],
          },
        }
      : {
          // DIRECT: local unsigned dir build — do not touch MAS signing.
          identity: null,
          target: [
            {
              target: "dir",
              arch: ["arm64"],
            },
          ],
        }),
  },
  ...(distribution === "mas"
    ? {
        mas: {
          type: "distribution",
          identity: masElectronBuilderIdentity,
          entitlements: "build/entitlements.mas.plist",
          entitlementsInherit: "build/entitlements.mas.inherit.plist",
          hardenedRuntime: false,
          provisioningProfile: masSigning.profile.profilePath,
        },
      }
    : {}),
  win: {
    target: [
      {
        target: "dir",
      },
    ],
  },
};
