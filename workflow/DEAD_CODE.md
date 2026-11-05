# DEAD_CODE — S3.3 verdicts (2026-11-05)

Method: grep over `src`, `tests`, `scripts`, config (`vite.config.ts`, `package.json`, `tsconfig*`, `eslint.config.*`, `manifest*`) after the D13 edits and before each deletion. "Same batch" means a file deleted in the same step. Docs mentions are listed only. Protected zones (pet, blur, scenes, palette, tables, freespace) import none of the deleted modules (checked in section 7). No file under `src/engine/` was touched.

Deletion batches (`npm run gate -- --only tsc,eslint` after each, both 0): 1. `compile.ts`. 2. `guard-dom.ts`, `payload.ts`, `tests/repair.test.ts`, `guard.ts`, `readability.ts`. 3. `stepDown`.

## Verdict table
| Candidate | Verdict | Why |
|---|---|---|
| `src/plan/compile.ts` (246 lines) | DELETED | 0 importers anywhere (section 1) |
| `src/extension/guard-dom.ts` (59) | DELETED | only importer was `applier.ts`, which passed it as the `guard` option; `createApplier` never read that option (section 2) |
| `src/plan/guard.ts` (106) | DELETED | importers were `guard-dom.ts` (deleted) and the unused `guard` option type in `applier-core` (removed); tests only exercised its own functions (section 3) |
| `src/plan/readability.ts` (257) | DELETED | importers were `Popup.tsx` and `sites.ts` (D13 plumbing, removed) and `payload.ts` (deleted) (section 4) |
| `src/features/repair/payload.ts` (119) | DELETED | 0 importers in `src`; only `tests/repair.test.ts` (deleted). The AI repair flow is gone (D6) (section 5) |
| `schema.ts` `stepDown` | DELETED | 0 references anywhere (section 6) |
| `applier-core` `guard` option, `repairStats`, `RepairStats`, `repairRules`, `seedCss` | REMOVED | 0 callers outside D13 plumbing (section 6) |
| `src/plan/derive.ts` | KEPT | imported by `src/ui/theme.ts` and `tests/plan/derive.test.ts` |
| `src/plan/color.ts` | KEPT | imported by `src/engine/transform.ts` (`nudgeForeground`) |
| `src/plan/repair.ts` | KEPT | `repairTokens` is imported by `src/ai/pipeline.ts` (the AI baseline path, still live) |
| `src/plan/invariants.ts` | KEPT | `snapshot`/`compare` run on every apply in `applier-core` |
| `src/plan/contrast.ts`, `nearestTheme.ts`, `themeToPlan.ts`, `schema.ts` | KEPT | live importers (engine, ai, popup, scenes) |

Iteration to a stable state: after the batches, a scan of every `src` file for a basename reference outside itself found none unreferenced. Exports with no reference outside their own file remain (types and a few helpers such as `showBanner`, `updateSites`, `strategyFor`, `isPlusTheme`, `createPageScene`). They are used inside their file, are protected-zone or Stage 4 code, or are not structural; none was touched.

## 1. `src/plan/compile.ts`
- (1) `grep -rnE "from [\"'][^\"']*plan/compile(\.ts)?[\"']" src` -> none.
- (2) `grep -rn "plan/compile" tests scripts vite.config.* package.json tsconfig*.json eslint.config.* manifest*` -> none.
- (3) `grep -rnE "(import|require)\([^)]*compile" src tests scripts` -> none; no config mentions.
- (4) type-only usage: none (a comment `Historical structural pipeline: compileCss(...)` in `applier-core.ts` was removed with it).
- (5) docs: CLAUDE.legacy.md, docs/ARCHITECTURE.md, docs/AUDIT.md, docs/BUGS.md, docs/FINAL_REPORT.md, docs/PHASE_2.md, docs/PHASE_4.md, docs/PROGRESS.md.

## 2. `src/extension/guard-dom.ts`
- (1) `grep -rnE "from [\"'][^\"']*guard-dom(\.ts)?[\"']" src` -> before the `applier.ts` edit: `src/extension/applier.ts:6`. `applier.ts` only passed `guard: domGuardProvider(document)` to `createApplier`; `applier-core.ts` declared `guard?: GuardProvider` and never read it. Both removed, then 0 importers.
- (2) tests/scripts/config -> none. (3) dynamic/string -> none. (4) type-only: none besides the `GuardProvider` import below.
- (5) docs: docs/ARCHITECTURE.md, docs/PROGRESS.md, prompts/S3.3.md, workflow/HANDOFF.md (old), workflow/TEST_CLASSIFICATION.md.

## 3. `src/plan/guard.ts`
- (1) static imports in `src`: `src/extension/guard-dom.ts:1` (deleted, same batch) and `src/extension/applier-core.ts:10` (type import for the unused `guard` option, removed). No other file.
- (2) tests: `tests/guard.test.ts:5` and `tests/auto.test.ts:12`. The guard.test.ts groups "guard readings (pure)" (3 tests: effectiveBackground, backdrop, mediaIntact) used only guard.ts functions and were deleted; the type-only `GuardProvider` use in the document_start case of `tests/auto.test.ts` was removed (see Tests below). Scripts/config -> none.
- (3) dynamic/string -> none. (4) type-only: covered above. (5) docs: CHANGELOG.md, docs/ARCHITECTURE.md, docs/AUDIT.md, docs/BUGS.md, docs/PHASE_4.md, docs/PROGRESS.md, docs/REVIEW.md, docs/SPEC.md.
- Note: the media-untouched promise (I-media) is covered by the engine tests (`tests/engine/*`), not by the deleted `mediaIntact` test, which measured a provider stub, not the engine.

## 4. `src/plan/readability.ts`
- (1) `src`: `src/features/repair/payload.ts:1` (type, deleted same batch); `src/extension/popup/Popup.tsx:10` and `src/extension/sites.ts:8` (both D13 plumbing, imports removed).
- (2) tests: `tests/repair.test.ts:3` (deleted), `tests/guard.test.ts:6` (groups "repair decisions", "repair bookkeeping" deleted: pickColor, pathOf, repairCss, addFailures, audit, snapshotText), `tests/restore-markers.test.ts:6` (parseRepairCss cases deleted, replaced by D13 cases). Scripts/config -> none.
- (3) dynamic/string -> none. (5) docs: CHANGELOG.md, CLAUDE.legacy.md, docs/ARCHITECTURE.md, docs/BUGS.md, docs/PROGRESS.md, docs/QA.md, docs/REVIEW.md, docs/SPEC.md.

## 5. `src/features/repair/payload.ts`
- (1) `src`: none. (2) tests: `tests/repair.test.ts:2` (deleted: the payload sanitiser, compileRepair and validateRepair cases; every subject is a deleted module). Scripts/config -> none. (3) dynamic/string -> none.
- (5) docs: CLAUDE.legacy.md, docs/ARCHITECTURE.md, docs/AUDIT.md, docs/FINAL_REPORT.md, docs/PHASE_10.md, docs/PHASE_11.md, docs/PHASE_4.md, docs/PHASE_9.md. If AI repair ever returns, its payload sanitiser starts from git history (S3.2 commit or earlier).
- The folder `src/features/repair/` is now empty and gone.

## 6. Exports and members removed
- `stepDown` (`src/plan/schema.ts`): `grep -rnw stepDown src tests scripts` -> only its definition. Also reworded the `STRATEGIES` comment that said the guard steps down the list.
- `createApplier` option `guard`; `seedCss` parameter and the `repairSheetHandle` / `lastRepairCss` state; `repairRules()`; `repairStats()` and `RepairStats`: `grep -rn "repairStats\|RepairStats" src tests scripts` -> only the definition; `repairRules` was called only by `Popup.tsx` (`runInPage(..., "repairRules")`, removed) and mocked in `tests/persistence.test.ts` (mock entry removed). `PageMethod` in `api.ts` lost `"repairRules"`.
- `ApplyResult.repairs` stays in the type and is now always 0 (its readers are unchanged; removing the field is a separate, optional cleanup).

## 7. Still-running structural pieces (reported, not touched; their fate is a later decision)
- `analyze()` (`src/analyzer/analyze.ts`): called by `applier-core` for every non-token apply and by the AI path (`ai/pipeline`: `decideGate`, `checkUrl`). Other analyzer importers: `eligibility.checkUrl` (applier-auto, commands, Popup, Options, petActions), `fingerprint` (`similar` in auto-core, `fnv1a` in siteActions).
- `validatePlan` (`src/plan/schema.ts`): runs in `applier-core` before the engine and in `ai/pipeline`. A stale comment at `schema.ts:64` still says "The compiler only accepts this type".
- `snapshot`/`compare` (`src/plan/invariants.ts`): run around every apply in `applier-core`; an invariants failure rolls the apply back.
- Region tagging `data-skinly-r`: still set by `applier-core` when a plan carries `regionRules` (AI plans only; built-in themes carry none) and cleaned by `cleanup.ts`.
- Protected zones depending on the structural code: `src/features/scenes/types.ts` (SCENE_IDS from `plan/schema`), `src/extension/sceneConfig.ts` (`plan/schema` types, `plan/contrast.isDark`), `src/extension/petActions.ts` (`analyzer/eligibility.checkUrl`). None depends on `analyze()`, `plan/guard`, `plan/readability` or `plan/compile`.

## Tests deleted or adapted (S3.3)
- Deleted: `tests/repair.test.ts` (whole file); in `tests/guard.test.ts` the groups "guard readings (pure)", "repair decisions", "repair bookkeeping (structural paths)" and the helpers only they used (`cascade`, `Model`, `GOOD`, `hexToRgb`); in `tests/restore-markers.test.ts` the `parseRepairCss` accept/reject cases and the "stored sheet is in place" case.
- Adapted: `tests/restore-markers.test.ts` (new group: a stored record carrying `repairCss` loads, the field is not carried into the parsed record, nothing is injected, Restore leaves no sheet and a byte-identical document); `tests/auto.test.ts` (stored-rules case now asserts the CSS is injected nowhere; the document_start case lost its `guard` provider and its "guard not touched early" probe, the other assertions are unchanged); `tests/popup.test.ts` (asserts the saved site has no `repairCss` and the page is never asked for `repairRules`); `tests/persistence.test.ts` (dropped a mock entry).
- The 11 other BUG tests (`tests/guard.test.ts` x6, `tests/engine/rerender.test.ts` x5) are untouched and fail for the same reasons.
