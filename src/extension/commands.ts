import { applyFailureMessage, MSG, TOAST } from "../ai/messages.ts";
import { checkUrl } from "../analyzer/eligibility.ts";
import type { ActiveTab } from "./api.ts";
import { petConfig, type Settings } from "./settings.ts";
import { clampChoice, type PlanFlag } from "../core/entitlements.ts";

export const COMMANDS = ["transform-page", "restore-page", "open-palette", "toggle-blur-page", "toggle-pet"] as const;
export type CommandName = (typeof COMMANDS)[number];

export const isCommand = (v: unknown): v is CommandName => typeof v === "string" && (COMMANDS as readonly string[]).includes(v);

export interface CommandDeps {
  loadSettings(): Promise<Settings>;
  /** B4: the plan flag; a Plus theme choice without Plus applies the nearest free theme. Default plus (tests). */
  loadPlan?(): Promise<PlanFlag>;
  inject(tabId: number, file: string): Promise<void>;
  runApplier(tabId: number, method: "applyTheme" | "restore" | "syncPet" | "togglePet", arg?: unknown): Promise<unknown>;
  openPalette(tabId: number): Promise<void>;
  /** Calls a page tool of the injected applier; blurPage with no argument toggles the whole-page veil. */
  runTool(tabId: number, method: "blurPage"): Promise<unknown>;
  /** Shows a two-second extension-owned toast in the page. */
  toast(tabId: number, text: string): Promise<void>;
  /** The tab's address as the page sees it; used when the browser passes no URL with the command. */
  pageUrl(tabId: number): Promise<string | undefined>;
  setBadge(tabId: number, text: string): Promise<void>;
  setTitle(tabId: number, text: string): Promise<void>;
}

export const DEFAULT_TITLE = "Skinly AI";

/**
 * Keyboard commands. The shortcut grants activeTab for that tab, so injecting is allowed.
 * transform-page applies the built-in theme only: a shortcut cannot show the consent text, so it never calls an AI provider.
 * Every command that reaches a page ends with a two-second toast. Blocked pages (internal, store, PDF, blocklist) are never
 * injected into, so they cannot show one: they get the toolbar badge "!" and the action title instead.
 */
export async function handleCommand(deps: CommandDeps, command: CommandName, tab: ActiveTab | undefined): Promise<void> {
  if (!tab) return;
  const say = (text: string): Promise<void> => deps.toast(tab.id, text).catch(() => undefined);
  try {
    // The browser may omit the URL for a command. Ask the page itself (activeTab covers it) so the gate still runs.
    const url = tab.url ?? (await deps.pageUrl(tab.id).catch(() => undefined));
    const settings = await deps.loadSettings();
    const allowed = url !== undefined && checkUrl(url, settings.blocklist).allowed;

    if (command === "restore-page") {
      if (allowed) await deps.inject(tab.id, "applier.js").catch(() => undefined);
      await deps.runApplier(tab.id, "restore"); // always: take away anything we added, even if the page became blocked since
      await deps.setBadge(tab.id, "");
      await deps.setTitle(tab.id, DEFAULT_TITLE);
      if (allowed) await say(TOAST.restored);
      return;
    }
    if (!allowed) {
      await deps.setBadge(tab.id, "!");
      await deps.setTitle(tab.id, MSG.blocked);
      return;
    }
    await deps.setTitle(tab.id, DEFAULT_TITLE);

    if (command === "open-palette") {
      await deps.inject(tab.id, "palette.js");
      await deps.openPalette(tab.id);
      await say(TOAST.paletteOpen);
      return;
    }
    await deps.inject(tab.id, "applier.js");
    if (command === "toggle-pet") {
      // The user asked for this page, so the "enabled" setting does not matter; a site the user turned the pet off for stays off.
      const on = (await deps.runApplier(tab.id, "togglePet", petConfig(settings))) as boolean | undefined;
      await say(on === undefined ? TOAST.failed : on ? TOAST.petOn : TOAST.petOff);
      return;
    }
    if (command === "toggle-blur-page") {
      const state = (await deps.runTool(tab.id, "blurPage")) as { page?: boolean } | undefined;
      if (state === undefined) {
        await deps.setTitle(tab.id, applyFailureMessage(undefined));
        await say(TOAST.failed);
      } else {
        await deps.runApplier(tab.id, "syncPet", petConfig(settings)); // the pet also shows after a tool (when it is enabled)
        await say(state.page ? TOAST.blurOn : TOAST.blurOff);
      }
      return;
    }
    const plan: PlanFlag = deps.loadPlan ? await deps.loadPlan().catch((): PlanFlag => "free") : "plus";
    const r = (await deps.runApplier(tab.id, "applyTheme", clampChoice(settings.theme, plan))) as { ok?: boolean; reason?: string; detail?: string[] } | undefined;
    if (r?.ok) {
      await deps.setBadge(tab.id, "ON");
      await deps.runApplier(tab.id, "syncPet", petConfig(settings));
      await say(TOAST.themeApplied);
    } else {
      await deps.setBadge(tab.id, "!");
      await deps.setTitle(tab.id, applyFailureMessage(r));
      await say(TOAST.failed);
    }
  } catch {
    // Fail safe: the page stays as it was. The badge and title say so; a toast is tried last because injection may be what failed.
    await deps.setBadge(tab.id, "!").catch(() => undefined);
    await deps.setTitle(tab.id, MSG.commandFailed).catch(() => undefined);
    await say(TOAST.failed);
  }
}
