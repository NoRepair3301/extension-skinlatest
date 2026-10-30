# Skinly AI (working name): product spec, source of truth

Chromium MV3 extension. The user opens any website and clicks "Change my page". A local analyser builds a small structural summary. The AI provider the user chose returns a JSON style plan. We validate it, compile CSS ourselves and apply it. The result can be remembered per site. Free plan only for now (5 themes, everything unlocked).
If this file and a phase doc disagree, this file wins. Items marked UNSURE must not be guessed: stop and ask.

## 1. Non-goals (this version)
No backend, accounts, payments, Plus/Pro tiers, Firefox build, shared API key, telemetry, remote config, e2e or browser-automation tests, rebuilding page DOM, form handling, login handling, screenshots sent anywhere.

## 2. User flow
1. User clicks the toolbar button (or a keyboard command). Chrome grants `activeTab` for that tab only.
2. Gate: restricted page? risky page? user blocklist? (section 6).
3. Baseline: the built-in theme (last used, default calm-light) is applied within 1 s. The page is never hidden.
4. If a key is set and consent is given: send the StructuralSummary to the provider, get a StylePlan, validate, compile, apply as a preview.
5. User chooses Keep, Undo, or Try another. Keep saves the plan for this origin.
6. "Always on this site" (opt-in) requests host permission for that one origin and registers an auto-apply script.
7. Restore original removes everything we added.

## 3. Modules (src/)
analyzer (DOM to regions, summary, risk, fingerprint) | plan (schema, validator, contrast, compiler, invariants) | themes (5 JSON profiles) | providers (interface, adapters, registry) | ai (prompt, pipeline) | extension (api wrapper, background, popup, options, applier, sites, keys) | features (pet, palette, blur, tables: no site-specific code) | core (types, config, entitlements, log).

## 4. Data contracts
### 4.1 StructuralSummary v1 (the ONLY page-derived data that may leave the browser)
```
{ v:1,
  viewport:{w,h},
  palette:[ up to 8 "#rrggbb" ],          // from computed colours of regions
  fonts:[ up to 3 family names ],
  counts:{nodes,links,forms,tables,images,headings,iframes},
  risk:[ "password"|"payment"|"file"|"editable"|"big-table"|"iframes"|"shadow" ],
  regions:[ up to 40 of
    { id:"r1",                              // r + number, document order
      role:"header"|"nav"|"main"|"aside"|"footer"|"section"|"card-list"|"link-list"|"table"|"form"|"button-group"|"heading"|"other",
      tag:"div", classes:[ up to 3 tokens ], // each /^[a-z][a-z0-9_-]{1,30}$/, no digits-only, lowercase
      childCount, linkCount, depth,
      rect:{x,y,w,h},                       // rounded to multiples of 10
      style:{color,bg,fontSize,fontWeight,radius} } ] }
```
Never included: text, hrefs, ids, alt, title, aria-label, data-* values, form values, URLs, origin, page title, images. Total JSON at most 20 KB (drop lowest-priority regions until it fits).
### 4.2 StylePlan v1 (what the AI returns; unknown keys are rejected)
```
{ v:1,
  themeId:"calm-light"|"midnight"|"ocean"|"warm-paper"|"high-contrast"|"custom",
  tokens:{ bg,surface,text,muted,link,accent,border,focus: "#rrggbb",
           radius:0..16 (int), font:"system"|"serif"|"mono"|"humanist"|"rounded"|"geometric",
           baseSize:14..20 (int), lineHeight:1.3..1.9 (one decimal) },
  regionRules:[ up to 40 of { region:"rN", layout:"none"|"link-grid"|"nav-wrap",
                              surface:"none"|"flat"|"card", spacing:0..4 (int) } ],
  reasons:[ up to 5 of "repeated-links"|"clear-nav"|"dense-text"|"low-contrast-source"|"dark-source"|"form-heavy"|"unsure" ] }
```
Font stacks are fixed in code (system-ui, Georgia/serif, ui-monospace, etc.); the AI never names fonts. layout `link-grid` or `nav-wrap` is valid only for a region whose role is link-list, nav or card-list, linkCount at least 4, and the page has no risk marker.
### 4.3 CSS allowlist (compiler output is tested against it)
Tier A: color, background-color, border-color, border-width, border-style, border-radius, box-shadow, font-family, font-size, font-weight, line-height, text-decoration-color, outline-color, outline-width, outline-style, outline-offset, accent-color, caret-color, color-scheme, scrollbar-color.
Tier B (layout templates, eligible regions only): display (grid or flex only), grid-template-columns, flex-wrap, gap, list-style, padding, margin.
Never: position (except the P8 sticky table header template), float, z-index, visibility, opacity, transform, width, height, content, url(), @import, filter (except the P8 blur template), pointer-events, cursor, overflow, display:none (except the P8 table filter template). Images, video, canvas, svg and iframes are never recoloured.
All selectors start with `html[data-skinly="on"]` and use `[data-skinly-r="rN"]` for regions.

## 5. Applying and restoring
- Applier is a content script injected on demand (`scripting.executeScript`), or registered per origin after opt-in.
- It re-runs the analyser, checks that every region id in the plan exists, tags region elements with `data-skinly-r`, sets `data-skinly="on"` on `<html>`, and adds one constructable stylesheet to `document.adoptedStyleSheets`.
- Rollback ledger records exactly what was added. Restore removes it all, disconnects observers, and removes the pet and blur markers.
- Invariants checked after apply (and after bounded re-checks): the same count and order of `a[href]`, `button`, `input`, `select`, `textarea`, `[tabindex]`; same href list; same form attributes (ignoring data-skinly-*). Any failure rolls back.
- Observer: childList only, debounce 300 ms, at most 5 re-checks per minute, disconnected on Restore.
- Fingerprint = FNV-1a hash plus a role sequence string of the first 40 regions. Two fingerprints are "similar" when the sequence similarity is at least 0.8.

## 6. Gate
- Blocked entirely: non-http(s) schemes, browser-internal pages, extension pages, web stores, PDF viewer, the user blocklist, and built-in blocklist entries in src/config.ts (seed: erp.iitkgp.ac.in).
- No AI call (built-in theme only): password, payment (autocomplete cc-*), or file inputs on the page.
- Layouts disabled (colours only): any risk marker.
- Page cap: analyser aborts after 15,000 visited nodes and reports "too-large" (built-in theme only).

## 7. Providers
```
interface Provider { id; defaultModel; generate(req:{system,user,model,signal}): Promise<Result> }
Result = {ok:true, json:unknown, usage?} | {ok:false, error:{kind, retryAfterMs?}}
kind = auth | rate | quota | network | timeout | blocked | bad-output | server | aborted
```
- Default order: Groq, then Gemini (Groq was faster and produced valid plans in the 2026-10-30 bake-off). Mock provider for tests. Grok (xAI) is a later optional adapter (no free tier found).
- Timeout 40 s per call, overall pipeline budget 60 s (was 15 s and 20 s; real Gemini calls spend seconds on thinking tokens, see docs/providers/gemini.md). One retry only for 429/5xx when retry-after is 5 s or less.
- bad-output: one repair retry (send only reason codes), then fall back to the nearest built-in theme.
- Keys: user pastes their own key in Settings. Stored in storage.local under `keys`. Not encrypted by the browser; the UI says so. Never logged, never in a URL.
- UNSURE (must be pasted into docs/providers/*.md before Phase 3): the exact Gemini endpoint and request shape (the Gemini docs now show an "Interactions API"; older docs used generateContent), how to request JSON output, CORS behaviour from an extension service worker, model ids available on the free tier. Default model ids to try: gemini-3.8-flash, openai/gpt-oss-120b (Groq); both are configurable.
- UNSURE: whether free tiers use submitted content to improve provider products (assume yes). Groq retention terms unknown.
- Daily client-side guard: at most 20 AI calls per day and 3 s between calls (settings); the UI shows when it is reached.

## 8. Storage (storage.local only; no storage.sync)
- `settings`: {provider order, models, theme, consentVersion+acceptedAt, blocklist[], pet:{enabled,kind,size,corner,disabledOrigins[]}, aiCallsToday:{date,count}}
- `keys`: {gemini?, groq?}
- `sites[origin]`: {v, plan, fingerprint, provider, model, promptVersion, savedAt, mode:"ask"|"auto", blur:[selector up to 50], blurImages:boolean}. Keys are origins only (scheme+host+port). Cap 200 records, evict oldest. Validate on every read; ignore corrupt records.
- Never stored: page text, titles, full URLs, query strings, link labels, form values.

## 9. Permissions
`permissions: ["activeTab","scripting","storage"]`; `optional_host_permissions: ["https://*/*","http://*/*"]` (requested one origin at a time, from a user click: the visited origin for "Always on this site", or the provider host when saving a key). No static host_permissions, no content_scripts in the manifest, no `tabs`, cookies, history, webRequest, downloads. Keyboard commands: transform-page, restore-page, open-palette (user can rebind).

## 10. Themes (free plan: all five)
calm-light (default), midnight, ocean, warm-paper, high-contrast. Each is a JSON token set (same keys as StylePlan tokens). Contrast targets (tested by script): text/bg at least 4.5 (high-contrast at least 7), link/bg at least 4.5, muted/bg at least 4.5, accent/bg at least 3, focus/bg at least 3. Colour is never the only status cue.

## 11. UX copy (short, plain)
- Consent (first AI use, versioned): "Skinly AI will send a small description of this page's layout (shapes, sizes and colours, no text, links, images or forms) to <provider>. Their terms apply and they may keep it. Nothing else leaves your browser." Buttons: Send, Cancel, Show what will be sent.
- Errors: no key ("Add a key in Settings to use AI. Built-in themes still work."), rate ("<provider> is busy; trying <next>"), all failed ("AI unavailable; kept the built-in theme"), blocked ("Skinly can't change this kind of page"), no-ai ("This page has a sign-in or payment form, so only the built-in theme is used").
- Footer in popup: "Skinly AI is not affiliated with any website."

## 12. Entitlements
src/core/entitlements.ts is the only place with tier logic. Free plan: `canUse(feature)` returns true for everything. Plus and Pro are not built.

## 13. Features after the core
Pet (P6), palette and shortcuts (P7), blur, safe screenshot and table tools (P8). All live in src/features and take selectors and models as parameters (no site-specific code). Exceptions to "never reorder or hide original nodes": user-clicked table sort and filter in P8, with a Restore order control.

## 14. Decisions taken (defaults; change them in this file first)
1. Chromium first (Chrome, Edge, Brave); Firefox later. 2. Bring-your-own key; no backend; never ship a key. 3. AI returns a plan, never CSS or selectors; we compile. 4. Regions are tagged by us, so plans survive hashed class names. 5. Click to transform; per-site auto is opt-in. 6. Palette selects and focuses; it never clicks for the user. 7. No palette pins or recents are stored. 8. Fixtures come from public pages with no login; text is replaced by same-length filler. 9. Unit tests plus rule scanner plus validate-dist plus contrast script; manual human checks instead of e2e.
