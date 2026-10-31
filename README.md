# Skinly AI (working name)

Make the web page you are on easier on the eyes. Click **Change my page** and Skinly AI restyles it with a calm built-in theme, or, if you added your own AI key, with a theme an AI provider suggests. **Restore original** puts everything back. It works in Chrome, Edge and Brave. It is free and not affiliated with any website.

## What you can do
- **Themes**: six built-in themes (Calm light, Midnight, Ocean, Warm paper, High contrast, Field) and Auto, which follows your browser's light or dark setting.
- **AI suggestions (optional)**: paste your own Gemini or Groq key under Settings, AI providers. After you agree, a small description of the page's layout is sent to that provider. The AI only picks colours and a few layout options; the extension builds the styles itself.
- **Scenes and pets**: original animated art in the empty side space of a page, and a small pet. Neither ever covers page content. Where a page has no free side space, the art uses one small corner strip. The art follows the theme and comes back with it after a reload.
- **My assets**: add your own image or short video as side art. Files stay on this device.
- **Every page of a site**: Change my page asks once for that one site and keeps the theme on every page of it, after reloads and browser restarts, until you choose Restore (which pauses the site; Resume brings it back). Deny the prompt and the theme stays on the current page only. "Why not themed here?" in the popup explains a page that is not themed.
- **Tools**: find-a-link palette, privacy blur, a safe screenshot of what you see, table sort and filter.
- **Shortcuts**: every command and its key are listed under Settings, Shortcuts.
- **Diagnostics**: if art or a theme does not show, the popup's **Why no art?** says why in one line, and **Settings, About, Copy diagnostics** copies a short technical note (no page text, addresses, sites or keys) to paste into a bug report.

## Your privacy in short
- Nothing leaves your browser unless you click **Change my page**, saved a key and accepted the consent text. What is sent is layout only: shapes, sizes and colours. Never text, links, images, forms, addresses or titles. **Show what will be sent** shows it first.
- No analytics, ads or remote code. Accounts are optional and only for Skinly Plus: Skinly's backend then holds your email, plan status and billing references, never page data, addresses, sites or keys.
- Settings, keys, saved sites and your own files live in this browser profile. **Settings, Privacy, Erase all Skinly data** removes all of it.
- It never logs in, fills in, submits or clicks anything for you.

## Free and Plus
Free: Calm light, Midnight, High contrast and Auto, all five pets, the scenes of those themes, readability repair, your own AI key and per-site memory. No account, no network beyond your own AI provider.
Skinly Plus (optional): Ocean, Warm paper and Field with their scenes, and your own pictures and videos as side art. Sign in with an email code in Settings, Plan and account. The price comes from Skinly's server. The code is open, so the gating in the extension is a convenience; the real check is a signed token from the server. Owners: docs/BACKEND_SETUP.md.

## Install for testing
1. `npm ci`, then `npm run build`.
2. Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked** and pick the `dist` folder.
3. The first install opens Settings with a short welcome.

## For developers
`npm run check` (types, lint, tests, build, dist validation, contrast), `npm run release` (zip of `dist/` only), `npm run preview` (writes `private/preview.html` to look at scenes, pets and themes). Rules are in `CLAUDE.md`, contracts in `docs/SPEC.md`, the module map in `docs/ARCHITECTURE.md`, budgets in `docs/PERF.md`, manual checks in `docs/QA.md` and `docs/HUMAN_CHECKS.md`.
