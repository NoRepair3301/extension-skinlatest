# RENAME_MAP — Skinly AI to Repaint (Stage 6)

Written by S6.1 on 2026-11-06. No source was changed. Decisions: D3 (full rename, storage keys unchanged, legacy `skinly1:` imports keep working, new exports `repaint1:`), D9 (marker becomes `data-repaint-engine`), D10 (version and release zip name are owner actions).
Progress tool: `node scripts/rename-check.mjs --summary` (also `--class X`, `--json`, `--list-allowed`; `npm run rename-check`). It exits 1 until S6.6 is done. A hit is one line; a file whose own name contains the old name counts as one hit on line 0.

## Starting numbers (before S6.2)

| Class | Hits | Files | Allowlisted | Owner |
|---|---|---|---|---|
| A DOM markers/attributes | 202 | 50 | 0 | S6.2 (protected-zone attrs: S6.4 identifier-only) |
| B window globals | 109 | 14 | 0 | S6.3 |
| C message types/contracts | 5 | 3 | 0 | S6.3 |
| D bundle/IIFE/build config | 2 | 1 | 0 | S6.3 |
| E CSS ids/classes/host names | 8 | 5 | 0 | S6.4 |
| F theme code prefix | 1 | 1 | 0 | S6.4 |
| G storage keys | 0 | 0 | 0 | none (UNCHANGED, D3) |
| H package/manifest/scripts/release/assets | 18 | 14 | 0 | S6.5 |
| I user-visible strings, README, docs | 94 | 29 | 0 | S6.6 |
| J tests, comments | 53 | 22 | 0 | with the class they test; rest S6.6 |
| K archives/history | 0 | 0 | 164 | never |
| **Total** | **492** | **111** | **164** | |

Counts per class overlap with owner substages because tests move with the code they test (see J).

## Classes

### A. DOM markers and attributes (S6.2, then S6.4 for feature attributes)
- Patterns: `data-skinly` -> `data-repaint` (root marker, value `"on"`); `data-skinly-engine` -> `data-repaint-engine` (D9; `scripts/validate-dist.ts` literal `ENGINE_MARKER`, line 14); `data-skinly-r` -> `data-repaint-r`; `data-skinly-ui` -> `data-repaint-ui`; `-scene`, `-blur`, `-pet`, `-toast`, `-share`, `-table`, `-sort`, `-hide`, `-cover`, `-found`, `-engine-sheet` likewise.
- Where: single-source constants `ROOT_MARK` / `ENGINE_MARK` in `src/engine/dom.ts:137-138` (S2.3); literals still spread in `src/extension/cleanup.ts` (ATTRS list), `src/extension/api.ts:204`, `src/plan/invariants.ts:10` (`ours()` prefix test), `src/analyzer/regions.ts:43`, `src/features/{toast,tables,scenes,blur,pet,palette}`, and 40+ test files. Top files: tests/auto.test.ts, tests/engine/dom.test.ts, tests/applier.test.ts, tests/features/blur.test.ts, tests/restore-markers.test.ts, tests/scene-flow.test.ts, tests/engine/refresh.test.ts, src/extension/cleanup.ts, tests/engine/ledger.test.ts, tests/features/scenes-engine.test.ts (50 files).
- Compat: none needed at runtime (a reload of the extension replaces all bundles). Page markers left by an old build on an open tab are removed by the new `cleanup` only if it lists the old names too; recommended: S6.2 keeps old names in the cleanup list for one release (class-G-style "legacy" line, allowlisted with a reason) or accepts that a tab reload clears them. Decide in S6.2; default: reload clears them, no legacy list.
- Risk: protected zones (`src/features/{pet,blur,scenes,palette,tables}`): attribute-name literals only, no logic (CLAUDE.md rule 4, Stage 6 exception). Prefix tests: `startsWith("data-skinly-")` and `name === "data-skinly"` must move together with the constant.

### B. window globals / injected API names (S6.3)
- Patterns: `skinlyApplier` -> `repaintApplier`; `skinlyTools`, `skinlyToast`, `skinlyScene`, `skinlyPalette`, `skinlyOnApplied`, `skinlyAutoLive` likewise (`skinlyApplier.diag` too).
- Where: `src/extension/{applier,applier-auto,scene,api}.ts`, `src/features/*` page entries; 14 files, mostly tests (tests/scene-page, scene-flow, auto, compat, restore-all, restore-exact, persistence).
- Compat: none. Writers (bundles) and readers (`api.ts` callApplier and friends via `chrome.scripting`) must change in the same substage.
- Risk: the bundle that sets the global and the `func:` injected from the popup that reads it run in different worlds; a half-rename silently does nothing. Test with `tests/scene-page`, `tests/persistence`, `tests/restore-*`.

### C. Runtime message types and port contracts (S6.3)
- `skinly-badge-on` -> `repaint-badge-on` (`BADGE_MESSAGE`, `src/extension/messages.ts:2`; sender in applier, receiver in background; tests/persistence.test.ts, tests/auto.test.ts).
- Registered auto-script ids: `scriptId(origin)` = `skinly-<hash>` (`src/extension/siteActions.ts:27`) -> `repaint-<hash>`. **Compat needed:** scripts already registered under `skinly-<hash>` survive an extension update; `reconcile` must unregister the old ids once (or the new code must also unregister `skinly-*` ids). Recommended default: reconcile removes any registered id starting `skinly-`.
- `runInPage` actions: no `skinly-` literals found.

### D. Bundle/IIFE names and build config (S6.3)
- `vite.config.ts`: IIFE names `SkinlyApplier`, `SkinlyApplierAuto`, `SkinlyPalette`, `SkinlyScene` -> `Repaint*`; plugin name `skinly-manifest` -> `repaint-manifest`. Output file names (`applier.js`, `applier-auto.js`, `palette.js`, `scene.js`) carry no old name and stay.
- `scripts/validate-dist.ts:14` literal moves with class A (S6.2) because the marker appears in the built `applier.js`.

### E. CSS ids, classes, custom properties, host names (S6.4)
- `skinly-force` (specificity id `:not(#skinly-force)`, an engine selector trick: must match between CSS generation and test expectations), `skinly-ui-box`, `skinly-pet`, `skinly-cover`, `skinly-list`, `skinly-opt-*`, `skinly-child`. Files: `src/features/palette/ui.ts` (4), `src/features/assets/render.ts`, tests.
- Also `startsWith("skinly")` class filter in `src/features/blur/selector.ts:9` (it keeps the extension's own classes out of generated selectors): change to `repaint`, and keep `skinly` as well for pages still carrying old classes? Default: change to `repaint` only.
- Compat: none.

### F. Theme code prefix (S6.4)
- `skinly1:` -> `repaint1:` for new exports. **Import must accept both.**
- Finding: this repo has no theme-code encode/decode code today. The prefix appears only in the help string `S.options.importFormat` (`src/ui/strings.ts:42`), and in `tests/popup-scene.test.ts` there is no code path for it. So S6.4 has either to find where theme codes live (search found nothing in `src/`) or to add a tiny `parseThemeCode` that accepts `repaint1:` and `skinly1:` plus a test. Recommended default: update the string to `repaint1:` and mention legacy `skinly1:` is still accepted only if the importer exists; otherwise note the gap in HANDOFF and do not invent a feature (F4 only demands the compat line stays allowlisted).
- Allowlist: lines in `src/` or `tests/` containing `skinly1:` and the word `legacy` or `compat` are hidden (so a deliberate compat line does not count).

### G. Storage keys: UNCHANGED (D3)
Keys found: `settings`, `keys`, `sites`, `schema`, `intent`, `diag`, `assets`, retired `auth|entitlement|plan`. None contains the name, so nothing to list or allowlist. If a later change adds one containing the name, it needs an exact-string allowlist entry.

### H. Package, manifest, scripts, release, assets (S6.5)
- `package.json` `name` `skinly-ai` -> `repaint` (and the two `package-lock.json` name fields; edit by hand, no install). `manifest.json` `name` and `action.default_title` `Skinly AI` -> `Repaint`; `description` has no old name. `scripts/release.ts:40` zip name `skinly-ai-<version>.zip` -> `repaint-<version>.zip` (tests/release.test.ts has 3 expectations and `docs/QA.md` 1 reference; version stays 0.3.0, D10). `scripts/preview.ts` page title. `src/extension/Logo.tsx` comment. `src/features/blur/screenshot.ts:18` download name `skinly-YYYYMMDD-HHMMSS.png` -> `repaint-...` (protected zone, identifier-only; tests/features have two samples).
- Assets: `assets/skinly-logo.svg`, `assets/skinly-icon.svg`, `assets/skinly-logo-512.png` are renamed to `repaint-*`; references in `assets/LICENSES.md`, `src/extension/Logo.tsx`, and any docs/store text move with them. File renames are not text edits, so S6.5 does them and updates the references. Untracked/ignored `release/skinly-ai-0.1.0.zip` and `-0.2.0.zip` are build leftovers in the git-ignored `release/` folder; the owner deletes them (not a repo change).
- Owner art (list only, no edits here): `assets/skinly-logo-512.png` and `assets/icons/icon-{16,32,48,128}.png` may contain the old wordmark or a "S" glyph; the owner checks and redraws if so.

### I. User-visible strings, README, docs (S6.6)
- `Skinly AI` / `Skinly` in `src/ui/strings.ts` (39 lines, includes the S5.4 `S.edge` group), `src/ai/messages.ts`, `src/extension/{siteActions,petActions}.ts`, `src/config.ts`, `src/core/diagReport.ts`, `src/core/log.ts` (`[skinly]` log prefix), README, `docs/SPEC.md`, `docs/store/{listing,privacy}.md`, `docs/QA.md`, toast titles `Skinly: ...`, `scripts/preview.ts`.
- Compat: tests that assert exact text (tests/commands, a11y, popup, options-tabs, edge-states, strings) change with the strings in S6.6. Keep UI strings in `src/ui/strings.ts` (CLAUDE.md §7).
- Owner choices (D10): exact store title and tagline, GitHub repository name. Default `Repaint`.
- CHANGELOG: old entries keep the old name (class K); the Unreleased block gets a "Renamed to Repaint" line by hand in S6.6.

### J. Tests, fixtures, comments
- Tests that assert a renamed contract change in the same substage as that contract (counts in the table above overlap A-I). Test-only names (`skinly-test`, `skinly-deadbeef`, `.skinly-test-dist`, `.skinly-release-test`, `.skinly-no-such-dist` temp dirs and fake ids) are cosmetic: S6.6 renames them; no behaviour depends on them.

### K. Archives and history (never renamed; allowlisted)
`docs/archive/**`, `workflow/**` (including this file), `prompts/**`, `CLAUDE.legacy.md`, `_recon/`, `STAGES.md`, `specs.md`, `CHANGELOG.md`, and the history logs `docs/{PROGRESS,FINAL_REPORT,HUMAN_CHECKS}.md`, `docs/PHASE_*.md`, `PROMPTS.md`, `prompt-launch.txt`, `autopilot-all.ps1`. The scanner, its allowlist and its test (`scripts/rename-check.mjs`, `scripts/rename-allowlist.json`, `tests/rename-check.test.ts`) quote old names on purpose and are treated as class K.
(CHANGELOG is hidden wholesale for now; S6.6 must check its new Unreleased lines by eye.)

## Must change together
1. **Marker group (S6.2):** `ROOT_MARK`/`ENGINE_MARK` in `src/engine/dom.ts`, every literal `data-skinly*` in src, `cleanup` ATTRS, the `ours()` prefix test in `src/plan/invariants.ts`, `ENGINE_MARKER` in `scripts/validate-dist.ts`, the applier-auto "marker absent / applier present" assertion (D9, S2.4), and all tests. One substage, atomic. `src/engine/` logic is unchanged; only the two constants' values (engine invariants hold).
2. **Page API group (S6.3):** global names written by bundles and read by `api.ts` (`callApplier`, `skinlyToast` etc.), plus IIFE names in `vite.config.ts` and the tests that fake the globals.
3. **Message group (S6.3):** `BADGE_MESSAGE` sender and receiver, and `scriptId` plus its registration cleanup (old `skinly-*` ids must be unregistered once).
4. **Package group (S6.5):** manifest name/title, package.json and package-lock names, `scripts/release.ts` zip name with `tests/release.test.ts` and `docs/QA.md`, asset file renames with every reference.
5. **Strings group (S6.6):** `strings.ts` and the tests asserting its text.

## Order
S6.2 (A) -> S6.3 (B, C, D) -> S6.4 (E, F, feature attributes left in protected zones) -> S6.5 (H) -> S6.6 (I, J, docs). Gate green at the end of each; `rename-check --summary` shows the class falling to 0.

## New naming table

| Old | New | Notes |
|---|---|---|
| Skinly AI / Skinly | Repaint | strings, manifest, docs; no "AI" suffix |
| skinly-ai | repaint | package name, zip `repaint-<version>.zip` |
| `data-skinly` | `data-repaint` | root marker, value `on` |
| `data-skinly-engine` | `data-repaint-engine` | D9 |
| `data-skinly-{r,ui,scene,blur,pet,toast,share,table,sort,hide,cover,found,engine-sheet}` | `data-repaint-*` | same suffixes |
| `skinly{Applier,Tools,Toast,Scene,Palette,OnApplied,AutoLive}` | `repaint{...}` | window globals |
| `Skinly{Applier,ApplierAuto,Palette,Scene}` | `Repaint{...}` | IIFE names |
| `skinly-manifest` | `repaint-manifest` | vite plugin |
| `skinly-badge-on` | `repaint-badge-on` | message type |
| `skinly-<hash>` | `repaint-<hash>` | registered script id; migrate old |
| `skinly-{force,ui-box,pet,cover,list,opt-*,child}` | `repaint-*` | CSS ids/classes |
| `skinly1:` | `repaint1:` | new exports; import accepts both |
| `skinly-YYYYMMDD-HHMMSS.png` | `repaint-YYYYMMDD-HHMMSS.png` | blur screenshot name |
| `[skinly]` | `[repaint]` | debug log prefix |
| `assets/skinly-{logo.svg,icon.svg,logo-512.png}` | `assets/repaint-*` | owner redraws art if it has text |
| storage keys | unchanged | D3 |
