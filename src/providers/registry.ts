import { PROVIDER_IDS, PROVIDER_TIMEOUTS, type ProviderId } from "../config.ts";
import type { ErrorKind, GenerateRequest, Provider, Result, Usage } from "./types.ts";
import { RETRYABLE_KINDS } from "./types.ts";

/** Safety net for the whole pipeline: every provider may use its own overall time (src/config.ts). */
export const PIPELINE_BUDGET_MS = PROVIDER_IDS.reduce((sum, id) => sum + PROVIDER_TIMEOUTS[id].overallMs, 0);

export interface ProviderEntry {
  provider: Provider;
  model?: string;
  /** Everything for this provider (calls, retry, repair) must finish in this time, else the next provider is tried. */
  overallMs?: number;
}

export interface RegistryOptions {
  /** Overall budget for all providers and retries together. */
  budgetMs?: number;
  signal?: AbortSignal;
  /** Returns null when the answer is usable, otherwise reason codes (never provider text). */
  validate?: (json: unknown) => string[] | null;
  /** Called when a provider is given up on and another one will be tried. */
  onSwitch?: (from: ProviderId, kind: ErrorKind, next: ProviderId) => void;
}

export type RegistryResult =
  | { ok: true; json: unknown; providerId: ProviderId; model: string; usage?: Usage; repaired: boolean }
  | { ok: false; error: { kind: ErrorKind }; providerId?: ProviderId; tried: ProviderId[] };

type Base = Pick<GenerateRequest, "system" | "user">;

const safeCodes = (codes: string[]): string[] => codes.slice(0, 10).map((c) => c.replace(/[^a-zA-Z0-9._\[\]-]/g, "").slice(0, 40)).filter(Boolean);

/** The repair request carries only our own reason codes, never text from the rejected answer. */
export function repairRequest(req: Base, codes: string[]): Base {
  return { system: req.system, user: `${req.user}\n\nYour previous answer was rejected. Reason codes: ${safeCodes(codes).join(", ") || "unreadable"}. Return only the corrected JSON object.` };
}

/**
 * Walks the fallback order. rate, quota, server, timeout, network and blocked move on to the next provider;
 * auth stops and reports; bad-output (or a failed validate) gets one repair retry on the same provider, then moves on.
 */
export async function generate(req: Base, order: ProviderEntry[], opts: RegistryOptions = {}): Promise<RegistryResult> {
  const overall = new AbortController();
  let budgetHit = false;
  const timer = setTimeout(() => {
    budgetHit = true;
    overall.abort();
  }, opts.budgetMs ?? PIPELINE_BUDGET_MS);
  const onAbort = () => overall.abort();
  opts.signal?.addEventListener("abort", onAbort);
  if (opts.signal?.aborted) overall.abort();

  const tried: ProviderId[] = [];
  let last: ErrorKind = "auth";

  const fail = (kind: ErrorKind, providerId?: ProviderId): RegistryResult => {
    const k = kind === "aborted" && budgetHit ? "timeout" : kind;
    return providerId ? { ok: false, error: { kind: k }, providerId, tried } : { ok: false, error: { kind: k }, tried };
  };

  try {
    for (let idx = 0; idx < order.length; idx++) {
      const entry = order[idx]!;
      const { provider } = entry;
      const switchAway = (kind: ErrorKind) => {
        const next = order[idx + 1];
        if (next) opts.onSwitch?.(provider.id, kind, next.provider.id);
      };
      const model = entry.model || provider.defaultModel;
      tried.push(provider.id);

      // This provider's own time limit. Its signal also follows the overall one.
      const own = new AbortController();
      let ownHit = false;
      const ownTimer = entry.overallMs === undefined ? undefined : setTimeout(() => {
        ownHit = true;
        own.abort();
      }, entry.overallMs);
      const followOverall = () => own.abort();
      overall.signal.addEventListener("abort", followOverall);
      const call = (r: Base): Promise<Result> => provider.generate({ ...r, model, signal: own.signal });
      const timedOutHere = (): boolean => ownHit && !overall.signal.aborted;

      let repaired = false;
      let current: Base = req;
      try {
      for (;;) {
        if (overall.signal.aborted) return fail("aborted", provider.id);
        if (timedOutHere()) {
          last = "timeout";
          switchAway("timeout");
          break;
        }
        const res = await call(current);
        let badCodes: string[] | null = null;

        if (res.ok) {
          badCodes = opts.validate ? opts.validate(res.json) : null;
          if (badCodes === null) {
            const out: RegistryResult = { ok: true, json: res.json, providerId: provider.id, model, repaired };
            return res.usage ? { ...out, usage: res.usage } : out;
          }
        } else {
          const kind = res.error.kind;
          last = kind;
          if (kind === "auth") return fail("auth", provider.id);
          if (kind === "aborted") {
            if (!timedOutHere()) return fail("aborted", provider.id);
            last = "timeout";
            switchAway("timeout");
            break; // this provider ran out of its own time: next provider
          }
          if (RETRYABLE_KINDS.includes(kind)) {
            switchAway(kind);
            break; // next provider
          }
          badCodes = ["unreadable"]; // bad-output
        }

        if (repaired) {
          last = "bad-output";
          switchAway("bad-output");
          break; // repair already used on this provider: next provider
        }
        repaired = true;
        current = repairRequest(req, badCodes);
      }
      } finally {
        if (ownTimer !== undefined) clearTimeout(ownTimer);
        overall.signal.removeEventListener("abort", followOverall);
      }
    }
    return fail(last, undefined);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
