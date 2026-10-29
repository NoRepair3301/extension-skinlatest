# PHASE 1: page analyser (read-only): regions, risk, summary, fingerprint

Goal: turn any page's DOM into regions, a risk list, a StructuralSummary (SPEC 4.1) and a fingerprint, without reading or keeping page text. The analyser never changes the DOM.
Depends on: Phase 0. Recommended model: Opus at medium effort (this is the core quality of the product).
Human first: capture at least 10 scrubbed fixtures into fixtures/web/ using docs/tools/capture-fixture.md. If fewer than 10 exist, stop and say so.

## Scope (in order, commit after each step)
1. src/core/types.ts: Region, RegionRole, StructuralSummary, RiskMarker, Gate, Fingerprint exactly as SPEC 4.1 and 6.
2. src/analyzer/eligibility.ts: `checkUrl(url, blocklist)` returns allowed or blocked(reason). Pure. Restricted schemes, browser-internal hosts, web stores and the built-in blocklist come from src/config.ts.
3. src/analyzer/regions.ts: one pass over the DOM with a visited-node cap of 15,000 (then return "too-large"). Detect landmarks (header, nav, main, aside, footer, matching roles), headings, forms, tables (header row or th, at least 3 rows and 2 columns), button groups, and repeated groups: at least 4 sibling elements with the same tag, similar class signature and similar child shape become `card-list` or `link-list`. At most 40 regions, ids r1..rN in document order, deterministic. The code may use text length only to compute link density and must never keep or return a text string.
4. src/analyzer/risk.ts: password input, payment (autocomplete values starting cc-), file input, contenteditable or large textarea, table with 20 or more rows, 3 or more iframes, shadow roots (count only).
5. src/analyzer/summary.ts: build the summary. Injectable `getStyle(el)` and `getRect(el)` (real code uses getComputedStyle and getBoundingClientRect; tests inject fakes because jsdom has no layout). Sanitise class tokens by the SPEC regex (at most 3 per region), drop ids and everything listed as "never included", round rects, palette from region colours, size cap 20 KB.
6. src/analyzer/fingerprint.ts: FNV-1a hash plus role-sequence string (first 40 regions); `similar(a, b)` at least 0.8.
7. src/analyzer/gate.ts: combine url check and risk into `ok | no-ai | blocked` with reason codes (SPEC 6).
8. tests/analyzer/*.test.ts and golden files fixtures/web/<name>.expected.json (regions with role and counts only).

## Acceptance
1. [auto] `npm run check` green.
2. [auto] For every fixture: analyze() does not throw, returns at most 40 regions, summary at most 20 KB, and two runs give identical output.
3. [auto] Privacy marker test: put a unique marker string into every text node, href, id, alt, title, aria-label, data-* value and input value of a fixture; the summary JSON contains none of the markers.
4. [auto] Golden files match for all fixtures; each fixture has at least one region.
5. [auto] Gate tests: password, payment or file input gives `no-ai`; restricted URLs, web stores and blocklisted origins give `blocked`; a 20,000-node synthetic page gives too-large without scanning past the cap.
6. [auto] Read-only: `document.documentElement.outerHTML` is identical before and after analysis.
7. [human] Open three `*.expected.json` files beside the real pages: the main navigation and the card or link lists should be the regions found. Note any page where an obvious list is missed in docs/BUGS.md.

## Stop
Stop when items 1 to 6 pass and everything is committed. Print item 7. Do not start Phase 2.
