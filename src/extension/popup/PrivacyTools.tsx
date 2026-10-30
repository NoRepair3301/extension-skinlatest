import { useEffect, useState } from "preact/hooks";
import { SCREENSHOT_NOTE, safeScreenshot } from "../../features/blur/screenshot.ts";
import { S } from "../../ui/strings.ts";
import { captureVisible, runTool } from "../api.ts";
import { ensureApplier } from "../inject.ts";
import type { ToolState } from "../pageTools.ts";
import { saveBlur } from "../siteActions.ts";
import type { SiteRecord } from "../sites.ts";

interface Props {
  tabId: number;
  origin: string;
  record: SiteRecord | undefined;
  onSaved(): void;
  /** Called after any tool ran on the page; the popup uses it to show the pet there (when it is enabled). */
  onToolUsed?(): void;
}

/** Blur, safe screenshot and table tools. The first use injects the page script (activeTab, from the user's click). */
export function PrivacyTools({ tabId, origin, record, onSaved, onToolUsed }: Props) {
  const [state, setState] = useState<ToolState | undefined>(undefined);
  const [images, setImages] = useState(record?.blurImages ?? false);
  const [note, setNote] = useState("");
  const [shot, setShot] = useState<{ url: string; name: string } | undefined>(undefined);
  const [filter, setFilter] = useState("");

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  // Reflect what the page already has (the popup is new each time it opens). Nothing is injected for this read.
  useEffect(() => {
    void (async () => {
      try {
        const s = await runTool<ToolState>(tabId, "blurState");
        if (s) setState(s);
      } catch {
        // no page script yet: nothing is on
      }
    })();
  }, [tabId]);

  const ready = async (): Promise<boolean> => {
    try {
      await ensureApplier(tabId, true);
      return true;
    } catch {
      setNote(S.privacy.blocked);
      return false;
    }
  };

  const guard = async (run: () => Promise<void>) => {
    try {
      if (await ready()) {
        await run();
        onToolUsed?.();
      }
    } catch {
      setNote(S.privacy.failed);
    }
  };

  const loadSaved = (s: ToolState | undefined, r: SiteRecord | undefined) => (r && (r.blur.length > 0 || r.blurImages) && (!s || s.picked.length === 0) ? r : undefined);

  const pick = () =>
    guard(async () => {
      const saved = loadSaved(await runTool<ToolState>(tabId, "blurState"), record);
      if (saved) await runTool(tabId, "blurTargets", saved.blur, saved.blurImages);
      const s = await runTool<ToolState>(tabId, "pickStart");
      setState(s);
      setNote(S.privacy.pickOn);
    });

  const share = (on: boolean) =>
    guard(async () => {
      if (on && state === undefined) {
        const saved = loadSaved(undefined, record);
        if (saved) await runTool(tabId, "blurTargets", saved.blur, saved.blurImages);
      }
      setState(await runTool<ToolState>(tabId, "blurShare", on));
    });

  const wholePage = (on: boolean) =>
    guard(async () => {
      setState(await runTool<ToolState>(tabId, "blurPage", on));
      setNote(on ? S.privacy.pageOn : S.privacy.pageOff);
    });

  const blurImages = (on: boolean) =>
    guard(async () => {
      setImages(on);
      const cur = (await runTool<ToolState>(tabId, "blurState")) ?? state;
      setState(await runTool<ToolState>(tabId, "blurTargets", cur?.picked ?? [], on));
    });

  const save = async () => {
    const cur = await runTool<ToolState>(tabId, "blurState").catch(() => undefined);
    if (!cur) return setNote(S.privacy.nothingToSave);
    const r = await saveBlur(origin, cur.picked, images);
    setNote(r.ok ? S.privacy.saved(cur.picked.length) : S.privacy.keepFirst);
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
      if (!r.ok) return setNote(r.reason === "not-confirmed" ? S.privacy.shareFailed : S.privacy.shotFailed);
      setShot({ url: URL.createObjectURL(r.blob), name: r.fileName });
      setNote(S.privacy.shotReady);
    });

  const tablesOn = () =>
    guard(async () => {
      const n = (await runTool<number>(tabId, "tablesEnable")) ?? 0;
      setNote(n > 0 ? S.privacy.tables(n) : S.privacy.noTables);
    });

  const applyFilter = (q: string) => {
    setFilter(q);
    void guard(async () => void (await runTool(tabId, "tablesFilter", q)));
  };

  return (
    <section aria-label={S.privacy.section}>
      <h2>{S.privacy.title}</h2>
      <label>
        <input type="checkbox" checked={state?.page ?? false} onChange={(e) => void wholePage((e.currentTarget as HTMLInputElement).checked)} />
        {S.privacy.blurPage}
      </label>
      <button type="button" onClick={() => void pick()}>{S.privacy.pick}</button>
      <label>
        <input type="checkbox" checked={state?.share ?? false} onChange={(e) => void share((e.currentTarget as HTMLInputElement).checked)} />
        {S.privacy.blurPicked}
      </label>
      <label>
        <input type="checkbox" checked={images} onChange={(e) => void blurImages((e.currentTarget as HTMLInputElement).checked)} />
        {S.privacy.blurImages}
      </label>
      {state && <p>{S.privacy.count(state.count, state.missing)}</p>}
      <button type="button" onClick={() => void save()}>{S.privacy.savePicks}</button>
      <button type="button" onClick={() => void screenshot()}>{S.privacy.screenshot}</button>
      <p class="note">{SCREENSHOT_NOTE}</p>
      {state?.page && <p class="note">{S.privacy.pageBlurShot}</p>}
      {shot && (
        <a href={shot.url} download={shot.name}>{S.privacy.save(shot.name)}</a>
      )}

      <button type="button" onClick={() => void tablesOn()}>{S.privacy.tableTools}</button>
      <label>
        {S.privacy.filter}
        <input type="text" value={filter} onInput={(e) => applyFilter((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <button type="button" onClick={() => void guard(async () => void (await runTool(tabId, "tablesRestoreOrder")))}>{S.privacy.restoreOrder}</button>
      <p role="status">{note}</p>
    </section>
  );
}
