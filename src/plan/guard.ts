import { parseColor } from "../analyzer/summary.ts";

/**
 * The page reader behind the readability pipeline (pure). It looks at what the page shows through computed style only, and never
 * writes to the page. The style provider is injected so the logic is unit-tested without a layout engine; src/extension/guard-dom.ts
 * is the real one. What to do about unreadable parts lives in readability.ts; here are the readings and the media check.
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
/** Every sampled text pair must reach this after the repair pass. */
export const READABLE = 4.5;

type MediaState = Pick<GuardStyle, "display" | "visibility" | "opacity" | "filter" | "backgroundImage">;
export type MediaBefore = Map<Element, MediaState>;

const mediaState = (s: GuardStyle): MediaState => ({ display: s.display, visibility: s.visibility, opacity: s.opacity, filter: s.filter, backgroundImage: s.backgroundImage });

/** Taken before the theme goes on. */
export function captureMedia(p: GuardProvider): MediaBefore {
  const before: MediaBefore = new Map();
  for (const el of p.media(GUARD_LIMITS.media)) before.set(el, mediaState(p.style(el)));
  return before;
}

export const none = (v: string): boolean => v === "" || v === "none";

export interface Backdrop {
  /** The colour behind, blended; "#ffffff" when nothing paints. */
  hex: string;
  /** A background image or gradient lies in the ancestor chain, so the colour behind is not known. */
  image: boolean;
}

export function blend(top: string, under: string, alpha: number): string {
  const a = parseInt(top.slice(1), 16);
  const b = parseInt(under.slice(1), 16);
  const ch = (shift: number): string => Math.round(((a >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha)).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/**
 * The colour behind an element, found by walking its ancestors. `image` is true when a background image or gradient is somewhere in
 * the chain (up to the first opaque colour layer above it). Translucent layers are blended over what lies beneath them; a page
 * with no colour at all is white. null means a colour could not be read.
 */
export function backdrop(p: GuardProvider, el: Element): Backdrop | null {
  const layers: Array<{ hex: string; alpha: number }> = [];
  let image = false;
  for (let cur: Element | null = el; cur; cur = p.parentOf(cur)) {
    const s = p.style(cur);
    if (!none(s.backgroundImage)) image = true;
    const c = parseColor(s.backgroundColor);
    if (!c) return null;
    if (c.alpha > 0) {
      layers.push({ hex: c.hex, alpha: c.alpha });
      if (c.alpha >= 0.99) break;
    }
  }
  let base = "#ffffff";
  for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i]!.hex, base, layers[i]!.alpha);
  return { hex: base, image };
}

/** The colour behind an element, or null when unknown (image in the chain, or unreadable). */
export function effectiveBackground(p: GuardProvider, el: Element): string | null {
  const b = backdrop(p, el);
  return b === null || b.image ? null : b.hex;
}

/** Text colour of an element blended over what is behind it (a translucent colour counts as it looks). */
export function textColor(p: GuardProvider, el: Element, bg: string): string | null {
  const fg = parseColor(p.style(el).color);
  if (!fg) return null;
  return fg.alpha < 1 ? blend(fg.hex, bg, fg.alpha) : fg.hex;
}

/** True when the media the page showed before still shows the same way. Media is never repaired, only checked. */
export function mediaIntact(p: GuardProvider, before: MediaBefore): boolean {
  for (const [el, was] of before) {
    const now = mediaState(p.style(el));
    if (now.display !== was.display || now.visibility !== was.visibility || now.opacity !== was.opacity || now.filter !== was.filter) return false;
    if (!none(was.backgroundImage) && none(now.backgroundImage)) return false;
  }
  return true;
}
