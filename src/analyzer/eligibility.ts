import { BUILTIN_BLOCKLIST, INTERNAL_SCHEMES, WEB_STORES } from "../config.ts";
import type { BlockReason } from "../core/types.ts";

export type Eligibility = { allowed: true } | { allowed: false; reason: BlockReason };

const blocked = (reason: BlockReason): Eligibility => ({ allowed: false, reason });

/** Reduces a blocklist entry (host or origin) to a bare lowercase host. */
export const entryHost = (entry: string): string =>
  entry
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "");

/** Pure. The URL is inspected here and never stored. */
export function checkUrl(url: string, blocklist: readonly string[] = []): Eligibility {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return blocked("invalid");
  }
  if (INTERNAL_SCHEMES.includes(u.protocol)) return blocked("internal");
  if (u.protocol !== "https:" && u.protocol !== "http:") return blocked("scheme");

  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  for (const store of WEB_STORES) {
    const slash = store.indexOf("/");
    const storeHost = slash < 0 ? store : store.slice(0, slash);
    const hostMatch = host === storeHost || host.endsWith("." + storeHost);
    if (hostMatch && (slash < 0 || path.startsWith(store.slice(slash)))) return blocked("store");
  }
  if (path.endsWith(".pdf")) return blocked("pdf");

  for (const raw of [...BUILTIN_BLOCKLIST, ...blocklist]) {
    const h = entryHost(raw);
    if (h && (host === h || host.endsWith("." + h))) return blocked("blocklist");
  }
  return { allowed: true };
}
