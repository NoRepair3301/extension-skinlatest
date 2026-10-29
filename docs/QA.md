# Manual QA matrix

Fill the result columns yourself. Use public pages only; never a page where you are signed in to something important. Write failures as one line in docs/BUGS.md (page type, what you saw).
Load the unpacked `dist/` folder (or unzip release/skinly-ai-0.1.0.zip) on each browser.

| # | Check | Steps | Edge | Chrome | Brave |
|---|---|---|---|---|---|
| 1 | Install | Load unpacked, pin the icon, icon and name look right | | | |
| 2 | Transform | Open a public article page, click Change my page: a built-in theme appears within a second | | | |
| 3 | Five themes | Switch through all five: text stays readable, nothing moves or disappears | | | |
| 4 | Restore | Restore original: the page looks exactly as before | | | |
| 5 | No-key flow | With no key, Change my page applies a theme and says how to add a key | | | |
| 6 | AI flow | Save a key, accept the consent, Change my page: preview with Keep, Undo, Try another | | | |
| 7 | Blocked page | Open the extensions page and a web store page: the popup says it can't change this kind of page | | | |
| 8 | No-AI page | Open a public sign-in page: only the built-in theme, with the no-ai message; no provider request in the Network tab | | | |
| 9 | Remember | Keep, then Remember this site: saved, applies when you click | | | |
| 10 | Always | Always on this site: permission prompt names only this origin; reopen the browser, the site is themed | | | |
| 11 | Forget | Forget this site: next visit is original; no site access remains in the extension details | | | |
| 12 | Pet | Turn the pet on: it appears in a corner, hides with the x button and with Escape, moves away from form fields, is static with reduced motion | | | |
| 13 | Palette | Alt+Shift+K, type, Enter, then Enter on the focused link: it opens normally | | | |
| 14 | Blur and screenshot | Pick three elements, Share mode on, Safe screenshot: picked parts unreadable in the PNG | | | |
| 15 | Table tools | Sort and filter a public data table, Restore order, Restore original: page identical | | | |
