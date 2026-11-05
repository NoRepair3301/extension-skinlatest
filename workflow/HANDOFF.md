# HANDOFF — S2.4 Auto path reaches the engine; validate-dist guards (T5 / D9)
Status: DONE     Date: 2026-11-05     Model/effort used: Sonnet 5.5 / medium (per prompt)
## What changed
- src/extension/auto-core.ts — runAuto catches a throwing applyTokens: report("error-apply"), returns "invalid" (was: rejected promise).
- scripts/validate-dist.ts — ENGINE_MARKER (one literal, Stage 6 comment) + exported engineBundleProblems(applierJs, autoJs); run from the CLI entry on dist/.
- tests/auto.test.ts — extended (existing tests untouched): 5 new tests, names as in the prompt.
## Gate results
tsc 0 errors; eslint 0 errors; engine 62 pass / 0 fail. Full vitest 1371 pass / 17 fail / 94 files; failing set is a subset of BASELINE_FAILURES.txt (repair.test.ts "asks only after consent" did not fail this run). No plus-ui flake. `npm run build` ok; `npm run validate-dist` ok.
## Findings
- Applier global: `globalThis.skinlyApplier` (set by applier.ts:82-93; read at applier-auto.ts:20). Fail-safe already existed: `if (applier && origin && ...)` skips everything, no warn, no marker. Test only; no change in applier-auto.ts.
- Source change needed only for "applyTokens throws" (auto-core.ts guard above). The real applier never throws (run() catches and restores); test (b) uses a style host that throws mid-apply and the page is byte-identical afterwards.
- "No structural path" is assertable: no sheet contains `data-skinly-r` and no element carries it.
- Signature: ENGINE_SHEET_SIGNATURE is a template (`html[${ENGINE_MARK}-sheet]`), not a literal, so validate-dist asserts on the marker only (the signature contains it).
- Mutation demo (real dist content, in memory): marker stripped from applier.js -> "applier.js must contain the engine marker"; marker appended to applier-auto.js -> "applier-auto.js must not embed the engine". Real dist -> no problems. No temp files in the repo.
- dist/ is NOT tracked in git (`git ls-files dist` empty).
## Decisions made (also in DECISIONS.md)
- Bundle check runs in the CLI entry, not in validateDist(): tests/build.test.ts calls validateDist with stub bundles (no engine) and would fail; that test is out of scope.
## Out-of-scope touches
None.
## Bugs found
- applier-core.ts:93 stacking gap (known, Stage 5).
## Owner manual checks (before committing)
`npm run build`, reload unpacked. 1) Apply a built-in theme on a site so it is remembered. 2) Reload the page: theme returns by itself, no worse flash. 3) Restore original: page returns to normal. 4) Page console / service worker: no red errors from applier-auto.
## Suggested commit message
test(auto): prove auto path reaches the engine, fail safe without applier, guard dist bundles (S2.4)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
## Next substage: S3.1 — delete pure structural tests. Stage 2 complete after this commit.
