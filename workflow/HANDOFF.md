# HANDOFF — S5.4 Edge states: ineligible pages, permission denied, progress and error strings
Status: DONE     Date: 2026-11-06     Model/effort used: Sonnet 5.5 / medium (per prompt)
## What changed
- src/ui/strings.ts — new `S.edge` group (13 lines, each commented); S5.3/S5.1 placeholders now commented finals; `restoreFailed` reworded.
- src/ai/messages.ts — `blockedWhy(url, blocklist)` and `themeFailureMessage(r)`; `MSG.blocked`/`applyFailureMessage` untouched (AI flow, shortcuts).
- src/extension/popup/Popup.tsx — distinct lines per cause; 8 s apply/restore and 4 s probe timeouts; failed apply restores settings, selection, record and intent; saveFailed notice; aria-busy on the clicked radio; `#popup-status` id + fieldset aria-describedby on error.
- tests: new edge-states (22), adapted popup-theme-click (4 ineligible + 2 failure lines), popup-restore (blocked hint).
## Gate results
Before: tsc 0; eslint 0; vitest 1587 pass / 0 fail / 97 files. After: tsc 0; eslint 0; vitest 1609 pass / 0 fail / 98 files; GATE GREEN. `git diff --ignore-cr-at-eol --stat -- src/engine` empty.
Deliberate breakage (in place, restored; all failed the named tests): no apply/restore timeout (2), no stored-state undo (4), no settings/selection revert (1), `blockedWhy` constant (8), "null" in a string (2).
## Copy for proofreading (condition | key | text)
- browser/extension page | edge.blockedInternal | Skinly can't change browser pages. Open a regular website to use it.
- store | blockedStore | Skinly can't change the browser's extension store. Open another website to use it.
- PDF viewer | blockedPdf | Skinly can't change PDFs in the browser's viewer. Open a web page to use it.
- file:// and other schemes | blockedFile | Skinly only changes web pages (http and https), not local files. Open a web page to use it.
- user blocklist | blockedSite | This site is on your blocklist in Settings. Remove it there to change it.
- unknown address | blockedOther | Skinly can't change this page. Open a regular website to use it.
- permission missing/denied | notAllowed | Skinly wasn't allowed to run on this page, so it was left as it was. Click the theme again and choose Allow when the browser asks.
- injection failed | injectFailed | Skinly couldn't start on this page, so it was left as it was. Reload the page and try again.
- applier missing/silent | noAnswer | This page didn't answer, so it was left as it was. Reload the page and try again.
- apply timeout | timedOut | This is taking too long, so Skinly stopped and took its changes off. Reload the page and try again.
- tab closed/navigated | tabChanged | The tab changed while the theme was going on, so nothing was kept. Open the page you want and try again.
- rolled back | `<reason>` + backToOriginal | …, so the page is back to its original look. Pick another theme to try again.
- storage write failed | saveFailed | Couldn't save your choice, so it may not stay after you close this panel.
- restore failed | popup.restoreFailed | Couldn't restore this page. Press Restore to try again, or reload the page to get the original back.
- restore timeout | restoreTimedOut | Restore is taking too long. Press Restore to try again, or reload the page to get the original back.
## Decisions made (also in DECISIONS.md)
O1 kept (a refused prompt with a working injection still themes the tab only); the "denied keeps selection" test uses denial plus refused injection. Eligibility, not the prompt, blocks file://.
## Out-of-scope touches
None.
## Bugs found (outside scope)
- R3 (S5.3) still open: top engine and a same-origin frame applier both theme the frame (src/engine/dom.ts:1181-1193, src/extension/applier.ts:91-93).
- Undo of a stored record runs after the permission answer; if the keeper saves later than that check, a stale record could survive (not reproducible in tests).
## Not implemented from section 9
- "Keeper failed" shows no message (the popup cannot see it; "Why not themed here?" covers it). Site cap (200): no message by design. File-access recovery hint: file: is blocked by eligibility. Contrast of the error banner was not measured.
## Stage 5 summary (specs.md section 5)
F1 (click applies, remembers the site, no stacking) and F2 (consistent Restore, paused site, exact restore) are implemented and tested; edge states are covered. Open: R3 and owner decisions O1-O4 (taken as proposed).
## Owner manual checks
1. `npm run build`, reload. 2. chrome://extensions, Web Store, PDF: click a theme and Restore: clear line, no error text, popup usable. 3. Ungranted site: click a theme, deny: the page may still theme this tab (O1); reload and click again, allow: applies. 4. file:// page: the line says local files are not changed (see decisions). 5. Click themes rapidly: last wins, never hangs. 6. Close the tab mid-apply, reopen on another tab: normal. 7. Proofread the copy above. 8. No red errors in page or service-worker console.
## Suggested commit message
feat(popup): clear messages for ineligible pages, denied permission and failures; busy states always end (S5.4)
  git add -A
  git commit -m "feat(popup): clear messages for ineligible pages, denied permission and failures; busy states always end (S5.4)"
  git tag stage-S5.4
  git push
## Next substage: S6.1 (Sonnet 5.5 / medium) — rename map and leftover-scan script. Relies on: product name still "Skinly"/"Skinly AI" in all new strings (S.edge, messages.ts); data-skinly literal in api.ts callApplier.
