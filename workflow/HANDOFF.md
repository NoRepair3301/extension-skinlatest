# HANDOFF — S2.3 Fresh-instance restore (D4): engine-aware marker cleanup
Status: DONE     Date: 2026-11-05     Model/effort used: Opus 5.5 / high (per prompt)
## What changed
- src/engine/dom.ts — ROOT_MARK/ENGINE_MARK/ENGINE_SHEET_SIGNATURE/ENGINE_PROPS/MARK_CAP exported; marker codec; `undoEngineMarks(doc)`; marker written once per batch (dirty set); orphan stand-down; restore() = stop() + undo (unchanged order)
- src/extension/cleanup.ts — isOurSheet matches the signature exactly (plus the old data-skinly rule); markerCleanup calls undoEngineMarks before the attribute sweep; marker names from the engine constants
- tests/engine/marker.test.ts — NEW, 14 tests (the 12 named in the prompt + orphan stand-down + fresh byte-exact legacy text)
## Gate results
tsc 0 errors; eslint 0 errors; engine 62 pass / 0 fail / 6 files. Full vitest 1366 pass / 17 fail / 1383 / 94 files; failing set ⊂ BASELINE_FAILURES.txt (18 → 17: the restore-markers fresh-instance test now passes unchanged). No plus-ui flake.
Still red, not mine: restore-markers "stored repair" — applier-core.ts:122-124 adopts any seedCss unvalidated (parseRepairCss gate went with S1.2). For S3.x.
## Marker format, cap, signature
- Sheet: engine CSS starts with `html[data-skinly-engine-sheet] {}` (never matches). Cleanup: first rule selectorText === ENGINE_SHEET_SIGNATURE.
- `data-skinly-engine="<bits base36>[-][*](;prop[!]=value)*[;=styleText]"`. bits = ENGINE_PROPS ever written here; `-` = no style attribute originally; `*` = originals dropped; `!` = important; `;=` = original style text, only when not canonical. Escapes `% ; = !` only.
- Example: `<p style="color: red !important; width:10px">` themed colour + background → `3;color!=red;=color: red %21important%3B width:10px`. Unstyled themed div → `2-`.
- Cap 1024 chars: drop text first, then originals (`*`). ENGINE_PROPS bit order is on-page format: append only.
## What a fresh instance can / cannot restore
1. Can: listed engine props back to original value+priority (or removed), inline custom props, transition holds, no-attr → none, byte-exact text when declarations are unchanged.
2. Page wins only if its change dropped `!important` or removed the prop; a page write that kept `!important` on an engine prop is replaced by the recorded original (no `m` on page).
3. Over cap (`*`): listed engine props are removed (page's own inline value for them lost); custom props stay themed.
4. A prop the engine stopped writing keeps its last recorded original (stale if the page later set it `!important`).
5. Pre-S2.3 markers (empty value) are just stripped. Root marker + base sheet are removed from the top doc only; element markers in open shadow roots and same-origin iframes.
6. A still-running lost instance stands down when its sheet is gone, so it does not re-theme (orphan test).
## Tests / mutation check (12 mutants; scratch script, files restored, hashes verified)
Killed: no stand-down (orphan, re-apply); mask ignored (I3); originals ignored (9 tests); important guard dropped (page-changed); no-style bit ignored (5); no text stored (6); no cap (oversized); top document only (shadow/iframe); no signature rule (sheet tests incl. restore-markers fresh); cleanup without undo (12). Survived: "rewrite on re-base" (equivalent: refresh empties props, so put never reaches that branch) and "marker write per put" (cost only). "D4/I7 no extra cycle" and "D12 live restore" pass without the change too (they guard properties).
## Cost (jsdom, 3000 elements, half inline-styled)
Marker writes on apply: 3002 before and after (one per element; the empty write moved to batch end with data). Marker bytes ≈ 98 KB total (≈33 B/element; inline-styled ones carry text + originals). Apply time within jsdom noise (2.1–3.4 s both). Refresh: write only if bits/originals/no-style changed.
## Decisions made (also in DECISIONS.md)
Bitmask stored (deviation: marker never empty) for I3; `*` flag per element not root; orphan stand-down via detached own sheet; constants in dom.ts.
## Out-of-scope touches
None (applier-core.ts not edited). Precondition: `git status` showed only `?? prompts/S2.3.md`.
## Bugs found / fragile (not fixed)
- applier-core.ts:93 run() → restore(false) skips markerCleanup: a fresh instance *applying* (not restoring) after an extension reload stacks on the old sheet/markers and records the old theme as originals. One-line fix candidate for S5.x.
- dom.ts:887 stand-down signal is "own sheet detached": a page that overwrites document.adoptedStyleSheets stops a live engine's refreshes (styles stay; restore() still exact).
- dom.ts:78 ENGINE_PROPS must list every non-custom prop inspectElement/suppressTransition write, or the fresh path never undoes it.
## Owner manual checks (before committing)
`npm run build`, reload unpacked. 1) Wikipedia article: `window.__a = document.documentElement.outerHTML`; apply theme. 2) chrome://extensions → reload Repaint; back to tab WITHOUT reloading (still themed). 3) Popup → Restore original: no tint; `document.documentElement.outerHTML === window.__a` → true (else paste the differences). 4) Apply again, Restore again: still clean. 5) After step 3, hover/scroll: page must not re-theme (orphan stood down).
## Suggested commit message
fix(engine): fresh-instance restore via engine marker and sheet signature (S2.3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
## Next substage: S2.4 — runAuto reaches the engine via the applier; validate-dist. Relies on: ENGINE_MARK exported from engine/dom.ts (marker present in applier.js); marker value is no longer empty.
