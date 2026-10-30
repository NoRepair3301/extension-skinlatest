import { parseColor } from "../analyzer/summary.ts";
import { contrastRatio } from "./contrast.ts";

/**
 * The visual guard (pure). After a theme is applied it looks at what the page now shows, through computed style only, and says
 * whether text, typing and pictures are still visible. It never writes to the page. The style provider is injected so the logic is
 * unit-tested without a layout engine; src/extension/guard-dom.ts is the real one.
 */
export interface GuardStyle {
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  caretColor: string;
  display: string;
  visibility: string;
  opacity: string;
  filter: string;
}

export interface GuardProvider {
  style(el: Element): GuardStyle;
  parentOf(el: Element): Element | null;
  /** Visible elements that directly hold text. */
  textParents(max: number): Element[];
  /** Visible input, textarea, contenteditable and role=textbox elements. */
  editables(max: number): Element[];
  /** The largest media and background-image elements. */
  media(max: number): Element[];
}

export const GUARD_LIMITS = { text: 300, media: 30, editables: 30 } as const;
export const MIN_TEXT_CONTRAST = 3;
export const MIN_EDITABLE_CONTRAST = 4.5;

export type GuardCode = "text" | "editable" | "caret" | "media";
export type GuardResult = { ok: true } | { ok: false; code: GuardCode };

type MediaState = Pick<GuardStyle, "display" | "visibility" | "opacity" | "filter" | "backgroundImage">;
export type MediaBefore = Map<Element, MediaState>;

const mediaState = (s: GuardStyle): MediaState => ({ display: s.display, visibility: s.visibility, opacity: s.opacity, filter: s.filter, backgroundImage: s.backgroundImage });

/** Taken before the theme goes on. */
export function captureMedia(p: GuardProvider): MediaBefore {
  const before: MediaBefore = new Map();
  for (const el of p.media(GUARD_LIMITS.media)) before.set(el, mediaState(p.style(el)));
  return before;
}

const none = (v: string): boolean => v === "" || v === "none";

/**
 * The colour behind an element, found by walking its ancestors. null means unknown: a background image is somewhere in the chain,
 * or a colour could not be read. Translucent layers are blended over what lies beneath them; a page with no colour at all is white.
 */
export function effectiveBackground(p: GuardProvider, el: Element): string | null {
  const layers: Array<{ hex: string; alpha: number }> = [];
  for (let cur: Element | null = el; cur; cur = p.parentOf(cur)) {
    const s = p.style(cur);
    if (!none(s.backgroundImage)) return null;
    const c = parseColor(s.backgroundColor);
    if (!c) return null;
    if (c.alpha > 0) {
      layers.push({ hex: c.hex, alpha: c.alpha });
      if (c.alpha >= 0.99) break;
    }
  }
  let base = "#ffffff";
  for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i]!.hex, base, layers[i]!.alpha);
  return base;
}

function blend(top: string, under: string, alpha: number): string {
  const a = parseInt(top.slice(1), 16);
  const b = parseInt(under.slice(1), 16);
  const ch = (shift: number): string => Math.round(((a >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha)).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Contrast of an element's own text colour against what is behind it, or null when that cannot be known. */
function textContrast(p: GuardProvider, el: Element): number | null {
  const bg = effectiveBackground(p, el);
  const fg = parseColor(p.style(el).color);
  if (bg === null || !fg) return null;
  return contrastRatio(fg.alpha < 1 ? blend(fg.hex, bg, fg.alpha) : fg.hex, bg);
}

/** One text element in 40 may miss the target on a big page (a site's own faint captions); a small page gets no allowance. */
const allowance = (checked: number): number => Math.floor(checked / 40);

export function checkVisual(p: GuardProvider, before: MediaBefore): GuardResult {
  for (const el of p.editables(GUARD_LIMITS.editables)) {
    const c = textContrast(p, el);
    if (c !== null && c < MIN_EDITABLE_CONTRAST) return { ok: false, code: "editable" };
    const caret = parseColor(p.style(el).caretColor);
    const bg = effectiveBackground(p, el);
    if (caret && bg !== null && caret.alpha > 0 && contrastRatio(caret.hex, bg) < MIN_TEXT_CONTRAST) return { ok: false, code: "caret" };
    if (caret && caret.alpha === 0) return { ok: false, code: "caret" };
  }

  const parents = p.textParents(GUARD_LIMITS.text);
  let bad = 0;
  for (const el of parents) {
    const c = textContrast(p, el);
    if (c !== null && c < MIN_TEXT_CONTRAST) bad++;
  }
  if (bad > allowance(parents.length)) return { ok: false, code: "text" };

  for (const [el, was] of before) {
    const now = mediaState(p.style(el));
    if (now.display !== was.display || now.visibility !== was.visibility || now.opacity !== was.opacity || now.filter !== was.filter) return { ok: false, code: "media" };
    if (!none(was.backgroundImage) && none(now.backgroundImage)) return { ok: false, code: "media" };
  }
  return { ok: true };
}
