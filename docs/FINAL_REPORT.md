# FINAL REPORT

Date: 2026-10-30. Subject: main at tag v0.1.0-rc1 (all phases 0 to 9 merged and tagged).
Method: a fresh `git clone` into a temp folder, `npm ci`, `npm run check`, `npm run release`, then every common check C1 to C14 from docs/AUDIT.md on that clone. Evidence below is command output from that run.

## Fresh clone result
- `npm ci && npm run check`: typecheck, lint, 37 test files, 611 tests all passed; build ok; `validate-dist: ok`; `contrast: ok (5 themes)`.
- `npm run release`: wrote `release\skinly-ai-0.1.0.zip`; the zip lists only manifest.json, five root scripts, assets/*, icons/*, options/index.html, popup/index.html, options.js, popup.js (no map files, docs, tests, src, private, fixtures).
- The first fresh clone FAILED (1 test file): `.gitignore` had `store/`, which also ignored `docs/store/`, so the privacy test could not read its files. Fixed on branch fix/final-audit (`/store/` anchored), merged to main, tag v0.1.0-rc1 and phase-9-done moved to the fixed merge, then a second fresh clone passed. A test already covers it (tests/release.test.ts reads docs/store/*.md and fails in any clone that lacks them).

## Common checks

| Check | Result | Evidence |
|---|---|---|
| C1 check suite, no skipped tests | PASS | Fresh clone: `Test Files 37 passed (37)`, `Tests 611 passed (611)`, validate-dist ok, contrast ok. `grep -rnE "\.skip\(|\.only\(|xit\(|xdescribe\(" src tests` printed nothing. |
| C2 no automation | PASS | No `.click(`, `dispatchEvent(`, `.submit(`, `requestSubmit(` and no `.value =` write in src/ (the scanner also forbids `.click(`, `.submit(`, `requestSubmit` in src/). `.focus` hits: src/features/palette/ui.ts:103 (focus the chosen link, focus-only), :125 (restore previous focus), :141 (our own input), src/features/pet/overlay.ts:94 (our own pet button). Palette test spies `HTMLElement.prototype.click` and asserts it is never called. Pick mode only toggles our data attribute and prevents the site's click. |
| C3 data minimisation | PASS | tests/ai/flow-safety.test.ts ("the payload contains no marker and is at most 20 KB") and tests/analyzer/fixtures.test.ts (marker `zqxleakmarker` in text, href, id, alt, title, aria-label, data-*, values) pass in the clone (80 tests). fixtures/web/login-page.expected.json holds only counts, risk, region id/role/childCount/linkCount. tests/release.test.ts ties the privacy claims to these tests. |
| C4 AI output untrusted | PASS | Only src/ai/pipeline.ts:66 calls `validatePlan(json, summary)`; `compileCss(plan: ValidPlan, ...)` (src/plan/compile.ts:55) accepts only the branded type; src/extension/applier-core.ts:106 compiles the validated plan. Type-level proof in tests/ai/flow-safety.test.ts. Stored plans are re-validated by the applier. |
| C5 never break the site | PASS | tests/applier.test.ts "rolls back when an invariant is violated" plus apply/restore identical outerHTML on all fixtures; 47 tests in applier and invariants pass. Table sort/filter (P8) move or hide only inside tables without controls, are reversible (tests/features/tables.test.ts: Restore order, full restore gives identical body HTML) and are undone by the applier's Restore. |
| C6 keys | PASS | Key-pattern scan of src, tests, fixtures, dist: zero hits. `git ls-files | grep -E "env|private"`: nothing tracked. `git log --all --name-only` shows no .env or private path ever added. Keys only via src/extension/keys.ts in storage.local (P3 tests: no key in logs, URLs or errors). |
| C7 permissions | PASS | Built dist/manifest.json: permissions `[activeTab, scripting, storage]`, optional_host_permissions `[https://*/*, http://*/*]`, `host_permissions: false`, `content_scripts: false`, commands: transform-page, restore-page, open-palette. validate-dist and tests/manifest.test.ts enforce it. |
| C8 gate | PASS | tests/analyzer/gate.test.ts and tests/ai/pipeline.test.ts (39 tests pass): blocked, no-ai and no-key never call the provider; consent required before any call. Keyboard commands never call a provider at all. |
| C9 network | PASS | `fetch(` appears only at src/providers/http.ts:19. No XMLHttpRequest, WebSocket, sendBeacon, eval, new Function or innerHTML in src/ (grep empty; scanner enforces). validate-dist rejects remote URLs other than the provider hosts. |
| C10 chrome.* only in api.ts | PASS | `grep -rnE "\b(chrome\|browser)\.[a-zA-Z]" src` outside src/extension/api.ts: no hits. |
| C11 personal data | PASS (mechanism verified; no terms file exists) | Email regex over fixtures, tests, docs, src and `git log -p --all`: only the test string `https://user:pw@example.org` (a credentials-rejection test input, not real data). `.scrub-terms.local.json` does not exist in this repo, so no custom terms were checked. In the clone I created a terms file with a dummy term, planted it in a fixture: tests/fixtures-clean.test.ts FAILED as required; after restoring both the test passed again. |
| C12 scope creep | PASS with notes | P6 to P9 files all match the phase docs plus: src/extension/origin.ts (shared helper), src/extension/pageTools.ts, src/extension/popup/PrivacyTools.tsx, src/extension/commands.ts, src/extension/palette.ts, scripts/icons.ts, scripts/zip.ts, scripts/release.ts, a 4th Vite build mode `palette`, extended types/node-min.d.ts. docs/store/ is tracked instead of the gitignored store/ (so the privacy test runs in a clone). All decisions are in docs/PROGRESS.md. |
| C13 no heavy test tooling | PASS | devDependencies: @types/chrome, eslint, jsdom, typescript, typescript-eslint, vite, vitest. Dependencies: preact only. No new dependency was added in any phase. |
| C14 docs honesty | PASS for P6 to P9; P0 to P5 re-mapped by name only | See the mapping below. |

### C14 mapping of [auto] items
- P6: 2 and 4 tests/features/pet.test.ts "controller: off costs nothing", "animation"; 3 same file "overlay" plus the scanner (no innerHTML or network in src/features/pet); 5 "avoid" (all four element types, keep and move, all-blocked); 6 "overlay" (hide button label, Escape); settings "pet settings".
- P7: 2 tests/features/palette.test.ts "indexer"; 3 "makes no storage or network calls" plus click spy and the scanner; 4 "scorer"; 5 "palette UI"; 6 "commands".
- P8: 2 tests/features/blur.test.ts "selectors"; 3 "pick mode"; 4 "blur apply"; 5 "safe screenshot"; 6 tests/features/tables.test.ts (detection on the table-heavy fixture, every value format, 200-row sort under 100 ms, filter, Restore order, untouched tables with controls or inside forms).
- P9: 2 and 3 tests/release.test.ts "version", "privacy text matches the product"; 1 `npm run release` plus "release zip" tests.
- P0 to P5 (items listed in each phase doc) map to: P0 tests/rules.test.ts, manifest.test.ts, build.test.ts, scrub.test.ts, fixtures-clean.test.ts; P1 tests/analyzer/*; P2 tests/plan/*, applier.test.ts, scripts/contrast.ts; P3 tests/providers/*, keys.test.ts, log.test.ts, build.test.ts; P4 tests/ai/*, popup.test.ts; P5 sites.test.ts, siteActions.test.ts, auto.test.ts. These were checked by file and name in this run, and all pass, but I did not re-read each assertion against each item for P0 to P5.

## UNVERIFIED (could not be checked by commands here)
1. Everything that needs a real browser: install, popup, permission prompts, auto-apply across a browser restart, badge, shortcuts and their collisions, pet and palette look and feel on real stylesheets, blur and screenshot output, table tools on real tables, reduced-motion behaviour. No e2e exists by design; see docs/QA.md and the human list below.
2. The Gemini REST response shape: `extractGeminiText` is built without a documented response shape and fails closed. Gemini error body shape and retry-after are undocumented, so errors map by HTTP status only (docs/PROGRESS.md, Phase 3).
3. Gemini bake-off: 14 of 15 calls timed out at 15 s with the default model id `gemini-3.8-flash` (1 valid plan). The model id and request shape are unconfirmed. Groq has never been called with a real key (no key was available).
4. Fixtures are synthetic, not captured from real pages; goldens have not been compared with real pages.
5. `minimum_chrome_version` 96 is justified from API history (`scripting.registerContentScripts` with `persistAcrossSessions`) and not tested on Chrome 96.
6. Edge and Brave behave like Chrome: assumed, not tested.
7. Chrome Web Store policies and review requirements in 2026: not verified; docs/store/* are drafts.
8. Trademark and name conflicts for "Skinly AI": not checked.
9. Provider retention and free-tier training terms: unknown (the consent text assumes they may keep the data).
10. Timing claims (baseline within 1 s, 20 s pipeline budget) are tested with fake timers, not measured in a browser.
11. No custom scrub terms exist, so C11 could only check the mechanism and generic patterns.
12. The popup closing ends a running flow; whether that is acceptable is a human decision.
13. Share mode "off" removes the blur (no reveal-on-hover state) and saved blur picks are not auto-applied by the always-on script: a deviation from the Phase 8 text, listed for approval.
14. Alt+Shift+S applies only the saved built-in theme (no AI) because a shortcut cannot show the consent text.

## Human checks (full list, copied from docs/HUMAN_CHECKS.md)

# HUMAN CHECKS

## Phase 0
- [ ] Run `npm run build`, load `dist/` as an unpacked extension in Edge or Chrome. On any https page click the toolbar button, then Hello. In DevTools Console `document.documentElement.dataset.skinly` is `"hello"` on that tab only; other tabs are unchanged; the Network tab shows no requests from the extension.
- [ ] On `edge://extensions` (or `chrome://extensions`) the extension details show no site access by default.

## Phase 1
- [ ] fixtures/web is SYNTHETIC. Replace it with real scrubbed captures (docs/tools/capture-fixture.md, `npm run scrub -- <raw.html> <out.html>`), then regenerate goldens with `UPDATE_GOLDEN=1 npm test`.
- [ ] Open three `*.expected.json` files beside the real pages: the main navigation and the card or link lists should be the regions found. Note any page where an obvious list is missed in docs/BUGS.md.

## Phase 2
- [ ] On three real public pages (an article site, a strict-CSP site such as github.com, a link-heavy portal): Transform shows the theme within 1 s, all five themes work, text is readable, images keep their colours, Restore returns the exact original look.
- [ ] If any site shows no styling at all (possible CSP issue with adopted stylesheets), write the site and what you saw in docs/BUGS.md.
- [ ] Judge whether `!important` colour overrides make some sites look worse than intended (dark theme on pages with many explicit light backgrounds).

## Phase 3
- [ ] UNVERIFIED: Gemini raw response shape. `extractGeminiText` (src/providers/gemini.ts) guesses `output_text` / a `model_output` step; the docs fetched only show SDK accessors. Confirm against the Interactions API reference and fix the function.
- [ ] UNVERIFIED: Gemini error bodies and retry-after (not documented in the fetched pages); Groq data-retention terms; CORS from the service worker (docs silent; the Test key button checks it).
- [ ] Bake-off ran once with the Gemini key found in `.env.local` (no Groq key was present, so Groq was skipped): gemini-3.8-flash gave 14 of 15 timeouts at 15 s and 1 valid plan (7%), median 15010 ms. Check the model id and whether the request shape (system_instruction + response_format schema) is accepted, then rerun `npm run bakeoff`. Add `GROQ_API_KEY` to `.env.local` to include Groq. Results are in private/bakeoff.json (gitignored).
- [ ] Create keys (restrict the Gemini key to the Gemini API), keep them in `.env.local` only.
- [ ] In the options page click Test key for each provider: it succeeds, and the browser's permission prompt names only that provider's host.

## Phase 4
- [ ] With a real key on five public pages record for each: seconds to baseline, seconds to AI result, better/worse/broken. At least 3 of 5 acceptable, otherwise list failures in docs/BUGS.md. Undo restores the page.
- [ ] Offline: click Change my page. The baseline stays and the message says AI is unavailable.
- [ ] On a sign-in page and a payment-style page: the Network tab shows no provider request.
- [ ] The popup closes when you click elsewhere, which ends a running flow (baseline stays). Decide whether that is acceptable or whether the flow should move to the service worker.

## Phase 5
- [ ] On two public sites: Keep, then Always on this site. Close the whole browser, reopen, visit the site: it is themed without clicking, with at most a brief flash. Record any visible flash in docs/BUGS.md.
- [ ] Forget this site: the next visit is original, and the extension details page shows no site access for it.
- [ ] On a site where a different page type has a very different layout, confirm the "This page changed. Regenerate?" banner appears and nothing breaks.
- [ ] Confirm the toolbar badge shows ON on a themed tab and clears after Restore.

## Phase 6
- [ ] Turn the pet on for three sites with very different stylesheets: it looks the same and the site's CSS does not leak in. Click through the page around it: nothing is blocked.
- [ ] Turn on reduced motion in the operating system: the pet is static (also check after toggling it while the page is open).

## Phase 7
- [ ] On three sites (one with hundreds of links) open the palette with Alt+Shift+K, find a link by typing, press Enter in the palette, then Enter on the focused link: it opens as normal.
- [ ] Rebind one shortcut in the browser's shortcut settings (extensions menu, Keyboard shortcuts) and confirm it works. Also check the three suggested keys do not collide with a browser or OS shortcut.
- [ ] Alt+Shift+S applies the saved built-in theme only (it never asks an AI; that needs the popup because of the consent text). Decide whether that is acceptable.

## Phase 8
- [ ] On a real page pick three elements, turn Share mode on, take a safe screenshot and read the PNG yourself: the picked parts are unreadable. Try a page where you did not pick something sensitive and confirm it is visible (the tool only blurs what you pick).
- [ ] Sort and filter a real table, then press Restore order and Restore original: the page is exactly as before.
- [ ] Pick mode: on a page with links and buttons, clicks only toggle the blur while pick mode is on; after Escape the page behaves normally. The popup closes when you click the page, so reopen it to see counts, Save picks and Safe screenshot.
- [x] Decisions ACCEPTED (2026-10-30): Share mode off removes the blur entirely, and saved blur picks are not auto-applied by the always-on script.

## Phase 9
- [ ] Choose the final name and check it for trademark conflicts. Host docs/store/privacy.md at a public URL and add a contact address.
- [ ] Re-read the current Chrome Web Store policies and the extension review requirements before you submit; policies changed in 2026 and the details could not be verified here. Fill the data-use form accurately (docs/store/data-use.md is a draft).
- [ ] Run docs/QA.md on Edge, Chrome and Brave. Fix any failure with a fix prompt, one test per bug.
- [ ] Final privacy check: with the Network tab open, use the extension on a page: the only requests from the extension go to the provider you chose and only after consent.
- [ ] Look at the icon at 16 px in the toolbar on a light and a dark browser theme; replace scripts/icons.ts if you want another design.
