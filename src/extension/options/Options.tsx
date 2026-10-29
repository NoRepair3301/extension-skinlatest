import { useEffect, useState } from "preact/hooks";
import { DAILY_AI_CALLS, PROVIDER_IDS, type ProviderId } from "../../config.ts";
import { deleteKey, keyStatus, MASK, saveKey, testKey } from "../keys.ts";
import { entryHost } from "../../analyzer/eligibility.ts";
import { callsOn, defaultSettings, loadSettings, saveSettings, type Settings } from "../settings.ts";
import { forgetAll, forgetSite } from "../siteActions.ts";
import { loadSites, type Sites } from "../sites.ts";

const NAMES: Record<ProviderId, string> = { gemini: "Gemini (Google AI Studio)", groq: "Groq" };
const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
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

  useEffect(() => {
    void loadSettings().then(setSettings);
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
      note(id, "Key saved.");
    } else note(id, r.reason === "permission" ? "Permission for this provider was not granted, so the key was not saved." : "That does not look like a key.");
  };

  const remove = async (id: ProviderId) => {
    await deleteKey(id);
    setSaved((s) => ({ ...s, [id]: false }));
    note(id, "Key removed.");
  };

  const test = async (id: ProviderId) => {
    note(id, "Testing...");
    const r = await testKey(id, settings.models[id]);
    note(id, TEST_MESSAGES[r] ?? "Test failed.");
  };

  return (
    <main>
      <h1>Skinly AI settings</h1>
      <p class="note">Skinly AI is not affiliated with any website.</p>

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

      <section>
        <h2>Saved sites</h2>
        {Object.keys(sites).length === 0 && <p class="note">No sites saved.</p>}
        {Object.entries(sites).map(([origin, rec]) => (
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

      <section>
        <h2>Privacy and storage</h2>
        <p class="note">Keys are stored unencrypted in this browser profile (extension storage). Anyone with access to this profile can read them. A saved key is never shown again.</p>
        <p class="note">AI calls today: {callsOn(settings, today())} of {DAILY_AI_CALLS}</p>
      </section>
    </main>
  );
}
