import { parseColor } from "../analyzer/summary.ts";
import { nudgeForeground, readableOn } from "./color.ts";
import { contrastRatio } from "./contrast.ts";
import { backdrop, GUARD_LIMITS, READABLE, textColor, type GuardProvider } from "./guard.ts";
import type { Tokens } from "./schema.ts";

/**
 * The readability pipeline (pure). The theme always goes on; afterwards every sampled text element whose colours do not read well
 * is repaired by a colour-only rule, or keeps the site's own colours when a picture or gradient sits behind it. Nothing here
 * refuses or rolls back a theme. Rules are written as structural selectors (tags and positions from html, no ids, no text, no attribute values).
 */

/** Same forced prefix the compiler uses for the page root: beats the site's rules, matches no element by itself. */
export const REPAIR_ROOT = 'html[data-skinly="on"]:not(#skinly-force)';
/** The repair sheet is cut off at this size. */
export const REPAIR_CSS_MAX = 30 * 1024;
const MAX_DEPTH = 40;
const TAG = /^[a-z][a-z0-9-]{0,40}$/;

export interface Original {
  color: string;
  bg: string;
}
export type Snapshot = Map<Element, Original>;

/** Computed colours of the sampled elements (300 text parents, 30 editable fields), taken before the theme goes on. */
export function snapshotText(p: GuardProvider): Snapshot {
  const snap: Snapshot = new Map();
  for (const el of [...p.textParents(GUARD_LIMITS.text), ...p.editables(GUARD_LIMITS.editables)]) {
    const s = p.style(el);
    snap.set(el, { color: s.color, bg: s.backgroundColor });
  }
  return snap;
}

/** What one repair rule sets. `transparent` appears only when a picture's own look is restored. */
export interface Paint {
  color?: string;
  bg?: string;
}

/** tag:nth-child path from html, or null when the element is in a shadow tree or too deep. */
export function pathOf(el: Element): string | null {
  const segs: string[] = [];
  for (let cur: Element | null = el; cur && cur.localName !== "html"; cur = cur.parentElement) {
    const parent: Element | null = cur.parentElement;
    if (!parent || !TAG.test(cur.localName)) return null;
    segs.push(cur.localName === "body" ? "body" : `${cur.localName}:nth-child(${Array.prototype.indexOf.call(parent.children, cur) + 1})`);
    if (segs.length > MAX_DEPTH) return null;
  }
  return segs.length === 0 ? null : `${REPAIR_ROOT} > ${segs.reverse().join(" > ")}`;
}

const HEX = /^#[0-9a-f]{6}$/;
const rgbDistance = (a: string, b: string): number => {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  return Math.hypot(((x >> 16) & 255) - ((y >> 16) & 255), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255));
};

/** The theme text colour nearest to `current` that reads on `bg`; else the colour nudged to read; else black or white. */
export function pickColor(current: string, bg: string, t: Pick<Tokens, "text" | "muted" | "link" | "accent" | "focus">): string {
  const ok = [t.text, t.muted, t.link, t.accent, t.focus].filter((c) => HEX.test(c) && contrastRatio(c, bg) >= READABLE);
  if (ok.length > 0) return ok.sort((a, b) => rgbDistance(a, current) - rgbDistance(b, current))[0]!;
  const nudged = nudgeForeground(t.text, bg, READABLE);
  return contrastRatio(nudged, bg) >= READABLE ? nudged : readableOn(bg);
}

export interface Failure {
  el: Element;
  /** What the element reads like now. */
  fg: string;
  bg: string;
  ratio: number;
  paint: Paint;
}

export interface Audit {
  checked: number;
  failures: Failure[];
}

/**
 * Reads the page as it looks now. An element fails when its text/background pair is under 4.5, or when a picture or gradient is behind
 * it and the theme changed its colours (then its recorded original colours come back). `snap` holds the originals.
 */
export function audit(p: GuardProvider, snap: Snapshot, t: Tokens): Audit {
  const els = new Set<Element>(snap.keys());
  for (const el of p.textParents(GUARD_LIMITS.text)) els.add(el);
  const failures: Failure[] = [];
  let checked = 0;
  for (const el of els) {
    const b = backdrop(p, el);
    if (!b) continue;
    checked++;
    const now = p.style(el);
    const orig = snap.get(el);
    if (b.image) {
      if (!orig) continue;
      const paint: Paint = {};
      const oc = parseColor(orig.color);
      if (oc && orig.color !== now.color) paint.color = oc.hex;
      const ob = parseColor(orig.bg);
      if (ob && orig.bg !== now.backgroundColor) paint.bg = ob.alpha >= 0.99 ? ob.hex : "transparent";
      if (paint.color || paint.bg) failures.push({ el, fg: now.color, bg: b.hex, ratio: 0, paint });
      continue;
    }
    const fg = textColor(p, el, b.hex);
    if (!fg) continue;
    const ratio = contrastRatio(fg, b.hex);
    if (ratio < READABLE) failures.push({ el, fg, bg: b.hex, ratio, paint: { color: pickColor(fg, b.hex, t) } });
  }
  return { checked, failures };
}

/** Cumulative rules keyed by path, so a re-render never undoes an earlier repair. */
export type RuleBook = Map<string, Paint>;

export function addFailures(book: RuleBook, failures: readonly Failure[]): number {
  let added = 0;
  for (const f of failures) {
    const path = pathOf(f.el);
    if (!path) continue;
    book.set(path, f.paint);
    added++;
  }
  return added;
}

const decls = (v: Paint): string => [v.color ? `color: ${v.color} !important;` : "", v.bg ? `background-color: ${v.bg} !important;` : ""].filter(Boolean).join(" ");

/** CSS for the rule book, grouped by colour pair, colour and background-color only, at most REPAIR_CSS_MAX bytes. */
export function repairCss(book: RuleBook): string {
  const groups = new Map<string, string[]>();
  for (const [path, v] of book) {
    const key = decls(v);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(path);
    else groups.set(key, [path]);
  }
  let out = "";
  for (const [key, paths] of groups) {
    let block = "";
    for (const path of paths) {
      const next = block === "" ? path : `${block}, ${path}`;
      if (out.length + next.length + key.length + 8 > REPAIR_CSS_MAX) break;
      block = next;
    }
    if (block) out += `${block} { ${key} }\n`;
  }
  return out;
}

export const isPaintValue = (v: string): boolean => HEX.test(v) || v === "transparent";

// ---------------------------------------------------------------------------------------------------------------------------------
// The AI's answer: element index plus hex colours only.

declare const validRepair: unique symbol;
export interface RepairFix {
  i: number;
  color: string;
  bg?: string;
}
/** A RepairPlan that went through validateRepair. Only this type can be compiled. */
export type ValidRepairPlan = { v: 1; fixes: RepairFix[] } & { readonly [validRepair]: true };

export const MAX_REPAIR_ELEMENTS = 40;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `bgs[i]` is the colour behind element i, as the payload told the model. Rejects unknown keys, bad indices, bad hex. A colour that
 * does not reach 4.5 against its background is repaired (nudged), not rejected.
 */
export function validateRepair(input: unknown, bgs: readonly string[]): { ok: true; plan: ValidRepairPlan } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRec(input) || input["v"] !== 1 || !Array.isArray(input["fixes"])) return { ok: false, errors: ["plan: shape"] };
  for (const k of Object.keys(input)) if (k !== "v" && k !== "fixes") errors.push(`plan.${k}: unknown key`);
  const fixes: RepairFix[] = [];
  const seen = new Set<number>();
  input["fixes"].slice(0, MAX_REPAIR_ELEMENTS).forEach((f, n) => {
    if (!isRec(f)) return errors.push(`fixes[${n}]: shape`);
    for (const k of Object.keys(f)) if (k !== "i" && k !== "color" && k !== "bg") errors.push(`fixes[${n}].${k}: unknown key`);
    const i = f["i"];
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= bgs.length) return errors.push(`fixes[${n}].i: out of range`);
    if (seen.has(i)) return errors.push(`fixes[${n}].i: duplicate`);
    const color = typeof f["color"] === "string" ? f["color"].toLowerCase() : "";
    if (!HEX.test(color)) return errors.push(`fixes[${n}].color: must be #rrggbb`);
    const bgIn = f["bg"];
    if (bgIn !== undefined && !(typeof bgIn === "string" && HEX.test(bgIn.toLowerCase()))) return errors.push(`fixes[${n}].bg: must be #rrggbb`);
    seen.add(i);
    // The background the text will sit on: the model's own choice when given, otherwise the one the page has.
    const behind = typeof bgIn === "string" ? bgIn.toLowerCase() : bgs[i]!;
    const fix: RepairFix = { i, color: contrastRatio(color, behind) >= READABLE ? color : nudgeForeground(color, behind, READABLE) };
    if (typeof bgIn === "string") fix.bg = bgIn.toLowerCase();
    fixes.push(fix);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, plan: { v: 1, fixes } as ValidRepairPlan };
}

/** Compiles a validated plan against the elements the payload was built from. */
export function compileRepair(plan: ValidRepairPlan, targets: readonly Element[], book: RuleBook): number {
  let n = 0;
  for (const f of plan.fixes) {
    const el = targets[f.i];
    const path = el ? pathOf(el) : null;
    if (!path) continue;
    book.set(path, f.bg ? { color: f.color, bg: f.bg } : { color: f.color });
    n++;
  }
  return n;
}


/** Largest repair sheet kept with a remembered site (storage is shared with assets). */
export const STORED_REPAIR_MAX = 10 * 1024;

const SEGMENT = /^(?:body|[a-z][a-z0-9-]{0,40}:nth-child\(\d{1,4}\))$/;
const PAINT_VALUE = /^(?:#[0-9a-f]{6}|transparent)$/;

/**
 * Reads back a repair sheet that we stored earlier. Strict: only rules of the exact shape repairCss writes (structural selectors under
 * the forced root, colour and background-color with hex or transparent). Anything else makes the whole sheet unusable (undefined).
 */
export function parseRepairCss(css: unknown): RuleBook | undefined {
  if (typeof css !== "string" || css.length > STORED_REPAIR_MAX) return undefined;
  const book: RuleBook = new Map();
  for (const line of css.split("\n")) {
    if (line.trim() === "") continue;
    const m = /^(.+) \{ (.+) \}$/.exec(line);
    if (!m) return undefined;
    const paint: Paint = {};
    for (const d of m[2]!.split(";").map((x) => x.trim()).filter(Boolean)) {
      const dm = /^(color|background-color): (#[0-9a-f]{6}|transparent) !important$/.exec(d);
      if (!dm || !PAINT_VALUE.test(dm[2]!)) return undefined;
      if (dm[1] === "color") paint.color = dm[2]!;
      else paint.bg = dm[2]!;
    }
    for (const sel of m[1]!.split(", ")) {
      const prefix = `${REPAIR_ROOT} > `;
      if (!sel.startsWith(prefix)) return undefined;
      const segs = sel.slice(prefix.length).split(" > ");
      if (segs.length === 0 || segs.length > MAX_DEPTH + 1 || !segs.every((s) => SEGMENT.test(s))) return undefined;
      book.set(sel, { ...paint });
    }
  }
  return book;
}

/** The part of a rule book that fits the stored size (whole rules only). */
export const storableRepairCss = (css: string): string => {
  if (css.length <= STORED_REPAIR_MAX) return css;
  const cut = css.lastIndexOf("\n", STORED_REPAIR_MAX);
  return cut > 0 ? css.slice(0, cut + 1) : "";
};
