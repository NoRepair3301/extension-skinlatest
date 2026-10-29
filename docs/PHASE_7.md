# PHASE 7: command palette and keyboard shortcuts

Goal: find and jump to any visible link or control on the current page from the keyboard, and trigger Transform and Restore with shortcuts. The palette never clicks anything for the user.
Depends on: Phase 6 (any earlier phase is fine). Read SPEC 14 decisions 6 and 7.

## Scope (in order, commit after each step)
1. Manifest `commands`: `transform-page`, `restore-page`, `open-palette`, with suggested defaults Alt+Shift+S, Alt+Shift+R, Alt+Shift+K (verify they do not collide in the browser; users can rebind at the browser's extension shortcuts page). Background handles each command through api.ts; invoking a command grants activeTab, so the background injects the applier or palette as needed.
2. src/features/palette/index-items.ts: collect visible `a[href]`, `button`, `[role=button]`, `summary`, `[role=tab]`; label from text, aria-label or title (trimmed to 80 characters); cap 500 items; injectable `isVisible`. Labels stay in memory only.
3. src/features/palette/score.ts: a fuzzy scorer of about 40 lines, no library; stable ordering.
4. src/features/palette/ui.tsx: overlay in a shadow root opened by the command: input with `role="combobox"`, results `role="listbox"`, arrow keys, Enter, Escape. Enter scrolls the chosen element into view, focuses it and shows a temporary outline; the user presses Enter or Space themselves to activate it. Focus is trapped while open and restored to the previous element on close.
5. No persistence: no pins, no recents, no storage writes from the palette module.
6. Popup lists the three commands and links to the browser's shortcut settings page text instruction (no tabs permission).

## Acceptance
1. [auto] `npm run check` green.
2. [auto] Indexer tests: only visible elements, cap respected, long labels trimmed, duplicates handled.
3. [auto] The palette module makes no storage, network or `.click(` calls (scanner plus a spy).
4. [auto] Scorer tests: exact, prefix, subsequence matches rank in that order; ties are stable.
5. [auto] UI tests: arrow keys move selection, Enter focuses the target and does not click it (spy on click), Escape closes, focus is restored, roles and labels present.
6. [auto] Command handler tests with the fake api: each command calls the right action; blocked pages show the message.
7. [human] On three sites (one with hundreds of links) open the palette with the shortcut, find a link by typing, press Enter in the palette, then Enter on the focused link: it opens as normal.
8. [human] Rebind one shortcut in the browser's shortcut settings and confirm it works.

## Stop
Stop when items 1 to 6 pass and everything is committed. Print items 7 and 8. Do not start Phase 8.
