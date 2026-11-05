# HANDOFF — S2.2 Refresh path: page changes survive, no ledger bypass, no feedback loops
Status: DONE     Date: 2026-11-05     Model/effort used: Opus 5.5 / high (per prompt)
## What changed
- src/engine/dom.ts — record kept across refresh (reset non-final clears props only); put() re-bases (I5); transition hold is a ledger entry; realm-safe isHtml/isSvg/isStyled; carriedText and `seen` removed
- tests/engine/refresh.test.ts — NEW, 13 tests, manual fake clock on the jsdom window (no real-time waits)
- tests/engine/ledger.test.ts — "I5 groundwork" test: 20 ms wait replaced by captured setTimeout + one microtask
## Gate results
tsc 0 errors; eslint 0 errors; engine tests 48 pass / 0 fail / 5 files.
Full vitest: 1351 pass / 18 fail / 1369 tests / 93 files; failing set == BASELINE_FAILURES.txt minus the S1.2-removed repair test. No plus-ui flake this run.
## Final shapes
- put(): new record takes `hadStyleAttr`/`origStyleText` from the attribute now; if the record exists but the attribute is gone, both re-base to "none" (page dropped it). Existing entry whose write is no longer in place (`ours()` false) re-bases `o,p` to the current value. reset(el) non-final reverts guarded entries and empties `props`; the next put() makes fresh entries from the page's current values, so the refresh re-base is the same rule. The existing-entry branch is a guard; no current path reaches it (dom.ts:230).
- suppressTransition: `put(el, "transition", "none")` after the element's reset, only for HTML elements that had live engine writes. Release on next frame = guarded revert + delete entry + I6 attribute drop. restore() just cancels the frame; reset(el, true) reverts the hold with the other entries.
- carriedText: gone. The record (with the original text) lives in recMap/modifiedElements from first write until restore(); restore() deletes every record, so nothing is held afterwards.
## Tests added (mutation checks: new tests run against pre-S2.2 dom.ts, plus targeted mutants)
- Fail on old dom.ts: I5 style-attr removal; I2 no-style-attr; I2 page transition during hold (extra test); I7 restore leaves nothing; I7 hover/focus exact; realm iframe.
- Pass on old (they prove the existing reset+put re-base): I5 unrelated prop, I5 overwrite, I5 twice, I2 original transition, I7 settles, retention, D12/I11.
- Mutants killed: text write in refresh (D12/I11 + groundwork); no attribute re-base (I5 removal); unguarded release (page transition); refresh deletes record (retention, D12/I11, I2 transition, hover); top-realm check in refreshBatch (realm).
- Survives: top-realm check in restore()'s marker loop. modifiedElements already resets every record first, so that loop is only a fallback.
## Decisions made (also in DECISIONS.md)
- Record kept across refresh instead of carriedText (one structure; byte-exact text still owed to final restore).
- Transition hold only on elements with live engine writes (the swap that needs it). Never-themed elements no longer get `transition:none`, so the page's own transitions survive there.
- Realm fix also in refreshBatch/inspectElement, otherwise iframe elements are never themed and item 3 cannot be tested. Namespace-URI variant dropped: tests/rules.test.ts flags the w3.org URLs.
## Out-of-scope touches
None. Precondition note: `git status` showed only `?? prompts/S2.2.md` (this prompt); treated as clean.
## Bugs found / fragile spots (not fixed)
- dom.ts:412 single rAF release: if the refresh task lands just before a frame, the release can precede the next style recalc, so the swap may still animate. Double rAF would fix it.
- dom.ts:168 modifiedElements keeps detached elements strongly until restore() (records now also outlive "no longer needs theme"; marker stays until restore).
- dom.ts:583 full rescan only for top doc html/body; dom.ts:691 hover listeners only on top doc (no hover refresh inside iframes); dom.ts:176 base sheet only on top doc.
- dom.ts:69 realm check uses ownerDocument.defaultView: a node adopted across documents keeps its old realm's prototype and would be skipped.
- dom.ts:577 a page transition/other non-colour style change does not queue a refresh (by design, noted).
## Performance
Per refreshed element, +1 `Object.keys` (hasWrites) and +2 inline reads per put (re-base guard). The hold now writes only to elements being re-themed, which means fewer writes than before. Negligible.
## Owner manual checks (build, load unpacked)
1. Wikipedia article: `window.__a = document.documentElement.outerHTML`; apply theme; hover; expand/collapse menus and "show" links; Restore original; `document.documentElement.outerHTML === window.__a` → true.
2. Any page: apply theme; `document.body.style.marginTop = "7px"`; click around; Restore; `document.body.style.marginTop` → "7px", no tinted background left.
3. github.com or a news site: scroll, open menus while themed: no flicker or slowdown, no repeated engine errors in console; then Restore.
## Suggested commit message
fix(engine): rebase page changes and route transitions through the ledger on refresh (S2.2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
## Next substage: S2.3 — fresh-instance restore via marker (D4). Relies on: ElementRecord {hadStyleAttr, origStyleText, props} unchanged in shape; record + marker live from first write until restore() (a marker can now sit on an element with empty props); reset(el, final) = revert guarded entries, final also drops record/marker and writes text if semantically identical.
