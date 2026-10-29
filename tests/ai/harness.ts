import { vi } from "vitest";
import type { PageClient, PipelineDeps } from "../../src/ai/pipeline.ts";
import type { ProviderId } from "../../src/config.ts";
import type { RiskMarker } from "../../src/core/types.ts";
import type { PageAnalysis } from "../../src/extension/applier-core.ts";
import { defaultSettings, type Settings } from "../../src/extension/settings.ts";
import { createMock, type MockOutcome, type MockProvider } from "../../src/providers/mock.ts";
import { getTheme } from "../../src/themes/index.ts";
import { sampleSummary } from "../plan/helpers.ts";

export const URL_OK = "https://example.org/page";
export const T0 = Date.parse("2026-10-30T12:00:00Z");

export const goodPlan = () => ({
  v: 1,
  themeId: "ocean",
  tokens: { ...getTheme("ocean").tokens },
  regionRules: [{ region: "r1", layout: "nav-wrap", surface: "flat", spacing: 1 }],
  reasons: ["clear-nav"],
});
export const lowContrastPlan = () => ({ ...goodPlan(), themeId: "custom", tokens: { ...getTheme("ocean").tokens, text: "#d0d8dc" } });
export const badPlan = () => ({ ...goodPlan(), css: "a{}" });

export const fakePage = (analysis: PageAnalysis | (() => PageAnalysis)) => {
  const calls: string[] = [];
  const page: PageClient = {
    analyze: async () => {
      calls.push("analyze");
      return typeof analysis === "function" ? analysis() : analysis;
    },
    applyTheme: async (id) => {
      calls.push(`applyTheme:${id}`);
      return { ok: true, themeId: id, regions: 0 };
    },
    applyPlan: async (plan) => {
      calls.push(`applyPlan:${plan.themeId}`);
      return { ok: true, themeId: plan.themeId, regions: plan.regionRules.length };
    },
    restore: async () => {
      calls.push("restore");
    },
  };
  return { page, calls };
};

export const okAnalysis = (risk: RiskMarker[] = []): PageAnalysis => ({ status: "ok", risk, summary: sampleSummary(risk), fingerprint: { hash: "00000000", seq: "nmlc" } });

export interface Harness {
  deps: PipelineDeps;
  page: ReturnType<typeof fakePage>;
  mocks: Record<ProviderId, MockProvider>;
  saved: Settings[];
  askConsent: ReturnType<typeof vi.fn>;
  steps: string[];
  setNow(ms: number): void;
}

export function harness(opts: {
  gemini?: MockOutcome[];
  groq?: MockOutcome[];
  settings?: Partial<Settings>;
  keys?: Partial<Record<ProviderId, boolean>>;
  analysis?: PageAnalysis;
  consent?: boolean;
  lastAt?: number;
} = {}): Harness {
  let now = T0;
  const mocks = {
    gemini: createMock(opts.gemini ?? [{ type: "ok", json: goodPlan() }], "gemini"),
    groq: createMock(opts.groq ?? [{ type: "ok", json: goodPlan() }], "groq"),
  };
  const settings: Settings = { ...defaultSettings(), consent: { version: 1, acceptedAt: "2026-10-01T00:00:00.000Z" }, ...opts.settings };
  const saved: Settings[] = [];
  const steps: string[] = [];
  const page = fakePage(opts.analysis ?? okAnalysis());
  const askConsent = vi.fn(async () => opts.consent ?? true);
  const keys = { gemini: true, groq: true, ...opts.keys };
  const deps: PipelineDeps = {
    page: page.page,
    providers: mocks,
    loadSettings: async () => saved.at(-1) ?? settings,
    saveSettings: async (s) => {
      saved.push(s);
    },
    keyStatus: async () => keys,
    askConsent,
    clock: { lastAt: opts.lastAt ?? 0 },
    onStep: (s, d) => steps.push(d ? `${s}:${d}` : s),
    now: () => now,
    today: () => "2026-10-30",
  };
  return { deps, page, mocks, saved, askConsent, steps, setNow: (ms) => (now = ms) };
}
