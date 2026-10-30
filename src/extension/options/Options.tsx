import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { applyUiTheme } from "../../ui/theme.ts";
import { Button, Card, Dialog, EmptyState, TabPanel, Tabs } from "../../ui/components.tsx";
import { S } from "../../ui/strings.ts";
import { browserHints, extensionVersion, getCommands } from "../api.ts";
import { shortcutLine, shortcutsPage, type CommandInfo } from "../shortcuts.ts";
import { THEMES } from "../../themes/index.ts";
import { DAILY_AI_CALLS, PROVIDER_IDS, type ProviderId } from "../../config.ts";
import { Logo } from "../Logo.tsx";
import { SceneOptions } from "../SceneOptions.tsx";
import { MyAssets } from "./MyAssets.tsx";
import { Welcome } from "./Welcome.tsx";
import { deleteKey, keyStatus, MASK, saveKey, testKey } from "../keys.ts";
import { entryHost } from "../../analyzer/eligibility.ts";
import { PET_CORNERS, PET_KINDS, PET_SIZES, callsOn, defaultSettings, loadSettings, saveSettings, type Settings } from "../settings.ts";
import { eraseEverything, forgetAll, forgetSite } from "../siteActions.ts";
import { loadSites, type Sites } from "../sites.ts";

const NAMES: Record<ProviderId, string> = { gemini: "Gemini (Google AI Studio)", groq: "Groq" };
const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
const TABS = (Object.keys(S.options.tabs) as Array<keyof typeof S.options.tabs>).map((id) => ({ id, label: S.options.tabs[id] }));
const RECEIVES = S.options.receives;
const tabFromHash = (): string => (TABS.some((t) => "#" + t.id === location.hash) ? location.hash.slice(1) : "general");
const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const today = (): string => new Date().toISOString().slice(0, 10);

const TEST_MESSAGES: Record<string, string> = {
  ok: "Key works.",
  auth: "The provider rejected the key (or no key is saved).",
  rate: "The provider is busy. Try again soon.",
  quota: "This key has used up its quota.",
  network: "Could not reach the provider.",
  timeout: "The provider took too long.",
  "bad-output": "The provider answered, but not in a usable way.",
  server: "The provider had a server problem.",
  blocked: "The provider blocked the request.",
  aborted: "Cancelled.",
};

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
  const hints = safe(() => browserHints(), { userAgent: "", brave: false });
  const version = safe(() => extensionVersion(), "");
  const selectTab = (id: string) => {
    setTab(id);
    safe(() => history.replaceState(null, "", "#" + id), undefined);
  };
  const closeWelcome = () => {
    setWelcomeOpen(false);
    if (!settings.welcomeDone) update({ ...settings, welcomeDone: true });
  };
  const erase = async () => {
    const r = await eraseEverything();
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
    void (async () => {
      try {
        setCommands((await getCommands()).filter((c) => c.name !== "_execute_action"));
      } catch {
        setCommands([]);
      }
    })();
  }, []);
  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      if (!s.welcomeDone) setWelcomeOpen(true);
    });
    void keyStatus().then(setSaved);
    void loadSites().then(setSites);
  }, []);

  const note = (id: ProviderId, text: string) => setNotes((n) => ({ ...n, [id]: text }));
  const update = (next: Settings) => {
    setSettings(next);
    void saveSettings(next);
  };

  const forget = async (origin: string) => {
    await forgetSite(origin);
    setSites(await loadSites());
  };

  const forgetEverything = async () => {
    await forgetAll();
    setSites(await loadSites());
  };

  const addBlock = () => {
    const host = entryHost(blockDraft);
    if (!HOST.test(host)) return setBlockNote("Enter a site such as example.org.");
    setBlockDraft("");
    if (settings.blocklist.includes(host)) return setBlockNote("Already on the list.");
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
    const r = await saveKey(id, drafts[id]);
    setDrafts((d) => ({ ...d, [id]: "" }));
    if (r.ok) {
      setSaved((s) => ({ ...s, [id]: true }));
      note(id, S.keys.saved);
    } else note(id, r.reason === "permission" ? S.keys.noPermission : S.keys.badKey);
  };

  const remove = async (id: ProviderId) => {
    await deleteKey(id);
    setSaved((s) => ({ ...s, [id]: false }));
    note(id, S.keys.removed);
  };

  const test = async (id: ProviderId) => {
    note(id, "Testing...");
    const r = await testKey(id, settings.models[id]);
    note(id, TEST_MESSAGES[r] ?? "Test failed.");
  };

  const q = siteQuery.trim().toLowerCase();
  const shownSites = Object.entries(sites).filter(([origin]) => origin.toLowerCase().includes(q));
  const page = shortcutsPage(hints.userAgent, hints.brave);
  const panel = (id: string, children: ComponentChildren) => (
    <TabPanel id={id} selected={tab} keep>
      <div class="panel">{children}</div>
    </TabPanel>
  );

  return (
    <main>
      <h1>
        <Logo size={32} /> {S.options.title}
      </h1>
      <p class="note">{S.app.notAffiliated}</p>
      <Tabs label={S.options.tabsLabel} tabs={TABS} selected={tab} onSelect={selectTab} />

      {panel(
        "general",
        <>
          <Card title="Your look">
            <p class="note">Theme: {settings.theme === "auto" ? "Auto" : (THEMES.find((t) => t.id === settings.theme)?.name ?? settings.theme)}. Pet: {settings.pet.enabled ? "on" : "off"}. Scene: {settings.scene.enabled ? "on" : "off"}. Change them in the other tabs or from the toolbar popup.</p>
          </Card>
          <Card title="AI use today">
            <p class="note">AI calls today: {callsOn(settings, today())} of {DAILY_AI_CALLS}</p>
          </Card>
        </>,
      )}

      {panel(
        "themes",
        <fieldset class="default-theme">
          <legend>Default theme</legend>
          <p class="note">This is the theme the popup starts with. Auto follows your browser's light or dark setting.</p>
          <div class="theme-grid">
            {[...THEMES.map((t) => ({ id: t.id as string, name: t.name })), { id: "auto", name: "Auto" }].map((t) => (
              <label key={t.id} class="theme-card">
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
          <section>
            <h2>Pet</h2>
            <label>
              <input type="checkbox" checked={settings.pet.enabled} onChange={(e) => update({ ...settings, pet: { ...settings.pet, enabled: (e.currentTarget as HTMLInputElement).checked } })} />
              Show a small pet on pages I change
            </label>
            {([["kind", "Pet", PET_KINDS], ["size", "Size", PET_SIZES], ["corner", "Corner", PET_CORNERS]] as const).map(([field, label, values]) => (
              <label key={field}>
                {label}
                <select value={settings.pet[field]} onChange={(e) => update({ ...settings, pet: { ...settings.pet, [field]: (e.currentTarget as HTMLSelectElement).value } })}>
                  {values.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
            <p class="note">The pet never appears on blocked pages and moves away from form fields. Turn it off for one site from the popup.</p>
          </section>
          <section>
            <h2>Scenes</h2>
            <SceneOptions scene={settings.scene} onChange={(scene) => update({ ...settings, scene })} />
          </section>
        </>,
      )}

      {panel("assets", <MyAssets placement={settings.asset} onPlacement={(asset) => update({ ...settings, asset })} />)}

      {panel(
        "providers",
        <>
          <section>
            <h2>Provider order</h2>
            <p class="note">AI requests try providers in this order.</p>
            {settings.order.map((id, i) => (
              <div class="row" key={id}>
                <span>{i + 1}. {NAMES[id]}</span>
                <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${NAMES[id]} up`}>Up</button>
                <button type="button" onClick={() => move(id, 1)} disabled={i === settings.order.length - 1} aria-label={`Move ${NAMES[id]} down`}>Down</button>
              </div>
            ))}
          </section>

          {PROVIDER_IDS.map((id) => (
            <section key={id}>
              <h2>{NAMES[id]}</h2>
              <p class="note">{RECEIVES}</p>
              <label>
                Key {saved[id] ? `(saved: ${MASK})` : "(none saved)"}
                <input
                  type="password"
                  autocomplete="off"
                  value={drafts[id]}
                  placeholder={saved[id] ? "Paste a new key to replace it" : "Paste your key"}
                  onInput={(e) => setDrafts((d) => ({ ...d, [id]: (e.currentTarget as HTMLInputElement).value }))}
                />
              </label>
              <label>
                Model
                <input
                  type="text"
                  value={settings.models[id]}
                  onChange={(e) => update({ ...settings, models: { ...settings.models, [id]: (e.currentTarget as HTMLInputElement).value.trim() || defaultSettings().models[id] } })}
                />
              </label>
              <div class="row">
                <button type="button" onClick={() => save(id)} disabled={drafts[id].trim() === ""}>Save key</button>
                <button type="button" onClick={() => test(id)} disabled={!saved[id]}>Test key</button>
                <button type="button" onClick={() => remove(id)} disabled={!saved[id]}>Remove key</button>
              </div>
              <p role="status">{notes[id]}</p>
            </section>
          ))}
          <p class="note">AI calls today: {callsOn(settings, today())} of {DAILY_AI_CALLS}</p>
        </>,
      )}

      {panel(
        "sites",
        <>
          <section>
            <h2>Saved sites</h2>
            {Object.keys(sites).length > 0 && (
              <label>
                Search saved sites
                <input type="search" value={siteQuery} onInput={(e) => setSiteQuery((e.currentTarget as HTMLInputElement).value)} />
              </label>
            )}
            {Object.keys(sites).length === 0 && <EmptyState title={S.options.noSites}>{S.options.noSitesHint}</EmptyState>}
            {Object.keys(sites).length > 0 && shownSites.length === 0 && <p class="note">No saved site matches that search.</p>}
            {shownSites.map(([origin, rec]) => (
              <div class="row" key={origin}>
                <span>{origin} · {rec.provider} · {rec.savedAt.slice(0, 10)}{rec.mode === "auto" ? " · automatic" : ""}</span>
                <button type="button" onClick={() => void forget(origin)} aria-label={`Forget ${origin}`}>Forget</button>
              </div>
            ))}
            {Object.keys(sites).length > 0 && <button type="button" onClick={() => void forgetEverything()}>Forget all</button>}
          </section>

          <section>
            <h2>Blocklist</h2>
            <p class="note">Skinly AI never changes these sites.</p>
            {settings.blocklist.map((host) => (
              <div class="row" key={host}>
                <span>{host}</span>
                <button type="button" onClick={() => removeBlock(host)} aria-label={`Remove ${host} from the blocklist`}>Remove</button>
              </div>
            ))}
            <label>
              Site to block
              <input type="text" value={blockDraft} placeholder="example.org" onInput={(e) => setBlockDraft((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <button type="button" onClick={addBlock} disabled={blockDraft.trim() === ""}>Add to blocklist</button>
            <p role="status">{blockNote}</p>
          </section>
        </>,
      )}

      {panel(
        "shortcuts",
        <Card title="Keyboard shortcuts">
          {commands.length === 0 ? (
            <p class="note">{S.options.noShortcuts}</p>
          ) : (
            <ul>
              {commands.map((c) => (
                <li key={c.name}>{shortcutLine(c, page)}</li>
              ))}
            </ul>
          )}
          <p class="note">To set or change a key, type {page} in the address bar of a new tab. Browsers do not let extensions open that page for you.</p>
        </Card>,
      )}

      {panel(
        "privacy",
        <>
          <section>
            <h2>Privacy and storage</h2>
            <p class="note">Keys are stored unencrypted in this browser profile (extension storage). Anyone with access to this profile can read them. A saved key is never shown again and never leaves this device except to its own provider.</p>
            <p class="note">Stays on this device: your settings, keys, saved sites (by site address only), pet and scene choices, and the images and videos you add under My assets.</p>
            <p class="note">Sent only after you agree, and only when you click: a small description of a page's layout (shapes, sizes and colours, no text, links, images or forms) to the provider you chose.</p>
          </section>
          <section>
            <h2>{S.options.eraseTitle}</h2>
            <p class="note">Removes every setting, key, saved site, asset and permission this extension holds. Pages you changed return to normal when you reload them.</p>
            <button type="button" onClick={() => setEraseOpen(true)}>{S.options.eraseTitle}</button>
            {eraseNote && <p role="status">{eraseNote}</p>}
          </section>
        </>,
      )}

      {panel(
        "about",
        <Card title="About Skinly AI">
          <p>Version {version}</p>
          <p class="note">Skinly AI is free and is not affiliated with any website. Its art is original and drawn in code; fonts are your system fonts. See assets/LICENSES.md in the source for the list of assets.</p>
          <p class="note">What leaves your browser: nothing, unless you click Change my page with an AI provider and agree. The privacy text ships with the extension in docs/store/privacy.md.</p>
          <button type="button" onClick={() => setWelcomeOpen(true)}>{S.options.showWelcome}</button>
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
