# HANDOFF — S5.2 F1 implement: theme click applies
Status: DONE     Date: 2026-11-05     Model/effort used: Opus 5.5 / high (per prompt)
## What changed
- src/extension/popup/Popup.tsx — `applyChoice` replaces `pickTheme`; `applyLatest`; radios `onClick` + `disabled={busy}`; `selected`/`themeBusy` state, refs `clickSeq`/`pageQueue`/`permissionPending`; `tabUrl` set in `refreshSite`; Change my page/Restore disabled while a theme applies; `aria-busy` + Applying line; `rememberedChoice` (O4).
- src/extension/cleanup.ts — new `engineCleanup` (sheets, engine marks, root/engine/region attrs) and `hasLeftovers`; `markerCleanup` = `engineCleanup` + UI-host/tool sweep.
- src/extension/applier-core.ts — `run()`: `fresh` before `restore(false)`; `engineCleanup` before `snapshot` when fresh and leftovers (S2.3 gap closed).
- src/extension/api.ts — `"shownTheme"` added to `PageMethod`.
- src/extension/keeper.ts — `applyToTab(tabId, origin, plan?)` theme-aware; `keep()` passes the kept plan (resume: the record's plan).
- src/ui/strings.ts — `applying(name)`, `choiceSaved` (placeholders, S5.4 owns copy).
- tests: new retheme.test.ts (A, 19), keeper.test.ts (K, 6), popup-theme-click.test.ts (P, 15); persistence.test.ts +6 F tests and stub `shownTheme`/`apply`; popup.test.ts: "saves the picked theme" and T6 adapted (assertions kept, apply asserted too).
## Gate results
Before: tsc 0; eslint 0; vitest 1440 pass / 0 fail / 91 files. After: tsc 0; eslint 0; vitest 1486 pass / 0 fail / 94 files; GATE GREEN; build ok; validate-dist ok.
Mutations (scratch copy, removed): no fresh cleanup (5 A fail); cleanup always (1); markerCleanup instead (4); no swap restore (14); keeper old skip (K+F Edge fail); keeper always apply (1); onChange radios (3); await before request (2 order tests); origin-only eligibility (.pdf); radios not disabled (1); no latest-wins seq (rapid); no pending-request reuse (rapid). Grep: no `pickTheme`, no Apply control in src.
## Click handler call order (final)
seq++ → resolve theme, clickKept → eligibility (full tab URL) → [eligible, not refused] writeIntent (not awaited) → requestOrigins (gesture; reused while pending) → saveSettings (not awaited) → state (selected, busy) → page work queued (latest wins) → answer: allow = optimistic site record; deny = keepDenied + Keep on this site; refused before = thisPageOnly. Ineligible: saveSettings, MSG.blocked + choiceSaved, nothing injected/asked.
## Decisions made
O1-O4 accepted as recommended (no OWNER_NOTES.md); dirty-tree precondition read as src/tests clean; no engine change; shownTheme-only keeper check; request always called. Details in DECISIONS.md.
## Out-of-scope touches
None (all 6 src files are in F1_DESIGN §11; tests per §10).
## Bugs found / gaps handed on
- R3 same-origin iframe double-theming still open (S5.3 iframe test). Shortcut Restore does not pause (S5.3). Failed swap leaves the page unthemed but says "left as it was" (S5.4).
- After a theme click, Change my page (AI, untouched) leaves the clicked radio checked though the page shows the AI theme (`selected` not reset in `start()`). S5.3/S5.4.
## Owner manual checks (run before committing)
1. `npm run build`, reload the extension, open Wikipedia. Popup: click a theme: page themes at once, no second click.
2. Click each other theme in turn: each replaces the previous; nothing stacks or flashes.
3. Click Auto, then a theme again.
4. Before theming save `window.__a = document.documentElement.outerHTML`; after Restore run `document.documentElement.outerHTML === window.__a`: expect `true`.
5. After Restore click the (still checked) theme: it applies and the site is no longer "Paused".
6. Reload: the remembered theme comes back by itself.
7. On a never-granted site click a theme: prompt appears in the same click (theme shows behind it); deny: site not kept, "Not kept" message + Keep on this site; allow: kept. Edge: popup closes at the prompt; after allow the page shows the clicked theme.
8. chrome://extensions: click a theme: no error, blocked message + "Saved as your theme for other pages."
9. "Change my page" once (with an AI key): behaves as before.
10. No red errors in page or service-worker console.
## Suggested commit message
feat(popup): theme click applies at once, remembers the site, re-themes without stacking (S5.2)
  git add -A
  git commit -m "feat(popup): theme click applies at once, remembers the site, re-themes without stacking (S5.2)"
  git tag stage-S5.2
  git push
## Next substage: S5.3 (Sonnet 5.5 / high) — Restore polish. Relies on: onClick radios + un-pause via keeper `record()`; `engineCleanup`/`hasLeftovers` in cleanup.ts; theme-aware `applyToTab`; strings `pickToResume` still to add.
