import { FREESPACE_WHY } from "../features/freespace/index.ts";
import { ASSET_WHY } from "../features/assets/render.ts";
import { runScene } from "./api.ts";
import { ensureScene } from "./inject.ts";
import type { SceneStatusReport } from "./scene.ts";
import { sceneRequest, type SceneSource } from "./sceneConfig.ts";
import type { Settings } from "./settings.ts";

/**
 * One plain line for the popup about the art on the page, from fixed text only: why nothing shows (no free side space),
 * or that the page blocks the file. Empty when all is well.
 */
export function artNote(report: SceneStatusReport | undefined): string {
  if (!report) return "";
  if (report.asset === "missing") return "The saved file is gone. Choose another in Settings.";
  if (report.asset === "poster" || report.asset === "failed" || report.asset === "no-gutter") return ASSET_WHY[report.asset];
  if (report.scene === "no-gutter") return FREESPACE_WHY[report.gutters === "narrow" ? "narrow" : "none"];
  return "";
}

/**
 * The exact state of the art for the popup, in one line of fixed words: off, not loaded, shown, narrow side space, no free side space,
 * or a picture problem. Unlike artNote it also says so when everything works.
 */
export function artStatus(report: SceneStatusReport | undefined, wanted: boolean): string {
  if (!wanted) return "Scene art is off for this theme.";
  if (!report) return "Scene art is not loaded on this page (the browser did not allow it).";
  const why = artNote(report);
  if (why) return report.scene === "no-gutter" ? `Scene art is on. ${why}` : why;
  if (report.scene === "corner") return "Scene art is showing in a small corner strip (this page has no free side space).";
  return report.scene === "shown" || report.asset === "shown" ? "Scene art is showing in the empty side space." : "Scene art is on.";
}

/**
 * Puts the chosen scene and asset on the active page after a theme is applied (the user clicked Change my page).
 * Injects scene.js into the top frame only; nothing is injected when there is nothing to show.
 */
export async function showArtHere(tabId: number, settings: Settings, source: SceneSource): Promise<SceneStatusReport | undefined> {
  const req = sceneRequest(settings, source);
  try {
    if (!req) {
      // Nothing to show now; clear anything an earlier choice left, if the script is there.
      return await runScene<SceneStatusReport>(tabId, "sync", null);
    }
    await ensureScene(tabId);
    return await runScene<SceneStatusReport>(tabId, "sync", req);
  } catch {
    return undefined;
  }
}

/** A changed setting reaches art that is already showing. It never brings art back that Restore removed. */
export async function updateArtHere(tabId: number, settings: Settings, source: SceneSource): Promise<SceneStatusReport | undefined> {
  try {
    return await runScene<SceneStatusReport>(tabId, "update", sceneRequest(settings, source));
  } catch {
    return undefined;
  }
}
