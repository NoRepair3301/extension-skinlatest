// Dev only, never bundled. ONE tiny real call per provider whose key is in .env.local.
// Prints HTTP status, response header names and the JSON key structure (names and types only, no values).
// Full responses go to private/ (gitignored). Never prints a key. No retries.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PROVIDER_ENDPOINTS, DEFAULT_MODELS, PROVIDER_IDS, type ProviderId } from "../src/config.ts";

const ENV_NAMES: Record<ProviderId, string> = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY" };
const SYSTEM = 'Reply with a JSON object only.';
const USER = 'Return {"a":"x"}.';
const SCHEMA = { type: "object", properties: { a: { type: "string", enum: ["x", "y"] } }, required: ["a"] };

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Key names and value types only; arrays show length and the shape of their first item. */
function shape(v: unknown, depth = 0): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array(${v.length})` + (v.length > 0 && depth < 6 ? `<${shape(v[0], depth + 1)}>` : "");
  if (typeof v === "object") {
    if (depth >= 6) return "object";
    const parts = Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`);
    return `{ ${parts.join(", ")} }`;
  }
  return typeof v;
}

function request(id: ProviderId, key: string, model: string): { headers: Record<string, string>; body: unknown } {
  if (id === "gemini") {
    return {
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: { model, system_instruction: SYSTEM, input: USER, response_format: { type: "text", mime_type: "application/json", schema: SCHEMA } },
    };
  }
  return {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: { model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: USER }], response_format: { type: "json_object" } },
  };
}

async function main(): Promise<void> {
  const env = readEnv(".env.local");
  mkdirSync("private", { recursive: true });
  const only = process.argv[2] as ProviderId | undefined;
  for (const id of PROVIDER_IDS) {
    if (only && only !== id) continue;
    const key = env[ENV_NAMES[id]];
    if (!key) {
      process.stdout.write(`${id}: no key, skipped\n`);
      continue;
    }
    const model = process.argv[3] ?? DEFAULT_MODELS[id];
    const { headers, body } = request(id, key, model);
    const t0 = Date.now();
    try {
      const res = await fetch(PROVIDER_ENDPOINTS[id], { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      const ms = Date.now() - t0;
      const names = [...res.headers.keys()].sort();
      let structure = "(not JSON)";
      try {
        structure = shape(JSON.parse(text));
      } catch {
        /* keep marker */
      }
      writeFileSync(`private/probe-${id}.json`, JSON.stringify({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: text }, null, 2).split(key).join("<key>"));
      process.stdout.write(`${id} (${model}): HTTP ${res.status} in ${ms} ms\n  header names: ${names.join(", ")}\n  structure: ${structure}\n`);
      if (res.status === 429 || res.status === 401 || res.status === 403) process.stdout.write(`  ${id}: stopped (${res.status}), not retrying\n`);
    } catch (e) {
      process.stdout.write(`${id} (${model}): failed after ${Date.now() - t0} ms: ${e instanceof Error ? e.name : "error"}\n`);
    }
  }
}

main().catch(() => {
  process.stdout.write("probe: failed\n");
  process.exitCode = 1;
});
