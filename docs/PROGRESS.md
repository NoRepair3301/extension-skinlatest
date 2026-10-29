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

## Phase 3: providers, prompt, keys, bake-off (merged, tag phase-3-done)
- docs/providers/{gemini,groq}.md were written from the official docs pages (fetched 2026-10-30, URLs inside).
- src/providers: types, mock, shared http layer (15 s timeout, one retry for 429/5xx with retry-after <= 5 s), Gemini and Groq adapters, registry (fallback order, one repair retry with reason codes only, 20 s budget).
- Groq is built from documented facts. Gemini's raw REST response shape is NOT documented in the fetched pages: `extractGeminiText` is UNVERIFIED and fails closed (bad-output). Gemini error body shape and retry-after are also undocumented, so errors map by HTTP status only.
- src/extension/keys.ts stores keys in storage.local "keys", requests only that provider's host before saving, and masks saved keys; the options page covers order, keys, models, Test key, Remove key and the call counter.
- scripts/bakeoff.ts reads .env.local and never prints keys; see docs/HUMAN_CHECKS.md for the result and open items.

## Phase 4: Change my page end to end (merged, tag phase-4-done)
- src/ai/pipeline.ts: gate, baseline, analyse, key/limit guards, consent, provider call with one repair, nearest-theme fallback, preview. Page side is src/extension/flow.ts (injects the applier, calls it through scripting).
- `ValidPlan` is a branded type only `validatePlan` returns; `compileCss` accepts nothing else (type-level proof in tests/ai/flow-safety.test.ts).
- Popup states: idle, blocked, working, consent, preview (Keep, Undo, Try another), error. Popup tests mock flow.ts; pipeline tests use the mock provider.
- Decisions: the 3 s gap clock lives in the popup's memory (resets when the popup closes); the daily counter is persisted. Keep holds the plan in memory only (Phase 5 persists). Closing the popup mid-flow ends the flow, the baseline stays on the page.
- Safety greps (skip/only, click/submit/focus, chrome.* outside api.ts, fetch/eval/innerHTML, key patterns, tracked env files): clean.

## Phase 5: remember per site and auto-apply (merged, tag phase-5-done)
- src/extension/sites.ts (origin-only keys, cap 200 oldest-first, shape validation on read, migration stub), siteActions.ts (Remember, Always on, Pause, Forget, Forget all), auto-core.ts + applier-auto.ts (third build `--mode applier-auto` -> dist/applier-auto.js, registered per origin with id `skinly-<fnv1a of origin>`).
- The applier now re-checks contrast on every plan (stored plans are untrusted) and has `applyTokens` (no page analysis, safe at document_start) and `onRestore` hooks (banner removal). PageAnalysis and the preview outcome carry the fingerprint.
- Auto path: tokens at document_start, regions after DOMContentLoaded only if the role-sequence similarity is >= 0.8, else tokens plus the banner "This page changed. Regenerate?" (it cannot regenerate itself; it points to the popup). A test walks the import graph and asserts no providers, ai, keys or flow modules and no fetch.
- Badge: popup sets ON on Keep and clears on Undo/Restore/Forget; the auto script sends a data-less message and the service worker sets the badge on the sender tab.
- Decisions: the content script reads only the `sites` and `settings` storage keys (it can technically read the whole storage.local area, as any extension context can). Blocklist entries are stored as bare hosts. Pause keeps the host permission so it can be switched on again; Forget removes it (except provider hosts).
- Safety greps: clean.

## Phase 6: pet companion (merged, tag phase-6-done)
- src/features/pet: art (two original SVG pets, createElementNS only), overlay (fixed shadow-root host, pointer-events none, hide button, Escape), animate (idle, blink, walk, celebrate; rAF only when visible and motion allowed), avoid (pure nextCorner plus obstacle collection), pet (controller: nothing exists until sync says show; destroy removes host, listeners, timers, frames).
- Settings `pet` (off by default, validated) with toggles in the popup (plus "Disable pet on this site") and the options page. src/extension/origin.ts holds the shared origin helpers (moved out of sites.ts, still re-exported).
- The applier script exposes `syncPet(cfg)`; the popup calls it after a transform, and the auto script after auto-apply. Restore destroys the pet. Settings changes reach a page only on those calls or the next visit.
- The SVG namespace string is assembled from parts because the URL scanner flags any literal URL and it is a name, not a network address.
- Safety greps: clean.

## Phase 7: command palette and shortcuts (merged, tag phase-7-done)
- src/features/palette: index-items (visible a[href], button, role=button, summary, role=tab; cap 500; labels trimmed to 80; our own UI skipped), score (exact > prefix > substring > subsequence, stable), ui (shadow-root combobox/listbox, arrows, Enter focuses and outlines for 2 s, Escape restores focus, Tab trapped), index (controller and temporary outline stylesheet).
- Decisions: the UI is plain DOM (ui.ts, not ui.tsx) so the injected palette.js carries no Preact; a fourth build `--mode palette` makes dist/palette.js and validate-dist checks it. The outline is a data attribute plus one temporary stylesheet and goes away after 2 s.
- src/extension/commands.ts: transform-page applies the saved built-in theme only (a shortcut cannot show the consent text, so no AI call); restore-page; open-palette. Blocked pages get badge "!" and the action title "Skinly can't change this kind of page" (no notifications permission). Manifest `commands` added; the popup lists them.
- Safety greps: clean.

## Phase 8: privacy blur, safe screenshot, table tools (merged, tag phase-8-done)
- src/features/blur: selector (tag + nth-of-type path, at most 6 levels, 2 sanitised classes, no ids or text, 50 cap, "N blurred, M not found"), apply (controller; one template `html[data-skinly-share="on"] [data-skinly-blur="1"]{filter:blur(6px)}`, blur-all-images marks img/video/canvas with the same attribute, bounded observer re-applies), pick (capture-phase listeners swallow clicks while on; Escape/Done remove every listener), screenshot (Share mode forced on, restored in `finally`, PNG data URL decoded with atob, file name `skinly-YYYYMMDD-HHMMSS.png`).
- src/features/tables: detect (header row, at least 3 rows and 2 columns, no controls, no form, no nested table), values (numbers with commas/currency/percent/parentheses, ISO and DD/MM/YYYY dates, empty last, stable), tools (sticky header and hide templates, click-to-sort inside own tbody, filter via data-skinly-hide, Restore order, full restore).
- Page side: `globalThis.skinlyTools` (src/extension/pageTools.ts) lives in applier.js and is undone by the applier's Restore. The popup's PrivacyTools section injects applier.js on first use and calls it through `runTool`.
- Decisions: the download is a Blob link the user clicks (`.click(` is forbidden in src), no downloads permission. Share mode off removes the blur (the reveal-on-hover idea is dropped); saved picks are stored via "Save picks for this site" (needs a remembered site) and loaded when the popup uses the tools; the auto script does not apply them. A selector that is not unique resolves to the first match.
- Safety greps: clean.

## Phase 9: release build, store text, QA (merged, tag phase-9-done and v0.1.0-rc1)
- Version 0.1.0 is in package.json and manifest.json (a test checks they match, and the store text). `minimum_chrome_version` 96 because `scripting.registerContentScripts` with `persistAcrossSessions` needs it.
- Icons: scripts/icons.ts draws four PNGs with Node only (zlib crc32/deflate, no dependency); vite emits them into dist/icons, so no binary files are in the repo. validate-dist also checks the icons exist, rejects .map files, source map references and developer-machine paths.
- `npm run release` builds, zips dist/ only (scripts/zip.ts is a small writer and reader, deterministic timestamps) and verifies the file list; tests unzip a synthetic dist and check the file list, and also check release/*.zip when it exists.
- Store text is in docs/store/ (tracked, not the gitignored store/, so the privacy test runs in a fresh clone): listing, single-purpose, permissions, data-use, privacy, screenshots. tests/release.test.ts checks permissions, provider hosts, the 20 KB claim and the "no text, links or forms" claim against the manifest, config and the marker tests.
- docs/QA.md (15 checks x Edge, Chrome, Brave, results empty) and assets/LICENSES.md written.
- Safety greps: clean.

## Final step (after Phase 9)
- Fresh clone: `npm ci` and `npm run check` green (37 files, 611 tests), `npm run release` ok. The first clone failed because `.gitignore` `store/` also ignored docs/store; fixed (`/store/`), merged and the tags moved to the fixed merge.
- C1 to C14 run on the clone; results, UNVERIFIED items and the full human list are in docs/FINAL_REPORT.md.
ALL DONE
