import { afterEach, describe, expect, it, vi } from "vitest";
import { contrastFailures } from "../../src/plan/contrast.ts";
import { transform } from "../../src/ai/pipeline.ts";
import { aiApplyFailureMessage, applyFailureMessage, MSG } from "../../src/ai/messages.ts";
import { buildUserMessage } from "../../src/ai/prompt.ts";
import { defaultSettings, type Settings } from "../../src/extension/settings.ts";
import { sampleSummary } from "../plan/helpers.ts";
import { badPlan, goodPlan, harness, lowContrastPlan, okAnalysis, T0, unfixablePlan, URL_OK } from "./harness.ts";

const providerCalls = (h: ReturnType<typeof harness>) => h.mocks.gemini.calls.length + h.mocks.groq.calls.length;

describe("transform: happy path", () => {
  it("applies the baseline first, then the validated AI plan as a preview", async () => {
    const h = harness();
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "preview", source: "ai", providerId: "gemini", baselineThemeId: "calm-light" });
    expect(h.page.calls).toEqual(["applyTheme:calm-light", "analyze", "applyPlan:ocean"]);
    expect(h.steps).toEqual(["checking", "baseline", "analysing", "asking:Gemini", "applying"]);
    expect(h.mocks.gemini.calls).toHaveLength(1);
    expect(h.mocks.gemini.calls[0]!.user).toBe(buildUserMessage(sampleSummary()));
  });

  it("uses the configured baseline theme and model", async () => {
    const h = harness({ settings: { theme: "midnight", models: { gemini: "my-model", groq: "g" } } });
    await transform(URL_OK, h.deps);
    expect(h.page.calls[0]).toBe("applyTheme:midnight");
    expect(h.mocks.gemini.calls[0]!.model).toBe("my-model");
  });

  it("counts the call and remembers the time", async () => {
    const h = harness();
    await transform(URL_OK, h.deps);
    expect(h.saved.at(-1)!.aiCallsToday).toEqual({ date: "2026-10-30", count: 1 });
    expect(h.deps.clock.lastAt).toBe(T0);
  });
});

describe("transform: invalid output", () => {
  it("repairs once with reason codes, then shows the repaired plan", async () => {
    const h = harness({ gemini: [{ type: "ok", json: badPlan() }, { type: "ok", json: goodPlan() }] });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "preview", source: "ai" });
    expect(h.mocks.gemini.calls).toHaveLength(2);
    expect(h.mocks.gemini.calls[1]!.user).toContain("Reason codes: plan.css");
    expect(h.mocks.gemini.calls[1]!.user).not.toContain("a{}");
  });

  it("falls back to the nearest built-in theme when output stays invalid", async () => {
    const h = harness({ gemini: [{ type: "ok", json: badPlan() }], groq: [{ type: "ok", json: badPlan() }] });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "preview", source: "fallback", message: MSG.fallbackTheme });
    expect(h.page.calls.at(-1)).toMatch(/^applyTheme:/);
    expect(h.page.calls.some((c) => c.startsWith("applyPlan"))).toBe(false);
  });

  it("repairs low-contrast colours by nudging them instead of falling back", async () => {
    const h = harness({ gemini: [{ type: "ok", json: lowContrastPlan() }] });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "preview", source: "ai", message: MSG.coloursAdjusted });
    expect(h.mocks.gemini.calls).toHaveLength(1); // no repair request was needed
    expect(h.page.calls.at(-1)).toBe("applyPlan:custom");
    if (out.kind !== "preview") return;
    expect(contrastFailures(out.plan.themeId, out.plan.tokens)).toEqual([]);
    expect(out.plan.tokens.text).not.toBe(lowContrastPlan().tokens.text);
    expect(out.plan.tokens.bg).toBe(lowContrastPlan().tokens.bg); // backgrounds are never changed
  });

  it("never refuses a plan for contrast: it goes on and the page-side readability pass repairs the text", async () => {
    const h = harness({ gemini: [{ type: "ok", json: unfixablePlan() }], groq: [{ type: "ok", json: unfixablePlan() }] });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "preview", source: "ai" });
    expect(h.mocks.gemini.calls).toHaveLength(1);
    expect(h.page.calls.at(-1)).toBe("applyPlan:high-contrast");
  });

  it("keeps the baseline when the validated plan cannot be applied", async () => {
    const h = harness();
    h.page.page.applyPlan = async () => ({ ok: false, reason: "invariants" });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "baseline", why: "apply-failed", message: aiApplyFailureMessage({ reason: "invariants" }) });
    if (out.kind === "baseline") expect(out.message).toContain("links or form controls");
    expect(h.page.calls.at(-1)).toBe("applyTheme:calm-light");
  });
});

describe("transform: per-provider time limits", () => {
  afterEach(() => vi.useRealTimers());

  it("gives Groq 20 s in total, then moves on to Gemini (30 s of its own)", async () => {
    vi.useFakeTimers();
    const h = harness({ settings: { order: ["groq", "gemini"] }, groq: [{ type: "delay", ms: 60_000, then: { type: "ok", json: goodPlan() } }] });
    const p = transform(URL_OK, h.deps);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(h.mocks.gemini.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await p).toMatchObject({ kind: "preview", source: "ai", providerId: "gemini" });
  });

  it("a Gemini answer slower than 30 s is given up on", async () => {
    vi.useFakeTimers();
    const h = harness({ settings: { order: ["gemini"] }, gemini: [{ type: "delay", ms: 60_000, then: { type: "ok", json: goodPlan() } }] });
    const p = transform(URL_OK, h.deps);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(h.mocks.gemini.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await p).toMatchObject({ kind: "baseline", why: "ai-unavailable" });
  });
});

describe("transform: why an apply was rolled back (J)", () => {
  const reasons: Array<[Record<string, unknown>, string]> = [
    [{ ok: false, reason: "invariants", detail: ["a[href] changed", "SECRET-PAGE-TEXT"] }, "links or form controls"],
    [{ ok: false, reason: "invalid-plan", detail: ["contrast"] }, "colours were too hard to read"],
    [{ ok: false, reason: "invalid-plan", detail: ["region missing on page"] }, "page changed while it was being read"],
    [{ ok: false, reason: "invalid-plan", detail: ["tokens.bg: SECRET-PAGE-TEXT"] }, "wasn't safe to apply"],
    [{ ok: false, reason: "too-large" }, "too large"],
    [{ ok: false, reason: "error" }, "Something went wrong"],
  ];

  it.each(reasons)("the baseline theme failing with %j says why in plain words", async (result, words) => {
    const h = harness();
    h.page.page.applyTheme = async () => result as never;
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "error", errorKind: "baseline" });
    if (out.kind !== "error") return;
    expect(out.message).toContain(words);
    expect(out.message).toContain("page was left as it was");
    expect(out.message).not.toContain("SECRET");
    expect(out.message).not.toContain("a[href]");
  });

  it("the page script not answering at all is reported as the browser not allowing it", async () => {
    const h = harness();
    h.page.page.applyTheme = async () => undefined;
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "error", errorKind: "baseline", message: applyFailureMessage(undefined) });
    expect(out.kind === "error" && out.message).toContain("the browser didn't allow it");
  });

  it("an AI plan that is rolled back keeps the built-in theme and says why", async () => {
    const h = harness();
    h.page.page.applyPlan = async () => ({ ok: false, reason: "invalid-plan", detail: ["contrast"] });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "baseline", why: "apply-failed" });
    expect(out.kind === "baseline" && out.message).toContain("colours were too hard to read");
    expect(out.kind === "baseline" && out.message).toContain("built-in theme is kept");
  });
});

describe("transform: provider errors", () => {
  it("moves to the next provider on rate and says so", async () => {
    const h = harness({ gemini: [{ type: "rate" }] });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "preview", source: "ai", providerId: "groq" });
    expect(h.steps).toContain("asking:Gemini is busy; trying Groq");
  });

  it("reports an auth error and keeps the baseline", async () => {
    const h = harness({ gemini: [{ type: "auth" }] });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "error", errorKind: "auth", themeId: "calm-light" });
    expect(out.kind === "error" && out.message).toContain("Gemini rejected the key");
    expect(h.mocks.groq.calls).toHaveLength(0);
  });

  it("keeps the built-in theme when every provider fails", async () => {
    const h = harness({ gemini: [{ type: "timeout" }], groq: [{ type: "server" }] });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "baseline", themeId: "calm-light", why: "ai-unavailable", message: MSG.allFailed });
    expect(h.page.calls).toEqual(["applyTheme:calm-light", "analyze"]);
  });

  it("only tries providers that have a key", async () => {
    const h = harness({ keys: { gemini: false } });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "preview", providerId: "groq" });
    expect(h.mocks.gemini.calls).toHaveLength(0);
  });

  it("defaults to Groq first, then Gemini", async () => {
    const h = harness({ settings: { order: defaultSettings().order } });
    expect(defaultSettings().order).toEqual(["groq", "gemini"]);
    expect(await transform(URL_OK, h.deps)).toMatchObject({ providerId: "groq" });
  });

  it("follows the configured provider order", async () => {
    const h = harness({ settings: { order: ["groq", "gemini"] } });
    expect(await transform(URL_OK, h.deps)).toMatchObject({ providerId: "groq" });
  });

  it("is cancelled by an abort signal", async () => {
    const h = harness({ gemini: [{ type: "delay", ms: 60_000, then: { type: "ok", json: goodPlan() } }] });
    const ctl = new AbortController();
    const p = transform(URL_OK, h.deps, ctl.signal);
    await new Promise((r) => setTimeout(r, 20));
    ctl.abort();
    expect(await p).toEqual({ kind: "cancelled", themeId: "calm-light" });
  });

  it("times out on the pipeline budget", async () => {
    const h = harness({ gemini: [{ type: "delay", ms: 60_000, then: { type: "ok", json: goodPlan() } }] });
    h.deps.budgetMs = 1000; // the real minimum slice is 1 s
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "baseline", why: "ai-unavailable" });
  }, 10_000);
});

describe("transform: gate", () => {
  it.each(["chrome://settings", "https://chromewebstore.google.com/x", "file:///a.html", "https://example.org/a.pdf"])("blocks %s without touching the page or any provider", async (url) => {
    const h = harness();
    const out = await transform(url, h.deps);
    expect(out).toMatchObject({ kind: "blocked", message: MSG.blocked });
    expect(h.page.calls).toEqual([]);
    expect(providerCalls(h)).toBe(0);
  });

  it("blocks a user-blocklisted site", async () => {
    const h = harness({ settings: { blocklist: ["example.org"] } });
    expect(await transform(URL_OK, h.deps)).toMatchObject({ kind: "blocked" });
    expect(providerCalls(h)).toBe(0);
  });

  it.each([["password"], ["payment"], ["file"]] as const)("uses only the built-in theme on a %s page", async (risk) => {
    const h = harness({ analysis: okAnalysis([risk]) });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "baseline", themeId: "calm-light", why: "no-ai-page", message: MSG.noAi });
    expect(providerCalls(h)).toBe(0);
    expect(h.askConsent).not.toHaveBeenCalled();
  });

  it("uses only the built-in theme on a too-large page", async () => {
    const h = harness({ analysis: { status: "too-large", risk: [] } });
    expect(await transform(URL_OK, h.deps)).toMatchObject({ kind: "baseline", why: "too-large" });
    expect(providerCalls(h)).toBe(0);
  });

  it("applies the baseline but makes no AI call without a key", async () => {
    const h = harness({ keys: { gemini: false, groq: false } });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "baseline", themeId: "calm-light", why: "no-key", message: MSG.noKey });
    expect(h.page.calls[0]).toBe("applyTheme:calm-light");
    expect(providerCalls(h)).toBe(0);
  });

  it("reports an error when even the baseline cannot be applied", async () => {
    const h = harness();
    h.page.page.applyTheme = async () => undefined;
    expect(await transform(URL_OK, h.deps)).toMatchObject({ kind: "error", errorKind: "baseline" });
    expect(providerCalls(h)).toBe(0);
  });
});

describe("transform: consent", () => {
  it("asks before any provider call, showing the exact payload and provider names", async () => {
    const h = harness({ settings: { consent: null } });
    let callsAtAsk = -1;
    h.askConsent.mockImplementation(async () => {
      callsAtAsk = providerCalls(h);
      return true;
    });
    const out = await transform(URL_OK, h.deps);
    expect(callsAtAsk).toBe(0);
    expect(h.askConsent).toHaveBeenCalledWith({ providerNames: ["Gemini", "Groq"], payload: buildUserMessage(sampleSummary()) });
    expect(out.kind).toBe("preview");
    expect(h.saved.at(-1)!.consent).toMatchObject({ version: 1 });
  });

  it("makes no provider call when consent is declined, and stores nothing", async () => {
    const h = harness({ settings: { consent: null }, consent: false });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "baseline", why: "consent-declined", message: MSG.declined });
    expect(providerCalls(h)).toBe(0);
    expect(h.saved).toEqual([]);
  });

  it("does not ask again once accepted, but asks again when the version is old", async () => {
    const h = harness();
    await transform(URL_OK, h.deps);
    expect(h.askConsent).not.toHaveBeenCalled();
    const old = harness({ settings: { consent: { version: 0, acceptedAt: "2020-01-01T00:00:00.000Z" } } });
    await transform(URL_OK, old.deps);
    expect(old.askConsent).toHaveBeenCalledTimes(1);
  });
});

describe("transform: guards", () => {
  it("stops at the daily limit of 20 and says so", async () => {
    const h = harness({ settings: { aiCallsToday: { date: "2026-10-30", count: 20 } } });
    expect(await transform(URL_OK, h.deps)).toMatchObject({ kind: "baseline", why: "limit-daily", message: MSG.dailyLimit });
    expect(providerCalls(h)).toBe(0);
  });

  it("allows the 20th call and resets on a new date", async () => {
    const h = harness({ settings: { aiCallsToday: { date: "2026-10-30", count: 19 } } });
    expect((await transform(URL_OK, h.deps)).kind).toBe("preview");
    expect(h.saved.at(-1)!.aiCallsToday.count).toBe(20);
    const next = harness({ settings: { aiCallsToday: { date: "2026-10-29", count: 20 } } });
    expect((await transform(URL_OK, next.deps)).kind).toBe("preview");
    expect(next.saved.at(-1)!.aiCallsToday).toEqual({ date: "2026-10-30", count: 1 });
  });

  it("needs 3 s between AI calls", async () => {
    const h = harness({ lastAt: T0 - 2999 });
    expect(await transform(URL_OK, h.deps)).toMatchObject({ kind: "baseline", why: "limit-gap", message: MSG.gap });
    expect(providerCalls(h)).toBe(0);
    const ok = harness({ lastAt: T0 - 3000 });
    expect((await transform(URL_OK, ok.deps)).kind).toBe("preview");
  });

  it("blocks an immediate second call", async () => {
    const h = harness();
    await transform(URL_OK, h.deps);
    h.setNow(T0 + 1000);
    expect(await transform(URL_OK, h.deps)).toMatchObject({ why: "limit-gap" });
    h.setNow(T0 + 3000);
    expect((await transform(URL_OK, h.deps)).kind).toBe("preview");
  });
});

describe("transform: rate limits", () => {
  it("says how long to wait when every provider is limited for more than 5 s", async () => {
    const h = harness({ gemini: [{ type: "rate", retryAfterMs: 31_200 }], groq: [{ type: "rate", retryAfterMs: 42_000 }] });
    const out = await transform(URL_OK, h.deps);
    expect(out).toMatchObject({ kind: "baseline", why: "ai-unavailable", message: "Rate limit, try again in 32 seconds" });
  });
});

describe("transform: all six themes are free (F3)", () => {
  it("a saved ocean baseline and an ocean answer are applied as they are; the AI is offered every built-in theme in the app's order", async () => {
    const h = harness({ settings: { theme: "ocean" } });
    const out = await transform(URL_OK, h.deps);
    expect(h.page.calls).toEqual(["applyTheme:ocean", "analyze", "applyPlan:ocean"]);
    const call = h.mocks.gemini.calls[0]! as { system: string; schema?: { properties: { themeId: { enum: string[] } } } };
    for (const id of ["calm-light", "midnight", "ocean", "warm-paper", "high-contrast", "field"]) expect(call.system).toContain(`"${id}"`);
    expect(call.schema!.properties.themeId.enum).toEqual(["calm-light", "midnight", "ocean", "warm-paper", "high-contrast", "field", "custom"]);
    expect(out).toMatchObject({ kind: "preview", plan: { themeId: "ocean" }, baselineThemeId: "ocean" });
  });
  it("a saved field baseline is applied as field", async () => {
    const h = harness({ settings: { theme: "field" } });
    await transform(URL_OK, h.deps);
    expect(h.page.calls[0]).toBe("applyTheme:field");
  });
  it.each(["calm-light", "midnight", "ocean", "warm-paper", "high-contrast", "field"])("T6: the built-in theme %s is applicable: the saved baseline is applied as itself, never replaced", async (id) => {
    const h = harness({ settings: { theme: id as Settings["theme"] } });
    const out = await transform(URL_OK, h.deps);
    expect(h.page.calls[0]).toBe(`applyTheme:${id}`);
    expect(out).toMatchObject({ baselineThemeId: id });
  });
});
