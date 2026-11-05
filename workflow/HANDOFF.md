# HANDOFF — S4.5 Docs: remove paid-tier copy, archive premium docs, manifest check
Status: DONE     Date: 2026-11-05     Model/effort used: Haiku 5.5 / medium (set by owner via /model)
## What changed
- README.md — Plus/account/backend text removed; "Free and Plus" is now "Everything is free". Name kept.
- CHANGELOG.md — `## Unreleased` on top (5 entries, no version bump, D10). All old entries kept.
- docs/store/listing.md — Plus, paid and account text removed (long description, "never does").
- docs/store/privacy.md — "Skinly Plus" section is now "Accounts and servers"; Plus line in "Your choices" removed. Version, Permissions, Provider hosts lines unchanged (tests read them).
- docs/store/permissions.md — Skinly Plus backend (Supabase/CORS) bullet removed.
- docs/store/data-use.md — account and payment rows and the backend sentence rewritten as "not collected" / "no backend". 20 KB and no-text phrase unchanged.
- docs/ARCHITECTURE.md — src/backend, backend/supabase and entitlements/planFlag rows and the Plus data-flow block removed.
- docs/SPEC.md — "Free plan only" wording, "Pro tier" non-goal, §10 title, §12 and §18 replaced by "None" lines.
- docs/AUDIT.md — C6 backend dirs and "Plus session" text, C9 backend fetch, C15 (backend) removed; PROMPTS.md link path updated.
- docs/QA.md — "0.3.0: Skinly Plus" check section (P1–P9) removed. `release/skinly-ai-0.3.0.zip` line (read by a test) untouched.
- docs/GIT_WORKFLOW.md — PROMPTS.md link path updated.
- prompt-launch.txt — Part B (lines 20–34) removed; line 1 header points to the archive. Part A and the shared final line kept.
- Moved (plain move, bytes kept): PROMPTS.md, docs/PLUS_SPEC.md, docs/SECURITY_BACKEND.md, docs/BACKEND_SETUP.md, docs/backend/supabase.md → docs/archive/premium/ (docs/backend/ removed, empty).
- Split copy: prompt-launch.txt lines 20–34 → docs/archive/premium/prompt-launch-part-b.txt.
- New: docs/archive/premium/README.md (5 lines); docs/archive/premium/removed-sections.md (verbatim copies of SPEC §12/§18, ARCHITECTURE rows and flow, AUDIT C15, QA Plus section).
## Gate results
tsc 0 errors; eslint 0 errors; vitest 1440 pass / 0 fail / 91 files (`npm run gate` GREEN). `npm run build` ok; `npm run validate-dist` ok. `git diff --ignore-cr-at-eol --stat -- src tests scripts` empty. manifest.json unchanged (checked: no backend, Plus, payment, host or CSP leftovers).
## Decisions made (also in DECISIONS.md)
- PROMPTS.md moved as the prompt says, though it has no paid-tier text.
- Part B = lines 20–34. Old line 36 ("Final print") names both parts, so it stays in the original file.
- Removed sections copied to archive so nothing is lost.
- Privacy/data-use keep the lines tests/release.test.ts reads.
- No negative no-Plus doc assert added to tests/release.test.ts: tests/ is out of scope here.
- Not edited: docs/PROGRESS.md, PHASE_*.md, FINAL_REPORT.md, HUMAN_CHECKS.md, PERF.md, providers/*, fixtures/web/INDEX.md (history or ordinary words).
## Out-of-scope touches
None in src/, tests/, scripts/, package.json, configs. `dist/` rebuilt by `npm run build` (build output only).
## Bugs found
None. Not fixed (not paid-tier, out of scope):
- docs/ARCHITECTURE.md line ~39 still describes the removed AI repair layer (src/ai/repair.ts).
- autopilot-all.ps1 reads prompt-launch.txt (now Part A only). CLAUDE.md says never run it.
## Owner manual checks
- Read README "Everything is free" and CHANGELOG "Unreleased"; check store listing and privacy wording before publishing.
- Store images (outside the repo) must not show Plus marks or the Plus dialog. No binary asset was edited.
- Confirm docs/archive/premium/ holds what you want archived.
- Decide: add the negative no-Plus doc assert in tests/release.test.ts (S4.4 note).
## Remaining grep hits (prompt regex, excluding archive, workflow, prompts, CLAUDE.legacy, node_modules, dist)
- CHANGELOG: 0.3.0 history (lines 11–16); the new Unreleased entry; ordinary "plus" (line 50).
- docs: history logs (PROGRESS, PHASE_*, FINAL_REPORT, HUMAN_CHECKS); provider pricing/free-tier pages; SPEC ordinary "plus"; QA/privacy sign-in and payment gate wording; AUDIT C6 secret-scanner list.
- src/ and tests/ (out of scope): `entitledThemes` symbol (S4.4 note), ordinary "plus", migration.test names retired keys on purpose.
- Paid-tier copy in README, CHANGELOG (Unreleased), docs/store, ARCHITECTURE, SPEC, AUDIT, QA: none left.
## Suggested commit message
docs(premium): remove paid-tier copy, archive premium docs, add Unreleased changelog (S4.5)
Commands for the owner, after the manual check (not run here):
  git add -A
  git commit -m "docs(premium): remove paid-tier copy, archive premium docs, add Unreleased changelog (S4.5)"
  git tag stage-S4.5
  git push
## Next substage: S5.1 — F1 design only (Opus 5.5, high), writes workflow/F1_DESIGN.md, no code. Preconditions: S4.5 DONE; the archive folder exists; no src changes.
