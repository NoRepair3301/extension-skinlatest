# Skinly AI (working name): product spec, source of truth

Chromium MV3 extension. The user opens any website and clicks "Change my page". A local analyser builds a small structural summary. The AI provider the user chose returns a JSON style plan. We validate it, compile CSS ourselves and apply it. The result can be remembered per site. Free plan only for now (6 themes plus Auto, everything unlocked).
If this file and a phase doc disagree, this file wins. Items marked UNSURE must not be guessed: stop and ask.

## 1. Non-goals (this version)
No cloud sync, hosted AI, Pro tier, Firefox build, shared API key, telemetry, remote config, e2e or browser-automation tests, rebuilding page DOM, form handling, login handling, screenshots sent anywhere.

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
  page:{ tone:"light"|"dark",           // luminance of the page background
         bgImages:0..999,              // scanned elements with a CSS background-image (count only)
         largeMedia:0..99,             // img/video/canvas/picture covering a large part of the viewport (count only)
         hasHeroMedia:boolean },       // a big media or background-image element
  regions:[ up to 40 of
    { id:"r1",                              // r + number, document order
      role:"header"|"nav"|"main"|"aside"|"footer"|"section"|"card-list"|"link-list"|"table"|"form"|"button-group"|"heading"|"other",
      tag:"div", classes:[ up to 3 tokens ], // each /^[a-z][a-z0-9_-]{1,30}$/, no digits-only, lowercase
      childCount, linkCount, depth,
      rect:{x,y,w,h},                       // rounded to multiples of 10
      style:{color,bg,fontSize,fontWeight,radius} } ] }
```
Never included: image addresses, text, hrefs, ids, alt, title, aria-label, data-* values, form values, URLs, origin, page title, images. Total JSON at most 20 KB (drop lowest-priority regions until it fits).
### 4.2 StylePlan v1 (what the AI returns; unknown keys are rejected)
```
{ v:1,
  themeId:"calm-light"|"midnight"|"ocean"|"warm-paper"|"high-contrast"|"field"|"custom",
  tokens:{ bg,surface,text,muted,link,accent,border,focus: "#rrggbb",
           radius:0..16 (int), font:"system"|"serif"|"mono"|"humanist"|"rounded"|"geometric",
           baseSize:14..20 (int), lineHeight:1.3..1.9 (one decimal) },
  regionRules:[ up to 40 of { region:"rN", layout:"none"|"link-grid"|"nav-wrap"|"center-column"|"card-grid"|"stack"|"table-clean",
                              surface:"none"|"flat"|"card", spacing:0..4 (int) } ],
  reasons:[ up to 5 of "repeated-links"|"clear-nav"|"dense-text"|"low-contrast-source"|"dark-source"|"form-heavy"|"unsure" ],
  sceneId?:"none"|"paper"|"space"|"ocean"|"midnight-stars"|"calm"|"field",  /* optional, default "none"; PROMPT_VERSION 3 */
  strategy?:"full"|"safe"|"text-only",   /* optional, default "safe"; PROMPT_VERSION 4 */
  protectBackgrounds?:boolean }           /* optional, default true */
```
Strategy ladder (the compiler and the visual guard, docs/ARCHITECTURE.md): full = element surfaces too (buttons, fields, tables, legacy colour attributes, region surfaces and layouts); safe = page background on html, text, link and heading colours, accent only on focus and borders; text-only = text colours fitted to the page's own tone, no backgrounds. protectBackgrounds=true never paints wrapper boxes. The compiler never emits the `background` shorthand, `background-image`, a body background, or anything for media; every background colour is paired with a text colour; site classes win wherever they set their own colours (`:where` selectors, no `!important`, except the page root and legacy colour attributes). After applying, the guard checks text contrast (3), typing fields (4.5, caret visible) and media state, steps down one strategy and re-checks once, then rolls back.
Font stacks are fixed in code (system-ui, Georgia/serif, ui-monospace, etc.); the AI never names fonts. Layouts are fixed CSS templates over the existing children and never change DOM order. Eligibility (validator and compiler both check it; PROMPT_VERSION 2 tells the model):
| layout | roles | other |
|---|---|---|
| link-grid | link-list, nav, card-list | linkCount at least 4 |
| nav-wrap | link-list, nav, card-list | linkCount at least 4 |
| card-grid | link-list, card-list, section, aside | childCount at least 3 (CSS grid over the repeated children) |
| stack | nav, link-list, card-list, section, aside, main | childCount at least 2 (flex column with a gap) |
| center-column | main, section | max-width and auto margins |
| table-clean | table | border-collapse, padded bordered cells |
Every layout needs an empty `risk` list, except table-clean which also accepts `["big-table"]`. The prompt tells the model to choose per region and not to give every region the same layout.
### 4.3 CSS allowlist (compiler output is tested against it)
Tier A: color, background-color, border-color, border-width, border-style, border-radius, box-shadow, font-family, font-size, font-weight, line-height, text-decoration-color, outline-color, outline-width, outline-style, outline-offset, accent-color, caret-color, color-scheme, scrollbar-color.
Tier B (layout templates, eligible regions only): display (grid or flex only), grid-template-columns, flex-wrap, flex-direction, gap, list-style, padding, margin, max-width.
Tier C (element templates, every page): border-collapse, and background-image with the value `none` only (legacy `[background]` attributes).
Never: position (except the P8 sticky table header template), float, z-index, visibility, opacity, transform, width, height (max-width is allowed in the center-column layout only), content, url(), @import, filter (except the P8 blur template), pointer-events, cursor, overflow, display:none (except the P8 table filter template). Images, video, canvas, svg and iframes are never recoloured.
All selectors start with `html[data-skinly="on"]:not(#skinly-force)` (the `:not(#id)` never matches; it only raises specificity so site rules cannot win, even with !important) and use `[data-skinly-r="rN"]` for regions. No class or id selectors otherwise.
**Element templates (4.3.1, tag-based, all scoped under that root, all `!important`):** base typography (font, size, line-height on body, p, li, td, th, dd, dt, label, blockquote; headings 1.25); links (link, visited, hover/focus); headings; buttons and `input[type=button|submit|reset]` (accent surface, derived `onAccent` label, radius, hover, disabled, focus ring); text inputs, selects, textareas (surface, border, text, placeholder, focus border); tables (header row, zebra rows with a derived `surfaceAlt`, borders); cards and panels (article, aside, details, fieldset, figure); lists (marker); hr; code (kbd, pre, samp); selection; scrollbar (`scrollbar-color`). Media (images, video, canvas, svg, iframes) is never listed.
**Derived colours (src/plan/derive.ts):** `onAccent`, `accentHover`, `surfaceAlt`, `headerBg`, `linkHover`, `linkVisited`, `disabledFg` come from the plan tokens inside the compiler. Every foreground/background pair the templates emit must reach AA 4.5 (tested for all themes and for awkward custom tokens). Each derived colour is nudged in lightness until its pairs pass; if one cannot pass it falls back on its own (surfaceAlt to surface, accentHover to accent, text colours to black or white). The theme is never dropped for one failing pair.
**Hard force, CSS only (4.3.2):** legacy markup is overridden by attribute selectors, never edited or moved: `[bgcolor]` and `[style*="background"]` on non-media boxes (background-color), `[background]` on table parts (background-image none), `font[color]`, `table[border]`, `table[cellpadding]` (not 0). No node is moved, reordered, hidden or rebuilt. Invariants and rollback apply as before.

## 5. Applying and restoring
- Applier is a content script injected on demand (`scripting.executeScript`), or registered per origin after opt-in.
- It re-runs the analyser, checks that every region id in the plan exists, tags region elements with `data-skinly-r`, sets `data-skinly="on"` on `<html>`, and adds one constructable stylesheet to `document.adoptedStyleSheets`.
- Rollback ledger records exactly what was added. Restore removes it all, disconnects observers, and removes the pet and blur markers.
- Invariants checked after apply (and after bounded re-checks): the same count and order of `a[href]`, `button`, `input`, `select`, `textarea`, `[tabindex]`; same href list; same form attributes (ignoring data-skinly-*). Any failure rolls back.
- Frames (rc4): the applier is injected with `allFrames` and every same-origin frame runs its own applier: its own ledger, bounded observer and rollback, so a rollback in one frame never affects another. A frame applies the top page's plan **tokens only** (a frame's regions are not the top page's regions). Cross-origin frames are skipped (the script checks that it can read the top document, src/extension/frames.ts) and are never touched. Pet and blur/table tools live in the top frame only. If `allFrames` is refused by the browser, the top frame alone is used. Frames added after the click are not themed until the next click.
- Observer: childList only, debounce 300 ms, at most 5 re-checks per minute, disconnected on Restore.
- Fingerprint = FNV-1a hash plus a role sequence string of the first 40 regions. Two fingerprints are "similar" when the sequence similarity is at least 0.8.

## 6. Gate
- Blocked entirely: non-http(s) schemes, browser-internal pages, extension pages, web stores, PDF viewer, the user blocklist, and built-in blocklist entries in src/config.ts (empty since rc4; legacy portals such as erp.iitkgp.ac.in are supported, the user's own blocklist in Settings still applies).
- No AI call (built-in theme only): password, one-time-code/OTP (autocomplete one-time-code, or an input named otp, totp, mfa, 2fa, passcode, one-time, verification/security code; reported as the `password` marker), payment (autocomplete cc-*), or file inputs on the page. On those pages only built-in themes apply (colours and fonts, no layouts).
- Layouts disabled (colours only): any risk marker.
- Page cap: analyser aborts after 15,000 visited nodes and reports "too-large" (built-in theme only).

## 7. Providers
```
interface Provider { id; defaultModel; generate(req:{system,user,model,signal}): Promise<Result> }
Result = {ok:true, json:unknown, usage?} | {ok:false, error:{kind, retryAfterMs?}}
kind = auth | rate | quota | network | timeout | blocked | bad-output | server | aborted
```
- Default order: Groq, then Gemini (Groq was faster and produced valid plans in the 2026-10-30 bake-off). Mock provider for tests. Grok (xAI) is a later optional adapter (no free tier found).
- Timeouts (rc4, src/config.ts `PROVIDER_TIMEOUTS`): Groq 15 s per call and 20 s overall for that provider (calls, retry and repair together); Gemini 25 s per call and 30 s overall. When a provider's overall time is spent the next provider is tried. The whole pipeline budget is the sum (50 s). History: 15 s / 20 s, then 40 s / 60 s in rc2. Real Gemini calls spend seconds on thinking tokens (docs/providers/gemini.md) and 4 of 4 bake-off calls still timed out at 40 s, so 25 s / 30 s may be too short for Gemini; Groq is first by default, so Gemini is the fallback.
- Contrast repair (rc4): a plan whose colours miss the SPEC 10 targets is first repaired in the pipeline by nudging text, muted, link, accent and focus in lightness (bg, surface, border never change; src/plan/repair.ts). Only when that cannot reach the targets does the repair request and then the nearest built-in theme follow. The popup says "Some of the AI's colours were adjusted so the text stays readable". One retry only for 429/5xx when retry-after is 5 s or less.
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
`permissions: ["activeTab","scripting","storage"]`; `optional_host_permissions: ["https://*/*","http://*/*"]` (requested one origin at a time, from a user click: the visited origin for "Always on this site", or the provider host when saving a key). No static host_permissions, no content_scripts in the manifest, no `tabs`, cookies, history, webRequest, downloads. Keyboard commands: transform-page (Alt+Shift+S), restore-page (Alt+Shift+R), open-palette (Alt+Shift+K), toggle-blur-page (Alt+Shift+B, rc4). The browser drops a suggested key that something else already uses, so the popup lists each command with the key the commands API really reports (through api.ts), or "Not set - open edge://extensions/shortcuts" (chrome:// or brave:// on those browsers; shown as text, opening it would need the tabs permission). Every command that reaches a page ends with a 2 s extension-owned toast ("Skinly: theme applied", "Skinly: restored", "Skinly: blur on", "Skinly: blur off", "Skinly: palette open", "Skinly: couldn't change this page"). Blocked pages (internal, store, PDF, blocklist) are never injected into, so the "blocked page" case uses the toolbar badge "!" and the action title instead of a toast. If the browser passes no URL with a command, the gate asks the page for its address (activeTab covers it) instead of treating the page as blocked.

## 10. Themes (free plan: all six, plus Auto)
calm-light (default), midnight, ocean, warm-paper, high-contrast, field (olive, khaki, dark green). "Auto" is a popup choice, not a theme: it applies calm-light, or midnight when the browser prefers a dark colour scheme (resolved on the page). Each theme has a default scene (calm-light: calm, midnight: midnight-stars, ocean: ocean, warm-paper: paper, field: field, high-contrast: none; `DEFAULT_SCENE_BY_THEME` in src/themes/index.ts). Each is a JSON token set (same keys as StylePlan tokens). Contrast targets (tested by script): text/bg at least 4.5 (high-contrast at least 7), link/bg at least 4.5, muted/bg at least 4.5, accent/bg at least 3, focus/bg at least 3. Colour is never the only status cue.

## 11. UX copy (short, plain)
- Consent (first AI use, versioned): "Skinly AI will send a small description of this page's layout (shapes, sizes and colours, no text, links, images or forms) to <provider>. Their terms apply and they may keep it. Nothing else leaves your browser." Buttons: Send, Cancel, Show what will be sent.
- Errors: no key ("Add a key in Settings to use AI. Built-in themes still work."), rate ("<provider> is busy; trying <next>"), all failed ("AI unavailable; kept the built-in theme"), blocked ("Skinly can't change this kind of page"), no-ai ("This page has a sign-in or payment form, so only the built-in theme is used").
- Footer in popup: "Skinly AI is not affiliated with any website."

## 12. Entitlements
src/core/entitlements.ts is the only place with tier logic and the Free/Plus lists (v0.3.0, docs/PLUS_SPEC.md). `canUse(feature)` answers from a derived plan flag (`free` or `plus`) that src/backend/ computes from a verified, signed entitlement. Free: calm-light, midnight, high-contrast, Auto, five pets, the scenes of those themes, readability repair, own AI key, per-site memory. Plus: ocean, warm-paper, field with their scenes, and custom assets. Not entitled: a Plus theme is clamped to the nearest free one (popup, AI validator, auto script); local assets are hidden, never deleted.

## 13. Features after the core
Pet (P6), palette and shortcuts (P7), blur, safe screenshot and table tools (P8). All live in src/features and take selectors and models as parameters (no site-specific code). Exceptions to "never reorder or hide original nodes": user-clicked table sort and filter in P8, with a Restore order control.

## 14. Decisions taken (defaults; change them in this file first)
1. Chromium first (Chrome, Edge, Brave); Firefox later. 2. Bring-your-own key; no backend; never ship a key. 3. AI returns a plan, never CSS or selectors; we compile. 4. Regions are tagged by us, so plans survive hashed class names. 5. Click to transform; per-site auto is opt-in. 6. Palette selects and focuses; it never clicks for the user. 7. No palette pins or recents are stored. 8. Fixtures come from public pages with no login; text is replaced by same-length filler. 9. Unit tests plus rule scanner plus validate-dist plus contrast script; manual human checks instead of e2e.

## 15. rc4 notes (pet, failure messages)
- Pet (rc4): independent of any theme. The popup's "Show pet on this page" button injects the applier only after the click, only when `pet.enabled`, and only on allowed pages; if it cannot show it says why in one line (`PET_WHY`, src/extension/petActions.ts). The pet also shows after "Change my page" (even when the theme was rolled back) and after any popup tool or the blur command on that page. Changing a pet setting only updates or removes a pet that is already showing (`updatePet`); it never injects or brings a hidden pet back. Off by default; removed by Restore; never on blocked pages.
- Theme failure message (rc4): when an apply rolls back, the popup and the command tooltip say why in plain words, built from the reason code only (`invariants`, `invalid-plan` with the fixed details `contrast` or `region missing on page`, `too-large`, `bad-theme`, `error`, or no answer from the page script), never from page content, plan values or invariant details (src/ai/messages.ts `applyFailureReason`).

## 16. Phase 10 (scenes, pets, custom assets)
- Scenes (src/features/scenes) are decorative SVG art drawn only in measured empty side space ("gutters", src/features/freespace). A gutter is usable at 120 px or more. If the page has no usable gutter no art is shown and the popup says so in one line (FREESPACE_WHY). Art lives in one extension-owned shadow-root host (position fixed, pointer-events none) with one clipped lane per usable gutter; it never touches a site element. At most 40 animated nodes in total; motion is CSS keyframes on transform and opacity only; paused while the tab is hidden; still under prefers-reduced-motion.
- The AI can only choose a built-in `sceneId` (StylePlan, optional, default "none"). With "none" the theme's default scene applies; high-contrast never shows a scene. User settings: `scene: {enabled, choice: "theme"|sceneId, density: low|normal|high, lane: both|left|right}`.
- The "field" scene may include one flat, stylised rifle silhouette that never moves, fires or targets anything. `ARMY_WEAPON_PROPS` in src/config.ts removes it (store review can be sensitive about weapons).

## 17. rc5 decisions (owner)
- 4.4 RepairPayload / RepairPlan. After apply the page is read (300 text parents, 30 media). Each text element whose pair is under 4.5 gets a colour-only rule (the nearest theme text colour that reads, else black or white); text over a background image or gradient gets its recorded original colour and background-color back. Rules are structural selectors (tag and nth-child path from html, no ids, text or attribute values), grouped by colour pair, at most 30 KB, applied after the theme sheet, re-checked by the bounded observer (10 passes per page load, then at most once per 5 s). A theme is never refused or rolled back for readability. Only a failing apply or a failing structural invariant rolls back.
- When the repairs touched more than 25 percent of the samples, a key exists and the second consent is given, the AI may receive: { v:1, elements:[ up to 40 of { i, tag, role, classes:[ up to 3 /^[a-z][a-z0-9_-]{1,29}$/i ], fg, bg, ratio, css:[ up to 8 colour declarations ] } ] }, at most 6 KB. Declarations come from same-origin stylesheets (color, background-color, background without url(, border-color, fill, colour custom properties); anything with url(, attr(, content, @import, data:, quotes is dropped; selectors are never sent. It answers { v:1, fixes:[ { i, color:"#rrggbb", bg?:"#rrggbb" } ] }. The validator checks indices and hex and nudges a colour under 4.5. One attempt, same timeouts; on any failure the deterministic result stays.
- Second consent (REPAIR_CONSENT_VERSION, per origin in settings.repairConsent, revocable in Settings, Privacy): "For the parts of this page that look hard to read, Skinly AI will send <provider> their tag names, up to three class names each, their colours and the colour rules of the page's stylesheets. Never text, links, ids, form values or addresses. Their terms apply and they may keep it." Buttons: Send, Cancel, Show what will be sent (the exact JSON).
- Scenes (rc5): no scene choice, density, lane choice, theme code copy or import. The scene follows the theme: calm-light calm, midnight space, ocean ocean, warm-paper paper, field field, high-contrast none; Auto shows calm in light and midnight-stars in dark. One "Show art" switch remains. With no usable gutter, one or two small actors (strip at most 120 by 160 px, the corner with the least content under it) may be shown; pointer-events none. The AI no longer picks a scene (PROMPT_VERSION 5; a sceneId in an old plan is accepted and ignored).
- Re-applying a theme (or the auto script's second apply) keeps the pet, scene and blur; only a real Restore runs their removal hooks.
- Persistence (rc5): "Change my page" asks for the visited origin's optional host permission first, inside the click and before any other await (one browser prompt, none if already granted), then applies; once the theme is on it saves the plan and the repair rules (colour-only structural CSS, at most 10 KB, parsed strictly on every read) with the site and registers the auto script. Denied: the theme applies for this document only and the popup says so in one line; a "Keep on this site" button asks again. The auto script applies the stored plan and repair rules at document_start with no provider call and re-applies after in-page navigation.
- Restore (rc5): always works. With a ledger it undoes exactly what it recorded; without one (fresh script instance, navigated page) it removes everything carrying our markers (our adopted sheets, `data-skinly-ui` and `data-skinly-scene` hosts, `data-skinly*` attributes) and nothing else. Restore also pauses automatic theming for the site (record kept, script unregistered) until the user applies again. Forget removes record, registration and permission.

## 18. Skinly Plus (v0.3.0, owner decisions)
docs/PLUS_SPEC.md is the source of truth for plans, flows and the data the backend holds; docs/SECURITY_BACKEND.md is the threat model. In short: accounts optional (email OTP), price from the server `plans` table, billing through an adapter with only a test provider (refused unless BILLING_MODE=test), no cloud sync, hosted AI or telemetry, the backend never receives page data, URLs, origins, site lists or keys. Storage adds `auth` (session) and `entitlement` (signed token cache, 7-day offline grace). fetch() is allowed in src/providers/ and src/backend/ only. Missing build config means "Plus not available in this build" and Free works as before.
