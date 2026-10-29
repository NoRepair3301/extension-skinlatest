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

/** Hosts that source files and built JS may mention as URLs or call with fetch: the provider hosts only. */
export const ALLOWED_URL_HOSTS: readonly string[] = PROVIDER_IDS.map((id) => new URL(PROVIDER_ENDPOINTS[id]).hostname);

/** Optional host permission pattern for one provider. */
export const providerOrigin = (id: ProviderId): string => new URL(PROVIDER_ENDPOINTS[id]).origin + "/*";

/** Hosts where Skinly never runs. */
export const BUILTIN_BLOCKLIST: readonly string[] = ["erp.iitkgp.ac.in"];

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
