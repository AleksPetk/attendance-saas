/**
 * DIRECT desktop Stripe checkout / portal via system browser + loopback return.
 *
 * Renderer creates the Stripe session with desktop_return_url, then calls this
 * to open the URL and wait for the loopback hit before focusing the app.
 */

const { shell } = require("electron");
const { listenLoopback, waitForLoopbackCallback } = require("./browserReturn.cjs");

const LOOPBACK_PATH = "/stripe-billing-return";
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

async function prepareDesktopBillingReturn(options = {}) {
  const { server, port } = await listenLoopback();
  const desktopReturnUrl = `http://127.0.0.1:${port}${LOOPBACK_PATH}`;
  return { server, port, desktopReturnUrl };
}

/**
 * Open an external billing URL and wait until Stripe redirects to the loopback.
 */
async function openBillingUrlAndWait(options = {}) {
  const url = String(options.url || "").trim();
  const server = options.server;
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const openExternal = options.openExternal || ((target) => shell.openExternal(target));
  const title = options.title || "Billing complete";
  const body = options.body || "Returning to CheckStation…";

  if (!url) {
    if (server) server.close();
    return { kind: "error", message: "Missing billing URL." };
  }
  if (!server) {
    return { kind: "error", message: "Missing billing return server." };
  }

  const callbackPromise = waitForLoopbackCallback(server, {
    pathname: LOOPBACK_PATH,
    timeoutMs,
    title,
    body,
  });

  try {
    await openExternal(url);
  } catch {
    server.close();
    return { kind: "error", message: "Could not open the system browser for billing." };
  }

  try {
    const params = await callbackPromise;
    // Valid Stripe loopback return only (success, cancel, or portal) — same
    // bringToForeground helper as Google. Do not focus on timeout/errors.
    if (typeof options.bringToForeground === "function") {
      try {
        options.bringToForeground();
      } catch {
        /* best-effort */
      }
    }
    return {
      kind: "returned",
      checkout: String(params.get("checkout") || "").trim(),
      portal: String(params.get("portal") || "").trim(),
    };
  } catch (err) {
    const code = err && typeof err === "object" ? err.code : "";
    if (code === "timeout") {
      // Renderer may still refresh on window focus; do not steal focus here.
      return { kind: "timeout" };
    }
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Billing browser return failed",
    };
  }
}

module.exports = {
  prepareDesktopBillingReturn,
  openBillingUrlAndWait,
  LOOPBACK_PATH,
};
