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

export const queryActiveTab = async (): Promise<ActiveTab | undefined> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return undefined;
  return { id: tab.id, url: tab.url };
};

export const injectFile = async (tabId: number, file: string): Promise<void> => {
  await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
};

export const requestOrigins = (origins: string[]): Promise<boolean> => chrome.permissions.request({ origins });

export const removeOrigins = (origins: string[]): Promise<boolean> => chrome.permissions.remove({ origins });

export const hasOrigins = (origins: string[]): Promise<boolean> => chrome.permissions.contains({ origins });

export const sendMessage = <R = unknown>(message: unknown): Promise<R> => chrome.runtime.sendMessage(message) as Promise<R>;

/** `senderTabId` is set when the message comes from a content script in a tab. */
export type MessageHandler = (message: unknown, senderTabId?: number) => unknown;

/** Replies synchronously with the handler's return value; undefined means no reply. */
export const onMessage = (handler: MessageHandler): void => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const reply = handler(message, sender.tab?.id);
    if (reply === undefined) return false;
    sendResponse(reply);
    return false;
  });
};

/** Registers the auto-apply script for exactly the given match patterns, replacing an older registration with the same id. */
export const registerAutoScript = async (id: string, matches: string[], file: string): Promise<void> => {
  await unregisterAutoScript(id);
  await chrome.scripting.registerContentScripts([{ id, matches, js: [file], runAt: "document_start", persistAcrossSessions: true }]);
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

export type PageMethod = "applyTheme" | "apply" | "analyze" | "restore" | "syncPet";

/** Calls a method of the applier already injected in the tab and returns its (serialisable) result. */
export const runInPage = async <R = unknown>(tabId: number, method: PageMethod, arg?: unknown): Promise<R | undefined> => {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (m: string, a?: unknown) => {
      const applier = (globalThis as unknown as { skinlyApplier?: Record<string, (x?: unknown) => unknown> }).skinlyApplier;
      return applier?.[m]?.(a);
    },
    args: [method, arg],
  });
  return res?.result as R | undefined;
};
