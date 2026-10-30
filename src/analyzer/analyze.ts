import type { Fingerprint, RiskMarker, StructuralSummary } from "../core/types.ts";
import { fingerprint } from "./fingerprint.ts";
import { computeStats, countElements, detectRegions, NODE_CAP, scan, type RegionNode } from "./regions.ts";
import { detectRisk } from "./risk.ts";
import { buildSummary, defaultDeps, pageFacts, type SummaryDeps } from "./summary.ts";

export type Analysis =
  | { status: "too-large"; visited: number; risk: RiskMarker[] }
  | { status: "ok"; visited: number; risk: RiskMarker[]; regions: RegionNode[]; summary: StructuralSummary; fingerprint: Fingerprint };

/** Read-only: never writes to the document. */
export function analyze(doc: Document, deps?: SummaryDeps, cap: number = NODE_CAP): Analysis {
  const s = scan(doc, cap);
  const risk = detectRisk(s);
  if (s.tooLarge) return { status: "too-large", visited: s.visited, risk };
  const regions = detectRegions(s, computeStats(s));
  const d = deps ?? defaultDeps(doc);
  const summary = buildSummary(regions, countElements(s), risk, d, pageFacts(doc, s.nodes.map((n) => n.el), d));
  return { status: "ok", visited: s.visited, risk, regions, summary, fingerprint: fingerprint(regions) };
}
