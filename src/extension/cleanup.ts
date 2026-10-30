/**
 * Marker-based cleanup for a Restore when the rollback ledger is gone (a fresh script instance, an orphaned old one, a page that
 * navigated). It removes only what carries our markers: our adopted stylesheets, our UI hosts (scene, pet, blur overlay, banner, toast)
 * and every data-skinly attribute. Nothing else on the page is touched.
 */
const OUR_SHEET = /data-skinly/;
const ATTRS = ["data-skinly", "data-skinly-r", "data-skinly-table", "data-skinly-sort", "data-skinly-share", "data-skinly-hide", "data-skinly-found", "data-skinly-cover", "data-skinly-blur"];

const isOurSheet = (s: CSSStyleSheet): boolean => {
  try {
    const first = s.cssRules[0] as CSSStyleRule | undefined;
    return first !== undefined && typeof first.selectorText === "string" && OUR_SHEET.test(first.selectorText);
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
  doc.querySelectorAll("[data-skinly-ui],[data-skinly-scene]").forEach((n) => n.remove());
  for (const attr of ATTRS) {
    doc.documentElement.removeAttribute(attr);
    doc.querySelectorAll(`[${attr}]`).forEach((n) => n.removeAttribute(attr));
  }
}
