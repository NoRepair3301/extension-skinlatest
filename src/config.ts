export const PROVIDER_IDS = ["gemini", "groq"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Endpoints come from docs/providers/*.md. */
export const PROVIDER_ENDPOINTS: Record<ProviderId, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/interactions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
};

/** Default model ids (configurable in settings); see docs/providers/*.md. */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-3.8-flash",
  groq: "openai/gpt-oss-120b",
};

/**
 * Per-provider time limits (rc4). `callMs` is one HTTP call; `overallMs` covers everything for that provider
 * (its calls, one retry and one repair request) before the next provider is tried. Gemini spends seconds on thinking
 * tokens (docs/providers/gemini.md), so it gets more room than Groq.
 */
export const PROVIDER_TIMEOUTS: Record<ProviderId, { callMs: number; overallMs: number }> = {
  groq: { callMs: 15_000, overallMs: 20_000 },
  gemini: { callMs: 25_000, overallMs: 30_000 },
};

/** Hosts that source files and built JS may mention as URLs or call with fetch: the provider hosts only. */
export const ALLOWED_URL_HOSTS: readonly string[] = PROVIDER_IDS.map((id) => new URL(PROVIDER_ENDPOINTS[id]).hostname);

/** Optional host permission pattern for one provider. */
export const providerOrigin = (id: ProviderId): string => new URL(PROVIDER_ENDPOINTS[id]).origin + "/*";

/**
 * Hosts where Skinly never runs, apart from the user's own blocklist (Settings). Empty since rc4: legacy portals such as
 * erp.iitkgp.ac.in are supported. Pages with password, one-time-code, payment or file inputs still get no AI call (SPEC 6).
 */
export const BUILTIN_BLOCKLIST: readonly string[] = [];

/** Schemes that belong to the browser itself. */
export const INTERNAL_SCHEMES: readonly string[] = [
  "chrome:",
  "edge:",
  "about:",
  "brave:",
  "chrome-extension:",
  "moz-extension:",
  "view-source:",
  "devtools:",
  "chrome-search:",
  "chrome-untrusted:",
];

/** Extension stores as host or host/path-prefix. Never changed by Skinly. */
export const WEB_STORES: readonly string[] = [
  "chromewebstore.google.com",
  "google.com/webstore",
  "microsoftedge.microsoft.com/addons",
  "addons.mozilla.org",
];

/** Client-side guard on AI calls (SPEC 7). */
export const DAILY_AI_CALLS = 20;
export const MIN_CALL_GAP_MS = 3000;

/** Bump to ask for consent again (SPEC 11). */
export const CONSENT_VERSION = 1;

export const PROVIDER_NAMES: Record<ProviderId, string> = { gemini: "Gemini", groq: "Groq" };
