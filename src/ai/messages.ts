import type { BlockReason } from "../core/types.ts";
import { S } from "../ui/strings.ts";

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
  commandFailed: "Skinly couldn't run on this page, so it was left as it was.",
  baselineFailed: "Couldn't apply that theme; the page was left as it was.",
} as const;

/** Two-second toasts for keyboard commands (shown by the extension itself, never page text). The words live in src/ui/strings.ts. */
export const TOAST = S.toast;

type ApplyFailure = { reason?: string; detail?: readonly string[] } | undefined;

/**
 * Why an apply was rolled back, as a sentence fragment in plain words. Built from the reason code only (and two fixed detail
 * codes); never from page content, plan values or invariant details. `undefined` means the page script never answered.
 */
export function applyFailureReason(r: ApplyFailure): string {
  switch (r?.reason) {
    case undefined:
      return S.fail.denied;
    case "invariants":
      return S.fail.invariants;
    case "invalid-plan":
      if (r.detail?.[0] === "contrast") return S.fail.contrast;
      if (r.detail?.[0] === "region missing on page") return S.fail.changed;
      return S.fail.unsafe;
    case "visual":
      if (r.detail?.[0] === "media") return S.fail.media;
      if (r.detail?.[0] === "editable" || r.detail?.[0] === "caret") return S.fail.typing;
      return S.fail.text;
    case "too-large":
      return S.fail.tooLarge;
    case "bad-theme":
      return S.fail.badTheme;
    default:
      return S.fail.other;
  }
}

/** Theme could not be applied and the page was left as it was. */
export const applyFailureMessage = (r: ApplyFailure): string => `${applyFailureReason(r)}, so the page was left as it was.`;

/** An AI style was rolled back and the built-in theme stays. */
export const aiApplyFailureMessage = (r: ApplyFailure): string => `${applyFailureReason(r)}, so the AI style was not used. The built-in theme is kept.`;

export const busy = (from: string, next: string): string => `${from} is busy; trying ${next}`;
export const authFailed = (provider: string): string => `${provider} rejected the key. Check it in Settings. The built-in theme is kept`;
export const consentText = (provider: string): string =>
  `Skinly AI will send a small description of this page's layout (shapes, sizes and colours, no text, links, images or forms) to ${provider}. Their terms apply and they may keep it. Nothing else leaves your browser.`;

/** Every configured provider is rate limited and told us how long to wait (more than the 5 s we are willing to sleep). */
export const rateLimited = (retryAfterMs: number): string => S.fail.rate(Math.min(3600, Math.max(1, Math.ceil(retryAfterMs / 1000))));

export const blockedMessage = (_reason: BlockReason): string => MSG.blocked;
