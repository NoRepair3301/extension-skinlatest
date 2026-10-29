import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Ships the root manifest.json unchanged.
const manifestPlugin = {
  name: "skinly-manifest",
  generateBundle(this: { emitFile(f: { type: "asset"; fileName: string; source: string }): void }) {
    this.emitFile({ type: "asset", fileName: "manifest.json", source: readFileSync("manifest.json", "utf8") });
  },
};

// Two builds share this file: the default one (background, popup, options) and
// `--mode applier`, a self-contained classic script that is injected on demand.
export default defineConfig(({ mode }) => {
  const common = {
    root: "src/extension",
    base: "./",
    publicDir: false as const,
    logLevel: "silent" as const,
    oxc: { jsx: { runtime: "automatic" as const, importSource: "preact" } },
  };
  if (mode === "applier") {
    return {
      ...common,
      build: {
        outDir: "../../dist",
        emptyOutDir: false,
        lib: { entry: "applier.ts", formats: ["iife" as const], name: "SkinlyApplier", fileName: () => "applier.js" },
      },
    };
  }
  return {
    ...common,
    plugins: [manifestPlugin],
    build: {
      outDir: "../../dist",
      emptyOutDir: true,
      modulePreload: false,
      rollupOptions: {
        input: {
          background: "src/extension/background.ts",
          popup: "src/extension/popup/index.html",
          options: "src/extension/options/index.html",
        },
        output: { entryFileNames: "[name].js", chunkFileNames: "assets/[name]-[hash].js", assetFileNames: "assets/[name]-[hash][extname]" },
      },
    },
  };
});
