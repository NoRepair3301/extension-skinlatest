# HANDOFF — S4.2 Remove premium UI; un-gate My assets
Status: DONE     Date: 2026-11-05     Model/effort used: Sonnet 5.5 / high (per prompt)
## What changed
- Deleted: src/extension/popup/PlusDialog.tsx, src/extension/options/PlanAccount.tsx (importers: only Popup.tsx, Options.tsx, each other, tests/plus-ui.test.ts), tests/plus-ui.test.ts (could not compile; every case mounts the deleted UI).
- src/extension/popup/Popup.tsx — no plan flag, lock, Plus mark, dialog or "assets locked" note; AssetHere shows for everyone; clickKept no longer clamps.
- src/extension/options/Options.tsx — no `plan` panel, My assets panel always the MyAssets component.
- src/ui/strings.ts — `plus` block and `options.tabs.plan` removed. popup.css, options.css — plus-mark, locked, plus-list rules removed.
- src/core/entitlements.ts — `canUse`, `Feature`, `clampThemeId` deleted; kept `entitledThemes`, `PlanFlag`, `clampPlan` (see below).
- src/extension/scene.ts (protected) — only the My-assets gate. Before (l.129-132): `assetsOk = ... canUse("assets", await loadPlan())`, re-check, `if (... || !assetsOk)`. After (l.129): `if (!now.asset || now.asset.assetId === null) {`. `canUse` import dropped.
- Tests: options-tabs (nine sections; new `#plan` hash falls back to General), scene-page B4 flipped (a stale free flag no longer hides the picture), settings (canUse/clampThemeId assertions removed), popup (new: six themes selectable, no mark/lock/dialog).
- workflow/{PLAN,LOG,DECISIONS,PREMIUM_INVENTORY}.md.
## Gate results
tsc 0; eslint 0; vitest 1474 pass / 0 fail / 95 files (before: 1477 pass / 4 fail, the S4.1 lock tests; plus-ui flake gone with the file); build + validate-dist ok; `git diff -- src/engine` empty.
## Final grep (src, case-insensitive, engine and src/backend excluded)
Remaining hits: `entitledThemes` (pipeline.ts, entitlements.ts: the "all six themes" list, ordinary name); `PlanFlag`/`clampPlan`/`planFlag.ts`/`loadPlan` (scene.ts:15-16,277, planFlag.ts, entitlements.ts: S4.3, see below); `dailyCheck` + Plus comment in background.ts:9,36 (S4.3 backend); "unsubscribe" in diag.ts and pet/animate.ts, "upgraded" in sites.ts (ordinary words). No hit in popup, options or ui code. Ordinary "sign-in form" in ai/messages.ts is the AI-eligibility copy, not account UI.
## Decisions made (also in DECISIONS.md)
- scene.ts: only the My-assets gate touched (prompt says "the one line"). The second premium line `clampPlan(site.plan, await loadPlan())` (scene.ts:277, protected, no-op) was left; that is why `clampPlan`, `PlanFlag` and `loadPlan` still exist. S4.3 can drop it (one line + import) or the owner can allow it now.
- Removed Options tab needs no migration: tabs derive from `S.options.tabs`; the only stored last-tab is the URL hash and unknown ids already fall back to General.
## Out-of-scope touches
tests/plus-ui.test.ts deleted whole (S4.4's file; could not compile).
## Bugs found
None.
## Owner manual checks
Load dist: popup shows 6 themes + Auto with no Plus badge; clicking Ocean/Warm paper/Field applies them; the "My assets" box shows in the popup on a normal page; Options has 9 tabs (no "Plan and account"), My assets tab fully usable; open options.html#plan lands on General; a saved picture shows on a page.
## Still to do
- S4.3: delete src/backend, backend/, dailyCheck in background.ts, scripts/config/env; scene.ts:277 clampPlan call; clampPlan/PlanFlag/planFlag.ts; migrate away keys `plan`, `entitlement`, `auth`.
- S4.4: delete tests/backend/*, tests/backend-client/*; clean Plus mentions in build, rules, release, scene-flow, scene-page tests.
- S4.5: docs sweep, archive premium docs. Owner decision: `about.free` copy ("Skinly AI is free...") kept as ordinary text; no icons/images were Plus-specific.
## Suggested commit message
refactor(premium): remove Plus UI, plan and account screens; un-gate My assets (S4.2)
## Next substage: S4.3 — relies on: UI no longer imports src/backend, buildConfig or planFlag (only scene.ts via loadPlan, background.ts via dailyCheck remain).
