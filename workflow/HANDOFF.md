# HANDOFF — S2.1 Guarded per-property restore (ledger + reset())
Status: BLOCKED     Date: 2026-11-04     Model/effort used: Opus 5.5 / high (per prompt)
## What changed        (edits kept in place, all within scope)
- src/engine/dom.ts — `ElementRecord = { hadStyleAttr: boolean; props: Record<string, PropRecord> }`, `PropRecord = { o, p, m }` (m = read-back value); `origStyle` removed; guarded per-prop `reset()`; restore() strips the marker from record-less elements and leaves their styles alone
- tests/engine/ledger.test.ts — new, 13 tests (I6 no attr; I2/I4 originals + priorities; I2/I4 !important; I6 empty attr kept; I3 page width survives; I4 page-changed colour not overwritten; I4 removed attr not resurrected; I6 attr kept with page's own prop; I2 custom property; I4 read-back guard; I7 idempotent; I7 no markers; re-theme then restore). Checked: 4 page-change tests fail on the old reset; the read-back test fails with `m = val`
- reset() semantics: for each recorded prop only: if inline value === m and priority === important, put back o/p (removeProperty if o is ""); else leave the page's value. Then drop record, marker, modifiedElements entry. If !hadStyleAttr and style is empty, remove the attribute; if hadStyleAttr, keep it even if empty. Props not in the record are never touched. refreshBatch's reset+put still works (engine tests green); a page-changed prop is re-recorded as o on the next put (accidental re-base)
## Gate results
tsc 0 errors; eslint 0 errors; vitest 1327 pass / 25 fail / 1352 tests in 92 files. tests/engine/* 31/31 green. Linux baseline before edits = 18 fail, same as the Windows list (minus the S1.2 test). No baseline failure now passes
## BLOCKER (expected gate: "nothing new fails"). 7 new failures, all the same cause:
applier.test.ts: legacy-portal-fonts/-tables "apply then restore leaves outerHTML identical" + "applying twice is idempotent..." (4); frames.test.ts "a frame applies ... restores to the exact original" (1); legacy.test.ts legacy-portal-fonts/-tables "rolls back and restores the exact original markup" (2).
Cause: these compare raw outerHTML. Per-property restore puts back equal values, but the DOM re-serialises the attribute: `style="background-color:#336699"` -> `style="background-color: rgb(51, 102, 153);"`, `background:#fff url(x.gif) repeat-x` -> `background: url("x.gif") repeat-x rgb(255, 255, 255);`. Chrome does the same, so the owner's outerHTML manual check would also be false on pages with inline colour styles. I can't fix this inside scope without breaking the prompt's rule "Nothing may restore the whole style attribute from a snapshot".
Decision needed (pick one):
- A) Accept re-serialisation: keep dom.ts as is, and have a later substage (S2.3/S3.x) adapt those 7 tests to compare per-property state (and relax the manual outerHTML check).
- B) (recommended) Allow an equivalence-guarded text restore: record `text = getAttribute("style")` at first write, and at the end of reset(): `if (text !== null && attr exists && attr !== text) { parse text into a scratch element; if scratch.style.cssText === el.style.cssText, setAttribute("style", text) }`. This only rewrites the text when the declarations are already identical, so page changes still win. Prototyped in scratch (not kept): the 7 tests pass, the engine suite stays green, and the failing set is back to the 18 baseline failures. It takes about 6 lines in dom.ts.
## Decisions made (also in DECISIONS.md)
- Record-lost marker: only `data-skinly-engine` is removed, styles left (S2.3 handles fresh instances).
- Read-back test emulates a browser whose serialisation differs (patches `getPropertyValue` for `color` on the test window), because jsdom echoes the engine's `rgb()` strings verbatim, so no natural case exercises it.
## Out-of-scope touches
None. (Temporary probe tests were created and deleted; dom.ts was swapped temporarily for checks and restored.)
## Bugs found (for S2.2)
- dom.ts:331-336 `suppressTransition` writes `transition: none !important` outside the ledger (I2); dom.ts:345-353 `restoreTransitions` writes and removes it outside the ledger too.
- Because of that, dom.ts:363 runs before dom.ts:369 `reset`: an element with no original style attr keeps `transition` during reset, so the attr is not dropped, and put() re-records `hadStyleAttr = true`. Verified: a stylesheet-themed element without a style attr, refreshed by a class change, ends with `style=""` after restore (I6 violation).
- restore(): `instanceof win!.HTMLElement` uses the top window realm, so marked elements in same-origin iframe docs skip reset (pre-existing, now they only lose the marker).
## Performance
One extra `getPropertyValue` per write (read-back) plus two reads per prop in reset: negligible.
## Owner manual checks
After deciding A/B: build, load unpacked, Wikipedia article: `window.__a = document.documentElement.outerHTML`, apply theme, Restore original, `document.documentElement.outerHTML === window.__a` (with A, expect false where inline colour styles exist; compare the differing attributes). Restore leaves no tinted background.
## Suggested commit message
fix(engine): guarded per-property restore ledger (S2.1)
## Next substage: S2.1 again after owner decision (B: add the guarded text restore; A: mark DONE and schedule the test adaptation). S2.2 relies on per-prop guarded reset(), hadStyleAttr, and the bugs above.
