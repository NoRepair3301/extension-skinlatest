/** Content script to service worker: show the ON badge on the sender's tab. Carries no data. */
export const BADGE_MESSAGE = { type: "skinly-badge-on" } as const;

export const isBadgeMessage = (m: unknown): boolean =>
  typeof m === "object" && m !== null && (m as { type?: unknown }).type === BADGE_MESSAGE.type && Object.keys(m).length === 1;
