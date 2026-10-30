import { transform, type CallClock, type ConsentRequest, type Outcome, type PageClient, type Step } from "../ai/pipeline.ts";
import { createProviders } from "../providers/index.ts";
import type { ApplyResult, PageAnalysis } from "./applier-core.ts";
import { runInPage } from "./api.ts";
import { ensureApplier } from "./inject.ts";
import { getKey, keyStatus } from "./keys.ts";
import { loadSettings, saveSettings } from "./settings.ts";

/** Page side of the flow: injects the applier on first use, then calls it through scripting. */
export function createPageClient(tabId: number): PageClient {
  let injected = false;
  const ready = async (): Promise<void> => {
    if (injected) return;
    await ensureApplier(tabId, true);
    injected = true;
  };
  return {
    analyze: async () => {
      await ready();
      const a = await runInPage<PageAnalysis>(tabId, "analyze");
      return a ?? { status: "too-large", risk: [] };
    },
    applyTheme: async (id) => {
      await ready();
      return runInPage<ApplyResult>(tabId, "applyTheme", id, true);
    },
    applyPlan: async (plan) => {
      await ready();
      return runInPage<ApplyResult>(tabId, "apply", plan, true);
    },
    restore: async () => {
      await runInPage(tabId, "restore", undefined, true);
    },
  };
}

/** Lives as long as the popup; the daily counter in settings is the durable guard. */
export const callClock: CallClock = { lastAt: 0 };

export interface FlowHooks {
  askConsent(req: ConsentRequest): Promise<boolean>;
  onStep(step: Step, detail?: string): void;
}

export function runTransform(tabId: number, url: string, hooks: FlowHooks, signal?: AbortSignal): Promise<Outcome> {
  return transform(
    url,
    {
      page: createPageClient(tabId),
      providers: createProviders(getKey),
      loadSettings,
      saveSettings,
      keyStatus,
      askConsent: hooks.askConsent,
      clock: callClock,
      prefersDark: () => globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches === true,
      onStep: hooks.onStep,
    },
    signal,
  );
}
