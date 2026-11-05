# BASELINE

## Pre-flight (S0.1, 2026-11-04)
- Branch: `main`; HEAD: `ed29e6b` (specs recon said `12a775e`; HEAD moved since, owner's "change" commit).
- `git status --porcelain` count: 5 at session start (M CLAUDE.md; ?? CLAUDE.legacy.md, STAGES.md, prompts/, specs.md).
- Engine files tracked: yes (`git ls-files src/engine tests/engine` lists 7 files).
- package.json scripts: build, typecheck, lint, test, scrub, contrast, validate-dist, check, release, bakeoff, preview (no `gate` yet; S0.2 adds it).
- node_modules present: yes.
- node v24.19.0; npm 11.17.0.
- Not run (S0.2 does this): tsc, eslint, vitest, build.

## Gate baseline — Stage 4 onwards (S3.6, measured 2026-11-05, on top of HEAD 1ef09aa plus the S3.6 test edits)
| Step | Result | Duration |
|---|---|---|
| tsc | 0 errors | 8-22s |
| eslint | 0 errors | 6-21s |
| vitest | 1482 pass / 0 fail / 1482 tests in 96 files (3 consecutive full runs) | 98-173s (load dependent) |
| build | exit 0 | - |
| validate-dist | `ok`, exit 0 | - |
| contrast | `ok (6 themes)`, exit 0 | - |

Failing list: empty (`workflow/BASELINE_FAILURES.txt`), apart from the named known flake `tests/plus-ui.test.ts` B5 sign-in (failed in 3 of the first 6 loaded runs, passed alone and in the last 3; deleted in S4.4).
The three side-effecting tests (build, budgets, release) pass: 25 tests; they only rewrite their own scratch folders (`node_modules/.skinly-test-dist*`, `node_modules/.skinly-release-test`, `private/test-budget-dist`).
Bundle sizes (S3.5): dist/applier.js 86218 bytes, applier-auto.js 17582 bytes, all inside the budgets of tests/budgets.test.ts.

### History
S0.2 (HEAD 64343cf): tsc 1, eslint 4, vitest 1324 pass / 19 fail of 1343 in 91 files. All 19 were mapped to later substages and are closed.
