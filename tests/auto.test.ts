import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { analyze } from "../src/analyzer/analyze.ts";
import { createApplier, type StyleHandle, type StyleHost } from "../src/extension/applier-core.ts";
import { BANNER_TEXT, NAV_REAPPLY_MAX, runAuto, type AutoDeps } from "../src/extension/auto-core.ts";
import { isBadgeMessage, BADGE_MESSAGE } from "../src/extension/messages.ts";
import type { SiteRecord } from "../src/extension/sites.ts";
import { getTheme } from "../src/themes/index.ts";
import type { GuardProvider } from "../src/plan/guard.ts";
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
  it("puts the theme back after a same-document navigation, at most NAV_REAPPLY_MAX times, reading the record each time", async () => {
    const t = setup();
    let navigate: (() => void) | undefined;
    const unlisten = vi.fn(() => void (navigate = undefined));
    const reads = vi.fn(t.deps.readSite);
    const done = runAuto({ ...t.deps, readSite: reads, onNavigate: (cb) => ((navigate = cb), unlisten) });
    await tick();
    t.fire();
    expect(await done).toBe("full");
    // the route change replaced the page's markup and dropped our marker
    t.doc.documentElement.removeAttribute("data-skinly");
    navigate!();
    await tick();
    expect(t.doc.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(t.sheets).toHaveLength(1);
    expect(reads).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 70 && navigate; i++) navigate();
    await tick();
    expect(reads.mock.calls.length).toBeLessThanOrEqual(2 + NAV_REAPPLY_MAX);
    expect(unlisten).toHaveBeenCalled();
  });

  it("Restore removes the navigation listeners: a later route change never brings the theme back (A1f)", async () => {
    const t = setup();
    let navigate: (() => void) | undefined;
    const unlisten = vi.fn();
    const done = runAuto({ ...t.deps, onNavigate: (cb) => ((navigate = cb), unlisten) });
    await tick();
    t.fire();
    await done;
    t.applier.restore();
    expect(unlisten).toHaveBeenCalledTimes(1);
    navigate!();
    await tick();
    expect(t.doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(t.sheets).toHaveLength(0);
  });

  it("a route change after the site was paused elsewhere (popup Restore) does not re-apply, and stops listening", async () => {
    const t = setup();
    let navigate: (() => void) | undefined;
    const unlisten = vi.fn();
    let paused = false;
    const done = runAuto({ ...t.deps, readSite: async () => (paused ? { ...t.site, paused: true } : t.site), onNavigate: (cb) => ((navigate = cb), unlisten) });
    await tick();
    t.fire();
    await done;
    t.doc.documentElement.removeAttribute("data-skinly");
    paused = true;
    navigate!();
    await tick();
    expect(t.doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("a saved full-strategy plan is applied no further than safe before the page is ready", async () => {
    const t = setup();
    t.site.plan = { ...t.site.plan, strategy: "full" };
    void runAuto(t.deps);
    await tick();
    expect(t.sheets[0]).not.toContain('input[type="submit"]');
  });
});

describe("applier-auto with stored repair rules", () => {
  it("puts the stored repair rules in place at document_start, with no provider call", async () => {
    const css = 'html[data-skinly="on"]:not(#skinly-force) > body > header:nth-child(1) { color: #000000 !important; }\n';
    const t = setup({ site: { repairCss: css } });
    const done = runAuto(t.deps);
    await tick();
    expect(t.sheets).toHaveLength(2);
    expect(t.sheets[1]).toBe(css);
    t.fire();
    await done;
    expect(t.sheets.some((s) => s === css)).toBe(true);
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
    // pet, art and the diagnostics snapshot wait for the parsed DOM
    expect(t.applied).not.toHaveBeenCalled();
    t.fire();
    expect(await done).toBe("full");
    expect(t.applied).toHaveBeenCalledTimes(1);
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

  it("no page script (applier, auto, scene, palette) can reach the keys, the intent or the keeper (A3 pass 2)", () => {
    for (const entry of ["applier.ts", "applier-auto.ts", "scene.ts", "palette.ts"]) {
      const files = [...graph(`src/extension/${entry}`)];
      for (const f of ["src/extension/keys.ts", "src/extension/intent.ts", "src/extension/keeper.ts", "src/extension/popup/Popup.tsx"]) expect(files, `${entry} -> ${f}`).not.toContain(f);
      for (const f of files) expect(f, f).not.toMatch(/src\/(providers|ai)\//);
    }
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

describe("applier-auto at document_start (A1d)", () => {
  it("with no head and no body yet: colours go on at once through the adopted sheet; guards, repair and art wait for DOMContentLoaded; nothing rolls back", async () => {
    const doc = dom(BODY);
    const body = doc.body;
    doc.documentElement.replaceChildren();
    expect(doc.head).toBeNull();
    expect(doc.body).toBeNull();
    const { host, sheets } = fakeStyle();
    // The guard reads computed styles of the body; before DOMContentLoaded it must not be touched at all.
    let parsed = false;
    const early = vi.fn();
    const seen = <T>(v: T): T => {
      if (!parsed) early();
      return v;
    };
    const guard: GuardProvider = {
      style: () => seen({ color: "#ffffff", backgroundColor: "#000000", backgroundImage: "none", display: "block", visibility: "visible", opacity: "1", filter: "none" } as never),
      parentOf: (el) => seen(el.parentElement),
      textParents: () => seen([]),
      editables: () => seen([]),
      media: () => seen([]),
    };
    const applier = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard });
    const saved = analyze(dom(BODY), fakeDeps());
    if (saved.status !== "ok") throw new Error("fixture too large");
    const site: SiteRecord = { v: 1, plan: { v: 1, themeId: "midnight", tokens: { ...getTheme("midnight").tokens }, regionRules: [], reasons: [] }, fingerprint: { hash: "00000000", seq: "" }, provider: "builtin", model: "builtin", promptVersion: "6", savedAt: "2026-10-31T10:00:00.000Z", mode: "auto", blur: [], blurImages: false };
    let ready: (() => void) | undefined;
    const applied = vi.fn();
    const states: string[] = [];
    const done = runAuto({ doc, origin: "https://a.example", applier, readSite: async () => site, isBlocked: async () => false, whenReady: (cb) => void (ready = cb), onApplied: applied, report: (s) => void states.push(s) });
    await tick();
    expect(sheets).toHaveLength(1);
    expect(doc.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(applier.isActive()).toBe(true);
    expect(applied).not.toHaveBeenCalled();
    expect(early).not.toHaveBeenCalled();
    // the parser reaches the body, then DOMContentLoaded
    doc.documentElement.append(doc.createElement("head"), body);
    parsed = true;
    ready!();
    expect(await done).toBe("full");
    expect(applier.isActive()).toBe(true);
    expect(sheets.length).toBeGreaterThanOrEqual(1);
    expect(applied).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["applied"]);
    // a plan with no regions (kept inside the click, before the page was read) never shows the "page changed" banner
    expect(doc.querySelector("[data-skinly-ui]")).toBeNull();
  });

  it("reports one state word: no record, paused, blocked", async () => {
    const states: string[] = [];
    const base = setup();
    const run = (site: SiteRecord | undefined, blocked = false) => runAuto({ ...base.deps, readSite: async () => site, isBlocked: async () => blocked, report: (s) => void states.push(s) });
    expect(await run(undefined)).toBe("none");
    expect(await run({ ...base.site, paused: true })).toBe("paused");
    expect(await run(base.site, true)).toBe("blocked");
    expect(states).toEqual(["no-record", "paused", "blocked"]);
  });
});
