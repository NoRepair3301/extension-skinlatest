import { useEffect, useState } from "preact/hooks";
import { browserMediaDeps } from "../../features/assets/media.ts";
import { freeText, megabytes, prepareAsset, type MediaDeps } from "../../features/assets/prepare.ts";
import { recordBytes, removeAsset } from "../../features/assets/store.ts";
import { ASSET_SIZES, ASSET_SPEEDS, PLACEMENTS, PRESETS, type AssetPlacement, type AssetRecord } from "../../features/assets/types.ts";
import { S } from "../../ui/strings.ts";
import { loadAssets, saveAssets } from "../assetStore.ts";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm";


interface Props {
  placement: AssetPlacement;
  onPlacement(p: AssetPlacement): void;
  /** Tests pass their own; the page uses the browser's. */
  deps?: MediaDeps;
}

/** "My assets": upload, list, delete and place a picture or a short video. Files stay on this device. */
export function MyAssets({ placement, onPlacement, deps }: Props) {
  const [list, setList] = useState<AssetRecord[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    void loadAssets().then(setList);
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setNote(S.assetsTab.checking);
    try {
      const r = await prepareAsset({ name: file.name, size: file.size, bytes: async () => new Uint8Array(await file.arrayBuffer()) }, list, deps ?? browserMediaDeps(document));
      if (!r.ok) return setNote(r.message);
      await saveAssets(r.list);
      setList(r.list);
      setNote(S.assetsTab.saved);
      onPlacement({ ...placement, assetId: r.record.id });
    } catch {
      setNote(S.assetsTab.saveFailed);
    }
  };

  const remove = async (id: string) => {
    const next = removeAsset(list, id);
    await saveAssets(next);
    setList(next);
    setNote(S.assetsTab.deleted);
    if (placement.assetId === id) onPlacement({ ...placement, assetId: null });
  };

  const set = <K extends keyof AssetPlacement>(key: K, value: AssetPlacement[K]) => onPlacement({ ...placement, [key]: value });

  return (
    <section aria-label={S.assetsTab.title}>
      <h2>{S.assetsTab.title}</h2>
      <p class="note">{S.assetsTab.intro}</p>
      <label>
        {S.assetsTab.add}
        <input type="file" accept={ACCEPT} onChange={(e) => void upload((e.currentTarget as HTMLInputElement).files?.[0])} />
      </label>
      <p class="note">{S.assetsTab.limits}</p>
      <p role="status">{note}</p>
      <p class="note">{S.assetsTab.pagePointer}</p>
      <p class="note">
        {list.length} saved, {megabytes(list.reduce((n, r) => n + recordBytes(r), 0))} used, {freeText(list)}
      </p>
      <ul>
        {list.map((r) => (
          <li key={r.id}>
            <span>
              {r.name} ({r.kind}, {megabytes(recordBytes(r))})
            </span>
            <button type="button" onClick={() => void remove(r.id)} aria-label={`${S.assetsTab.del} ${r.name}`}>{S.assetsTab.del}</button>
          </li>
        ))}
      </ul>

      <label>
        {S.assetsTab.show}
        <select value={placement.assetId ?? ""} onChange={(e) => set("assetId", (e.currentTarget as HTMLSelectElement).value || null)}>
          <option value="">{S.assetsTab.nothing}</option>
          {list.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>
      {placement.assetId !== null && (
        <>
          <label>
            {S.assetsTab.where}
            <select value={placement.mode} onChange={(e) => set("mode", (e.currentTarget as HTMLSelectElement).value as AssetPlacement["mode"])}>
              {PLACEMENTS.map((m) => (
                <option key={m} value={m}>{S.assetsTab.modes[m]}</option>
              ))}
            </select>
          </label>
          <label>
            {S.assetsTab.size}
            <select value={placement.size} onChange={(e) => set("size", (e.currentTarget as HTMLSelectElement).value as AssetPlacement["size"])}>
              {ASSET_SIZES.map((s) => (
                <option key={s} value={s}>{S.assetsTab.sizes[s]}</option>
              ))}
            </select>
          </label>
          <label>
            {S.assetsTab.opacity} {placement.opacity}%
            <input type="range" min={10} max={100} step={5} value={placement.opacity} onChange={(e) => set("opacity", Number((e.currentTarget as HTMLInputElement).value))} />
          </label>
          <label>
            {S.assetsTab.movement}
            <select value={placement.preset} onChange={(e) => set("preset", (e.currentTarget as HTMLSelectElement).value as AssetPlacement["preset"])}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>{S.assetsTab.presets[p]}</option>
              ))}
            </select>
          </label>
          <label>
            {S.assetsTab.speed}
            <select value={placement.speed} onChange={(e) => set("speed", (e.currentTarget as HTMLSelectElement).value as AssetPlacement["speed"])}>
              {ASSET_SPEEDS.map((s) => (
                <option key={s} value={s}>{S.assetsTab.speeds[s]}</option>
              ))}
            </select>
          </label>
        </>
      )}
    </section>
  );
}
