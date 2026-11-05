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
| D12 | Final restore() may write back the original style attribute text only if the element's current inline declarations are semantically identical to it. Refines the friend's "no whole-attribute restore" rule; page-wins preserved. |

## Log
- 2026-11-04 S0.2: gate.mjs runs tools via `process.execPath <bin>` (no shell); vitest JSON goes to os.tmpdir(), never the repo. Output capped at 40 lines unless `--full`.
- 2026-11-04 S1.1: PropRecord fields are plain string (put() always assigns strings, m starts ""); module-private. Dropped unused normalizeCssColor/ColorTransformer imports from dom.ts only.
- 2026-11-04 S1.2 | D6 | aiRepair removed | The engine enforces contrast per element through `makeTransform` (invariant I10), and `applier-core.ts` already stubbed `repairPayload()` and `applyRepair()` (returning nothing), so the AI repair pass could no longer change a page; keeping it would only add a second consent prompt and a provider call with zero effect.
- 2026-11-04 S1.2: `repairConsent` settings field and `ConsentRequest.purpose` removed outright (no schema bump, no migration); `parseSettings` builds from defaults and reads only known keys, so old stored `repairConsent` is ignored and dropped on next save.
- 2026-11-05 S2.1: ElementRecord = { hadStyleAttr, origStyleText, props }; reset() reverts a prop only if current value equals the read-back `m` and priority is important; record-lost markers are stripped without touching styles.
- 2026-11-05 S2.1 (D12): the original text is written through the existing Attr node, not `setAttribute("style", ...)`, because `scripts/rules.ts` flags it as CSP-unsafe; the declarations are re-checked after the write and put back via CSSOM if a strict CSP dropped them; the original text is carried across the refresh's reset/put and never written there.
- 2026-11-05 S2.2: the refresh keeps the element record (reset non-final empties `props` only); carriedText removed. put() re-bases entries whose write is no longer in place, and re-bases `hadStyleAttr`/`origStyleText` to none when the page dropped the attribute (I5).
- 2026-11-05 S2.2: the transition hold is a ledger entry written via put() after the element's reset, only for HTML elements with live engine writes; released next frame through the guarded revert; restore() reverts it with the rest (I2, I7).
- 2026-11-05 S2.2: realm-safe checks via the element's own `ownerDocument.defaultView` (instanceof), applied in refreshBatch/inspectElement/restore so same-origin iframe content is actually themed and restored. Namespace URIs not used: tests/rules.test.ts flags non-allowlisted URLs.
- 2026-11-05 S2.3 (D4): engine sheet signature = empty first rule `html[data-skinly-engine-sheet] {}` (ENGINE_SHEET_SIGNATURE, never matches); cleanup matches it exactly, legacy `data-skinly` first-selector sheets still removed.
- 2026-11-05 S2.3 (D4): marker value = `<written bitmask over ENGINE_PROPS, base36>["-" no style attr]["*" originals dropped]` + `;prop[!]=value` per page-owned original + optional `;=text` (original style text, only when not canonical). Escapes only `% ; = !`. Deviation from the suggested design: a written-props bitmask is stored (never empty value) so a page's own `!important` on a listed prop the engine never wrote is not removed (I3).
- 2026-11-05 S2.3 (D4): cap 1024 chars per marker; over it drop the text first, then the originals (`*` on the element itself, not on the root marker: the root value "on" is used by CSS selectors and the per-element flag is more precise). With `*`, listed engine props still `important` are removed; custom props stay.
- 2026-11-05 S2.3 (D4): markers written once per element per batch, at the end of refreshBatch (dirty set), only when the bitmask, an original, or the no-style bit changed.
- 2026-11-05 S2.3 (D4): a running lost instance (orphaned by extension reload) stands down when its base sheet has been detached by someone else: stops observer/listeners/timers, keeps styles and records. Without it the orphan re-themes what the cleanup restored.
- 2026-11-05 S2.3: ROOT_MARK / ENGINE_MARK constants exported from engine/dom.ts and used by cleanup.ts; UI-host marker names untouched (Stage 6).
