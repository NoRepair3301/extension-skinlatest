# HANDOFF — S3.6 Close Stage 3: residual failures, side-effecting tests, new baseline
Status: DONE     Date: 2026-11-05     Model/effort used: Sonnet 5.5 / high (per prompt)
## What changed (tests only; `git diff --stat -- src` is empty)
- tests/engine/rerender.test.ts — bug C test adapted (host class change = the documented signal), "BUG:" prefixes removed.
- tests/engine/shadow-late.test.ts (comment), tests/guard.test.ts (names/comments: "BUG:" removed) — no assertion edits.
- tests/scene-flow.test.ts — 4 s snapshot timers tracked and cleared after each test. tests/applier.test.ts, tests/auto.test.ts — 60 s per-test timeout on two tests. tests/backend-client/client.test.ts — deterministic signature tamper.
- workflow: PLAN, LOG, DECISIONS, TEST_CLASSIFICATION, BASELINE, BASELINE_FAILURES.
## Gate results
tsc 0; eslint 0; build ok; validate-dist ok; contrast ok. Final 3 consecutive full runs: 1482 pass / 0 fail / 96 files each. Engine dir green. (Earlier 6 runs, before fixes, below.)
## Task 1 — bug C re-render test: case (a)
Root cause: the test attached a root and rendered into it with no mutation, event or timer. S3.4's design (owner: signals only) adopts a late root on a signal and deliberately has no sweep timer. Adapted, not weakened silently: now also changes a class on the host (the signal a real component gives); still asserts themed + readable. Without the signal it fails. No-signal case remains a documented limitation (shadow-late.test.ts covers every signal x 6 themes). DECISIONS has the entry.
## Task 2 — flake table (9 full runs; alone = passes unless noted)
| test | failed in | cause | action |
|---|---|---|---|
| plus-ui B5 sign-in | 3 of first 6 (0 of last 3) | timing (login flow) | known flake, deleted in S4.4, not fixed |
| scene-flow "diagnostics of a real page" | 3 of first 3, and alone once (then 0 of 40+) | real 4 s snapshot timers of earlier tests fire into it (~4 s into the file), storing a stale `theme: none`; reproduced by delaying; original fails, fixed passes | test now clears them per test |
| client.test "tampered ... tokens count as Free" | 1 full run, 3 of ~80 alone | tamper was a no-op 1 in 16 (sig already ended "AA") | tamper first char; 0 of 60 after |
| applier large-page restore, auto same-document nav | 0 of 9 now (timed out once in S3.5) | load, ~2.5 s alone | 60 s per-test timeout, global unchanged |
## Task 3 — side-effecting tests (25 tests, all pass)
build.test: writes `node_modules/.skinly-test-dist{,-big,-extra,-short}`. release.test: `node_modules/.skinly-release-test/{dist,out}` (zip 1199 B). budgets.test: `private/test-budget-dist/{popup.js,assets/shared.js,scene.js}`. None touches an existing file in `private/` outside `test-budget-dist`. Note: the first 3 full runs had already executed them before my before/after listing (taken 18:16, after those runs); I listed names/sizes/times only, never contents. Before vs after the explicit run: same names and sizes, only the 3 scratch files in `private/test-budget-dist` and the scratch dirs in node_modules got new mtimes; the 11 other `private/` entries unchanged (mtimes 2026-10-30). No budget numbers touched.
## Task 4 — T3 (specs §5) line by line
- Vitest fully green incl. the three side-effecting tests: YES (3 consecutive runs, 1482/1482). Exception: `plus-ui` B5 may flake under load (3 of first 6, 0 of last 3); deleted in S4.4.
- Structural-theming tests deleted or adapted: YES (S3.1/S3.2, TEST_CLASSIFICATION).
- Zero-importer structural code removed, evidenced: YES (S3.3, DEAD_CODE.md).
New baseline: BASELINE.md and BASELINE_FAILURES.txt rewritten (empty failures list except the named flake).
## Decisions made
All in DECISIONS (S3.6 entries). Out-of-scope touches: none beyond the allowed test files (scene-flow, applier, auto, client tests were "tests needed for the tasks").
## Bugs found
None in src. Fragile (not touched): applier-auto's 4 s snapshot timer is not cancelled by Restore (src/extension/applier-auto.ts:78), harmless per document; S3.4/S3.5 fragile items still listed in the earlier handoffs.
## Owner manual checks
Optional repeat of S3.5 manual page (workflow/manual/S3.5-manual.html) and two real sites; this session changed no src.
## Owner decision
PLAN still says S3.4 BLOCKED (accepted and tagged by the owner in S3.5). Change that row to DONE if you want PLAN to match.
## Suggested commit
git add -A
git commit -m "test: close Stage 3, full suite green, new gate baseline (S3.6)"
git tag stage-S3.6
git push
## Next substage: S4.1 — neutralise gating (Sonnet 5.5, high). Relies on: green gate baseline above; plus-ui and client.test.ts still present (deleted in S4.4).
