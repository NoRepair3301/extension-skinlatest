import type { BlockReason } from "../core/types.ts";

/** User-facing copy from SPEC 11. */
export const MSG = {
  noKey: "Add a key in Settings to use AI. Built-in themes still work.",
  blocked: "Skinly can't change this kind of page",
  noAi: "This page has a sign-in or payment form, so only the built-in theme is used",
  tooLarge: "This page is too large for AI, so only the built-in theme is used",
  allFailed: "AI unavailable; kept the built-in theme",
  coloursAdjusted: "Some of the AI's colours were adjusted so the text stays readable",
  fallbackTheme: "The AI suggestion was not usable, so the closest built-in theme is shown",
  applyFailed: "The AI style could not be applied safely; kept the built-in theme",
  declined: "Nothing was sent. The built-in theme is kept",
  dailyLimit: "Daily AI limit reached. Built-in themes still work",
  gap: "Please wait a few seconds between AI requests",
  baselineFailed: "Couldn't apply that theme; the page was left as it was.",
} as const;

export const busy = (from: string, next: string): string => `${from} is busy; trying ${next}`;
export const authFailed = (provider: string): string => `${provider} rejected the key. Check it in Settings. The built-in theme is kept`;
export const consentText = (provider: string): string =>
  `Skinly AI will send a small description of this page's layout (shapes, sizes and colours, no text, links, images or forms) to ${provider}. Their terms apply and they may keep it. Nothing else leaves your browser.`;

export const blockedMessage = (_reason: BlockReason): string => MSG.blocked;
