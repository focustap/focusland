import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import pkg from "./package.json";

const buildId = new Date().toISOString();

export default defineConfig({
  plugins: [
    react(),
    {
      name: "focusland-version-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ buildId, version: pkg.version }, null, 2)
        });
      }
    }
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  base: "/focusland/",
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  server: {
    port: 5173
  }
});
