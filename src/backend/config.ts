/**
 * Plus build configuration (docs/PLUS_SPEC.md 6), from the build environment only. Missing or malformed values mean
 * "Plus not available in this build": no network call is ever made and everything Free works as before.
 */
export interface BackendConfig {
  /** https://<project-ref>.supabase.co */
  url: string;
  /** The publishable key (sb_publishable_...) or the legacy anon key: public by design, sent in the `apikey` header. */
  anonKey: string;
  /** Base64 SPKI of the Ed25519 key that signs entitlement tokens. */
  pubkey: string;
}

export interface BuildEnv {
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_ANON_KEY?: string | undefined;
  VITE_ENTITLEMENT_PUBKEY?: string | undefined;
}

const URL_RE = /^https:\/\/[a-z0-9-]{3,63}\.supabase\.co$/;

export function parseConfig(env: BuildEnv): BackendConfig | undefined {
  const url = (env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  const pubkey = (env.VITE_ENTITLEMENT_PUBKEY ?? "").trim();
  if (!URL_RE.test(url)) return undefined;
  if (!/^[A-Za-z0-9._-]{20,2048}$/.test(anonKey)) return undefined;
  if (!/^[A-Za-z0-9+/]{40,200}={0,2}$/.test(pubkey)) return undefined;
  return { url, anonKey, pubkey };
}

/** The configuration baked into this build (Vite replaces the names at build time), or undefined. */
export const buildConfig = (): BackendConfig | undefined =>
  parseConfig({ VITE_SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY, VITE_ENTITLEMENT_PUBKEY: import.meta.env?.VITE_ENTITLEMENT_PUBKEY });
