import type { StructuralSummary } from "../core/types.ts";
import { isDark } from "./contrast.ts";
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
export const TIER_B = ["display", "grid-template-columns", "flex-wrap", "gap", "list-style", "padding", "margin"] as const;
export const ALLOWED_PROPERTIES: ReadonlySet<string> = new Set<string>([...TIER_A, ...TIER_B]);

/** Fixed system font stacks. The AI never names fonts. */
export const FONT_STACKS: Record<FontKey, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  humanist: '"Segoe UI", Candara, "Gill Sans", "Trebuchet MS", sans-serif',
  rounded: 'ui-rounded, "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif',
  geometric: '"Century Gothic", Futura, "Avenir Next", "Trebuchet MS", sans-serif',
};

const ROOT = 'html[data-skinly="on"]';
const headings = "h1, h2, h3, h4, h5, h6";
/** Elements that get text colour and the page background. Media elements are never listed. */
const CONTAINERS = "body, div, section, article, header, footer, nav, aside, main, form, fieldset, details, summary, ul, ol, li, dl, dd, dt, table, thead, tbody, tr, td, th, blockquote, figure, figcaption, label, legend, address";
const TEXTS = `p, span, small, strong, em, b, i, code, pre, blockquote, ${headings}, label, legend, td, th, li, dd, dt, summary, figcaption`;
/** Elements that take the plan font. span and i are left alone so icon fonts keep working. */
const FONT_TARGETS = `body, p, li, a, ${headings}, td, th, label, button, input, select, textarea, blockquote, dd, dt, figcaption, legend, summary`;
const CODE = "code, pre, kbd, samp";
const CONTROLS = 'button, select, textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="image"]):not([type="hidden"])';

const decl = (prop: string, value: string): string => `${prop}: ${value} !important;`;
const rule = (selector: string, decls: string[]): string => `${selector} { ${decls.join(" ")} }`;

/** CSS from fixed templates only. Every value is a validated hex, an enum mapped to a constant, or a bounded number. */
export function compileCss(plan: ValidPlan, summary: StructuralSummary): string {
  const t = plan.tokens;
  const s = (sel: string): string => sel.split(",").map((p) => `${ROOT} ${p.trim()}`).join(", ");
  const out: string[] = [];

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
  out.push(rule(s(FONT_TARGETS), [decl("font-family", FONT_STACKS[t.font])]));
  out.push(rule(s(CODE), [decl("font-family", FONT_STACKS.mono)]));
  out.push(rule(s("small, figcaption, caption, legend"), [decl("color", t.muted)]));
  out.push(rule(s("a, a:link, a:visited"), [decl("color", t.link), decl("text-decoration-color", t.link)]));
  out.push(rule(s("hr"), [decl("border-color", t.border)]));
  out.push(
    rule(s(CONTROLS), [
      decl("background-color", t.surface),
      decl("color", t.text),
      decl("border-color", t.border),
      decl("border-radius", `${t.radius}px`),
      decl("caret-color", t.text),
    ]),
  );
  out.push(rule(s("a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible"), [
    decl("outline-color", t.focus),
    decl("outline-width", "2px"),
    decl("outline-style", "solid"),
    decl("outline-offset", "2px"),
  ]));

  const byId = new Map(summary.regions.map((r) => [r.id, r]));
  for (const r of plan.regionRules) {
    const region = byId.get(r.region);
    if (!region || !/^r[0-9]{1,3}$/.test(r.region)) continue;
    const sel = `${ROOT} [data-skinly-r="${r.region}"]`;
    const d: string[] = [];
    if (r.surface === "flat") d.push(decl("background-color", t.surface));
    if (r.surface === "card") {
      d.push(
        decl("background-color", t.surface),
        decl("border-color", t.border),
        decl("border-width", "1px"),
        decl("border-style", "solid"),
        decl("border-radius", `${t.radius}px`),
        decl("box-shadow", `0 1px 3px ${t.border}`),
      );
    }
    if (r.layout !== "none" && layoutAllowed(region.role, region.linkCount, summary.risk)) {
      const gap = `${r.spacing * 4 + 4}px`;
      if (r.layout === "link-grid") {
        d.push(
          decl("display", "grid"),
          decl("grid-template-columns", "repeat(auto-fill, minmax(12rem, 1fr))"),
          decl("gap", gap),
          decl("list-style", "none"),
          decl("padding", `${r.spacing * 4}px`),
        );
      } else {
        d.push(decl("display", "flex"), decl("flex-wrap", "wrap"), decl("gap", gap), decl("list-style", "none"), decl("padding", `${r.spacing * 4}px`));
      }
    }
    if (d.length > 0) out.push(rule(sel, d));
    if (r.layout === "link-grid" || r.layout === "nav-wrap") {
      // List items inside a laid-out container lose their bullets too.
      if (d.length > 0 && region.role !== "nav") out.push(rule(`${sel} > li`, [decl("list-style", "none")]));
    }
  }
  return out.join("\n") + "\n";
}
