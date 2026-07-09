import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Pre-launch build config — LANDING PAGE ONLY.
 * Use with: npx vite build --config vite.landing.config.ts
 * Output goes to dist-landing/ which is what we deploy to Vercel.
 */
export default defineConfig({
  root: "client",
  publicDir: "assets",
  envDir: "..",
  build: {
    outDir: "../dist-landing",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "client/index.html"),
      },
    },
  },
});