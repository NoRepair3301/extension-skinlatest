import type { DiagKind } from "../core/diag.ts";

/**
 * Last line of defence for our own pages (popup, settings): a promise rejection nobody caught is recorded as the short kind
 * "unhandled" and goes no further. Every known async path catches its own errors; this only makes a missed one visible in
 * Copy diagnostics instead of the console. Returns the remover.
 */
export function catchUnhandled(win: Window, record: (kinds: DiagKind[]) => unknown): () => void {
  const on = (e: PromiseRejectionEvent) => {
    e.preventDefault();
    try {
      void Promise.resolve(record(["unhandled"])).catch(() => undefined);
    } catch {
      // recording must never throw either
    }
  };
  win.addEventListener("unhandledrejection", on);
  return () => win.removeEventListener("unhandledrejection", on);
}
