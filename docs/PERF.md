# Performance budgets

Enforced by `npm run validate-dist` (part of `npm run check`); the numbers live in `scripts/validate-dist.ts` (`BUDGETS`) and `tests/budgets.test.ts`.

| Bundle | Budget | Measured at 0.2.0 (2026-10-30) |
| --- | --- | --- |
| Popup (popup.js plus shared chunks, gzip, an upper bound because options shares them) | 60 KB | about 23 KB |
| Applier (applier.js, gzip) | 50 KB | about 23 KB |
| Auto script (applier-auto.js, gzip) | 20 KB | about 5 KB |
| Scene script (scene.js, minified) | 150 KB | about 67 KB |
| Source maps | none | none |

The auto script is registered per site as `applier.js`, `applier-auto.js` and, only for a site with saved art, `scene.js` (same isolated world, document_start). Keeping the applier in its own file is what keeps the auto glue small.

## Idle behaviour (checked in code and unit tests)
- Scene: lanes are `pointer-events:none`; every animation is a CSS keyframe on transform or opacity; the root gets `.paused` while the document is hidden and `.still` under `prefers-reduced-motion`. No timers, no requestAnimationFrame.
- Pet: still by default (no timer, no frame). Blink, wave and sleep use single timeouts that skip work when the document is hidden or reduced motion is on. A requestAnimationFrame is pending only while a pet walks.
- Custom assets: a video is muted and looped; the poster is used when the page's CSP blocks the file.
- Popup: first paint needs only settings from storage; nothing blocks on the network or on the page.

## Human measurement (record the numbers here)
1. Open a heavy page (a long news article or a large documentation page), turn on the Space scene with density High and a pet that walks, wait 10 seconds.
2. Browser Task Manager (Shift+Esc in Chrome and Edge): read the tab's CPU and memory for one minute with the tab visible and again with the tab in the background. Expect CPU near 0 % in the background and low single digits visible.
3. DevTools, Performance: record 5 seconds. Expect no long tasks from Skinly code, animation frames only on compositor properties (transform, opacity) and no layout thrash.
4. Repeat with `prefers-reduced-motion` on (DevTools, Rendering): the scene is a still picture, CPU about 0 %.

| Date | Browser | Page | Scene and pet | Visible CPU | Background CPU | Memory |
| --- | --- | --- | --- | --- | --- | --- |
| (to fill in by a human) | | | | | | |
