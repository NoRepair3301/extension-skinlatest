import type { RiskMarker, StructuralSummary } from "../core/types.ts";

export const THEME_IDS = ["calm-light", "midnight", "ocean", "warm-paper", "high-contrast", "custom"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const FONT_KEYS = ["system", "serif", "mono", "humanist", "rounded", "geometric"] as const;
export type FontKey = (typeof FONT_KEYS)[number];
export const LAYOUTS = ["none", "link-grid", "nav-wrap", "center-column", "card-grid", "stack", "table-clean"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const SURFACES = ["none", "flat", "card"] as const;
export type Surface = (typeof SURFACES)[number];
export const REASONS = ["repeated-links", "clear-nav", "dense-text", "low-contrast-source", "dark-source", "form-heavy", "unsure"] as const;
export type Reason = (typeof REASONS)[number];

export const COLOR_KEYS = ["bg", "surface", "text", "muted", "link", "accent", "border", "focus"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export interface Tokens {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  link: string;
  accent: string;
  border: string;
  focus: string;
  radius: number;
  font: FontKey;
  baseSize: number;
  lineHeight: number;
}

export interface RegionRule {
  region: string;
  layout: Layout;
  surface: Surface;
  spacing: number;
}

export interface StylePlan {
  v: 1;
  themeId: ThemeId;
  tokens: Tokens;
  regionRules: RegionRule[];
  reasons: Reason[];
}

declare const validated: unique symbol;
/** A plan that came out of validatePlan. The compiler only accepts this type, so unvalidated (AI) output cannot be compiled. */
export type ValidPlan = StylePlan & { readonly [validated]: true };

export type ValidationResult = { ok: true; plan: ValidPlan } | { ok: false; errors: string[] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const REGION_ID = /^r[0-9]{1,3}$/;
const GRID_ROLES = new Set(["link-list", "nav", "card-list"]);
const REPEAT_ROLES = new Set(["link-list", "card-list", "section", "aside"]);
const STACK_ROLES = new Set(["nav", "link-list", "card-list", "section", "aside", "main"]);
const COLUMN_ROLES = new Set(["main", "section"]);

const isRecord = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isEnum = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Region facts a layout decision needs. */
export interface LayoutFacts {
  role: string;
  linkCount: number;
  childCount: number;
}

/**
 * Is this layout allowed on this region? Used by the validator and again by the compiler.
 * Any risk marker means colours only, except that table-clean (a pure restyle of a table) tolerates "big-table".
 * No layout ever changes DOM order: they are CSS templates over the existing children.
 */
export function layoutAllowed(layout: Layout, f: LayoutFacts, risk: readonly RiskMarker[]): boolean {
  if (layout === "none") return true;
  if (layout === "table-clean") return f.role === "table" && risk.every((r) => r === "big-table");
  if (risk.length > 0) return false;
  switch (layout) {
    case "link-grid":
    case "nav-wrap":
      return GRID_ROLES.has(f.role) && f.linkCount >= 4;
    case "card-grid":
      return REPEAT_ROLES.has(f.role) && f.childCount >= 3;
    case "stack":
      return STACK_ROLES.has(f.role) && f.childCount >= 2;
    case "center-column":
      return COLUMN_ROLES.has(f.role);
  }
}

/**
 * Hand-written validator. Rejects unknown keys, wrong types, bad hex, out-of-range numbers, unknown enums,
 * unknown region ids and layouts on ineligible regions. Errors name paths only, never the offending values.
 */
export function validatePlan(input: unknown, summary: StructuralSummary): ValidationResult {
  const errors: string[] = [];
  const err = (path: string, why: string) => errors.push(`${path}: ${why}`);

  const exactKeys = (obj: Record<string, unknown>, keys: readonly string[], path: string) => {
    for (const k of Object.keys(obj)) if (!keys.includes(k)) err(`${path}.${k}`, "unknown key");
    for (const k of keys) if (!(k in obj)) err(`${path}.${k}`, "missing");
  };

  if (!isRecord(input)) return { ok: false, errors: ["plan: must be an object"] };
  exactKeys(input, ["v", "themeId", "tokens", "regionRules", "reasons"], "plan");
  if (input["v"] !== 1) err("v", "must be 1");
  if (!isEnum(THEME_IDS, input["themeId"])) err("themeId", "unknown theme");

  const tokensIn = input["tokens"];
  const tokens: Partial<Tokens> = {};
  if (!isRecord(tokensIn)) err("tokens", "must be an object");
  else {
    exactKeys(tokensIn, [...COLOR_KEYS, "radius", "font", "baseSize", "lineHeight"], "tokens");
    for (const k of COLOR_KEYS) {
      const v = tokensIn[k];
      if (typeof v === "string" && HEX.test(v)) tokens[k] = v.toLowerCase();
      else if (k in tokensIn) err(`tokens.${k}`, "must be #rrggbb");
    }
    const radius = tokensIn["radius"];
    if (isInt(radius, 0, 16)) tokens.radius = radius;
    else if ("radius" in tokensIn) err("tokens.radius", "must be an integer 0..16");
    const font = tokensIn["font"];
    if (isEnum(FONT_KEYS, font)) tokens.font = font;
    else if ("font" in tokensIn) err("tokens.font", "unknown font");
    const size = tokensIn["baseSize"];
    if (isInt(size, 14, 20)) tokens.baseSize = size;
    else if ("baseSize" in tokensIn) err("tokens.baseSize", "must be an integer 14..20");
    const lh = tokensIn["lineHeight"];
    if (typeof lh === "number" && Number.isFinite(lh) && lh >= 1.3 && lh <= 1.9 && Math.round(lh * 10) / 10 === lh) tokens.lineHeight = lh;
    else if ("lineHeight" in tokensIn) err("tokens.lineHeight", "must be 1.3..1.9 with one decimal");
  }

  const rules: RegionRule[] = [];
  const rulesIn = input["regionRules"];
  if (!Array.isArray(rulesIn)) err("regionRules", "must be an array");
  else {
    if (rulesIn.length > 40) err("regionRules", "at most 40");
    const byId = new Map(summary.regions.map((r) => [r.id, r]));
    const seen = new Set<string>();
    rulesIn.slice(0, 40).forEach((r, i) => {
      const path = `regionRules[${i}]`;
      if (!isRecord(r)) return err(path, "must be an object");
      exactKeys(r, ["region", "layout", "surface", "spacing"], path);
      const { region, layout, surface, spacing } = r;
      let good = true;
      if (typeof region !== "string" || !REGION_ID.test(region)) {
        err(`${path}.region`, "must look like r1");
        good = false;
      } else if (!byId.has(region)) {
        err(`${path}.region`, "unknown region");
        good = false;
      } else if (seen.has(region)) {
        err(`${path}.region`, "duplicate");
        good = false;
      } else seen.add(region);
      if (!isEnum(LAYOUTS, layout)) {
        err(`${path}.layout`, "unknown layout");
        good = false;
      }
      if (!isEnum(SURFACES, surface)) {
        err(`${path}.surface`, "unknown surface");
        good = false;
      }
      if (!isInt(spacing, 0, 4)) {
        err(`${path}.spacing`, "must be an integer 0..4");
        good = false;
      }
      if (good && layout !== "none") {
        const reg = byId.get(region as string)!;
        if (!layoutAllowed(layout as Layout, reg, summary.risk)) {
          err(`${path}.layout`, "not allowed on this region");
          good = false;
        }
      }
      if (good) rules.push({ region: region as string, layout: layout as Layout, surface: surface as Surface, spacing: spacing as number });
    });
  }

  const reasonsIn = input["reasons"];
  const reasons: Reason[] = [];
  if (!Array.isArray(reasonsIn)) err("reasons", "must be an array");
  else {
    if (reasonsIn.length > 5) err("reasons", "at most 5");
    reasonsIn.slice(0, 5).forEach((r, i) => {
      if (isEnum(REASONS, r)) reasons.push(r);
      else err(`reasons[${i}]`, "unknown reason");
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    plan: { v: 1, themeId: input["themeId"] as ThemeId, tokens: tokens as Tokens, regionRules: rules, reasons } as ValidPlan,
  };
}
