import type { Mock } from "vitest";

type Fn = Mock<(...args: any[]) => any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface BgApi {
  requestOrigins: Fn;
  hasOrigins: Fn;
  registerAutoScript: Fn;
  unregisterAutoScript: Fn;
  registeredScripts: Fn;
  storageSet: Fn;
  storageRemove: Fn;
  injectFiles: Fn;
}

/**
 * Stands in for the background (src/extension/background.ts) in popup tests that mock api.ts: a written intent is completed by the
 * keeper, as onStorageChanged does; registrations are remembered; the permission is granted when the last request said yes.
 * `settled()` waits for the last keep to finish.
 */
export function wireBackground(api: BgApi, store: Map<string, unknown>): { settled: () => Promise<unknown> } {
  const scripts = new Map<string, { id: string; matches: string[]; js: string[]; runAt: string }>();
  let done: Promise<unknown> = Promise.resolve();
  api.hasOrigins.mockImplementation(async () => {
    const last = api.requestOrigins.mock.results.at(-1);
    return last ? (await last.value) === true : false;
  });
  api.registerAutoScript.mockImplementation(async (id: string, matches: string[], js: string[]) => void scripts.set(id, { id, matches, js, runAt: "document_start" }));
  api.unregisterAutoScript.mockImplementation(async (id: string) => void scripts.delete(id));
  api.registeredScripts.mockImplementation(async (ids?: string[]) => [...scripts.values()].filter((s) => !ids || ids.includes(s.id)));
  api.storageRemove.mockImplementation(async (k: string) => void store.delete(k));
  api.injectFiles.mockResolvedValue(undefined);
  api.storageSet.mockImplementation(async (k: string, v: unknown) => {
    store.set(k, v);
    if (k === "intent") done = import("../../src/extension/keeper.ts").then((m) => m.completeIntent("changed"));
  });
  return { settled: () => done.catch(() => undefined) };
}
