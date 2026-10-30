import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  storageGet: vi.fn(async (k: string) => store.get(k)),
  storageSet: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
}));
vi.mock("../src/extension/api.ts", () => api);

import { DIAG_MAX, recordError, resetDiag, takeErrors } from "../src/core/diag.ts";
import { DIAG_KEY, diagReport, joinPageDiag, parseDiag, parsePageDiag, PROVIDER_RESULTS, whyNoArt, type PageDiag } from "../src/core/diagReport.ts";
import { loadDiag, providerResultOf, recordErrors, recordProviderResult, savePageDiag } from "../src/extension/diagStore.ts";

/** Strings that must never reach the diagnostics: page text, URLs, origins, titles, key-like strings (built from parts so the key scanner stays quiet), field values. */
const MARKERS = ["SECRET-PAGE-TEXT", "https://bank.example/account?id=42", "bank.example", "My Account Title", ["gsk", "abcdefghijklmnopqrstuvwxyz0123"].join("_"), "hunter2", "user@mail.example"];

const page = (over: Partial<PageDiag> = {}): PageDiag => ({
  theme: "midnight",
  strategy: "safe",
  art: "ok",
  host: true,
  left: 240,
  right: 300,
  actors: 7,
  pet: true,
  sheets: "yes",
  mount: "html",
  htmlEffect: "none",
  reattached: 1,
  auto: "applied",
  ...over,
});

beforeEach(() => {
  store.clear();
  resetDiag();
});

describe("A2: auto state words", () => {
  it("every state word has one plain line with a next step in strings.ts; an unknown word reads as not-run", async () => {
    const { AUTO_STATES } = await import("../src/core/diag.ts");
    const { S } = await import("../src/ui/strings.ts");
    for (const s of AUTO_STATES) {
      const line = S.popup.why[s];
      expect(line, s).toMatch(/\.$/);
      expect(line.length, s).toBeLessThan(140);
    }
    expect(parsePageDiag({ ...page(), auto: "https://bank.example" })!.auto).toBe("not-run");
    expect(diagReport("0.2.1", { v: 1, errors: [], page: page({ auto: "paused" }) }, {})).toContain("auto: paused");
  });
});

describe("diagnostics content (stage 2)", () => {
  it("names the version, theme, strategy, art state, host, gutter widths, actor count, the b and c flags, errors and provider result", () => {
    const text = diagReport("0.2.0", { v: 1, errors: ["scene-render", "auto-art"], page: page({ mount: "body", htmlEffect: "transform" }), provider: "timeout" }, { online: false });
    for (const line of [
      "version: 0.2.0",
      "theme: midnight",
      "strategy: safe",
      "art: ok",
      "host present: yes",
      "gutters: left 240 px, right 300 px",
      "actors: 7",
      "pet: on",
      "adopted stylesheets: yes",
      "mount: body (html effect: transform)",
      "re-attached: 1",
      "last provider result: timeout",
      "online: no",
      "errors (last 20, oldest first): scene-render, auto-art",
    ])
      expect(text).toContain(line);
    expect(text.split("\n")[2]).toBe(`why no art: ${whyNoArt(page({ mount: "body", htmlEffect: "transform" }))}`);
  });

  it("an empty record still gives every line, with neutral values", () => {
    const text = diagReport("0.2.0", parseDiag(undefined));
    expect(text).toContain("theme: none");
    expect(text).toContain("art: not-loaded");
    expect(text).toContain("last provider result: none");
    expect(text).toContain("errors (last 20, oldest first): none");
  });

  it("whyNoArt has one plain line for every art state", () => {
    expect(whyNoArt(page({ art: "corner" }))).toMatch(/corner strip/);
    expect(whyNoArt(page({ art: "narrow" }))).toMatch(/almost no empty side space/);
    expect(whyNoArt(page({ art: "none" }))).toMatch(/full width/);
    expect(whyNoArt(page({ art: "not-loaded" }))).toMatch(/not loaded/);
    expect(whyNoArt(page({ art: "not-loaded", theme: "none" }))).toMatch(/No theme/);
    expect(whyNoArt(page({ art: "off" }))).toMatch(/off/);
    expect(whyNoArt(page({ host: false }))).toMatch(/removed it/);
    expect(whyNoArt(page({ actors: 0 }))).toMatch(/no room/);
    expect(whyNoArt(page({ sheets: "no" }))).toMatch(/could not style/);
    expect(whyNoArt(page())).toMatch(/showing in the empty side space/);
    expect(whyNoArt(undefined)).toMatch(/No page was checked/);
  });

  it("joinPageDiag: without scene.js the art is not loaded; reattach counts add up", () => {
    expect(joinPageDiag({ theme: "ocean", strategy: "full", pet: false, flags: { reattached: 0 } }, undefined)).toMatchObject({ theme: "ocean", art: "not-loaded", host: false, actors: 0 });
    const j = joinPageDiag({ theme: "custom", strategy: "safe", pet: true, flags: { reattached: 2, sheets: true } }, { art: "corner", host: true, left: 0, right: 0, actors: 2, flags: { reattached: 3, mount: "body", htmlEffect: "contain" } });
    expect(j).toMatchObject({ theme: "custom", art: "corner", actors: 2, reattached: 5, mount: "body", htmlEffect: "contain", sheets: "yes" });
  });
});

describe("diagnostics never hold page data (stage 2)", () => {
  it("every string field is a fixed word: planted text, URLs, origins, titles, keys and values are dropped", () => {
    const raw = {
      v: 1,
      errors: ["scene-render", ...MARKERS],
      provider: MARKERS[1],
      origin: MARKERS[2],
      url: MARKERS[1],
      page: { theme: MARKERS[0], strategy: MARKERS[3], art: MARKERS[2], host: MARKERS[5], left: MARKERS[6], right: 99999999, actors: -4, pet: "yes", sheets: MARKERS[4], mount: MARKERS[1], htmlEffect: MARKERS[0], reattached: 2.6, title: MARKERS[3] },
    };
    const rec = parseDiag(raw);
    const text = diagReport(MARKERS[1]!, rec, { online: true });
    const all = JSON.stringify(rec) + text;
    for (const m of MARKERS) expect(all, m).not.toContain(m);
    expect(rec.errors).toEqual(["scene-render"]);
    expect(rec.page).toMatchObject({ theme: "none", strategy: "none", art: "not-loaded", host: false, left: 0, right: 100000, actors: 0, pet: false, reattached: 3 });
    expect(Object.keys(rec).sort()).toEqual(["errors", "page", "v"]);
    expect(text).toContain("version: unknown");
  });

  it("what is stored under `diag` goes through the same parser", async () => {
    await savePageDiag({ ...page(), theme: MARKERS[0] } as unknown as PageDiag, ["auto-run", MARKERS[1] as never]);
    await recordProviderResult(MARKERS[2] as never);
    const stored = JSON.stringify(store.get(DIAG_KEY));
    for (const m of MARKERS) expect(stored, m).not.toContain(m);
    const rec = await loadDiag();
    expect(rec.page!.theme).toBe("none");
    expect(rec.errors).toEqual(["auto-run"]);
    expect(rec.provider).toBeUndefined();
  });
});

describe("diagnostics store (stage 2)", () => {
  it("keeps the last 20 errors, oldest first, the last page and the last provider result", async () => {
    for (let i = 0; i < 25; i++) await recordErrors([i % 2 ? "scene-render" : "pet-mount"]);
    await savePageDiag(page({ art: "corner" }), ["auto-art"]);
    await recordProviderResult("ok");
    const rec = await loadDiag();
    expect(rec.errors).toHaveLength(DIAG_MAX);
    expect(rec.errors[DIAG_MAX - 1]).toBe("auto-art");
    expect(rec.page!.art).toBe("corner");
    expect(rec.provider).toBe("ok");
  });

  it("parallel writes from one context are queued, none is lost", async () => {
    await Promise.all([recordErrors(["scene-mount"]), recordErrors(["pet-mount"]), recordProviderResult("rate"), savePageDiag(page())]);
    const rec = await loadDiag();
    expect([...rec.errors].sort()).toEqual(["pet-mount", "scene-mount"]);
    expect(rec.provider).toBe("rate");
    expect(rec.page).toBeDefined();
  });

  it("a storage failure never throws", async () => {
    api.storageSet.mockRejectedValueOnce(new Error("quota"));
    await expect(recordErrors(["other"])).resolves.toBeUndefined();
    api.storageGet.mockRejectedValueOnce(new Error("gone"));
    await expect(loadDiag()).resolves.toEqual({ v: 1, errors: [] });
  });

  it("takeErrors hands each caught error over once", () => {
    recordError("scene-render");
    recordError("auto-pet");
    expect(takeErrors()).toEqual(["scene-render", "auto-pet"]);
    expect(takeErrors()).toEqual([]);
    recordError("scene-measure");
    expect(takeErrors()).toEqual(["scene-measure"]);
  });

  it("providerResultOf maps every outcome to a fixed word, never a message or model name", () => {
    expect(providerResultOf({ kind: "preview", source: "ai" })).toBe("ok");
    expect(providerResultOf({ kind: "preview", source: "fallback" })).toBe("fallback");
    expect(providerResultOf({ kind: "baseline", why: "no-key" })).toBe("no-key");
    expect(providerResultOf({ kind: "baseline", why: "Applied. " + MARKERS[0] })).toBe("baseline");
    expect(providerResultOf({ kind: "error", errorKind: "timeout" })).toBe("timeout");
    expect(providerResultOf({ kind: "blocked" })).toBe("blocked");
    expect(providerResultOf({ kind: "cancelled" })).toBe("cancelled");
    for (const k of ["auth", "rate", "quota", "network", "timeout", "blocked", "bad-output", "server", "aborted"]) expect(PROVIDER_RESULTS).toContain(k);
  });

  it("parsePageDiag refuses non-objects", () => {
    expect(parsePageDiag("x")).toBeUndefined();
    expect(parsePageDiag(null)).toBeUndefined();
    expect(parsePageDiag([1])).toBeUndefined();
  });
});
