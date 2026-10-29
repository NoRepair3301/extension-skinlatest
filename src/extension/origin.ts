const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:[0-9]{1,5})?$/;

/** Returns the input only if it is exactly scheme + host (+ port): no path, query, fragment or credentials. */
export function toOrigin(input: unknown): string | undefined {
  if (typeof input !== "string" || input.length > 260 || !ORIGIN.test(input)) return undefined;
  try {
    return new URL(input).origin === input ? input : undefined;
  } catch {
    return undefined;
  }
}

/** The origin of a page URL (used when the user acts on the active tab). */
export function originOf(url: string): string | undefined {
  try {
    return toOrigin(new URL(url).origin);
  } catch {
    return undefined;
  }
}
