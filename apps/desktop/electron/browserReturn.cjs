/**
 * Shared loopback HTTP helper for system-browser return flows
 * (Apple web OAuth, Stripe checkout/portal).
 */

const http = require("http");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function closePage(title, body, options = {}) {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const autoClose = options.autoClose !== false;
  const closeScript = autoClose
    ? `<script>
(function(){
  function tryClose(){ try { window.close(); } catch (e) {} }
  tryClose();
  setTimeout(tryClose, 50);
  setTimeout(tryClose, 400);
})();
</script>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;padding:48px;color:#0f172a;background:#f8fafc}
h1{font-size:20px;margin:0 0 8px}p{color:#475569;margin:0}
</style></head>
<body><h1>${safeTitle}</h1><p>${safeBody}</p>
${closeScript}
</body></html>`;
}

function listenLoopback() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("loopback_bind_failed"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

/**
 * Wait for a single GET to pathname; resolves with URLSearchParams.
 * Responds with a best-effort close HTML page.
 */
function waitForLoopbackCallback(server, { pathname, timeoutMs, title, body }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(() => reject(Object.assign(new Error("timeout"), { code: "timeout" })));
    }, timeoutMs);

    function finish(fn) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close(() => fn());
    }

    server.on("request", (req, res) => {
      try {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (url.pathname !== pathname) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(closePage(title || "Returning to CheckStation", body || "You can close this window.", {
          autoClose: true,
        }));
        finish(() => resolve(url.searchParams));
      } catch (err) {
        try {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Error");
        } catch {
          /* ignore */
        }
        finish(() => reject(err));
      }
    });
  });
}

module.exports = {
  closePage,
  listenLoopback,
  waitForLoopbackCallback,
  escapeHtml,
};
