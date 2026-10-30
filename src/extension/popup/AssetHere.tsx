import { useEffect, useState } from "preact/hooks";
import { ASSET_SIZES, ASSET_SPEEDS, PLACEMENTS, PRESETS, defaultPlacement, type AssetPlacement, type AssetRecord } from "../../features/assets/types.ts";
import { S } from "../../ui/strings.ts";
import { loadAssets } from "../assetStore.ts";
import { artStatus } from "../sceneActions.ts";
import type { SceneStatusReport } from "../scene.ts";

interface Props {
  /** Starting choices: the page's saved asset, or the global one. */
  initial: AssetPlacement;
  /** Shows the asset on the page now and says what happened. */
  onUse(p: AssetPlacement): Promise<SceneStatusReport | undefined>;
  /** Saves it with the remembered site, when there is one. */
  onSave(p: AssetPlacement): Promise<boolean>;
}

/** "Use on this page" in the popup: pick a saved file, where it goes, how big, how see-through and how it moves. */
export function AssetHere({ initial, onUse, onSave }: Props) {
  const [list, setList] = useState<AssetRecord[]>([]);
  const [p, setP] = useState<AssetPlacement>(initial.assetId === null ? defaultPlacement() : initial);
  const [note, setNote] = useState("");
  useEffect(() => void loadAssets().then(setList).catch(() => setList([])), []);
  const set = <K extends keyof AssetPlacement>(key: K, value: AssetPlacement[K]) => setP({ ...p, [key]: value });
  const pick = <K extends "mode" | "size" | "speed" | "preset">(key: K, label: string, values: readonly AssetPlacement[K][], text: Record<string, string>) => (
    <label>
      {label}
      <select value={String(p[key])} onChange={(e) => set(key, (e.currentTarget as HTMLSelectElement).value as AssetPlacement[K])}>
        {values.map((v) => (
          <option key={String(v)} value={String(v)}>{text[String(v)]}</option>
        ))}
      </select>
    </label>
  );
  const use = async () => {
    if (p.assetId === null) return setNote(S.asset.pickFirst);
    const report = await onUse(p).catch(() => undefined);
    const saved = await onSave(p).catch(() => false);
    setNote(`${artStatus(report, true)} ${saved ? S.asset.saved : S.asset.visitOnly}`);
  };
  return (
    <details class="asset-here">
      <summary>{S.asset.title}</summary>
      {list.length === 0 ? (
        <p class="note">{S.asset.none}</p>
      ) : (
        <>
          <label>
            {S.asset.file}
            <select value={p.assetId ?? ""} onChange={(e) => set("assetId", (e.currentTarget as HTMLSelectElement).value || null)}>
              <option value="">{S.asset.choose}</option>
              {list.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          {pick("mode", S.asset.where, PLACEMENTS, S.asset.modes)}
          {pick("size", S.asset.size, ASSET_SIZES, S.asset.sizes)}
          <label>
            {S.asset.opacity} {p.opacity}%
            <input type="range" min={10} max={100} step={5} value={p.opacity} onChange={(e) => set("opacity", Number((e.currentTarget as HTMLInputElement).value))} />
          </label>
          {pick("speed", S.asset.speed, ASSET_SPEEDS, S.asset.speeds)}
          {pick("preset", S.asset.preset, PRESETS, S.asset.presets)}
          <button type="button" onClick={() => void use()}>{S.asset.use}</button>
        </>
      )}
      <p class="note" aria-live="polite">{note}</p>
    </details>
  );
}
