import { checkUrl } from "../analyzer/eligibility.ts";
import { injectFile, queryActiveTab, runInPage } from "./api.ts";
import { originOf } from "./origin.ts";
import { loadSettings, petConfig } from "./settings.ts";

/** One-line reasons shown in the popup when the pet cannot be shown. Fixed text only. */
export const PET_WHY = {
  off: "The pet is off. Turn it on above first.",
  noTab: "There is no page open to put the pet on.",
  blocked: "Skinly can't put the pet on this kind of page.",
  siteOff: "The pet is turned off for this site.",
  denied: "Skinly can't run on this page (the browser didn't allow it).",
  notShown: "The pet couldn't be shown on this page.",
} as const;

export type PetShowResult = { ok: true } | { ok: false; why: string };

/**
 * Shows the pet on the active page. Independent of any theme: it works after a rolled-back or failed theme and on a page
 * that was never themed. Nothing is injected unless the pet is enabled and the page is allowed; this is only called from a user click
 * (the "Show pet on this page" button, or right after the user used another tool on this page).
 */
export async function showPetHere(): Promise<PetShowResult> {
  try {
    const settings = await loadSettings();
    if (!settings.pet.enabled) return { ok: false, why: PET_WHY.off };
    const tab = await queryActiveTab();
    if (!tab?.url) return { ok: false, why: PET_WHY.noTab };
    if (!checkUrl(tab.url, settings.blocklist).allowed) return { ok: false, why: PET_WHY.blocked };
    const origin = originOf(tab.url);
    if (origin !== undefined && settings.pet.disabledOrigins.includes(origin)) return { ok: false, why: PET_WHY.siteOff };
    try {
      await injectFile(tab.id, "applier.js");
    } catch {
      return { ok: false, why: PET_WHY.denied };
    }
    const shown = await runInPage<boolean>(tab.id, "syncPet", petConfig(settings));
    return shown === true ? { ok: true } : { ok: false, why: PET_WHY.notShown };
  } catch {
    return { ok: false, why: PET_WHY.denied };
  }
}
