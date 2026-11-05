# HANDOFF — S3.2 Guard, rules and flow-safety tests against the engine
Status: DONE     Date: 2026-11-05     Model/effort used: Sonnet 5.5 / high (per prompt)
## What changed
- tests/guard.test.ts — 3 repair-structure tests deleted, 3 floor + 1 restore group adapted to the engine (28 tests); no compile import.
- tests/engine/rerender.test.ts — new, 37 tests: re-render promise under all 6 themes.
- tests/restore-markers.test.ts — stored-repair test split; the "unusable sheet ignored" half renamed BUG and left failing.
- tests/ai/flow-safety.test.ts — two compileCss tests replaced by engine/validator ones. tests/rules.test.ts — fixture path only.
- workflow/S3.2_PROPOSED.patch — recommended src fix, NOT applied. workflow/TEST_CLASSIFICATION.md — S3.2 section.
## Gate results
tsc 0; eslint 0. Engine dir 94 pass / 5 BUG. Full vitest 1365 pass / 13 fail / 94 files (1378 tests; before 1327): the 13 = 12 BUG + plus-ui B5 (timing flake, fails 1 in 3 alone, untouched). `git diff --ignore-cr-at-eol --stat -- src` empty. `grep -rl "plan/compile" tests src` empty. build + validate-dist ok.
## Importers of plan/compile
Before: tests/guard.test.ts, tests/ai/flow-safety.test.ts, tests/rules.test.ts (string). After: none, in src or tests.
## Re-render finding
Promise: re-rendered content is themed again and text stays at/above the I10 floor. Engine: the observer (dom.ts ingest/addTree/watch) handles replaced, re-inserted, class-changed nodes and nodes in a watched open shadow root, all 6 themes: PASS (32 tests; with the observer stubbed 31 of 37 fail, so the tests do bite).
## Stored-repair finding (owner decision needed)
(a) Nothing in src produces repairCss now; it lives only in records saved by older versions, and the popup re-saves it unchanged. (b) The applier check was dropped by the engine rewrite ed29e6b (not S1.2): applier-core injects `seedCss` verbatim. Every caller passes a record that sites.ts already validated with parseRepairCss, so there is no live injection path, only lost defence in depth; the stale `!important` structural rules can still fight the engine. (c) Smallest fix: S3.2_PROPOSED.patch (3 lines: `seedCss && parseRepairCss(seedCss)`; verified in a scratch copy: restore-markers 14/14 pass). Decide: also drop stored repairCss entirely (stop applying, strip on parse)? If yes, delete "a stored sheet is in place" and do it in S3.3/S4.
## Bugs found (tests kept red on purpose, 12)
1. dom.ts inspectElement: a colour equal to the parent's computed colour is skipped as inherited. `html, body {color}` pages go to 1.0:1 under light themes (guard.test claude-like x4). Repro: load fixtures/web/claude-like.html, apply calm-light.
2. transform.ts makeTransform: text is nudged against tokens.bg only. Light text on a dark element/button/picture ends ~3:1 or grey (guard claude-like midnight x1, hero-bg calm-light x1, rerender dark-element x4). Same at first apply.
3. dom.ts: a shadow root attached after apply to a connected host is never watched (rerender x1).
4. applier-core.ts:122: stored repair CSS unvalidated (restore-markers x1).
## Other notes
Flake: tests/scene-flow.test.ts "diagnostics of a real page" failed once under load, passes alone 3/3. Mutation checks (scratch copies, deleted): observer stub breaks rerender; painting a paragraph bg-coloured breaks the floor test; stray body attribute breaks the restore test.
## Zero-importer source (for S3.3)
src/plan/compile.ts (no importer anywhere). Dead chain: src/extension/guard-dom.ts (only feeds the unused `guard` option), `guard` option in applier-core, plan/guard.ts functions captureMedia/mediaIntact/effectiveBackground/textColor, plan/readability.ts audit/pickColor/addFailures/repairCss/compileRepair/validateRepair/snapshotText/pathOf, features/repair/payload.ts (only tests/repair.test.ts), schema.ts stepDown. Seven passing guard.test tests and tests/repair.test.ts still touch them.
## Owner manual checks
Optional, 2 min: `npm run build`, reload, apply a theme on github.com or a news site, open menus, navigate; text readable, nothing unthemed; Restore. Try a dark site (e.g. claude.ai) under a light theme: expect the light-text bug above.
## Suggested commit message
test: retire structural guard tests, cover re-render and contrast through the engine (S3.2)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
## Next substage: S3.3 (Sonnet 5.5, high) — remove dead structural code with grep evidence; compile.ts has zero importers. The 12 BUG tests need engine fixes (Stage 5 or a bugfix substage); S3.4 expects the failing set to be only these.
