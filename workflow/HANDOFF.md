# HANDOFF — S5.3 Restore polish (F2 UX) and exact-restore integration test
Status: DONE     Date: 2026-11-06     Model/effort used: Sonnet 5.5 / high (per prompt)
## What changed
- src/extension/restore.ts (new) — `restorePage` = the one Restore path (inject all frames, restore all frames, badge, pause a remembered site; `blocked`/`failed` outcomes) and `hasSomethingToRestore` (button state).
- src/extension/commands.ts, background.ts — restore-page now calls the shared `restore` dep (= `restorePage`); failure shows badge "!", title and failed toast instead of "restored".
- src/extension/popup/Popup.tsx — `restore()` uses `restorePage`; states `restorable`/`restoreState`/`restoredHere`; aria-disabled + aria-busy + `#restore-hint` live region; radios clear after Restore (paused record also clears them); pick hint on the paused site line; probe on open, after apply/AI flow/resume.
- src/extension/applier-core.ts, cleanup.ts, api.ts — page method `canRestore` (engine, lost-instance marks here or in same-origin iframes, UI hosts/tool marks); `callApplier` answers it from the `data-skinly` root marker when no applier is in the page.
- src/ui/strings.ts — restoring, restoredShort, nothingToRestore, restoreFailed, pickToResume (placeholders; S5.4 owns the copy).
- tests: new restore-exact (69), popup-restore (12), restore-path (15); adapted commands, persistence (+2 shortcut parity), popup, popup-scene, popup-theme-click, popup-tools (reasons in DECISIONS).
## Gate results
Before: tsc 0; eslint 0; vitest 1486 pass / 0 fail / 94 files. After: tsc 0; eslint 0; vitest 1587 pass / 0 fail / 97 files; GATE GREEN. `git diff --ignore-cr-at-eol --stat -- src/engine` empty.
Deliberate breakage (scratch copy, removed; all made the named tests fail): no pause in restorePage (14), shortcut own path (5), button always enabled (12), repeat clicks not ignored (1), radios not cleared (1), unanswered restore reported ok (2), engine skips !important revert (14), engine ignores page change I4/I5 (4), lost-instance cleanup skips markers (7), observer left connected I7 (54), canRestore ignores lost marks (8), probe ignores root marker (1).
## Decisions made (also in DECISIONS.md)
Popup and shortcut share `restorePage`. Prompt beats design for radios: none active after Restore (global default stays stored). Restore uses aria-disabled to keep focus. jsdom cannot prove shorthand/exotic style byte-exactness (cssstyle): fixture avoids them.
## Out-of-scope touches
None beyond: applier-core.ts, cleanup.ts, api.ts, background.ts (page-runner/api restore path, minimal).
## Bugs found (outside scope)
- R3 confirmed (engine): top engine walks same-origin iframes (src/engine/dom.ts:1181-1193, collect) and the frame's own tokensOnly applier (src/extension/applier.ts:91-93) also themes it. Either alone restores exactly; both together leave the frame's inline colours themed after both restores (sheets and marks are removed). tests/restore-exact.test.ts asserts only sheets/marks/timers for the combined case. Owner decision: top engine should skip frames that have their own applier, or the other way round.
- A failed theme swap leaves the page unthemed with copy "left as it was" (S5.4). After "Change my page" a clicked radio stays checked (S5.2 note; S5.4).
- Reopened popup on a tab-only themed page that was restored shows the global default checked: no per-tab storage.
## Owner manual checks (before committing)
1. `npm run build`, reload the extension; on Wikipedia run `window.__a = document.documentElement.outerHTML`.
2. Popup: Restore reads disabled ("Nothing to restore on this page.") before any theme. Click a theme: page themes, Restore enables.
3. Click Restore: page returns, button shows "Restored" for 2 s then disabled; no radio checked; `document.documentElement.outerHTML === window.__a` prints `true`.
4. Reload: stays original (site paused). Reopen popup: same restored state + hint. Click a theme: applies again, no "Paused".
5. Theme, then press the Restore shortcut: same as step 3 (site paused too).
6. Theme, reload the extension in chrome://extensions (not the page), open the popup: Restore is enabled; click it: page returns to normal.
7. chrome:// page: Restore disabled with the blocked message, no error.
8. Click Restore twice fast: one restore only. No red errors in page or service-worker console.
## Suggested commit message
feat(restore): consistent Restore button and shortcut, paused-site state, exact-restore integration test (S5.3)
  git add -A
  git commit -m "feat(restore): consistent Restore button and shortcut, paused-site state, exact-restore integration test (S5.3)"
  git tag stage-S5.3
  git push
## Next substage: S5.4 (Sonnet 5.5 / medium) — edge states. Relies on: strings restoring/restoredShort/nothingToRestore/restoreFailed/pickToResume to reword; `restorePage` outcomes `blocked`/`failed`; R3 decision.
