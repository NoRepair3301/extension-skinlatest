# PHASE 11: product polish (design system, popup, options, first run, performance)

Goal: the extension feels like a finished product from a very strong team: consistent design, calm and fast UI, clear states, accessible, honest about privacy. No new capabilities, only quality.
Depends on: Phase 10. Branch: feat/polish. Tag at the end: v0.2.0-rc2.
Rules: CLAUDE.md applies. No e2e. No new dependency. No new permission. No telemetry.

## Scope (in order, commit after each step, `npm run check` green before each commit)
1. Design system, src/ui/tokens.css and src/ui/*: spacing scale (4 px base), radius scale, type scale, elevation, motion durations (120, 180, 240 ms) and easing, colour roles for the extension's own UI. The popup and options follow the active theme in light and dark, and respect `forced-colors` and `prefers-reduced-motion`. One shared set of components in Preact: Button (primary, secondary, quiet), Toggle, Select, Card, Tabs, Toast, Banner, EmptyState, Spinner, Tooltip, Dialog. Every component has roles, labels, visible focus rings and keyboard support.
2. Popup redesign: header with the new logo and a status line (page state in plain words); one prominent primary action ("Change my page"), then Restore; theme cards with a mini preview each; Scene and Pet pickers with thumbnails drawn from the same art; quick toggles (Blur whole page, Pet, Scene); a "Remember this site" section with Always on, Pause, Forget; a small "What gets sent" link that opens the exact payload view. The main actions are visible without scrolling. States for idle, blocked, working, consent, preview, error and offline, each with one line of copy from SPEC 11 and a clear next step. Opening the popup is instant: no blocking work before first paint.
3. Options page with tabs: General, Themes, Scenes and pets, My assets, AI providers, Sites, Shortcuts, Privacy, About. Providers: order, keys (masked), models, Test key with a clear result, daily counter, a plain statement of what each provider receives. Sites: list, search, Forget, Forget all, blocklist editor. Shortcuts: each command with its real assigned key and a how-to for the browser's shortcut page. Privacy: what stays on the device, what is sent after consent, how to wipe everything ("Erase all Skinly data" with a confirm dialog). About: version, licences, links to the privacy text.
4. First run: on install open the options page (use runtime.openOptionsPage, no extra permission) with a three-step welcome: pick a theme and scene, optional AI key, the privacy promise in two lines. Skippable, shown once, can be reopened from About.
5. Strings: move all user-facing text into src/ui/strings.ts (English only now, structured so a second language is a data change). Plain, friendly, short; no jargon; errors say what happened and what to do.
6. Error handling: an error boundary around the popup and options so a crash shows a calm message and a "Restore this page" button instead of a blank panel. Every failure path leaves the page as it was.
7. Performance budgets enforced by the build (validate-dist fails over budget): popup bundle at most 60 KB gzip, applier at most 50 KB gzip, auto script at most 20 KB gzip, scene script at most 150 KB minified, no source maps. Idle scene and pet code do no work when hidden or reduced motion. Document the budgets in docs/PERF.md and list the human measurement steps (Task Manager, DevTools Performance) for a heavy scene.
8. Accessibility: automated checks in unit tests for roles, names, tab order, contrast of our own UI tokens in all themes, and focus return after dialogs. A short keyboard-only walkthrough is added to docs/QA.md.
9. Docs: README for users, docs/ARCHITECTURE.md (one page with the module map and data flow, including where the AI can and cannot reach), CHANGELOG.md, updated docs/store/* (new screenshots shot list, honest feature descriptions, scenes and assets stay local, permission justifications unchanged), version 0.2.0 in package.json and the manifest (tests check they match).
10. Final pass: run the AUDIT common checks C1 to C14 on a fresh clone, `npm ci`, `npm run check`, `npm run release`, write docs/FINAL_REPORT.md with PASS or FAIL, UNVERIFIED items and the full human checklist.

## Acceptance
1. [auto] `npm run check` and `npm run release` pass; budgets enforced; versions match.
2. [auto] Component and accessibility tests pass; popup renders every state from fixtures of state; error boundary test shows the restore button.
3. [auto] No new permission, dependency, network call or storage key outside the documented ones (scanner and manifest test).
4. [human] Click through every popup state and every options tab with the keyboard only, then with a mouse. Nothing is cut off, every control has a visible focus ring, copy reads well.
5. [human] First install in a fresh browser profile shows the welcome once. "Erase all Skinly data" really clears it.
6. [human] Open a heavy page with a scene on and watch Task Manager for a minute: idle CPU stays low. Write the numbers in docs/PERF.md.
7. [human] Run the full docs/QA.md on Edge, Chrome and Brave.

## Stop
Stop when items 1 to 3 pass, everything is committed and merged into main with `--no-ff`, and the tag is set. Print items 4 to 7. Do not publish or submit anything.
