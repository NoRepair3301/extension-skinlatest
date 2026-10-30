import { useEffect, useRef, useState } from "preact/hooks";
import { applyUiTheme } from "../../ui/theme.ts";
import { Button, Spinner, Toggle } from "../../ui/components.tsx";
import { S } from "../../ui/strings.ts";
import { MSG, applyFailureMessage, consentText, repairConsentText } from "../../ai/messages.ts";
import type { ConsentRequest, Outcome, Step } from "../../ai/pipeline.ts";
import { THEMES, type BuiltinThemeId, type ThemeChoice } from "../../themes/index.ts";
import { PROVIDER_NAMES, type ProviderId } from "../../config.ts";
import { checkUrl } from "../../analyzer/eligibility.ts";
import { storableRepairCss } from "../../plan/readability.ts";
import { themeToPlan } from "../../plan/themeToPlan.ts";
import { browserHints, getCommands, queryActiveTab, requestOrigins, runInPage, setBadge } from "../api.ts";
import { ensureApplier } from "../inject.ts";
import { createPageClient, runTransform } from "../flow.ts";
import { defaultSettings, loadSettings, petConfig, saveSettings, type Settings } from "../settings.ts";
import { showPetHere } from "../petActions.ts";
import { Logo } from "../Logo.tsx";
import { PetOptions } from "./PetOptions.tsx";
import { SceneOptions } from "../SceneOptions.tsx";
import { artStatus, showArtHere, updateArtHere } from "../sceneActions.ts";
import { lookFor, sceneRequest, sourceForPlan, sourceForTheme, type SceneSource } from "../sceneConfig.ts";
import { PrivacyTools } from "./PrivacyTools.tsx";
import { AssetHere } from "./AssetHere.tsx";
import { saveAssetForSite, useAssetHere } from "../assetActions.ts";
import { enableAuto, forgetSite, matchFor, pauseSite, type ActionResult, type KeptPlan } from "../siteActions.ts";
import { shortcutLine, shortcutsPage, type CommandInfo } from "../shortcuts.ts";
import { getSite, originOf, type SiteRecord } from "../sites.ts";

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
  /** The theme now on the page, ready to keep for the whole site. Only set after a successful apply. */
  const [kept, setKept] = useState(false);
  /** What the last run put on the page, for the success line. */
  const [applied, setApplied] = useState<{ name: string; fixes: number } | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const [keepable, setKeepable] = useState<{ tabId: number; origin: string | undefined; kept: KeptPlan } | undefined>(undefined);
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

  const askPermission = (origin: string): Promise<boolean> => {
    try {
      return Promise.resolve(requestOrigins(matchFor(origin))).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  };

  const start = async () => {
    // The browser only shows its permission prompt for a call made inside the click, so this is the first thing that happens: before any
    // await. If it is already granted there is no prompt. The auto script is registered once the theme is on (see below).
    const grant: Promise<boolean> =
      site && checkUrl(`${site.origin}/`, settings.blocklist).allowed ? askPermission(site.origin) : Promise.resolve(false);
    try {
      const tab = await queryActiveTab();
      if (!tab || !tab.url) return setView({ state: "blocked", reason: MSG.blocked });
      tabUrl.current = tab.url;
      abort.current = new AbortController();
      setPetNote("");
      setSceneNote("");
      setKeepable(undefined);
      setNotice("");
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
      if (outcome.kind === "baseline" || outcome.kind === "preview") setApplied({ name: themeName(outcome.kind === "baseline" ? outcome.themeId : outcome.plan.themeId), fixes: outcome.fixes ?? 0 });
      else setApplied(undefined);
      const k = keepFrom(outcome, tab.id, tab.url);
      setKeepable(k);
      setKept(false);
      if (k?.origin) {
        // One prompt, one flow: with the permission the theme is kept for the whole site right away; without it, this document only.
        if ((await grant) && (await commitKeep(k))) {
          setKept(true);
          setKeepable(undefined);
          badge(tab.id, "ON");
          void refreshSite();
        } else setNotice(S.popup.keepDenied);
      }
      const fresh = await loadSettings();
      if (outcome.kind === "baseline") void showArt(tab.id, fresh, sourceForTheme(outcome.themeId, prefersDark()));
      else if (outcome.kind === "preview") void showArt(tab.id, fresh, sourceForPlan(outcome.plan));
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
      // A fresh script instance (popup reopened, page navigated) still cleans up by markers; make sure there is one to ask.
      await ensureApplier(tab.id, true).catch(() => undefined);
      await runInPage(tab.id, "restore", undefined, true);
      badge(tab.id, "");
      // Restore also pauses automatic theming for this site until the user applies again, so a reload does not bring the theme back.
      const origin = tab.url ? originOf(tab.url) : undefined;
      if (origin && (await getSite(origin).catch(() => undefined))?.mode === "auto") await pauseSite(origin).catch(() => undefined);
      setKept(false);
      setApplied(undefined);
      setNotice("");
      void refreshSite();
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
      const applied = await createPageClient(tabId).applyTheme(baseline);
      // A theme already kept for this site goes back to the built-in one there too.
      if (kept && site?.origin && applied?.ok) {
        await enableAuto(site.origin, { plan: themeToPlan(baseline), fingerprint: site.record?.fingerprint ?? { hash: "00000000", seq: "" }, provider: "builtin", model: "builtin" }, tabId).catch(() => undefined);
        await refreshSite();
      }
      badge(tabId, kept ? "ON" : "");
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
      const look = lookFor(settings, sourceForPlan(outcome.plan));
      return { tabId, origin, kept: { plan: outcome.plan, fingerprint: outcome.fingerprint, provider: outcome.providerId ?? "builtin", model: outcome.model ?? "builtin", look } };
    }
    if (outcome.kind === "baseline" && outcome.plan && outcome.fingerprint) {
      const look = lookFor(settings, sourceForPlan(outcome.plan));
      return { tabId, origin, kept: { plan: outcome.plan, fingerprint: outcome.fingerprint, provider: "builtin", model: "builtin", look } };
    }
    return undefined;
  };

  /** One click: asks for this origin only, saves the theme and registers the auto script for it (the click is the user gesture). */
  /** Saves the theme and the repair rules found for it with the site and registers the auto script. True when it worked. */
  const commitKeep = async (k: { tabId: number; origin: string | undefined; kept: KeptPlan }): Promise<boolean> => {
    if (!k.origin) return false;
    let css = "";
    try {
      css = storableRepairCss((await runInPage<string>(k.tabId, "repairRules")) ?? "");
    } catch {
      css = "";
    }
    const r = await enableAuto(k.origin, css ? { ...k.kept, repairCss: css } : k.kept, k.tabId).catch(() => ({ ok: false }));
    return r.ok;
  };

  /** The button that stays after a refused permission: asks again, from this click. */
  const keepOnSite = async () => {
    if (!keepable) return;
    if (!keepable.origin) return setView({ state: "idle", note: S.popup.keepNoOrigin });
    const k = keepable;
    if (await commitKeep(k)) {
      badge(k.tabId, "ON");
      setKeepable(undefined);
      setKept(true);
      setNotice("");
      setView({ state: "idle", note: S.popup.keepDone });
    } else setNotice(S.popup.keepDenied);
    await refreshSite();
  };

  const busy = view.state === "working" || view.state === "consent";
  const hints = browserHints();
  const page = shortcutsPage(hints.userAgent, hints.brave);

  const stage = view.state === "working" ? STAGE_OF[view.step] : -1;
  const headBanner = view.state === "error" || view.state === "blocked" ? "banner banner-error status-bad" : "banner banner-info";

  return (
    <main class="popup">
      <header class="popup-head">
        <h1>
          <Logo size={28} /> Skinly AI
        </h1>
        <p role="status" class={headBanner}>{statusText(view) || pageLine(site, settings)}</p>
      </header>

      {notice && <p class="banner banner-info" role="status">{notice}</p>}

      {view.state !== "consent" && (
        <div class="primary-actions">
          <Button kind="primary" onClick={() => void start()} disabled={busy}>{S.popup.change}</Button>
          <Button kind="quiet" onClick={() => void restore()} disabled={busy}>{S.popup.restore}</Button>
          {view.state === "working" && <Button kind="quiet" onClick={cancel}>{S.popup.cancel}</Button>}
        </div>
      )}
      {view.state === "working" && (
        <>
          <Spinner label="Working" />
          <ol class="stages" aria-label="Progress">
            {S.popup.stages.map((label, i) => (
              <li key={label} class={i < stage ? "done" : i === stage ? "now" : ""} aria-current={i === stage ? "step" : undefined}>
                {label}
              </li>
            ))}
          </ol>
        </>
      )}
      {applied && (view.state === "idle" || view.state === "preview") && <p class="banner banner-success" role="status">{S.popup.applied(applied.name, applied.fixes)}</p>}

      <fieldset class="themes">
        <legend>{S.popup.themeLegend}</legend>
        <div class="theme-grid">
          {THEMES.map((t) => (
            <label key={t.id} class={`theme-card${settings.theme === t.id ? " on" : ""}`}>
              <input type="radio" name="theme" value={t.id} checked={settings.theme === t.id} onChange={() => pickTheme(t.id)} />
              <span class="mini" aria-hidden="true" style={{ background: t.tokens.bg, borderColor: t.tokens.border }}>
                <i class="m-head" style={{ background: t.tokens.text }} />
                <i class="m-line" style={{ background: t.tokens.muted }} />
                <i class="m-line short" style={{ background: t.tokens.muted }} />
                <span class="m-row">
                  <i class="m-card" style={{ background: t.tokens.surface, borderColor: t.tokens.border }} />
                  <i class="m-btn" style={{ background: t.tokens.accent }} />
                </span>
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

      <section class="quick" aria-label={S.popup.quick}>
        <Toggle label={S.popup.petToggle} checked={settings.pet.enabled} onChange={(on) => updatePet({ ...settings.pet, enabled: on })} />
        <SceneOptions scene={settings.scene} onChange={(scene) => updateScene({ ...settings, scene })} />
        <p class="note" aria-live="polite">{sceneNote}</p>
      </section>

      <details class="acc" open={settings.pet.enabled}>
        <summary>{S.popup.petLegend}</summary>
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
      </details>

      {site && view.state !== "consent" && (
        <AssetHere
          initial={site.record?.look?.asset ?? settings.asset}
          onUse={(p) => useAssetHere(site.tabId, p, artSource.current ? (sceneRequest(settings, artSource.current)?.scene ?? null) : null)}
          onSave={async (p) => (await saveAssetForSite(site.origin, p)).ok}
        />
      )}

      {view.state === "consent" && (
        <section aria-label="Consent" class="consent">
          <p>{(view.req.purpose === "repair" ? repairConsentText : consentText)(view.req.providerNames.join(" or "))}</p>
          <div class="row">
            <Button kind="primary" onClick={() => answer(true)}>Send</Button>
            <Button onClick={cancel}>Cancel</Button>
            <Button kind="quiet" onClick={() => setShowPayload(!showPayload)}>Show what will be sent</Button>
          </div>
          {showPayload && <textarea readOnly aria-label="Payload" rows={8} value={view.req.payload} />}
        </section>
      )}

      {view.state === "preview" && (
        <section aria-label="Preview">
          <p>{view.outcome.message ?? "Here is the AI-improved theme."}</p>
          <div class="row">
            {kept ? <p class="note">{S.popup.keepDone}</p> : <Button onClick={() => void keepOnSite()} disabled={!keepable}>{S.popup.keep}</Button>}
            <Button kind="quiet" onClick={() => void undo(view.tabId, view.outcome.baselineThemeId)}>Undo</Button>
            <Button kind="quiet" onClick={() => void start()}>Try another</Button>
          </div>
        </section>
      )}

      {keepable && view.state === "idle" && (
        <section aria-label="Keep">
          <Button onClick={() => void keepOnSite()}>{S.popup.keep}</Button>
          <p class="note">{S.popup.keepNote}</p>
        </section>
      )}
      {site?.record && view.state !== "consent" && view.state !== "working" && (
        <section aria-label="This site">
          <p>{site.record.mode === "auto" ? `Automatic on this site (${providerLabel(site.record.provider)}).` : `Saved for this site (${providerLabel(site.record.provider)}).`}</p>
          <div class="row">
            {site.record.mode === "auto" && <Button kind="quiet" onClick={() => void siteAction(() => pauseSite(site.origin), "Paused on this site.", "Couldn't pause.")}>Pause on this site</Button>}
            <Button kind="quiet" onClick={() => void siteAction(() => forgetSite(site.origin, site.tabId), "Forgotten.", "Couldn't forget this site.")}>Forget this site</Button>
          </div>
        </section>
      )}

      {site && view.state !== "consent" && (
        <details class="acc">
          <summary>{S.privacy.title}</summary>
          <PrivacyTools tabId={site.tabId} origin={site.origin} record={site.record} onSaved={() => void refreshSite()} onToolUsed={() => void showPetHere()} />
        </details>
      )}

      <details class="acc" aria-label="Shortcuts">
        <summary>Keyboard shortcuts</summary>
        <section aria-label="Shortcuts">
          {commands.length > 0 && (
            <ul>
              {commands.map((c) => (
                <li key={c.name}>{shortcutLine(c, page)}</li>
              ))}
            </ul>
          )}
          <p class="note">To set or change a key, open {page} in the address bar.</p>
        </section>
      </details>
      <details class="acc sent">
        <summary>{S.popup.sentSummary}</summary>
        <p class="note">{S.popup.sentBody}</p>
      </details>
      <footer>{S.app.notAffiliated}</footer>
    </main>
  );
}

/** Which of the three visible stages each step belongs to: Reading the page, Checking readability, Applying. */
const STAGE_OF: Record<Step, number> = { checking: 0, analysing: 0, consent: 1, asking: 1, repairing: 1, baseline: 2, applying: 2 };

const themeName = (id: string): string => THEMES.find((t) => t.id === id)?.name ?? "your theme";

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
