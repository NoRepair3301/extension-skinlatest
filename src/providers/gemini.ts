import { DEFAULT_MODELS, PROVIDER_ENDPOINTS } from "../config.ts";
import { STYLE_PLAN_SCHEMA } from "../ai/prompt.ts";
import { callJson, type HttpDeps } from "./http.ts";
import type { Provider } from "./types.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * UNVERIFIED (docs/providers/gemini.md section 4): the docs show no raw REST response, only SDK accessors.
 * Looks for `output_text`, then for a `model_output` step with text. Anything else fails closed (bad-output).
 */
export function extractGeminiText(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;
  if (typeof response["output_text"] === "string") return response["output_text"];
  const steps = response["steps"];
  if (!Array.isArray(steps)) return undefined;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (!isRecord(s) || s["type"] !== "model_output") continue;
    if (typeof s["text"] === "string") return s["text"];
    const content = s["content"];
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const parts = content.map((c) => (isRecord(c) && typeof c["text"] === "string" ? c["text"] : "")).join("");
      if (parts) return parts;
    }
  }
  return undefined;
}

export function createGemini(getKey: () => Promise<string | undefined>, deps: HttpDeps = {}): Provider {
  return {
    id: "gemini",
    defaultModel: DEFAULT_MODELS.gemini,
    async generate(req) {
      const key = await getKey();
      if (!key) return { ok: false, error: { kind: "auth" } };
      return callJson(
        {
          url: PROVIDER_ENDPOINTS.gemini,
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: {
            model: req.model,
            system_instruction: req.system,
            input: req.user,
            response_format: { type: "text", mime_type: "application/json", schema: STYLE_PLAN_SCHEMA },
          },
          extractText: extractGeminiText,
        },
        req,
        deps,
      );
    },
  };
}
