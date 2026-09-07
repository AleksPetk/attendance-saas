import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  server: { port: 5174, strictPort: true },
  resolve: {
    alias: {
      "@checkstation/api": path.resolve(__dirname, "../../packages/api/src/index.ts"),
      "@checkstation/auth": path.resolve(__dirname, "../../packages/auth/src/index.ts"),
      "@checkstation/config": path.resolve(__dirname, "../../packages/config/src/index.ts"),
      "@checkstation/domain": path.resolve(__dirname, "../../packages/domain/src/index.ts"),
      "@checkstation/i18n": path.resolve(__dirname, "../../packages/i18n/src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
