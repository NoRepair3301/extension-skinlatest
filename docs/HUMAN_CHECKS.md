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
- [x] Gemini raw response shape: VERIFIED 2026-10-30 (steps[] with a model_output step, content[].text). `extractGeminiText` fixed, tests use sanitized copies.
- [x] Gemini 503 body and retry-after: VERIFIED 2026-10-30. Groq 401 body: VERIFIED. STILL UNVERIFIED: Gemini 401/403/429 bodies, any Groq success response, Groq data-retention terms, CORS from the service worker (the Test key button checks it).
- [x] Groq key now works (probe HTTP 200). Bake-off below.
- [ ] **Gemini full-plan calls did not finish.** See the bake-off table below. Wait for the free-tier limit to reset, then run `node scripts/probe.ts` and `npm run bakeoff` once. If 40 s still times out, the model's thinking time is the problem and a documented way to lower it must be added to docs/providers/gemini.md (none is documented, so none was guessed).

### Bake-off 2 (groq only, 2026-10-30, prompt v1, 3 s gap, no retries, 40 s timeout)
| provider | model | calls made | success rate (valid JSON) | median latency | valid StylePlan rate | notes |
|---|---|---|---|---|---|---|
| groq | openai/gpt-oss-120b | 5 of 15 (stopped on 429) | 80 % (4/5) | 2524 ms | 60 % (3/5) | 1 x 429 on call 5; 0 % of valid plans passed the strict contrast check (see below) |

Valid rate is 60 %, so the prompt was not tuned (PROMPT_VERSION stays "1"). Small sample (5): treat as indicative. Observation for a human: the script's "contrast ok" column was 0 %, i.e. the model's colours fail the SPEC 10 targets; the pipeline then repairs once and falls back to a built-in theme (tested). Worth checking in the browser how often users see the fallback, and whether the prompt should give contrast guidance.
Gemini candidates for lower latency are in docs/providers/gemini.md section 10; no Gemini bake-off was run because a 429 was hit.

### Bake-off 1 (2026-10-30, prompt v1, fixtures/web, 3 s gap, no retries, timeout 40 s)
| provider | model | calls made | success rate | median latency | valid StylePlan rate | notes |
|---|---|---|---|---|---|---|
| gemini | gemini-3.8-flash | 5 of 15 (stopped on 429) | 0 % (0/5) | 40010 ms (all timeouts) | 0 % (no answers to judge) | 4 timeouts, then HTTP 429 |
| groq | openai/gpt-oss-120b | 1 of 15 (stopped on 401) | 0 % | 189 ms | 0 % | invalid API key, nothing to measure |

Prompt not tuned: there were no answers, so no evidence about prompt quality (PROMPT_VERSION stays "1"). The earlier run (15 s timeout) had 14 timeouts and 1 valid plan.
Why it timed out: requests are small (system 1.7k chars, schema 1.2k, user 0.9k to 8.9k chars), so size is not the cause. A trivial probe (5 output tokens) took 8.9 s because the model spent 81 thought tokens first, and a probe a minute earlier got 503 "high demand" with retry-after 30. Full plans need more thinking plus output, so 15 s was too short, and at 40 s the service still stalled before returning 429.
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
- [x] Decisions ACCEPTED (2026-10-30): Share mode off removes the blur entirely (no reveal-on-hover state), and saved blur picks are not auto-applied by the always-on script.

## Phase 9
- [ ] Choose the final name and check it for trademark conflicts. Host docs/store/privacy.md at a public URL and add a contact address.
- [ ] Re-read the current Chrome Web Store policies and the extension review requirements before you submit; policies changed in 2026 and the details could not be verified here. Fill the data-use form accurately (docs/store/data-use.md is a draft).
- [ ] Run docs/QA.md on Edge, Chrome and Brave. Fix any failure with a fix prompt, one test per bug.
- [ ] Final privacy check: with the Network tab open, use the extension on a page: the only requests from the extension go to the provider you chose and only after consent.
- [ ] Look at the icon at 16 px in the toolbar on a light and a dark browser theme; replace scripts/icons.ts if you want another design.
