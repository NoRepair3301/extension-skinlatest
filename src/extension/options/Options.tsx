import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { applyUiTheme } from "../../ui/theme.ts";
import { Banner, Button, Card, Dialog, EmptyState, TabPanel, Tabs } from "../../ui/components.tsx";
import { S } from "../../ui/strings.ts";
import { browserHints, extensionVersion, getCommands } from "../api.ts";
import { shortcutLine, shortcutsPage, type CommandInfo } from "../shortcuts.ts";
import { THEMES } from "../../themes/index.ts";
import { DAILY_AI_CALLS, PROVIDER_IDS, type ProviderId } from "../../config.ts";
import { Logo } from "../Logo.tsx";
import { SceneOptions } from "../SceneOptions.tsx";
import { MyAssets } from "./MyAssets.tsx";
import { PlanAccount } from "./PlanAccount.tsx";
import { canUse, type PlanFlag } from "../../core/entitlements.ts";
import { loadPlan } from "../planFlag.ts";
import { Welcome } from "./Welcome.tsx";
import { deleteKey, keyStatus, MASK, saveKey, testKey } from "../keys.ts";
import { entryHost } from "../../analyzer/eligibility.ts";
import { PET_CORNERS, PET_KINDS, PET_SIZES, callsOn, defaultSettings, loadSettings, saveSettings, type Settings } from "../settings.ts";
import { eraseEverything, forgetAll, forgetSite } from "../siteActions.ts";
import { loadSites, type Sites } from "../sites.ts";
import { diagReport } from "../../core/diagReport.ts";
import { loadDiag, recordErrors } from "../diagStore.ts";
import { useOnline } from "../../ui/online.ts";

const NAMES: Record<ProviderId, string> = { gemini: "Gemini (Google AI Studio)", groq: "Groq" };
const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
const TABS = (Object.keys(S.options.tabs) as Array<keyof typeof S.options.tabs>).map((id) => ({ id, label: S.options.tabs[id] }));
const T = S.opt;
const tabFromHash = (): string => (TABS.some((t) => "#" + t.id === location.hash) ? location.hash.slice(1) : "general");
const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const today = (): string => new Date().toISOString().slice(0, 10);

export function Options() {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [saved, setSaved] = useState<Record<ProviderId, boolean>>({ gemini: false, groq: false });
  const [drafts, setDrafts] = useState<Record<ProviderId, string>>({ gemini: "", groq: "" });
  const [sites, setSites] = useState<Sites>({});
  const [blockDraft, setBlockDraft] = useState("");
  const [blockNote, setBlockNote] = useState("");
  const [notes, setNotes] = useState<Record<ProviderId, string>>({ gemini: "", groq: "" });

  const [tab, setTab] = useState(tabFromHash);
  const [siteQuery, setSiteQuery] = useState("");
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseNote, setEraseNote] = useState("");
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [diagText, setDiagText] = useState("");
  const [diagNote, setDiagNote] = useState("");
  const [planFlag, setPlanFlag] = useState<PlanFlag>("free");
  const online = useOnline();
  const hints = safe(() => browserHints(), { userAgent: "", brave: false });
  const version = safe(() => extensionVersion(), "");
  const selectTab = (id: string) => {
    setTab(id);
    safe(() => history.replaceState(null, "", "#" + id), undefined);
  };
  /** Builds the diagnostics from storage (fixed words and numbers only) and puts them on the clipboard; the text stays visible to copy by hand. */
  const copyDiag = async () => {
    const text = diagReport(version, await loadDiag().catch(() => ({ v: 1 as const, errors: [] })), { online });
    setDiagText(text);
    try {
      await navigator.clipboard.writeText(text);
      setDiagNote(S.options.copyDiagDone);
    } catch {
      setDiagNote(S.options.copyDiagFailed);
    }
  };
  const closeWelcome = () => {
    setWelcomeOpen(false);
    if (!settings.welcomeDone) update({ ...settings, welcomeDone: true });
  };
  const erase = async () => {
    const r = await eraseEverything().catch(() => ({ ok: false as const }));
    setEraseOpen(false);
    if (r.ok) {
      setSettings({ ...defaultSettings(), welcomeDone: true });
      setSaved({ gemini: false, groq: false });
      setSites({});
    }
    setEraseNote(r.ok ? S.options.erased : S.options.eraseFailed);
  };

  useEffect(() => applyUiTheme(document, settings.theme), [settings.theme]);
  useEffect(() => {
    void loadPlan().then(setPlanFlag);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setCommands((await getCommands()).filter((c) => c.name !== "_execute_action"));
      } catch {
        setCommands([]);
      }
    })();
  }, []);
  useEffect(() => {
    // Every load is caught: a storage failure leaves the defaults on screen and is recorded, never an unhandled rejection.
    const failed = () => void recordErrors(["popup-error"]);
    void loadSettings()
      .then((s) => {
        setSettings(s);
        if (!s.welcomeDone) setWelcomeOpen(true);
      })
      .catch(failed);
    void keyStatus().then(setSaved).catch(failed);
    void loadSites().then(setSites).catch(failed);
  }, []);

  const note = (id: ProviderId, text: string) => setNotes((n) => ({ ...n, [id]: text }));
  const update = (next: Settings) => {
    setSettings(next);
    void saveSettings(next).catch(() => recordErrors(["popup-error"]));
  };

  const forget = async (origin: string) => {
    await forgetSite(origin).catch(() => undefined);
    setSites(await loadSites().catch(() => sites));
  };

  const forgetEverything = async () => {
    await forgetAll().catch(() => undefined);
    setSites(await loadSites().catch(() => sites));
  };

  const addBlock = () => {
    const host = entryHost(blockDraft);
    if (!HOST.test(host)) return setBlockNote(T.sites.badHost);
    setBlockDraft("");
    if (settings.blocklist.includes(host)) return setBlockNote(T.sites.duplicate);
    setBlockNote("");
    update({ ...settings, blocklist: [...settings.blocklist, host] });
  };

  const removeBlock = (host: string) => update({ ...settings, blocklist: settings.blocklist.filter((h) => h !== host) });

  const move = (id: ProviderId, by: -1 | 1) => {
    const order = [...settings.order];
    const i = order.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    update({ ...settings, order });
  };

  const save = async (id: ProviderId) => {
    const r = await saveKey(id, drafts[id]).catch(() => ({ ok: false as const, reason: "error" as const }));
    setDrafts((d) => ({ ...d, [id]: "" }));
    if (r.ok) {
      setSaved((s) => ({ ...s, [id]: true }));
      note(id, S.keys.saved);
    } else note(id, r.reason === "permission" ? S.keys.noPermission : S.keys.badKey);
  };

  const remove = async (id: ProviderId) => {
    await deleteKey(id).catch(() => undefined);
    setSaved((s) => ({ ...s, [id]: false }));
    note(id, S.keys.removed);
  };

  const test = async (id: ProviderId) => {
    if (!online) return note(id, T.providers.results["network"] ?? T.providers.testFailed);
    note(id, T.providers.testing);
    const r = await testKey(id, settings.models[id]).catch(() => "network");
    note(id, T.providers.results[r] ?? T.providers.testFailed);
  };

  const q = siteQuery.trim().toLowerCase();
  const siteCount = Object.keys(sites).length;
  const shownSites = Object.entries(sites).filter(([origin]) => origin.toLowerCase().includes(q));
  const page = shortcutsPage(hints.userAgent, hints.brave);
  const themeName = settings.theme === "auto" ? T.themes.auto : (THEMES.find((t) => t.id === settings.theme)?.name ?? settings.theme);
  const panel = (id: string, children: ComponentChildren) => (
    <TabPanel id={id} selected={tab} keep>
      <div class="panel">{children}</div>
    </TabPanel>
  );

  return (
    <main class="options">
      <header class="options-head">
        <h1>
          <Logo size={32} /> {S.options.title}
        </h1>
        <p class="note">{S.app.notAffiliated}</p>
      </header>
      {!online && <Banner>{T.offline}</Banner>}
      <nav class="options-nav">
        <Tabs label={S.options.tabsLabel} tabs={TABS} selected={tab} onSelect={selectTab} />
      </nav>

      {panel(
        "general",
        <>
          <Card title={T.general.look}>
            <p class="note">{T.general.lookLine(themeName, settings.pet.enabled, settings.scene.enabled)}</p>
          </Card>
          <Card title={T.general.usage}>
            <p class="note">{T.general.calls(callsOn(settings, today()), DAILY_AI_CALLS)}</p>
          </Card>
        </>,
      )}

      {panel(
        "themes",
        <fieldset class="default-theme">
          <legend>{T.themes.legend}</legend>
          <p class="note">{T.themes.note}</p>
          <div class="theme-grid">
            {[...THEMES.map((t) => ({ id: t.id as string, name: t.name })), { id: "auto", name: T.themes.auto }].map((t) => (
              <label key={t.id} class={`theme-card${settings.theme === t.id ? " on" : ""}`}>
                <input type="radio" name="default-theme" value={t.id} checked={settings.theme === t.id} onChange={() => update({ ...settings, theme: t.id as Settings["theme"] })} />
                <span>{t.name}</span>
              </label>
            ))}
          </div>
        </fieldset>,
      )}

      {panel(
        "scenes",
        <>
          <Card title={T.pet.title}>
            <label class="check">
              <input type="checkbox" checked={settings.pet.enabled} onChange={(e) => update({ ...settings, pet: { ...settings.pet, enabled: (e.currentTarget as HTMLInputElement).checked } })} />
              {T.pet.show}
            </label>
            <div class="field-grid">
              {([["kind", T.pet.kind, PET_KINDS], ["size", T.pet.size, PET_SIZES], ["corner", T.pet.corner, PET_CORNERS]] as const).map(([field, label, values]) => (
                <label key={field}>
                  {label}
                  <select class="ui-select" value={settings.pet[field]} onChange={(e) => update({ ...settings, pet: { ...settings.pet, [field]: (e.currentTarget as HTMLSelectElement).value } })}>
                    {values.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p class="note">{T.pet.note}</p>
          </Card>
          <Card title={T.scenesTitle}>
            <SceneOptions scene={settings.scene} onChange={(scene) => update({ ...settings, scene })} />
          </Card>
        </>,
      )}

      {panel(
        "assets",
        canUse("assets", planFlag) ? (
          <MyAssets placement={settings.asset} onPlacement={(asset) => update({ ...settings, asset })} />
        ) : (
          <Card title={S.options.tabs.assets}>
            <p class="note">{S.plus.assetsLocked}</p>
            <Button onClick={() => selectTab("plan")}>{S.plus.seePlans}</Button>
          </Card>
        ),
      )}

      {panel("plan", <PlanAccount onPlan={setPlanFlag} />)}

      {panel(
        "providers",
        <>
          <Card title={T.providers.order}>
            <p class="note">{T.providers.orderNote}</p>
            <ol class="order">
              {settings.order.map((id, i) => (
                <li class="row" key={id}>
                  <span class="grow">{i + 1}. {NAMES[id]}</span>
                  <Button onClick={() => move(id, -1)} disabled={i === 0} aria-label={T.providers.moveUp(NAMES[id])}>{T.providers.up}</Button>
                  <Button onClick={() => move(id, 1)} disabled={i === settings.order.length - 1} aria-label={T.providers.moveDown(NAMES[id])}>{T.providers.down}</Button>
                </li>
              ))}
            </ol>
          </Card>

          {PROVIDER_IDS.map((id) => (
            <Card key={id} title={NAMES[id]}>
              <p class="note">{S.options.receives}</p>
              <label>
                {T.providers.key} {saved[id] ? T.providers.keySaved(MASK) : T.providers.keyNone}
                <input
                  type="password"
                  autocomplete="off"
                  value={drafts[id]}
                  placeholder={saved[id] ? T.providers.replace : T.providers.paste}
                  onInput={(e) => setDrafts((d) => ({ ...d, [id]: (e.currentTarget as HTMLInputElement).value }))}
                />
              </label>
              <label>
                {T.providers.model}
                <input
                  type="text"
                  value={settings.models[id]}
                  onChange={(e) => update({ ...settings, models: { ...settings.models, [id]: (e.currentTarget as HTMLInputElement).value.trim() || defaultSettings().models[id] } })}
                />
              </label>
              <div class="row">
                <Button kind="primary" onClick={() => void save(id)} disabled={drafts[id].trim() === ""}>{T.providers.save}</Button>
                <Button onClick={() => void test(id)} disabled={!saved[id]}>{T.providers.test}</Button>
                <Button onClick={() => void remove(id)} disabled={!saved[id]}>{T.providers.remove}</Button>
              </div>
              <p role="status">{notes[id]}</p>
            </Card>
          ))}
          <p class="note">{T.general.calls(callsOn(settings, today()), DAILY_AI_CALLS)}</p>
        </>,
      )}

      {panel(
        "sites",
        <>
          <Card title={T.sites.title}>
            {siteCount > 0 && (
              <label>
                {T.sites.search}
                <input type="search" value={siteQuery} onInput={(e) => setSiteQuery((e.currentTarget as HTMLInputElement).value)} />
              </label>
            )}
            {siteCount === 0 && <EmptyState title={S.options.noSites}>{S.options.noSitesHint}</EmptyState>}
            {siteCount > 0 && shownSites.length === 0 && <p class="note">{T.sites.noMatch}</p>}
            {shownSites.length > 0 && (
              <ul class="list">
                {shownSites.map(([origin, rec]) => (
                  <li class="row" key={origin}>
                    <span class="grow">{T.sites.line(origin, rec.provider, rec.savedAt.slice(0, 10), rec.mode === "auto")}</span>
                    <Button onClick={() => void forget(origin)} aria-label={T.sites.forgetLabel(origin)}>{T.sites.forget}</Button>
                  </li>
                ))}
              </ul>
            )}
            {siteCount > 0 && (
              <div class="row">
                <Button onClick={() => void forgetEverything()}>{T.sites.forgetAll}</Button>
              </div>
            )}
          </Card>

          <Card title={T.sites.blockTitle}>
            <p class="note">{T.sites.blockNote}</p>
            {settings.blocklist.length === 0 ? (
              <EmptyState title={T.sites.blockEmpty}>{T.sites.blockEmptyHint}</EmptyState>
            ) : (
              <ul class="list">
                {settings.blocklist.map((host) => (
                  <li class="row" key={host}>
                    <span class="grow">{host}</span>
                    <Button onClick={() => removeBlock(host)} aria-label={T.sites.removeLabel(host)}>{T.sites.remove}</Button>
                  </li>
                ))}
              </ul>
            )}
            <label>
              {T.sites.blockInput}
              <input type="text" value={blockDraft} placeholder="example.org" onInput={(e) => setBlockDraft((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <div class="row">
              <Button onClick={addBlock} disabled={blockDraft.trim() === ""}>{T.sites.add}</Button>
            </div>
            <p role="status">{blockNote}</p>
          </Card>
        </>,
      )}

      {panel(
        "shortcuts",
        <Card title={T.shortcuts.title}>
          {commands.length === 0 ? (
            <EmptyState title={S.options.noShortcuts} />
          ) : (
            <ul class="list">
              {commands.map((c) => (
                <li key={c.name}>{shortcutLine(c, page)}</li>
              ))}
            </ul>
          )}
          <p class="note">{T.shortcuts.how(page)}</p>
        </Card>,
      )}

      {panel(
        "privacy",
        <>
          <Card title={T.privacy.title}>
            <p class="note">{T.privacy.keys}</p>
            <p class="note">{T.privacy.local}</p>
            <p class="note">{T.privacy.sent}</p>
            <p class="note">{S.options.repairNote}</p>
            <div class="row">
              <Button disabled={Object.keys(settings.repairConsent).length === 0} onClick={() => update({ ...settings, repairConsent: {} })}>{S.options.repairWithdraw} ({Object.keys(settings.repairConsent).length})</Button>
            </div>
          </Card>
          <Card title={S.options.eraseTitle}>
            <p class="note">{T.privacy.eraseNote}</p>
            <div class="row">
              <Button onClick={() => setEraseOpen(true)}>{S.options.eraseTitle}</Button>
            </div>
            {eraseNote && <p role="status">{eraseNote}</p>}
          </Card>
        </>,
      )}

      {panel(
        "about",
        <Card title={T.about.title}>
          <p>{T.about.version(version)}</p>
          <p class="note">{T.about.free}</p>
          <p class="note">{T.about.leaves}</p>
          <div class="row">
            <Button onClick={() => setWelcomeOpen(true)}>{S.options.showWelcome}</Button>
          </div>
          <h3>{S.options.diagTitle}</h3>
          <p class="note">{S.options.diagNote}</p>
          <div class="row">
            <Button onClick={() => void copyDiag()}>{S.options.copyDiag}</Button>
          </div>
          {diagNote && <p role="status">{diagNote}</p>}
          {diagText && <textarea class="diag" readOnly rows={12} aria-label={S.options.diagTitle} value={diagText} />}
        </Card>,
      )}

      {welcomeOpen && <Welcome settings={settings} onChange={update} onClose={closeWelcome} />}

      {eraseOpen && (
        <Dialog title={S.options.eraseDialog} onClose={() => setEraseOpen(false)}>
          <p>{S.options.eraseBody}</p>
          <div class="ui-row">
            <Button onClick={() => setEraseOpen(false)}>{S.popup.cancel}</Button>
            <Button kind="primary" onClick={() => void erase()}>{S.options.eraseConfirm}</Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
