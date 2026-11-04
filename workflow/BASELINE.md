# BASELINE

## Pre-flight (S0.1, 2026-11-04)
- Branch: `main`; HEAD: `ed29e6b` (specs recon said `12a775e`; HEAD moved since, owner's "change" commit).
- `git status --porcelain` count: 5 at session start (M CLAUDE.md; ?? CLAUDE.legacy.md, STAGES.md, prompts/, specs.md).
- Engine files tracked: yes (`git ls-files src/engine tests/engine` lists 7 files).
- package.json scripts: build, typecheck, lint, test, scrub, contrast, validate-dist, check, release, bakeoff, preview (no `gate` yet; S0.2 adds it).
- node_modules present: yes.
- node v24.19.0; npm 11.17.0.
- Not run (S0.2 does this): tsc, eslint, vitest, build.

## Gate baseline — filled by S0.2 (measured 2026-11-04, HEAD 64343cf)
| Step | Result | Duration |
|---|---|---|
| tsc | 1 error (`src/engine/dom.ts(57,25)` TS2304 `PropRecord`) | 6.5s |
| eslint | 4 errors (`pipeline.ts:19,187`; `engine/dom.ts:4,5`, all no-unused-vars) | 4.2s |
| vitest | 1324 pass / 19 fail / 1343 tests in 91 files | 71.7s |
| build | exit 0 | 2.5s |
| validate-dist | `ok`, exit 0 | 0.8s |
| contrast | `ok (6 themes)`, exit 0 | 0.8s |

Full `npm run gate` (tsc+eslint+vitest) ≈ 83s.

### vitest failing files (19 in 5 files)
- tests/guard.test.ts — 8
- tests/legacy.test.ts — 7
- tests/restore-markers.test.ts — 2
- tests/applier.test.ts — 1
- tests/repair.test.ts — 1
Exact list: `workflow/BASELINE_FAILURES.txt`.

### Previously unrun test files
`tests/build.test.ts`, `tests/budgets.test.ts`, `tests/release.test.ts` ran inside the full run and none appears in the failing list (all pass). `git status --porcelain` after everything shows no tracked file modified by tests or build (only the S0.2 edits to package.json plus new files).

### Marker counts (`data-skinly-engine`, dist after build)
applier.js 1; applier-auto.js 0; scene.js 0; palette.js 0; background.js 0.

### Difference from recon
- vitest: 1324 pass / 1343 tests / 91 files vs recon 1299 / 1318 / 88. The extra 25 tests / 3 files are build, budgets, release (recon skipped them), all passing.
- Failing count 19 in 5 files, tsc 1, eslint 4, applier.js 1 hit, applier-auto.js 0: all match recon.

### Expected red until fixed
- tsc (1) → S1.1. eslint (4): `engine/dom.ts` ones → S1.1; `pipeline.ts` ones → S1.2.
- tests/repair.test.ts (1) → S1.2 (adapt "AI repair in flow").
- tests/restore-markers.test.ts (2) → S2.3 (fresh-instance restore; the "stored repair rules" case may instead be retired with the repair layer in S1.2/S3.x).
- tests/applier.test.ts (1), tests/legacy.test.ts (7) → S3.1 (adapt to engine).
- tests/guard.test.ts (8) → S3.2 (rewrite/retire plan/compile-importing tests; investigate "re-render" case).
- Residuals → S3.4.
### Unmapped failures
None. (restore-markers "stored repair rules" mapping is a judgement call, noted above.)
