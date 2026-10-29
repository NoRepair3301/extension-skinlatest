# PHASE 6: optional pet companion

Goal: an optional, original pet that lives in an isolated corner overlay, never gets in the way, and costs nothing when off.
Depends on: Phase 5. Rule reminders: no network, no audio, no page text, original assets only.

## Scope (in order, commit after each step)
1. src/features/pet/art.ts: two original pets drawn procedurally. Build SVG with `document.createElementNS` and attributes (no innerHTML, no raster, no external file). Names and looks are your own invention; do not imitate any existing character or the VS Code Pets art.
2. src/features/pet/overlay.ts: one fixed host element with a shadow root. The host has `pointer-events: none`; only the small pet body and its controls have `pointer-events: auto`. High but bounded z-index. Four corner positions, three sizes. A "Hide pet" button reachable by keyboard with an aria-label, and Escape while the pet is focused hides it.
3. src/features/pet/animate.ts: idle, blink, walk in place, small celebration on click. Uses requestAnimationFrame only while the pet is visible and the tab is visible. With `prefers-reduced-motion: reduce` the pet is static.
4. src/features/pet/avoid.ts: a pure function that returns the next free corner when the pet's box overlaps a password input, a submit button, a visible modal close control or a form field in view (checked on scroll and resize, debounced).
5. Settings: `pet:{enabled,kind,size,corner,disabledOrigins}`; off by default; toggles in the popup and options page; a per-site "disable pet here". The pet appears on pages the user transforms or that have a saved auto plan; it never appears on blocked pages.
6. Destroying the pet removes the host, observers and animation frames.

## Acceptance
1. [auto] `npm run check` green.
2. [auto] With the pet disabled no host element, observer or rAF exists (spies). Disabling removes them all.
3. [auto] The host has pointer-events none; the scanner finds no innerHTML or network use in src/features/pet.
4. [auto] Reduced motion gives no rAF loop. Hidden tab pauses animation.
5. [auto] `avoid.ts` unit tests: overlaps with each listed element type move the pet; no overlap keeps it.
6. [auto] Accessibility tests: the hide button is focusable and labelled; Escape hides.
7. [human] Turn the pet on for three sites with very different stylesheets: it looks the same and the site's CSS does not leak in. Click through the page around it: nothing is blocked.
8. [human] Turn on reduced motion in the operating system: the pet is static.

## Stop
Stop when items 1 to 6 pass and everything is committed. Print items 7 and 8. Do not start Phase 7.
