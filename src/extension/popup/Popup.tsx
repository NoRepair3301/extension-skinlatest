import { useEffect, useRef, useState } from "preact/hooks";
import { applyUiTheme } from "../../ui/theme.ts";
import { Button, Spinner, Toggle } from "../../ui/components.tsx";
import { S } from "../../ui/strings.ts";
import { MSG, applyFailureMessage, consentText, repairConsentText } from "../../ai/messages.ts";
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
import { artStatus, showArtHere, updateArtHere } from "../sceneActions.ts";
import { lookFor, sceneRequest, sourceForTheme, type SceneSource } from "../sceneConfig.ts";
import { PrivacyTools } from "./PrivacyTools.tsx";
import { AssetHere } from "./AssetHere.tsx";
import { saveAssetForSite, useAssetHere } from "../assetActions.ts";
import { enableAuto, forgetSite, pauseSite, type ActionResult, type KeptPlan } from "../siteActions.ts";
import { shortcutLine, shortcutsPage, type CommandInfo } from "../shortcuts.ts";
import { getSite, originOf, type SiteRecord } from "../sites.ts";
import { decodeThemeCode, encodeThemeCode } from "../themeCode.ts";

export const BLOCKED_MESSAGE = MSG.blocked;

const STEP_TEXT: Record<Step, string> = S.steps;

export type View =
  | { state: "idle"; note?: string }
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
  const [codeError, setCodeError] = useState("");
  /** The theme now on the page, ready to keep for the whole site. Only set after a successful apply. */
  const [keepable, setKeepable] = useState<{ tabId: number; origin: string | undefined; kept: KeptPlan } | undefined>(undefined);
  const [copyNote, setCopyNote] = useState("");
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

  useEffect(() => applyUiTheme(document, settings.theme), [settings.theme]);
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
    setSceneNote(artStatus(await showArtHere(tabId, next, source), sceneRequest(next, source) !== null));
  };

  const updateScene = (next: Settings) => {
    setSettings(next);
    void saveSettings(next);
    setSceneNote("");
    const tabId = artTab.current;
    const source = artSource.current;
    if (tabId !== undefined && source) void updateArtHere(tabId, next, source).then((r) => setSceneNote(artStatus(r, sceneRequest(next, source) !== null)));
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
      setPetNote("");
      setSceneNote("");
      setKeepable(undefined);
      setCopyNote("");
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
      setKeepable(keepFrom(outcome, tab.id, tab.url));
      const fresh = await loadSettings();
      if (outcome.kind === "baseline") void showArt(tab.id, fresh, sourceForTheme(outcome.themeId, prefersDark()));
      else if (outcome.kind === "preview") void showArt(tab.id, fresh, { themeId: outcome.plan.themeId, planSceneId: outcome.plan.sceneId, accent: outcome.plan.tokens.accent });
      // The pet does not depend on the theme: it shows after a rolled-back theme too (not on blocked pages, not when cancelled).
      if (outcome.kind !== "blocked" && outcome.kind !== "cancelled") void showPetHere();
    } catch {
      // The flow itself threw. If a theme is already on the page the apply worked, so no error is shown for it (a stale error
      // next to a themed page was a real-browser bug); otherwise the page was not touched.
      const themed = await pageIsThemed();
      setView(themed ? { state: "idle", note: S.popup.appliedWithGap } : { state: "error", kind: "error", message: applyFailureMessage(undefined) });
      void showPetHere();
    }
  };

  /** True when the active tab has a live theme (asked of the page script, never inferred from the popup's own state). */
  const pageIsThemed = async (): Promise<boolean> => {
    try {
      const tab = await queryActiveTab();
      return tab ? (await runInPage<boolean>(tab.id, "isActive")) === true : false;
    } catch {
      return false;
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
      setKeepable(undefined);
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
      setKeepable(undefined);
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

  /** What the page shows now, as a plan that can be kept: from a preview, or from the built-in theme that was applied. */
  const keepFrom = (outcome: Outcome, tabId: number, url: string | undefined): { tabId: number; origin: string | undefined; kept: KeptPlan } | undefined => {
    const origin = url ? originOf(url) : undefined;
    if (outcome.kind === "preview") {
      const look = lookFor(settings, { themeId: outcome.plan.themeId, planSceneId: outcome.plan.sceneId, accent: outcome.plan.tokens.accent });
      return { tabId, origin, kept: { plan: outcome.plan, fingerprint: outcome.fingerprint, provider: outcome.providerId ?? "builtin", model: outcome.model ?? "builtin", look } };
    }
    if (outcome.kind === "baseline" && outcome.plan && outcome.fingerprint) {
      const look = lookFor(settings, { themeId: outcome.plan.themeId, accent: outcome.plan.tokens.accent });
      return { tabId, origin, kept: { plan: outcome.plan, fingerprint: outcome.fingerprint, provider: "builtin", model: "builtin", look } };
    }
    return undefined;
  };

  /** One click: asks for this origin only, saves the theme and registers the auto script for it (the click is the user gesture). */
  const keepOnSite = async () => {
    if (!keepable) return;
    if (!keepable.origin) return setView({ state: "idle", note: S.popup.keepNoOrigin });
    const k = keepable;
    await siteAction(() => enableAuto(k.origin!, k.kept, k.tabId), S.popup.keepDone, S.popup.keepDenied);
    const r = await getSite(k.origin!).catch(() => undefined);
    if (r?.mode === "auto") {
      badge(k.tabId, "ON");
      setKeepable(undefined);
    }
  };

  const copyCode = async (plan: KeptPlan["plan"]) => {
    try {
      await navigator.clipboard.writeText(encodeThemeCode(plan));
      setCopyNote(S.popup.copyDone);
    } catch {
      setView({ state: "idle", note: S.popup.copyFailed });
    }
  };

  /** An imported code is a validated, contrast-checked StylePlan with no regions; it is shown, not remembered. */
  const importCode = async () => {
    setCodeError("");
    const r = decodeThemeCode(codeText);
    if (!r.ok) return setCodeError(r.message);
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
    <main class="popup">
      <header class="popup-head">
        <h1>
          <Logo size={28} /> Skinly AI
        </h1>
        <p role="status" class={view.state === "error" || view.state === "blocked" ? "status-bad" : ""}>{statusText(view) || pageLine(site, settings)}</p>
      </header>

      {view.state !== "consent" && (
        <div class="primary-actions">
          <Button kind="primary" onClick={() => void start()} disabled={busy}>{S.popup.change}</Button>
          <Button onClick={() => void restore()} disabled={busy}>{S.popup.restore}</Button>
          {view.state === "working" && <Button kind="quiet" onClick={cancel}>{S.popup.cancel}</Button>}
        </div>
      )}
      {view.state === "working" && <Spinner label="Working" />}

      <fieldset class="themes">
        <legend>{S.popup.themeLegend}</legend>
        <div class="theme-grid">
          {THEMES.map((t) => (
            <label key={t.id} class={`theme-card${settings.theme === t.id ? " on" : ""}`}>
              <input type="radio" name="theme" value={t.id} checked={settings.theme === t.id} onChange={() => pickTheme(t.id)} />
              <span class="mini" aria-hidden="true" style={{ background: t.tokens.bg, borderColor: t.tokens.border }}>
                <i style={{ background: t.tokens.surface }} />
                <i style={{ background: t.tokens.accent, width: "40%" }} />
                <i style={{ background: t.tokens.text, width: "60%", height: "3px" }} />
              </span>
              <span class="theme-name">{t.name}</span>
            </label>
          ))}
          <label class={`theme-card${settings.theme === "auto" ? " on" : ""}`}>
            <input type="radio" name="theme" value="auto" checked={settings.theme === "auto"} onChange={() => pickTheme("auto")} />
            <span class="mini auto" aria-hidden="true" />
            <span class="theme-name" title={S.popup.autoThemeHint}>{S.popup.autoTheme}</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>{S.popup.petLegend}</legend>
        <Toggle label={S.popup.petToggle} checked={settings.pet.enabled} onChange={(on) => updatePet({ ...settings.pet, enabled: on })} />
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

      {site && view.state !== "consent" && (
        <AssetHere
          initial={site.record?.look?.asset ?? settings.asset}
          onUse={(p) => useAssetHere(site.tabId, p, artSource.current ? (sceneRequest(settings, artSource.current)?.scene ?? null) : null)}
          onSave={async (p) => (await saveAssetForSite(site.origin, p)).ok}
        />
      )}

      {view.state === "consent" && (
        <section aria-label="Consent">
          <p>{(view.req.purpose === "repair" ? repairConsentText : consentText)(view.req.providerNames.join(" or "))}</p>
          <button type="button" onClick={() => answer(true)}>Send</button>
          <button type="button" onClick={cancel}>Cancel</button>
          <button type="button" onClick={() => setShowPayload(!showPayload)}>Show what will be sent</button>
          {showPayload && <textarea readOnly aria-label="Payload" rows={8} value={view.req.payload} />}
        </section>
      )}

      {view.state === "preview" && (
        <section aria-label="Preview">
          <p>{view.outcome.message ?? "Here is the AI-improved theme."}</p>
          <button type="button" onClick={() => void keepOnSite()} disabled={!keepable}>{S.popup.keep}</button>
          <button type="button" onClick={() => void undo(view.tabId, view.outcome.baselineThemeId)}>Undo</button>
          <button type="button" onClick={() => void start()}>Try another</button>
        </section>
      )}

      {keepable && view.state === "idle" && (
        <section aria-label="Keep">
          <button type="button" onClick={() => void keepOnSite()}>{S.popup.keep}</button>
          <p class="note">{S.popup.keepNote}</p>
        </section>
      )}
      {keepable && (view.state === "idle" || view.state === "preview") && (
        <section aria-label="Share">
          <button type="button" onClick={() => void copyCode(keepable.kept.plan)}>Copy theme code</button>
          {copyNote && <p role="status">{copyNote}</p>}
        </section>
      )}

      {view.state === "idle" && (
        <section aria-label="Theme code">
          <label>
            {S.popup.importTitle}
            <textarea class="import-box" rows={3} value={codeText} maxLength={2000} spellcheck={false} aria-describedby="import-format" onInput={(e) => setCodeText((e.target as HTMLTextAreaElement).value)} />
          </label>
          <p class="note" id="import-format">{S.popup.importFormat}</p>
          <button type="button" disabled={codeText.trim() === ""} onClick={() => void importCode()}>{S.popup.importButton}</button>
          {codeError && <p role="alert" class="status-bad">{codeError}</p>}
        </section>
      )}

      {site?.record && view.state !== "consent" && view.state !== "working" && (
        <section aria-label="This site">
          <p>{site.record.mode === "auto" ? `Automatic on this site (${providerLabel(site.record.provider)}).` : `Saved for this site (${providerLabel(site.record.provider)}).`}</p>
          {site.record.mode === "auto" && <button type="button" onClick={() => void siteAction(() => pauseSite(site.origin), "Paused on this site.", "Couldn't pause.")}>Pause on this site</button>}
          <button type="button" onClick={() => void siteAction(() => forgetSite(site.origin, site.tabId), "Forgotten.", "Couldn't forget this site.")}>Forget this site</button>
        </section>
      )}

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
      <details class="sent">
        <summary>{S.popup.sentSummary}</summary>
        <p class="note">{S.popup.sentBody}</p>
      </details>
      <footer>{S.app.notAffiliated}</footer>
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

/** One plain line for the header when nothing else needs saying. */
function pageLine(site: { origin: string; record: SiteRecord | undefined } | undefined, settings: Settings): string {
  if (!site) return S.popup.readyNoPage;
  if (site.record) return site.record.mode === "auto" ? S.popup.siteAuto : S.popup.siteSaved;
  return settings.theme === "auto" ? S.popup.readyAuto : S.popup.ready;
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
