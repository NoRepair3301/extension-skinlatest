# HANDOFF — S3.3 Remove dead structural code; drop stored repair CSS (D13)
Status: DONE     Date: 2026-11-05     Model/effort used: Sonnet 5.5 / high (per prompt)
## What changed
- Deleted (evidence per file in workflow/DEAD_CODE.md §1-5): src/plan/compile.ts, src/plan/guard.ts, src/plan/readability.ts, src/extension/guard-dom.ts, src/features/repair/payload.ts, tests/repair.test.ts, workflow/S3.2_PROPOSED.patch. Also stepDown (schema.ts), createApplier option guard, repairRules(), repairStats()/RepairStats (§6).
- D13: applier-core.ts no longer takes or injects seedCss/repairCss; auto-core.ts, siteActions.ts, intent.ts, Popup.tsx (no repairRules read), api.ts (PageMethod) stop passing it; sites.ts SiteRecord has no repairCss. Old records load because parseSite reads named fields only (repairCss ignored, never written back; no migration, keys unchanged).
- Tests: restore-markers (D13 case), auto, popup, persistence, guard (dead groups removed). Docs: DEAD_CODE.md (new), PLAN, STAGES (S3.4-S3.6), specs.md D13, DECISIONS.
## Gate results
tsc 0; eslint 0. Engine dir 94 pass / 5 BUG (99). Full vitest before 1364 pass / 14 fail / 1378 tests / 94 files; after 1330 pass / 11 fail / 1341 tests / 93 files. Failing now = exactly the 11 BUG tests (guard 6, rerender 5); gone vs before: restore-markers stored-repair (adapted, passes), plus-ui B5 and scene-flow diagnostics (timing flakes, passed this run). src/engine diff empty. npm run build + validate-dist ok. grep repairCss src: only a comment in sites.ts:82 (no tolerant-read code needed).
Dist (before -> after bytes): applier.js 82681 -> 80649; applier-auto.js 18460 -> 17582; background.js 3779 -> 3779.
## Decisions made
D13 (specs §3, DECISIONS). Kept: plan/derive, plan/color (engine), plan/repair (ai/pipeline), plan/invariants, contrast. Dropped the guard-not-touched-early probe in the auto.test document_start case (the option no longer exists); other assertions unchanged.
## Out-of-scope touches
None beyond (c): schema.ts (stepDown + comment), applier.ts, api.ts, Popup.tsx, intent.ts, siteActions.ts, auto-core.ts: all D13 plumbing or broken-import fallout. 13 source files touched or deleted in total.
## Bugs found
Engine bugs unchanged (S3.4 A+C, S3.5 B). ApplyResult.repairs is now always 0. schema.ts:64 comment still mentions "the compiler". TEST_CLASSIFICATION still lists the stored-repair BUG (resolved by D13); S3.6 cleans it.
## Still-running structural pieces (DEAD_CODE.md §7)
analyze() (applier-core, ai/pipeline), validatePlan, snapshot/compare, region tagging data-skinly-r (AI plans only). Protected zones depend on plan/schema, plan/contrast, analyzer/eligibility only.
## Owner manual checks
npm run build, reload the unpacked extension, then: (1) apply a built-in theme on 2-3 normal sites from the popup; (2) reload one page so the auto path re-applies it; (3) press Restore original; (4) open Options and the popup and click through the tabs. No red errors in the page or service worker console. The known engine bugs are still present.
## Suggested commit message
refactor: remove dead structural code and stored repair CSS (S3.3, D13)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
## Next substage: S3.4 (Opus 5.5, high) — engine bugs A and C. Acceptance: 4 guard.test "colour declared on both html and body" + 1 rerender shadow-root BUG test. Relies on: src/engine untouched here, applier-core without the repair sheet.
