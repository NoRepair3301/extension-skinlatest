import { ENGINE_MARK, ENGINE_SHEET_SIGNATURE, ROOT_MARK, undoEngineMarks } from "../engine/dom.ts";

/**
 * Marker-based cleanup for a Restore when the rollback ledger is gone (a fresh script instance, an orphaned old one, a page that
 * navigated). It removes only what carries our markers: our adopted stylesheets, our UI hosts (scene, pet, blur overlay, banner, toast)
 * and every data-skinly attribute, and undoes the engine's inline writes from the data in its element markers (D4, best effort).
 * Nothing else on the page is touched.
 */
const OUR_SHEET = /data-skinly/;
const ATTRS = [ROOT_MARK, ENGINE_MARK, "data-skinly-r", "data-skinly-table", "data-skinly-sort", "data-skinly-share", "data-skinly-hide", "data-skinly-found", "data-skinly-cover", "data-skinly-blur"];

// The engine's base sheet opens with its signature rule; older sheets of ours open with a data-skinly selector.
const isOurSheet = (s: CSSStyleSheet): boolean => {
  try {
    const first = s.cssRules[0] as CSSStyleRule | undefined;
    if (first === undefined || typeof first.selectorText !== "string") return false;
    return first.selectorText === ENGINE_SHEET_SIGNATURE || OUR_SHEET.test(first.selectorText);
  } catch {
    return false;
  }
};

export function markerCleanup(doc: Document): void {
  try {
    const sheets = doc.adoptedStyleSheets;
    if (sheets && sheets.some(isOurSheet)) doc.adoptedStyleSheets = sheets.filter((s) => !isOurSheet(s));
  } catch {
    // a browser without adopted stylesheets has none of ours
  }
  // Before the attribute sweep below: the engine marker carries the data this needs.
  undoEngineMarks(doc);
  doc.querySelectorAll("[data-skinly-ui],[data-skinly-scene]").forEach((n) => n.remove());
  for (const attr of ATTRS) {
    doc.documentElement.removeAttribute(attr);
    doc.querySelectorAll(`[${attr}]`).forEach((n) => n.removeAttribute(attr));
  }
}
