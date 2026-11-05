# TEST_CLASSIFICATION — S3.1 (2026-11-05)

Evidence for DELETE: `compileCss` has no caller in `src/` (`grep -rn compileCss src` -> only the definition and a comment at `applier-core.ts:108`). `applier-core.run()` builds the engine from `getTheme(themeId)` tokens and never compiles CSS. `ALLOWED_PROPERTIES` / `FONT_STACKS` are used only inside `plan/compile.ts` and by `tests/guard.test.ts`. There is no `plan/layouts` module; layout rules live in `plan/schema.ts` (validator, still live on the AI path) and `compile.ts` (dead).

| file | tests | what it checks | structural imports (evidence) | verdict | reason |
|---|---|---|---|---|---|
| tests/plan/compile.test.ts | 58 | compiled CSS of 6 themes: allowlist, scoping, no dangerous constructs, golden file; region/layout/template/strategy rules | `plan/compile` (compileCss, ALLOWED_PROPERTIES, FONT_STACKS) | DELETE (whole file) | Only exercises dead compileCss. Behaviour it protected (no media recoloured, no hidden page, restore exact) is covered by `tests/engine/*` (I1, I8, D12 in marker/ledger tests). |
| tests/golden/*.css (6) | - | golden output of compileCss | read only by compile.test.ts (`grep tests/golden`: one reader) | DELETE | Nothing reads them any more. Directory removed. |
| tests/compat.test.ts | 3 -> 1 | print untouched (sheet media = screen); "compiled theme keeps the page usable" | `plan/compile`, `plan/schema`, `plan/themeToPlan` | SPLIT: delete 2 compile cases, keep `print is untouched` | The kept test targets `THEME_SHEET_MEDIA` in `applier.ts` (live). |
| tests/plan/layouts.test.ts | 19 -> 17 | layout eligibility, validator, compiled layout templates, DOM order, prompt | `plan/compile` (2 cases) | SPLIT: delete `compiles fixed templates for each layout` and `the compiler drops a layout the page's risk markers forbid` | Rest tests schema validator, applier DOM-order/restore on the engine path, prompt text: all live. |
| tests/applier.test.ts | 55 | applier safety, bounded observer, region tags | `plan/themeToPlan` (live) | ADAPT: `tags regions with data-skinly-r only`; +1 new case | See DECISIONS. |
| tests/legacy.test.ts | 10 | legacy-portal invariants | `plan/invariants` (live) | ADAPT: 7 failing cases rewritten for the engine | See HANDOFF. |
| tests/guard.test.ts | - | repair / guard / readability | `plan/compile` (ALLOWED_PROPERTIES), guard, readability | LEAVE -> S3.2 | Instructed not to touch. |
| tests/ai/flow-safety.test.ts | - | compileCss called only after validatePlan; flow safety | `plan/compile` | LEAVE -> S3.2 | Not in scope. |
| tests/rules.test.ts | - | project rules; `src/plan/compile.ts` appears as a string fixture | none (string) | LEAVE -> S3.2 | Not in scope. |
| tests/restore-markers.test.ts | - | stored repair, fresh instance | `plan/readability` | LEAVE -> S3.4 | Not in scope. |
| tests/repair.test.ts, tests/plan/{repair,derive,themes,scene,schema,invariants,themeToPlan}.test.ts, tests/ai/*, tests/analyzer/* (incl. `*.expected.json` golden of the analyzer) | - | repair/contrast/schema/analyzer, all live code | no compile/layout CSS | LEAVE | Not structural-CSS tests. `fixtures/web/*.expected.json` is read by `tests/analyzer/fixtures.test.ts`, so it stays. |
| tests/frames.test.ts, tests/auto.test.ts | - | assert `[data-skinly-r]` is absent | none | LEAVE | Already engine-path assertions. |
| tests/features/{blur,tables,scenes-engine,...} | - | protected zones | - | LEAVE | Protected. |

## Summary
- Files deleted: 7 (compile.test.ts, 6 golden CSS). Cases deleted: 58 + 2 + 2 = 62.
- Files adapted: 2 (applier.test.ts 1 case rewritten + 1 added; legacy.test.ts 7 cases rewritten/replaced).
- No BUG findings: the engine satisfies every adapted invariant.
- Source with zero src importers now: `src/plan/compile.ts` (test-only importers remain: guard.test, flow-safety.test, rules.test string). Candidate for S3.3 after S3.2.
