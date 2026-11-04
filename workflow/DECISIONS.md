# DECISIONS

| ID | Decision |
|---|---|
| D1 | The engine is derived from `chroma-shift`, which has no license file. S7.3 adds a `NOTICE.md` acknowledging it; the owner confirms rights before any release. |
| D2 | `chroma-shift` and `darkreader-main` are reference-only. Nothing is ported, copied from Dark Reader (MIT, attribution burden), or edited. |
| D3 | Rename is full, including internal contracts (DOM markers, globals, message type, IIFE names, package). Storage keys are unchanged. Importing legacy `skinly1:` theme codes keeps working; new exports use `repaint1:`. |
| D4 | Restore on a live instance must be exact (mandatory). Restore after the script instance is lost (extension reload) is best-effort via data stored in the element marker. |
| D5 | F1 scope: a theme click applies that built-in theme to the current tab at once, saves the choice, remembers the site (permission asked in the same click if needed), and un-pauses a restored site. The AI flow stays behind "Change my page", unchanged. |
| D6 | AI providers and consent stay. Only the dead `aiRepair` layer is removed. Justification (recorded in DECISIONS): the engine enforces contrast per element through `makeTransform`, and `applier-core` already stubs `repairPayload/applyRepair`, so the repair pass can no longer do anything. |
| D7 | Line endings are left as they are (`autocrlf=true`). No normalisation in this build. |
| D8 | Before S0.1 the owner commits the engine work to a branch (it is untracked today). |
| D9 | "`data-skinly-engine` in both bundles" is dropped as a requirement. Replacement: marker present in `applier.js`, plus a test proving the auto path reaches the engine through the applier. After the rename the marker is `data-repaint-engine`. |
| D10 | Version stays 0.3.0 until the final stage. The release zip name, store docs naming, and the GitHub remote name are owner actions after Stage 6. |
| D11 | A zero-dependency real-browser harness (Node built-ins + raw Chrome DevTools Protocol, Chrome is installed) is allowed as a dev tool outside `npm run check`. It overrides the legacy "NO e2e" rule only for that harness. If the owner rejects it, skip S7.1 and S7.2 (mark `SKIPPED`). |

## Log
