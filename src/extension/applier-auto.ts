import { checkUrl } from "../analyzer/eligibility.ts";
import type { PageApplier } from "./applier.ts";
import "./applier.ts";
import { sendMessage } from "./api.ts";
import { runAuto } from "./auto-core.ts";
import { BADGE_MESSAGE } from "./messages.ts";
import { loadSettings, petConfig } from "./settings.ts";
import { getSite, originOf } from "./sites.ts";

// Registered per origin by siteActions.ts; runs at document_start. Reads storage only, never calls a provider.
const applier = (globalThis as unknown as { skinlyApplier?: PageApplier }).skinlyApplier;
const origin = originOf(location.href);

if (applier && origin) {
  void runAuto({
    doc: document,
    origin,
    applier,
    readSite: getSite,
    isBlocked: async () => !checkUrl(location.href, (await loadSettings()).blocklist).allowed,
    whenReady: (cb) => {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => cb(), { once: true });
      else cb();
    },
    onApplied: () => {
      void sendMessage(BADGE_MESSAGE).catch(() => undefined);
      void loadSettings().then((s) => applier.syncPet(petConfig(s)));
    },
  });
}
