import type { AssetPlacement } from "../features/assets/types.ts";
import { runScene } from "./api.ts";
import { ensureScene } from "./inject.ts";
import type { SceneStatusReport } from "./scene.ts";
import type { SceneConfig } from "./sceneConfig.ts";
import { getSite, saveSite, toOrigin } from "./sites.ts";
import type { ActionResult } from "./siteActions.ts";

/**
 * "Use on this page": shows a saved picture or video through the scene engine, next to the scene that is already showing (kept as is).
 * Only the asset id and the placement choices travel to the page; the file is read from storage by the page script itself.
 */
export async function useAssetHere(tabId: number, placement: AssetPlacement, scene: SceneConfig | null): Promise<SceneStatusReport | undefined> {
  try {
    await ensureScene(tabId);
    return await runScene<SceneStatusReport>(tabId, "sync", { scene, asset: placement, fallback: null });
  } catch {
    return undefined;
  }
}

/**
 * Saves the placement with the site record so the auto script shows it on every visit. A site that was never remembered has no
 * record to hold it, so the answer is no-record and the asset lasts only for this visit. Per-site data is keyed by origin only.
 */
export async function saveAssetForSite(origin: string, placement: AssetPlacement | null): Promise<ActionResult> {
  const o = toOrigin(origin);
  if (!o) return { ok: false, reason: "bad-origin" };
  const previous = await getSite(o);
  if (!previous) return { ok: false, reason: "no-record" };
  const { asset: _old, ...rest } = previous.look ?? {};
  void _old;
  const look = placement && placement.assetId !== null ? { ...rest, asset: placement } : rest;
  const { look: _l, ...record } = previous;
  void _l;
  await saveSite(o, Object.keys(look).length > 0 ? { ...record, look } : record);
  return { ok: true };
}
