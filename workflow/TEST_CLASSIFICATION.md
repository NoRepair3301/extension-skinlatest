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

---

# TEST_CLASSIFICATION — S3.6 close of Stage 3 (2026-11-05)

No BUG rows remain open. Resolved this session or earlier:
- Findings 4 (stored repair CSS has no validity check): closed by D13 (S3.3). Stored `repairCss` is dropped, nothing injects it, and the restore-markers/auto/popup cases assert that. No test carries the BUG name any more (`grep -rn BUG tests` is empty).
- Findings 5 / rerender "BUG: a shadow root attached after the theme is on": ADAPTED in S3.6 (case a). The test gave the engine no signal at all, which S3.4's design (owner decision: signals only, no timer) explicitly does not cover. It now changes a class on the host after attaching the root, the documented signal; the no-signal limit stays a documented limitation, and `tests/engine/shadow-late.test.ts` (28) covers every signal under all 6 themes. See DECISIONS S3.6.
- The "BUG:" prefix was removed from the already-fixed bug A and B test names (guard.test.ts x3 describes, rerender.test.ts x1); assertions untouched.

## Closing summary, Stage 3
- Deleted: 7 files (compile.test.ts, 6 golden CSS) and about 62 + 3 + the guard/repair/restore groups of S3.3 (tests/repair.test.ts and parts of guard.test.ts and restore-markers.test.ts) because the code they exercised is gone.
- Adapted: applier.test.ts (1 rewritten, 1 added), legacy.test.ts (7), guard.test.ts (restore 3, floor 12), flow-safety.test.ts (2), rules.test.ts (path), marker.test.ts D4 (S3.4, owner-approved), rerender.test.ts shadow-late case (S3.6), restore-markers/auto/popup stored-repair cases (D13).
- Fixed in the engine with the original assertions kept: bug A (4 guard tests, S3.4), bug B (6 tests, S3.5). Bug C: engine adopts late roots on a signal (28 new tests); the one no-signal test adapted as above.
- New tests: rerender (37), inheritance (37), shadow-late (28), backdrop (76).
- Test determinism fixes (S3.6): scene-flow diagnostics test (stale 4 s snapshot timers cleared per test), client.test.ts signature tamper (was a no-op 1 time in 16).

---

# TEST_CLASSIFICATION — S4.4 premium tests (2026-11-05)

Search (case-insensitive) over tests/: plus|premium|paywall|subscri|checkout|entitle|canUse|planFlag|clampThemeId|clampChoice|clampPlan|free"|locked|upgrade|sign.?in|account|supabase|backend|license, plus the words plan, free, tier, auth, clamp. Most hits are ordinary words ("blocked", "plan" as the theme-plan type, "free" gutter/space, "auth" provider error, "account" as redacted page text, "clamp" maths). The paid-tier files themselves (tests/backend/*, tests/backend-client/*, tests/plus-ui.test.ts) were deleted in S4.2/S4.3 with the code they tested.

| file | test | what it protects | verdict | reason |
|---|---|---|---|---|
| tests/scene-flow.test.ts | beforeEach fixture store.set("plan", plus) + "predate Skinly Plus" comment | scene flows as a Plus user | ADAPT | nothing reads plan any more; fixture and comment removed, no assertion touched |
| tests/scene-page.test.ts | beforeEach fixture plan: plus + "pictures are a Plus feature (B4)" comment | same | ADAPT | fixture and comment removed |
| tests/scene-page.test.ts | "My assets is free: a leftover free plan flag..." | My assets shows a picture with no entitlement | ADAPT | renamed T6, no plan fixture, now also asserts that storage reads never touch plan/entitlement/auth |
| tests/release.test.ts | "claims nothing the extension does not do" (3 asserts on the backend/plan wording of PRIVACY and data-use.md) | docs describe the Plus backend | ADAPT | the three asserts removed; the other claims stay. The docs still contain the old text until S4.5, which must add a negative assert |
| tests/popup.test.ts | "every theme is selectable and none carries a mark or lock (all free)" | six themes selectable | ADAPT | renamed T6; added: no disabled/aria-disabled radio, selected radio is checked, no plus/premium/upgrade words |
| tests/settings.test.ts | "entitlements (F3: everything is free)" | entitledThemes() lists all six | KEEP | already free behaviour (adapted S4.1), no plan argument |
| tests/ai/pipeline.test.ts | "transform: all six themes are free (F3)" (2) | saved baseline and AI theme list | KEEP | already free behaviour (S4.1) |
| tests/options-tabs.test.ts | "an address hash naming the removed Plan and account tab falls back to General" | removed tab id falls back | KEEP | already covers "stored last-tab pointing at a removed tab" (the hash is the only stored last tab) |
| tests/options-tabs.test.ts | "has the nine sections..." | tab list | KEEP | already free |
| tests/migration.test.ts | 4 cases | retired keys removed, others intact, idempotent | KEEP | S4.3 coverage is complete |
| tests/build.test.ts | "flags backend secrets and the service role name in built files" | validate-dist secret scan (service_role, whsec_, private key) | KEEP | the scanner is still in scripts/validate-dist.ts as a generic secret guard (S4.3 decision); only the test name carries old wording |
| tests/rules.test.ts, tests/auto.test.ts, tests/persistence.test.ts | S4.3 adaptations | | KEEP | already free |
| tests/diag.test.ts, scrub, options-tabs, scene-flow ("account" markers) | page-text leak markers | | KEEP | unrelated ("account" is fake page text) |
| all "blocked" / "auth" / "free space" hits | | | KEEP | unrelated words |

Verdict counts: DELETE 0 (all done earlier: S4.2 plus-ui, S4.3 backend and backend-client), ADAPT 5, KEEP the rest, BUG 0.

New T6 tests (10 cases): tests/free-for-all.test.ts (2: no removed symbol or path in src; entitlements.ts exports only a no-arg entitledThemes), tests/ai/prompt.test.ts (1: theme list in prompt and schema), tests/ai/pipeline.test.ts (6: each built-in theme applied as itself), tests/options-tabs.test.ts (1: nine tabs, none about plan/account), plus the renamed popup and scene-page tests.
Note: the guard pattern omits entitledThemes (listed in the prompt) because S4.1 kept it on purpose as the "all six themes" helper used by pipeline.ts; the test pins its shape instead.
