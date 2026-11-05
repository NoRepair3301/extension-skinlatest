import { useEffect, useRef, useState } from "preact/hooks";
import { applyUiTheme } from "../../ui/theme.ts";
import { Button, Spinner, Toggle } from "../../ui/components.tsx";
import { S } from "../../ui/strings.ts";
import { MSG, applyFailureMessage, consentText } from "../../ai/messages.ts";
import type { ConsentRequest, Outcome, Step } from "../../ai/pipeline.ts";
import { THEMES, resolveTheme, type BuiltinThemeId, type ThemeChoice } from "../../themes/index.ts";
import { PROVIDER_NAMES, type ProviderId } from "../../config.ts";
import { checkUrl } from "../../analyzer/eligibility.ts";
import { themeToPlan } from "../../plan/themeToPlan.ts";
import { browserHints, getCommands, hasOrigins, queryActiveTab, registeredScripts, requestOrigins, runInPage, setBadge, type RegisteredScript } from "../api.ts";
import { ensureApplier } from "../inject.ts";
import { createPageClient, runTransform } from "../flow.ts";
import { defaultSettings, loadSettings, petConfig, saveSettings, type Settings } from "../settings.ts";
import { showPetHere } from "../petActions.ts";
import { Logo } from "../Logo.tsx";
import { PetOptions } from "./PetOptions.tsx";
import { SceneOptions } from "../SceneOptions.tsx";
import { artStatus, showArtHere, updateArtHere } from "../sceneActions.ts";
import { parsePageDiag, whyNoArt, type PageDiag } from "../../core/diagReport.ts";
import type { DiagKind } from "../../core/diag.ts";
import { providerResultOf, recordErrors, recordProviderResult, savePageDiag } from "../diagStore.ts";
import { isOnline, useOnline } from "../../ui/online.ts";
import { lookFor, sceneRequest, sourceForPlan, sourceForTheme, type SceneSource } from "../sceneConfig.ts";
import { PrivacyTools } from "./PrivacyTools.tsx";
import { AssetHere } from "./AssetHere.tsx";
import { saveAssetForSite, useAssetHere } from "../assetActions.ts";
import { AUTO_FILES, forgetSite, matchFor, pauseSite, scriptId, type ActionResult, type KeptPlan } from "../siteActions.ts";
import { NO_LAYOUT, makeIntent, readIntent, writeIntent, type IntentStage } from "../intent.ts";
import type { AutoState } from "../../core/diag.ts";
import { shortcutLine, shortcutsPage, type CommandInfo } from "../shortcuts.ts";
import { getSite, isAutoOn, originOf, type SiteRecord } from "../sites.ts";
import { canUse, clampThemeId, type PlanFlag } from "../../core/entitlements.ts";
import { PlusDialog } from "./PlusDialog.tsx";
import { loadPlan } from "../planFlag.ts";

export const BLOCKED_MESSAGE = MSG.blocked;

const STEP_TEXT: Record<Step, string> = S.steps;

export type View =
  | { state: "idle"; note?: string }
  | { state: "blocked"; reason: string }
  | { state: "working"; step: Step; detail?: string }
  | { state: "consent"; req: ConsentRequest }
  | { state: "preview"; outcome: Extract<Outcome, { kind: "preview" }>; tabId: number }
  | { state: "error"; kind: string; message: string };

/** True when this origin's host permission is granted; false on any error. */
async function isGranted(origin: string): Promise<boolean> {
  try {
    return (await hasOrigins(matchFor(origin))) === true;
  } catch {
    return false;
  }
}

const badge = (tabId: number, text: string): void => {
  void setBadge(tabId, text).catch(() => undefined);
};

export function Popup() {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  /** Skinly Plus: the derived plan flag (never a token). Free until read. */
  const [planFlag, setPlanFlag] = useState<PlanFlag>("free");
  /** The locked theme the user clicked: opens the calm Plus dialog. */
  const [plusFor, setPlusFor] = useState<string | undefined>(undefined);
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
  const [whyArt, setWhyArt] = useState("");
  const [whyThemed, setWhyThemed] = useState("");
  /** The reopened popup found this origin's permission refused (A1a): Change my page then themes this page only, without asking again. */
  const deniedHere = useRef<string | undefined>(undefined);
  /** This origin's permission was already there when the popup opened: no prompt will show, so the popup themes the tab itself. */
  const grantedAtOpen = useRef<string | undefined>(undefined);
  const online = useOnline();
  /** What the page shows now (theme, plan scene, accent), so a changed setting can reach the art that is already there. */
  const artSource = useRef<SceneSource | undefined>(undefined);
  const artTab = useRef<number | undefined>(undefined);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [site, setSite] = useState<{ origin: string; tabId: number; record: SiteRecord | undefined } | undefined>(undefined);

  const refreshSite = async (): Promise<{ origin: string; tabId: number } | undefined> => {
    try {
      const tab = await queryActiveTab();
      const origin = tab?.url ? originOf(tab.url) : undefined;
      setSite(tab && origin ? { origin, tabId: tab.id, record: await getSite(origin) } : undefined);
      if (origin) grantedAtOpen.current = (await isGranted(origin)) ? origin : undefined;
      return tab && origin ? { origin, tabId: tab.id } : undefined;
    } catch {
      setSite(undefined);
      return undefined;
    }
  };

  /**
   * A1a: Edge closed the popup to show the permission prompt. If the user said no, the intent is still there without the permission:
   * say once, in one line, that the theme is for this page only, and do not ask again on the next click (Keep on this site asks).
   */
  const checkPendingIntent = async (here: { origin: string; tabId: number } | undefined) => {
    if (!here) return;
    try {
      const intent = await readIntent();
      if (!intent || intent.origin !== here.origin || intent.stage === "resume") return;
      if (await isGranted(here.origin)) return;
      deniedHere.current = here.origin;
      setNotice(S.popup.thisPageOnly);
      if (intent.kept) setKeepable({ tabId: here.tabId, origin: here.origin, kept: intent.kept });
      if (!intent.denied) await writeIntent({ ...intent, denied: true });
    } catch {
      // nothing pending
    }
  };

  useEffect(() => applyUiTheme(document, settings.theme), [settings.theme]);
  useEffect(() => {
    void loadSettings().then(setSettings).catch(() => recordErrors(["popup-error"]));
    void loadPlan().then(setPlanFlag);
    void refreshSite().then(checkPendingIntent);
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
    void saveSettings(next).catch(() => recordErrors(["popup-error"]));
    setPetNote("");
    updatePetInPage(next, site?.tabId);
  };

  const showPet = async () => {
    const r = await showPetHere();
    setPetNote(r.ok ? S.popup.petShown : r.why);
  };

  const petHereOff = site !== undefined && settings.pet.disabledOrigins.includes(site.origin);

  const prefersDark = (): boolean => globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches === true;

  /** Puts the chosen scene and picture on the page after a theme was applied (the user clicked a button). */
  const showArt = async (tabId: number, next: Settings, source: SceneSource) => {
    artSource.current = source;
    artTab.current = tabId;
    setSceneNote(artStatus(await showArtHere(tabId, next, source), sceneRequest(next, source) !== null));
  };

  /** Asks the page why there is (no) art, says it in one line, and keeps the snapshot for Copy diagnostics. Fixed words only. */
  const explainArt = async () => {
    const nothing = parsePageDiag({ theme: "none", art: "not-loaded" })!;
    try {
      const tab = await queryActiveTab();
      const d = tab ? await runInPage<{ page: PageDiag; errors: DiagKind[] }>(tab.id, "diag") : undefined;
      const page = parsePageDiag(d?.page) ?? nothing;
      setWhyArt(whyNoArt(page));
      if (d) void savePageDiag(page, Array.isArray(d.errors) ? d.errors : []);
    } catch {
      setWhyArt(whyNoArt(nothing));
    }
  };

  const updateScene = (next: Settings) => {
    setSettings(next);
    void saveSettings(next).catch(() => recordErrors(["popup-error"]));
    setSceneNote("");
    const tabId = artTab.current;
    const source = artSource.current;
    if (tabId !== undefined && source) void updateArtHere(tabId, next, source).then((r) => setSceneNote(artStatus(r, sceneRequest(next, source) !== null)));
  };

  const pickTheme = (theme: ThemeChoice) => {
    const next = { ...settings, theme };
    setSettings(next);
    void saveSettings(next).catch(() => recordErrors(["popup-error"]));
  };

  const askPermission = (origin: string): Promise<boolean> => {
    try {
      return Promise.resolve(requestOrigins(matchFor(origin))).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  };

  /** The built-in theme the user picked, as a plan: all that is known inside the click, before the page is read. */
  const clickKept = (s: Settings): KeptPlan => {
    const plan = themeToPlan(clampThemeId(resolveTheme(s.theme, prefersDark()), planFlag));
    return { plan, fingerprint: NO_LAYOUT, provider: "builtin", model: "builtin", look: lookFor(s, sourceForPlan(plan)) };
  };

  /**
   * A1a. Inside the click the popup does two things only: it writes the pending intent (not awaited, so the request stays inside the user's
   * gesture) and requests this origin's permission as its first awaited call. Edge may close the popup right here; the background then
   * saves the site, registers the auto files and themes the tab (src/extension/keeper.ts). True when the permission is there.
   */
  const handOver = async (here: { origin: string; tabId: number }, stage: IntentStage, keptPlan: KeptPlan | undefined, popupApplies = grantedAtOpen.current === here.origin): Promise<boolean> => {
    const intent = makeIntent(here.origin, here.tabId, stage, keptPlan, Date.now(), popupApplies);
    if (!intent) return false;
    void writeIntent(intent).catch(() => recordErrors(["popup-error"]));
    return askPermission(here.origin);
  };

  const start = async () => {
    const here = site && checkUrl(`${site.origin}/`, settings.blocklist).allowed ? { origin: site.origin, tabId: site.tabId } : undefined;
    // Refused once already (reopened popup): this page only, no second prompt. Keep on this site asks again.
    const grant = here && deniedHere.current !== here.origin ? await handOver(here, "click", clickKept(settings)) : false;
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
      void recordProviderResult(!isOnline() && outcome.kind !== "preview" ? "offline" : providerResultOf(outcome));
      if (outcome.kind === "baseline" || outcome.kind === "preview") setApplied({ name: themeName(outcome.kind === "baseline" ? outcome.themeId : outcome.plan.themeId), fixes: outcome.fixes ?? 0 });
      else setApplied(undefined);
      const k = keepFrom(outcome, tab.id, tab.url);
      setKeepable(k);
      setKept(false);
      if (k?.origin) {
        // One prompt, one flow: with the permission the background keeps what is on the page now for the whole site; without it, this page only.
        if (grant && (await commitKeep(k))) {
          setKept(true);
          setKeepable(undefined);
          setSite((cur) => (cur && cur.origin === k.origin ? { ...cur, record: keptRecord(k.kept, cur.record) } : cur));
        } else setNotice(deniedHere.current === k.origin ? S.popup.thisPageOnly : S.popup.keepDenied);
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
      if (origin && isAutoOn(await getSite(origin).catch(() => undefined))) await pauseSite(origin).catch(() => undefined);
      setKept(false);
      setApplied(undefined);
      setNotice("");
      void refreshSite();
      setKeepable(undefined);
      artSource.current = undefined;
      setSceneNote("");
      setView({ state: "idle", note: S.popup.restored });
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
        const plan = themeToPlan(baseline);
        await commitKeep({ tabId, origin: site.origin, kept: { plan, fingerprint: NO_LAYOUT, provider: "builtin", model: "builtin", look: lookFor(settings, sourceForPlan(plan)) } });
      }
      badge(tabId, kept ? "ON" : "");
      setKeepable(undefined);
      void showArt(tabId, settings, sourceForTheme(baseline, prefersDark()));
      setView({ state: "idle", note: S.popup.backToBuiltin });
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

  /**
   * Hands what is on the page now (the plan) to the background as the final intent; the background saves it with the site. The
   * permission is already there (asked inside the click). True when the intent was written.
   */
  const commitKeep = async (k: { tabId: number; origin: string | undefined; kept: KeptPlan }): Promise<boolean> => {
    if (!k.origin) return false;
    const intent = makeIntent(k.origin, k.tabId, "final", k.kept, Date.now(), true);
    if (!intent) return false;
    try {
      await writeIntent(intent);
      return true;
    } catch {
      return false;
    }
  };

  /** The button that stays after a refused permission: asks again, from this click (the same two steps as Change my page). */
  const keepOnSite = async () => {
    if (!keepable) return;
    const k = keepable;
    if (!k.origin) return setView({ state: "idle", note: S.popup.keepNoOrigin });
    deniedHere.current = undefined;
    if (await handOver({ origin: k.origin, tabId: k.tabId }, "final", k.kept, true)) {
      setKeepable(undefined);
      setKept(true);
      setNotice("");
      setView({ state: "idle", note: S.popup.keepDone });
      setSite((cur) => (cur && cur.origin === k.origin ? { ...cur, record: keptRecord(k.kept, cur.record) } : cur));
    } else setNotice(S.popup.keepDenied);
  };

  /** Resume (A1e): the background applies the paused record again and brings its registration back. */
  const resume = async () => {
    if (!site?.record) return;
    deniedHere.current = undefined;
    const ok = await handOver({ origin: site.origin, tabId: site.tabId }, "resume", undefined, false).catch(() => false);
    setView({ state: "idle", note: ok ? S.popup.resumed : S.popup.resumeFailed });
    if (ok) setSite((cur) => (cur && cur.record ? { ...cur, record: { ...cur.record, mode: "auto", paused: false } } : cur));
  };

  /**
   * A2 "Why not themed here?": one line with a next step, from fixed state words only. What the popup can see (record, pause, permission,
   * registration) comes first; otherwise the page's auto script reports its own word. The word goes into Copy diagnostics.
   */
  const explainThemed = async () => {
    let state: AutoState = "not-run";
    let page: PageDiag | undefined;
    let errors: DiagKind[] = [];
    try {
      const tab = await queryActiveTab();
      const origin = tab?.url ? originOf(tab.url) : undefined;
      const record = origin ? await getSite(origin) : undefined;
      if (!tab || !origin || !record) state = "no-record";
      else if (!isAutoOn(record)) state = "paused";
      else if (!(await isGranted(origin))) state = "no-permission";
      else {
        let reg: RegisteredScript | undefined;
        try {
          [reg] = await registeredScripts([scriptId(origin)]);
        } catch {
          reg = undefined;
        }
        if (!reg || AUTO_FILES.some((f) => !reg.js.includes(f))) state = "not-registered";
        else {
          const d = await runInPage<{ page: PageDiag; errors: DiagKind[] }>(tab.id, "diag").catch(() => undefined);
          page = parsePageDiag(d?.page);
          errors = d && Array.isArray(d.errors) ? d.errors : [];
          state = page?.auto ?? "not-run";
        }
      }
    } catch {
      state = "not-run";
    }
    setWhyThemed(S.popup.why[state]);
    const snap = parsePageDiag({ ...(page ?? { theme: "none", art: "not-loaded" }), auto: state });
    if (snap) void savePageDiag(snap, errors).catch(() => undefined);
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
          <Logo size={28} /> {S.app.name}
        </h1>
        <p role="status" class={headBanner}>{statusText(view) || pageLine(site, settings)}</p>
      </header>

      {!online && <p class="banner banner-info" role="status">{S.popup.offline}</p>}
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
          {THEMES.map((t) => {
            const locked = !canUse(`theme:${t.id}`, planFlag);
            return (
            <label key={t.id} class={`theme-card${settings.theme === t.id ? " on" : ""}${locked ? " locked" : ""}`}>
              <input type="radio" name="theme" value={t.id} checked={settings.theme === t.id} onChange={() => (locked ? setPlusFor(t.name) : pickTheme(t.id))} />
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
              {locked && <span class="plus-mark">{S.plus.mark}</span>}
            </label>
            );
          })}
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
        <Button kind="quiet" onClick={() => void explainArt()}>{S.popup.whyArt}</Button>
        {whyArt && <p class="note" role="status">{whyArt}</p>}
        <Button kind="quiet" onClick={() => void explainThemed()}>{S.popup.whyThemed}</Button>
        {whyThemed && <p class="note" role="status">{whyThemed}</p>}
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
            {S.popup.petOffHere}
          </label>
        )}
        <PetOptions pet={settings.pet} onChange={updatePet} />
        <button type="button" onClick={() => void showPet()}>{S.popup.showPetHere}</button>
        <p class="note" aria-live="polite">{petNote}</p>
      </details>

      {site && view.state !== "consent" && !canUse("assets", planFlag) && (
        <p class="note">
          {S.plus.assetsLocked}{" "}
          <Button kind="quiet" onClick={() => setPlusFor(S.options.tabs.assets)}>{S.plus.mark}</Button>
        </p>
      )}
      {plusFor && <PlusDialog what={plusFor} onClose={() => setPlusFor(undefined)} />}
      {site && view.state !== "consent" && canUse("assets", planFlag) && (
        <AssetHere
          initial={site.record?.look?.asset ?? settings.asset}
          onUse={(p) => useAssetHere(site.tabId, p, artSource.current ? (sceneRequest(settings, artSource.current)?.scene ?? null) : null)}
          onSave={async (p) => (await saveAssetForSite(site.origin, p)).ok}
        />
      )}

      {view.state === "consent" && (
        <section aria-label={S.popup.consentLabel} class="consent">
          <p>{consentText(view.req.providerNames.join(" or "))}</p>
          <div class="row">
            <Button kind="primary" onClick={() => answer(true)}>{S.popup.send}</Button>
            <Button onClick={cancel}>{S.popup.cancel}</Button>
            <Button kind="quiet" onClick={() => setShowPayload(!showPayload)}>{S.popup.showPayload}</Button>
          </div>
          {showPayload && <textarea readOnly aria-label={S.popup.payloadLabel} rows={8} value={view.req.payload} />}
        </section>
      )}

      {view.state === "preview" && (
        <section aria-label={S.popup.previewLabel}>
          <p>{view.outcome.message ?? S.popup.previewDefault}</p>
          <div class="row">
            {kept ? <p class="note">{S.popup.keepDone}</p> : <Button onClick={() => void keepOnSite()} disabled={!keepable}>{S.popup.keep}</Button>}
            <Button kind="quiet" onClick={() => void undo(view.tabId, view.outcome.baselineThemeId)}>{S.popup.undo}</Button>
            <Button kind="quiet" onClick={() => void start()}>{S.popup.tryAnother}</Button>
          </div>
        </section>
      )}

      {keepable && view.state === "idle" && (
        <section aria-label={S.popup.keepLabel}>
          <Button onClick={() => void keepOnSite()}>{S.popup.keep}</Button>
          <p class="note">{S.popup.keepNote}</p>
        </section>
      )}
      {site?.record && view.state !== "consent" && view.state !== "working" && (
        <section aria-label={S.popup.thisSite}>
          <p>{site.record.paused ? S.popup.pausedLine : site.record.mode === "auto" ? S.popup.siteAutoWith(providerLabel(site.record.provider)) : S.popup.siteSavedWith(providerLabel(site.record.provider))}</p>
          <div class="row">
            {site.record.paused && <Button onClick={() => void resume()}>{S.popup.resume}</Button>}
            {isAutoOn(site.record) && <Button kind="quiet" onClick={() => void siteAction(() => pauseSite(site.origin), S.popup.paused, S.popup.pauseFailed)}>{S.popup.pause}</Button>}
            <Button kind="quiet" onClick={() => void siteAction(() => forgetSite(site.origin, site.tabId), S.popup.forgotten, S.popup.forgetFailed)}>{S.popup.forget}</Button>
          </div>
        </section>
      )}

      {site && view.state !== "consent" && (
        <details class="acc">
          <summary>{S.privacy.title}</summary>
          <PrivacyTools tabId={site.tabId} origin={site.origin} record={site.record} onSaved={() => void refreshSite()} onToolUsed={() => void showPetHere()} />
        </details>
      )}

      <details class="acc" aria-label={S.popup.shortcutsLabel}>
        <summary>{S.popup.shortcuts}</summary>
        <section aria-label={S.popup.shortcutsLabel}>
          {commands.length > 0 && (
            <ul>
              {commands.map((c) => (
                <li key={c.name}>{shortcutLine(c, page)}</li>
              ))}
            </ul>
          )}
          <p class="note">{S.popup.shortcutHow(page)}</p>
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

/** What the popup shows for the site right after handing a keep to the background (the background writes the real record). */
function keptRecord(k: KeptPlan, previous: SiteRecord | undefined): SiteRecord {
  return { v: 1, plan: k.plan, fingerprint: k.fingerprint, provider: k.provider, model: k.model, promptVersion: previous?.promptVersion ?? "", savedAt: new Date().toISOString(), mode: "auto", blur: previous?.blur ?? [], blurImages: previous?.blurImages ?? false };
}

/** Which of the three visible stages each step belongs to: Reading the page, Checking readability, Applying. */
const STAGE_OF: Record<Step, number> = { checking: 0, analysing: 0, consent: 1, asking: 1, baseline: 2, applying: 2 };

const themeName = (id: string): string => THEMES.find((t) => t.id === id)?.name ?? S.popup.yourTheme;

const providerLabel = (id: string): string => (id in PROVIDER_NAMES ? PROVIDER_NAMES[id as ProviderId] : S.popup.builtinTheme);

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
  if (site.record) return site.record.paused ? S.popup.pausedLine : site.record.mode === "auto" ? S.popup.siteAuto : S.popup.siteSaved;
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
