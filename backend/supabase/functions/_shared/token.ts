import { buf, fromB64, fromB64Url, fromUtf8, hex, toB64Url, utf8 } from "./b64.ts";

/**
 * The entitlement token: `base64url(header).base64url(payload).base64url(signature)`, Ed25519 (WebCrypto), header
 * `{alg:"EdDSA",typ:"skinly-ent",kid}`, payload `{plan,sub,iat,exp,kid}`. No email, no billing data. Valid 3 days.
 * The extension verifies it with the public key embedded at build time (src/backend/entitlement.ts mirrors `verifyEntitlement`).
 */
export const TOKEN_TTL_S = 3 * 24 * 60 * 60;
export type Plan = "free" | "plus";

export interface EntitlementClaims {
  plan: Plan;
  sub: string;
  iat: number;
  exp: number;
  kid: string;
}

const HEADER_TYP = "skinly-ent";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The key id: the first 16 hex characters of SHA-256 over the public key (SPKI DER). */
export async function keyId(spki: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", buf(spki)))).slice(0, 16);
}

/** Imports the private key from the secret: base64 PKCS#8 DER (scripts/gen-entitlement-keys.mjs writes it). */
export async function importSigningKey(pkcs8B64: string): Promise<CryptoKey> {
  const der = fromB64(pkcs8B64.trim());
  if (!der || der.length < 16) throw new Error("bad-key");
  return crypto.subtle.importKey("pkcs8", buf(der), { name: "Ed25519" }, false, ["sign"]);
}

export async function importVerifyKey(spkiB64: string): Promise<{ key: CryptoKey; kid: string }> {
  const der = fromB64(spkiB64.trim());
  if (!der || der.length < 16) throw new Error("bad-key");
  return { key: await crypto.subtle.importKey("spki", buf(der), { name: "Ed25519" }, false, ["verify"]), kid: await keyId(der) };
}

export async function signEntitlement(claims: { plan: Plan; sub: string }, key: CryptoKey, kid: string, nowS: number): Promise<string> {
  const header = { alg: "EdDSA", typ: HEADER_TYP, kid };
  const payload: EntitlementClaims = { plan: claims.plan, sub: claims.sub, iat: nowS, exp: nowS + TOKEN_TTL_S, kid };
  const head = `${toB64Url(utf8(JSON.stringify(header)))}.${toB64Url(utf8(JSON.stringify(payload)))}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, buf(utf8(head))));
  return `${head}.${toB64Url(sig)}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const json = (part: string): unknown => {
  try {
    const b = fromB64Url(part);
    return b ? JSON.parse(fromUtf8(b)) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Checks shape, header, key id and signature. Returns the claims (expiry is the caller's decision: the extension allows an offline grace)
 * or undefined for anything tampered, malformed or signed with another key. Never throws.
 */
export async function verifyEntitlement(token: unknown, key: CryptoKey, kid: string): Promise<EntitlementClaims | undefined> {
  try {
    if (typeof token !== "string" || token.length > 2048) return undefined;
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    const [h, p, s] = parts as [string, string, string];
    const header = json(h);
    const payload = json(p);
    if (!isObj(header) || header["alg"] !== "EdDSA" || header["typ"] !== HEADER_TYP || header["kid"] !== kid || Object.keys(header).length !== 3) return undefined;
    if (!isObj(payload)) return undefined;
    const { plan, sub, iat, exp } = payload;
    if ((plan !== "free" && plan !== "plus") || typeof sub !== "string" || !UUID.test(sub) || payload["kid"] !== kid) return undefined;
    if (!Number.isInteger(iat) || !Number.isInteger(exp) || (exp as number) - (iat as number) !== TOKEN_TTL_S) return undefined;
    const sig = fromB64Url(s);
    if (!sig || sig.length !== 64) return undefined;
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, buf(sig), buf(utf8(`${h}.${p}`)));
    return ok ? { plan, sub, iat: iat as number, exp: exp as number, kid } : undefined;
  } catch {
    return undefined;
  }
}
