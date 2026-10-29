import { MSG } from "../ai/messages.ts";
import { checkUrl } from "../analyzer/eligibility.ts";
import type { ActiveTab } from "./api.ts";
import type { Settings } from "./settings.ts";

export const COMMANDS = ["transform-page", "restore-page", "open-palette"] as const;
export type CommandName = (typeof COMMANDS)[number];

export const isCommand = (v: unknown): v is CommandName => typeof v === "string" && (COMMANDS as readonly string[]).includes(v);

export interface CommandDeps {
  loadSettings(): Promise<Settings>;
  inject(tabId: number, file: string): Promise<void>;
  runApplier(tabId: number, method: "applyTheme" | "restore" | "syncPet", arg?: unknown): Promise<unknown>;
  openPalette(tabId: number): Promise<void>;
  setBadge(tabId: number, text: string): Promise<void>;
  setTitle(tabId: number, text: string): Promise<void>;
}

export const DEFAULT_TITLE = "Skinly AI";

/**
 * Keyboard commands. The shortcut grants activeTab for that tab, so injecting is allowed.
 * transform-page applies the built-in theme only: a shortcut cannot show the consent text, so it never calls an AI provider.
 */
export async function handleCommand(deps: CommandDeps, command: CommandName, tab: ActiveTab | undefined): Promise<void> {
  if (!tab) return;
  try {
    if (command === "restore-page") {
      await deps.runApplier(tab.id, "restore");
      await deps.setBadge(tab.id, "");
      await deps.setTitle(tab.id, DEFAULT_TITLE);
      return;
    }
    const settings = await deps.loadSettings();
    if (!tab.url || !checkUrl(tab.url, settings.blocklist).allowed) {
      await deps.setBadge(tab.id, "!");
      await deps.setTitle(tab.id, MSG.blocked);
      return;
    }
    await deps.setTitle(tab.id, DEFAULT_TITLE);
    if (command === "open-palette") {
      await deps.inject(tab.id, "palette.js");
      await deps.openPalette(tab.id);
      return;
    }
    await deps.inject(tab.id, "applier.js");
    const r = (await deps.runApplier(tab.id, "applyTheme", settings.theme)) as { ok?: boolean } | undefined;
    if (r?.ok) {
      await deps.setBadge(tab.id, "ON");
      await deps.runApplier(tab.id, "syncPet", settings.pet);
    } else {
      await deps.setBadge(tab.id, "!");
      await deps.setTitle(tab.id, MSG.baselineFailed);
    }
  } catch {
    // Fail safe: the page stays as it was.
    await deps.setBadge(tab.id, "!").catch(() => undefined);
  }
}

