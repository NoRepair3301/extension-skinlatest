# HANDOFF — S3.1 Delete pure structural tests; adapt two
Status: DONE     Date: 2026-11-05     Model/effort used: Sonnet 5.5 / medium (per prompt)
## What changed
- tests/plan/compile.test.ts — deleted (58 tests; compileCss has no src caller).
- tests/golden/*.css (6) + dir — deleted (only reader was compile.test.ts).
- tests/compat.test.ts — removed the 2 "compiled theme" cases and their imports; kept `print is untouched`.
- tests/plan/layouts.test.ts — removed 2 compileCss cases and the import; rest kept.
- tests/applier.test.ts — region-tag test adapted to a plan with regionRules; +1 case (built-in theme tags nothing).
- tests/legacy.test.ts — 7 failing invariants rewritten for the engine (I1/I2/I6/I8/D12); 10 tests, all pass.
- workflow/TEST_CLASSIFICATION.md — new, full table.
## Gate results
tsc 0 errors; eslint 0 errors; engine 62 pass. Full vitest 1318 pass / 9 fail / 93 files (before: 1370 pass / 18 fail / 1388 incl. a repair.test.ts flake; after total 1327 = 1388 - 62 deleted + 1 added). Failing set = guard.test.ts (8) + restore-markers.test.ts stored-repair (1), as expected. `git diff --ignore-cr-at-eol --stat -- src` empty. `npm run build` and `validate-dist` ok.
## Decisions made (also in DECISIONS.md)
- Region tagging is live in applier-core for AI plans with regionRules, dead for built-in themes -> test adapted to a plan with rules, plus a built-in case.
- Legacy checks now assert the engine guarantee (only ENGINE_MARK/ROOT_MARK/style change; byte-exact restore) and that td[bgcolor] is painted by the engine with no [bgcolor] selector.
## Out-of-scope touches
None.
## Bugs found
None. Every adapted invariant holds in the engine.
## Mutation checks
Verified in a scratch copy (deleted): stray `data-foo` attribute written during apply fails the attribute test (3 fixtures); stripping the engine marker from td fails the bgcolor test. Not mutated, argued: region-tag test fails if tagging is removed (toEqual on tags) and the new built-in case fails if built-in themes start tagging; "applies every theme" fails on any node move/attr change or inexact restore.
## Zero-importer source (for S3.3)
src/plan/compile.ts: no src importers; remaining importers are tests/guard.test.ts, tests/ai/flow-safety.test.ts, tests/rules.test.ts (string only), all S3.2.
## Owner manual checks
Run `npm run gate` once. `git diff --ignore-cr-at-eol --stat -- src` prints nothing.
## Suggested commit message
test: remove structural-theming tests, adapt legacy invariants to the engine (S3.1)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
## Next substage: S3.2 (Sonnet 5.5, high) — guard, rules, flow-safety tests against the engine; investigate the guard "re-render" case.
