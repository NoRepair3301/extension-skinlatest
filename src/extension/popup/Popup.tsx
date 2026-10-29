import { useEffect, useRef, useState } from "preact/hooks";
import { MSG, consentText } from "../../ai/messages.ts";
import type { ConsentRequest, Outcome, Step } from "../../ai/pipeline.ts";
import { THEMES, type BuiltinThemeId } from "../../themes/index.ts";
import { queryActiveTab, runInPage } from "../api.ts";
import { createPageClient, runTransform } from "../flow.ts";
import { defaultSettings, loadSettings, saveSettings, type Settings } from "../settings.ts";

export const BLOCKED_MESSAGE = MSG.blocked;

const STEP_TEXT: Record<Step, string> = {
  checking: "Checking this page…",
  baseline: "Applying the built-in theme…",
  analysing: "Reading the page layout…",
  consent: "Waiting for your answer…",
  asking: "Asking the AI for a better theme…",
  applying: "Applying…",
};

export type View =
  | { state: "idle"; note?: string }
  | { state: "blocked"; reason: string }
  | { state: "working"; step: Step; detail?: string }
  | { state: "consent"; req: ConsentRequest }
  | { state: "preview"; outcome: Extract<Outcome, { kind: "preview" }>; tabId: number }
  | { state: "error"; kind: string; message: string };

export function Popup() {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [view, setView] = useState<View>({ state: "idle" });
  const [showPayload, setShowPayload] = useState(false);
  const decide = useRef<((ok: boolean) => void) | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const pickTheme = (theme: BuiltinThemeId) => {
    const next = { ...settings, theme };
    setSettings(next);
    void saveSettings(next);
  };

  const start = async () => {
    try {
      const tab = await queryActiveTab();
      if (!tab || !tab.url) return setView({ state: "blocked", reason: MSG.blocked });
      abort.current = new AbortController();
      setShowPayload(false);
      setView({ state: "working", step: "checking" });
      const outcome = await runTransform(
        tab.id,
        tab.url,
        {
          onStep: (step, detail) => setView({ state: "working", step, ...(detail ? { detail } : {}) }),
          askConsent: (req) =>
            new Promise<boolean>((resolve) => {
              decide.current = resolve;
              setView({ state: "consent", req });
            }),
        },
        abort.current.signal,
      );
      setView(toView(outcome, tab.id));
    } catch {
      setView({ state: "error", kind: "error", message: MSG.baselineFailed });
    }
  };

  const answer = (ok: boolean) => {
    decide.current?.(ok);
    decide.current = undefined;
  };

  const cancel = () => {
    abort.current?.abort();
    answer(false);
  };

  const restore = async () => {
    try {
      const tab = await queryActiveTab();
      if (!tab) return setView({ state: "blocked", reason: MSG.blocked });
      await runInPage(tab.id, "restore");
      setView({ state: "idle", note: "Original restored." });
    } catch {
      setView({ state: "blocked", reason: MSG.blocked });
    }
  };

  /** Undo puts the built-in baseline back. Keep leaves the preview on the page (held in memory only until Phase 5). */
  const undo = async (tabId: number, baseline: BuiltinThemeId) => {
    try {
      await createPageClient(tabId).applyTheme(baseline);
      setView({ state: "idle", note: "Back to the built-in theme." });
    } catch {
      setView({ state: "error", kind: "error", message: MSG.baselineFailed });
    }
  };

  const busy = view.state === "working" || view.state === "consent";

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

      {view.state === "consent" && (
        <section aria-label="Consent">
          <p>{consentText(view.req.providerNames.join(" or "))}</p>
          <button type="button" onClick={() => answer(true)}>Send</button>
          <button type="button" onClick={cancel}>Cancel</button>
          <button type="button" onClick={() => setShowPayload(!showPayload)}>Show what will be sent</button>
          {showPayload && <textarea readOnly aria-label="Payload" rows={8} value={view.req.payload} />}
        </section>
      )}

      {view.state === "preview" && (
        <section aria-label="Preview">
          <p>{view.outcome.message ?? "Here is the AI-improved theme."}</p>
          <button type="button" onClick={() => setView({ state: "idle", note: "Kept." })}>Keep</button>
          <button type="button" onClick={() => void undo(view.tabId, view.outcome.baselineThemeId)}>Undo</button>
          <button type="button" onClick={() => void start()}>Try another</button>
        </section>
      )}

      {view.state !== "consent" && (
        <button type="button" onClick={() => void start()} disabled={busy}>Change my page</button>
      )}
      {view.state === "working" && <button type="button" onClick={cancel}>Cancel</button>}
      <button type="button" onClick={() => void restore()} disabled={busy}>Restore original</button>

      <p role="status">{statusText(view)}</p>
      <footer>Skinly AI is not affiliated with any website.</footer>
    </main>
  );
}

function toView(o: Outcome, tabId: number): View {
  switch (o.kind) {
    case "blocked":
      return { state: "blocked", reason: o.message };
    case "baseline":
      return { state: "idle", note: o.message };
    case "preview":
      return { state: "preview", outcome: o, tabId };
    case "error":
      return { state: "error", kind: o.errorKind, message: o.message };
    case "cancelled":
      return { state: "idle", note: "Cancelled." };
  }
}

function statusText(v: View): string {
  switch (v.state) {
    case "idle":
      return v.note ?? "";
    case "blocked":
      return v.reason;
    case "working":
      return v.detail ?? STEP_TEXT[v.step];
    case "error":
      return v.message;
    default:
      return "";
  }
}
