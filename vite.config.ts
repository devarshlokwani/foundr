import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "client",
  publicDir: "assets",
  envDir: "..",
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "client/index.html"),
        signIn: resolve(__dirname, "client/sign-in.html"),
        signUp: resolve(__dirname, "client/sign-up.html"),
        dashboard: resolve(__dirname, "client/dashboard.html"),
        transactions: resolve(__dirname, "client/transactions.html"),
        margins: resolve(__dirname, "client/margins.html"),
        settings: resolve(__dirname, "client/settings.html"),
        business: resolve(__dirname, "client/business.html"),
      },
    },
  },
});
