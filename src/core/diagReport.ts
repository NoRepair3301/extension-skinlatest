import { AUTO_STATES, DIAG_MAX, parseKinds, type AutoState, type DiagFlags, type DiagKind, type MountReason } from "./diag.ts";

/**
 * Diagnostics for "Copy diagnostics" (Settings, About) and the popup's "Why no art?". Pure: fixed field names, enums and bounded
 * numbers only. Nothing here can hold page text, a URL, an origin, a title, a key or a field value: every string is checked
 * against a fixed list, everything else is a whole number. Stored in storage.local under DIAG_KEY by src/extension/diagStore.ts.
 */
export const DIAG_KEY = "diag";

export const ART_STATES = ["ok", "corner", "narrow", "none", "not-loaded", "off"] as const;
export type ArtState = (typeof ART_STATES)[number];

const THEMES = ["calm-light", "midnight", "ocean", "warm-paper", "high-contrast", "field", "custom", "none"] as const;
const STRATEGIES = ["full", "safe", "text-only", "none"] as const;
const MOUNTS = ["html", "body", "unknown"] as const;
const EFFECTS = ["transform", "filter", "perspective", "contain", "none"] as const;
const SHEETS = ["yes", "no", "unknown"] as const;

/** What the last "Change my page" ended with: a provider error kind, why the built-in theme was used, or ok. Fixed words only. */
export const PROVIDER_RESULTS = [
  "ok",
  "fallback",
  "auth",
  "rate",
  "quota",
  "network",
  "timeout",
  "blocked",
  "bad-output",
  "server",
  "aborted",
  "baseline",
  "no-ai-page",
  "too-large",
  "no-key",
  "consent-declined",
  "limit-daily",
  "limit-gap",
  "ai-unavailable",
  "apply-failed",
  "cancelled",
  "offline",
] as const;
export type ProviderResult = (typeof PROVIDER_RESULTS)[number];

/** One page's state, as the page scripts see it. */
export interface PageDiag {
  theme: (typeof THEMES)[number];
  strategy: (typeof STRATEGIES)[number];
  art: ArtState;
  /** The scene host element is in the document. */
  host: boolean;
  /** Free side space in px (0 when none). */
  left: number;
  right: number;
  actors: number;
  pet: boolean;
  /** Stage 1b: constructable stylesheets worked. */
  sheets: (typeof SHEETS)[number];
  /** Stage 1c: where the art host is mounted, and the html effect that moved it to the body. */
  mount: (typeof MOUNTS)[number];
  htmlEffect: (typeof EFFECTS)[number];
  reattached: number;
  /** A2: why this page is (not) themed by itself, one fixed word. */
  auto: AutoState;
}

export interface DiagRecord {
  v: 1;
  /** Last DIAG_MAX caught errors, oldest first. */
  errors: DiagKind[];
  page?: PageDiag;
  provider?: ProviderResult;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback);
const count = (v: unknown, max = 100000): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Pure. Rebuilds a page snapshot from anything: unknown words become a fixed default, numbers are clamped whole numbers. */
export function parsePageDiag(raw: unknown): PageDiag | undefined {
  if (!isObj(raw)) return undefined;
  return {
    theme: oneOf(THEMES, raw["theme"], "none"),
    strategy: oneOf(STRATEGIES, raw["strategy"], "none"),
    art: oneOf(ART_STATES, raw["art"], "not-loaded"),
    host: raw["host"] === true,
    left: count(raw["left"]),
    right: count(raw["right"]),
    actors: count(raw["actors"], 1000),
    pet: raw["pet"] === true,
    sheets: oneOf(SHEETS, raw["sheets"], "unknown"),
    mount: oneOf(MOUNTS, raw["mount"], "unknown"),
    htmlEffect: oneOf(EFFECTS, raw["htmlEffect"], "none"),
    reattached: count(raw["reattached"], 1000),
    auto: oneOf(AUTO_STATES, raw["auto"], "not-run"),
  };
}

/** Pure. Reads the stored record back; anything unknown is dropped. */
export function parseDiag(raw: unknown): DiagRecord {
  const out: DiagRecord = { v: 1, errors: [] };
  if (!isObj(raw)) return out;
  out.errors = parseKinds(raw["errors"]);
  const page = parsePageDiag(raw["page"]);
  if (page) out.page = page;
  if (typeof raw["provider"] === "string" && (PROVIDER_RESULTS as readonly string[]).includes(raw["provider"])) out.provider = raw["provider"] as ProviderResult;
  return out;
}

/** Pure. Adds errors to the ring (oldest dropped first, at most DIAG_MAX). */
export const pushErrors = (ring: readonly DiagKind[], more: readonly DiagKind[]): DiagKind[] => [...ring, ...parseKinds(more)].slice(-DIAG_MAX);

/** The parts of a page snapshot the scene script knows (scene.js). */
export interface SceneDiagPart {
  art: ArtState;
  host: boolean;
  left: number;
  right: number;
  actors: number;
  flags: DiagFlags;
  /** Errors this script recorded since it was last asked (each is reported once). */
  errors?: DiagKind[];
}

/** Pure. Joins what the applier knows (theme, strategy, pet, its own flags) with the scene script's part (absent: not loaded). */
export function joinPageDiag(applier: { theme?: string | undefined; strategy?: string | undefined; pet: boolean; flags: DiagFlags }, scene: SceneDiagPart | undefined): PageDiag {
  const flags: DiagFlags = { ...applier.flags, ...(scene?.flags ?? {}), reattached: (applier.flags.reattached ?? 0) + (scene?.flags.reattached ?? 0) };
  const effect: MountReason | "none" = flags.htmlEffect ?? "none";
  return parsePageDiag({
    theme: applier.theme ?? "none",
    strategy: applier.strategy ?? "none",
    art: scene?.art ?? "not-loaded",
    host: scene?.host ?? false,
    left: scene?.left ?? 0,
    right: scene?.right ?? 0,
    actors: scene?.actors ?? 0,
    pet: applier.pet,
    sheets: flags.sheets === undefined ? "unknown" : flags.sheets ? "yes" : "no",
    mount: flags.mount ?? "unknown",
    htmlEffect: effect,
    reattached: flags.reattached,
    auto: flags.auto ?? "not-run",
  })!;
}

/**
 * Pure. One plain line: why there is no art (or that it shows). The popup's "Why no art?" and the first line of the copied
 * diagnostics use the same words.
 */
export function whyNoArt(page: PageDiag | undefined): string {
  if (!page) return "No page was checked yet. Open Skinly AI on the page and choose Why no art?.";
  if (page.sheets === "no") return "This browser could not style the art (no adopted stylesheets), so it is not shown.";
  if (page.art === "off") return "Scene art is off (Show art), or this theme has none.";
  if (page.art === "not-loaded") return page.theme === "none" ? "No theme is on this page, so there is no art." : "Scene art is not loaded on this page (the browser did not allow it).";
  if (page.art === "narrow") return "This page has almost no empty side space, so no scene art is shown.";
  if (page.art === "none") return "This page uses the full width and no corner is free, so no scene art is shown.";
  if (!page.host) return "The art was drawn, but the page removed it.";
  if (page.actors === 0) return "The art has no room for any picture in the free space.";
  const moved = page.mount === "body" ? ` The page changes its root (${page.htmlEffect}), so the art is mounted on the body.` : "";
  if (page.art === "corner") return `Scene art is showing in a small corner strip (this page has no free side space).${moved}`;
  return `Scene art is showing in the empty side space.${moved}`;
}

/** Pure. The text that "Copy diagnostics" puts on the clipboard. Field names and fixed words only. */
export function diagReport(version: string, rec: DiagRecord, extra: { online?: boolean } = {}): string {
  const p = rec.page;
  const v = /^[0-9]+(?:\.[0-9]+){0,3}$/.test(version) ? version : "unknown";
  const yes = (b: boolean) => (b ? "yes" : "no");
  const lines = [
    "Skinly AI diagnostics (no page text, addresses, sites or keys)",
    `version: ${v}`,
    `why no art: ${whyNoArt(p)}`,
    `theme: ${p?.theme ?? "none"}`,
    `strategy: ${p?.strategy ?? "none"}`,
    `art: ${p?.art ?? "not-loaded"}`,
    `host present: ${yes(p?.host ?? false)}`,
    `gutters: left ${p?.left ?? 0} px, right ${p?.right ?? 0} px`,
    `actors: ${p?.actors ?? 0}`,
    `pet: ${p?.pet ? "on" : "off"}`,
    `adopted stylesheets: ${p?.sheets ?? "unknown"}`,
    `mount: ${p?.mount ?? "unknown"} (html effect: ${p?.htmlEffect ?? "none"})`,
    `re-attached: ${p?.reattached ?? 0}`,
    `auto: ${p?.auto ?? "not-run"}`,
    `last provider result: ${rec.provider ?? "none"}`,
    ...(extra.online === undefined ? [] : [`online: ${yes(extra.online)}`]),
    `errors (last ${DIAG_MAX}, oldest first): ${rec.errors.length ? rec.errors.join(", ") : "none"}`,
  ];
  return lines.join("\n");
}
