import type { RiskMarker } from "../core/types.ts";
import type { Scan } from "./regions.ts";

const ORDER: readonly RiskMarker[] = ["password", "payment", "file", "editable", "big-table", "iframes", "shadow"];

/** Names and ids that mean "enter a code sent to you". Matched on attribute names only, never on values. */
const OTP_NAME = /(^|[^a-z])(otp|totp|mfa|2fa)([^a-z]|$)|one[-_ ]?time|pass[-_ ]?code|verification[-_ ]?code|security[-_ ]?code/i;

/** Risk markers from element attributes and counts only. Values are never read. */
export function detectRisk(s: Scan): RiskMarker[] {
  const found = new Set<RiskMarker>();
  let iframes = 0;
  for (const { el } of s.nodes) {
    const tag = el.localName;
    if (tag === "iframe") iframes++;
    if (tag === "input") {
      const type = (el.getAttribute("type") ?? "").toLowerCase();
      if (type === "password") found.add("password");
      if (type === "file") found.add("file");
      // A one-time code is a secret like a password, so it uses the same marker (no AI call on the page).
      const secretCode = (el.getAttribute("autocomplete") ?? "").toLowerCase().split(/s+/).includes("one-time-code");
      const otpName = !["checkbox", "radio", "hidden", "submit", "button", "image", "reset", "file"].includes(type) && (OTP_NAME.test(el.getAttribute("name") ?? "") || OTP_NAME.test(el.getAttribute("id") ?? ""));
      if (secretCode || otpName) found.add("password");
    }
    if (tag === "input" || tag === "select" || tag === "textarea") {
      const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase().split(/\s+/);
      if (ac.some((t) => t.startsWith("cc-"))) found.add("payment");
    }
    if (tag === "textarea" && Number(el.getAttribute("rows") ?? 0) >= 5) found.add("editable");
    const ce = el.getAttribute("contenteditable");
    if (ce !== null && ce.toLowerCase() !== "false") found.add("editable");
    if (tag === "table" && el.querySelectorAll("tr").length >= 20) found.add("big-table");
  }
  if (iframes >= 3) found.add("iframes");
  if (s.shadowCount > 0) found.add("shadow");
  return ORDER.filter((r) => found.has(r));
}
