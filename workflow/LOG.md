date | ID | status | files touched | gate summary
2026-11-04 | S0.1 | DONE | 9 new files (0 existing edited) | no gate (docs only)
2026-11-04 | S0.2 | DONE | 6 (2 new, 4 edited: package.json, BASELINE.md, PLAN.md, HANDOFF.md/LOG/DECISIONS) | tsc 1 / eslint 4 / vitest 1324 pass 19 fail (91 files); red as expected
2026-11-04 | S1.1 | DONE | 1 source file (src/engine/dom.ts) + 4 workflow docs | tsc 0 / eslint 2 (pipeline.ts, S1.2) / vitest 1324 pass 19 fail (identical to baseline); engine tests 18/18 green
2026-11-04 | S1.2 | DONE | 13 src/tests files (1 deleted) + 4 workflow docs | tsc 0 / eslint 0 / vitest 1321 pass 18 fail (baseline minus the deleted AI-repair flow test)
2026-11-04 | S2.1 | BLOCKED | 2 (src/engine/dom.ts edited, tests/engine/ledger.test.ts new) + 4 workflow docs | tsc 0 / eslint 0 / vitest 1327 pass 25 fail (92 files): 18 baseline + 7 new raw-outerHTML restore tests; engine 31/31 green
2026-11-04 | S2.1 | DONE | 2 (src/engine/dom.ts, tests/engine/ledger.test.ts new) + 4 workflow docs | tsc 0 / eslint 0 / vitest 1338 pass 18 fail (92 files) = baseline set exactly; engine 35/35 green
2026-11-04 | S2.2 | DONE | 2 (src/engine/dom.ts, tests/engine/refresh.test.ts new) + 5 workflow docs (plans/S2.2.md new) | tsc 0 / eslint 0 / vitest 1352 pass 18 fail (93 files) = baseline set exactly; engine 49/49 green
