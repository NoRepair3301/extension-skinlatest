# Review (fix/launch-1, v0.2.1-rc1)

Seven passes, run one after another in one session, each with its own checklist (no subagents: CLAUDE.md forbids them, and the task allows passes in sequence). Severity: High (breaks a page, leaks data or loses the user's choice), Medium (wrong behaviour in a real flow), Low (rare, cosmetic or a documented limit). Every High and Medium is fixed with a test; Low items are known.

## Pass 1: correctness and races
| # | Sev | File:line | Finding | Status |
|---|---|---|---|---|
| R1-1 | Medium | src/extension/keeper.ts:56 | Chrome keeps the popup open over the prompt. permissions.onAdded fired, the background injected the built-in theme into the tab while the popup was still running the AI flow on the same tab: a double apply and a flicker, and the page was read while already themed. | Fixed: a click intent is applied by the background only when no popup is open (`popupOpen`, runtime.getContexts, no permission). Test: tests/persistence.test.ts "Chrome: the popup survives the prompt" (no auto files injected). |
| R1-2 | Medium | src/extension/keeper.ts:33 | Stale tab id: if the tab left the site between the click and the background's apply, the auto files were injected into whatever page the tab showed (any origin we hold a permission for). | Fixed: `applyToTab` compares the tab's current origin with the intent's (in memory only) and skips otherwise. Test: tests/persistence.test.ts "a stale tab id". |
| R1-3 | Low | src/extension/sites.ts:158 | `updateSites` serialises writes per context only. The popup (Pause, Forget, blur save) and the background (keep, reconcile) could still interleave a read-modify-write. Needs a user action during a background keep. | Known. |
| R1-4 | Low | src/extension/keeper.ts:56 | Chrome: the user closes the popup during the AI run after allowing. The site is kept with the built-in plan of the click, and the open tab shows whatever the popup had applied. The next page load is themed. | Known. |
| R1-5 | Low | src/extension/intent.ts:94 | `clearIntent(only)` is a read then a remove, so it is not atomic. A newer intent written in between (a second click within milliseconds) could be removed. | Known. |
| R1-6 | Low | src/extension/applier-auto.ts:25 | Each Resume into a live tab adds one more restore hook. This is bounded by user clicks. | Known. |

## Pass 2: security and privacy
| # | Sev | File:line | Finding | Status |
|---|---|---|---|---|
| R2-1 | Low | src/extension/api.ts:90 | runtime.onMessage did not check the sender. Other extensions cannot reach onMessage without externally_connectable, so this is defence in depth. | Fixed: sender.id must be ours. Test: tests/persistence.test.ts "A3 pass 2: messages" (other extension ignored, exact shape only). |
| R2-2 | Low | (browser default) | Content scripts can read storage.local, keys included, in their isolated world. A page cannot. | Known; tests/auto.test.ts "no page script ... can reach the keys, the intent or the keeper" holds that no page script imports them. |
| R2-3 | - | src/extension/intent.ts | The intent holds the origin, tab id, plan and times. It never holds a URL, text or key. It expires in 5 minutes and is parsed strictly (forged or expired intents are ignored). | OK. Tests: tests/persistence.test.ts "expired", "forged". |
| R2-4 | - | src/core/diag.ts | The auto state words are a fixed list, and an unknown word reads as `not-run`. | OK. Test: tests/diag.test.ts "A2". |
| R2-5 | - | scripts/rules.ts | The CSP rules (no style elements, style attributes, innerHTML or parsed markup), the storage key list (`intent` and `schema` added) and the key scan all pass. | OK. |

## Pass 3: page compatibility
| Item | Covered by |
|---|---|
| Print | Fixed (Medium, R3-1): the theme sheet was adopted for all media, so a printed page had the theme's dark background. It is now `new CSSStyleSheet({ media: "screen" })` (src/extension/applier.ts). Test: tests/compat.test.ts "print is untouched". |
| Autofill | Rule: no `autofill` selector in any theme, so the browser keeps its own autofill colours. Test: tests/compat.test.ts. |
| Placeholder, selection, disabled controls, visited links, scrollbars, select options, colour scheme | One rule each in src/plan/compile.ts. Test: tests/compat.test.ts "each have a rule". |
| Focus rings | Kept: a 2 px focus-visible outline, and never `outline: none`. Test: tests/compat.test.ts. |
| Iframes | Left alone: the theme never targets iframe, img, video, canvas, svg or picture (test). Cross-origin frames get no applier (src/extension/frames.ts). |
| Shadow DOM sites | Documented limit: the document sheet does not reach into closed or open shadow roots, so web components keep their own colours. The readability pass only reads the light DOM. |
| Dark-mode sites | Covered by the readability pass (repairs or keeps the site's colours) and the page tone used for text-only plans (tests/guard.test.ts). |
| prefers-color-scheme | The Auto theme follows it (src/themes/index.ts). The sheet sets `color-scheme` so form controls match (test). |

## Pass 4: UX
| # | Sev | Finding | Status |
|---|---|---|---|
| R4-1 | - | Each auto state has one line with a next step (`S.popup.why`). Paused, this page only, resumed and resume failed each have one line too, and all copy is in src/ui/strings.ts. | OK. Tests: tests/diag.test.ts "A2", tests/ui/final-pass.test.ts. |
| R4-2 | Low | "Why no art?" and "Why not themed here?" sit side by side as two quiet buttons. One "Why?" could hold both. | Known (layout choice). |

## Pass 5: performance and leaks
| # | Sev | Finding | Status |
|---|---|---|---|
| R5-1 | - | Navigation listeners are removed on Restore and after a pause. Re-applies are bounded by NAV_REAPPLY_MAX, and a second injection into a live document does nothing. | OK. Tests: tests/auto.test.ts "applier-auto on a single-page app". |
| R5-2 | - | The intent is removed when completed and ignored after 5 minutes. Diagnostics keep the last 20 errors. Sites are capped at 200. | OK. |
| R5-3 | Low | The background keeps one promise chain (`serial`), which is reset by every worker stop. | Known (no growth). |

## Pass 6: accessibility
| # | Sev | Finding | Status |
|---|---|---|---|
| R6-1 | - | Resume is a real button. The why line is a `role="status"` paragraph, and the paused line is plain text in the site section. | OK. Existing popup a11y tests are green. |

## Pass 7: error paths
| # | Sev | Finding | Status |
|---|---|---|---|
| R7-1 | - | Every keeper step catches. A failed keep leaves the intent for the next start until it expires. The popup's handOver, resume and explain steps catch. | OK. |
| R7-2 | - | Offline: the keep flow makes no network call. The provider path was already offline-safe (rc6). | OK. |
| R7-3 | - | Update: reconcile runs on update and fixes registrations. | OK. Test: tests/persistence.test.ts "A1b". |
| R7-4 | Low | Uninstall: the browser removes the registrations, permissions and storage itself. There is no uninstall URL (no telemetry). | Known by design. |
