import { useState } from "preact/hooks";
import { THEMES } from "../../themes/index.ts";
import { Button, Dialog } from "../../ui/components.tsx";
import { PROVIDER_IDS, type ProviderId } from "../../config.ts";
import { S } from "../../ui/strings.ts";
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
    setNote(r.ok ? S.keys.saved : r.reason === "permission" ? S.keys.noPermission : S.keys.badKey);
  };

  return (
    <Dialog title={S.welcome.title} onClose={onClose}>
      <p class="note">{S.welcome.step(step, STEPS)}</p>
      {step === 1 && (
        <div class="ui-stack">
          <p>{S.welcome.look}</p>
          <label>
            {S.welcome.theme}
            <select value={settings.theme} onChange={(e) => onChange({ ...settings, theme: (e.currentTarget as HTMLSelectElement).value as Settings["theme"] })}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value="auto">{S.welcome.autoOption}</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={settings.scene.enabled} onChange={(e) => onChange({ ...settings, scene: { ...settings.scene, enabled: (e.currentTarget as HTMLInputElement).checked } })} />
            {S.welcome.art}
          </label>
        </div>
      )}
      {step === 2 && (
        <div class="ui-stack">
          <p>{S.welcome.key}</p>
          <label>
            {S.welcome.provider}
            <select value={provider} onChange={(e) => setProvider((e.currentTarget as HTMLSelectElement).value as ProviderId)}>
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>{NAMES[id]}</option>
              ))}
            </select>
          </label>
          <label>
            {S.welcome.keyLabel}
            <input type="password" autocomplete="off" value={draft} placeholder={S.welcome.keyPlaceholder} onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <div class="ui-row">
            <Button onClick={() => void saveDraft()} disabled={draft.trim() === ""}>{S.welcome.saveKey}</Button>
          </div>
          <p role="status">{note}</p>
        </div>
      )}
      {step === 3 && (
        <div class="ui-stack">
          <p>{S.welcome.privacy1}</p>
          <p>{S.welcome.privacy2}</p>
        </div>
      )}
      <div class="ui-row">
        {step > 1 && <Button onClick={() => setStep(step - 1)}>{S.welcome.back}</Button>}
        {step < STEPS ? <Button kind="primary" onClick={() => setStep(step + 1)}>{S.welcome.next}</Button> : <Button kind="primary" onClick={onClose}>{S.welcome.done}</Button>}
        {step < STEPS && <Button kind="quiet" onClick={onClose}>{S.welcome.skip}</Button>}
      </div>
    </Dialog>
  );
}
