import { useState } from "preact/hooks";
import { THEMES } from "../../themes/index.ts";
import { Button, Dialog } from "../../ui/components.tsx";
import { PROVIDER_IDS, type ProviderId } from "../../config.ts";
import { saveKey } from "../keys.ts";
import type { Settings } from "../settings.ts";

const NAMES: Record<ProviderId, string> = { gemini: "Gemini (Google AI Studio)", groq: "Groq" };
const STEPS = 3;

interface Props {
  settings: Settings;
  onChange(next: Settings): void;
  onClose(): void;
}

/** Three short steps shown once on first install (and again from About): look, optional key, the privacy promise. */
export function Welcome({ settings, onChange, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState<ProviderId>(PROVIDER_IDS[0]!);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");

  const saveDraft = async () => {
    const r = await saveKey(provider, draft);
    setDraft("");
    setNote(r.ok ? "Key saved." : r.reason === "permission" ? "Permission for this provider was not granted, so the key was not saved." : "That does not look like a key.");
  };

  return (
    <Dialog title="Welcome to Skinly AI" onClose={onClose}>
      <p class="note">Step {step} of {STEPS}</p>
      {step === 1 && (
        <div class="ui-stack">
          <p>Pick a look. You can change it any time from the toolbar popup.</p>
          <label>
            Theme
            <select value={settings.theme} onChange={(e) => onChange({ ...settings, theme: (e.currentTarget as HTMLSelectElement).value as Settings["theme"] })}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value="auto">Auto (follows your browser)</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={settings.scene.enabled} onChange={(e) => onChange({ ...settings, scene: { ...settings.scene, enabled: (e.currentTarget as HTMLInputElement).checked } })} />
            Show art in the empty side space of pages
          </label>
        </div>
      )}
      {step === 2 && (
        <div class="ui-stack">
          <p>Optional: add a key to let an AI provider improve a theme. Built-in themes work without one.</p>
          <label>
            Provider
            <select value={provider} onChange={(e) => setProvider((e.currentTarget as HTMLSelectElement).value as ProviderId)}>
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>{NAMES[id]}</option>
              ))}
            </select>
          </label>
          <label>
            Key
            <input type="password" autocomplete="off" value={draft} placeholder="Paste your key" onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <div class="ui-row">
            <Button onClick={() => void saveDraft()} disabled={draft.trim() === ""}>Save key</Button>
          </div>
          <p role="status">{note}</p>
        </div>
      )}
      {step === 3 && (
        <div class="ui-stack">
          <p>Your pages and your keys stay on this device.</p>
          <p>Only after you agree, and only when you click, a small description of a page's layout (no text, links, images or forms) goes to the provider you chose.</p>
        </div>
      )}
      <div class="ui-row">
        {step > 1 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
        {step < STEPS ? <Button kind="primary" onClick={() => setStep(step + 1)}>Next</Button> : <Button kind="primary" onClick={onClose}>Done</Button>}
        {step < STEPS && <Button kind="quiet" onClick={onClose}>Skip</Button>}
      </div>
    </Dialog>
  );
}
