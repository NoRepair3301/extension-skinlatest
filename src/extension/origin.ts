/** Scheme + host (name, IPv4 or bracketed IPv6) + optional port. Names are already lower case and punycode once URL parsed them. */
const ORIGIN = /^https?:\/\/(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(:[0-9]{1,5})?$/;

/** How a site is known everywhere: the storage key of its record and the one match pattern we request and register for it. */
export interface SiteKey {
  /** The origin: scheme + host + port (default ports dropped): scheme, host name or bracketed IPv6, port. */
  key: string;
  /** `<origin>/*`: this origin only, no other subdomain, scheme or port. */
  pattern: string;
}

/**
 * The one function that turns an origin or a page URL into a site key and match pattern. Used for saving, reading and registering, so the
 * three always agree. Accepts http(s) only; returns undefined for anything else (file:, data:, browser pages, credentials in the URL).
 */
export function siteKey(input: unknown): SiteKey | undefined {
  if (typeof input !== "string" || input.length === 0 || input.length > 2048) return undefined;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.username !== "" || url.password !== "") return undefined;
  const key = url.origin;
  if (key.length > 260 || !ORIGIN.test(key)) return undefined;
  return { key, pattern: `${key}/*` };
}

/** Returns the input only if it is exactly scheme + host (+ port): no path, query, fragment or credentials. */
export function toOrigin(input: unknown): string | undefined {
  const k = siteKey(input);
  return k && k.key === input ? k.key : undefined;
}

/** The origin of a page URL (used when the user acts on the active tab). */
export function originOf(url: string): string | undefined {
  return siteKey(url)?.key;
}
