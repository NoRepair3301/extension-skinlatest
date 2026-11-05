# Permission justifications

Permissions: activeTab, scripting, storage
Optional host permissions: https://*/*, http://*/* (requested one origin at a time)

- activeTab: lets the extension work on the tab the user is looking at, only after they click the toolbar button or press a shortcut. No page is touched before that.
- scripting: injects the extension's own style applier (and, on request, the palette) into that tab. Nothing is injected from a remote source.
- storage: keeps settings, the user's own API keys, remembered themes (keyed by site origin only), a pending permission request for at most 5 minutes, and fixed-word diagnostics in this browser profile (storage.local). Nothing is synced.
- Optional host permissions, why and when:
  - The provider host (generativelanguage.googleapis.com or api.groq.com): requested when the user saves a key for that provider, so the extension can send the layout description to the provider they picked.
  - The visited site's origin (that origin only: scheme, host and port): requested when the user clicks "Change my page", so the chosen theme stays on every page of that one site until Restore. If the user says no, the theme stays on the current page only. "Forget this site" removes it, and Restore pauses the site without removing it.
- Commands (keyboard shortcuts) is a manifest key, not a permission.

Not requested: tabs, cookies, history, webRequest, downloads, notifications, static host permissions, content scripts in the manifest.
