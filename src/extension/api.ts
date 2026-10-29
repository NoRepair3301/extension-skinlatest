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

export const hasOrigins = (origins: string[]): Promise<boolean> => chrome.permissions.contains({ origins });

export const sendMessage = <R = unknown>(message: unknown): Promise<R> => chrome.runtime.sendMessage(message) as Promise<R>;

export type MessageHandler = (message: unknown) => unknown;

/** Replies synchronously with the handler's return value; undefined means no reply. */
export const onMessage = (handler: MessageHandler): void => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const reply = handler(message);
    if (reply === undefined) return false;
    sendResponse(reply);
    return false;
  });
};

export type PageMethod = "applyTheme" | "applyPlan" | "analyze" | "restore";

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
