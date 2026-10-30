/**
 * A small in-memory stand-in for the chrome.* APIs that src/extension/api.ts uses. It keeps the browser's event order:
 * a storage write fires storage.onChanged after it is stored, a granted permission fires permissions.onAdded before the
 * request resolves, and a content-script registration stays until it is removed. `prompt` decides what the user answers;
 * `popupDies` makes the request promise never resolve, the way Edge closes the popup when it shows the prompt.
 */
type Listener<A extends unknown[]> = (...args: A) => unknown;

class Ev<A extends unknown[]> {
  readonly listeners: Array<Listener<A>> = [];
  addListener(l: Listener<A>): void {
    this.listeners.push(l);
  }
  removeListener(l: Listener<A>): void {
    const i = this.listeners.indexOf(l);
    if (i >= 0) this.listeners.splice(i, 1);
  }
  hasListeners(): boolean {
    return this.listeners.length > 0;
  }
  async fire(...args: A): Promise<void> {
    for (const l of [...this.listeners]) await l(...args);
  }
}

export interface Registered {
  id: string;
  matches: string[];
  js: string[];
  runAt?: string;
  persistAcrossSessions?: boolean;
}

export interface ExecCall {
  tabId: number;
  allFrames: boolean;
  files?: string[];
  func?: string;
  args?: unknown[];
}

export interface FakeChromeOptions {
  /** What the user answers when a prompt is shown (default: allow). */
  prompt?: "allow" | "deny";
  /** The popup is closed when the prompt shows: the request promise never settles for the caller. */
  popupDies?: boolean;
  /** Origins already granted, as match patterns. */
  granted?: string[];
  /** Tabs by id with their URL. */
  tabs?: Record<number, string>;
  /** Called for `executeScript({files})`; may throw to simulate a refused injection. */
  onFiles?: (tabId: number, files: string[]) => void;
  /** Called for `executeScript({func})`; its return value is the top frame's result. */
  onFunc?: (tabId: number, func: (...a: unknown[]) => unknown, args: unknown[]) => unknown;
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export function createFakeChrome(opts: FakeChromeOptions = {}) {
  const store = new Map<string, unknown>();
  const granted = new Set<string>(opts.granted ?? []);
  const registered = new Map<string, Registered>();
  const exec: ExecCall[] = [];
  const log: string[] = [];
  const badges = new Map<number, string>();
  const tabs = new Map<number, string>(Object.entries(opts.tabs ?? {}).map(([k, v]) => [Number(k), v]));
  const pending: Array<Promise<unknown>> = [];

  const onChanged = new Ev<[Record<string, { oldValue?: unknown; newValue?: unknown }>, string]>();
  const onAdded = new Ev<[{ origins?: string[]; permissions?: string[] }]>();
  const onRemoved = new Ev<[{ origins?: string[]; permissions?: string[] }]>();
  const onInstalled = new Ev<[{ reason: string }]>();
  const onStartup = new Ev<[]>();
  const onMessage = new Ev<[unknown, { tab?: { id: number }; id?: string; url?: string }, (r: unknown) => void]>();
  const onCommand = new Ev<[string, { id?: number; url?: string } | undefined]>();

  /** Fires an event later, like the browser does, and keeps the promise so tests can wait for every listener. */
  const later = (f: () => Promise<void>): void => {
    pending.push(Promise.resolve().then(f));
  };

  const chrome = {
    runtime: {
      id: "skinly-test",
      onInstalled,
      onStartup,
      onMessage,
      getManifest: () => ({ version: "0.0.0" }),
      sendMessage: async (m: unknown) => {
        let reply: unknown;
        await onMessage.fire(m, { id: "skinly-test" }, (r) => (reply = r));
        return reply;
      },
      openOptionsPage: async () => undefined,
    },
    storage: {
      onChanged,
      local: {
        get: async (key: string | string[] | null) => {
          const keys = key === null ? [...store.keys()] : Array.isArray(key) ? key : [key];
          const out: Record<string, unknown> = {};
          for (const k of keys) if (store.has(k)) out[k] = clone(store.get(k));
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: clone(store.get(k)), newValue: clone(v) };
            store.set(k, clone(v));
          }
          log.push(`storage.set ${Object.keys(items).join(",")}`);
          later(() => onChanged.fire(changes, "local"));
        },
        remove: async (key: string | string[]) => {
          const changes: Record<string, { oldValue?: unknown }> = {};
          for (const k of Array.isArray(key) ? key : [key]) {
            if (!store.has(k)) continue;
            changes[k] = { oldValue: clone(store.get(k)) };
            store.delete(k);
          }
          log.push("storage.remove");
          if (Object.keys(changes).length > 0) later(() => onChanged.fire(changes, "local"));
        },
        clear: async () => {
          store.clear();
        },
      },
    },
    permissions: {
      onAdded,
      onRemoved,
      contains: async (p: { origins?: string[] }) => (p.origins ?? []).every((o) => granted.has(o)),
      getAll: async () => ({ origins: [...granted], permissions: [] }),
      remove: async (p: { origins?: string[] }) => {
        for (const o of p.origins ?? []) granted.delete(o);
        later(() => onRemoved.fire({ origins: p.origins ?? [] }));
        return true;
      },
      request: (p: { origins?: string[] }): Promise<boolean> => {
        log.push(`permissions.request ${(p.origins ?? []).join(",")}`);
        const origins = p.origins ?? [];
        const already = origins.every((o) => granted.has(o));
        let answer = already;
        if (!already) {
          answer = (opts.prompt ?? "allow") === "allow";
          if (answer) {
            for (const o of origins) granted.add(o);
            later(() => onAdded.fire({ origins }));
          }
        }
        if (!already && opts.popupDies) return new Promise<boolean>(() => undefined);
        return Promise.resolve(answer);
      },
    },
    scripting: {
      registerContentScripts: async (scripts: Registered[]) => {
        for (const s of scripts) {
          if (registered.has(s.id)) throw new Error(`Duplicate script ID '${s.id}'`);
          registered.set(s.id, clone(s));
        }
        log.push(`register ${scripts.map((s) => s.id).join(",")}`);
      },
      unregisterContentScripts: async (f?: { ids?: string[] }) => {
        const ids = f?.ids ?? [...registered.keys()];
        for (const id of ids) {
          if (!registered.has(id)) throw new Error(`Nonexistent script ID '${id}'`);
        }
        for (const id of ids) registered.delete(id);
        log.push(`unregister ${ids.join(",")}`);
      },
      getRegisteredContentScripts: async (f?: { ids?: string[] }) => [...registered.values()].filter((s) => !f?.ids || f.ids.includes(s.id)).map((s) => clone(s)),
      executeScript: async (d: { target: { tabId: number; allFrames?: boolean }; files?: string[]; func?: (...a: unknown[]) => unknown; args?: unknown[] }) => {
        const call: ExecCall = { tabId: d.target.tabId, allFrames: d.target.allFrames === true, ...(d.files ? { files: d.files } : {}), ...(d.func ? { func: d.func.name, args: d.args ?? [] } : {}) };
        exec.push(call);
        const url = tabs.get(d.target.tabId);
        if (url === undefined) throw new Error("No tab with id");
        const host = `${new URL(url).origin}/*`;
        if (!granted.has(host) && !activeTab.has(d.target.tabId)) throw new Error("Cannot access contents of the page");
        if (d.files) {
          opts.onFiles?.(d.target.tabId, d.files);
          return d.files.map(() => ({ frameId: 0, result: undefined }));
        }
        const result = d.func ? (opts.onFunc ? opts.onFunc(d.target.tabId, d.func, d.args ?? []) : d.func(...(d.args ?? []))) : undefined;
        return [{ frameId: 0, result }];
      },
    },
    tabs: {
      query: async () => [...tabs.entries()].slice(0, 1).map(([id, url]) => ({ id, url })),
      get: async (id: number) => {
        const url = tabs.get(id);
        if (url === undefined) throw new Error("No tab with id");
        return { id, url };
      },
      captureVisibleTab: async () => "data:image/png;base64,",
    },
    action: {
      setBadgeText: async (d: { tabId: number; text: string }) => void badges.set(d.tabId, d.text),
      setTitle: async () => undefined,
    },
    commands: { onCommand, getAll: async () => [] },
  };

  /** Tabs the user clicked the action on (activeTab grant). */
  const activeTab = new Set<number>();

  return {
    chrome,
    store,
    granted,
    registered,
    exec,
    log,
    badges,
    tabs,
    activeTab,
    events: { onChanged, onAdded, onRemoved, onInstalled, onStartup, onMessage, onCommand },
    /** Waits until every event fired so far, and every event those listeners fired, has run. */
    async settle(): Promise<void> {
      for (let i = 0; i < 50; i++) {
        const batch = pending.splice(0);
        if (batch.length === 0) {
          await new Promise((r) => setTimeout(r, 0));
          if (pending.length === 0) return;
          continue;
        }
        await Promise.all(batch);
      }
    },
    install(): void {
      (globalThis as unknown as { chrome: unknown }).chrome = chrome;
    },
  };
}

export type FakeChrome = ReturnType<typeof createFakeChrome>;
