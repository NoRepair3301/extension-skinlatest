# Changelog

## 0.2.0 (rc5)
- A theme is always applied. Text that would be hard to read is repaired with colour-only rules or keeps the site's own colours; text over pictures and gradients keeps its original colours. Optionally, after a separate agreement per site, the AI can suggest colours for the parts that needed repair.
- One browser prompt: Change my page asks for the site first and keeps the theme for every page of it (also after in-page navigation). Restore always works and pauses the site until you apply again.
- Art follows the theme (no scene picker); on full-width pages one small corner strip is used. Fixed: art and pet disappeared on auto-themed pages.
- Theme code copy and import removed.
- Calmer popup: success line with the number of readability fixes, three progress stages, neutral banners, accordions, live theme previews.

## 0.2.0 (rc4 fixes from real-browser testing)
- Themes no longer break apps: a strategy ladder (full, safe, text-only), low-specificity CSS that lets a site's own classes win, page background on the root only, no background shorthand, nothing for media, every background paired with a text colour.
- Visual guard: after applying, the page's text, typing fields and pictures are checked; on a failure the theme steps down once and re-checks, then rolls back with a one-line reason.
- "Keep on this site" (one button) themes every page of a site, also after in-page navigation.
- Popup: exact scene-art state, Motion and Speed for the pet, "Use my picture on this page", wrapping theme cards, theme code box with format hint, scene and pet thumbnails.
- A rate limit with a long wait moves to the next provider or says how long to wait.

## 0.2.0
- Scenes: original animated art for every theme, drawn only in measured empty side space, never over page content. Six scenes plus a Field theme and Auto.
- Pets: five original pets (fox, cat, bunny, slime, owl), still by default, optional walking inside free space, hidden close button, `toggle-pet` shortcut.
- My assets: add your own PNG, JPG, WebP, GIF, MP4 or WebM; checked, re-encoded and stored on this device only.
- Per-site look: scene, pet and asset are saved with the site.
- Copy and import a theme code (colours and scene only, always validated).
- New design system and popup: status line, one clear primary action, theme cards with previews, quick toggles.
- Settings in nine tabs, Shortcuts with the real keys, Erase all Skinly data, first-run welcome.
- Error boundary with Restore this page, performance budgets enforced by the build, accessibility tests.

## 0.1.0
- First release candidate: built-in themes, optional AI suggestions with your own key, per-site memory, palette, blur, safe screenshot and table tools.
