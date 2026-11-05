// The only file that touches chrome.*. Everything else goes through this wrapper.

export interface ActiveTab {
  id: number;
  url: string | undefined;
}

export const storageGet = async <T = unknown>(key: string): Promise<T | undefined> => {
  const res = await chrome.storage.local.get(key);
  return res[key] as T | undefined;
};

export const storageSet = (key: string, value: unknown): Promise<void> => chrome.storage.local.set({ [key]: value });

export const storageRemove = (key: string): Promise<void> => chrome.storage.local.remove(key);

/** Calls back with the new value (undefined when removed) whenever `key` changes in storage.local. Wakes the service worker. */
export const onStorageChanged = (key: string, handler: (value: unknown) => void): void => {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && key in changes) handler(changes[key]?.newValue);
  });
};

/** Host permissions the user granted or removed (from our prompt, or later in the browser's site settings). Match patterns only. */
export const onOriginsAdded = (handler: (origins: string[]) => void): void => {
  chrome.permissions.onAdded.addListener((p) => handler(p.origins ?? []));
};

export const onOriginsRemoved = (handler: (origins: string[]) => void): void => {
  chrome.permissions.onRemoved.addListener((p) => handler(p.origins ?? []));
};

/**
 * True while our popup is open. Chrome keeps the popup open over the permission prompt (it then themes the tab itself); Edge closes it.
 * Browsers without runtime.getContexts count as closed, so the background themes the tab.
 */
export const popupOpen = async (): Promise<boolean> => {
  if (typeof chrome.runtime.getContexts !== "function") return false;
  const ctx = await chrome.runtime.getContexts({ contextTypes: ["POPUP" as chrome.runtime.ContextType] });
  return ctx.length > 0;
};

export const onStartup = (handler: () => void): void => {
  chrome.runtime.onStartup.addListener(handler);
};

export interface RegisteredScript {
  id: string;
  matches: string[];
  js: string[];
  runAt: string;
}

/** Our registered content scripts (all of them, or the given ids). */
export const registeredScripts = async (ids?: string[]): Promise<RegisteredScript[]> => {
  const all = await chrome.scripting.getRegisteredContentScripts(ids ? { ids } : undefined);
  return all.map((s) => ({ id: s.id, matches: s.matches ?? [], js: s.js ?? [], runAt: s.runAt ?? "document_idle" }));
};

/** Injects files into the top frame of a tab, in order, in one call (the registered auto files, for a tab that is already open). */
export const injectFiles = async (tabId: number, files: string[]): Promise<void> => {
  await chrome.scripting.executeScript({ target: { tabId }, files });
};

export const queryActiveTab = async (): Promise<ActiveTab | undefined> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return undefined;
  return { id: tab.id, url: tab.url };
};

/**
 * Injects a script file. With `allFrames` it goes into every frame the browser lets it into; the script decides per frame
 * (src/extension/frames.ts) and stays out of cross-origin ones. If the browser refuses the frames request, the top frame alone is injected.
 */
export const injectFile = async (tabId: number, file: string, allFrames = false): Promise<void> => {
  if (allFrames) {
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [file] });
      return;
    } catch {
      // fall back to the top frame below
    }
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
};

export const requestOrigins = (origins: string[]): Promise<boolean> => chrome.permissions.request({ origins });

export const removeOrigins = (origins: string[]): Promise<boolean> => chrome.permissions.remove({ origins });

export const hasOrigins = (origins: string[]): Promise<boolean> => chrome.permissions.contains({ origins });

export const sendMessage = <R = unknown>(message: unknown): Promise<R> => chrome.runtime.sendMessage(message) as Promise<R>;

/** `senderTabId` is set when the message comes from a content script in a tab. */
export type MessageHandler = (message: unknown, senderTabId?: number) => unknown;

/** Replies synchronously with the handler's return value; undefined means no reply. Messages from other extensions are ignored. */
export const onMessage = (handler: MessageHandler): void => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    const reply = handler(message, sender.tab?.id);
    if (reply === undefined) return false;
    sendResponse(reply);
    return false;
  });
};

/** Registers the auto-apply script for exactly the given match patterns, replacing an older registration with the same id. */
export const registerAutoScript = async (id: string, matches: string[], file: string | string[]): Promise<void> => {
  await unregisterAutoScript(id);
  await chrome.scripting.registerContentScripts([{ id, matches, js: Array.isArray(file) ? file : [file], runAt: "document_start", persistAcrossSessions: true }]);
};

export const unregisterAutoScript = async (id: string): Promise<void> => {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch {
    // not registered
  }
};

export const setBadge = async (tabId: number, text: string): Promise<void> => {
  await chrome.action.setBadgeText({ tabId, text });
};

export const setTitle = async (tabId: number, title: string): Promise<void> => {
  await chrome.action.setTitle({ tabId, title });
};

/** Runs the callback for each keyboard command; the tab is the one the shortcut was pressed in. */
export const onCommand = (handler: (command: string, tab: ActiveTab | undefined) => void): void => {
  chrome.commands.onCommand.addListener((command, tab) => {
    handler(command, tab && tab.id !== undefined ? { id: tab.id, url: tab.url } : undefined);
  });
};

/** Shows a toast through the page script that applier.js or palette.js registered; does nothing when there is none. */
export const showToast = async (tabId: number, text: string): Promise<void> => {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (t: string) => (globalThis as unknown as { skinlyToast?: (x: string) => void }).skinlyToast?.(t),
    args: [text],
  });
};

/** The address of the tab as the page sees it, for the gate when the browser did not pass a URL with a command. Needs the activeTab grant. */
/** Runs in the page: its address (read in memory by the caller, never stored). */
function pageHref(): string {
  return location.href;
}

export const getPageUrl = async (tabId: number): Promise<string | undefined> => {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: pageHref });
  return typeof res?.result === "string" ? res.result : undefined;
};

/** Every command of this extension with the key the browser actually assigned ("" when none). */
export const getCommands = async (): Promise<Array<{ name: string; description: string; shortcut: string }>> => {
  const all = await chrome.commands.getAll();
  return all.map((c) => ({ name: c.name ?? "", description: c.description ?? "", shortcut: c.shortcut ?? "" }));
};

/** Browser family hints for the shortcuts page address. */
export const browserHints = (): { userAgent: string; brave: boolean } => ({
  userAgent: navigator.userAgent,
  brave: typeof (navigator as unknown as { brave?: unknown }).brave !== "undefined",
});

/** Opens the palette that palette.js registered in the tab. */
export const openPaletteInPage = async (tabId: number): Promise<void> => {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (globalThis as unknown as { skinlyPalette?: { open(): void } }).skinlyPalette?.open(),
  });
};

export type ToolMethod = "blurTargets" | "blurShare" | "blurPage" | "blurState" | "pickStart" | "pickStop" | "tablesEnable" | "tablesFilter" | "tablesRestoreOrder";

/** Calls a privacy or table tool of the applier script already injected in the tab. */
export const runTool = async <R = unknown>(tabId: number, method: ToolMethod, ...args: unknown[]): Promise<R | undefined> => {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (m: string, a: unknown[]) => {
      const tools = (globalThis as unknown as { skinlyTools?: Record<string, (...x: unknown[]) => unknown> }).skinlyTools;
      return tools?.[m]?.(...a);
    },
    args: [method, args],
  });
  return res?.result as R | undefined;
};

/** PNG data URL of the visible area of the tab's window. Needs the activeTab grant from the user's click. */
export const captureVisible = (): Promise<string> => chrome.tabs.captureVisibleTab({ format: "png" });

export type PageMethod = "applyTheme" | "apply" | "analyze" | "restore" | "syncPet" | "updatePet" | "togglePet" | "isActive" | "shownTheme" | "diag";

const callApplier = (m: string, a?: unknown): unknown => {
  const applier = (globalThis as unknown as { skinlyApplier?: Record<string, (x?: unknown) => unknown> }).skinlyApplier;
  return applier?.[m]?.(a);
};

/**
 * Calls a method of the applier already injected in the tab and returns the top frame's (serialisable) result.
 * With `allFrames` the same call also runs in every same-origin frame that has an applier; their results are not read,
 * because each frame keeps its own ledger and rolls itself back.
 */
export const runInPage = async <R = unknown>(tabId: number, method: PageMethod, arg?: unknown, allFrames = false): Promise<R | undefined> => {
  const run = (target: { tabId: number; allFrames?: boolean }) => chrome.scripting.executeScript({ target, func: callApplier, args: [method, arg] });
  let results: Awaited<ReturnType<typeof run>>;
  if (allFrames) {
    try {
      results = await run({ tabId, allFrames: true });
    } catch {
      results = await run({ tabId });
    }
  } else {
    results = await run({ tabId });
  }
  const top = results.find((r) => r.frameId === 0) ?? results[0];
  return top?.result as R | undefined;
};

export type SceneMethod = "sync" | "update" | "status";

/** Calls the scene script (scene.js) already injected in the tab. Returns what it reports, or undefined when it is not there. */
export const runScene = async <R = unknown>(tabId: number, method: SceneMethod, arg?: unknown): Promise<R | undefined> => {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (m: string, a: unknown) => {
      const scene = (globalThis as unknown as { skinlyScene?: Record<string, (x?: unknown) => unknown> }).skinlyScene;
      return scene?.[m]?.(a);
    },
    args: [method, arg ?? null],
  });
  return res?.result as R | undefined;
};

/** Wipes extension storage (settings, keys, sites, assets). Used only by "Erase all Skinly data". */
export const clearAllStorage = (): Promise<void> => chrome.storage.local.clear();

/** Drops every optional host permission the user granted. */
export const removeAllOrigins = async (): Promise<void> => {
  const p = await chrome.permissions.getAll();
  if (p.origins && p.origins.length > 0) await chrome.permissions.remove({ origins: p.origins });
};

/** Runs the callback when the extension is installed or updated, with the reason. */
export const onInstalled = (handler: (reason: string) => void): void => {
  chrome.runtime.onInstalled.addListener((d) => handler(d.reason));
};

export const openOptionsPage = (): Promise<void> => chrome.runtime.openOptionsPage();

export const extensionVersion = (): string => chrome.runtime.getManifest().version;
