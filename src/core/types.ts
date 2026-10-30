/** Shared data contracts. StructuralSummary is SPEC 4.1; Gate is SPEC 6. */

export const REGION_ROLES = [
  "header",
  "nav",
  "main",
  "aside",
  "footer",
  "section",
  "card-list",
  "link-list",
  "table",
  "form",
  "button-group",
  "heading",
  "other",
] as const;
export type RegionRole = (typeof REGION_ROLES)[number];

export type RiskMarker = "password" | "payment" | "file" | "editable" | "big-table" | "iframes" | "shadow";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionStyle {
  color: string;
  bg: string;
  fontSize: number;
  fontWeight: number;
  radius: number;
}

export interface Region {
  id: string;
  role: RegionRole;
  tag: string;
  classes: string[];
  childCount: number;
  linkCount: number;
  depth: number;
  rect: Rect;
  style: RegionStyle;
}

export interface SummaryCounts {
  nodes: number;
  links: number;
  forms: number;
  tables: number;
  images: number;
  headings: number;
  iframes: number;
}

/** Whole-page facts: tone of the page background and counts only. Never a URL or text. */
export interface PageFacts {
  tone: "light" | "dark";
  /** Scanned elements that have a CSS background-image. */
  bgImages: number;
  /** Images, video, canvas and picture elements that cover a large part of the viewport. */
  largeMedia: number;
  hasHeroMedia: boolean;
}

/** Used where no page was analysed. */
export const NEUTRAL_PAGE: PageFacts = { tone: "light", bgImages: 0, largeMedia: 0, hasHeroMedia: false };

export interface StructuralSummary {
  v: 1;
  viewport: { w: number; h: number };
  palette: string[];
  fonts: string[];
  counts: SummaryCounts;
  risk: RiskMarker[];
  page: PageFacts;
  regions: Region[];
}

export type BlockReason = "scheme" | "internal" | "store" | "pdf" | "blocklist" | "invalid";
export type NoAiReason = "password" | "payment" | "file" | "too-large";

export type Gate =
  | { kind: "ok" }
  | { kind: "no-ai"; reasons: NoAiReason[] }
  | { kind: "blocked"; reason: BlockReason };

export interface Fingerprint {
  hash: string;
  seq: string;
}
