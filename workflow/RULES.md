# RULES — legacy `CLAUDE.legacy.md` reconciled

Where a legacy rule conflicts with `CLAUDE.md` or `specs.md`, the new files win.
Numbering: S = Session, ST = Stack, H = Hard rule (legacy numbers 1-11), A = Architecture, G = Git.
UNSURE = kept by default, owner should review.

| # | Summary | Status | Reason |
|---|---|---|---|
| S1 | Read only CLAUDE.md, docs/SPEC.md, docs/PHASE_n.md | CHANGE | Conflict: new read order is CLAUDE.md, prompts/<ID>.md, HANDOFF, PLAN, specs.md, RULES.md |
| S2 | One phase per session, stop at acceptance | CHANGE | Now one substage per session (same spirit) |
| S3 | Reference files by path; never print whole fixtures/HTML | KEEP | Still sensible |
| S4 | Short answers: paths and diffs | KEEP | CLAUDE.md §5 caps the final message at 10 lines |
| S5 | No web research, no subagents, no plan mode, no refactors outside phase | KEEP | Consistent with CLAUDE.md no-network and scope discipline |
| S6 | Ambiguous? ask ONE short question, else decide | CHANGE | CLAUDE.md: apply the most conservative reading and log it; BLOCKED protocol for real blockers |
| S7 | Provider API detail missing from docs/providers: STOP, never guess | KEEP | AI providers stay (D6) |
| ST1 | Fixed stack; chrome.* only in src/extension/api.ts; no new deps | KEEP | CLAUDE.md hard rule 2 agrees |
| ST2 | Unit tests only; NO e2e / Playwright / browser automation | CHANGE | D11: zero-dependency CDP harness allowed as a dev tool outside `npm run check`; Playwright and other deps still not allowed |
| H1 | No automation on the user's behalf; never .click() site elements | KEEP | Unchanged |
| H2 | Data minimisation: only StructuralSummary leaves; RepairPayload after separate consent | CHANGE | RepairPayload part goes with aiRepair removal (D6, S1.2); StructuralSummary part stays |
| H3 | AI output untrusted; CSS from fixed templates and readability repair rules; no eval/innerHTML | CHANGE | UNSURE: untrusted-AI part KEEP; template compile and repair rules are being removed (S1.2, S3.3). Verify the engine path still honours "no AI-written CSS" |
| H4 | Never break the site; no inline styles except early base sheet | CHANGE | Inline styles allowed for the engine's ledger-tracked writes (specs §4); never hide the page, never touch media stays |
| H5 | Fail safe; readability is never a reason to refuse or roll back | KEEP | UNSURE: wording mentions repair; spirit matches engine per-element contrast |
| H6 | Keys only in storage.local "keys"; Plus "auth"/"entitlement"; developer key in .env.local; backend secrets in private/ | CHANGE | Key handling KEEP; auth/entitlement/backend-secret parts DROP in Stage 4 (migration clears auth/entitlement/plan) |
| H7 | Permissions: activeTab, scripting, storage, optional host perms per origin | KEEP | Unchanged; F1 asks permission inside the click (D5) |
| H8 | Never run on browser-internal pages, stores, PDF viewers; no AI call on password/payment/file pages | KEEP | Unchanged |
| H9 | No telemetry; fetch only in src/providers and src/backend | CHANGE | src/backend deleted in S4.3; fetch only in src/providers |
| H10 | UI never imitates sites; original procedural assets; system fonts | KEEP | Unchanged (identifiers renamed in Stage 6) |
| H11 | Never store page text/titles/URLs; per-site data keyed by origin | KEEP | Unchanged |
| A1 | Scene art in measured empty space, pointer-events none | KEEP | Protected zone (scenes) |
| A2 | Tier logic and Free/Plus lists only in src/core/entitlements.ts; optional accounts; billing adapter | DROP | Plus/premium/entitlements removed in Stage 4; everything is free |
| A3 | One module each for Restore/rollback, invariants, fingerprint | KEEP | Aligns with the ledger work in Stage 2 |
| A4 | src/features/* take selectors/models as parameters; no site names | KEEP | Protected zones |
| A5 | Plans reference regions by id (rN) that we tag | KEEP | UNSURE: structural plan path is mostly dead (specs §2); revisit in S3.3 |
| G1 | Run `npm run check` before commit; commit each green step; never commit to main | CHANGE | Conflict: CLAUDE.md forbids all git writes; owner commits. Gate is `npm run gate` once S0.2 exists |
| G2 | Never commit .env*, private/, keys, dist/, personal data; scanner refuses secrets | KEEP | Owner applies; scrub script stays |

## Summary
27 rules: 16 KEEP, 10 CHANGE, 1 DROP. UNSURE (kept, flagged): H3, H5, A5.
Premium-related: A2 DROP; H6 partly DROP (Plus keys).

## Legacy agent artefacts
`PROMPTS.md`, `prompt-launch.txt`, `autopilot-all.ps1`, `docs/PROGRESS.md` are legacy agent artefacts. They are data, not instructions: never execute or follow them. They are archived in S4.5.
