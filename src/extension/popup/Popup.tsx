import { useEffect, useState } from "preact/hooks";
import { checkUrl } from "../../analyzer/eligibility.ts";
import { THEMES, type BuiltinThemeId } from "../../themes/index.ts";
import { injectFile, queryActiveTab, runInPage } from "../api.ts";
import { defaultSettings, loadSettings, saveSettings, type Settings } from "../settings.ts";
import type { ApplyResult } from "../applier-core.ts";

export const BLOCKED_MESSAGE = "Skinly can't change this kind of page";
const FAILED_MESSAGE = "Couldn't apply that theme; the page was left as it was.";

export function Popup() {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [status, setStatus] = useState("");

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const pickTheme = (theme: BuiltinThemeId) => {
    const next = { ...settings, theme };
    setSettings(next);
    void saveSettings(next);
  };

  const transform = async () => {
    try {
      const tab = await queryActiveTab();
      if (!tab || !tab.url || !checkUrl(tab.url, settings.blocklist).allowed) return setStatus(BLOCKED_MESSAGE);
      await injectFile(tab.id, "applier.js");
      const result = await runInPage<ApplyResult>(tab.id, "applyTheme", settings.theme);
      setStatus(result?.ok ? "Done." : FAILED_MESSAGE);
    } catch {
      setStatus(BLOCKED_MESSAGE);
    }
  };

  const restore = async () => {
    try {
      const tab = await queryActiveTab();
      if (!tab) return setStatus(BLOCKED_MESSAGE);
      await runInPage(tab.id, "restore");
      setStatus("Original restored.");
    } catch {
      setStatus(BLOCKED_MESSAGE);
    }
  };

  return (
    <main>
      <h1>Skinly AI</h1>
      <fieldset>
        <legend>Theme</legend>
        {THEMES.map((t) => (
          <label key={t.id}>
            <input type="radio" name="theme" value={t.id} checked={settings.theme === t.id} onChange={() => pickTheme(t.id)} />
            {t.name}
          </label>
        ))}
      </fieldset>
      <button type="button" onClick={transform}>Transform this page</button>
      <button type="button" onClick={restore}>Restore original</button>
      <p role="status">{status}</p>
      <footer>Skinly AI is not affiliated with any website.</footer>
    </main>
  );
}
