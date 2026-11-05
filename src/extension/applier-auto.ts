import { checkUrl } from "../analyzer/eligibility.ts";
import type { PageApplier } from "./applier.ts";
import type { PetConfig } from "../features/pet/pet.ts";
import type { SiteRecord } from "./sites.ts";
import { sendMessage } from "./api.ts";
import { runAuto } from "./auto-core.ts";
import { BADGE_MESSAGE } from "./messages.ts";
import { recordError, setFlag } from "../core/diag.ts";
import { savePageDiag } from "./diagStore.ts";

/** The page snapshot is stored once per page load, after the last late re-measure of the art (3 s). */
export const DIAG_SNAPSHOT_MS = 4000;
import { loadSettings, petConfig } from "./settings.ts";
import { getSite, originOf } from "./sites.ts";

// Registered per origin by siteActions.ts after applier.js (same isolated world, so the applier is already on globalThis); runs at document_start.
// Reads storage only, never calls a provider. Keeping the applier in its own file keeps this glue under its size budget.
const slot = globalThis as unknown as { skinlyApplier?: PageApplier; skinlyAutoLive?: boolean };
const applier = slot.skinlyApplier;
const origin = originOf(location.href);

// Injected again into an open tab (Resume, or the keep flow after the prompt) while an earlier run is still live: nothing to do. Restore
// ends the live run, so a later injection starts a fresh one.
if (applier && origin && !slot.skinlyAutoLive) {
  slot.skinlyAutoLive = true;
  applier.onRestore(() => {
    slot.skinlyAutoLive = false;
  });
  // Nothing here may throw into the page: every step records its short kind and stops.
  runAuto({
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
      return () => {
        if (timer !== undefined) clearTimeout(timer);
        nav?.removeEventListener("navigatesuccess", later);
        window.removeEventListener("popstate", later);
        window.removeEventListener("hashchange", later);
      };
    },
    report: (state) => {
      setFlag("auto", state);
      if (state.startsWith("error-")) recordError("auto-run");
    },
    onApplied: (site) => {
      void sendMessage(BADGE_MESSAGE).catch(() => undefined);
      void loadSettings()
        .then((s) => applier.syncPet(petFor(petConfig(s), site)))
        .catch(() => recordError("auto-pet"));
      // The scene script (scene.js, registered with every kept site) shows the art of the stored plan's theme from here.
      try {
        (globalThis as unknown as { skinlyOnApplied?: (site: SiteRecord) => void }).skinlyOnApplied?.(site);
      } catch {
        recordError("auto-art");
      }
      // For Settings, About, Copy diagnostics: fixed words and numbers of this page only (no origin, no text).
      window.setTimeout(() => {
        try {
          const d = applier.diag();
          void savePageDiag(d.page, d.errors);
        } catch {
          recordError("other");
        }
      }, DIAG_SNAPSHOT_MS);
    },
  }).catch(() => recordError("auto-run"));
}

/** The saved pet look of a site wins over the global one; a saved look means the user wanted the pet there. */
export function petFor(global: PetConfig, site: SiteRecord): PetConfig {
  return site.look?.pet ? { ...global, ...site.look.pet, enabled: true } : global;
}
