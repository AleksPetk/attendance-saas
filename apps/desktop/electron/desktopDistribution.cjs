/**
 * Single source of truth for CheckStation desktop macOS distribution variants.
 *
 * - direct: website download / Developer ID (bundle app.checkstation.desktop)
 * - mas: Mac App Store (bundle app.checkstation.client)
 *
 * Billing and Apple auth modes are declared for future branching only —
 * this module does not implement Stripe, StoreKit, or Apple Sign-In.
 */

const DISTRIBUTIONS = Object.freeze({
  DIRECT: "direct",
  MAS: "mas",
});

const BUNDLE_IDS = Object.freeze({
  direct: "app.checkstation.desktop",
  mas: "app.checkstation.client",
});

/** Future billing provider selection — not applied to live billing yet. */
const BILLING_MODES = Object.freeze({
  direct: "stripe_web",
  mas: "apple_iap",
});

/** Future Apple Sign-In path — not implemented yet. */
const APPLE_AUTH_MODES = Object.freeze({
  direct: "web_compatible",
  mas: "native",
});

function normalizeDesktopDistribution(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === DISTRIBUTIONS.MAS ? DISTRIBUTIONS.MAS : DISTRIBUTIONS.DIRECT;
}

/**
 * Resolve the active distribution.
 * Priority: explicit option → CHECKSTATION_DESKTOP_DISTRIBUTION →
 * VITE_DESKTOP_DISTRIBUTION → package.json extraMetadata → default "direct".
 */
function resolveDesktopDistribution(options = {}) {
  if (options.distribution != null && String(options.distribution).trim() !== "") {
    return normalizeDesktopDistribution(options.distribution);
  }
  if (process.env.CHECKSTATION_DESKTOP_DISTRIBUTION) {
    return normalizeDesktopDistribution(process.env.CHECKSTATION_DESKTOP_DISTRIBUTION);
  }
  if (process.env.VITE_DESKTOP_DISTRIBUTION) {
    return normalizeDesktopDistribution(process.env.VITE_DESKTOP_DISTRIBUTION);
  }
  try {
    // electron-builder extraMetadata merges into the packaged app package.json.
    const pkg = require("../package.json");
    if (pkg && pkg.checkstationDesktopDistribution) {
      return normalizeDesktopDistribution(pkg.checkstationDesktopDistribution);
    }
  } catch {
    /* unpackaged / missing */
  }
  return DISTRIBUTIONS.DIRECT;
}

function desktopBundleId(distribution) {
  const dist = normalizeDesktopDistribution(distribution);
  return BUNDLE_IDS[dist];
}

function desktopReleaseOutputDir(distribution) {
  const dist = normalizeDesktopDistribution(distribution);
  return dist === DISTRIBUTIONS.MAS ? "release/mas" : "release/direct";
}

function desktopBillingMode(distribution) {
  return BILLING_MODES[normalizeDesktopDistribution(distribution)];
}

function desktopAppleAuthMode(distribution) {
  return APPLE_AUTH_MODES[normalizeDesktopDistribution(distribution)];
}

/** Google desktop OAuth is shared and enabled for both variants. */
function desktopGoogleAuthEnabled(_distribution) {
  return true;
}

/**
 * Snapshot used by main/preload/tests/build scripts.
 * Does not enable billing providers or Apple Sign-In.
 */
function getDesktopDistributionInfo(options = {}) {
  const distribution = resolveDesktopDistribution(options);
  return {
    distribution,
    bundleId: desktopBundleId(distribution),
    releaseOutputDir: desktopReleaseOutputDir(distribution),
    billingMode: desktopBillingMode(distribution),
    appleAuthMode: desktopAppleAuthMode(distribution),
    googleAuthEnabled: desktopGoogleAuthEnabled(distribution),
  };
}

module.exports = {
  DISTRIBUTIONS,
  BUNDLE_IDS,
  BILLING_MODES,
  APPLE_AUTH_MODES,
  normalizeDesktopDistribution,
  resolveDesktopDistribution,
  desktopBundleId,
  desktopReleaseOutputDir,
  desktopBillingMode,
  desktopAppleAuthMode,
  desktopGoogleAuthEnabled,
  getDesktopDistributionInfo,
};
