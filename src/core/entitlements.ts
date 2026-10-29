/** The only place with tier logic. The free plan unlocks everything. */
export type Feature = string;

export function canUse(_feature: Feature): boolean {
  return true;
}
