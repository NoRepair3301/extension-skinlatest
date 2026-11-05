# HANDOFF — S4.1 Neutralise gating (F3: everything free)
Status: DONE     Date: 2026-11-05     Model/effort used: Sonnet 5.5 / high (per prompt)
## What changed (logic and the directly related tests)
- src/core/entitlements.ts — only `PlanFlag`, `Feature`, `canUse` (always true), `entitledThemes()` (all 6), `clampThemeId`/`clampPlan` (pass-through) remain; the rest deleted.
- src/ai/pipeline.ts, src/ai/prompt.ts — no plan flag, no clamps, AI offered all 6 themes (comments updated).
- src/extension/{auto-core,applier-auto,flow,commands,background}.ts — `loadPlan`/`readPlan` and clamp calls removed.
- tests/settings.test.ts, ai/pipeline.test.ts, commands.test.ts, auto.test.ts — lock expectations flipped to free behaviour.
- workflow/PREMIUM_INVENTORY.md (new), PLAN, LOG, DECISIONS.
## Gate results
tsc 0; eslint 0; vitest 1477 pass / 4 fail / 1481 tests in 96 files; build ok; validate-dist ok; `git diff --stat -- src/engine` empty.
Note: the opening baseline gate (green, 1482/1482) ran while I was already editing, so it is only a rough check; the S3.6 baseline in BASELINE.md is the reference.
## Red tests (all lock assertions, owned by later substages)
- tests/plus-ui.test.ts "My assets shows a calm locked state on Free…", "Free: Ocean, Warm paper and Field carry a small Plus mark…", "an expired plan flag counts as Free" — S4.2 (UI) / deleted in S4.4.
- tests/scene-page.test.ts "B4: without Plus a saved picture stays stored but is not shown…" — asserts the gate line in scene.ts: S4.2 un-gates it and adapts the test (S4.4 otherwise).
## Decisions made (also in DECISIONS.md)
Neutralised, not removed, the helpers UI/scene.ts still call; planFlag.ts untouched; PROMPT_VERSION stays "6".
## Out-of-scope touches
None. scene.ts and all .tsx untouched.
## Bugs found
None. Surprise: scene.ts:280 also clamps a stored Plus theme by plan (not only the My-assets line); now a no-op.
## Inventory summary (workflow/PREMIUM_INVENTORY.md; lines matched)
logic 31 (done), UI 103, backend src 47, backend dir 129, config 27, protected 7, tests 296, docs 216. Storage keys `plan`, `entitlement`, `auth` unchanged.
- S4.2: remove Plus UI and strings/CSS, un-gate My assets (Popup, Options, scene.ts gate line + clampPlan call), then delete `canUse`, `clampThemeId`, `clampPlan`, `PlanFlag`, planFlag.ts; adapt scene-page B4.
- S4.3: delete src/backend, backend/, dailyCheck in background.ts, premium scripts/config/env; migrate away keys.
- S4.4: delete backend, backend-client and plus-ui tests; clean other premium mentions.
- S4.5: docs sweep, archive premium docs.
## Owner manual checks
Load dist: all 6 themes selectable in the popup (Plus marks/dialog still show until S4.2 but no theme is locked); the AI "Change my page" and the keyboard command apply ocean/warm-paper/field.
## Suggested commit message
refactor(premium): neutralise gating, all six themes available (S4.1)
## Next substage: S4.2 — remove premium UI and un-gate My assets. Relies on: canUse/clampThemeId/clampPlan still exported (deprecated), planFlag.ts present.
