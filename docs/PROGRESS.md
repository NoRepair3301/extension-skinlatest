# PROGRESS

## Phase 0: scaffold (merged, tag phase-0-done)
- Vite + Preact + Vitest + ESLint scaffold, MV3 manifest with exact permission sets, api.ts as the only chrome.* file.
- Rule scanner, validate-dist, per-file scrub tool and fixtures-clean test are in `npm run check`.
- Minimal Node and jsdom typings live in types/ because @types/node and @types/jsdom are not on the dependency list.
- `ALLOWED_URL_HOSTS` in src/config.ts is empty until Phase 3 adds provider hosts.
- Human items 5 and 6 are in docs/HUMAN_CHECKS.md.

## Phase 1: analyser (merged, tag phase-1-done)
- src/analyzer: eligibility, regions (15,000-node cap), risk, summary (20 KB cap), fingerprint, gate, analyze.
- Read-only: a MutationObserver test shows zero DOM writes; a marker test shows no text, hrefs, ids or values reach the summary.
- 15 SYNTHETIC fixtures with golden files in fixtures/web (no real captures existed); INDEX.md marks them synthetic.
- A heading-only or paragraph-only group is not a card-list; a `section` yields to a repeated group on the same element.
- Human item 7 (compare goldens with real pages) is in docs/HUMAN_CHECKS.md.
