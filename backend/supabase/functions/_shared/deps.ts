import { createBillingProvider } from "./billing.ts";
import type { Deps } from "./handlers.ts";
import { consoleLogger, newRequestId, parseOrigins } from "./http.ts";
import { createRateLimiter } from "./ratelimit.ts";
import { createRestDb } from "./rest.ts";
import { importSigningKey, keyId } from "./token.ts";
import { fromB64 } from "./b64.ts";

type Env = (name: string) => string | undefined;

/** Picks `default` from a JSON key dictionary (SUPABASE_SECRET_KEYS, SUPABASE_PUBLISHABLE_KEYS), falling back to a legacy variable. */
export function pickKey(dict: string | undefined, legacy: string | undefined): string {
  try {
    const parsed: unknown = dict ? JSON.parse(dict) : undefined;
    const v = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>)["default"] : undefined;
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    // fall back
  }
  return legacy ?? "";
}

const limiter = createRateLimiter();
let signer: Promise<{ key: CryptoKey; kid: string } | undefined> | undefined;

/** Builds the handler dependencies from the function environment (docs/BACKEND_SETUP.md lists every name). Pure apart from `env`. */
export function depsFromEnv(env: Env, fetchFn: (input: string, init?: RequestInit) => Promise<Response>): Deps {
  const url = env("SUPABASE_URL") ?? "";
  const db = createRestDb({
    url,
    secretKey: pickKey(env("SUPABASE_SECRET_KEYS"), env("SUPABASE_SERVICE_ROLE_KEY")),
    publishableKey: pickKey(env("SUPABASE_PUBLISHABLE_KEYS"), env("SUPABASE_ANON_KEY")),
    fetch: fetchFn,
  });
  return {
    db,
    allowedOrigins: parseOrigins(env("ALLOWED_ORIGINS")),
    limiter,
    log: consoleLogger,
    requestId: newRequestId(),
    nowS: () => Math.floor(Date.now() / 1000),
    billing: createBillingProvider({
      BILLING_MODE: env("BILLING_MODE"),
      TEST_WEBHOOK_SECRET: env("TEST_WEBHOOK_SECRET"),
      TEST_CHECKOUT_SECRET: env("TEST_CHECKOUT_SECRET"),
      FUNCTIONS_BASE: url ? `${url.replace(/\/+$/, "")}/functions/v1` : undefined,
    }),
    testSessionSecret: env("BILLING_MODE") === "test" ? env("TEST_CHECKOUT_SECRET") : undefined,
  };
}

/** The signing key, imported once per instance. The key id is derived from ENTITLEMENT_PUBLIC_KEY, so it always matches the extension's. */
export function loadSigner(env: Env): Promise<{ key: CryptoKey; kid: string } | undefined> {
  signer ??= (async () => {
    const priv = env("ENTITLEMENT_PRIVATE_KEY");
    const pub = fromB64((env("ENTITLEMENT_PUBLIC_KEY") ?? "").trim());
    if (!priv || !pub) return undefined;
    return { key: await importSigningKey(priv), kid: await keyId(pub) };
  })().catch(() => undefined);
  return signer;
}
