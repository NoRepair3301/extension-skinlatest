import type { StructuralSummary } from "../core/types.ts";
import { nudgeForeground } from "./color.ts";
import { isDark } from "./contrast.ts";
import { deriveColors } from "./derive.ts";
import { layoutAllowed, type FontKey, type ValidPlan } from "./schema.ts";

/** SPEC 4.3 tier A and tier B. The compiler may emit nothing else. */
export const TIER_A = [
  "color",
  "background-color",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "box-shadow",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "text-decoration-color",
  "outline-color",
  "outline-width",
  "outline-style",
  "outline-offset",
  "accent-color",
  "caret-color",
  "color-scheme",
  "scrollbar-color",
] as const;
export const TIER_B = ["display", "grid-template-columns", "flex-wrap", "flex-direction", "gap", "list-style", "padding", "margin", "max-width"] as const;
/** Tag-based element templates and legacy-markup force rules. */
export const TIER_C = ["border-collapse"] as const;
export const ALLOWED_PROPERTIES: ReadonlySet<string> = new Set<string>([...TIER_A, ...TIER_B, ...TIER_C]);

/** Fixed system font stacks. The AI never names fonts. */
export const FONT_STACKS: Record<FontKey, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  humanist: '"Segoe UI", Candara, "Gill Sans", "Trebuchet MS", sans-serif',
  rounded: 'ui-rounded, "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif',
  geometric: '"Century Gothic", Futura, "Avenir Next", "Trebuchet MS", sans-serif',
};


/**
 * Two kinds of selectors. ROOT is forced (specificity raised, !important) and only paints the page background with its text colour,
 * plus the legacy-markup overrides of the full strategy. Everything else sits under LOW, which adds no specificity and no !important,
 * so a class the site wrote itself wins wherever it sets its own colours. Our sheet is also adopted last.
 */
const ROOT = 'html[data-skinly="on"]:not(#skinly-force)';
const LOW = ':where(html[data-skinly="on"])';
const headings = "h1, h2, h3, h4, h5, h6";
/** Never restyled from outside: whatever sits inside a button or link keeps what the button or link sets (label colour on an accent surface). */
const INSIDE = ':not(:where(button *, a *, [role="button"] *, [role="tab"] *, [role="menuitem"] *, [role="option"] *))';
/** Boxes that only exist for structure. Painted only when the plan says protectBackgrounds is false. */
const WRAPPERS = "div, section, article, header, footer, nav, aside, main, form, fieldset, details, ul, ol, li, dl, dd, dt, blockquote, figure, label, address, center";
/** Table parts: painted in the full strategy. */
const TABLE_BOXES = "table, thead, tbody, tfoot, tr, td, th";
const TEXTS = `p, li, td, th, dd, dt, blockquote, label, legend, summary, figcaption, code, pre, ${headings}`;
/** Elements that take the plan font (full strategy). Form controls keep their own font so they cannot clip. */
const FONT_TARGETS = `body, p, li, a, ${headings}, td, th, label, blockquote, dd, dt, figcaption, legend, summary`;
const CODE = "code, pre, kbd, samp";
const TEXT_INPUT_TYPES = ["text", "email", "search", "url", "tel", "number", "password", "date", "datetime-local", "month", "week", "time"];
const FIELDS = ["input:not([type])", ...TEXT_INPUT_TYPES.map((t) => `input[type="${t}"]`), "textarea", "select"].join(", ");
const BUTTON_TYPES = ["button", "submit", "reset"];
const BUTTONS = ["button", ...BUTTON_TYPES.map((t) => `input[type="${t}"]`)].join(", ");
/** Panels by tag only; classes are never used. */
const PANELS = "article, aside, details, fieldset, figure";
/** Boxes that legacy markup (bgcolor, inline background colours) is neutralised on. Never body (the page background is on html) and never media. */
const LEGACY_BOXES = "table, thead, tbody, tfoot, tr, td, th, div, section, article, header, footer, nav, aside, main, center, form, p, ul, ol, li, span, a, font";
/** Inline backgrounds that carry a picture are left alone. */
const NO_PICTURE = ':not([style*="url"])';

const decl = (prop: string, value: string, important = false): string => `${prop}: ${value}${important ? " !important" : ""};`;
const rule = (selector: string, decls: string[]): string => `${selector} { ${decls.join(" ")} }`;
/** "a, b" + "[x]" becomes "a[x], b[x]". */
const withAttr = (list: string, attr: string): string => splitList(list).map((p) => p + attr).join(", ");
/** Splits a selector list at its top-level commas (not the ones inside parentheses or brackets). */
function splitList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts.filter(Boolean);
}

/**
 * CSS from fixed templates only. Every value is a validated hex, a colour derived from the plan tokens (src/plan/derive.ts,
 * contrast-checked pair by pair), an enum mapped to a constant, or a bounded number. Nothing here moves, hides or rebuilds a node.
 * A theme may recolour a page; it never touches media, the background shorthand, opacity, filters, stacking, size or spacing
 * (the region layouts of the full strategy are the one opt-in exception). Where a rule sets a background colour it sets a text colour too.
 */
export function compileCss(plan: ValidPlan, summary: StructuralSummary): string {
  const t = plan.tokens;
  const strategy = plan.strategy ?? "full";
  const protect = plan.protectBackgrounds ?? true;
  const d = deriveColors(t);
  const low = (sel: string): string => splitList(sel).map((p) => `${LOW} ${p}`).join(", ");
  const forced = (sel: string): string => splitList(sel).map((p) => `${ROOT} ${p}`).join(", ");
  const out: string[] = [];
  const r = `${t.radius}px`;
  const full = strategy === "full";
  const paintsPage = strategy !== "text-only";

  // Text colours that need a known background are fitted to the page's own tone in text-only mode (no page background of ours).
  const pageBg = summary.page?.tone === "dark" ? "#121212" : "#ffffff";
  const text = paintsPage ? t.text : nudgeForeground(t.text, pageBg, 4.5);
  const link = paintsPage ? t.link : nudgeForeground(t.link, pageBg, 4.5);
  const visited = paintsPage ? d.linkVisited : nudgeForeground(d.linkVisited, pageBg, 4.5);
  const hover = paintsPage ? d.linkHover : nudgeForeground(d.linkHover, pageBg, 4.5);

  // The page: background on html only, paired with the text colour. Body only gets its text colour, never a background.
  if (paintsPage) {
    out.push(
      rule(ROOT, [
        decl("color-scheme", isDark(t.bg) ? "dark" : "light", true),
        decl("background-color", t.bg, true),
        decl("color", t.text, true),
        decl("accent-color", t.accent, true),
        decl("scrollbar-color", `${t.border} ${t.bg}`, true),
      ]),
    );
  }
  out.push(rule(low("body"), [decl("color", text)]));
  out.push(rule(low(headings.split(", ").map((h) => `${h}${INSIDE}`).join(", ")), [decl("color", text)]));

  // Links.
  out.push(rule(low("a, a:link"), [decl("color", link), decl("text-decoration-color", link)]));
  out.push(rule(low("a:visited"), [decl("color", visited), decl("text-decoration-color", visited)]));
  out.push(rule(low("a:hover, a:focus"), [decl("color", hover), decl("text-decoration-color", hover)]));

  if (paintsPage) {
    // Accent on focus and borders only (all strategies that paint the page).
    out.push(rule(low("hr"), [decl("border-color", t.border)]));
    out.push(rule(low("::selection"), [decl("background-color", t.accent), decl("color", d.onAccent)]));
    out.push(
      rule(low("a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible"), [
        decl("outline-color", t.focus),
        decl("outline-width", "2px"),
        decl("outline-style", "solid"),
        decl("outline-offset", "2px"),
      ]),
    );
  }

  if (full) {
    // Typography.
    out.push(rule(low(TEXTS.split(", ").map((e) => `${e}${INSIDE}`).join(", ")), [decl("color", t.text)]));
    out.push(rule(low(FONT_TARGETS), [decl("font-family", FONT_STACKS[t.font])]));
    out.push(rule(low("small, figcaption, caption, legend"), [decl("color", t.muted)]));
    out.push(rule(low("li::marker"), [decl("color", t.accent)]));

    // Wrapper boxes only when backgrounds are not protected; table parts are always themed.
    if (!protect) out.push(rule(low(withAttr(WRAPPERS, INSIDE)), [decl("background-color", t.bg), decl("color", t.text), decl("border-color", t.border)]));
    out.push(rule(low(TABLE_BOXES), [decl("background-color", t.bg), decl("color", t.text), decl("border-color", t.border)]));

    // Legacy markup, CSS only: attributes and inline background colours are overridden, never edited. Pictures are left alone.
    out.push(rule(forced(withAttr(LEGACY_BOXES, "[bgcolor]")), [decl("background-color", t.bg, true), decl("color", t.text, true)]));
    out.push(rule(forced(withAttr(LEGACY_BOXES, `[style*="background-color"]${NO_PICTURE}`)), [decl("background-color", t.bg, true), decl("color", t.text, true)]));
    out.push(rule(forced(`body[bgcolor], body[style*="background-color"]${NO_PICTURE}`), [decl("background-color", "transparent", true), decl("color", t.text, true)]));
    out.push(rule(forced("font[color]"), [decl("color", t.text, true)]));
    out.push(rule(forced("table[border], table[border] td, table[border] th"), [decl("border-color", t.border, true)]));

    out.push(rule(low(CODE), [decl("font-family", FONT_STACKS.mono), decl("background-color", d.surfaceAlt), decl("color", t.text), decl("border-radius", r)]));
    out.push(rule(low(PANELS), [decl("background-color", t.surface), decl("color", t.text), decl("border-color", t.border), decl("border-radius", r), decl("box-shadow", `0 1px 2px ${t.border}`)]));

    // Buttons: accent surface with a derived readable label, hover, disabled. Their contents inherit that label colour.
    out.push(rule(low(BUTTONS), [decl("background-color", t.accent), decl("color", d.onAccent), decl("border-color", t.accent), decl("border-radius", r)]));
    out.push(rule(low(withAttr(BUTTONS, ":hover")), [decl("background-color", d.accentHover), decl("color", d.onAccent), decl("border-color", d.accentHover)]));
    out.push(rule(low(withAttr(BUTTONS, ":disabled")), [decl("background-color", d.surfaceAlt), decl("color", d.disabledFg), decl("border-color", t.border)]));

    // Text inputs, selects, textareas: surface with its own text and caret colour.
    out.push(rule(low(FIELDS), [decl("background-color", t.surface), decl("color", t.text), decl("border-color", t.border), decl("border-radius", r), decl("caret-color", t.text)]));
    out.push(rule(low(withAttr(FIELDS, ":focus")), [decl("border-color", t.focus)]));
    out.push(rule(low("::placeholder"), [decl("color", t.muted)]));
    out.push(rule(low("option, optgroup"), [decl("background-color", t.surface), decl("color", t.text)]));

    // Tables: header row, zebra rows.
    out.push(rule(low("th, thead td"), [decl("background-color", d.headerBg), decl("color", t.text), decl("font-weight", "600"), decl("border-color", t.border), decl("border-style", "solid"), decl("border-width", "0 0 1px 0")]));
    out.push(rule(low("tbody tr:nth-child(even) > td"), [decl("background-color", d.surfaceAlt), decl("color", t.text)]));
  }

  const byId = new Map(summary.regions.map((reg) => [reg.id, reg]));
  const paintRegions = !protect || (!summary.page?.hasHeroMedia && (summary.page?.largeMedia ?? 0) === 0);
  for (const rr of full ? plan.regionRules : []) {
    const region = byId.get(rr.region);
    if (!region || !/^r[0-9]{1,3}$/.test(rr.region)) continue;
    const sel = `${LOW} [data-skinly-r="${rr.region}"]`;
    const decls: string[] = [];
    if (paintRegions && rr.surface === "flat") decls.push(decl("background-color", t.surface), decl("color", t.text));
    if (paintRegions && rr.surface === "card") {
      decls.push(
        decl("background-color", t.surface),
        decl("color", t.text),
        decl("border-color", t.border),
        decl("border-width", "1px"),
        decl("border-style", "solid"),
        decl("border-radius", r),
        decl("box-shadow", `0 1px 3px ${t.border}`),
      );
    }
    const gap = `${rr.spacing * 4 + 4}px`;
    const pad = `${rr.spacing * 4}px`;
    const laid = rr.layout !== "none" && layoutAllowed(rr.layout, region, summary.risk);
    if (laid) {
      switch (rr.layout) {
        case "link-grid":
          decls.push(decl("display", "grid"), decl("grid-template-columns", "repeat(auto-fill, minmax(12rem, 1fr))"), decl("gap", gap), decl("list-style", "none"), decl("padding", pad));
          break;
        case "nav-wrap":
          decls.push(decl("display", "flex"), decl("flex-wrap", "wrap"), decl("gap", gap), decl("list-style", "none"), decl("padding", pad));
          break;
        case "card-grid":
          decls.push(decl("display", "grid"), decl("grid-template-columns", "repeat(auto-fill, minmax(14rem, 1fr))"), decl("gap", gap), decl("list-style", "none"), decl("padding", pad));
          break;
        case "stack":
          decls.push(decl("display", "flex"), decl("flex-direction", "column"), decl("gap", gap), decl("list-style", "none"), decl("padding", pad));
          break;
        case "center-column":
          decls.push(decl("max-width", "72rem"), decl("margin", "0 auto"), decl("padding", pad));
          break;
        case "table-clean":
          decls.push(decl("border-collapse", "collapse"));
          break;
      }
    }
    if (decls.length > 0) out.push(rule(sel, decls));
    if (laid && rr.layout === "table-clean") {
      out.push(rule(`${sel} th, ${sel} td`, [decl("padding", `${rr.spacing * 2 + 6}px ${rr.spacing * 2 + 10}px`), decl("border-color", t.border), decl("border-width", "1px"), decl("border-style", "solid")]));
    }
    if (laid && (rr.layout === "link-grid" || rr.layout === "card-grid" || rr.layout === "stack") && region.role !== "nav") {
      // List items inside a laid-out container lose their bullets too.
      out.push(rule(`${sel} > li`, [decl("list-style", "none")]));
    }
  }
  return out.join("\n") + "\n";
}
