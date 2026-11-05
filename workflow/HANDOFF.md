# HANDOFF — S4.4 Premium tests: remove dead, adapt, prove "everything is free"
Status: DONE     Date: 2026-11-05     Model/effort used: Sonnet 5.5 / high (per prompt)
## What changed
- tests/scene-flow.test.ts, tests/scene-page.test.ts — Plus plan fixture + comments removed; scene-page "My assets" test is now T6 (no entitlement key is read).
- tests/release.test.ts — 3 backend/plan privacy-doc asserts removed (docs still say it until S4.5).
- tests/popup.test.ts — theme test renamed T6, added no-disabled / checked / no Plus words.
- tests/ai/prompt.test.ts (+1 T6 theme list), tests/ai/pipeline.test.ts (+6, one per theme), tests/options-tabs.test.ts (+1 T6 tabs).
- tests/free-for-all.test.ts (new, 2): src scan for removed symbols/paths; entitlements.ts shape.
- workflow/{PLAN,LOG,DECISIONS,TEST_CLASSIFICATION,PREMIUM_INVENTORY,HANDOFF}.md.
## Gate results
Before: tsc 0; eslint 0; vitest 1430 pass / 0 fail / 90 files (no failing set). After: tsc 0; eslint 0; vitest 1440 pass / 0 fail / 91 files. build + validate-dist ok. git diff --ignore-cr-at-eol --stat -- src is empty. tests/engine green. The plus-ui flake: file gone since S4.2; no flake seen in the 2 full gate runs.
## TEST_CLASSIFICATION S4.4 summary
Deleted 0 (files removed earlier: S4.2 plus-ui.test.ts; S4.3 tests/backend/* x6 + tests/backend-client/client.test.ts); adapted 5; kept the rest (build "backend secrets" scan kept: the scanner still exists); BUG 0.
## Positive tests, mutation-checked on a scratch copy (all failed as expected, copy removed)
free-for-all (added a canUse export), prompt theme list (dropped "field"), pipeline per theme (field to calm-light), popup (disabled field radio), options tabs (added a plan tab), My assets (extra storage read of "plan" inside assetStore; a first attempt at module level did not fail because mockClear runs later, so it was redone inside the read path), migration (dropped the "plan" key).
## Decisions made (also in DECISIONS.md)
Guard pattern leaves out entitledThemes (S4.1 kept it as the no-arg helper; its shape is pinned instead). No negative doc assert in release.test.ts yet (it would fail until S4.5).
## Out-of-scope touches
None (src/ untouched).
## Bugs found
None. Note: src/core/entitlements.ts still has the name entitledThemes (pipeline.ts:18,150): behaviour is free; a rename is cosmetic, owner's call.
## Owner manual checks
None needed beyond the earlier stages (tests only).
## Suggested commit message
test(premium): remove paid-tier tests, cover free behaviour for all six themes (S4.4)
## Next substage: S4.5 (Haiku 5.5, medium) — docs. Checklist: README, CHANGELOG, docs/* (PRIVACY.md and data-use.md still describe the Plus backend: edit, then add a negative assert to tests/release.test.ts), archive premium docs, specs/STAGES/CLAUDE.legacy/prompt-launch mentions, manifest check.
