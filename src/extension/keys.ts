import { PROVIDER_IDS, providerOrigin, type ProviderId } from "../config.ts";
import { createProviders } from "../providers/index.ts";
import type { ErrorKind } from "../providers/types.ts";
import { requestOrigins, storageGet, storageSet } from "./api.ts";

export type Keys = Partial<Record<ProviderId, string>>;

const KEY = "keys";
const MAX_KEY_LENGTH = 512;
export const MASK = "••••••••";

/** Reads the stored keys, ignoring anything that is not a plain non-empty string. */
export async function readKeys(): Promise<Keys> {
  const raw = await storageGet<unknown>(KEY);
  const out: Keys = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const id of PROVIDER_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "string" && v.length > 0 && v.length <= MAX_KEY_LENGTH) out[id] = v;
  }
  return out;
}

export async function getKey(id: ProviderId): Promise<string | undefined> {
  return (await readKeys())[id];
}

/** A saved key is never shown again: the mask is the same for every key and reveals nothing about it. */
export const maskKey = (key: string | undefined): string => (key ? MASK : "");

export async function keyStatus(): Promise<Record<ProviderId, boolean>> {
  const keys = await readKeys();
  return { gemini: keys.gemini !== undefined, groq: keys.groq !== undefined };
}

export type SaveResult = { ok: true } | { ok: false; reason: "invalid" | "permission" };

/** Call from a click handler: it asks the browser for that one provider's host before saving anything. */
export async function saveKey(id: ProviderId, input: string): Promise<SaveResult> {
  const key = input.trim();
  if (key.length === 0 || key.length > MAX_KEY_LENGTH || /\s/.test(key)) return { ok: false, reason: "invalid" };
  if (!(await requestOrigins([providerOrigin(id)]))) return { ok: false, reason: "permission" };
  await storageSet(KEY, { ...(await readKeys()), [id]: key });
  return { ok: true };
}

export async function deleteKey(id: ProviderId): Promise<void> {
  const keys = await readKeys();
  delete keys[id];
  await storageSet(KEY, keys);
}

/** Sends one tiny fixed request. Returns "ok" or the ErrorKind. */
export async function testKey(id: ProviderId, model: string): Promise<"ok" | ErrorKind> {
  const provider = createProviders(getKey)[id];
  const r = await provider.generate({ system: 'Reply with the JSON object {"ok":true} and nothing else.', user: "ping", model });
  return r.ok ? "ok" : r.error.kind;
}
