# HANDOFF — S3.5 Engine bug B: contrast measured against the effective backdrop
Status: DONE     Date: 2026-11-05     Model/effort used: Opus 5.5 / high (per prompt)
Precondition: PLAN had S3.4 BLOCKED; owner chose "accept S3.4 (tagged), proceed" (DECISIONS). The bug C rerender test is the expected red.
## What changed
- src/engine/transform.ts — `Backdrop` type; `tf(color, role, backdrop?)` decides text against the backdrop; `tf.fit()` floor-only for already-themed colours.
- src/engine/dom.ts — per-batch backdrop resolution (layers, compositing, gradients, url(), covering media), follow-check against the child's own backdrop, layer-change re-queue of descendants.
- src/engine/color.ts — `over()` (source-over) and `greyWithLuminance()`.
- tests/engine/backdrop.test.ts (new, 76). workflow/manual/S3.5-manual.html (new). PLAN, LOG, DECISIONS, TEST_CLASSIFICATION.
## Backdrop model (8 lines)
1. Per element: own layers bottom-up (background-color, background-image layers last to first, covering positioned media child); the topmost opaque layer hides the rest.
2. Only see-through layers walk to the parent (nearest first); composited at both ends; theme background is the final base. Result = darkest..lightest colour.
3. Elements in the batch are predicted exactly as the engine will write them; others are read as painted. Cached per batch.
4. Text: today's colour if it meets the floor there, else the theme mapping, else nudged against both ends (gradients: worst stop).
5. url() counts only if it fills the box (tiled, or cover/contain/100%); icons/decorations ignored. Unparsable gradient = unseen.
6. Unseen pixels: assume only that the original text met the floor on them; text stays on the original's side, may move away from the picture, never towards it (keeps the page colour rather than flipping to the theme's).
7. Inherited child text is checked on its own backdrop; settled-parent values get a floor-only fit.
8. Limits: a page unreadable on its own picture stays so; opacity, blend modes, z-index, pseudo-elements, positioned non-media siblings not modelled; media needs layout.
## Gate results
tsc 0; eslint 0. Engine dir 239 pass / 1 BUG (bug C). Full vitest before 1399 pass / 7 fail / 1406; after 1481 pass / 1 fail / 1482 / 96 files. All 6 bug B tests pass with no assertion edits. Bug A (inheritance, guard html/body x4) and shadow-late tests pass. One loaded run timed out applier "large-page apply then restore" and auto "same-document navigation" (20 s); both pass alone, and before/after engines time the same there (2.3–7 s swings on one engine). plus-ui flake did not occur. build + validate-dist ok; dist/applier.js 81508 -> 86218 bytes (+4710), applier-auto.js 17582 unchanged.
## Timing and writes (jsdom, sum per theme, best of 4 runs; wall time is noisy on this machine)
Synthetic 4444 nodes: ~2.6–3.5 s -> ~2.8–3.6 s; computed-style reads 19624 -> 14963; calm-light written els/props 3185/5068 -> 2042/3813. large-page 1819: ~1.0 s -> ~1.0 s; reads 8467 -> 5616; calm-light/midnight/warm-paper 883 -> 311 els (a double transform past the first batch is gone). Other 10 fixtures: same writes, same colours except hero-bg (picture text) and claude-like midnight (Send).
## Tests added; mutation checks (scratch copy, all bite)
backdrop.test.ts: the 9 required groups + url icon ignored, positioned media (I8), today's colour kept, x 6 themes; white-on-picture stays white x 4 light themes. Mutations: no backdrop 35 fail; see-through as opaque 4; first stop only 4; url ignored 10; parent's backdrop 35; no re-queue 4; settled child unchecked 4; follow on parent backdrop 4; fit bypasses ledger 4 (I2); no today-first 4; media off 5; icon as backdrop 6; flip to theme colour 2; hover without schedule 2.
## Fragile, not touched
dom.ts:916 re-queue after a background change does not enter shadow roots below the element. dom.ts:804 inline custom props with text role still use the theme-bg floor. transform.ts:94 a gradient spanning dark and light cannot be met; falls back to black/white. dom.ts:625 covering media ignores z-index. S3.4 items remain (dom.ts:979 quiet(), 1089 300 cap for class changes, 773 text-decoration, 232 slots).
## Out-of-scope touches / Bugs found
None.
## Owner manual checks
In workflow/manual/ run `python -m http.server 8000`, open http://localhost:8000/S3.5-manual.html. Apply each of the 6 themes; confirm every label, heading, link and button text is clearly readable (no grey mush, nothing vanishing). Hover the "Hover me" button. Press **Restore original**: the page returns to normal. Then repeat once on two real sites with dark buttons or banners (e.g. github.com and a news site) with one light theme.
## Suggested commit commands
git add -A
git commit -m "fix(engine): measure text contrast against the effective backdrop (S3.5)"
git tag stage-S3.5
git push
## Next substage: S3.6 (Sonnet 5.5, medium) — residual failures sweep. Relies on: bug B tests green (their "BUG:" names still to rename), bug C test red by owner decision, `tf` third argument optional (old callers unchanged).
