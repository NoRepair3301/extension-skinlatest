import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as entitlements from "../src/core/entitlements.ts";
import { BUILTIN_THEME_IDS } from "../src/themes/index.ts";

// Names of the removed paid-tier API. `entitledThemes` is deliberately not listed: it stays as a plain "all six themes" helper
// (S4.1) and is pinned below instead. The retired storage key names live in sites.ts for the migration and are not symbols.
const REMOVED_SYMBOLS = /PlusDialog|PlanAccount|planFlag|PlanFlag|loadPlan|readPlan|canUse|clampPlan|clampThemeId|clampChoice|nearestEntitled|isPlusTheme|supabase/i;
const REMOVED_PATHS = ["src/backend", "backend", "src/extension/planFlag.ts", "src/extension/plus", "scripts/gen-entitlement-keys.mjs"];
const SOURCE_FILE = /\.(ts|tsx|css|json|html)$/;

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const sourceFiles = (): string[] => walk("src").filter((f) => SOURCE_FILE.test(f));

describe("everything is free (T6)", () => {
  it("T6: no source module mentions a plan, entitlement or account API that was removed", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(50); // the scan really walked src/
    const hits = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/).flatMap((line, i) => (REMOVED_SYMBOLS.test(line) ? [`${f}:${i + 1}`] : [])));
    expect(hits).toEqual([]);
    for (const p of REMOVED_PATHS) expect(existsSync(p), p).toBe(false);
  });

  it("T6: the only entitlement helper left takes no argument and returns all 6 built-in themes in app order", () => {
    expect(Object.keys(entitlements)).toEqual(["entitledThemes"]);
    expect(entitlements.entitledThemes.length).toBe(0);
    expect(entitlements.entitledThemes()).toEqual(["calm-light", "midnight", "ocean", "warm-paper", "high-contrast", "field"]);
    expect(entitlements.entitledThemes()).toEqual(BUILTIN_THEME_IDS);
  });
});
