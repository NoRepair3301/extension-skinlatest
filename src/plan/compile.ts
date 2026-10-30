import type { StructuralSummary } from "../core/types.ts";
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
/** Tag-based element templates and legacy-markup force rules. background-image only ever gets the value none. */
export const TIER_C = ["border-collapse", "background-image"] as const;
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
 * Every selector starts here. The :not(#id) part never matches an element; it only raises specificity so site rules
 * written with classes cannot win against ours even when both use !important. Our sheet is also adopted last.
 */
const ROOT = 'html[data-skinly="on"]:not(#skinly-force)';
const headings = "h1, h2, h3, h4, h5, h6";
/** Elements that get text colour and the page background. Media elements are never listed. */
const CONTAINERS = "body, div, section, article, header, footer, nav, aside, main, form, fieldset, details, summary, ul, ol, li, dl, dd, dt, table, thead, tbody, tfoot, tr, td, th, blockquote, figure, figcaption, label, legend, address, center";
const TEXTS = `p, span, small, strong, em, b, i, font, code, pre, blockquote, ${headings}, label, legend, td, th, li, dd, dt, summary, figcaption`;
/** Elements that take the plan font. span and i are left alone so icon fonts keep working. */
const FONT_TARGETS = `body, p, li, a, ${headings}, td, th, label, button, input, select, textarea, blockquote, dd, dt, figcaption, legend, summary`;
const SIZED = "body, p, li, td, th, dd, dt, label, blockquote";
const CODE = "code, pre, kbd, samp";
const TEXT_INPUT_TYPES = ["text", "email", "search", "url", "tel", "number", "password", "date", "datetime-local", "month", "week", "time"];
const FIELDS = ["input:not([type])", ...TEXT_INPUT_TYPES.map((t) => `input[type="${t}"]`), "textarea", "select"].join(", ");
const BUTTON_TYPES = ["button", "submit", "reset"];
const BUTTONS = ["button", ...BUTTON_TYPES.map((t) => `input[type="${t}"]`)].join(", ");
/** Panels by tag only; classes are never used. */
const PANELS = "article, aside, details, fieldset, figure";
/** Non-media boxes that legacy markup (bgcolor, inline backgrounds) is neutralised on. */
const LEGACY_BOXES = "body, table, thead, tbody, tfoot, tr, td, th, div, section, article, header, footer, nav, aside, main, center, form, p, ul, ol, li, span, a, font";

const decl = (prop: string, value: string): string => `${prop}: ${value} !important;`;
const rule = (selector: string, decls: string[]): string => `${selector} { ${decls.join(" ")} }`;
/** "a, b" + "[x]" becomes "a[x], b[x]". */
const withAttr = (list: string, attr: string): string => list.split(",").map((p) => p.trim() + attr).join(", ");

/**
 * CSS from fixed templates only. Every value is a validated hex, a colour derived from the plan tokens (src/plan/derive.ts,
 * contrast-checked pair by pair), an enum mapped to a constant, or a bounded number. Nothing here moves, hides or rebuilds a node.
 */
export function compileCss(plan: ValidPlan, summary: StructuralSummary): string {
  const t = plan.tokens;
  const d = deriveColors(t);
  const s = (sel: string): string => sel.split(",").map((p) => `${ROOT} ${p.trim()}`).join(", ");
  const out: string[] = [];
  const r = `${t.radius}px`;

  // Page, base typography.
  out.push(
    rule(ROOT, [
      decl("color-scheme", isDark(t.bg) ? "dark" : "light"),
      decl("background-color", t.bg),
      decl("color", t.text),
      decl("font-size", `${t.baseSize}px`),
      decl("line-height", String(t.lineHeight)),
      decl("accent-color", t.accent),
      decl("caret-color", t.text),
      decl("scrollbar-color", `${t.border} ${t.bg}`),
    ]),
  );
  out.push(rule(s(CONTAINERS), [decl("background-color", t.bg), decl("color", t.text), decl("border-color", t.border)]));
  out.push(rule(s(TEXTS), [decl("color", t.text)]));
  out.push(rule(s(SIZED), [decl("font-size", `${t.baseSize}px`), decl("line-height", String(t.lineHeight))]));
  out.push(rule(s(headings), [decl("line-height", "1.25")]));
  out.push(rule(s(FONT_TARGETS), [decl("font-family", FONT_STACKS[t.font])]));
  out.push(rule(s("small, figcaption, caption, legend"), [decl("color", t.muted)]));

  // Legacy markup, CSS only: attributes and inline backgrounds are overridden, never edited.
  out.push(rule(s(withAttr(LEGACY_BOXES, "[bgcolor]")), [decl("background-color", t.bg)]));
  out.push(rule(s(withAttr(LEGACY_BOXES, '[style*="background"]')), [decl("background-color", t.bg)]));
  out.push(rule(s("body[background], table[background], thead[background], tbody[background], tr[background], td[background], th[background]"), [decl("background-image", "none")]));
  out.push(rule(s("font[color]"), [decl("color", t.text)]));
  out.push(rule(s("table[border], table[border] td, table[border] th"), [decl("border-color", t.border)]));
  out.push(rule(s('table[cellpadding]:not([cellpadding="0"]) td, table[cellpadding]:not([cellpadding="0"]) th'), [decl("padding", "4px 6px")]));

  // Links.
  out.push(rule(s("a, a:link"), [decl("color", t.link), decl("text-decoration-color", t.link)]));
  out.push(rule(s("a:visited"), [decl("color", d.linkVisited), decl("text-decoration-color", d.linkVisited)]));
  out.push(rule(s("a:hover, a:focus"), [decl("color", d.linkHover), decl("text-decoration-color", d.linkHover)]));

  // Lists, rules, code, selection.
  out.push(rule(s("li::marker"), [decl("color", t.accent)]));
  out.push(rule(s("hr"), [decl("border-color", t.border)]));
  out.push(rule(s(CODE), [decl("font-family", FONT_STACKS.mono), decl("background-color", d.surfaceAlt), decl("color", t.text), decl("border-radius", r)]));
  out.push(rule(s("::selection"), [decl("background-color", t.accent), decl("color", d.onAccent)]));

  // Cards and panels.
  out.push(rule(s(PANELS), [decl("background-color", t.surface), decl("border-color", t.border), decl("border-radius", r), decl("box-shadow", `0 1px 2px ${t.border}`)]));

  // Buttons: accent surface with a derived readable label, hover, disabled.
  out.push(rule(s(BUTTONS), [decl("background-color", t.accent), decl("color", d.onAccent), decl("border-color", t.accent), decl("border-radius", r)]));
  out.push(rule(s(withAttr(BUTTONS, ":hover")), [decl("background-color", d.accentHover), decl("color", d.onAccent), decl("border-color", d.accentHover)]));
  out.push(rule(s(withAttr(BUTTONS, ":disabled")), [decl("background-color", d.surfaceAlt), decl("color", d.disabledFg), decl("border-color", t.border)]));

  // Text inputs, selects, textareas.
  out.push(rule(s(FIELDS), [decl("background-color", t.surface), decl("color", t.text), decl("border-color", t.border), decl("border-radius", r), decl("caret-color", t.text)]));
  out.push(rule(s(withAttr(FIELDS, ":focus")), [decl("border-color", t.focus)]));
  out.push(rule(s("::placeholder"), [decl("color", t.muted)]));
  out.push(rule(s("option, optgroup"), [decl("background-color", t.surface), decl("color", t.text)]));

  // Tables: header row, zebra rows, borders.
  out.push(rule(s("th, thead td"), [decl("background-color", d.headerBg), decl("color", t.text), decl("font-weight", "600"), decl("border-color", t.border), decl("border-style", "solid"), decl("border-width", "0 0 1px 0")]));
  out.push(rule(s("tbody tr:nth-child(even) > td"), [decl("background-color", d.surfaceAlt)]));

  out.push(
    rule(s("a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible"), [
      decl("outline-color", t.focus),
      decl("outline-width", "2px"),
      decl("outline-style", "solid"),
      decl("outline-offset", "2px"),
    ]),
  );

  const byId = new Map(summary.regions.map((reg) => [reg.id, reg]));
  for (const rr of plan.regionRules) {
    const region = byId.get(rr.region);
    if (!region || !/^r[0-9]{1,3}$/.test(rr.region)) continue;
    // Doubled attribute: more specific than the legacy-box rules above, so a region surface wins over an inline background.
    const sel = `${ROOT} [data-skinly-r="${rr.region}"][data-skinly-r="${rr.region}"]`;
    const decls: string[] = [];
    if (rr.surface === "flat") decls.push(decl("background-color", t.surface));
    if (rr.surface === "card") {
      decls.push(
        decl("background-color", t.surface),
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
