import { parseAssets } from "../features/assets/store.ts";
import { ASSETS_KEY, type AssetRecord } from "../features/assets/types.ts";
import { storageGet, storageSet } from "./api.ts";

/** Every valid saved file. Re-checked on every read: a corrupt record is simply ignored. */
export async function loadAssets(): Promise<AssetRecord[]> {
  return parseAssets(await storageGet(ASSETS_KEY));
}

export async function saveAssets(list: readonly AssetRecord[]): Promise<void> {
  await storageSet(ASSETS_KEY, list);
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return (await loadAssets()).find((r) => r.id === id);
}
