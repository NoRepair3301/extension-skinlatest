import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../src/extension/api.ts", () => ({
  storageGet: async (k: string) => store.get(k),
  storageSet: async (k: string, v: unknown) => void store.set(k, v),
}));

import { clearSites, getSite, loadSites, MAX_SITES, migrate, originOf, parseSite, parseSites, removeSite, saveSite, toOrigin, withSite, type SiteRecord } from "../src/extension/sites.ts";
import { planFor } from "./plan/helpers.ts";

const rec = (savedAt = "2026-10-30T10:00:00.000Z", over: Partial<SiteRecord> = {}): SiteRecord => ({
  v: 1,
  plan: planFor("ocean"),
  fingerprint: { hash: "0123abcd", seq: "hnmf" },
  provider: "gemini",
  model: "m-1",
  promptVersion: "1",
  savedAt,
  mode: "ask",
  blur: [],
  blurImages: false,
  ...over,
});

describe("origin keys", () => {
  it.each(["https://example.org", "http://localhost:3000", "https://a.b.example.org:8443"])("accepts %s", (o) => expect(toOrigin(o)).toBe(o));
  it.each([
    "https://example.org/",
    "https://example.org/path",
    "https://example.org/?q=1",
    "https://example.org#x",
    "https://user:pw@example.org",
    "ftp://example.org",
    "example.org",
    "https://EXAMPLE.org",
    "",
    42,
    null,
  ])("rejects %s", (o) => expect(toOrigin(o)).toBeUndefined());

  it("originOf reduces a full page URL to its origin and drops path, query and fragment", () => {
    expect(originOf("https://example.org/a/b?token=1#frag")).toBe("https://example.org");
    expect(originOf("chrome://extensions")).toBeUndefined();
    expect(originOf("not a url")).toBeUndefined();
  });

  it("saveSite refuses a full URL or a query and stores nothing", async () => {
    store.clear();
    expect(await saveSite("https://example.org/page?x=1", rec())).toBe(false);
    expect(store.size).toBe(0);
  });
});

describe("validation on read", () => {
  it("accepts a good record", () => expect(parseSite(rec())).toEqual(rec()));
  it.each<[string, unknown]>([
    ["not an object", "x"],
    ["null", null],
    ["wrong version", { ...rec(), v: 2 }],
    ["no plan", { ...rec(), plan: undefined }],
    ["plan with no tokens", { ...rec(), plan: { v: 1, themeId: "a", regionRules: [], reasons: [] } }],
    ["bad fingerprint hash", { ...rec(), fingerprint: { hash: "zz", seq: "h" } }],
    ["bad fingerprint seq", { ...rec(), fingerprint: { hash: "0123abcd", seq: "H<>" } }],
    ["bad model", { ...rec(), model: "has space" }],
    ["bad date", { ...rec(), savedAt: "yesterday" }],
    ["bad mode", { ...rec(), mode: "always" }],
    ["too many blur selectors", { ...rec(), blur: Array.from({ length: 51 }, () => "p") }],
    ["blur not strings", { ...rec(), blur: [1] }],
  ])("ignores a corrupt record: %s", (_n, raw) => expect(parseSite(raw)).toBeUndefined());

  it("parseSites drops corrupt records and non-origin keys but keeps the good ones", () => {
    const sites = parseSites({
      "https://good.example": rec(),
      "https://bad.example": { nope: true },
      "https://path.example/a": rec(),
      "https://q.example?x=1": rec(),
    });
    expect(Object.keys(sites)).toEqual(["https://good.example"]);
  });

  it("parseSites tolerates garbage", () => {
    for (const g of [undefined, null, 5, "x", []]) expect(parseSites(g)).toEqual({});
  });

  it("migration stub passes v1 and rejects unknown versions", () => {
    expect(migrate(rec())).toBeDefined();
    expect(migrate({ ...rec(), v: 0 })).toBeUndefined();
    expect(migrate("x")).toBeUndefined();
  });
});

describe("cap and eviction", () => {
  it("evicts the oldest records first once above the cap", () => {
    let sites = {};
    for (let i = 0; i < MAX_SITES; i++) sites = withSite(sites, `https://s${i}.example`, rec(new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()));
    expect(Object.keys(sites)).toHaveLength(MAX_SITES);
    const next = withSite(sites, "https://new.example", rec("2026-10-30T00:00:00.000Z"));
    expect(Object.keys(next)).toHaveLength(MAX_SITES);
    expect(next["https://s0.example"]).toBeUndefined();
    expect(next["https://s1.example"]).toBeDefined();
    expect(next["https://new.example"]).toBeDefined();
  });

  it("never evicts the record just written, even if it carries the oldest date", () => {
    const sites = withSite({ "https://a.example": rec("2026-05-01T00:00:00.000Z") }, "https://b.example", rec("2020-01-01T00:00:00.000Z"), 1);
    expect(Object.keys(sites)).toEqual(["https://b.example"]);
  });

  it("replacing an existing origin does not grow the set", () => {
    const sites = withSite(withSite({}, "https://a.example", rec()), "https://a.example", rec(undefined, { mode: "auto" }), 1);
    expect(Object.keys(sites)).toHaveLength(1);
    expect(sites["https://a.example"]!.mode).toBe("auto");
  });
});

describe("storage round trip", () => {
  beforeEach(() => store.clear());
  it("saves, reads, removes and clears", async () => {
    expect(await saveSite("https://a.example", rec())).toBe(true);
    expect(await getSite("https://a.example")).toEqual(rec());
    expect(await getSite("https://a.example/x")).toBeUndefined();
    await saveSite("https://b.example", rec());
    await removeSite("https://a.example");
    expect(Object.keys(await loadSites())).toEqual(["https://b.example"]);
    await clearSites();
    expect(await loadSites()).toEqual({});
  });

  it("stores only the plan and metadata: no page text, titles or URLs", async () => {
    await saveSite("https://a.example", rec());
    const text = JSON.stringify([...store.values()]);
    expect(text).not.toMatch(/https?:\/\/[^"]*\//);
  });
});
