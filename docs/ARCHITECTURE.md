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
- User-supplied things (assets, theme codes, settings) are validated on every read and never join a provider payload.

## Safety nets
Invariants run after every apply; a failure rolls back everything. Restore removes every `data-skinly-*` attribute and our stylesheet. An error in our UI shows an error boundary with Restore this page. The scanner (`scripts/rules.ts`), `validate-dist`, the contrast script and the budgets in `docs/PERF.md` run inside `npm run check`.
