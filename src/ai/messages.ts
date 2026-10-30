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
  commandFailed: "Skinly couldn't run on this page, so it was left as it was.",
  baselineFailed: "Couldn't apply that theme; the page was left as it was.",
} as const;

/** Two-second toasts for keyboard commands (shown by the extension itself, never page text). */
export const TOAST = {
  themeApplied: "Skinly: theme applied",
  restored: "Skinly: restored",
  blurOn: "Skinly: blur on",
  blurOff: "Skinly: blur off",
  paletteOpen: "Skinly: palette open",
  petOn: "Skinly: pet shown",
  petOff: "Skinly: pet hidden",
  blocked: "Skinly: blocked page",
  failed: "Skinly: couldn't change this page",
} as const;

type ApplyFailure = { reason?: string; detail?: readonly string[] } | undefined;

/**
 * Why an apply was rolled back, as a sentence fragment in plain words. Built from the reason code only (and two fixed detail
 * codes); never from page content, plan values or invariant details. `undefined` means the page script never answered.
 */
export function applyFailureReason(r: ApplyFailure): string {
  switch (r?.reason) {
    case undefined:
      return "Skinly couldn't run on this page (the browser didn't allow it)";
    case "invariants":
      return "Applying the theme would have changed links or form controls on this page";
    case "invalid-plan":
      if (r.detail?.[0] === "contrast") return "The theme's colours were too hard to read here";
      if (r.detail?.[0] === "region missing on page") return "The page changed while it was being read";
      return "That style wasn't safe to apply";
    case "visual":
      if (r.detail?.[0] === "media") return "The theme would have hidden pictures on this page";
      if (r.detail?.[0] === "editable" || r.detail?.[0] === "caret") return "The theme would have made typing hard to see on this page";
      return "The theme would have made text hard to read on this page";
    case "too-large":
      return "This page is too large to restyle safely";
    case "bad-theme":
      return "That theme isn't available";
    default:
      return "Something went wrong while applying the theme";
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

export const blockedMessage = (_reason: BlockReason): string => MSG.blocked;
