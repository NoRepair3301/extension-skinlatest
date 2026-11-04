# STAGES.md — master map (31 substages, one session each, one prompt per session)

Place at `extension-new/STAGES.md`. S0.1 turns it into the status tracker `workflow/PLAN.md`.

How it runs: owner says "bring on S<x.y>" in the planning chat, receives `prompts/S<x.y>.md` plus the CLI prompt and the recommended model and effort, pastes the file into `prompts/`, starts a fresh Claude Code session, runs it, tests by hand, then commits and tags manually.

Model scale: Haiku 5.5 (light mechanical), Sonnet 5.5 (default), Opus 5.5 (hard reasoning, design, engine). Effort: low / medium / high.
Order is by dependency: tooling, green baseline, engine restore, tests and dead code, premium removal, F1 UX, rename, verification.

## Stage 0 — Workspace

| ID | Title | Model / effort | Why |
|---|---|---|---|
| S0.1 | Bootstrap workspace: `workflow/`, `prompts/`, `docs/MANUAL_CHECKLIST.md`, rules reconciliation, decisions seed. No source edits. | Sonnet 5.5 / medium | Structured file creation and reading legacy rules |
| S0.2 | Gate tooling: `scripts/gate.mjs` + `npm run gate` (compact tsc/eslint/vitest summary), full baseline run into `workflow/BASELINE.md` including the 3 side-effecting tests and a build | Sonnet 5.5 / medium | Small script plus careful measurement |

## Stage 1 — Green compile and lint, aiRepair decision

| ID | Title | Model / effort | Why |
|---|---|---|---|
| S1.1 | T1: declare `PropRecord` (`dom.ts:57`); remove unused `normalizeCssColor`, `ColorTransformer` imports (`dom.ts:4-5`). Gate: tsc 0 errors. | Haiku 5.5 / low | Three-line fixes |
| S1.2 | T4 / D6: remove `aiRepair` closure, `src/ai/repair.ts`, REPAIR consent plumbing, `repairPayload/applyRepair` stubs and port methods; fix unused `isBuiltinThemeId`; adapt the "AI repair in flow" test. Record the one-line justification. Gate: eslint 0 errors. | Sonnet 5.5 / high | Wide ripple through interfaces |

## Stage 2 — Engine restore correctness (T2, F2, T5)

| ID | Title | Model / effort | Why |
|---|---|---|---|
| S2.1 | Ledger and guarded per-prop `reset()` per I2–I6 (record `hadStyleAttr`, restore only if current equals `m`, drop empty attribute) + unit tests (exact restore, priority, no-attribute case, page-changed prop not overwritten). | Opus 5.5 / high | Core correctness, subtle invariants |
| S2.2 | Refresh path: `refreshBatch`/observer re-theme without whole-attribute reset; I5 re-basing; "page style changes survive a refresh" tests; no feedback loops. | Opus 5.5 / high | Interplay of observer, timers, ledger |
| S2.3 | Fresh-instance restore (D4): engine-aware `markerCleanup` (recognise engine sheet, root markers), marker carries minimal ledger data (props written; page-owned originals). Fixes `restore-markers` failures. | Opus 5.5 / high | Cross-module design (engine and cleanup) |
| S2.4 | T5 / D9: test that `runAuto` reaches the engine via the applier; `applier-auto` fails safe if applier missing; `validate-dist` asserts marker in `applier.js` and no engine in `applier-auto.js`; rebuild and verify. | Sonnet 5.5 / medium | Tests and a small guard |

## Stage 3 — Tests and dead code (T3)

| ID | Title | Model / effort | Why |
|---|---|---|---|
| S3.1 | Delete pure structural tests (compile, layouts, compat, golden css + runner/fixtures); adapt `applier.test` region-tag case and `legacy.test` invariants to the engine. | Sonnet 5.5 / medium | Mostly mechanical, clear list |
| S3.2 | Rewrite or retire tests that import `plan/compile` (guard, rules, ai/flow-safety) against the engine; investigate the guard "re-render" case and report real bugs. | Sonnet 5.5 / high | Judgment: adapt vs delete vs bug |
| S3.3 | Remove dead structural code with grep evidence (`plan/compile.ts` first); write `workflow/DEAD_CODE.md` with a verdict per remaining candidate (`derive`, `guard`, `readability`, `repair`, `payload`). | Sonnet 5.5 / high | Deletions must be evidence-backed |
| S3.4 | Residual failures: full `vitest run` incl. build/budgets/release tests green. | Sonnet 5.5 / medium | Sweeper |

## Stage 4 — Remove premium (T6, F3)

| ID | Title | Model / effort | Why |
|---|---|---|---|
| S4.1 | Neutralise gating: `canUse` removed or always true, `entitledThemes` returns all 6, clamp helpers pure; remove `planFlag` and its non-UI call sites; AI prompt theme list = all 6. | Sonnet 5.5 / high | Many call sites |
| S4.2 | UI: delete `PlusDialog`, `PlanAccount`, Plus badges/locks/strings, Options tab; un-gate My assets (Options and Popup call sites, `scene.ts` gate line only). | Sonnet 5.5 / high | Wide UI sweep, protected-zone exception |
| S4.3 | Backend: delete `src/backend/`, `backend/`, `scripts/gen-entitlement-keys.mjs`, tsconfig include, validate-dist Supabase allowances, env example vars, package scripts; migration clears `auth/entitlement/plan` keys. | Sonnet 5.5 / medium | Deletions plus config |
| S4.4 | Tests: remove `tests/backend*`, `plus-ui`; adapt popup, popup-pet, auto, commands, settings, scene-flow, scene-page, pipeline, rules, ai/prompt tests. | Sonnet 5.5 / high | Many files, must stay meaningful |
| S4.5 | Docs: README, CHANGELOG, docs; move premium docs, `PROMPTS.md`, `prompt-launch.txt` Part B to `docs/archive/premium/`; manifest check. | Haiku 5.5 / medium | Prose sweep |

## Stage 5 — F1: theme click applies

| ID | Title | Model / effort | Why |
|---|---|---|---|
| S5.1 | Design only: read popup/api/applier/keeper flow, write `workflow/F1_DESIGN.md` (gesture and permission handling, un-pause, re-theme, error states). No code. | Opus 5.5 / high | Gets the flow right before touching UI |
| S5.2 | Implement: theme radios (and Auto) run the apply path, persist choice, save site memory; tests. | Opus 5.5 / high | Permission and gesture subtleties |
| S5.3 | Restore polish (F2 UX): button state, un-pause on next theme click, shortcut parity, exact-restore integration test. | Sonnet 5.5 / high | Behavioural tests |
| S5.4 | Edge states: ineligible pages, permission denied, progress and error strings. | Sonnet 5.5 / medium | UI polish |

## Stage 6 — Rename to Repaint (F4, D3)

| ID | Title | Model / effort | Why |
|---|---|---|---|
| S6.1 | `workflow/RENAME_MAP.md` (old to new per class) + `scripts/rename-check.mjs` (leftover scan with allowlist). No sweeping. | Sonnet 5.5 / medium | Map first |
| S6.2 | DOM markers `data-skinly*` to `data-repaint*` across src and tests (engine, cleanup, features: identifier-only). | Sonnet 5.5 / high | Wide, contract-critical |
| S6.3 | Globals `skinly*` to `repaint*`, message `skinly-badge-on`, IIFE names, `runInPage`/api contract, vite config, validate-dist. | Sonnet 5.5 / high | Cross-bundle contract |
| S6.4 | CSS ids/classes; theme code `repaint1:` with `skinly1:` import compat + test. | Sonnet 5.5 / medium | Small, tested |
| S6.5 | Package/manifest/scripts/release names, asset file names; list binary icons that need owner redraw. | Sonnet 5.5 / medium | Config |
| S6.6 | User-visible strings, docs, README, CHANGELOG entry; run rename-check to clean. | Haiku 5.5 / medium | Prose |

## Stage 7 — Verification and finish

| ID | Title | Model / effort | Why |
|---|---|---|---|
| S7.1 | (D11, optional) Browser harness core: CDP client, Chrome launcher, applier injection, `npm run test:browser`. | Sonnet 5.5 / high | Careful protocol code, zero deps |
| S7.2 | (D11, optional) Fixture pages and scenarios: 6 themes, hover, shadow DOM, native dark, iframe, exact restore. | Sonnet 5.5 / high | Assertion design |
| S7.3 | `npm run check`, `npm run build`, `NOTICE.md` (D1), finalise `docs/MANUAL_CHECKLIST.md`, 12-line final report. | Sonnet 5.5 / medium | Closing gate |
| S7.4 | Independent audit, no edits: diff vs specs, leftover `skinly`/`plus` grep, invariant spot-checks, risks list. | Opus 5.5 / high | Fresh eyes need strong reasoning |

Rules for every substage prompt (generated later): Session settings block, preconditions, allowed scope, ordered steps, expected gate state, HANDOFF items for the owner's manual test, suggested commit message.
