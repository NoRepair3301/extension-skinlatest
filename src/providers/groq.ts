import { DEFAULT_MODELS, PROVIDER_ENDPOINTS } from "../config.ts";
import { callJson, type HttpDeps } from "./http.ts";
import type { Provider } from "./types.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** docs/providers/groq.md section 4: the answer is choices[0].message.content. */
export function extractGroqText(response: unknown): string | undefined {
  if (!isRecord(response) || !Array.isArray(response["choices"])) return undefined;
  const first = response["choices"][0];
  const message = isRecord(first) ? first["message"] : undefined;
  const content = isRecord(message) ? message["content"] : undefined;
  return typeof content === "string" ? content : undefined;
}

export function createGroq(getKey: () => Promise<string | undefined>, deps: HttpDeps = {}): Provider {
  return {
    id: "groq",
    defaultModel: DEFAULT_MODELS.groq,
    async generate(req) {
      const key = await getKey();
      if (!key) return { ok: false, error: { kind: "auth" } };
      return callJson(
        {
          url: PROVIDER_ENDPOINTS.groq,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: {
            model: req.model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
            response_format: { type: "json_object" },
          },
          extractText: extractGroqText,
        },
        req,
        deps,
      );
    },
  };
}
