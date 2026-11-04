# HANDOFF — S2.2 Refresh path without whole-attribute reset
Status: DONE     Date: 2026-11-04     Model/effort used: Opus 5.5 / high (autopilot; task from STAGES.md row, plan in workflow/plans/S2.2.md)
## What changed
- src/engine/dom.ts — refreshBatch no longer calls reset(): `lift(el)` (own write in place -> put back o/p; page changed it -> re-base o,p := current, I5), compute, `put()`, then `prune(el, written)` drops entries no longer written and releases an empty record (marker off, I6 rule, original text carried). Records survive refreshes, so hadStyleAttr/origStyleText stay from the first write. reset() is now restore-only (always final). Helpers `owned`/`revert`/`unput`/`release`
- src/engine/dom.ts — suppressTransition writes `transition: none !important` through put() (I2); restoreTransitions undoes it with unput() (guarded: a page change to `transition` wins) and releases records left empty. pendingTransitions is now a Set
- tests/engine/refresh.test.ts — new, 14 tests
- workflow/plans/S2.2.md — the plan (no prompts/S2.2.md existed)
## Gate results
tsc 0 errors; eslint 0 errors; vitest 1352 pass / 18 fail / 1370 tests in 93 files. Failing set == the 18 baseline failures exactly (diffed against BASELINE_FAILURES.txt minus the S1.2-removed test). tests/engine/* 49/49.
## Tests added (refresh.test.ts)
I5 page change survives a refresh, restore yields page's latest value · I5 survives two refreshes (hover + class) · I5 page-removed prop not resurrected · I5 page-replaced style attribute survives · I3 unrelated page prop survives a refresh · I5 stylesheet change that drops the colour: engine stops writing, attribute gone · no-change refresh writes the same values, restore byte-exact · I6 class-change refresh then restore: no attribute (the S2.1 bug) · I6/I7 restore with the override pending: no attribute, override, frame · I6 override-only element released after the frame · I2 original inline transition back after the frame and on restore · I5 page change to transition during the override wins · I7 refresh settles (no further style writes) · I7 no engine writes after restore.
Mutation-checked: HEAD engine fails 6; no re-base fails 3; unguarded unput 1; no prune 1; lifting the pending transition 3; flush without quiet() 2 (loop detected).
## Decisions made (DECISIONS.md: 2 lines)
- Re-basing lives in lift(), not put(): after a lift, put() cannot tell "lifted" from "page changed", so it keeps o/p
- Transition override is an ordinary ledger entry; while pending, lift/prune skip it. It briefly marks override-only elements with data-skinly-engine (released on the next frame)
- No rate limiter for page-vs-engine ping-pong (scope: the engine's own writes never re-trigger it)
## Out-of-scope touches
None. (dom.ts swapped temporarily with mutants from the scratchpad; restored, sha1 verified.)
## Bugs found (outside scope)
- dom.ts refreshBatch/restore: `instanceof win.HTMLElement` uses the top-window realm, so elements in same-origin iframes are never refreshed/themed nor reset (pre-existing; noted in S2.1 too)
- dom.ts modifiedElements holds strong refs to removed nodes until restore (pre-existing, memory only)
## Owner manual checks
Build, load unpacked, open a page with hover effects (GitHub repo page): apply a theme, hover menus and buttons for a while, then Restore original: no element keeps an empty `style=""` that it did not have (DevTools: `$$('[style=""]')` before vs after), no tint left. On a page that changes inline colours itself (an animated or React page), the page's latest colours remain after Restore. Wikipedia: `window.__a = document.documentElement.outerHTML`, theme, hover, Restore, `=== window.__a` still true.
## Suggested commit message
fix(engine): refresh path keeps the ledger and re-bases page changes (S2.2)
## Next substage: S2.3 — relies on records persisting across refreshes, reset() being restore-only, transition writes being ledger entries (so the marker set == every element with engine inline writes), and carriedText for released records
