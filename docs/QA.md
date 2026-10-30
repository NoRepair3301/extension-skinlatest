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
| 16 | Element theming (rc4) | Open a public article page and a site with many buttons, forms and a data table; Change my page: links (hover, visited), buttons, inputs, selects, textareas, tables (header and zebra rows), code and selection colour all follow the theme; images keep their colours | | | |
| 17 | Legacy portal (rc4) | Open erp.iitkgp.ac.in (or another old table-and-font-tag portal) without signing in: Change my page themes the body, tables and framed parts; Restore returns the exact original | | | |
| 18 | Frames (rc4) | On a page with a same-origin iframe the framed part is themed; a cross-origin embed (video, ad) is untouched; Restore undoes both | | | |
| 19 | Whole-page blur (rc4) | Popup: Blur whole page: the page is blurred, the page still scrolls and links still work, the Unblur button is reachable with Tab and removes it; Restore removes it; Safe screenshot with it on gives a blurred picture | | | |
| 20 | Shortcuts (rc4) | The popup's list matches edge://extensions/shortcuts. Each assigned key shows a 2 s toast: theme applied, restored, blur on/off, palette open. On edge://extensions the badge shows "!" | | | |
| 21 | Pet button (rc4) | Pet on: "Show pet on this page" shows it, Restore removes it; on a page where the theme is rolled back the pet still shows; on a blocked page the one-line message says why | | | |
| 22 | Failure message (rc4) | Force a rollback (a page where the theme cannot apply): the popup gives a plain-words reason, no page text | | | |
