# PHASE 0: scaffold, rule scanner, build checks, scrub tool

Goal: one command builds the extension, and automated checks enforce the hard rules from day one.
Depends on: CLAUDE.md, docs/SPEC.md; Node LTS installed (human). Tags: [auto] Claude Code must make it pass. [human] you check.

## Scope (in this order, commit after each step)
1. package.json, strict tsconfig, Vite (entries: background, popup, options, content applier), Preact preset, ESLint (typescript-eslint), Vitest + jsdom, @types/chrome. `.gitignore` already exists; do not weaken it.
2. Terse output: vitest dot reporter, eslint quiet, `tsc --pretty false`, quiet build. A green `npm run check` prints under about 40 lines. check = typecheck + lint + test + build + validate-dist + contrast (the contrast script is a stub that passes until Phase 2).
3. manifest.json (MV3): `permissions` exactly `["activeTab","scripting","storage"]`; `optional_host_permissions` exactly `["https://*/*","http://*/*"]`; background service worker (module); action popup; options page. No host_permissions, no content_scripts, no icons yet.
4. src/extension/api.ts: a typed wrapper, the only file that touches `chrome.*` (storage get/set, scripting.executeScript, active-tab query, permissions request/contains, runtime messages).
5. Background: answers a "ping" message with "pong". Popup (Preact): title, line "Skinly AI is not affiliated with any website.", and a "Hello" button that injects src/extension/applier.ts into the active tab (only after the click) which only sets `document.documentElement.dataset.skinly = "hello"`.
6. scripts/rules.ts `scanSource(path, text)` returns violations. Forbidden in src/: eval(, new Function, string-argument setTimeout/setInterval, innerHTML, outerHTML assignment, insertAdjacentHTML, document.write, localStorage, sessionStorage, XMLHttpRequest, sendBeacon, WebSocket, EventSource, `.click(`, `.submit(`, requestSubmit, navigator.credentials, `<all_urls>`, javascript:, chrome.cookies/history/webRequest/downloads/tabs.executeScript; `chrome.` or `browser.` outside src/extension/api.ts; `fetch(` outside src/providers/; http(s) URL literals not on the allowlist in src/config.ts. Key-like strings (`AIza[0-9A-Za-z_-]{20,}`, `gsk_[A-Za-z0-9]{20,}`, `xai-[A-Za-z0-9]{20,}`, `sk-[A-Za-z0-9]{20,}`) are forbidden in every tracked text file under src/, scripts/, tests/, docs/.
7. scripts/validate-dist.ts: checks the built manifest against SPEC 9 (exact permission sets, no host_permissions, no content_scripts, no `<all_urls>`), scans built JS for eval, new Function, remote URLs (except XML namespace URLs and allowlisted provider hosts) and key patterns.
8. scripts/scrub-fixture.ts (`npm run scrub -- <raw.html> <out.html>`): removes script elements, `on*` attributes, comments; replaces every text node, `alt`, `title`, `aria-label` and `<title>` text with same-length filler (keeps whitespace-only nodes); replaces href values with `#` and removes src/srcset/poster values; blanks all input/textarea values and `value` attributes; removes emails, phone numbers, token-like strings of 32+ characters, `data:` URIs; reads optional terms from `.scrub-terms.local.json` (`{"terms":[...]}`, gitignored). Keeps tags, classes, ids, roles, structure. Prints only counts per rule, never matched text.
9. tests/fixtures-clean.test.ts: passes when fixtures/ is empty; otherwise fails if any fixture still has a script body, `on*` attribute, email, phone, token-like string, data: URI, input value, or any term from the local terms file.

## Files
package.json, tsconfig.json, vite.config.ts, eslint.config.js, manifest.json, scripts/{rules,validate-dist,scrub-fixture,contrast}.ts, src/config.ts, src/extension/{api,background,applier}.ts, src/extension/popup/*, src/extension/options/* (placeholder), tests/{rules,manifest,build,scrub,fixtures-clean}.test.ts.
npm scripts: build, typecheck, lint, test, scrub, check.

## Acceptance
1. [auto] From a clean clone, `npm ci && npm run check` passes.
2. [auto] Built manifest: MV3; permissions and optional_host_permissions exactly as above; no host_permissions or content_scripts.
3. [auto] The scanner flags each forbidden pattern in planted-string tests and passes on the real src/. The allowlists (fetch in src/providers/, chrome.* in api.ts, URLs in config.ts) are tested.
4. [auto] Scrub tests: a synthetic page with a fake email, phone, token, script body, input value, onclick and text comes out clean, and the report shows counts only.
5. [human] Load `dist/` as an unpacked extension in Edge or Chrome. Open any https page, click the toolbar button, click Hello. In DevTools Console, `document.documentElement.dataset.skinly` is `"hello"` on that tab only. Other tabs are unchanged. The Network tab shows no requests from the extension.
6. [human] On `edge://extensions` (or `chrome://extensions`), open the extension details: it requests no site access by default.

## Stop
Stop when items 1 to 4 pass and everything is committed. Print items 5 and 6. Do not start Phase 1.
