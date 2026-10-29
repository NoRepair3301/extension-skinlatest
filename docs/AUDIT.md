# AUDIT

Read-only review of a finished phase. Use the audit prompt in PROMPTS.md in a fresh session. Sonnet medium is enough; use Opus medium for the Phase 1 audit, the Phase 4 audit and the final audit.
Rules for the auditor: run the commands yourself, quote the output, never edit files, never say PASS without evidence.

## Common checks (every phase)
C1. Check suite: run `npm run check`. It must be green. Grep src/ and tests/ for `.skip(`, `.only(`, `xit(`, `xdescribe(`: none allowed.
C2. No automation: grep src/ for `.click(`, `dispatchEvent(`, `.submit(`, `requestSubmit(`, `.focus(` on page elements, and writes to `.value`. Each hit must be on an element the extension created itself (popup, palette input, filter box) or be the palette's focus-only move. Never on a site element.
C3. Data minimisation: the Phase 4 payload test exists and passes. The StructuralSummary must contain no text, hrefs, ids, alt, title, aria-label, data attributes, values, URLs, origin or page title. Check by running the marker test and reading one golden file.
C4. AI output is untrusted: every provider response goes through the validator before any other use. Trace the code path from `providers/*` to the DOM and confirm it can only pass through validate, then compile (fixed templates), then apply.
C5. Never break the site: the invariants run after every apply and failure rolls back everything. The only reordering or hiding allowed is Phase 8 table sort and filter, recorded in the ledger and reversible.
C6. Keys: stored only in storage.local. Never logged, never sent to a content script or page, never in a URL or error message. Run the key-pattern scan on src/, tests/, fixtures/ and dist/ (`AIza`, `gsk_`, `xai-`, `sk-`): zero hits. `.env.local` is not tracked (`git ls-files | grep env`).
C7. Permissions: the built manifest matches SPEC 9 exactly. Required: activeTab, scripting, storage (Phase 7 also adds a `commands` manifest key, which is not a permission). Hosts only as optional_host_permissions. Not allowed: tabs, webRequest, history, cookies, downloads, `<all_urls>` as a required permission, content_scripts matching all sites.
C8. Gate: blocked origins, internal and store pages, PDFs, and pages with password, payment or file inputs never reach a provider. Find the test.
C9. Network: `fetch` appears only under src/providers/. No XMLHttpRequest, WebSocket, sendBeacon, remote script or stylesheet, `eval`, `new Function`. `innerHTML` only with constant strings or not at all.
C10. chrome.* APIs appear only in src/extension/api.ts (grep `chrome\.` and `browser\.`).
C11. Personal data: grep fixtures/, tests/, docs/ and `git log -p` for emails, phone numbers and every term listed in private/terms.txt if it exists. Zero hits. The fixtures-clean test must pass, and must fail when you temporarily put a term from private/terms.txt into a fixture (restore it afterwards).
C12. Scope creep: `git diff --stat main...HEAD` (or the previous tag). List every file not named in the phase doc. Compare package.json dependencies with CLAUDE.md. Unexpected files or dependencies are FAIL until explained.
C13. No heavy test tooling: devDependencies contain only what CLAUDE.md lists (no browser automation framework).
C14. Docs honesty: every [auto] Acceptance item of the phase maps to a named test or command; list the mapping. Items without one are FAIL.

## Extra checks per phase
- P0: scanner fails on a planted forbidden pattern and on a planted fake key (test it, then remove). validate-dist rejects an unexpected permission. Scrub tool output has no real text and no real hrefs.
- P1: analyser makes zero DOM writes (spy or frozen DOM test). 15,000-node cap works. Fingerprint is stable across two runs. At least 10 fixtures exist and each has a golden file.
- P2: contrast script runs inside `npm run check` and covers all 5 themes. CSS compiler rejects any property outside the allowlist and any value that is not a hex, enum or bounded number. Apply then restore returns a byte-identical DOM (attributes included). Observer is bounded.
- P3: providers are built from docs/providers/*.md; no endpoint or parameter appears that is not in those files. Retry only for 429 and 5xx with retry-after of 5 seconds or less. Timeouts are 15 s per call and 20 s overall. Error kinds are mapped. No key in any log or test snapshot. Bake-off script reads .env.local and never prints a key.
- P4: consent text is versioned and "Show what will be sent" shows the exact payload. 3 s gap and 20 per day guards exist and are tested. A bad provider answer ends in repair, then the nearest built-in theme, never a half-applied page. Blocked states have the exact UX copy from SPEC 11.
- P5: site keys are origins only. Cap 200 with eviction. Only the active origin is requested for permission, from a click. Forget removes record, content script registration and permission. The auto path has no provider import (check the import graph).
- P6: disabled pet leaves nothing behind. Host has pointer-events none. No innerHTML, no network in src/features/pet. The art is original (no copied paths or names).
- P7: palette module has no storage, network or click calls. Labels never leave memory. Focus restore works.
- P8: the only use of `filter` is the blur template. Screenshot never leaves the browser and restores Share mode on failure. Table tools skip tables with controls or inside forms. Selectors never contain ids or text.
- P9: release zip contains only dist files (list it). Version is identical everywhere. Privacy text matches the manifest and payload test. No source map leaks developer paths. LICENSES.md lists every asset.

## Output format
A table with columns: check, PASS or FAIL, evidence. Then "Failures, most serious first", each with the smallest fix. Then "Needs a human" for anything that cannot be checked by commands.

## Human checkpoints (you, not Claude)
After each phase, do the [human] items from that phase doc. Rules for safe checking:
- Test on public pages only. Never on a page where you are logged in to something important, never on payment or exam pages.
- Do not paste screenshots with your name, email, roll number, balances or keys into any chat.
- If a human check fails, write one line in docs/BUGS.md (page type, what you saw), then use the fix prompt with that line.
- Merge and tag only when the audit has no FAIL and your human items pass.
