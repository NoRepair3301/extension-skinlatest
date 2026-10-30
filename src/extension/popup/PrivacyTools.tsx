import { useEffect, useState } from "preact/hooks";
import { SCREENSHOT_NOTE, safeScreenshot } from "../../features/blur/screenshot.ts";
import { captureVisible, injectFile, runTool } from "../api.ts";
import type { ToolState } from "../pageTools.ts";
import { saveBlur } from "../siteActions.ts";
import type { SiteRecord } from "../sites.ts";

interface Props {
  tabId: number;
  origin: string;
  record: SiteRecord | undefined;
  onSaved(): void;
}

/** Blur, safe screenshot and table tools. The first use injects the page script (activeTab, from the user's click). */
export function PrivacyTools({ tabId, origin, record, onSaved }: Props) {
  const [state, setState] = useState<ToolState | undefined>(undefined);
  const [images, setImages] = useState(record?.blurImages ?? false);
  const [note, setNote] = useState("");
  const [shot, setShot] = useState<{ url: string; name: string } | undefined>(undefined);
  const [filter, setFilter] = useState("");

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  const ready = async (): Promise<boolean> => {
    try {
      await injectFile(tabId, "applier.js", true);
      return true;
    } catch {
      setNote("Skinly can't change this kind of page");
      return false;
    }
  };

  const guard = async (run: () => Promise<void>) => {
    try {
      if (await ready()) await run();
    } catch {
      setNote("That didn't work; the page was left as it was.");
    }
  };

  const loadSaved = (s: ToolState | undefined, r: SiteRecord | undefined) => (r && (r.blur.length > 0 || r.blurImages) && (!s || s.picked.length === 0) ? r : undefined);

  const pick = () =>
    guard(async () => {
      const saved = loadSaved(await runTool<ToolState>(tabId, "blurState"), record);
      if (saved) await runTool(tabId, "blurTargets", saved.blur, saved.blurImages);
      const s = await runTool<ToolState>(tabId, "pickStart");
      setState(s);
      setNote("Pick mode is on in the page. Click what to blur, then press Escape or Done. Turn on Share mode to see the blur.");
    });

  const share = (on: boolean) =>
    guard(async () => {
      if (on && state === undefined) {
        const saved = loadSaved(undefined, record);
        if (saved) await runTool(tabId, "blurTargets", saved.blur, saved.blurImages);
      }
      setState(await runTool<ToolState>(tabId, "blurShare", on));
    });

  const blurImages = (on: boolean) =>
    guard(async () => {
      setImages(on);
      const cur = (await runTool<ToolState>(tabId, "blurState")) ?? state;
      setState(await runTool<ToolState>(tabId, "blurTargets", cur?.picked ?? [], on));
    });

  const save = async () => {
    const cur = await runTool<ToolState>(tabId, "blurState").catch(() => undefined);
    if (!cur) return setNote("Nothing to save yet.");
    const r = await saveBlur(origin, cur.picked, images);
    setNote(r.ok ? `Saved ${cur.picked.length} pick(s) for this site.` : "Remember this site first, then save your picks.");
    onSaved();
  };

  const screenshot = () =>
    guard(async () => {
      const r = await safeScreenshot({
        getShare: async () => (await runTool<ToolState>(tabId, "blurState"))?.share ?? false,
        setShare: async (on) => (await runTool<ToolState>(tabId, "blurShare", on))?.share === on,
        capture: captureVisible,
        now: () => new Date(),
      });
      if (!r.ok) return setNote(r.reason === "not-confirmed" ? "Couldn't turn Share mode on, so no picture was taken." : "Couldn't take the picture.");
      setShot({ url: URL.createObjectURL(r.blob), name: r.fileName });
      setNote("Picture ready. Check it before you share it.");
    });

  const tablesOn = () =>
    guard(async () => {
      const n = (await runTool<number>(tabId, "tablesEnable")) ?? 0;
      setNote(n > 0 ? `Table tools on for ${n} table(s): click a column header to sort.` : "No data tables found on this page.");
    });

  const applyFilter = (q: string) => {
    setFilter(q);
    void guard(async () => void (await runTool(tabId, "tablesFilter", q)));
  };

  return (
    <section aria-label="Privacy and table tools">
      <h2>Privacy and tables</h2>
      <button type="button" onClick={() => void pick()}>Pick element to blur</button>
      <label>
        <input type="checkbox" checked={state?.share ?? false} onChange={(e) => void share((e.currentTarget as HTMLInputElement).checked)} />
        Share mode (blur what I picked)
      </label>
      <label>
        <input type="checkbox" checked={images} onChange={(e) => void blurImages((e.currentTarget as HTMLInputElement).checked)} />
        Blur all images, video and canvas
      </label>
      {state && <p>{state.count} blurred, {state.missing} not found</p>}
      <button type="button" onClick={() => void save()}>Save picks for this site</button>
      <button type="button" onClick={() => void screenshot()}>Safe screenshot</button>
      <p class="note">{SCREENSHOT_NOTE}</p>
      {shot && (
        <a href={shot.url} download={shot.name}>Save {shot.name}</a>
      )}

      <button type="button" onClick={() => void tablesOn()}>Table tools</button>
      <label>
        Filter rows
        <input type="text" value={filter} onInput={(e) => applyFilter((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <button type="button" onClick={() => void guard(async () => void (await runTool(tabId, "tablesRestoreOrder")))}>Restore order</button>
      <p role="status">{note}</p>
    </section>
  );
}
