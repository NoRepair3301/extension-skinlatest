import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests never read .env.local (developer keys, the Plus build config): env files are looked up in a folder that has none.
  envDir: "tests/no-env",
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"], passWithNoTests: true, testTimeout: 20000 },
});
