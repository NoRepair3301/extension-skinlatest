import type { DiagKind } from "../core/diag.ts";
import { DIAG_KEY, parseDiag, pushErrors, type DiagRecord, type PageDiag, type ProviderResult } from "../core/diagReport.ts";
import { storageGet, storageSet } from "./api.ts";

/**
 * The diagnostics record in storage.local (key `diag`): the last page snapshot, the last DIAG_MAX caught errors as short kinds
 * and the last provider result kind. No origin, URL, text or key can be stored: every write goes through parseDiag.
 * Writes are queued so two scripts in one context never lose each other's update.
 */
let queue: Promise<unknown> = Promise.resolve();

const update = (fn: (rec: DiagRecord) => DiagRecord): Promise<void> => {
  const run = queue.then(async () => {
    const current = parseDiag(await storageGet(DIAG_KEY).catch(() => undefined));
    await storageSet(DIAG_KEY, parseDiag(fn(current)));
  });
  queue = run.catch(() => undefined);
  return run.catch(() => undefined);
};

export const loadDiag = async (): Promise<DiagRecord> => parseDiag(await storageGet(DIAG_KEY).catch(() => undefined));

/** Stores the snapshot of the page that was checked last, and the errors its scripts caught since they were last asked. */
export const savePageDiag = (page: PageDiag, errors: readonly DiagKind[] = []): Promise<void> => update((r) => ({ ...r, page, errors: pushErrors(r.errors, errors) }));

export const recordErrors = (errors: readonly DiagKind[]): Promise<void> => (errors.length ? update((r) => ({ ...r, errors: pushErrors(r.errors, errors) })) : Promise.resolve());

export const recordProviderResult = (provider: ProviderResult): Promise<void> => update((r) => ({ ...r, provider }));

/** Pure. The fixed word for how a "Change my page" ended (never a message, a model name or a value). */
export function providerResultOf(outcome: { kind: string; source?: string; why?: string; errorKind?: string }): ProviderResult {
  switch (outcome.kind) {
    case "preview":
      return outcome.source === "ai" ? "ok" : "fallback";
    case "baseline":
      return parseDiag({ provider: outcome.why }).provider ?? "baseline";
    case "error":
      return parseDiag({ provider: outcome.errorKind }).provider ?? "baseline";
    case "blocked":
      return "blocked";
    default:
      return "cancelled";
  }
}
