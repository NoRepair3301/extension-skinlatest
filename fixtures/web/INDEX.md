# Fixture index

All files here are SYNTHETIC: hand-built pages with filler text, made so the analyser has varied shapes to test against. Replace them with scrubbed real captures (docs/tools/capture-fixture.md) when you have them.

`<name>.html | page type | rough node count | why it is hard`

article-news.html | article | ~70 | one main, aside with a link list, header nav
link-portal.html | link portal | ~60 | 24 sibling links in a div grid, plus a short list
nested-nav.html | nested navigation | ~90 | menus inside menus, sidebar nav
service-cards.html | service cards | ~60 | card-list with headings and buttons, button group
table-heavy.html | table-heavy | ~600 | 120-row table (big-table risk), a table that must not qualify
form-page.html | form | ~40 | form with select, textarea, button group
login-page.html | public login | ~15 | password input (no-ai gate)
rich-editor.html | contenteditable | ~25 | editable risk marker, toolbar buttons
spa-list.html | SPA list view | ~100 | repeated list items with mixed content
iframe-heavy.html | iframes | ~25 | four iframes (iframes risk)
shadow-widget.html | shadow widget | ~25 | declarative shadow root template
rtl-page.html | right-to-left | ~50 | dir=rtl, nav and list
large-page.html | very large | ~1900 | thousands of nodes, many headings (region cap)
hostile-overlay.html | hostile/ambiguous | ~40 | overlay, divs with no semantics, spacers
dark-aware.html | dark-mode aware | ~40 | color-scheme meta, prefers-color-scheme CSS
legacy-portal-tables.html | legacy portal | ~75 | nested layout tables, bgcolor, background and font attributes, a border/cellpadding data table
legacy-portal-fonts.html | legacy portal | ~45 | font-tag soup, center, inline backgrounds, body background attribute
legacy-portal-frames.html | legacy portal login | ~35 | table-layout sign-in (password and one-time-code inputs), two same-origin iframes
claude-like.html | dark app | ~30 | class-styled buttons with spans, sidebar items, card, contenteditable editor (real-browser breakage)
hero-bg.html | hero image | ~25 | body background image, z-index -1 image, background-image header and tile
light-article.html | light article | ~35 | plain light page, infobox table, link list
