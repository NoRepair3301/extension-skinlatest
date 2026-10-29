# PHASE 5: remember per site and auto-apply on later visits

Goal: after Keep, the plan is saved for that origin; with the user's opt-in it applies automatically on future visits, never calls the AI by itself, and can be forgotten completely.
Depends on: Phase 4.

## Scope (in order, commit after each step)
1. src/extension/sites.ts: SiteRecord storage per SPEC 8. Origin-only keys (reject anything with a path or query), cap 200 with oldest-first eviction, validation on every read (corrupt records ignored), version field and a migration stub.
2. Popup after Keep: "Remember this site" (saves the record with mode "ask") and "Always on this site" (opt-in): requests optional host permission for the active tab's origin only, from the click; then mode "auto" and `scripting.registerContentScripts` with id `skinly-<hash of origin>`, matches `<origin>/*`, runAt document_start, persistAcrossSessions true, script src/extension/applier-auto.ts. Never request any other origin or a wildcard.
3. src/extension/applier-auto.ts: runs at document_start. Reads the record for `location.origin` from storage.local and re-validates the plan (never trust storage). Step A: apply global tokens only. Step B after DOMContentLoaded: analyse, compare the fingerprint with the saved one; if similar (0.8 or more) apply region rules; otherwise keep tokens only and show a small dismissible banner "This page changed. Regenerate?" in an extension-owned shadow root. It never calls a provider. The same invariants, rollback and bounded observer as Phase 2.
4. Badge: `action.setBadgeText("ON")` on tabs where a saved plan is active.
5. Per-site controls in the popup: "Pause on this site" (mode "ask") and "Forget this site" (unregister the script, remove the host permission, delete the record).
6. Options page: list of saved sites (origin, provider, saved date), Forget and Forget all, and a blocklist editor (origins).

## Acceptance
1. [auto] `npm run check` green.
2. [auto] Storage tests: origin-only keys, cap and eviction, corrupt record ignored, migration stub, full URL or query rejected.
3. [auto] applier-auto tests (jsdom): tokens first, regions after fingerprint match; mismatch gives tokens only plus banner and no provider call; an invalid stored plan applies nothing.
4. [auto] Permission tests with a fake api: only the active origin is requested; Forget unregisters the script, removes the permission and deletes the record; no wildcard ever.
5. [auto] A spy on fetch shows zero network calls from the auto path.
6. [human] On two public sites: Keep, then Always on this site. Close the whole browser, reopen, visit the site: it is themed without clicking, with at most a brief flash. Record any visible flash in docs/BUGS.md.
7. [human] Forget this site: the next visit is original, and the extension details page shows no site access for it.
8. [human] On a site where a different page type has a very different layout, confirm the banner appears and nothing breaks.

## Stop
Stop when items 1 to 5 pass and everything is committed. Print items 6 to 8. Do not start Phase 6.
