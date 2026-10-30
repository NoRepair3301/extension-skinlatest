import type { ProviderId } from "../config.ts";

export type ErrorKind = "auth" | "rate" | "quota" | "network" | "timeout" | "blocked" | "bad-output" | "server" | "aborted";

export interface GenerateRequest {
  system: string;
  user: string;
  /** Response schema for providers that take one; defaults to the StylePlan schema. */
  schema?: object;
  model: string;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export type Result =
  | { ok: true; json: unknown; usage?: Usage }
  | { ok: false; error: { kind: ErrorKind; retryAfterMs?: number } };

export interface Provider {
  id: ProviderId;
  defaultModel: string;
  generate(req: GenerateRequest): Promise<Result>;
}

/** Kinds that mean "try the next provider". */
export const RETRYABLE_KINDS: readonly ErrorKind[] = ["rate", "quota", "server", "timeout", "network", "blocked"];
