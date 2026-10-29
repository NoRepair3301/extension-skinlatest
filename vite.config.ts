import { defineConfig } from "vite";

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
