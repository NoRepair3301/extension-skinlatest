# specs.md — Repaint: what is being built and what "done" means

Source of truth for the staged build. Derived from the recon report of 2026-11-04 plus the owner's requirements. Stage-by-stage execution is in `STAGES.md`.

## 1. Goal

Finish the half-done color-engine refactor of `extension-new/` (Skinly AI 0.3.0) and ship it as **Repaint**:

- Clicking a theme applies it to the whole page immediately (no separate apply button).
- A "Restore original" control returns the page to its exact pre-extension state.
- No paid tiers; everything is free.
- Renamed from Skinly AI to Repaint.
- `npm run check` passes with zero errors, then `npm run build` succeeds.

## 2. Repo facts the plan relies on (recon, 2026-11-04)

- Only `extension-new/` is a git repo (branch `main`, HEAD `12a775e`). `chroma-shift/` and `darkreader-main/` have no VCS and are references only.
- Engine: `src/engine/{color,dom,index,transform}.ts` (1046 LOC). Per-element computed-style recolor, inline `!important` writes, write ledger `{o,p,m}`, base adopted sheet, MutationObserver with `quiet()`, event-driven hover/focus refresh, open shadow roots. Derived from `chroma-shift/content.js` and `color.js`.
- Known engine defects: `PropRecord` undeclared (`dom.ts:57`); `reset(el)` restores the whole `style` attribute (`dom.ts:208-227`) and `refreshBatch` calls it before recomputing (`dom.ts:365`), clobbering page style changes; fresh-instance `markerCleanup` (`src/extension/cleanup.ts`) cannot recognise the engine sheet nor revert inline styles.
- Both systems partly live: `applier-core.ts` runs the engine, but analyzer, region tagging (`data-skinly-r`), invariants and guard types still run. `compileCss` is no longer called.
- Auto path: `applier-auto.ts` -> `auto-core.ts:runAuto` -> `applier.applyTokens(...)` -> engine. `applier-auto.js` contains no copy of the engine by design; it needs `applier.js` injected first in the same isolated world.
- Baseline: tsc 1 error; eslint 4 errors; vitest 1299 pass / 19 fail in 5 files (88 files run; `tests/{build,budgets,release}.test.ts` not run by recon).
- Popup: "Change my page" (`Popup.tsx` `start()`) runs the full AI/permission flow. Theme radios only save `settings.theme`. "Restore original" exists. There is no "Apply changes" button.
- Premium: `src/backend/` (4 files), `backend/` (19 files, Supabase), `PlusDialog`, `PlanAccount`, `planFlag`, `src/core/entitlements.ts`, 14 src files, 19 test files, docs. Plus themes today: ocean, warm-paper, field.
- Rename: DOM markers `data-skinly*`, globals `skinlyApplier/Tools/Toast/Scene/Palette/OnApplied/AutoLive`, message `skinly-badge-on`, theme-code prefix `skinly1:`, IIFE names `Skinly*`, package `skinly-ai`. Storage keys do not contain the name.

## 3. Decisions (defaults; the owner may override before the affected stage)

| ID | Decision |
|---|---|
| D1 | The engine is derived from `chroma-shift`, which has no license file. S7.3 adds a `NOTICE.md` acknowledging it; the owner confirms rights before any release. |
| D2 | `chroma-shift` and `darkreader-main` are reference-only. Nothing is ported, copied from Dark Reader (MIT, attribution burden), or edited. |
| D3 | Rename is full, including internal contracts (DOM markers, globals, message type, IIFE names, package). Storage keys are unchanged. Importing legacy `skinly1:` theme codes keeps working; new exports use `repaint1:`. |
| D4 | Restore on a live instance must be exact (mandatory). Restore after the script instance is lost (extension reload) is best-effort via data stored in the element marker. |
| D5 | F1 scope: a theme click applies that built-in theme to the current tab at once, saves the choice, remembers the site (permission asked in the same click if needed), and un-pauses a restored site. The AI flow stays behind "Change my page", unchanged. |
| D6 | AI providers and consent stay. Only the dead `aiRepair` layer is removed. Justification (recorded in DECISIONS): the engine enforces contrast per element through `makeTransform`, and `applier-core` already stubs `repairPayload/applyRepair`, so the repair pass can no longer do anything. |
| D7 | Line endings are left as they are (`autocrlf=true`). No normalisation in this build. |
| D8 | Before S0.1 the owner commits the engine work to a branch (it is untracked today). |
| D9 | "`data-skinly-engine` in both bundles" is dropped as a requirement. Replacement: marker present in `applier.js`, plus a test proving the auto path reaches the engine through the applier. After the rename the marker is `data-repaint-engine`. |
| D10 | Version stays 0.3.0 until the final stage. The release zip name, store docs naming, and the GitHub remote name are owner actions after Stage 6. |
| D11 | A zero-dependency real-browser harness (Node built-ins + raw Chrome DevTools Protocol, Chrome is installed) is allowed as a dev tool outside `npm run check`. It overrides the legacy "NO e2e" rule only for that harness. If the owner rejects it, skip S7.1 and S7.2 (mark `SKIPPED`). |
| D12 | Final restore() may write back the original style attribute text only if the element's current inline declarations are semantically identical to it. Refines the friend's "no whole-attribute restore" rule; page-wins preserved. |
| D13 | Stored repair CSS (`repairCss` in a site record) is no longer applied, produced, or written back (owner decision, S3.3). Reasons: aiRepair is gone (D6), nothing creates `repairCss` any more, and stale `!important` rules can fight the engine. Records written by older versions still load: the field is ignored on read. Storage keys are unchanged (D3). |

## 4. Engine invariants (hold in every substage)

- **I1** Never hide the page (no `visibility:hidden`, no overlay) to mask theming.
- **I2** Every inline style the engine writes goes through the ledger: `PropRecord { o: original value, p: original priority, m: value the engine wrote }`.
- **I3** The engine only touches properties it wrote. Properties it never wrote are never read-modified or restored.
- **I4** Restore of a property happens only if the current inline value still equals `m` (value and priority). Then put back `o`/`p` (remove the property if it had none).
- **I5** If the page changed a property the engine had written (current is not `m`), the page wins: the ledger entry is re-based (`o,p` := current) before any re-theme, and restore later yields the page's latest value. A page change must survive a refresh.
- **I6** If the element had no `style` attribute originally and its style is empty after restore, remove the attribute. If it had one, keep it (even if now empty only when it was originally present).
- **I7** The engine's own writes never trigger its own observer (`quiet()`), and restore leaves no timers, rAF callbacks, observers, listeners, adopted sheets, root markers, or transition overrides behind.
- **I8** Never recolor media (`img, video, canvas, picture, audio, embed, object`), non-rendered tags, or the extension's own UI hosts.
- **I9** `applier-auto.js` must not duplicate the engine; it delegates to the applier.
- **I10** Contrast floors from `makeTransform` (>= 4.5, or >= 7 for high-contrast) remain covered by tests.
- **I11** Byte-exact text restore happens only in final restore(), only when semantically identical; never in the refresh path.

Known limitations (out of scope, document only): no stylesheet or `:hover` rule rewriting, no `url()` backgrounds, no pseudo-elements, no closed shadow roots, no adopted sheets inside shadow roots.

## 5. Acceptance criteria

**T1** `tsc --noEmit` has 0 errors. `PropRecord` is declared.
**T2 / F2** I2–I7 are covered by unit tests, including: page style change survives a refresh; `restore()` returns the exact original styles and priorities; elements with no style attribute end with none; a prop the page changed is not overwritten. A fresh-instance restore (D4) removes the engine sheet, root markers, and the engine's inline props, and restores page-owned inline values it recorded.
**T3** `npx vitest run` is fully green, including the three side-effecting tests. Structural-theming tests (compile, layouts, compat, golden css) are deleted or adapted. Structural code with zero importers is removed, each deletion evidenced.
**T4** `aiRepair`, `src/ai/repair.ts`, repair-consent plumbing and the `repairPayload/applyRepair` stubs are removed; DECISIONS holds the one-line justification.
**T5 / D9** Test proves `runAuto` applies through the engine; `validate-dist` asserts the marker string in `dist/applier.js` and that `applier-auto.js` does not embed the engine; `applier-auto` fails safe when the applier is missing.
**T6 / F3** `canUse()` is gone or always true; all 6 themes are available everywhere (including the AI prompt's theme list). `PlusDialog`, `PlanAccount`, `planFlag`, `src/backend/`, `backend/`, Plus badges/locks/strings, entitlement/auth/plan storage keys (cleaned on migration), Supabase allowances in `validate-dist`, `tsconfig` include, premium scripts and env examples are removed. README/CHANGELOG/manifest/docs updated; premium docs moved to `docs/archive/premium/`. My assets works without gating.
**F1** See D5. Clicking any of the 6 themes (or Auto) applies it immediately with no extra button. Re-picking a theme re-themes without stacking. Ineligible pages keep the existing disabled message. Permission denial falls back to this tab only, with a clear message, no per-site memory.
**F4** `grep -ri skinly` finds only allow-listed legacy items (the `skinly1:` import compat, history in CHANGELOG, archived docs). Manifest name/title, package name, bundle names, DOM markers, globals, message type, strings, docs and README say Repaint. Binary icons are flagged for the owner if they contain text.
**T7** `npm run check` has zero errors; `npm run build` succeeds; `validate-dist` and `contrast` pass.
**T8** Final report of at most 12 lines plus the manual checklist in `docs/MANUAL_CHECKLIST.md`: Google, GitHub, Wikipedia, YouTube, a natively dark site, a shadow-DOM site, hover states, all 6 themes, Restore, per-site memory, pets and blur.

## 6. Test strategy

1. **Unit (Vitest + jsdom, every substage).** Engine ledger, restore, transform and contrast, applier and auto path, popup logic. Fast, deterministic.
2. **Real-browser engine harness (Stage 7, optional per D11).** `tools/browser-harness/`: a Node script with a raw CDP client (no dependencies) that launches the installed Chrome headless, opens local fixture pages from `tests/browser/fixtures/` (plain, inline-styled, natively dark, shadow DOM, hover rules, iframe, adopted sheets), injects `dist/applier.js` through CDP (recent branded Chrome restricts `--load-extension`, so the extension itself is not loaded), applies each of the 6 themes, forces `:hover` via CDP, and asserts contrast and exact restore by comparing serialised DOM and computed styles. Run with `npm run test:browser`; never part of `npm run check`. jsdom cannot do layout, real `:hover`, or full adopted-sheet behaviour, which is why this layer exists.
3. **Manual real-site checks (owner, before every commit that changes behaviour, and fully at the end).** Real sites change and block automation, so the checklist is human-run.

## 7. Definition of done

All substages in `STAGES.md` are `DONE` (or `SKIPPED` where allowed), T1–T8, F1–F4 satisfied, owner manual checklist passed, owner has committed and tagged.
