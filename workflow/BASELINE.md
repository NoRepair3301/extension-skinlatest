# BASELINE

## Pre-flight (S0.1, 2026-11-04)
- Branch: `main`; HEAD: `ed29e6b` (specs recon said `12a775e`; HEAD moved since, owner's "change" commit).
- `git status --porcelain` count: 5 at session start (M CLAUDE.md; ?? CLAUDE.legacy.md, STAGES.md, prompts/, specs.md).
- Engine files tracked: yes (`git ls-files src/engine tests/engine` lists 7 files).
- package.json scripts: build, typecheck, lint, test, scrub, contrast, validate-dist, check, release, bakeoff, preview (no `gate` yet; S0.2 adds it).
- node_modules present: yes.
- node v24.19.0; npm 11.17.0.
- Not run (S0.2 does this): tsc, eslint, vitest, build.

## Gate baseline — filled by S0.2
Recon (unverified), from specs.md §2:
- tsc: 1 error.
- eslint: 4 errors.
- vitest: 1299 pass / 19 fail in 5 files; 88 files run; `tests/{build,budgets,release}.test.ts` not run by recon.
