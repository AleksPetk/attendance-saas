/**
 * MAS-only in-process Apple SIWA + StoreKit bridge.
 * Loads N-API addon + Swift dylib inside Electron main (host identity
 * app.checkstation.client). Never spawns a nested .app.
 * DIRECT must not load this module's native code.
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { resolveDesktopDistribution } = require("./desktopDistribution.cjs");

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

let nativeBinding = null;
let loadAttempted = false;
let loadError = null;

function isMasDistribution() {
  try {
    return resolveDesktopDistribution() === "mas";
  } catch {
    return false;
  }
}

function resolveNativePaths() {
  const candidates = [];
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    candidates.push({
      node: path.join(process.resourcesPath, "mac_apple_native.node"),
      dylib: path.join(process.resourcesPath, "libCheckStationMacApple.dylib"),
    });
  }
  const buildDir = path.join(__dirname, "../native/MacApple/build");
  candidates.push({
    node: path.join(buildDir, "mac_apple_native.node"),
    dylib: path.join(buildDir, "libCheckStationMacApple.dylib"),
  });
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate.node) && fs.existsSync(candidate.dylib)) {
        return candidate;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function loadNativeProvider() {
  if (loadAttempted) return nativeBinding;
  loadAttempted = true;
  if (!isMasDistribution()) {
    loadError = "Native Apple provider is MAS-only.";
    return null;
  }
  const paths = resolveNativePaths();
  if (!paths) {
    loadError = "Native Apple module artifacts missing.";
    return null;
  }
  try {
    // Absolute path require for packaged .node outside asar.
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const binding = require(paths.node);
    binding.load(paths.dylib);
    if (typeof binding.ping !== "function" || binding.ping() !== 1) {
      loadError = "Native Apple module ping failed.";
      return null;
    }
    nativeBinding = binding;
    return nativeBinding;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    nativeBinding = null;
    return null;
  }
}

function isMacBridgeAvailable() {
  if (!isMasDistribution()) return false;
  return Boolean(loadNativeProvider());
}

/**
 * @param {object} request
 * @returns {Promise<object>}
 */
function invokeMacBridge(request, options = {}) {
  if (!isMasDistribution()) {
    return Promise.resolve({
      ok: false,
      code: "unavailable",
      message: "Native Apple provider is not used for DIRECT builds.",
    });
  }

  const binding = loadNativeProvider();
  if (!binding) {
    return Promise.resolve({
      ok: false,
      code: "signing_required",
      message: loadError || "Native Apple module is not packaged for MAS.",
    });
  }

  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const payload = JSON.stringify(request || {});

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish({
        ok: false,
        code: "timeout",
        message: "Native Apple bridge timed out.",
      });
    }, timeoutMs);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    Promise.resolve()
      .then(() => binding.invoke(payload))
      .then((responseJson) => {
        try {
          const parsed = JSON.parse(String(responseJson || ""));
          finish(parsed && typeof parsed === "object" ? parsed : {
            ok: false,
            code: "error",
            message: "Invalid native response.",
          });
        } catch {
          finish({
            ok: false,
            code: "error",
            message: "Invalid native response JSON.",
          });
        }
      })
      .catch((err) => {
        const message = err && err.message ? String(err.message) : "native invoke failed";
        const code = /EACCES|code sign|entitlement|permission|dlopen/i.test(message)
          ? "signing_required"
          : "error";
        finish({ ok: false, code, message });
      });
  });
}

module.exports = {
  resolveNativePaths,
  isMacBridgeAvailable,
  invokeMacBridge,
  isMasDistribution,
  /** @deprecated retained name for older tests; always null (no nested .app). */
  resolveBridgeBinary: () => null,
  _appIsPackaged: () => {
    try {
      return Boolean(app && app.isPackaged);
    } catch {
      return false;
    }
  },
  _resetNativeLoadForTests: () => {
    nativeBinding = null;
    loadAttempted = false;
    loadError = null;
  },
};
