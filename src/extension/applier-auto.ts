import { checkUrl } from "../analyzer/eligibility.ts";
import type { PageApplier } from "./applier.ts";
import type { PetConfig } from "../features/pet/pet.ts";
import type { SiteRecord } from "./sites.ts";
import { sendMessage } from "./api.ts";
import { runAuto } from "./auto-core.ts";
import { BADGE_MESSAGE } from "./messages.ts";
import { loadSettings, petConfig } from "./settings.ts";
import { getSite, originOf } from "./sites.ts";

// Registered per origin by siteActions.ts after applier.js (same isolated world, so the applier is already on globalThis); runs at document_start.
// Reads storage only, never calls a provider. Keeping the applier in its own file keeps this glue under its size budget.
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
    onNavigate: (cb) => {
      // The Navigation API reports pushState, replaceState, back and forward within the document; popstate and hashchange cover older engines.
      let timer: number | undefined;
      const later = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = window.setTimeout(cb, 250);
      };
      const nav = (window as unknown as { navigation?: EventTarget }).navigation;
      nav?.addEventListener("navigatesuccess", later);
      window.addEventListener("popstate", later);
      window.addEventListener("hashchange", later);
    },
    onApplied: (site) => {
      void sendMessage(BADGE_MESSAGE).catch(() => undefined);
      void loadSettings().then((s) => applier.syncPet(petFor(petConfig(s), site)));
      // The scene script (scene.js, registered only for a site with saved art) picks the saved look up from here.
      (globalThis as unknown as { skinlyOnApplied?: (site: SiteRecord) => void }).skinlyOnApplied?.(site);
    },
  });
}

/** The saved pet look of a site wins over the global one; a saved look means the user wanted the pet there. */
export function petFor(global: PetConfig, site: SiteRecord): PetConfig {
  return site.look?.pet ? { ...global, ...site.look.pet, enabled: true } : global;
}
