import type { PageFacts, Rect, Region, RegionStyle, RiskMarker, StructuralSummary, SummaryCounts } from "../core/types.ts";
import type { RegionNode } from "./regions.ts";

export const SUMMARY_MAX_BYTES = 20 * 1024;

export interface RawStyle {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  borderRadius: string;
  fontFamily: string;
  /** Computed background-image; only whether it is not "none" is ever used. */
  backgroundImage?: string;
}

/** Real code reads computed style and layout; tests inject fakes because jsdom has no layout. */
export interface SummaryDeps {
  getStyle(el: Element): RawStyle;
  getRect(el: Element): Rect;
  viewport: { w: number; h: number };
}

export function defaultDeps(doc: Document): SummaryDeps {
  const win = doc.defaultView;
  if (!win) throw new Error("document has no window");
  return {
    getStyle: (el) => {
      const s = win.getComputedStyle(el);
      return {
        color: s.color,
        backgroundColor: s.backgroundColor,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        borderRadius: s.borderTopLeftRadius,
        fontFamily: s.fontFamily,
        backgroundImage: s.backgroundImage,
      };
    },
    getRect: (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    },
    viewport: { w: win.innerWidth, h: win.innerHeight },
  };
}

const hex2 = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** Parses rgb(), rgba() and #hex. Returns null for anything else. */
export function parseColor(input: string): { hex: string; alpha: number } | null {
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { hex: "#000000", alpha: 0 };
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (h) {
    const v = h[1]!.length === 3 ? [...h[1]!].map((c) => c + c).join("") : h[1]!;
    return { hex: `#${v}`, alpha: 1 };
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (!m) return null;
  let alpha = 1;
  if (m[4] !== undefined) alpha = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { hex: `#${hex2(+m[1]!)}${hex2(+m[2]!)}${hex2(+m[3]!)}`, alpha };
}

const round10 = (n: number): number => (Number.isFinite(n) ? Math.round(n / 10) * 10 : 0);
const num = (s: string, fallback: number): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
};

const CLASS_TOKEN = /^[a-z][a-z0-9_-]{1,30}$/;

/** At most 3 tokens that match the SPEC pattern. Everything else is dropped. */
export function sanitizeClasses(el: Element): string[] {
  const out: string[] = [];
  for (const t of (el.getAttribute("class") ?? "").split(/\s+/)) {
    if (CLASS_TOKEN.test(t) && !out.includes(t)) out.push(t);
    if (out.length === 3) break;
  }
  return out;
}

function backgroundOf(el: Element, deps: SummaryDeps): string {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const c = parseColor(deps.getStyle(cur).backgroundColor);
    if (c && c.alpha > 0) return c.hex;
  }
  return "#ffffff";
}

function styleOf(el: Element, deps: SummaryDeps): { style: RegionStyle; family: string } {
  const raw = deps.getStyle(el);
  const w = raw.fontWeight.toLowerCase();
  const weight = w === "bold" ? 700 : w === "normal" ? 400 : num(w, 400);
  const family = (raw.fontFamily.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
  return {
    style: {
      color: parseColor(raw.color)?.hex ?? "#000000",
      bg: backgroundOf(el, deps),
      fontSize: Math.max(1, Math.min(200, Math.round(num(raw.fontSize, 16)))),
      fontWeight: Math.max(100, Math.min(900, Math.round(weight / 100) * 100)),
      radius: Math.max(0, Math.min(999, Math.round(num(raw.borderRadius, 0)))),
    },
    family,
  };
}

const FONT_NAME = /^[A-Za-z0-9 _-]{1,40}$/;

function topByCount(values: string[], max: number): string[] {
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([v]) => v);
}

const MEDIA_TAGS = new Set(["img", "video", "canvas", "picture"]);
const BG_SAMPLE_CAP = 1500;
const luma = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number): number => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
};

/** Tone of the page background plus counts of background images and large media. Reads computed style only; no URLs, no text. */
export function pageFacts(doc: Document, elements: Element[], deps: SummaryDeps): PageFacts {
  let bg = "#ffffff";
  for (const el of [doc.body, doc.documentElement]) {
    const c = el ? parseColor(deps.getStyle(el).backgroundColor) : null;
    if (c && c.alpha > 0.5) {
      bg = c.hex;
      break;
    }
  }
  const vw = Math.max(1, deps.viewport.w);
  const vh = Math.max(1, deps.viewport.h);
  let bgImages = 0;
  let largeMedia = 0;
  let hero = false;
  elements.slice(0, BG_SAMPLE_CAP).forEach((el) => {
    const hasBg = (deps.getStyle(el).backgroundImage ?? "none") !== "none";
    const media = MEDIA_TAGS.has(el.localName);
    if (!hasBg && !media) return;
    const r = deps.getRect(el);
    if (hasBg) bgImages++;
    if (media && r.w * r.h >= vw * vh * 0.1) largeMedia++;
    if (r.w >= vw * 0.5 && r.h >= vh * 0.25) hero = true;
  });
  return { tone: luma(bg) < 0.18 ? "dark" : "light", bgImages: Math.min(bgImages, 999), largeMedia: Math.min(largeMedia, 99), hasHeroMedia: hero };
}

export function buildSummary(nodes: RegionNode[], counts: SummaryCounts, risk: RiskMarker[], deps: SummaryDeps, page: PageFacts): StructuralSummary {
  const built = nodes.map((n) => {
    const { style, family } = styleOf(n.el, deps);
    const r = deps.getRect(n.el);
    const region: Region = {
      id: n.id,
      role: n.role,
      tag: /^[a-z][a-z0-9-]*$/.test(n.tag) ? n.tag : "div",
      classes: sanitizeClasses(n.el),
      childCount: n.childCount,
      linkCount: n.linkCount,
      depth: n.depth,
      rect: { x: round10(r.x), y: round10(r.y), w: Math.max(0, round10(r.w)), h: Math.max(0, round10(r.h)) },
      style,
    };
    return { region, family, priority: n.priority, idx: n.idx };
  });

  const assemble = (list: typeof built): StructuralSummary => ({
    v: 1,
    viewport: { w: Math.round(deps.viewport.w), h: Math.round(deps.viewport.h) },
    palette: topByCount(list.flatMap((b) => [b.region.style.color, b.region.style.bg]), 8),
    fonts: topByCount(list.map((b) => b.family).filter((f) => FONT_NAME.test(f)), 3),
    counts,
    risk,
    page,
    regions: list.map((b) => b.region),
  });

  let kept = built;
  let summary = assemble(kept);
  while (JSON.stringify(summary).length > SUMMARY_MAX_BYTES && kept.length > 0) {
    let drop = 0;
    kept.forEach((b, i) => {
      const d = kept[drop]!;
      if (b.priority < d.priority || (b.priority === d.priority && b.idx > d.idx)) drop = i;
    });
    kept = kept.filter((_, i) => i !== drop);
    summary = assemble(kept);
  }
  return summary;
}
