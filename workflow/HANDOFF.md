# HANDOFF — S4.3 Remove backend, premium config and scripts; migrate old plan data
Status: DONE     Date: 2026-11-05     Model/effort used: Sonnet 5.5 / medium (per prompt)
## What changed
- Deleted (evidence: importers were only each other, background.ts, planFlag.ts, scene.ts, rules/validate-dist words and the deleted tests; no dynamic imports, vite/manifest refs): src/backend/ (4), backend/ (19 tracked files incl. .env.example; `.env.local` untouched), tests/backend/ (6), tests/backend-client/client.test.ts, scripts/gen-entitlement-keys.mjs, types/env.d.ts, types/deno-min.d.ts, root .env.example (only premium vars), src/extension/planFlag.ts.
- src/extension/background.ts — dailyCheck/buildConfig removed. src/core/entitlements.ts — only `entitledThemes` left.
- src/extension/sites.ts — migration: STORAGE_VERSION 3, `migrateStorage` removes keys `auth`, `entitlement`, `plan`.
- tsconfig.json — backend include. scripts/validate-dist.ts — Supabase host + anon-JWT allowances (all other checks kept). scripts/rules.ts — backend dir, 3 storage keys, fetch message.
- Tests: new tests/migration.test.ts (4 cases); adapted rules, build (B4 supabase test removed), settings (clampPlan), auto (regex), persistence (schema v3).
- manifest.json, package.json, vite.config.ts: no backend entries, unchanged. workflow/{PLAN,LOG,DECISIONS,PREMIUM_INVENTORY}.md.
## Gate results
tsc 0; eslint 0; vitest 1430 pass / 0 fail / 90 files (before: 1474/0/95); build + validate-dist ok; `git diff -- src/engine` empty. Bundles (bytes, minified): applier 86218, scene 74117, popup 45651, options 17700, applier-auto 15580, background 3635.
## Final grep (case-insensitive, excl. docs/, workflow/, prompts/, README, CHANGELOG, .env*)
Source/scripts/config/manifest: only `entitledThemes` (ordinary name, pipeline.ts, entitlements.ts, settings.test.ts) and sites.ts:17-18 + tests/migration.test.ts (the retired key names the migration must delete; unavoidable). Other hits are meta text for S4.5: CLAUDE.legacy.md, prompt-launch.txt, specs.md, STAGES.md.
## Decisions made (also in DECISIONS.md)
See DECISIONS.md S4.3 lines (migration reuse, manifest unchanged, rules.ts keys, scene.ts no-op line, .env.example deleted).
## Out-of-scope touches
scripts/rules.ts, src/core/entitlements.ts, src/extension/background.ts, src/extension/scene.ts (protected: one no-op premium line + imports), tests/{rules,build,settings,auto,persistence}.test.ts. Over 3 files but all forced by the deletions and listed for S4.3 in the S4.1/S4.2 handoffs.
## Bugs found
None.
## Owner manual checks
Load dist; popup/options work; AI themes list unchanged. Old-install check: in the service-worker console run `await chrome.storage.local.set({auth:{x:1},entitlement:{x:1},plan:{v:1,plan:"plus",until:9e15},schema:{v:2}})`, reload the extension at chrome://extensions, then `await chrome.storage.local.get(["auth","entitlement","plan","schema","settings"])` — expect `{schema:{v:3}, settings:...}` with the three old keys gone.
## Packages to uninstall
None (src/backend imported only Node/web built-ins and relative files).
## Remaining
- S4.4: tests/release.test.ts Plus/backend doc asserts (lines ~122-125), Plus comments in scene-flow and scene-page tests.
- S4.5: README, CHANGELOG, docs/*, specs/STAGES/CLAUDE.legacy/prompt-launch mentions, manifest/package name stay for Stage 6.
## Suggested commit message
chore(premium): delete backend, entitlement tooling and config; migrate away old plan data (S4.3)
## Next substage: S4.4 — relies on: src/backend, backend/, planFlag and their tests are gone; gate green at 1430 tests.
