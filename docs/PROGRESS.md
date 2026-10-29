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

## Phase 2: themes, validator, compiler, applier (merged, tag phase-2-done)
- src/plan: hand-written StylePlan validator (errors name paths, never values), WCAG contrast, CSS compiler from fixed templates, themeToPlan, invariants.
- Five theme JSONs pass the SPEC 10 targets; `scripts/contrast.ts` runs inside `npm run check` (also checks text, link and muted on surface).
- Applier core takes an injected StyleHost (jsdom has no constructable stylesheets); applier.ts wires the real one and registers `globalThis.skinlyApplier` once per page.
- Observer re-checks repair the page (attribute, tags, sheet) but do not diff invariants, because only page-driven changes can alter them; invariants run at apply time and roll back on any difference.
- Popup injects the applier only after the Transform click; CSS uses `!important` on colour rules so dark themes stay readable over site styles.
