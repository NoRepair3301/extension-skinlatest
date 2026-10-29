# PHASE 2: themes, plan validator, CSS compiler, applier, restore (no AI yet)

Goal: the five built-in themes apply safely to a page through a StylePlan and can be fully undone.
Depends on: Phase 1.

## Scope (in order, commit after each step)
1. src/plan/schema.ts: StylePlan types and a hand-written validator (no library): rejects unknown keys, wrong types, bad hex, out-of-range numbers, unknown enums, unknown region ids (checked against a summary), layouts on ineligible regions (SPEC 4.2).
2. src/themes/{calm-light,midnight,ocean,warm-paper,high-contrast}.json and src/themes/index.ts. Choose colours that pass the contrast targets in SPEC 10. src/plan/contrast.ts (WCAG ratio) and scripts/contrast.ts, wired into `npm run check`, fail the build if any theme misses a target.
3. src/plan/compile.ts: StylePlan + summary to a CSS string from fixed templates, scoped by `html[data-skinly="on"]` and `[data-skinly-r="rN"]`; font names come from a fixed map; only properties in the SPEC 4.3 allowlist; images, video, canvas, svg and iframes untouched.
4. src/plan/themeToPlan.ts: a built-in theme becomes a StylePlan (all regionRules layout none).
5. src/plan/invariants.ts: snapshot and compare (count and order of `a[href]`, button, input, select, textarea, [tabindex]; href list; form attributes ignoring data-skinly-*).
6. src/extension/applier.ts: `apply(plan)` re-runs the analyser, verifies region ids, tags regions, sets `data-skinly="on"`, adopts one constructable stylesheet, records the rollback ledger, runs invariants (rollback on failure). `restore()` removes everything and disconnects observers. Both idempotent. Bounded observer per SPEC 5.
7. Popup: "Transform this page" (applies the saved or default theme), a five-theme picker, "Restore original", last theme saved in settings. Background injects the applier only after the click. Pages the gate blocks show the SPEC 11 message.
8. src/core/entitlements.ts with `canUse(feature)` returning true.

## Acceptance
1. [auto] `npm run check` green, including the contrast script for all five themes.
2. [auto] Validator tests: each rejection case above, plus a valid plan passes.
3. [auto] Compiler tests: every declared property is in the allowlist; no `url(`, `@import`, `expression`, `content`, `position`, `z-index`, `visibility`, `display:none`; golden CSS per theme.
4. [auto] Applier tests (jsdom, all fixtures): apply then restore leaves `outerHTML` identical to the original; applying twice is idempotent; invariants pass; a planted violation (a link removed by a test hook) triggers rollback.
5. [auto] Observer tests: a burst of mutations gives one re-check after 300 ms; at most 5 re-checks per minute; it disconnects on restore.
6. [human] On three real public pages (an article site, a site with a strict content security policy such as github.com, and a link-heavy portal): Transform shows the theme within 1 s, all five themes work, text is readable, images keep their colours, Restore returns the exact original look.
7. [human] If any site shows no styling at all (possible CSP issue with adopted stylesheets), write the site and what you saw in docs/BUGS.md.

## Stop
Stop when items 1 to 5 pass and everything is committed. Print items 6 and 7. Do not start Phase 3.
