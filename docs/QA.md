# Manual QA matrix

Fill the result columns yourself. Use public pages only; never a page where you are signed in to something important. Write failures as one line in docs/BUGS.md (page type, what you saw).
Load the unpacked `dist/` folder (or unzip release/skinly-ai-0.2.0.zip) on each browser.

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
| 13 | Palette | Assign a key to "Find a link or button" at the browser shortcuts page (no default key: browsers allow only 4), press it, type, Enter, then Enter on the focused link: it opens normally | | | |
| 14 | Blur and screenshot | Pick three elements, Share mode on, Safe screenshot: picked parts unreadable in the PNG | | | |
| 15 | Table tools | Sort and filter a public data table, Restore order, Restore original: page identical | | | |
| 16 | Element theming (rc4) | Open a public article page and a site with many buttons, forms and a data table; Change my page: links (hover, visited), buttons, inputs, selects, textareas, tables (header and zebra rows), code and selection colour all follow the theme; images keep their colours | | | |
| 17 | Legacy portal (rc4) | Open erp.iitkgp.ac.in (or another old table-and-font-tag portal) without signing in: Change my page themes the body, tables and framed parts; Restore returns the exact original | | | |
| 18 | Frames (rc4) | On a page with a same-origin iframe the framed part is themed; a cross-origin embed (video, ad) is untouched; Restore undoes both | | | |
| 19 | Whole-page blur (rc4) | Popup: Blur whole page: the page is blurred, the page still scrolls and links still work, the Unblur button is reachable with Tab and removes it; Restore removes it; Safe screenshot with it on gives a blurred picture | | | |
| 20 | Shortcuts (rc4) | The popup's list matches edge://extensions/shortcuts. Each assigned key shows a 2 s toast: theme applied, restored, blur on/off, palette open. On edge://extensions the badge shows "!" | | | |
| 21 | Pet button (rc4) | Pet on: "Show pet on this page" shows it, Restore removes it; on a page where the theme is rolled back the pet still shows; on a blocked page the one-line message says why | | | |
| 22 | Failure message (rc4) | Force a rollback (a page where the theme cannot apply): the popup gives a plain-words reason, no page text | | | |

## Keyboard-only walkthrough (Phase 11)
Do this once per browser with the mouse put away. Every step needs a visible focus ring; nothing may be cut off at 100 % and at 200 % zoom.
1. Popup: Tab goes to Change my page, Restore original, then the theme cards (arrow keys move between themes), the Pet switch (Space toggles), Pet options, Scene options, "What gets sent" (Enter opens it), the shortcuts list. Shift+Tab goes back in the same order.
2. Press Enter on Change my page. The status line (top) announces each step. If consent appears, Tab reaches Send, Cancel and Show what will be sent; Enter works on each.
3. In the preview, Tab to Keep, Undo, Try another. After Keep, Tab to Remember, Always on this site, Copy theme code, Done.
4. Options: Tab reaches the tab list as one stop; Left and Right arrows (and Home, End) move between the nine tabs; Tab then enters the panel.
5. AI providers: key field, model, Save key, Test key, Remove key are all reachable; Up and Down buttons reorder providers.
6. Privacy: Enter on Erase all Skinly data opens a dialog with focus inside; Tab stays inside it; Escape closes it and focus returns to the button.
7. About: Show the welcome again opens the welcome with focus inside; Skip closes it and focus returns.
8. With the screen reader off, turn on Windows high contrast (forced colors): all text, borders and focus rings stay visible.
