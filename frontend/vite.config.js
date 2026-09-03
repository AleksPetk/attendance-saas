import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function assertProductionEnv(mode, env) {
  if (mode !== "production") {
    return;
  }
  const api = env.VITE_API_BASE_URL;
  // Unset or empty => same-origin /api (allowed).
  if (api == null || String(api).trim() === "" || String(api).trim() === "/") {
    return;
  }
  const normalized = String(api).trim();
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(normalized)) {
    throw new Error(
      "Production Vite build refused VITE_API_BASE_URL pointing at localhost. "
        + "Unset it for same-origin /api, or set https://workspace.checkstation.app."
    );
  }
  for (const key of [
    "VITE_PUBLIC_SITE_URL",
    "VITE_DOCS_PUBLIC_URL",
    "VITE_STATUS_PUBLIC_URL",
  ]) {
    const value = env[key];
    if (value && /localhost|127\.0\.0\.1/i.test(String(value))) {
      throw new Error(
        `Production Vite build refused ${key}=${value} (localhost is not allowed).`
      );
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  assertProductionEnv(mode, env);

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // Keep React in the graph's default chunks. A separate "react" + catch-all
          // "vendor" split created a circular chunk (vendor ↔ react) that crashes
          // React 19 at runtime: "Cannot set properties of undefined (setting 'Activity')".
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return undefined;
            }
            if (id.includes("react-router")) {
              return "router";
            }
            if (id.includes("i18next") || id.includes("react-i18next")) {
              return "i18n";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      // Compose probes the frontend by service hostname (`frontend`).
      allowedHosts: true,
    },
  };
});
