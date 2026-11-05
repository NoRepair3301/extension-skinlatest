date | ID | status | files touched | gate summary
2026-11-04 | S0.1 | DONE | 9 new files (0 existing edited) | no gate (docs only)
2026-11-04 | S0.2 | DONE | 6 (2 new, 4 edited: package.json, BASELINE.md, PLAN.md, HANDOFF.md/LOG/DECISIONS) | tsc 1 / eslint 4 / vitest 1324 pass 19 fail (91 files); red as expected
2026-11-04 | S1.1 | DONE | 1 source file (src/engine/dom.ts) + 4 workflow docs | tsc 0 / eslint 2 (pipeline.ts, S1.2) / vitest 1324 pass 19 fail (identical to baseline); engine tests 18/18 green
2026-11-04 | S1.2 | DONE | 13 src/tests files (1 deleted) + 4 workflow docs | tsc 0 / eslint 0 / vitest 1321 pass 18 fail (baseline minus the deleted AI-repair flow test)
2026-11-05 | S2.1 | DONE | 3 src/test/spec files (dom.ts, ledger.test.ts new, specs.md) + 4 workflow docs | tsc 0 / eslint 0 / engine 35 pass / full vitest 1337-1338 pass, 18-19 fail (18 baseline failures; plus-ui timing flake once under load)
2026-11-05 | S2.2 | DONE | 3 src/test files (dom.ts, ledger.test.ts, refresh.test.ts new) + 4 workflow docs | tsc 0 / eslint 0 / engine 48 pass / full vitest 1351 pass 18 fail (baseline minus S1.2-removed test)
2026-11-05 | S2.3 | DONE | 3 src/test files (dom.ts, cleanup.ts, tests/engine/marker.test.ts new) + 4 workflow docs | tsc 0 / eslint 0 / engine 62 pass / full vitest 1366 pass 17 fail (baseline minus S1.2-removed test minus restore-markers fresh-instance test)
2026-11-05 | S2.4 | DONE | 3 src/test files (auto-core.ts, validate-dist.ts, auto.test.ts) + 4 workflow docs | tsc 0 / eslint 0 / engine 62 pass / full vitest 1371 pass 17 fail (subset of baseline); build + validate-dist ok
2026-11-05 | S3.1 | DONE | 11 test files (7 deleted, 4 edited) + workflow docs | tsc 0 / eslint 0 / engine 62 pass / full vitest 1318 pass 9 fail (guard 8, restore-markers 1) of 1327; build + validate-dist ok
2026-11-05 | S3.2 | DONE | 5 test files (1 new, 4 edited) + patch + 5 workflow docs | tsc 0 / eslint 0 / engine 94 pass 5 BUG / full vitest 1365 pass 13 fail of 1378 (12 BUG, 1 plus-ui timing flake); build + validate-dist ok
