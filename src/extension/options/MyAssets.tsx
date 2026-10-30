import { useEffect, useState } from "preact/hooks";
import { browserMediaDeps } from "../../features/assets/media.ts";
import { freeText, megabytes, prepareAsset, type MediaDeps } from "../../features/assets/prepare.ts";
import { recordBytes, removeAsset } from "../../features/assets/store.ts";
import { ASSET_SIZES, ASSET_SPEEDS, PLACEMENTS, PRESETS, type AssetPlacement, type AssetRecord } from "../../features/assets/types.ts";
import { loadAssets, saveAssets } from "../assetStore.ts";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm";

const MODE_TEXT: Record<AssetPlacement["mode"], string> = {
  lane: "In the empty side space (default)",
  corner: "Small companion in a corner",
  cover: "Background behind the page",
};
const SIZE_TEXT = { S: "Small", M: "Medium", L: "Large" } as const;
const SPEED_TEXT = { slow: "Slow", normal: "Normal", fast: "Fast" } as const;
const PRESET_TEXT: Record<AssetPlacement["preset"], string> = { none: "Still", spin: "Spin", float: "Float", orbit: "Orbit", sway: "Sway", slide: "Slide", pulse: "Pulse", drift: "Drift" };

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
    setNote("Checking the file…");
    try {
      const r = await prepareAsset({ name: file.name, size: file.size, bytes: async () => new Uint8Array(await file.arrayBuffer()) }, list, deps ?? browserMediaDeps(document));
      if (!r.ok) return setNote(r.message);
      await saveAssets(r.list);
      setList(r.list);
      setNote("Saved.");
      onPlacement({ ...placement, assetId: r.record.id });
    } catch {
      setNote("Skinly could not save that file.");
    }
  };

  const remove = async (id: string) => {
    const next = removeAsset(list, id);
    await saveAssets(next);
    setList(next);
    setNote("Deleted.");
    if (placement.assetId === id) onPlacement({ ...placement, assetId: null });
  };

  const set = <K extends keyof AssetPlacement>(key: K, value: AssetPlacement[K]) => onPlacement({ ...placement, [key]: value });

  return (
    <section aria-label="My assets">
      <h2>My assets</h2>
      <p class="note">Add your own picture or short video (PNG, JPG, WebP, GIF, MP4 or WebM). Files stay on this device. They are never sent anywhere, and never shown to an AI.</p>
      <label>
        Add a file
        <input type="file" accept={ACCEPT} onChange={(e) => void upload((e.currentTarget as HTMLInputElement).files?.[0])} />
      </label>
      <p class="note">Pictures up to 25 MB are shrunk to fit (at most 1920 px). GIFs up to 3 MB. Videos up to 4 MB and 15 seconds, played without sound. SVG files are not accepted.</p>
      <p role="status">{note}</p>
      <p class="note">
        {list.length} saved, {megabytes(list.reduce((n, r) => n + recordBytes(r), 0))} used, {freeText(list)}
      </p>
      <ul>
        {list.map((r) => (
          <li key={r.id}>
            <span>
              {r.name} ({r.kind}, {megabytes(recordBytes(r))})
            </span>
            <button type="button" onClick={() => void remove(r.id)} aria-label={`Delete ${r.name}`}>Delete</button>
          </li>
        ))}
      </ul>

      <label>
        Show
        <select value={placement.assetId ?? ""} onChange={(e) => set("assetId", (e.currentTarget as HTMLSelectElement).value || null)}>
          <option value="">Nothing</option>
          {list.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>
      {placement.assetId !== null && (
        <>
          <label>
            Where
            <select value={placement.mode} onChange={(e) => set("mode", (e.currentTarget as HTMLSelectElement).value as AssetPlacement["mode"])}>
              {PLACEMENTS.map((m) => (
                <option key={m} value={m}>{MODE_TEXT[m]}</option>
              ))}
            </select>
          </label>
          <label>
            Size
            <select value={placement.size} onChange={(e) => set("size", (e.currentTarget as HTMLSelectElement).value as AssetPlacement["size"])}>
              {ASSET_SIZES.map((s) => (
                <option key={s} value={s}>{SIZE_TEXT[s]}</option>
              ))}
            </select>
          </label>
          <label>
            Opacity {placement.opacity}%
            <input type="range" min={10} max={100} step={5} value={placement.opacity} onChange={(e) => set("opacity", Number((e.currentTarget as HTMLInputElement).value))} />
          </label>
          <label>
            Movement
            <select value={placement.preset} onChange={(e) => set("preset", (e.currentTarget as HTMLSelectElement).value as AssetPlacement["preset"])}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>{PRESET_TEXT[p]}</option>
              ))}
            </select>
          </label>
          <label>
            Speed
            <select value={placement.speed} onChange={(e) => set("speed", (e.currentTarget as HTMLSelectElement).value as AssetPlacement["speed"])}>
              {ASSET_SPEEDS.map((s) => (
                <option key={s} value={s}>{SPEED_TEXT[s]}</option>
              ))}
            </select>
          </label>
        </>
      )}
    </section>
  );
}
