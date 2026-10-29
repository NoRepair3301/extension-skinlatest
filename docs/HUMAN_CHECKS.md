# HUMAN CHECKS

## Phase 0
- [ ] Run `npm run build`, load `dist/` as an unpacked extension in Edge or Chrome. On any https page click the toolbar button, then Hello. In DevTools Console `document.documentElement.dataset.skinly` is `"hello"` on that tab only; other tabs are unchanged; the Network tab shows no requests from the extension.
- [ ] On `edge://extensions` (or `chrome://extensions`) the extension details show no site access by default.

## Phase 1
- [ ] fixtures/web is SYNTHETIC. Replace it with real scrubbed captures (docs/tools/capture-fixture.md, `npm run scrub -- <raw.html> <out.html>`), then regenerate goldens with `UPDATE_GOLDEN=1 npm test`.
- [ ] Open three `*.expected.json` files beside the real pages: the main navigation and the card or link lists should be the regions found. Note any page where an obvious list is missed in docs/BUGS.md.
