/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// Tauri expects a fixed dev port and no screen clearing.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: ["es2021", "chrome105", "safari15"], outDir: "dist" },
  // npm test: logic tests run in Node; component tests opt into jsdom with a "@vitest-environment jsdom" comment.
  test: { include: ["src/**/*.test.{ts,tsx}"], setupFiles: ["src/test/setup.ts"] },
});
