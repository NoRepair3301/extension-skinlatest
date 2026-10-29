# Permission justifications

Permissions: activeTab, scripting, storage
Optional host permissions: https://*/*, http://*/* (requested one origin at a time)

- activeTab: lets the extension work on the tab the user is looking at, only after they click the toolbar button or press a shortcut. No page is touched before that.
- scripting: injects the extension's own style applier (and, on request, the palette) into that tab. Nothing is injected from a remote source.
- storage: keeps settings, the user's own API keys, and remembered themes (keyed by site origin only) in this browser profile (storage.local). Nothing is synced.
- Optional host permissions, why and when:
  - The provider host (generativelanguage.googleapis.com or api.groq.com): requested when the user saves a key for that provider, so the extension can send the layout description to the provider they picked.
  - The visited site's origin: requested only when the user presses "Always on this site", so the extension can theme that one site automatically on later visits. "Forget this site" removes it.
- Commands (keyboard shortcuts) is a manifest key, not a permission.

Not requested: tabs, cookies, history, webRequest, downloads, notifications, static host permissions, content scripts in the manifest.
