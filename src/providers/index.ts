import type { ProviderId } from "../config.ts";
import { createGemini } from "./gemini.ts";
import { createGroq } from "./groq.ts";
import type { HttpDeps } from "./http.ts";
import type { Provider } from "./types.ts";

export function createProviders(getKey: (id: ProviderId) => Promise<string | undefined>, deps: HttpDeps = {}): Record<ProviderId, Provider> {
  return {
    gemini: createGemini(() => getKey("gemini"), deps),
    groq: createGroq(() => getKey("groq"), deps),
  };
}
