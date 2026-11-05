# HANDOFF — S3.4 Engine bug A (colour equal to parent skipped) and bug C (late shadow root)
Status: BLOCKED (bug A done; bug C acceptance test red by owner decision)     Date: 2026-11-05     Model/effort used: Opus 5.5 / high
## What changed
- src/engine/dom.ts — bug A: follow-check after each batch's writes (settleFollows, parentOf, depthOf, sameColor); fill/stroke never trust an HTML parent. Bug C: adopt() for late open roots; roots is a Set.
- tests/engine/inheritance.test.ts (new, 37) and tests/engine/shadow-late.test.ts (new, 28).
- tests/engine/marker.test.ts — I3 test setup adapted (owner-approved, see Out-of-scope).
- workflow/manual/S3.4-manual.html (new); PLAN, LOG, DECISIONS, TEST_CLASSIFICATION.
## Gate results
tsc 0; eslint 0. Engine dir 159 pass / 5 BUG (was 94 / 5). Full vitest before 1330 pass / 11 fail / 1341 / 93 files; after 1399 pass / 7 fail / 1406 / 95 files. Fixed: the 4 guard "colour declared on both html and body" tests (no assertion edits). Still red: 6 bug B (S3.5) + rerender "BUG: a shadow root attached after the theme is on". Nothing new fails; legacy outerHTML tests pass. build + validate-dist ok (marker in applier.js only; applier.js 80649 -> 81508 bytes, applier-auto.js 17582 unchanged).
## Bug A: root cause and fix
Root cause: refreshBatch resets every element in the batch, then reads. inspectElement skipped `color` when it equalled the parent's computed colour, assuming the child inherits the parent's themed write. But the parent's value was read unthemed (same batch), and equality does not mean inheritance: `html, body {color:X}` repaints html while body keeps its own X, and so does every descendant with its own equal rule. fill/stroke had the same rule, and an <svg> under an HTML parent (which never gets a fill) was always skipped.
Fix: when the parent is in the same batch, the skip becomes a "follow". After the writes, follows are re-read ancestors first. Any that did not end at tf(value) are written through put(). A parent outside the batch is trusted as before; if it is still queued, the child is re-queued after it. hover/focus and mutation refreshes run the same code.
Writes (6 themes summed, elements/props): claude-like 42/52 -> 60/94 (per theme 7 -> 10 elements: body, buttons and cards with their own equal colour). light-article, hero-bg, large-page (1819 els), article-news, nested-nav, spa-list, legacy-portal-tables, dark-aware: unchanged.
## Bug C: design, cost, limits
Attaching a root fires nothing (verified in jsdom). The isolated world cannot hook the page's attachShadow, and customElements is unavailable there. A late open root is adopted (watched and collected once) when an existing signal touches its host: an attribute mutation on the host or its queued light descendants, a childList on the host, a host in an added subtree, or a hover/focus/change event whose composedPath goes through the root. Cost is O(1) per touched element. No timers.
Limits: a root whose host never sees activity stays unthemed until a full rescan (body/html class change, stylesheet load). Closed roots are unchanged. The rerender BUG test is exactly that case. A one-shot sweep would pass it but breaks refresh.test.ts:188 and marker.test.ts:255, and you chose signals only.
## Decisions made
4 S3.4 lines in DECISIONS (follow rule; fill/stroke; bug C signals; BUG C test stays red; marker test adaptation).
## Out-of-scope touches
tests/engine/marker.test.ts:169-184 (owner-approved): #c `color: rgb(200,0,0) !important` -> `color: inherit !important`, expected values to match. The old premise was bug A itself.
## Mutation checks (scratch copy, not in repo; all bite)
Follow-check off: 13 fail. Svg-parent rule off: 2. adopt off: 26. adopt re-collects known roots: 24. Observer not disconnected: 1. Fresh cleanup skipping shadow roots: 1. Final restore without style text: 6. Follow never writes: 7.
## Fragile, not touched
dom.ts:745 quiet() ingests pending records without schedule(), so queue items from flushHover/restoreTransitions wait for the next trigger. dom.ts:853: class change on a container with >300 descendants does not re-queue them. dom.ts:575: an explicit text-decoration-color equal to the colour stays unthemed when the colour is written. dom.ts:165: parentOf uses the DOM parent, but slotted nodes inherit from the slot (follow-check still writes the right value).
## Owner manual checks
In workflow/manual/ run `python -m http.server 8000`, then open http://localhost:8000/S3.4-manual.html (or open the file after enabling "Allow access to file URLs"). Apply each of the 6 themes from the popup and confirm all text in A is clearly readable. Click "attach shadow root", then move the pointer over the new box: it gets themed (no activity = documented limit). Click "define custom element": the inserted card is themed at once. Press Restore original: the page returns to normal. Reload the extension and repeat once with one theme (fresh-instance path).
## Suggested commit message / commands
git add -A
git commit -m "fix(engine): theme elements whose colour equals the parent's; watch shadow roots attached after apply (S3.4)"
git tag stage-S3.4
git push
## Next substage: S3.5 (Opus 5.5, high) — bug B. Owner first: accept S3.4 as is (bug C test red) or decide its fate. Relies on: the follow-check in refreshBatch, src/engine/transform.ts untouched.
