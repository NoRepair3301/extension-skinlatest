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

---

# TEST_CLASSIFICATION — S3.2 (2026-11-05)

Importers of `plan/compile` before: `tests/guard.test.ts` (ALLOWED_PROPERTIES), `tests/ai/flow-safety.test.ts` (compileCss), `tests/rules.test.ts` (path string only, a fixture for the blur rule). After: none (`grep -rl "plan/compile" tests src` is empty).

Evidence used below. `ApplierOptions.guard` is declared at `applier-core.ts:28` and never read; `domGuardProvider` (`src/extension/guard-dom.ts`) is only handed to that unused option by `applier.ts:85`. `applier-core.run()` returns `steppedDown: false`, and `repairs` is just the seed echo; no code path builds a repair sheet from the page. `compileRepair/validateRepair/audit/addFailures/pickColor/snapshotText/captureMedia/mediaIntact/effectiveBackground` have no `src` caller outside `plan/readability.ts` and `plan/guard.ts`.

## tests/guard.test.ts (15 tests before, 8 failing; 28 now)
| test | property it protects | still exists in the engine world? (evidence) | verdict | reason |
|---|---|---|---|---|
| guard readings: colour behind through translucent ancestors; image or gradient makes it unknown; media intact until display/visibility/opacity/filter/bg-image change (3) | pure readings in `plan/guard.ts` | only `readability.ts` and tests call them; pass today | LEAVE -> S3.3 | S3.3 removes the dead chain together with these tests |
| repair decisions: pickColor, structural paths, repairCss groups and cap (3) | pure repair helpers in `plan/readability.ts` | no `src` caller outside readability; pass today | LEAVE -> S3.3 | one assertion changed: `ALLOWED_PROPERTIES.has(prop)` became `["color","background-color"]` (stricter: exactly what `parseRepairCss` accepts) |
| apply is never refused and every sampled pair reaches 4.5, x3 fixtures | apply goes on; text readable | repair sheet is gone, apply and readability remain | ADAPT: light-article and hero-bg x 6 themes (12 pass) | runs `createApplier` -> engine; floor measured on the painted DOM (4.5, 7 for high-contrast); text over a picture is skipped (backdrop unknown) |
| same, claude-like x 4 light themes | text readable | engine leaves text at 1.0:1 | FIXED 2026-11-05 (S3.4) (4) | Findings 2; fixed in dom.ts settleFollows, assertions unchanged |
| same, claude-like under midnight | text readable | white "Send" label 3.8:1 on its accent button | FIXED 2026-11-05 (S3.5) (1) | Findings 3; contrast against the effective backdrop, assertions unchanged |
| text over a picture or gradient gets its recorded original colour back | text over a photo stays legible | hero text becomes rgb(112,112,112) under calm-light | FIXED 2026-11-05 (S3.5) (1, redone on the hero-bg fixture) | Findings 3; url() rule keeps white on the picture, assertions unchanged |
| repair rules never name media and never carry text, ids or classes | content of a repair sheet | no repair CSS is generated; "media untouched" is covered by `tests/engine/dom.test.ts` "never touches media elements" | DELETE | structural output only |
| a theme that changes how a picture shows steps down the ladder | strategy ladder | `steppedDown` is constant false; `stepDown` has no caller | DELETE | ladder gone by design; media safety covered by the dom test above |
| Restore leaves the document byte-identical and removes both sheets | exact restore | yes, one engine sheet now | ADAPT (x3 fixtures) | 1 sheet while on, 0 and identical outerHTML after Restore |
| a page that re-renders gets repaired again by the bounded observer | re-render stays themed and readable | observer is the engine's (`dom.ts` ingest, addTree, watch) | ADAPT -> `tests/engine/rerender.test.ts` | Findings 1 |
| the new pairs are collected by structural path only | repair bookkeeping | dead (`addFailures`); passes | LEAVE -> S3.3 | goes with its code |

## tests/ai/flow-safety.test.ts
| test | verdict | reason |
|---|---|---|
| "is a type error to compile a plan that has not been validated" | ADAPT | now: a plan `validatePlan` refuses (`badPlan`) is rejected by the applier as `invalid-plan` and leaves no sheet, no engine and a byte-identical page; a good plan applies. The `@ts-expect-error` brand check went with `compileCss`. |
| "compileCss is called only by the applier, after validatePlan" | ADAPT | now: `createColorEngine(` is called only from `applier-core.ts` (outside `src/engine/`) and `validatePlan(` comes before it. The old test only passed because a comment contained `compileCss(`. |
| provider imports; payload tests | LEAVE | unchanged, live code |

## tests/rules.test.ts
`src/plan/compile.ts` appeared only as a fixture path in the blur-rule test. LEAVE with the path changed to `src/plan/schema.ts`; assertion unchanged.

## tests/restore-markers.test.ts, stored repair
| test | verdict | reason |
|---|---|---|
| accepts exactly what repairCss writes; rejects x8 | LEAVE | `parseRepairCss` is live (`sites.ts:113`) |
| a stored sheet is in place before the page is analysed | LEAVE | passes; delete it if the owner chooses to drop stored repair CSS |
| an unusable stored sheet is ignored | BUG | split out and renamed "BUG: ..."; applier injects `seedCss` verbatim (Findings 4, `workflow/S3.2_PROPOSED.patch`) |

## New: tests/engine/rerender.test.ts (37 tests)
Under each of the 6 themes: replaced node, removed and re-inserted node (page rewrites its colour while detached), class change, nodes added in an open shadow root (host added with its root; node added to a watched root; root existing at apply). 32 pass. FIXED 2026-11-05 (S3.5), was BUG: dark element with light text under the 4 light themes (4). BUG: shadow root attached after apply (1).

## Findings
1. **Re-render promise holds.** The engine observer (`dom.ts` ingest/addTree/watch) re-themes replaced, re-inserted and class-changed nodes and nodes added inside a watched open shadow root, and the I10 floor holds, under all 6 themes. Mutation check: with the observer stubbed out 31 of the 37 tests fail (the 6 not failing are the BUG dark-element tests).
2. **FIXED 2026-11-05 (S3.4), was BUG (engine): a colour equal to the parent's is skipped as "inherited".** `inspectElement` compares `cs.color` with the parent's computed colour. A page that declares the same colour twice (`html, body { color: X }`, or a button with its own `color` in a body of that colour) never gets the child repainted, so on a dark page under a light theme text keeps its dark-page colour on the new light background: 1.0:1 in `claude-like` (7 of 8 text pairs) under calm-light, ocean, warm-paper, field.
3. **FIXED 2026-11-05 (S3.5), was BUG (engine): text is lifted against the theme background only.** `makeTransform` nudges text to the floor against `tokens.bg`, not against the element's own backdrop. Under light themes light text on a dark element (banner, button, picture, gradient) is darkened to about 3:1 on its own background (also at first apply), and white hero text becomes grey. Under midnight the "Send" label is 3.8:1 on the accent button.
4. **BUG (applier): stored repair CSS has no validity check.** See HANDOFF.
5. **BUG (engine, edge): a shadow root attached to an already-connected host after apply is never watched**, so its content stays unthemed until something else triggers a full rescan. S3.4: roots are now adopted on the first host mutation, light-subtree mutation or event from inside the root (tests/engine/shadow-late.test.ts). The rerender BUG test has no signal at all (no mutation, event or timer) and stays BUG by owner decision (no timer allowed; see DECISIONS S3.4).

## Summary (S3.2)
Deleted 3 guard tests (repair-rule content, step-down ladder, old re-render case). Adapted: guard floor (12 pass) and restore (3), flow-safety (2), re-render (new file, 32 pass), rules fixture path. BUG kept failing: 12 (guard 6, restore-markers 1, rerender 5). LEAVE -> S3.3: 7 pure guard/readability tests. Left alone: all other files.

## S3.4
FIXED 2026-11-05: guard.test "BUG: a colour declared on both html and body is repainted" x4 (bug A), no assertion edits. Still BUG: rerender "BUG: a shadow root attached after the theme is on" (bug C, owner decision), and the 6 bug B tests (S3.5). New: tests/engine/inheritance.test.ts (37), tests/engine/shadow-late.test.ts (28). Adapted (owner-approved, out of scope): tests/engine/marker.test.ts "D4: properties the engine never writes are untouched (I3)" setup `color: rgb(200,0,0) !important` -> `color: inherit !important` (its premise was bug A).

## S3.5
FIXED 2026-11-05 (bug B), no assertion edits: guard.test "BUG: text keeps the floor against the element's own colour" claude-like under midnight (1); guard.test "BUG: text over a picture keeps its colour" hero-bg under calm-light (1); rerender.test "BUG: text on a dark element keeps the floor" under calm-light, ocean, warm-paper, field (4). Their "BUG:" names are left for S3.6 to remove. Still BUG: rerender "BUG: a shadow root attached after the theme is on" (bug C, owner decision). New: tests/engine/backdrop.test.ts (76: 12 groups x 6 themes + 4 light-theme cases).
