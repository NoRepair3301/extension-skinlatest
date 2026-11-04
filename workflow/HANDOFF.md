# HANDOFF — S2.1 Guarded per-property restore (ledger + reset())
Status: DONE     Date: 2026-11-04     Model/effort used: Opus 5.5 / high (per prompt); resumed after owner decision B (D12)
## What changed
- src/engine/dom.ts — `ElementRecord = { hadStyleAttr: boolean; origStyleText: string | null; props: Record<string, PropRecord> }`, `PropRecord = { o, p, m }` (m = read-back value). Whole-attribute snapshot restore removed. Guarded per-prop `reset(el, final)`. Final-only, equivalence-guarded text restore (`restoreStyleText`, D12). `carriedText` keeps the original text across refreshBatch's reset/put. restore() strips the marker from record-less elements and leaves their styles alone
- tests/engine/ledger.test.ts — new, 17 tests (prompt's 12 + re-theme case + owner's 3 + a CSP fallback test)
- reset() semantics: for each recorded prop only: if inline value === m and priority === important, put back o/p (removeProperty if o is ""); else the page's value stays. Then the record, marker and modifiedElements entry are dropped. If !hadStyleAttr and the style is empty, the attribute is removed; if hadStyleAttr, it is kept even if empty. With final (restore() only), the original text is written back if it parses to exactly the current declarations (same props, values, priorities); otherwise the per-prop result stays. Without final (refresh), the text is only carried to the next record
## Gate results
tsc 0 errors; eslint 0 errors; vitest 1338 pass / 18 fail / 1356 tests in 92 files. Failing set == the 18 baseline failures exactly (diffed). tests/engine/* 35/35. Linux baseline matched the Windows list; no Linux-specific differences seen.
## Tests added (ledger.test.ts)
I6 no attr ends with none · I2/I4 originals + priorities · I2/I4 !important kept · I6 empty attr kept · I3 page width survives · I4 page-changed colour not overwritten · I4 removed attr not resurrected · I6 attr kept with page's own prop · I2 custom property exact · I4 read-back guard (emulated serialiser) · I7 idempotent · I7 no markers · re-theme then restore · D12 (a) byte-exact outerHTML for `background-color:#336699` / `background:#336699;padding:4px` · (b) page change blocks text restore and survives · (c) refresh never writes the original text (MutationObserver trace on an SVG element), and restore after the refresh is still byte-exact · CSP fallback. Mutation-checked: each fails on its own mutation (old reset, m = val, final in the refresh path, no text write, no CSP fallback)
## Decisions made (DECISIONS.md: D12 + log line)
- Deviation from the literal `setAttribute("style", text)`: `scripts/rules.ts:55` (tests/rules.test.ts) flags it as CSP-unsafe in src. The text goes through the existing Attr node (`attr.value = text`, as the pre-S2.1 engine did), and the scratch parse uses `style.cssText`. After the write, the declarations are re-checked; if a strict CSP dropped them, the same declarations go back via CSSOM. So the worst case is the per-prop result, never lost styles
- The original text is carried across refresh (`carriedText`, cleared in restore()); otherwise any refreshed (for example, hovered) element would lose byte-exact restore. It is never written in the refresh path. restore() also applies the guarded text restore to carried elements that have no record now
- Record-lost marker: only `data-skinly-engine` is removed, styles left (S2.3)
## Out-of-scope touches
None. (Temporary probe tests created and deleted; dom.ts swapped temporarily for mutation checks and restored byte-identical.)
## Bugs found (for S2.2)
- dom.ts `suppressTransition`/`restoreTransitions` (around lines 360-385) write `transition` outside the ledger (I2)
- As a result, refreshBatch runs suppressTransition before reset: an element with no original style attr keeps `transition` during reset, and put() re-records `hadStyleAttr = true`. A stylesheet-themed element, refreshed by a class change, ends with `style=""` after restore (I6). Verified; left as is, per "no original attribute: unchanged behaviour"
- restore(): `instanceof win!.HTMLElement` uses the top-window realm, so marked elements in same-origin iframe docs skip reset (pre-existing)
## Performance
One read-back per write, two reads per prop in reset, and one scratch parse per element with an original style attribute at final restore. Negligible.
## Owner manual checks
Build, load unpacked, open a Wikipedia article: `window.__a = document.documentElement.outerHTML`, apply a theme, hover around, press Restore original, then `document.documentElement.outerHTML === window.__a` should be true. Restore leaves no tinted background. Also try a strict-CSP site (github.com): inline styles still intact after Restore.
## Suggested commit message
fix(engine): guarded per-property restore ledger (S2.1)
## Next substage: S2.2 — relies on per-prop guarded reset(el, final), hadStyleAttr/origStyleText in the record, carriedText, and the bugs above
