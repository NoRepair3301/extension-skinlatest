# Capturing fixtures (you do this before Phase 1)

A fixture is a saved copy of a real page's structure with the text, links and values scrubbed out. Phase 1 and later phases test against these files instead of the live web, so you need about 12 to 15 of them, as different from each other as you can find.

## Safety rules
- Public pages only. No page that needs a login. No page showing your name, email, balances or messages.
- Raw captures go in `private/raw/` (gitignored). Only scrubbed output goes in `fixtures/web/`.
- Never paste raw captures into a chat.
- Put anything personal you can think of (your name, email, phone, roll number, city) one per line in `private/terms.txt`. The audit searches fixtures and history for these.

## Page types to capture
Pick one real public page for each:
1. Simple article or blog post
2. Link portal (a page that is mostly a grid or list of links)
3. Nested navigation (mega menu or sidebar with sub-menus)
4. Service cards (cards with a title, a short line and a button)
5. Table-heavy page (several data tables, one with 100 or more rows if you can)
6. Form page (a public contact or search form, never submitted)
7. Public login page (do not log in, just save the page)
8. Rich editor page (contenteditable)
9. Single-page-app list view (items loaded by script)
10. Iframe-heavy page
11. Page with a shadow-root widget (many video or chat widgets have one)
12. Right-to-left language page
13. Very large page (thousands of nodes, to test the cap)
14. Hostile or ambiguous page (ads, overlays, odd layouts)
15. A dark-mode-aware page

## How to capture one page
1. Open the page in Edge or Chrome and let it fully load. Scroll to the bottom so lazy parts load.
2. Press F12, go to the Elements tab, right-click the `<html>` line, then Copy, then Copy outerHTML.
3. Paste into a new file `private/raw/<name>.html` (for example `article-news.html`). Use a short lowercase name with hyphens.
4. Repeat for each page type.

If a page builds itself inside an iframe or shadow root, copy the outerHTML of the outer page only. That is enough: the point is the shape, and the fixture should include that difficulty.

## Scrub
From the project folder:
```
npm run scrub
```
This reads `private/raw/*.html` and writes `fixtures/web/<name>.html` with text replaced by filler, links replaced by `#`, and values emptied. Open two or three outputs in the browser and check they contain no names, emails or numbers you recognise. If a scrubbed file still holds something personal, delete it and tell Claude Code to improve the scrub tool with a test for that case.

## Index
Create or update `fixtures/web/INDEX.md` with one line per file: `<name>.html | page type | rough node count | why it is hard`. Claude Code can write this for you after Phase 1 starts, but the list of page types is yours.

## Keep it clean
- Fixtures are test data. They are excluded from the release zip.
- Do not commit anything from `private/`.
- If you later publish the repo, keep it private or double-check each fixture first.
