# PHASE 10: scenes, pets, custom assets (art that lives only in free space)

Goal: every theme gets original animated art, there are cute original pets, and users can add their own image or video. All of it lives only in empty space (the side gutters of the page) and never over or under a real element of the site.
Depends on: Phase 9 and its fixes. First run `git branch -a` and `git log --oneline -30` and read docs/PROGRESS.md. Branches fix/pet-motion and feat/scenes may already exist or be merged: reuse what is there, do not redo it, and note it in docs/PROGRESS.md.
Branch: feat/scenes-pets-assets (cut from main). Tag at the end: v0.2.0-rc1.

## Hard rules for this phase (add them to CLAUDE.md, keep it under 60 lines)
- Art never covers a site element: it is drawn only inside measured free gutters, in containers with `overflow:hidden` and `pointer-events:none`. If the page has no free gutter, no scene art is shown and the popup says why in one line. Never touch or move a site element.
- Original art only, built in code with `document.createElementNS`. No innerHTML, no external files, no data: URIs, no network, no audio. No imitation of any existing character, mascot, game, brand or the VS Code Pets art. No real flags, national emblems, army or unit insignia, logos or real vehicle or weapon models.
- Motion: CSS keyframes on transform and opacity only, at most 40 animated nodes in total, paused when the document is hidden, static under prefers-reduced-motion, no requestAnimationFrame unless a pet walks.
- Everything user-supplied (images, video, settings, theme codes) is validated on every read and never reaches the AI, the StructuralSummary or any provider payload. The AI can only choose a built-in sceneId.
- No e2e or browser automation. Human checks use the preview page and a real browser.

## Scope (in order, commit after each step, `npm run check` green before each commit)
1. Free-space module, src/features/freespace: pure `computeGutters(contentRects, viewportWidth, documentWidth)`. Content rects come from visible elements that carry text, links, form controls, images or media (not empty full-width wrappers); our own hosts are skipped; getRect and element lists are injected. Output: left and right gutter `{x,w}` and a state `ok | narrow | none`. A gutter is usable at 120 px or more. Recompute on load, on resize (debounced 200 ms) and after bounded DOM changes (at most once per second).
2. Scene engine, src/features/scenes: one extension-owned shadow-root host on documentElement, position fixed, inset 0, pointer-events none. Inside it one clipped lane container per usable gutter. An actor is `{id, build(): SVGElement, lane, motion, speed, size}`; motions: float, drift, orbit-in-lane, patrol (vertical), cross (diagonal), write (stroke draw and erase), sway, spin, pulse. Actors cannot leave their lane because the lane clips. Density: low, normal, high (changes the actor count, never above the node budget). Lane choice: both, left, right.
3. Art quality bar (review it on the preview page and iterate until it passes): gradient shading, highlights, soft shadows, two-tone outlines, small idle motion, no plain flat circles. Scenes:
   - paper: pen that draws a wavy line while an eraser slides in and removes it, pencil, notepad with a turning page, sticky notes, paper plane, ink drop, coffee cup with steam, paperclip, ruler.
   - space: gas giant with bands and a ring, cratered rocky planet, ice planet (slow orbits in the lane), rocket, satellite with a blinking light, floating astronaut, comet streak, twinkling stars, soft nebula glow.
   - ocean: fish, jellyfish pulsing, bubbles rising, turtle, small submarine, swaying seaweed, light rays.
   - midnight-stars: crescent moon, twinkling stars, shooting star, drifting clouds, fireflies.
   - calm: soft clouds, birds, drifting leaves, sun glow.
   - field (army): olive and khaki camo accents, a generic tank silhouette that rolls up and down a lane with a slowly turning turret, helicopter hovering with a spinning rotor, jeep, radar sweep, parachute supply crate descending, swinging dog tags, compass needle, stylised flat weapon props that never fire (no muzzle flash, no targets, no blood). Put the weapon props behind one constant `ARMY_WEAPON_PROPS` in src/config.ts, default true, so they can be removed in one line before a store submission (store review may be sensitive about weapons; note this in docs/store/ and docs/HUMAN_CHECKS.md).
   - high-contrast: no scene, always.
4. Themes: add a sixth theme `field` (olive, khaki, dark green; passes all contrast checks) and `auto` (follows prefers-color-scheme: calm-light and midnight). Update SPEC (six themes plus auto), the contrast script, goldens and the validator. Each theme has a default scene; the user can switch it or turn it off. Add `sceneId` (enum, default none) to StylePlan, validator, schema and prompt (bump PROMPT_VERSION).
5. Pets, src/features/pet: five original cute pets, each invented here: a fox, a cat, a bunny, a slime blob and a small owl (generic animals, own design). Look: big head, small body, simple eyes with highlights, blush, soft two-tone shading, outline. States: idle bob, blink, walk cycle (legs, ears, tail), sleep with zzz, happy jump on click, wave. Scarf or bow takes the theme accent colour. Settings: kind, size, `keepInFreeSpace` (default on).
6. Pet behaviour: the close button is invisible by default and appears only on hover or keyboard focus; other ways to hide: popup toggle, Escape on the focused pet, command `toggle-pet` (Alt+Shift+P) with the 2 s toast and the real key in the popup list. `motion`: still (default), horizontal (left-to-right, right-to-left, bounce), vertical (top-to-bottom, bottom-to-top, bounce); edge; speed slow, normal, fast; `sleepWhenIdle` (off by default). Position comes from a pure `nextPosition(dt, speed, bounds, direction)` function. While walking, pet and host are pointer-events none. With `keepInFreeSpace` on, walking stays inside the gutters (vertical walking in a gutter, horizontal back-and-forth inside the gutter width); with no gutter the pet stays still in a corner. With it off, the pet may walk along the viewport edge.
7. Custom assets, options page "My assets": upload PNG, JPG, WebP, GIF, MP4 or WebM. No SVG. Check magic bytes, not the extension. Re-encode images through a canvas (max 1920 px, WebP or JPEG 0.85) which also strips metadata. Video: reject over 4 MB or over 15 s, muted, loop, make a poster image at upload. Store as base64 in chrome.storage.local key `assets`, total cap 7 MB, show the free space and a delete button, no unlimitedStorage permission. Choose asset, lane (gutter, default), corner companion, or cover background (behind the page, only if the user picks it), size S/M/L, opacity 10 to 100, speed, and a preset: none, spin, float, orbit, sway, slide, pulse, drift. If the page CSP blocks the file, fall back to the poster on a canvas, then to the built-in scene, and tell the user why in one line. State this limit in the UI: files stay on this device.
8. Per site: the chosen scene, pet and asset are saved in the site record and applied by the auto script. Scene code goes in its own file (`scene.js`) registered for a site only when that site has a saved scene, so the document_start script stays small. Restore removes everything.
9. Extras: "Copy theme code" and "Import theme code" (a compact string of the validated StylePlan, no assets; import always goes through the validator and contrast repair).
10. Dev preview, scripts/preview.ts (dev only, never bundled): writes private/preview.html showing every scene at 3 viewport widths with a fake centred content column so the gutters are visible, every pet in every state, and every theme swatch. The human reviews it in a browser.

## Tests (no e2e)
- freespace: centred column gives two gutters, full-width gives none, a sidebar gives one, narrow vs ok vs none.
- engine: actors stay inside the lane clip, node budget holds at every density, reduced motion gives static output, hidden document pauses, destroy removes the host and everything, pointer-events none, no site element changed (DOM equality), invariants unchanged.
- pet: nextPosition for every mode including bounce, sprite flips, close button hidden by default and shown on hover and focus, Escape and command hide it, pointer-events none while walking, keepInFreeSpace behaviour.
- assets: magic bytes accepted and rejected, SVG rejected, caps, total quota, base64 round trip, poster made, corrupt record ignored, assets absent from the summary and every provider payload (extend the marker test).
- scanner and AUDIT updated for createElementNS and the new CSS; SPEC updated; store privacy text says local files stay on the device.

## Acceptance
1. [auto] `npm run check` green and `npm run release` works.
2. [auto] All tests above pass. Scene code is under 150 KB minified in total.
3. [auto] No innerHTML, network, data: URI or audio in the new modules (scanner).
4. [human] Open private/preview.html: every scene looks good (not flat circles), motion is smooth, pets look cute in every state. Write feedback lines in docs/BUGS.md and use the fix prompt.
5. [human] On Wikipedia, a govt site, Hacker News and a full-width site: art appears only in empty gutters, never over text, links, buttons or images; the full-width site shows no art and the popup says why.
6. [human] Pet: still by default, no visible close button, hover shows it, all walking modes work, reduced motion makes it static.
7. [human] Upload a PNG, a GIF and a short video; try an oversized video and an SVG (rejected with a clear message); Restore removes everything.

## Stop
Stop when items 1 to 3 pass and everything is committed and merged into main with `--no-ff`. Print items 4 to 7. Do not start Phase 11.
