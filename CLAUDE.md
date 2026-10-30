# Skinly AI (working name): rules for Claude Code
Chromium MV3 extension: the user clicks "Change my page"; a local analyser builds a small structural summary; the AI provider the user chose returns a style plan (JSON); we validate it, compile the CSS ourselves and apply it. Free plan only. Source of truth: docs/SPEC.md.

## Session
- Read only this file, docs/SPEC.md and docs/PHASE_<n>.md (plus docs/providers/*.md when the phase says so).
- One phase per session. Stop when its acceptance items pass. Do not start the next phase.
- Reference files by path. Never print whole fixtures or HTML; use grep or targeted reads.
- Short answers: paths and diffs, not whole files, unless a new file is requested.
- No web research, no subagents, no plan mode, no refactors outside the phase.
- Ambiguous? Ask ONE short question; otherwise decide and note it in the commit message.
- If a provider API detail is not in docs/providers/, STOP and ask. Never guess endpoints, parameters or model ids.

## Stack (fixed)
TypeScript, Vite, Preact (UI only), Vitest + jsdom, ESLint + typescript-eslint, @types/chrome. Direct chrome.* calls only in src/extension/api.ts. No other dependency without asking.
Tests are unit tests, the rule scanner, validate-dist and the contrast script. NO e2e, no Playwright, no browser automation. Human checks are listed in each phase doc.

## Hard rules (never violate)
1. No automation: never log in, fill, submit, click or keep alive on the user's behalf. Never call .click() on site elements.
2. Data minimisation: the only page-derived data that may leave the browser is a StructuralSummary (SPEC 4.1) and, after its own separate consent (asked once per site, revocable), the RepairPayload (SPEC 4.4: tag, role, up to 3 class tokens, computed colours, contrast number and sanitised colour declarations of the parts that look unreadable), built by the one sanitiser in src/features/repair/payload.ts. Both go only to the provider the user chose, only after consent and a user click. Never text, hrefs, ids, values, URLs, origin, titles or screenshots.
3. AI output is untrusted. Only a validated StylePlan or ValidRepairPlan is used; CSS comes from our fixed templates and the structural repair rules (colour and background-color, hex values) of src/plan/readability.ts. Never apply AI-written CSS, selectors or code. No eval, new Function, innerHTML, remote code or remote config.
4. Never break the site: no deleting, cloning, reordering or hiding original nodes; no changes to forms, hrefs or handlers. Only data-skinly-* attributes and our stylesheet. Every change is in the rollback ledger and Restore removes all of it. Sole exceptions: user-clicked table sort and filter in P8.
5. Fail safe: an error in the apply itself, or a structural invariant that fails, leaves the page as it was (or at the built-in theme) with a short message. Readability is never a reason to refuse or roll back a theme: unreadable parts are repaired or keep the site's own colours. Never hide the page while waiting.
6. Keys live only in storage.local under "keys". Never log them, put them in URLs, the repo or dist. The developer key lives only in .env.local (gitignored), read only by scripts/.
7. Permissions: activeTab, scripting, storage, plus optional_host_permissions requested per origin from a user click. Never static host_permissions, <all_urls>, content_scripts in the manifest, tabs, cookies, history, webRequest, downloads or notifications.
8. Never run on browser-internal pages, web stores or PDF viewers. Honour the blocklist. No AI call on pages with password, payment or file inputs.
9. No telemetry, analytics or remote config. fetch() only in src/providers/, only to hosts allowlisted in src/config.ts.
10. Our UI never imitates the visited site or an official body and says it is not affiliated with any website. Assets: original procedural SVG/CSS only; system font stacks only.
11. Never store page text, titles, full URLs or query strings. Per-site data is keyed by origin only.

## Architecture
- All tier logic only in src/core/entitlements.ts (free plan: everything unlocked). No backend, accounts or payments.
- One module each for Restore/rollback, invariants and fingerprint. No duplicates.
- src/features/* take selectors and models as parameters and never mention specific site names.
- Plans reference regions by id (rN) that we tag; never by class name.

## Git
- Run `npm run check` before every commit; commit each green step as `phase<n>: <step>`. Never commit to main or force-push.
- Never commit .env*, private/, keys, dist/ or real personal data. Fixtures come only from public pages without login and are scrubbed.
