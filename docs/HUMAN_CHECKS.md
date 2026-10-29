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
