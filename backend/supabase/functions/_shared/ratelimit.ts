/**
 * Fixed-window rate limit per key (user id, or "anon" plus a coarse bucket for unauthenticated calls). In memory per function
 * instance: a best-effort brake that sits on top of Supabase Auth's own OTP limits. Bounded: at most MAX_KEYS keys are tracked.
 */
export const MAX_KEYS = 10_000;

export interface Limit {
  max: number;
  windowS: number;
}

export const LIMITS = {
  "get-entitlement": { max: 30, windowS: 3600 },
  "create-checkout": { max: 10, windowS: 3600 },
  "delete-account": { max: 3, windowS: 3600 },
  "billing-webhook": { max: 600, windowS: 60 },
  "test-checkout": { max: 20, windowS: 3600 },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

export interface RateLimiter {
  /** Counts one call. `ok: false` with the seconds until the window resets when over the limit. */
  hit(name: LimitName, key: string, nowS: number): { ok: true } | { ok: false; retryAfterS: number };
}

export function createRateLimiter(limits: Record<LimitName, Limit> = LIMITS): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(name, key, nowS) {
      const lim = limits[name];
      const id = `${name}:${key}`;
      let w = windows.get(id);
      if (!w || nowS - w.start >= lim.windowS) {
        if (!w && windows.size >= MAX_KEYS) {
          // drop the oldest window (insertion order) so memory stays bounded
          const first = windows.keys().next().value;
          if (first !== undefined) windows.delete(first);
        }
        w = { start: nowS, count: 0 };
        windows.set(id, w);
      }
      w.count++;
      if (w.count > lim.max) return { ok: false, retryAfterS: w.start + lim.windowS - nowS };
      return { ok: true };
    },
  };
}
