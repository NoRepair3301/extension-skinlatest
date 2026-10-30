import { checkPlan } from "../ai/pipeline.ts";
import type { StructuralSummary } from "../core/types.ts";
import type { StylePlan } from "../plan/schema.ts";

const PREFIX = "skinly1:";
/** A theme code is tiny; anything bigger is refused before it is decoded. */
const MAX_CODE = 2000;
/** Region ids belong to one page, so a shared code carries none and is checked against a page with no regions. */
const NO_REGIONS = { regions: [], risk: [] } as unknown as StructuralSummary;

/** A compact string of the look only: theme, tokens and scene. No region rules, no assets, nothing from a page. */
export function encodeThemeCode(plan: StylePlan): string {
  const { v, themeId, tokens, sceneId } = plan;
  return PREFIX + btoa(JSON.stringify({ v, themeId, tokens, sceneId: sceneId ?? "none", regionRules: [], reasons: [] }));
}

export type ImportResult = { ok: true; plan: StylePlan; repaired: boolean } | { ok: false; message: string };

/** Import always goes through the validator and the contrast repair; the result is a StylePlan like any other. */
export function decodeThemeCode(text: string): ImportResult {
  const bad: ImportResult = { ok: false, message: "That isn't a valid theme code." };
  const code = text.trim();
  if (!code.startsWith(PREFIX) || code.length > MAX_CODE) return bad;
  let json: unknown;
  try {
    json = JSON.parse(atob(code.slice(PREFIX.length)));
  } catch {
    return bad;
  }
  const r = checkPlan(json, NO_REGIONS);
  return r.ok ? { ok: true, plan: r.plan, repaired: r.repaired } : { ok: false, message: "That theme code can't be shown readably, so it was not used." };
}
