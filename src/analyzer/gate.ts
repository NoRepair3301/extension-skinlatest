import type { Gate, NoAiReason, RiskMarker } from "../core/types.ts";
import { checkUrl } from "./eligibility.ts";

export interface GateInput {
  url: string;
  blocklist: readonly string[];
  risk: readonly RiskMarker[];
  tooLarge?: boolean;
}

/** SPEC 6: blocked pages first, then pages where only the built-in theme is used. */
export function decideGate(input: GateInput): Gate {
  const e = checkUrl(input.url, input.blocklist);
  if (!e.allowed) return { kind: "blocked", reason: e.reason };
  const reasons: NoAiReason[] = [];
  for (const r of ["password", "payment", "file"] as const) if (input.risk.includes(r)) reasons.push(r);
  if (input.tooLarge) reasons.push("too-large");
  return reasons.length > 0 ? { kind: "no-ai", reasons } : { kind: "ok" };
}

/** Any risk marker means colours only (SPEC 6). */
export const layoutsAllowed = (risk: readonly RiskMarker[]): boolean => risk.length === 0;
