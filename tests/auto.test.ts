import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { analyze } from "../src/analyzer/analyze.ts";
import { createApplier, type StyleHandle, type StyleHost } from "../src/extension/applier-core.ts";
import { BANNER_TEXT, runAuto, type AutoDeps } from "../src/extension/auto-core.ts";
import { isBadgeMessage, BADGE_MESSAGE } from "../src/extension/messages.ts";
import type { SiteRecord } from "../src/extension/sites.ts";
import { getTheme } from "../src/themes/index.ts";
import { dom, fakeDeps, items } from "./analyzer/helpers.ts";

const BODY =
  `<header><nav>${items(6, (i) => `<a href="/n${i}">x${i}</a>`)}</nav></header>` +
  `<main><ul>${items(8, (i) => `<li><a href="/c${i}">card ${i}</a><p>text ${i}</p></li>`)}</ul></main><footer><a href="/f">f</a></footer>`;

const fakeStyle = () => {
  const sheets: string[] = [];
  const host: StyleHost = {
    add(css) {
      sheets.push(css);
      const h: StyleHandle = {
        remove: () => void sheets.splice(sheets.indexOf(css), 1),
        isAttached: () => sheets.includes(css),
      };
      return h;
    },
  };
  return { host, sheets };
};

function setup(over: { site?: Partial<SiteRecord> | null; body?: string; blocked?: boolean; savedBody?: string } = {}) {
  const doc = dom(over.body ?? BODY);
  const { host, sheets } = fakeStyle();
  const applier = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
  const saved = analyze(dom(over.savedBody ?? BODY), fakeDeps());
  if (saved.status !== "ok") throw new Error("fixture too large");
  const ruleRegion = saved.summary.regions[0]!.id;
  const site: SiteRecord = {
    v: 1,
    plan: { v: 1, themeId: "ocean", tokens: { ...getTheme("ocean").tokens }, regionRules: [{ region: ruleRegion, layout: "none", surface: "flat", spacing: 1 }], reasons: [] },
    fingerprint: saved.fingerprint,
    provider: "gemini",
    model: "m",
    promptVersion: "1",
    savedAt: "2026-10-30T10:00:00.000Z",
    mode: "auto",
    blur: [],
    blurImages: false,
    ...(over.site ?? {}),
  };
  let ready: (() => void) | undefined;
  const applied = vi.fn();
  const deps: AutoDeps = {
    doc,
    origin: "https://a.example",
    applier,
    readSite: async () => (over.site === null ? undefined : site),
    isBlocked: async () => over.blocked === true,
    whenReady: (cb) => void (ready = cb),
    onApplied: applied,
  };
  const tagged = () => doc.querySelectorAll("[data-skinly-r]").length;
  return { doc, sheets, applier, deps, site, applied, tagged, fire: () => ready?.() };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("applier-auto on a single-page app", () => {
  it("puts the theme back after a same-document navigation, at most NAV_REAPPLY_MAX times", async () => {
    const t = setup();
    let navigate: (() => void) | undefined;
    const done = runAuto({ ...t.deps, onNavigate: (cb) => void (navigate = cb) });
    await tick();
    t.fire();
    expect(await done).toBe("full");
    // the route change replaced the page's markup and dropped our sheet and marker
    t.applier.restore();
    expect(t.doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    navigate!();
    expect(t.doc.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(t.sheets).toHaveLength(1);
    for (let i = 0; i < 70; i++) navigate!();
    t.applier.restore();
    navigate!();
    expect(t.doc.documentElement.hasAttribute("data-skinly")).toBe(false);
  });

  it("a saved full-strategy plan is applied no further than safe before the page is ready", async () => {
    const t = setup();
    t.site.plan = { ...t.site.plan, strategy: "full" };
    void runAuto(t.deps);
    await tick();
    expect(t.sheets[0]).not.toContain('input[type="submit"]');
  });
});

describe("applier-auto", () => {
  it("applies global tokens first, region rules only after the DOM is ready and the fingerprint matches", async () => {
    const t = setup();
    const done = runAuto(t.deps);
    await tick();
    expect(t.doc.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(t.sheets).toHaveLength(1);
    expect(t.tagged()).toBe(0);
    expect(t.applied).toHaveBeenCalledTimes(1);
    t.fire();
    expect(await done).toBe("full");
    expect(t.tagged()).toBe(1);
    expect(t.doc.querySelector("[data-skinly-ui]")).toBeNull();
  });

  it("keeps tokens only and shows a dismissible banner when the layout changed", async () => {
    const t = setup({ body: `<main><p>${"x"}</p></main><aside><a href="/a">a</a></aside>`, savedBody: BODY });
    const done = runAuto(t.deps);
    await tick();
    t.fire();
    expect(await done).toBe("changed");
    expect(t.tagged()).toBe(0);
    expect(t.doc.documentElement.getAttribute("data-skinly")).toBe("on");
    const host = t.doc.querySelector("[data-skinly-ui]")!;
    expect(host.shadowRoot!.textContent).toContain(BANNER_TEXT);
    host.shadowRoot!.querySelector("button")!.dispatchEvent(new t.doc.defaultView!.Event("click"));
    expect(t.doc.querySelector("[data-skinly-ui]")).toBeNull();
  });

  it("the banner is removed when Restore runs", async () => {
    const t = setup({ body: `<main><p>x</p></main>`, savedBody: BODY });
    const done = runAuto(t.deps);
    await tick();
    t.fire();
    await done;
    expect(t.doc.querySelector("[data-skinly-ui]")).not.toBeNull();
    const before = t.doc.documentElement.outerHTML;
    expect(before).toContain("data-skinly-ui");
    // a real Restore runs the hooks
    t.applier.restore();
    expect(t.doc.querySelector("[data-skinly-ui]")).toBeNull();
  });

  it("an invalid stored plan applies nothing", async () => {
    const bad = { ...setup().site.plan, css: "a{}" } as never;
    const t = setup({ site: { plan: bad } });
    expect(await runAuto(t.deps)).toBe("invalid");
    expect(t.doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(t.sheets).toHaveLength(0);
    expect(t.applied).not.toHaveBeenCalled();
  });

  it("a stored plan that misses the contrast targets is still applied (colours are nudged)", async () => {
    const base = setup().site.plan;
    const t = setup({ site: { plan: { ...base, themeId: "custom", tokens: { ...base.tokens, text: "#d0d8dc" } } } });
    const done = runAuto(t.deps);
    await tick();
    t.fire();
    expect(await done).not.toBe("invalid");
    expect(t.sheets.length).toBeGreaterThan(0);
  });

  it("does nothing in ask mode, with no record, or on a blocked site", async () => {
    for (const t of [setup({ site: { mode: "ask" } }), setup({ site: null }), setup({ blocked: true })]) {
      await runAuto(t.deps);
      expect(t.sheets).toHaveLength(0);
      expect(t.doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    }
  });

  it("makes no network call", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const t = setup();
    const done = runAuto(t.deps);
    await tick();
    t.fire();
    await done;
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("auto path import graph", () => {
  const resolve = (from: string, spec: string): string | undefined => {
    const p = join(dirname(from), spec);
    return existsSync(p) ? p.split("\\").join("/") : undefined;
  };
  const graph = (entry: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(entry)) return seen;
    seen.add(entry);
    const text = readFileSync(entry, "utf8");
    for (const m of text.matchAll(/(?:from|import)\s+"(\.[^"]+)"/g)) {
      const r = resolve(entry, m[1]!);
      if (r) graph(r, seen);
    }
    return seen;
  };

  it("never reaches a provider, the prompt or the pipeline, and never mentions fetch", () => {
    const files = [...graph("src/extension/applier-auto.ts")];
    expect(files).toContain("src/extension/auto-core.ts");
    for (const f of files) {
      expect(f, f).not.toMatch(/src\/(providers|ai)\//);
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\bfetch\(/);
    }
    expect(files).not.toContain("src/extension/keys.ts");
    expect(files).not.toContain("src/extension/flow.ts");
  });
});

describe("badge message", () => {
  it("accepts only the exact badge message", () => {
    expect(isBadgeMessage(BADGE_MESSAGE)).toBe(true);
    expect(isBadgeMessage({ type: "skinly-badge-on", extra: 1 })).toBe(false);
    expect(isBadgeMessage("ping")).toBe(false);
    expect(isBadgeMessage(null)).toBe(false);
  });
});
