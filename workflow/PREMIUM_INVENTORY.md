# PREMIUM_INVENTORY (S4.1, 2026-11-05)

Method: case-insensitive grep for `canUse|entitle*|planFlag|PlanFlag|loadPlan|readPlan|PlusDialog|PlanAccount|paywall|subscri*|checkout|stripe|licen[sc]e|clampPlan|clampThemeId|isPlus|Plus|premium|supabase|buildConfig|dailyCheck|plus-ui|locked`, read over every hit. Counts are matching lines, taken after S4.1's edits. Ordinary English "plus"/"plan" (`src/plan/*`, "X plus Y" comments) is not premium and is left out of the lists below.

## Counts per category
| Category | Lines | Where | Owner |
|---|---|---|---|
| logic (done in S4.1) | 31 | core/entitlements.ts, ai/pipeline.ts, ai/prompt.ts, extension/{auto-core,applier-auto,flow,commands,background}.ts | S4.1 |
| UI | 103 | popup/{Popup.tsx,PlusDialog.tsx,popup.css}, options/{Options.tsx,PlanAccount.tsx,options.css}, ui/strings.ts (`plus` block + `about.free` copy), extension/planFlag.ts | S4.2 |
| backend/config (src) | 47 | src/backend/{auth,config,entitlement,http}.ts | S4.3 |
| backend/config (other) | 129 + 27 | backend/ (supabase functions, migration `..._plus.sql`, seed, rls test, .env.example); scripts/{gen-entitlement-keys.mjs,rules.ts,validate-dist.ts}, tsconfig.json, vite.config.ts, vitest.config.ts, types/{deno-min,env}.d.ts | S4.3 |
| protected zone | 7 | extension/scene.ts:15,16,129,130,279,280 (canUse/clampPlan/loadPlan), sceneConfig.ts comment | S4.2 (only the My-assets gate line; clampPlan call is now a no-op) |
| tests | 296 | tests/backend/* (5 files + helpers), tests/backend-client/client.test.ts, tests/plus-ui.test.ts, plus mentions in build, rules, popup, popup-pet, release, scene-flow, scene-page | S4.4 |
| docs | 216 | README, CHANGELOG, docs/* (PLUS_SPEC, BACKEND_SETUP, SECURITY_BACKEND, backend/supabase, store/*, PHASE_*, ...), fixtures/web/INDEX.md | S4.5 |

## Logic symbols (S4.1)
| Symbol | File | Treatment |
|---|---|---|
| `canUse` | core/entitlements.ts | always true, `@deprecated removed in S4.2` (callers: Popup.tsx:501,558,565; Options.tsx:258; scene.ts:130) |
| `entitledThemes` | core/entitlements.ts | no parameter, returns all 6 in `BUILTIN_THEME_IDS` order; used by pipeline.ts:150 for the AI prompt and schema |
| `clampThemeId`, `clampPlan` | core/entitlements.ts | pass-through, `@deprecated` (UI callers: Popup.tsx:220; scene.ts:280) |
| `clampChoice`, `nearestEntitled`, `isPlusTheme`, `TIERS`, `PlusThemeId` | core/entitlements.ts | deleted; grep of src, tests, scripts shows no reference |
| `loadPlan` / `readPlan` deps | pipeline, auto-core, commands, applier-auto, flow, background | removed from every non-UI call site |
| `PlanFlag` type | core/entitlements.ts | kept for UI/backend (Popup, Options, PlanAccount, planFlag.ts, backend/entitlement.ts) |

## Storage keys (unchanged; migration is S4.3)
`plan` (extension/planFlag.ts:9), `entitlement` (backend/entitlement.ts:15), `auth` (backend/auth.ts:10).

## Surprises
- `scene.ts` (protected) also clamps a stored Plus theme by plan (line 280) in addition to the My-assets gate; both now open because the helpers are pass-through. No edit was made to it.
- `background.ts` still runs `dailyCheck` from the backend (S4.3 removes it).
- `tests/scene-page.test.ts` B4 asserts the lock through scene.ts, so it is red until S4.2 removes the gate line.
- `.env.local` and `private/` exist; not read.

## Checklists
- **S4.2:** delete PlusDialog, PlanAccount, plus marks/locks in Popup and Options, `S.plus` strings and the CSS (`plus-mark`, `locked`, `plus-list`); un-gate My assets in Popup/Options and the one gate line in scene.ts (+ the clampPlan call); remove `canUse`, `clampThemeId`, `clampPlan`, `PlanFlag`, `planFlag.ts` once unreferenced; adapt tests/scene-page.test.ts B4.
- **S4.3:** delete `src/backend/`, `backend/`, `dailyCheck`/`buildConfig` in background.ts, `gen-entitlement-keys`, validate-dist Supabase allowances, tsconfig include, vite/vitest/env types, `.env.example`; migrate (remove) storage keys `plan`, `entitlement`, `auth`.
- **S4.4:** delete tests/backend/*, tests/backend-client/*, tests/plus-ui.test.ts; clean premium mentions in build, rules, popup, popup-pet, release, scene-flow tests.
- **S4.5:** README, CHANGELOG, manifest text, docs updated; premium docs moved to docs/archive/premium/.

## S4.2 status (2026-11-05)
- [x] UI rows: PlusDialog, PlanAccount, Popup/Options locks/marks/dialog/tab, `S.plus`, `options.tabs.plan`, CSS (plus-mark, locked, plus-list) - done.
- [x] My assets un-gated in Popup, Options and scene.ts (gate line).
- [x] `canUse`, `Feature`, `clampThemeId` deleted. tests/plus-ui.test.ts deleted (could not compile).
- [ ] Left for S4.3: `clampPlan` call in scene.ts:277 (protected, no-op) + `loadPlan` import there, `clampPlan`/`PlanFlag` in entitlements.ts, `planFlag.ts`, `dailyCheck` in background.ts, src/backend, backend/, config, scripts, storage keys.
- [ ] Left for S4.4: tests/backend/*, tests/backend-client/*, "Plus" comments in tests/scene-flow.test.ts and tests/scene-page.test.ts (plan store.set lines), build/rules/release tests.

## S4.3 status (2026-11-05)
- [x] src/backend/ (4), backend/ (19 tracked files), scripts/gen-entitlement-keys.mjs, types/{env,deno-min}.d.ts, .env.example, extension/planFlag.ts deleted; dailyCheck/buildConfig out of background.ts; clampPlan/PlanFlag out of entitlements.ts and scene.ts.
- [x] tsconfig include, validate-dist Supabase host and anon-JWT allowances, rules.ts backend dir and storage keys cleaned.
- [x] Migration: `migrateStorage` (schema v3) removes `auth`, `entitlement`, `plan`; tests/migration.test.ts.
- [x] tests/backend/* (6 files) and tests/backend-client/client.test.ts deleted (sole subject deleted code).
- [ ] Left for S4.4: Plus wording in tests/release.test.ts (docs asserts, S4.5 docs), comments in scene-flow / scene-page tests.
- [ ] Left for S4.5: README, CHANGELOG, docs/*, STAGES/specs mentions, CLAUDE.legacy.md, prompt-launch.txt.

## S4.4 status (2026-11-05)
- [x] tests row: tests/backend/*, tests/backend-client/*, tests/plus-ui.test.ts gone (S4.2/S4.3); scene-flow, scene-page, release, popup adapted; T6 positive tests added (see TEST_CLASSIFICATION S4.4).
- [ ] Left for S4.5: README, CHANGELOG, docs/* (PRIVACY and data-use still describe the Plus backend; then add a negative assert in tests/release.test.ts), STAGES/specs mentions, CLAUDE.legacy.md, prompt-launch.txt.

## S4.5 status (2026-11-05)
- [x] README, CHANGELOG (Unreleased added, history kept), docs/store/{listing,privacy,permissions,data-use}, ARCHITECTURE, SPEC, AUDIT, QA, GIT_WORKFLOW link edited.
- [x] Moved to docs/archive/premium/: PROMPTS.md, PLUS_SPEC.md, SECURITY_BACKEND.md, BACKEND_SETUP.md, supabase.md. prompt-launch Part B split out. Sections copied to removed-sections.md.
- [x] manifest.json checked: no backend, Plus or payment text, host, CSP or externally_connectable entry. Unchanged.
- [ ] Left for S6.6: old name Skinly AI in docs (kept on purpose in S4.5); docs/ARCHITECTURE.md line about the removed AI repair layer (not paid-tier, stale).
- [ ] Left for owner: negative no-Plus doc assert in tests/release.test.ts (S4.4 note; needs tests/ in scope).
