import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === "analyze" &&
      visualizer({
        filename: "reports/bundle-stats.html",
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
      }),
  ].filter(Boolean),
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    // TEMP: Added to test on other devices.
    allowedHosts: ['.ngrok-free.app'],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: {
      "@client": fileURLToPath(new URL("./src/client", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@worker": fileURLToPath(new URL("./src/worker", import.meta.url)),
    },
  },
}));
