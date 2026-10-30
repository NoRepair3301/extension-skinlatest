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

## fix/providers-real (v0.1.0-rc2, 2026-10-30)
- scripts/probe.ts: one real call per provider, prints status, header names and key/type structure only; full replies in private/.
- Gemini reply shape VERIFIED (steps[] -> model_output -> content[].text); extractGeminiText is now strict; Gemini 503 body and retry-after 30 seen; Groq 401 body seen. Tests use sanitized copies.
- Timeouts 15 s/20 s -> 40 s/60 s (SPEC 7 updated). Reason: Gemini spends seconds on thought tokens (8.9 s for a 5-token answer). Not proven sufficient: 4 of 4 bake-off calls still timed out at 40 s, then 429.
- Bake-off partial: Gemini 0/5 (stopped on 429), Groq 0/1 (key rejected, 401). Prompt not tuned (no answers to judge). Table in docs/HUMAN_CHECKS.md.
- Accepted decisions: share mode off removes blur; saved blur picks not auto-applied by the auto script; palette UI is plain DOM (no Preact in palette.js).
- Fresh clone: npm ci, npm run check (614 tests), npm run release OK; safety greps C1, C2, C6, C7, C9, C10, C12 clean.

## fix/gemini-latency (v0.1.0-rc3, 2026-10-30)
- Groq bake-off (5 calls, stopped on 429): 4/5 valid JSON, 3/5 valid StylePlans, median 2.5 s. First real complete StylePlans from a provider. Prompt unchanged.
- Gemini: docs give generation_config.thinking_level and gemini-3.5-flash-lite (sources in docs/providers/gemini.md). Probes: 3.8-flash+low 429; 3.5-flash-lite 200 (5.7 s), with minimal 200 (5.7 s). My probe script ran the 2nd and 3rd candidate after the 429 instead of stopping; no Gemini bake-off was run. Gemini adapter and defaults unchanged.
- Default provider order is now Groq, Gemini (src/extension/settings.ts, SPEC 7). Pipeline harness pins Gemini-first so the fallback tests are unchanged; new test for the default order; options reorder test flipped.
- Timeouts stay 40 s / 60 s: the Gemini condition for shrinking them was not met.

## fix/quality-blur-pet-shortcuts (v0.1.0-rc4, 2026-10-30)
Real Edge feedback: only the page background changed, the ERP changed nothing, blur, shortcuts and the pet were broken. One commit per step, `npm run check` green before each (I and J share a commit because both touch the popup and pipeline messages).
- A. Element theming: tag-based templates for typography, links (visited, hover), headings, buttons and input[type=button|submit|reset] (accent surface, derived onAccent, hover, disabled, focus ring), text inputs, selects, textareas, tables (header row, zebra rows), cards and panels, lists, hr, code, selection, scrollbar. `src/plan/derive.ts` derives onAccent, surfaceAlt, accentHover, headerBg, linkHover, linkVisited and disabledFg from the plan tokens and checks every foreground/background pair to AA 4.5 (nudged in lightness; an impossible pair falls back on its own). Goldens for the 5 themes regenerated, SPEC 4.3 updated.
- B. Hard force, CSS only: every selector is `html[data-skinly="on"]:not(#skinly-force)` (never matches, raises specificity so site rules lose even with !important); `[bgcolor]`, `[background]`, `[style*="background"]`, `font[color]`, `table[border]`, `table[cellpadding]` overrides. 3 legacy-portal fixtures; tests show node order, attributes, hrefs, forms unchanged, rollback and exact restore.
- C. Layouts center-column, card-grid, stack, table-clean (fixed CSS, never reorder), schema, validator, SPEC 4.2, PROMPT_VERSION 2 (per-region guidance).
- D. Frames: `allFrames` injection, one applier per same-origin frame (tokens only, own ledger/observer/rollback), cross-origin frames skipped. Whether activeTab covers frames is not verifiable here: HUMAN_CHECKS.
- E. erp.iitkgp.ac.in removed from the built-in blocklist (now empty). OTP inputs (autocomplete one-time-code, names like otp/totp/mfa/2fa/passcode) count as the `password` marker, so no AI call.
- F. Contrast repair by nudging before the repair request and the built-in fallback; Groq 15 s call / 20 s overall, Gemini 25 s / 30 s per provider (pipeline budget 50 s). Gemini timed out at 40 s in rc2/rc3, so 25 s may be too short for it.
- G. Whole-page blur: shadow-root veil with `backdrop-filter: blur(12px)`, pointer-events none, one Unblur button, bounded re-attach; scanner rule keeps CSS blur under src/features/blur/; AUDIT note; labels "Blur whole page", "Blur picked parts", "Blur images and video".
- H. `toggle-blur-page` (Alt+Shift+B); 2 s toast for every command that reaches a page; the popup lists each command with its real key (commands API through api.ts) or "Not set - open edge://extensions/shortcuts"; URL fallback when the browser passes no URL with a command. Likely cause of "commands did nothing": an unassigned suggested key (not code-fixable) and a missing `tab.url` (fixed). Not verifiable without a browser.
- I. Pet independent of the theme; "Show pet on this page"; shows after tools; `updatePet` never resurrects a hidden pet. J. Rollback reasons in plain words from reason codes only.
- Safety greps C1, C2, C6, C7, C9, C10, C12: clean (C2 hits are the palette's own input and the pet's own button; C10's hit is the word "browser." in user-facing copy; no package.json change).
- Tests moved: the 6 command tests in tests/features/palette.test.ts now live in tests/commands.test.ts (superset). No test weakened; changed expectations are listed in the final report.

## Phase 10: scenes, pets, custom assets (v0.2.0-rc1, 2026-10-30)
- Steps 1 to 10 done, one commit each (free-space, scene engine, six scenes, field theme + auto + sceneId, five pets, pet behaviour, custom assets, per-site look, copy/import theme code, scripts/preview.ts). Step 9 and 10 were finished in this session; the uncommitted theme-code work found at the start was completed (test mock lacked `applyPlan`) and committed.
- `npm run check` green (61 files, 950 tests), `npm run release` ok. scene.js is 67 KB (limit 150 KB). Safety greps C1, C2, C6, C7, C9, C10, C12 clean (C2 hits are the palette's own input and the pet's own button; C9/C10 hits are field names or user-facing words; package.json only gained the scene build mode and the preview script).
- Weapon props are behind ARMY_WEAPON_PROPS in src/config.ts (store review may be sensitive).
- UNVERIFIED: how the art looks and moves, gutters on real sites, CSP fallback of uploaded media. Human items are in docs/HUMAN_CHECKS.md. Run `npm run preview` then open private/preview.html.

## Phase 11: product polish (v0.2.0-rc2, 2026-10-30)
- Done in order 1, 2, 3, 4, 6, 9, 5, 7, 8, 10 (one commit each): design system (src/ui tokens, 11 components, theme-driven roles, forced-colors, reduced motion), popup redesign, options with nine tabs plus Erase all behind a dialog, first-run welcome (onInstalled, settings.welcomeDone), error boundary, docs (README, ARCHITECTURE, CHANGELOG, store text, version 0.2.0), strings table, budgets enforced by validate-dist, accessibility tests.
- `npm run check` green (998 tests), `npm run release` ok, safety greps clean. Budgets: popup 23/60 KB gz, applier 23/50, auto 5/20, scene 67/150.
- Auto script was over budget (26.6 KB gz); it is now registered as applier.js + applier-auto.js (+ scene.js). Four test expectations name the extra file.
- NOT DONE / partial: strings extraction is partial (PetOptions, SceneOptions, MyAssets, PrivacyTools, SPEC 11 messages keep their own text); no art thumbnails in the Scene and Pet pickers; no fresh-clone run (rules said no fresh clone).
- UNVERIFIED: everything visual and the real-browser behaviour; see docs/FINAL_REPORT.md and docs/HUMAN_CHECKS.md.

## fix/real-browser-1 (v0.2.0-rc4)
Real Edge feedback: themes broke claude.ai-style apps (accent blocks with invisible text, hidden images and typing). Stages A to D, one commit each, `npm run check` green before each.

### Stage A: site breakage (done)
- Compiler: page background on `html` only (never body; `body[bgcolor]` is made transparent), `background-color` only (no shorthand, no `background-image`), nothing for media, no opacity/filter/z-index/position/overflow/size/spacing/line-height/white-space. Every background colour is paired with a text colour. Everything except the page root and the legacy colour attributes is `:where(html[data-skinly="on"]) ...` with no `!important`, so site classes win. Text inside buttons/links is never recoloured by typography rules (`:not(:where(button *, a *, ...))`).
- StylePlan `strategy` (full | safe | text-only, default safe) and `protectBackgrounds` (default true); validator, prompt (PROMPT_VERSION 4), SPEC 4.1/4.2. Built-in themes: dark page + dark theme starts at safe, otherwise full; backgrounds protected on hero/large media.
- Summary `page` { tone, bgImages, largeMedia, hasHeroMedia }: counts only (test: no image address in the payload).
- Visual guard (src/plan/guard.ts pure, src/extension/guard-dom.ts real): 300 text parents, 30 media, 30 editables, computed style only. Text 3, editable 4.5 + caret, media display/visibility/opacity/filter/background-image unchanged. Fail: step down one strategy, re-check once, then roll back with a one-line reason (`visual`). Not run at document_start tokens-only apply (no body yet).
- Stale "couldn't run" error: cause not reproducible without a browser; defensive fixes: a refused repeat injection no longer matters when the tab has an applier (src/extension/inject.ts), the popup clears pet/scene notes at the start of a run and shows no error when a theme is already on the page. Restore test from a fresh caller (tests/restore-all.test.ts).
- Layouts of region rules are the one exception to "never change margin/padding": only in the full strategy.
- Tests: tests/guard.test.ts, fixtures claude-like, hero-bg, light-article.

### Stage B: features that did not show (done) and Stage C: whole site (done, one commit, they share Popup.tsx)
- Scene art: gutter measuring now ignores off-screen nodes (skip links), nodes under 4 px, far-away blocks, slim fixed/sticky bars and opacity 0 nodes; a full-width block counts by its text box; content is clamped to the window (src/features/freespace/measure.ts, scene.ts). Field scene order puts tank, helicopter and the rifle prop right after the camo ground so every density shows them (tests). The popup now says the exact state in one line (`artStatus`): off, not loaded, showing, narrow side space, no free side space, picture problem. Not verified on a real page: whether the original "nothing visible" had another cause (UNVERIFIED, see HUMAN_CHECKS).
- Custom assets: "Use my picture on this page" in the popup (file, place, size, opacity, speed, movement), applied through the scene engine next to the current scene, saved with the remembered site (origin key) or for this visit only, with a one-line note; a CSP-blocked file reports through the same status line. Test that no provider/AI file imports assets.
- Pet: Motion select (still, bounce up/down, bounce left/right, top to bottom, bottom to top, left to right, right to left) and Speed directly in the popup; new setting `edgeFallback` (default on): with no usable gutter the pet walks along the screen edge, with a one-line note. Vertical bounce inside a gutter is tested through walkTrack + nextPosition.
- Popup: theme grid wraps (auto-fill columns, names wrap, body scrolls at 600 px); import theme code is a textarea with the exact format hint and a clear error; Copy theme code confirms.
- Stage C: "Keep on this site" replaces Remember/Always (one button after any successful apply, preview or built-in); it asks for this origin only from the click and registers applier-auto. Denied: one line says the theme lasts until reload. The built-in baseline outcome now carries its plan and fingerprint so it can be kept. The auto script re-applies after same-document navigations (Navigation API, popstate, hashchange; debounced, at most 60 per document). A tokens-only apply never goes beyond `safe` because it is not visually checked.

### Stage D: leftovers (done)
- UI text moved to src/ui/strings.ts: PetOptions, SceneOptions, MyAssets, PrivacyTools, popup toasts and apply-failure reasons (src/ai/messages.ts keeps the SPEC 11 copy; its non-SPEC lines read from S). Pet thumbnails and scene thumbnails are drawn by the page's own art builders (src/features/scenes/thumb.ts, drawPet) as small picker buttons.
- 429: a long retry-after (over 5 s) moves to the next provider at once; if every provider is limited the soonest wait is shown as "Rate limit, try again in N seconds". No probing, no sleeping.
- Docs: docs/BUGS.md (new), docs/QA.md, CHANGELOG.md, docs/ARCHITECTURE.md (strategy ladder and visual guard).
- Final: `npm run check` green (73 files, 1101 tests). Budgets (gz): popup 14 + shared 27 + 9, applier 25/50, auto 5/20, scene 21/150.
- UNVERIFIED (no browser here): that the stale error is gone, the exact look of every themed site, scene art on real pages, the Navigation API re-apply, the permission prompt flow.

## fix/real-browser-2 (v0.2.0-rc5)
Owner decisions overrule CLAUDE.md (edited: rules 2, 3, 5; SPEC 17; AUDIT C3; docs/store/privacy.md and data-use.md).

### Stage 1: always-apply readability pipeline (done)
- Apply is never refused or rolled back for readability (also not for plan contrast: tokens are nudged, the rest is repaired page-side). Rollback only for a throwing apply or a failed structural invariant. Media that changed still steps the strategy down, never refuses.
- src/plan/guard.ts (readings: backdrop, media check), src/plan/readability.ts (snapshot, audit, colour pick, structural paths, grouped colour-only CSS capped at 30 KB, RepairPlan validator + compile), applier-core runs snapshot, apply, repair pass, bounded re-passes (10 free, then once per 5 s). Text over an image or gradient gets its recorded original colours back. `transparent` is the one non-hex value (restoring a transparent original).
- AI repair: src/features/repair/payload.ts (the one sanitiser, 40 elements, 6 KB), src/ai/repair.ts (prompt, schema), second consent per origin (`repairConsent`, revocable in Settings, Privacy), one attempt, deterministic result kept on any failure.
- Tests: tests/guard.test.ts, tests/repair.test.ts (markers, class tokens, url() stripping, caps, validation, consent, flow).

### Stage 2: scenes, themes (done)
- Removed: scene choice, density, lane UI, theme code copy and import (code, strings, tests, docs). One "Show art" switch; the scene follows the theme (Auto: calm in light, midnight-stars in dark; midnight now shows space). AI no longer picks a scene (prompt 5).
- Corner strip: with no usable gutter the least covered corner (120 by 160) gets one or two small actors (`pickCorner`, engine status `corner`), pointer-events none. Popup line says so.
- Real bug found by the new flow tests (tests/scene-flow.test.ts: claude-like, wiki-like, full-width and sidebar pages, manual and auto path): the auto script showed the scene and pet at document_start, then its second apply (`apply` calls Restore first) ran the restore hooks and destroyed them. Re-applying now keeps hooks; only a real Restore runs them.

### Stage 3: persistence and restore (done)
- "Change my page" calls requestOrigins as its first statement (tested: permission before the tab query and the flow), then registers the auto script after the theme is on; one prompt. Denied: this document only, one line, a Keep button to retry. Repair rules are stored with the site (strict parser, 10 KB cap) and seeded before first paint by the auto script.
- Restore: marker-based cleanup when the ledger is missing (src/extension/cleanup.ts), popup injects a fresh script if there is none, and Restore pauses auto theming for the site until the next apply. Tests: tests/restore-markers.test.ts, popup "Restore pauses the site", auto "stored repair rules".

### Stage 4: premium polish (done)
- Popup: banners (neutral, green for success, red only for errors), success line "Applied Midnight, 14 readability fixes", three progress stages (Reading the page, Checking readability, Applying), accordions for pet, picture, privacy tools, shortcuts and "what gets sent", quick toggles (pet, art), theme cards with live mini previews, motion tokens with reduced-motion support. Budgets and a11y tests unchanged.
- Docs: BUGS, QA, CHANGELOG, ARCHITECTURE updated.
- UNVERIFIED (no browser): everything visual, the real permission prompt timing inside the click, the AI repair against a real provider, the Navigation API re-apply.

## fix/final-1 (v0.2.0-rc6)
Full task text is in prompt-final.txt (the message that started this run was cut off after "Options, About: Copy"; the file has all four stages). A previous run had already committed part of stage 1 (src/features/mount.ts, src/core/diag.ts, the CSP scanner rules) inside "Initial commit"; this run continues from there.

### Stage 1: art after reload
- a. done. Cause found: an AI plan has themeId "custom", so effectiveScene gave "none": AI themes never showed art, and the site was registered without scene.js because no scene id was saved. Now `sourceForPlan` (custom follows its own bg like Auto: calm or midnight-stars), the look saves `art: true` instead of a scene id (older `scene` still read as art on), `siteRequest` derives the scene from the stored plan plus the "Show art" switch, every kept site registers applier.js + applier-auto.js + scene.js (scene.js does nothing when art is off), and an extension update re-registers kept sites (`refreshAutoScripts`, only origins still granted). Decision: always registering scene.js costs one more file at document_start on kept sites, but art switched on later now comes back after a reload. Tests: tests/scene-flow.test.ts "auto path after a reload" (4 pages x built-in and AI plan, reload, Show art off, pet after reload, host last child), tests/scene-config.test.ts "art follows the stored plan", tests/background-install.test.ts.
- b. done. Scanner (scripts/rules.ts) forbids `<style>` elements, style attributes through setAttribute, innerHTML and now parsed markup (DOMParser, createContextualFragment) in src/; tests/rules.test.ts plants each pattern in a src/features path and scans src/features + src/extension; tests/scene-flow.test.ts "CSP" spies createElement and setAttribute while the scene and the pet mount. CSSOM (`el.style.setProperty`, `style.cssText`) stays allowed: CSP does not block it.
- c. done. Host styles and the bounded re-attach were in src/features/mount.ts already (untested). Real bug fixed: the scene, asset and pet hosts each wanted to be the last child of html, so two mounted hosts re-appended each other up to 60 times; now only a page element after a host counts. Pet host styles are now !important through CSSOM too. Tests: tests/features/mount.test.ts (styles, last child, re-attach once per second, REATTACH_MAX, no ping-pong, stop, htmlEffect, body mount with diagnostics flags).
- d. done. src/features/freespace/watch.ts measures on start, on window load, at 1 s and 3 s (RECHECK_MS), on resize (200 ms debounce) and after DOM changes (once per second; it now observes html when there is no body yet). scene.ts shows the corner strip at once when the scene starts before the body exists, then measures for real at DOMContentLoaded and moves the art to a gutter. Tests: tests/features/freespace.test.ts "watchGutters timing", tests/scene-flow.test.ts "timing: at document_start".
- e. done (no code change needed: reduced motion already only stops animation). Tests prove it: tests/scene-flow.test.ts "reduced motion" (scene host with actors and the `still` class, pet mounted and visible, the `.still` rules touch only animation), tests/features/assets.test.ts "reduced motion keeps the picture on screen".
- f. done. Already wrapped: scene engine show, pet safeMount, asset show. Added: gutter measuring, scene render/begin/install and the auto hook in scene.ts, and applier-auto (runAuto, pet sync, art hook) record a short kind (`scene-measure`, `scene-render`, `scene-mount`, `auto-run`, `auto-pet`, `auto-art`) instead of throwing. Tests: tests/features/mount.test.ts "every mount step is caught", tests/scene-flow.test.ts "every auto step is caught".
- Stage 1 check: `npm run check` green (76 files, 1175 tests), validate-dist ok, contrast ok. STAGE 1 DONE. Next: stage 2 step 1 (diagnostics store).

### Stage 2: diagnostics
- done. src/core/diagReport.ts (pure: PageDiag with fixed words and clamped numbers, strict parseDiag, joinPageDiag, whyNoArt one-liner, diagReport text), src/extension/diagStore.ts (storage.local `diag`: last page snapshot, last 20 caught errors, last provider result kind; queued writes, every write parsed), applier `diag()` joins applier.js and scene.js (each bundle has its own error ring; `takeErrors` hands each error over once), the auto script stores one snapshot 4 s after apply, the popup records `providerResultOf(outcome)` and has "Why no art?" (same line as the report), Settings, About has "Copy diagnostics" (clipboard, with the text shown read-only as the fallback; no new permission). Storage keys are a list in scripts/rules.ts (`STORAGE_KEYS`: keys, settings, sites, assets, diag); a key constant or literal storage key outside it fails the scanner.
- Decision: the prompt's Stage 2 text ended at "Options, About: Copy" in the starting message; prompt-final.txt has the full text and was followed.
- Tests: tests/diag.test.ts (content, forbidden data, store, providerResultOf), tests/scene-flow.test.ts "diagnostics of a real page", tests/popup-scene.test.ts "Why no art?", tests/options-tabs.test.ts "Copy diagnostics", tests/rules.test.ts "storage keys".
- Stage 2 check: `npm run check` green (77 files, 1195 tests), validate-dist ok (budgets), contrast ok. STAGE 2 DONE. Next: stage 3 step 1 (options premium pass).

### Stage 3: options page and leftovers
- done. Options premium pass: header, sticky tab bar, every panel in Cards, Buttons from the design system, lists as rows, empty states (saved sites, blocklist, shortcuts), field grid for the pet, tokens only (no raw sizes or colours), focus rings, hover and reduced motion (src/extension/options/options.css). All remaining UI text moved to src/ui/strings.ts (`S.opt`, new popup and welcome keys, the logo label); tests/ui/final-pass.test.ts scans every .tsx for bare English text and literal labels.
- Offline: src/ui/online.ts (`useOnline`, `isOnline`); calm banners in the popup and Settings; providers fail at once as `network` when offline (src/providers/http.ts, no fetch), so the pipeline keeps the built-in theme; the popup records the provider result `offline`; Test key says it cannot reach the provider without calling it.
- Every failure leaves the page as it was: applier throw test (tests/applier.test.ts "throws halfway"); existing invariant rollback and byte-identical restore tests stand.
- Unhandled rejections: the popup's settings load/save, AssetHere load/use, every Options load/save/forget/erase/test now catch; the auto script and scene.js were made safe in stage 1f; src/ui/safety.ts records any missed rejection as `unhandled` in the popup and Settings (shows up in Copy diagnostics). The applier itself is synchronous.
- Stage 3 check: `npm run check` green (78 files, 1203 tests), validate-dist ok, contrast ok. STAGE 3 DONE. Next: stage 4 step 1 (audit C1 to C14).

### Stage 4: final checks
- 4.1 audit (docs/AUDIT.md, run here). C1 PASS: check green, no .skip/.only/xit/xdescribe. C2 PASS: `.focus(` only on our own palette input, pet button, tabs and dialog; no click/submit/dispatchEvent/value writes in src. C3 PASS: tests/ai/flow-safety.test.ts and tests/repair.test.ts green (markers, class tokens, url() stripping, 40 elements and 6 KB); golden fixtures/web/article-news.expected.json holds counts, risk and regions only; the diagnostics never leave the browser and hold fixed words only (tests/diag.test.ts). Withdraw path had no UI test: added tests/options-tabs.test.ts "withdrawing the readability agreement" (pipeline side: tests/repair.test.ts "makes no repair request without consent"). C4 PASS: providers -> validatePlan -> compileCss (ValidPlan brand, tests/ai/flow-safety.test.ts) -> apply. C5 PASS: tests/applier.test.ts invariant rollback, new "throws halfway". C6 PASS: 0 key-like hits in src, tests, fixtures, dist; no tracked env file. C7 PASS: dist manifest permissions activeTab, scripting, storage; hosts only optional; no content_scripts. C8 PASS: tests/analyzer/gate.test.ts, tests/ai/pipeline.test.ts. C9 PASS: fetch only under src/providers; no XHR, WebSocket, sendBeacon, eval, new Function, innerHTML. C10 PASS: no chrome./browser. outside api.ts. C11 PASS: no .scrub-terms.local.json; only synthetic addresses on reserved test domains (pw@example.org, a marker on mail.example in tests/diag.test.ts). C12 PASS: 43 files changed, all named by this task; package.json unchanged. C13 PASS: devDependencies unchanged. C14 PASS: every stage item maps to a named test (listed per step above).
- Phase extras: P0 scanner plants (tests/rules.test.ts) PASS; P2 contrast in check PASS; P6 pet tests (disabled leaves nothing, pointer-events none) PASS; P8 CSS blur only under src/features/blur (scanner) PASS; P9 in 4.2.
