# PHASE 9: release build, store text, final audit

Goal: a clean release zip, accurate store and privacy text, and a manual QA pass.
Depends on: Phase 8. Humans decide the final name, host the privacy page and submit.

## Scope (in order, commit after each step)
1. Icons: generate 16, 32, 48 and 128 px PNGs from a procedural SVG design using Node only. If that needs a dependency, STOP and ask to approve one dev-only package.
2. Manifest polish: final `name`, `description`, `version` (single source of truth in package.json, checked by a test), icons, `minimum_chrome_version` only if you can justify it from an API you use.
3. `npm run release`: builds and zips dist/ only (no fixtures, tests, docs, private/, scripts, source maps unless asked). A test unzips it and checks the file list.
4. Final scanner pass: no key patterns, no remote URLs besides the provider allowlist, no unexpected permissions, no source maps containing paths from the developer's machine.
5. store/ folder (gitignored): listing text drafts, single-purpose statement, permission justifications (activeTab, scripting, storage, optional host permissions: why and when), data-use disclosure (a layout-only summary is sent to the AI provider the user chose, after consent), privacy policy text matching the actual behaviour, screenshot shot list.
6. docs/QA.md: a manual matrix for Edge, Chrome and Brave with these 15 checks: install, transform, five themes, restore, no-key flow, AI flow, blocked page, no-ai page, Remember, Always, Forget, pet, palette, blur and screenshot, table tools. Leave result columns empty for the human.
7. assets/LICENSES.md: every font, icon or asset and its licence (all original or system fonts expected).

## Acceptance
1. [auto] `npm run check` and `npm run release` succeed; the zip test passes.
2. [auto] Version matches in package.json, the manifest and store/ text (test).
3. [auto] Privacy text test: the claims in store/privacy.md (permissions list, provider hosts, "no text, links or forms are sent") match the manifest and the payload test from Phase 4.
4. [human] Choose the final name and check it for trademark conflicts. Host the privacy policy at a public URL.
5. [human] Re-read the current Chrome Web Store policies and the extension review requirements before you submit; policies changed in 2026 and I could not verify the details. Fill the data-use form accurately.
6. [human] Run docs/QA.md on Edge, Chrome and Brave. Fix any failure with a fix prompt, one test per bug.
7. [human] Final privacy check: with the Network tab open, use the extension on a page: the only requests from the extension go to the provider you chose and only after consent.

## Stop
Stop when items 1 to 3 pass and everything is committed. Print items 4 to 7. Tag `v0.1.0-rc1`.
