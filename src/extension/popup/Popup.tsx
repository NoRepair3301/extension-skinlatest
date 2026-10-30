import { useEffect, useRef, useState } from "preact/hooks";
import { MSG, applyFailureMessage, consentText } from "../../ai/messages.ts";
import type { ConsentRequest, Outcome, Step } from "../../ai/pipeline.ts";
import { THEMES, type BuiltinThemeId, type ThemeChoice } from "../../themes/index.ts";
import { PROVIDER_NAMES, type ProviderId } from "../../config.ts";
import { browserHints, getCommands, queryActiveTab, runInPage, setBadge } from "../api.ts";
import { createPageClient, runTransform } from "../flow.ts";
import { defaultSettings, loadSettings, petConfig, saveSettings, type Settings } from "../settings.ts";
import { showPetHere } from "../petActions.ts";
import { Logo } from "../Logo.tsx";
import { PetOptions } from "./PetOptions.tsx";
import { SceneOptions } from "../SceneOptions.tsx";
import { artNote, showArtHere, updateArtHere } from "../sceneActions.ts";
import { lookFor, sourceForTheme, type SceneSource } from "../sceneConfig.ts";
import { PrivacyTools } from "./PrivacyTools.tsx";
import { enableAuto, forgetSite, pauseSite, rememberSite, type ActionResult, type KeptPlan } from "../siteActions.ts";
import { shortcutLine, shortcutsPage, type CommandInfo } from "../shortcuts.ts";
import { getSite, originOf, type SiteRecord } from "../sites.ts";
import { decodeThemeCode, encodeThemeCode } from "../themeCode.ts";

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
  | { state: "kept"; tabId: number; origin: string | undefined; kept: KeptPlan; copied?: boolean }
  | { state: "blocked"; reason: string }
  | { state: "working"; step: Step; detail?: string }
  | { state: "consent"; req: ConsentRequest }
  | { state: "preview"; outcome: Extract<Outcome, { kind: "preview" }>; tabId: number }
  | { state: "error"; kind: string; message: string };

const badge = (tabId: number, text: string): void => {
  void setBadge(tabId, text).catch(() => undefined);
};

export function Popup() {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [view, setView] = useState<View>({ state: "idle" });
  const [showPayload, setShowPayload] = useState(false);
  const [codeText, setCodeText] = useState("");
  const decide = useRef<((ok: boolean) => void) | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const tabUrl = useRef<string | undefined>(undefined);
  const [petNote, setPetNote] = useState("");
  const [sceneNote, setSceneNote] = useState("");
  /** What the page shows now (theme, plan scene, accent), so a changed setting can reach the art that is already there. */
  const artSource = useRef<SceneSource | undefined>(undefined);
  const artTab = useRef<number | undefined>(undefined);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [site, setSite] = useState<{ origin: string; tabId: number; record: SiteRecord | undefined } | undefined>(undefined);

  const refreshSite = async () => {
    try {
      const tab = await queryActiveTab();
      const origin = tab?.url ? originOf(tab.url) : undefined;
      setSite(tab && origin ? { origin, tabId: tab.id, record: await getSite(origin) } : undefined);
    } catch {
      setSite(undefined);
    }
  };

  useEffect(() => {
    void loadSettings().then(setSettings);
    void refreshSite();
    // The keys the browser really assigned (a suggested key is dropped when something else already uses it).
    void (async () => {
      try {
        setCommands((await getCommands()).filter((c) => c.name !== "_execute_action"));
      } catch {
        setCommands([]);
      }
    })();
  }, []);

  /**
   * Tells a pet that is already on the page about a changed setting, or removes it when the pet was turned off.
   * It never brings a hidden pet back and never injects anything: only the "Show pet on this page" button and the user's
   * own tool use do that.
   */
  const updatePetInPage = (next: Settings, tabId: number | undefined) => {
    if (tabId === undefined) return;
    void (async () => {
      try {
        await runInPage(tabId, "updatePet", petConfig(next));
      } catch {
        // no applier in this tab: nothing to update
      }
    })();
  };

  const updatePet = (pet: Settings["pet"]) => {
    const next = { ...settings, pet };
    setSettings(next);
    void saveSettings(next);
    setPetNote("");
    updatePetInPage(next, site?.tabId);
  };

  const showPet = async () => {
    const r = await showPetHere();
    setPetNote(r.ok ? "The pet is on this page. Restore original removes it." : r.why);
  };

  const petHereOff = site !== undefined && settings.pet.disabledOrigins.includes(site.origin);

  const prefersDark = (): boolean => globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches === true;

  /** Puts the chosen scene and picture on the page after a theme was applied (the user clicked a button). */
  const showArt = async (tabId: number, next: Settings, source: SceneSource) => {
    artSource.current = source;
    artTab.current = tabId;
    setSceneNote(artNote(await showArtHere(tabId, next, source)));
  };

  const updateScene = (next: Settings) => {
    setSettings(next);
    void saveSettings(next);
    setSceneNote("");
    const tabId = artTab.current;
    const source = artSource.current;
    if (tabId !== undefined && source) void updateArtHere(tabId, next, source).then((r) => setSceneNote(artNote(r)));
  };

  const pickTheme = (theme: ThemeChoice) => {
    const next = { ...settings, theme };
    setSettings(next);
    void saveSettings(next);
  };

  const start = async () => {
    try {
      const tab = await queryActiveTab();
      if (!tab || !tab.url) return setView({ state: "blocked", reason: MSG.blocked });
      tabUrl.current = tab.url;
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
      const fresh = await loadSettings();
      if (outcome.kind === "baseline") void showArt(tab.id, fresh, sourceForTheme(outcome.themeId, prefersDark()));
      else if (outcome.kind === "preview") void showArt(tab.id, fresh, { themeId: outcome.plan.themeId, planSceneId: outcome.plan.sceneId, accent: outcome.plan.tokens.accent });
      // The pet does not depend on the theme: it shows after a rolled-back theme too (not on blocked pages, not when cancelled).
      if (outcome.kind !== "blocked" && outcome.kind !== "cancelled") void showPetHere();
    } catch {
      // The flow itself threw (usually: the browser refused to inject into this page). The page was not touched.
      setView({ state: "error", kind: "error", message: applyFailureMessage(undefined) });
      void showPetHere();
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
      await runInPage(tab.id, "restore", undefined, true);
      badge(tab.id, "");
      artSource.current = undefined;
      setSceneNote("");
      setView({ state: "idle", note: "Original restored." });
    } catch {
      setView({ state: "blocked", reason: MSG.blocked });
    }
  };

  /** Undo puts the built-in baseline back. Keep leaves the preview on the page (held in memory only until Phase 5). */
  const undo = async (tabId: number, baseline: BuiltinThemeId) => {
    try {
      await createPageClient(tabId).applyTheme(baseline);
      badge(tabId, "");
      void showArt(tabId, settings, sourceForTheme(baseline, prefersDark()));
      setView({ state: "idle", note: "Back to the built-in theme." });
    } catch {
      setView({ state: "error", kind: "error", message: applyFailureMessage(undefined) });
    }
  };

  const siteAction = async (run: () => Promise<ActionResult>, done: string, failed: string) => {
    try {
      const r = await run();
      setView({ state: "idle", note: r.ok ? done : failed });
    } catch {
      setView({ state: "idle", note: failed });
    }
    await refreshSite();
  };

  const keepNow = (outcome: Extract<Outcome, { kind: "preview" }>, tabId: number, url: string | undefined) => {
    const provider: string = outcome.providerId ?? "builtin";
    badge(tabId, "ON");
    setView({
      state: "kept",
      tabId,
      origin: url ? originOf(url) : undefined,
      kept: {
        plan: outcome.plan,
        fingerprint: outcome.fingerprint,
        provider,
        model: outcome.model ?? "builtin",
        look: lookFor(settings, { themeId: outcome.plan.themeId, planSceneId: outcome.plan.sceneId, accent: outcome.plan.tokens.accent }),
      },
    });
  };

  const copyCode = async (plan: KeptPlan["plan"]) => {
    try {
      await navigator.clipboard.writeText(encodeThemeCode(plan));
      setView((v) => (v.state === "kept" ? { ...v, copied: true } : v));
    } catch {
      setView({ state: "idle", note: "Couldn't copy the code." });
    }
  };

  /** An imported code is a validated, contrast-checked StylePlan with no regions; it is shown, not remembered. */
  const importCode = async () => {
    const r = decodeThemeCode(codeText);
    if (!r.ok) return setView({ state: "idle", note: r.message });
    try {
      const tab = await queryActiveTab();
      if (!tab || !tab.url) return setView({ state: "blocked", reason: MSG.blocked });
      const res = await createPageClient(tab.id).applyPlan(r.plan);
      if (!res || !res.ok) return setView({ state: "error", kind: "error", message: applyFailureMessage(res) });
      badge(tab.id, "ON");
      setCodeText("");
      void showArt(tab.id, settings, { themeId: r.plan.themeId, planSceneId: r.plan.sceneId, accent: r.plan.tokens.accent });
      setView({ state: "idle", note: "Theme code applied. Use Restore to undo." });
    } catch {
      setView({ state: "error", kind: "error", message: applyFailureMessage(undefined) });
    }
  };

  const busy = view.state === "working" || view.state === "consent";
  const hints = browserHints();
  const page = shortcutsPage(hints.userAgent, hints.brave);

  return (
    <main>
      <h1>
        <Logo size={24} /> Skinly AI
      </h1>
      <fieldset>
        <legend>Theme</legend>
        {THEMES.map((t) => (
          <label key={t.id}>
            <input type="radio" name="theme" value={t.id} checked={settings.theme === t.id} onChange={() => pickTheme(t.id)} />
            {t.name}
          </label>
        ))}
        <label>
          <input type="radio" name="theme" value="auto" checked={settings.theme === "auto"} onChange={() => pickTheme("auto")} />
          Auto (light by day, dark when your browser is dark)
        </label>
      </fieldset>

      <fieldset>
        <legend>Pet</legend>
        <label>
          <input type="checkbox" checked={settings.pet.enabled} onChange={(e) => updatePet({ ...settings.pet, enabled: (e.currentTarget as HTMLInputElement).checked })} />
          Show a small pet on pages I change
        </label>
        {site && settings.pet.enabled && (
          <label>
            <input
              type="checkbox"
              checked={petHereOff}
              onChange={(e) => {
                const off = (e.currentTarget as HTMLInputElement).checked;
                const rest = settings.pet.disabledOrigins.filter((o) => o !== site.origin);
                updatePet({ ...settings.pet, disabledOrigins: off ? [...rest, site.origin] : rest });
              }}
            />
            Disable pet on this site
          </label>
        )}
        <PetOptions pet={settings.pet} onChange={updatePet} />
        <button type="button" onClick={() => void showPet()}>Show pet on this page</button>
        <p class="note" aria-live="polite">{petNote}</p>
      </fieldset>

      <SceneOptions scene={settings.scene} onChange={(scene) => updateScene({ ...settings, scene })} />
      <p class="note" aria-live="polite">{sceneNote}</p>

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
          <button type="button" onClick={() => keepNow(view.outcome, view.tabId, tabUrl.current)}>Keep</button>
          <button type="button" onClick={() => void undo(view.tabId, view.outcome.baselineThemeId)}>Undo</button>
          <button type="button" onClick={() => void start()}>Try another</button>
        </section>
      )}

      {view.state === "kept" && (
        <section aria-label="Remember">
          <p>Kept for this visit.</p>
          {view.origin ? (
            <>
              <button type="button" onClick={() => void siteAction(() => rememberSite(view.origin!, view.kept), "Saved for this site. It applies when you click.", "Couldn't save this site.")}>Remember this site</button>
              <button type="button" onClick={() => void siteAction(() => enableAuto(view.origin!, view.kept, view.tabId), "This site will be themed automatically.", "Couldn't turn on automatic mode (permission needed).")}>Always on this site</button>
            </>
          ) : (
            <p>This page can't be remembered.</p>
          )}
          <button type="button" onClick={() => void copyCode(view.kept.plan)}>Copy theme code</button>
          {view.copied && <p>Theme code copied. It holds colours and scene only.</p>}
          <button type="button" onClick={() => setView({ state: "idle", note: "Kept." })}>Done</button>
        </section>
      )}

      {(view.state === "idle" || view.state === "kept") && (
        <section aria-label="Theme code">
          <label>
            Import theme code
            <input type="text" value={codeText} maxLength={2000} onInput={(e) => setCodeText((e.target as HTMLInputElement).value)} />
          </label>
          <button type="button" disabled={codeText.trim() === ""} onClick={() => void importCode()}>Import</button>
        </section>
      )}

      {site?.record && view.state !== "consent" && view.state !== "working" && (
        <section aria-label="This site">
          <p>{site.record.mode === "auto" ? `Automatic on this site (${providerLabel(site.record.provider)}).` : `Saved for this site (${providerLabel(site.record.provider)}).`}</p>
          {site.record.mode === "auto" && <button type="button" onClick={() => void siteAction(() => pauseSite(site.origin), "Paused on this site.", "Couldn't pause.")}>Pause on this site</button>}
          <button type="button" onClick={() => void siteAction(() => forgetSite(site.origin, site.tabId), "Forgotten.", "Couldn't forget this site.")}>Forget this site</button>
        </section>
      )}

      {view.state !== "consent" && (
        <button type="button" onClick={() => void start()} disabled={busy}>Change my page</button>
      )}
      {view.state === "working" && <button type="button" onClick={cancel}>Cancel</button>}
      <button type="button" onClick={() => void restore()} disabled={busy}>Restore original</button>

      <p role="status">{statusText(view)}</p>
      {site && view.state !== "consent" && <PrivacyTools tabId={site.tabId} origin={site.origin} record={site.record} onSaved={() => void refreshSite()} onToolUsed={() => void showPetHere()} />}

      <section aria-label="Shortcuts">
        <h2>Keyboard shortcuts</h2>
        {commands.length > 0 && (
          <ul>
            {commands.map((c) => (
              <li key={c.name}>{shortcutLine(c, page)}</li>
            ))}
          </ul>
        )}
        <p class="note">To set or change a key, open {page} in the address bar.</p>
      </section>
      <footer>Skinly AI is not affiliated with any website.</footer>
    </main>
  );
}

const providerLabel = (id: string): string => (id in PROVIDER_NAMES ? PROVIDER_NAMES[id as ProviderId] : "built-in theme");

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
