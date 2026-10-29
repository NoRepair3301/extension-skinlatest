# PHASE 8: privacy blur, safe screenshot, table tools

Goal: let the user blur chosen parts of a page (for sharing), take a screenshot of the visible area with those parts blurred, and make data tables easier to use. Nothing is uploaded and no page text is read to decide what to blur.
Depends on: Phase 7. Blur is best effort and the UI says so: only what the user picked is blurred.

## Scope (in order, commit after each step)
1. src/features/blur/pick.ts: "Pick element to blur" mode started from the popup. Hover outlines the element under the pointer; a click on an element toggles `data-skinly-blur="1"` and is prevented from reaching the site while pick mode is on; Escape or the Done button exits and removes every listener. Banner text says what mode is active.
2. src/features/blur/selector.ts: build a stable selector for a picked element (tag, `:nth-of-type` path of at most 6 levels, at most 2 sanitised classes, never ids or text) and resolve it later; report "N blurred, M not found". Save per origin in the site record (`blur`, at most 50 selectors).
3. src/features/blur/apply.ts: CSS template `[data-skinly-blur="1"]{filter:blur(6px)}` (the only use of `filter`). Options: "Blur all images, video and canvas" per site; Share mode toggle turns all blur on or off; reveal on hover or keyboard focus when Share mode is off. Re-apply after bounded DOM changes.
4. Safe screenshot (popup, `activeTab`): turn Share mode on if needed, wait for the content script to confirm, call `captureVisibleTab`, save the PNG through a Blob link created in the popup (no downloads permission), restore the previous Share mode. File name `skinly-YYYYMMDD-HHMMSS.png`. UI text: "Only what you picked is blurred. Visible area only. Check the picture before you share it."
5. src/features/tables/: detect data tables (header row or th, at least 3 rows and 2 columns, no form controls, not inside a form). Sticky header (a `position: sticky` template on header cells), click-to-sort on a header (stable; numbers with commas, currency symbols and percentages; ISO and DD/MM/YYYY dates; empty cells last), a filter box (case-insensitive, hides non-matching rows), and "Restore order". Sort moves the same row nodes inside their own tbody; filter toggles a `data-skinly-hide` attribute with its CSS template. Both are recorded in the rollback ledger. Tables with controls or inside forms are skipped.

## Acceptance
1. [auto] `npm run check` green.
2. [auto] Selector tests: build and resolve on fixtures; unresolvable selectors are counted; the 50 cap holds; ids and text never appear in a selector.
3. [auto] Pick mode leaves no listeners after exit (spy); clicks do not reach the page while it is on.
4. [auto] Blur CSS contains only the allowed template; Share mode on and off applies and removes it; blur-all-images works.
5. [auto] Screenshot logic with a fake api: Share mode forced on then restored, file name pattern, Blob creation, failure handling, and no network call.
6. [auto] Table tests: detection on the table-heavy fixtures; stable sort for every listed format; 200-row sort under 100 ms in jsdom; filter; Restore order returns the original order; tables with controls or inside forms are untouched (DOM identical).
7. [human] On a real page pick three elements, take a safe screenshot and read the PNG yourself: the picked parts are unreadable. Try a page where you did not pick something sensitive and confirm it is visible (the tool only blurs what you pick).
8. [human] Sort and filter a real table, then Restore original: the page is exactly as before.

## Stop
Stop when items 1 to 6 pass and everything is committed. Print items 7 and 8. Do not start Phase 9.
