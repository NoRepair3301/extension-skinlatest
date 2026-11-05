# Changelog

## Unreleased
- Removed: all paid tiers, Plus, accounts and the backend.
- Changed: all 6 themes and My assets are available to everyone.
- Changed: restore is exact and per-property (page changes win).
- Changed: stale plan and account data is removed on update.
- Removed: the unused AI repair layer.

## 0.3.0 (rc1)
- Skinly Plus, optional and paid: Ocean, Warm paper and Field themes with their scenes, and My assets. Free keeps Calm light, Midnight, High contrast, Auto, all pets, readability repair, your own AI key and per-site memory, with no account.
- Settings, Plan and account: sign in with an email code (no passwords), see your plan and renewal date, Upgrade, Manage, Refresh purchase, Sign out, Delete account.
- Locked themes carry a small Plus mark. Choosing one opens a calm dialog with the server's price, how to cancel and a plain "Stay on Free".
- A lapsed Plus never breaks a page: a saved Plus theme shows as the nearest free theme, and your files stay on the device, hidden.
- The AI is told only the themes you can use (prompt version 6).
- Backend (Supabase): RLS on every table, a signed 3-day entitlement token with a 7-day offline grace, webhooks that are signature-checked, replay-protected and idempotent, and a test-mode-only billing provider. The backend never receives page data, URLs, sites or keys.
- Scanner: refuses payment, webhook and service keys, JWT-like strings and private keys anywhere in the repo or the build.

## 0.2.1 (rc1)
- The theme stays on every page of a site until Restore. Edge closes the popup when it shows the permission prompt, which used to stop the popup's own saving and registering. The popup now only records what you asked for and asks for the permission. The background finishes the job (saves the site, sets up every page of it and themes the open tab), also after a browser or extension restart.
- Restore pauses the site: the popup shows "Paused on this site" with Resume. Change my page also resumes it.
- "Why not themed here?" in the popup gives one line with the next step. The same word is in Copy diagnostics.
- The theme goes on as the page starts loading, and the readability checks, pet and art follow once the page is parsed. Printing a themed page prints the site's own colours.
- Registrations are checked and repaired on every start and update. Records from 0.2.0 are migrated.
- Review fixes: no double apply when Chrome keeps the popup open, and no theme for a tab that has already left the site.

## 0.2.0 (rc6)
- Art comes back after a reload together with the theme: it follows the stored theme (not a saved scene id), AI themes get art too (calm on a light page, midnight stars on a dark one), and every kept site loads the art script. An update re-registers sites kept by an older version.
- Art and the pet survive strict sites and busy pages: styles only through adopted stylesheets and CSSOM, the host is the last child of the page root at the top of the stacking order and comes back (at most once per second) if a site removes it; a page root with a transform, filter, perspective or contain moves the art onto the body. The art host and the pet no longer push each other around.
- Timing: the corner strip shows at once, and the art moves to the side space once the page has laid out (measured again on load, after 1 s and 3 s, on resize and after page changes).
- Reduced motion keeps the art and the pet on screen, only still.
- Diagnostics: Settings, About, Copy diagnostics (version, theme, strategy, art state, sizes, short error names, last provider result; never page text, addresses, sites or keys) and "Why no art?" in the popup.
- Settings page polish (cards, sticky tabs, empty states, focus rings), an offline notice, every UI text in one strings file, and no uncaught promise errors.

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
