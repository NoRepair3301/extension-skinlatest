import type { ProviderId } from "../config.ts";
import type { GenerateRequest, Provider, Result } from "./types.ts";

export type MockOutcome =
  | { type: "ok"; json: unknown }
  | { type: "invalid-json" }
  | { type: "rate"; retryAfterMs?: number }
  | { type: "quota" }
  | { type: "auth" }
  | { type: "server" }
  | { type: "timeout" }
  | { type: "aborted" }
  | { type: "delay"; ms: number; then: MockOutcome };

export interface MockProvider extends Provider {
  calls: GenerateRequest[];
}

const toResult = (o: Exclude<MockOutcome, { type: "delay" }>): Result => {
  switch (o.type) {
    case "ok":
      return { ok: true, json: o.json };
    case "invalid-json":
      return { ok: false, error: { kind: "bad-output" } };
    case "rate":
      return o.retryAfterMs === undefined ? { ok: false, error: { kind: "rate" } } : { ok: false, error: { kind: "rate", retryAfterMs: o.retryAfterMs } };
    default:
      return { ok: false, error: { kind: o.type } };
  }
};

/** Scripted provider for tests: each call consumes the next outcome; the last one repeats. */
export function createMock(script: MockOutcome[], id: ProviderId = "gemini"): MockProvider {
  const calls: GenerateRequest[] = [];
  let i = 0;
  return {
    id,
    defaultModel: "mock-model",
    calls,
    async generate(req) {
      calls.push(req);
      const outcome = script[Math.min(i++, script.length - 1)] ?? { type: "server" };
      if (outcome.type !== "delay") return toResult(outcome);
      return new Promise<Result>((resolve) => {
        const timer = setTimeout(() => resolve(toResult(outcome.then as Exclude<MockOutcome, { type: "delay" }>)), outcome.ms);
        req.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve({ ok: false, error: { kind: "aborted" } });
        });
      });
    },
  };
}
