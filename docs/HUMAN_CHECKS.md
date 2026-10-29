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
