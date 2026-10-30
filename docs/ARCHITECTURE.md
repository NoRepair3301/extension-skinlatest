# Architecture (one page)

Chromium MV3 extension. TypeScript, Vite, Preact for our own UI only. Permissions: activeTab, scripting, storage; host access is optional and asked per origin from a click. Source of truth for contracts: docs/SPEC.md.

## Module map
| Path | Job |
| --- | --- |
| `src/extension/api.ts` | The only file that calls `chrome.*`. Everything else imports from it. |
| `src/extension/background.ts` | Service worker: keyboard commands, badge, first-install welcome. No page data. |
| `src/extension/popup`, `options`, `src/ui` | Our UI (Preact). `src/ui` holds tokens, components, error boundary. Strings are in `src/ui/strings.ts`. |
| `src/extension/flow.ts`, `src/ai/pipeline.ts` | The click flow: gate, analyse, consent, ask, validate, repair, apply. |
| `src/analyzer` | Reads the DOM, writes nothing, returns a StructuralSummary (SPEC 4.1). Also the gate (blocklist, password/payment/file inputs). |
| `src/providers` | The only place with `fetch`, only to hosts in `src/config.ts`. One adapter per provider. |
| `src/plan` | StylePlan schema, validator, contrast checks and repair, CSS compiler (fixed templates). |
| `src/themes` | Six built-in themes and Auto. |
| `src/extension/applier*.ts`, `observer.ts` | Page scripts: apply tokens and our stylesheet, rollback ledger, invariants, fingerprint. `applier-auto` is registered per site after opt-in. |
| `src/features/*` | Scenes (`scenes`, `freespace`), pet, assets, palette, blur, table tools. They take selectors and models as parameters and never name a site. `scene.js` is a separate bundle. |
| `src/extension/sites.ts`, `settings.ts`, `keys.ts` | Storage: sites by origin, settings, keys under `keys`, assets under `assets`. |
| `src/core/diag.ts`, `diagReport.ts`, `src/extension/diagStore.ts` | Diagnostics: caught errors as short kinds (per script), the page snapshot (fixed words and numbers) and the `diag` storage key. All storage keys are listed in `scripts/rules.ts` (`STORAGE_KEYS`). |

## Data flow
```
user click -> popup -> flow -> analyzer (page, read only) -> StructuralSummary
   -> consent text + "Show what will be sent" -> provider adapter (fetch) -> reply
   -> validator -> StylePlan (or repair, or built-in theme) -> compiler (fixed templates)
   -> applier in the page (ledger, invariants) -> Restore removes it all
```

## Where the AI can and cannot reach
- **Can see**: the StructuralSummary only: shapes, sizes, colours, font family names, counts, region ids we assigned. At most 20 KB, only after consent and a click, only to the provider the user chose.
- **Cannot see**: page text, links, ids, values, URLs, titles, screenshots, the user's assets, their keys of other providers, their saved sites.
- **Can choose**: theme id, colour tokens, a few layout enums, a built-in `sceneId`. Everything is validated; unknown values are dropped.
- **Cannot do**: write CSS, selectors or code, touch the DOM, call anything. No AI output reaches the page except as a validated StylePlan compiled by us.
- User-supplied things (assets, settings) are validated on every read and never join a provider payload.

## Strategy ladder and readability pipeline
- `StylePlan.strategy` (full, safe, text-only) and `protectBackgrounds` decide how much of a page a theme may paint (SPEC 4.2). The compiler (src/plan/compile.ts) makes the theme CSS. Only the page root and the legacy colour attributes are forced; everything else is `:where` with no `!important`. A tokens-only apply (document_start, frames) never exceeds safe.
- The theme is never refused or rolled back for readability. Order: snapshot the colours of the sampled elements (300 text parents, 30 editable fields, 30 media), apply, read the page again (src/plan/guard.ts readings, src/extension/guard-dom.ts real provider), then the repair pass (src/plan/readability.ts): a text pair under 4.5 gets the nearest theme text colour that reads (else black or white); text over an image or gradient gets its recorded original colours back. Rules are structural selectors (tag and nth-child path from html), grouped by colour pair, colour and background-color only, at most 30 KB, in their own sheet after the theme. The bounded observer looks again on re-render (10 passes, then once per 5 s). Media that changed steps the strategy down; it never refuses.
- Optional AI repair (src/ai/repair.ts, src/features/repair/payload.ts): only with a key, the second consent and more than 25 percent of samples repaired. One sanitiser builds the payload; the answer is a RepairPlan (index plus hex), validated and compiled to the same structural rules. Any failure keeps the deterministic result.
- The repair rules are stored with a remembered site (strict parser, 10 KB) and put in place by the auto script before first paint.
- Restore uses the ledger, or marker-based cleanup (src/extension/cleanup.ts) when there is none, and pauses the site's auto-apply.

## Art on the page (scene, pet, asset hosts)
- Every kept site registers applier.js, applier-auto.js and scene.js at document_start. scene.js reads the site and the Show art switch and draws the scene of the stored plan's theme (`siteRequest`, `sourceForPlan`: an AI plan follows its own page colour like Auto).
- Hosts (src/features/mount.ts): last child of html, position fixed, inset 0, pointer-events none, z-index 2147483646, contain strict, all set through CSSOM with !important; shadow-root styles only through adopted stylesheets (strict CSP blocks `<style>` and style attributes; the scanner forbids them). A bounded observer puts a removed host back at most once per second; our own hosts may follow each other. A transform, filter, perspective or contain on html moves the host to the body (recorded in the diagnostics).
- Timing (src/features/freespace/watch.ts): the corner strip shows at once; gutters are measured at DOM ready, on load, after 1 s and 3 s, on resize and after DOM changes (once per second), and the art moves into a gutter when one appears. Reduced motion stops movement only.
- Every mount and measure step records a short kind (src/core/diag.ts) instead of throwing into the page.

## Diagnostics
- Each page bundle keeps its own ring of caught errors; `skinlyApplier.diag()` joins applier.js and scene.js into one PageDiag (theme id, strategy, art state, host present, gutter widths, actor count, stylesheet and mount flags, re-attach count). The auto script stores it 4 s after apply; the popup's Why no art? stores it too. The popup records the provider result kind. All of it lives under `diag`, is parsed on every write and read, and never leaves the browser except when the user copies it.

## Safety nets
Invariants run after every apply; a failure rolls back everything. Restore removes every `data-skinly-*` attribute and our stylesheet. An error in our UI shows an error boundary with Restore this page. The scanner (`scripts/rules.ts`), `validate-dist`, the contrast script and the budgets in `docs/PERF.md` run inside `npm run check`.
