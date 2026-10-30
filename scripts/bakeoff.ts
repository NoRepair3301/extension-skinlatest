// Dev only, never bundled. Compares providers on the fixture summaries. Reads keys from .env.local and never prints them.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { analyze } from "../src/analyzer/analyze.ts";
import type { SummaryDeps } from "../src/analyzer/summary.ts";
import { buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from "../src/ai/prompt.ts";
import { DEFAULT_MODELS, MIN_CALL_GAP_MS, PROVIDER_IDS, type ProviderId } from "../src/config.ts";
import { contrastFailures } from "../src/plan/contrast.ts";
import { validatePlan } from "../src/plan/schema.ts";
import { createProviders } from "../src/providers/index.ts";

const ENV_NAMES: Record<ProviderId, string> = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY" };

/** Plain KEY=value parse of .env.local (no dependency). */
function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const median = (xs: number[]): number => (xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!);

async function main(): Promise<void> {
  const env = readEnv(".env.local");
  const keys: Partial<Record<ProviderId, string>> = {};
  for (const id of PROVIDER_IDS) if (env[ENV_NAMES[id]]) keys[id] = env[ENV_NAMES[id]]!;
  const ids = PROVIDER_IDS.filter((id) => keys[id] !== undefined);
  if (ids.length === 0) {
    process.stdout.write("bakeoff: no keys in .env.local, nothing to run\n");
    return;
  }

  const dir = "fixtures/web";
  const fixtures = readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
  const providers = createProviders(async (id) => keys[id]);
  const rows: Array<Record<string, string | number>> = [];

  for (const id of ids) {
    let jsonOk = 0;
    let planOk = 0;
    let contrastOk = 0;
    let runs = 0;
    const latencies: number[] = [];
    const errors: Record<string, number> = {};
    let stopped = "";
    for (const file of fixtures) {
      const doc = new JSDOM(readFileSync(`${dir}/${file}`, "utf8")).window.document;
      const deps: SummaryDeps = {
        getStyle: (el) => {
          const s = doc.defaultView!.getComputedStyle(el);
          return { color: s.color, backgroundColor: s.backgroundColor, fontSize: s.fontSize, fontWeight: s.fontWeight, borderRadius: s.borderTopLeftRadius, fontFamily: s.fontFamily };
        },
        getRect: () => ({ x: 0, y: 0, w: 0, h: 0 }),
        viewport: { w: 1280, h: 800 },
      };
      const a = analyze(doc, deps);
      if (a.status !== "ok") continue;
      runs++;
      const t0 = Date.now();
      const r = await providers[id].generate({ system: SYSTEM_PROMPT, user: buildUserMessage(a.summary), model: DEFAULT_MODELS[id] });
      latencies.push(Date.now() - t0);
      if (!r.ok) {
        errors[r.error.kind] = (errors[r.error.kind] ?? 0) + 1;
        if (r.error.kind === "auth" || r.error.kind === "quota" || r.error.kind === "rate") {
          stopped = r.error.kind; // do not hammer a provider that refuses us
          break;
        }
      } else {
        jsonOk++;
        const v = validatePlan(r.json, a.summary);
        if (v.ok) {
          planOk++;
          if (contrastFailures(v.plan.themeId, v.plan.tokens).length === 0) contrastOk++;
        }
      }
      await sleep(MIN_CALL_GAP_MS);
    }
    const pct = (n: number) => (runs === 0 ? 0 : Math.round((n / runs) * 100));
    rows.push({ provider: id, model: DEFAULT_MODELS[id], runs, "valid JSON %": pct(jsonOk), "valid plan %": pct(planOk), "contrast ok %": pct(contrastOk), "median ms": median(latencies), errors: JSON.stringify(errors), stopped });
  }

  process.stdout.write(`bakeoff (prompt v${PROMPT_VERSION}, ${fixtures.length} fixtures)\n`);
  const cols = Object.keys(rows[0]!);
  process.stdout.write(cols.join(" | ") + "\n");
  for (const r of rows) process.stdout.write(cols.map((c) => String(r[c])).join(" | ") + "\n");
  mkdirSync("private", { recursive: true });
  writeFileSync("private/bakeoff.json", JSON.stringify({ promptVersion: PROMPT_VERSION, rows }, null, 2));
}

main().catch(() => {
  process.stdout.write("bakeoff: failed\n");
  process.exitCode = 1;
});
