# HANDOFF — S1.2 Remove the dead aiRepair layer (T4, D6)
Status: DONE     Date: 2026-11-04     Model/effort used: Sonnet 5.5 / high (per prompt)
## What changed (git diff --ignore-cr-at-eol: 13 files, +13 / -202)
- src/ai/pipeline.ts — deleted aiRepair closure; dropped repairPayload/applyRepair from PageClient, "repairing" from Step, ConsentRequest.purpose, PipelineDeps.askRepairConsent; removed unused imports (isBuiltinThemeId, RepairPayload, originOf, validateRepair, repair.ts, REPAIR_CONSENT_VERSION); fixed checkPlan doc comment
- src/ai/repair.ts — DELETED (REPAIR_SCHEMA/SYSTEM, buildRepairMessage, repairConsentText, REPAIR_PROMPT_VERSION)
- src/ai/messages.ts — removed repairConsentText re-export
- src/config.ts — removed REPAIR_CONSENT_VERSION
- src/extension/applier-core.ts — removed repairPayload/applyRepair stubs + RepairPayload import
- src/extension/flow.ts — removed repairPayload/applyRepair client methods, askRepairConsent wiring, RepairPayload import
- src/extension/api.ts — PageMethod drops "repairPayload" | "applyRepair" (applier.ts had no references)
- src/extension/settings.ts — removed repairConsent field, default and parser block
- src/extension/popup/Popup.tsx — consent view always uses consentText; STAGE_OF drops repairing
- src/extension/options/Options.tsx — removed repair note + "Withdraw readability agreement" button from Privacy card
- src/ui/strings.ts — removed steps.repairing, options.repairNote, options.repairWithdraw
- tests/repair.test.ts, tests/options-tabs.test.ts — see tests below
## Inventory (symbol -> files, before edits)
aiRepair: pipeline.ts. REPAIR_SYSTEM/REPAIR_SCHEMA: ai/repair.ts, pipeline.ts, tests/repair.test.ts. repairPayload/applyRepair: pipeline.ts, applier-core.ts, flow.ts, api.ts, tests/repair.test.ts. repairConsent: pipeline.ts, settings.ts, Options.tsx, tests/repair.test.ts, tests/options-tabs.test.ts. "repairing": pipeline.ts (only emitter: step("repairing") inside aiRepair), strings.ts, Popup.tsx. 11 src files, no protected zones.
## Gate results
tsc 0 errors; eslint 0 errors; vitest 1321 pass / 18 fail / 1339 tests in 91 files.
Failing set = BASELINE_FAILURES.txt minus "AI repair in the flow asks only after consent..." and nothing new. Overall gate RED as expected (legacy/restore/guard failures belong to Stages 2-3).
## Tests deleted / adapted
- tests/repair.test.ts "AI repair in the flow" describe: BOTH tests deleted (prompt named only the first, a baseline failure). The second ("makes no repair request without consent...") passed before but only drives askRepairConsent/repairPayload/applyRepair, which no longer exist (would not type-check). Net: 24 -> 21 tests (-1 flow, -1 flow2, -1 prompt/schema).
- tests/repair.test.ts "the prompt tells the model to ignore instructions ... gives a schema": deleted, tests REPAIR_SYSTEM/SCHEMA (file removed).
- tests/repair.test.ts payload tests: adapted, buildRepairMessage(x) -> JSON.stringify(x) (identical behaviour, assertions unchanged); unused imports dropped.
- tests/options-tabs.test.ts "Privacy: withdrawing the readability agreement ...": deleted, UI removed.
## Decisions made (also in DECISIONS.md)
- D6 recorded. repairConsent and ConsentRequest.purpose removed with no schema bump; parseSettings starts from defaults and reads known keys only, so stored old field is ignored (verified by reading it) and dropped on next save.
- "repairing" removed: only aiRepair emitted it.
## Out-of-scope touches
None.
## Left on purpose (for S3.3)
- src/plan/repair.ts (still used by pipeline checkPlan), src/plan/readability.ts (validateRepair/compileRepair: now importers are tests/repair.test.ts only; parseRepairCss etc. still used elsewhere), src/features/repair/payload.ts (now only importer: tests/repair.test.ts; src importers gone), repairCss/seedCss in sites.ts, PageMethod "repairRules" (still used by Popup.tsx:388).
## Bugs found
None new.
## Docs still mentioning aiRepair / repair consent (for S4.5)
specs.md, STAGES.md, docs/SPEC.md, docs/PROGRESS.md, docs/AUDIT.md, CLAUDE.legacy.md. Also strings.ts freeIncludes says "readability repair" (deterministic, left).
## Owner manual checks
Build, load unpacked. With a provider key: "Change my page" on an ordinary page, confirm consent, generate, apply, preview, and no second (readability) consent prompt. Without a key: picking a theme + "Change my page" still reaches the consent/permission step with no errors. Settings > Privacy no longer shows the readability agreement.
## Suggested commit message
refactor(ai): remove dead aiRepair layer (S1.2)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
## Next substage: S2.1 — relies on tsc 0 and eslint 0 (both now true); vitest failing set = 18 baseline failures.
