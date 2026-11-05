# F1 design: clicking a theme applies it (S5.1, design only)

Scope: D5 / F1 (`specs.md` §3, §5). A click on any of the 6 built-in themes or Auto applies that theme to the current tab at once, saves the choice, remembers the site (asking for this origin's permission inside the same click when needed) and un-pauses a restored site. "Change my page" (AI) stays as it is. Nothing under `src/` or `tests/` was changed in S5.1.

Conventions: `file:line` refers to the tree at HEAD `cac00eb`. `[INFERRED]` = not verified in code or tests (browser behaviour, or a conclusion drawn from reading only). "Popup" = `src/extension/popup/Popup.tsx`.

---

## 1. Current behaviour map

### 1.1 Flows today

| Flow | What happens (file:line) |
|---|---|
| Theme radio | `onChange={() => pickTheme(t.id)}` (Popup.tsx:494, Auto at :508). `pickTheme` only sets state and `saveSettings({ ...settings, theme })` (Popup.tsx:196-200). Nothing is injected, applied, asked or remembered. Clicking the radio that is already checked fires no `change`, so it does nothing at all. The radio and `.on` class show the global `settings.theme` (Popup.tsx:493-494, 507-508). |
| "Change my page" | `start()` (Popup.tsx:228-283). First statement: `await handOver(here, "click", clickKept(settings))` (:231), unless the origin was refused before (`deniedHere`, :77, :231). `handOver` writes the pending intent without awaiting it, then calls `requestOrigins` as its first awaited call (Popup.tsx:221-226, :202-208; api.ts:87). Eligibility for the prompt is checked on the origin only (`checkUrl(`${site.origin}/`)`, Popup.tsx:229). Then `runTransform` (flow.ts:45-61) → `transform` applies `resolveTheme(settings.theme)` as the baseline (pipeline.ts:102, :109) through `createPageClient(tabId).applyTheme` = `ensureApplier(tabId, true)` + `runInPage(tabId, "applyTheme", id, true)` (flow.ts:23-26, inject.ts:7-15, api.ts:208-222), then may analyse, ask consent, call AI and show a preview. On grant the popup writes a `final` intent (`commitKeep`, Popup.tsx:265, :375-385); on refusal it shows `keepDenied`/`thisPageOnly` and offers "Keep on this site" (Popup.tsx:269, :388-400). Art and pet follow (Popup.tsx:271-275). |
| Background keeper | `completeIntent` (keeper.ts:63-89), serialised (keeper.ts:21-26), triggered by `permissions.onAdded` (background.ts:48-50), by the intent write when already granted (background.ts:56-58) and on worker start (background.ts:29-37). `keep()` saves `record(kept, "auto", previous)` (keeper.ts:51-52; siteActions.ts:36-48: new record, `paused` never copied), `ensureRegistered` (siteActions.ts:92-104), applies to the tab only when the popup is not the one theming (`popupThemes`, keeper.ts:56), sets badge ON (:58). `applyToTab` skips a tab whose page is already themed with anything (`isActive` → return, keeper.ts:37-38), else injects `AUTO_FILES` (keeper.ts:39; siteActions.ts:21). |
| Restore | Popup `restore()` (Popup.tsx:305-327): `ensureApplier(tab, true)` then `runInPage(tab, "restore", undefined, true)` in all frames, badge "", and if the site is auto-on `pauseSite` (Popup.tsx:315; siteActions.ts:166-173: `paused: true` + unregister, permission kept). Page side: `restore(true)` (applier-core.ts:56-75) restores the live engine exactly (dom.ts:1251-1277), or with no live engine runs `markerCleanup` (applier-core.ts:68-70; cleanup.ts:23-37), then the restore hooks (pet, tools, auto-live flag, banner: applier.ts:49, :87; applier-auto.ts:26-28; auto-core.ts:62, :102-106). Shortcut restore (commands.ts:43-50) restores but does **not** pause the site. |
| Resume | `handOver(..., "resume")` (Popup.tsx:403-409) → keeper `resumeSite` (keeper.ts:47-48; siteActions.ts:176-182). |
| Auto-apply (page load) | Registered per origin at `document_start` (api.ts:110-113). `applier-auto.ts:24-30` → `runAuto` (auto-core.ts:73-187): reads the record, stops if not auto-on (:92-95), `applyTokens(site.plan)` at once (:111), full `apply` at DOMContentLoaded (:122-147, :151-160), re-reads the record and re-applies on same-document navigation (:163-183). |
| Shortcut Alt+Shift+S | `applyTheme(settings.theme)` in all frames, badge ON, pet, toast (commands.ts:82-91; background.ts:19). No site memory, no un-pause. |
| Theme application in the page | `applyTheme(id)` resolves "auto" with the page's `matchMedia` and calls `run(themeToPlan(resolved))` (applier-core.ts:148-153). `run()` starts with `restore(false)` (applier-core.ts:78): restores a live engine exactly, but **without** marker cleanup when there is none (the `!hadEngine && withHooks` gate, applier-core.ts:68). Any failure calls `restore(false)` again (:111, :122, :137), so a failed re-theme leaves the page **unthemed**, not on the old theme. |

Note: the prompt points at "the line near 93" of applier-core.ts. In the current file the gate is at applier-core.ts:68-70 and the call at :78.

### 1.2 States a tab / site can be in

| State | How it is recognised (no new storage) | What a theme click must do |
|---|---|---|
| Never themed | no applier, or `isActive` false (applier-core.ts:159); no record | inject, apply, ask, remember |
| Themed (this tab only) | `isActive` true; no record, or no permission | swap theme, ask (unless refused this session), remember |
| Themed + remembered | record with `mode: "auto"`, not paused (`isAutoOn`, sites.ts:143) + permission + registration | swap theme, overwrite record (no prompt) |
| Restored / paused | record `paused: true` (sites.ts:46-47); page restored | apply, overwrite record → un-paused, re-register (no prompt: pause keeps the permission, siteActions.ts:162-164) |
| Ineligible | `site` undefined because `siteKey` accepts http(s) only (origin.ts:16-29), or `checkUrl(tab.url)` refuses: internal schemes, any non-http(s) scheme **including file://**, store pages, `.pdf` paths, blocklist (eligibility.ts:18-43) | save the choice only; blocked message |
| Permission missing | `hasOrigins(matchFor(origin))` false (Popup.tsx:47-53) | apply via activeTab, prompt in the click |
| Applier not injected | `runInPage` returns undefined | `ensureApplier` first (inject.ts:7-15) |
| Injection refused (PDF viewer without `.pdf`, other refused pages) [INFERRED] | `executeScript` throws, no applier answers | error message, page untouched |
| Fresh instance with leftovers | `slot.skinlyApplier` new in this world (applier.ts:81) but the document carries another instance's engine marks and sheet (extension reloaded while the tab stayed open) | engine cleanup before applying (§4.2) |

file:// is always ineligible here (eligibility.ts:26), whatever the "Allow access to file URLs" switch says.

---

## 2. Target behaviour, event by event

### 2.0 The one click handler (all events use it)

Radios get `onClick` (not `onChange`) so a click on the already-checked radio still runs (Restore leaves it checked). Keyboard selection with the arrow keys also fires `click` on the newly checked radio [INFERRED: Chrome fires a click activation for arrow-key radio selection], so a keyboard user gets the same behaviour.

`applyChoice(choice: ThemeChoice)`. **Synchronous part, inside the gesture, in this order, no `await` before step 4:**

1. `seq = ++clickSeq.current`; `setSelected(choice)`; `setThemeBusy(choice)`; clear `notice`, `keepable`, error/idle note, `applied`.
2. `resolved = resolveTheme(choice, prefersDark())` (themes/index.ts:37; Popup.tsx:164). `kept = clickKept({ ...settings, theme: choice })` (Popup.tsx:211-214: built-in plan of `resolved`, `NO_LAYOUT`, provider/model `builtin`, look).
3. Eligibility from state that is already loaded: `here = site && tabUrl.current && checkUrl(tabUrl.current, settings.blocklist).allowed ? site : undefined` (full URL, so `.pdf` paths do not prompt; `refreshSite` must keep `tabUrl.current = tab.url` in memory, never stored, H11).
4. If `here` and `deniedHere.current !== here.origin`:
   - if a permission request for this origin is already pending in this popup: `void writeIntent(makeIntent(...kept...))` only, and reuse the pending promise;
   - else `grantP = handOver(here, "click", kept)` (Popup.tsx:221-226: writes the intent without awaiting, then calls `requestOrigins` synchronously). This call is the gesture-bound one.
5. `void saveSettings({ ...settings, theme: choice })` (settings.ts:173-175).
6. Queue the page work: `pageQueue = pageQueue.then(() => applyLatest(seq, here?.tabId ?? site.tabId, resolved))`. Nothing in the page needs the gesture (activeTab, §3).

**Asynchronous part:**

- `applyLatest`: if `seq !== clickSeq.current` return (a newer click owns the page). `r = await createPageClient(tabId).applyTheme(resolved)` (flow.ts:23-26). If still the latest: on `r?.ok` set badge "ON", `setApplied`, `showArt(tabId, settings, sourceForTheme(choice, prefersDark()))` (Popup.tsx:167-171; sceneConfig.ts:57), `showPetHere()` (petActions.ts:24); otherwise `setView({ state: "error", message: applyFailureMessage(r) })` (ai/messages.ts:54). Clear `themeBusy` when the latest click's apply settles.
- `grant = await grantP` (independent of the page work). `true` → optimistic `setSite(keptRecord(kept, record))` (Popup.tsx:624-626), `grantedAtOpen.current = origin`. `false` → `deniedHere.current = origin`, `setNotice(S.popup.keepDenied)` (first refusal) and `setKeepable({ tabId, origin, kept })` so "Keep on this site" (Popup.tsx:388-400, :577-582) can ask again. The intent stays in storage as today, so a reopened popup within the 5-minute TTL (intent.ts:14) shows `thisPageOnly` and does not ask again (Popup.tsx:104-117).

The page is themed **in parallel with** the permission prompt (Chrome shows the theme behind the prompt). This follows F1 "denial falls back to this tab only" (specs.md §5). If the owner answers O1 the other way, step 6 moves after `await grantP` and runs only on `true`.

### 2.1 Events

| # | Event | Calls (gesture-bound marked G) | Stored | Page ends as | Popup shows |
|---|---|---|---|---|---|
| E1 | Click theme B on an eligible tab, permission granted (themed or not) | writeIntent; `requestOrigins` G (resolves true, no prompt); saveSettings; ensureApplier + applyTheme(B) all frames. Background: onStorageChanged → `completeIntent("changed")` → save record, `ensureRegistered` (no-op if present), badge ON. `popupApplies: true` when granted at open (Popup.tsx:221), so the keeper does not apply. | `settings.theme = B`; record `{plan: B, provider builtin, mode auto}`, no `paused` | B | busy line, then success line; site line "Automatic on this site (built-in theme)" (Popup.tsx:585) |
| E2 | Click the same theme again | same as E1 (onClick fires on a checked radio) | same values, new `savedAt` | B (restore + apply in one page task: no visible change) | same as E1 |
| E3 | Click a different theme C on a page showing B | same as E1 with C; the page swaps through the live instance (§4.1) | `settings.theme = C`; record replaced by C | C, no stacking | as E1 |
| E4 | Click Auto | same as E1 with `choice = "auto"`, `resolved` = calm-light or midnight by `prefersDark()` | `settings.theme = "auto"`; record stores the **resolved** theme (schema has no "auto" plan id: plan/schema.ts:3, :130; O2) | the resolved theme | Auto checked |
| E5 | Click a theme on a restored/paused site | as E1; permission is still granted (pause keeps it), so no prompt. Keeper `record()` drops `paused`, `ensureRegistered` re-registers (pauseSite removed it, siteActions.ts:171) | record un-paused, `mode: auto` | the clicked theme | site line no longer "Paused"; Resume button gone |
| E6 | Click a theme on a site without permission (not refused this session) | writeIntent, `requestOrigins` G → prompt; saveSettings; page work via activeTab at once. Allow → `onAdded` → keeper saves + registers; Chrome keeps the popup open so `popupThemes` is true (keeper.ts:56). Deny → nothing in the background. | allow: record + registration; deny: settings only, intent left (TTL 5 min) | the clicked theme (both answers) | allow: site line; deny: `keepDenied` notice + "Keep on this site" |
| E6b | Same, origin already refused in this popup (or reopened popup found the intent refused) | no intent, no request; saveSettings; page work | settings only | clicked theme on this tab | `thisPageOnly` notice + Keep on this site |
| E6c | Same on Edge (popup closes when the prompt shows) | sync part as E6; the popup dies after dispatching its first `executeScript` [INFERRED]. Allow → keeper: `popupOpen()` false → `applyToTab` (keeper.ts:56-57) with the theme-aware check (§5.3) | record + registration | kept theme (keeper applies it if the popup's apply did not land) | (popup closed) |
| E7 | Click on an ineligible page | saveSettings only; no intent, no request, no injection | `settings.theme` | untouched | `MSG.blocked` in the status line (existing string) |
| E8 | Rapid clicks B, C, D | each click runs the sync part. One permission request per origin per pending prompt; later clicks only rewrite the intent. Page work is serialised; `applyLatest` skips stale clicks, so at most the first and the last are applied | settings D (writes in order [INFERRED: storage.local.set from one context applies in call order]); intent D; keeper reads the **current** intent (keeper.ts:65) and `clearIntent` removes only the one it completed (intent.ts:93-99) → record D | D | D checked; busy until D's apply settles |
| E9 | Popup closes mid-apply | Whatever reached the page stays: `run()` is synchronous in the page, so the page shows the old or the new theme, never a half-restored state. Intent written before → keeper completes on grant / on the write. If not granted and not answered: nothing persists | settings (dispatched before close [INFERRED]) | old or new theme | (closed); on reopen: `thisPageOnly` if the intent is still pending without permission |
| E10 | Click while "Change my page" is working or asking consent | radios are disabled (`busy`, Popup.tsx:449) | nothing | AI flow continues | unchanged |
| E11 | Click while an AI preview is shown | as E1/E3; the AI preview is replaced by the built-in theme; `view` → idle | record replaced by the built-in theme (O3) | clicked theme | preview section gone |

Badge: the popup sets "ON" after a successful apply (like commands.ts:84); the keeper sets it too after keeping (keeper.ts:58). Restore clears it (Popup.tsx:312).

---

## 3. Gesture and permission handling

- Chrome and Edge require `chrome.permissions.request` to be called while the click is being handled. Every `await` before it loses the gesture [INFERRED: browser rule, already relied on by `handOver` and pinned by popup.test.ts:251-269 and persistence.test.ts:117]. Synchronous calls before it (`setState`, `void writeIntent`, `void saveSettings`) are fine.
- Order in the handler: intent write (not awaited) → `requestOrigins` (G) → settings write (not awaited) → page work queued. The first two match "Change my page", so `persistence.test.ts` can assert the same log prefix `["storage.set intent", "permissions.request <origin>/*"]` (persistence.test.ts:117).
- `matchFor(origin)` asks for exactly `<origin>/*` (siteActions.ts:30-33, origin.ts:28). No new permission: manifest already has `activeTab`, `scripting`, `storage` and optional `https://*/*`, `http://*/*` (manifest.json:8-9).
- **Injection uses activeTab.** Opening the popup grants activeTab for the tab; `executeScript` works on it without host permission (fakeChrome.ts:185 models this). So the page is themed whatever the permission answer. activeTab is revoked when the tab navigates [INFERRED]; after that, without host permission, the apply fails with the "browser didn't allow it" message.
- **Host permission is only for memory**: registration of the auto files for later page loads (api.ts:110-113) and the keeper's `applyToTab`.
- **When the prompt is skipped:** already granted → `requestOrigins` resolves `true` without UI; the implementer may skip the call when `grantedAtOpen.current === origin` and write the intent with `popupApplies: true` (identical effect). Refused in this popup session or found refused on reopen (`deniedHere`) → no request, no intent: this tab only. "Keep on this site" asks again (Popup.tsx:388-400).
- **Pending request:** a second click while the prompt is open must not call `requestOrigins` again (a second concurrent request may reject [INFERRED], which `askPermission` would read as a refusal, Popup.tsx:202-208). Keep the pending promise in a ref per origin; later clicks only rewrite the intent.
- **On deny:** page keeps the clicked theme (this tab only, F1); no record, no registration; intent left until TTL; `keepDenied` notice + Keep on this site. Other open tabs of the site are untouched.
- **Ordering with the keeper:** grant → `onAdded` → keeper reads the latest intent and saves it. The popup does not wait for the keeper; it updates `site` optimistically (as Popup.tsx:268 does today). If the keeper fails, the next popup open shows the real record.

---

## 4. Re-theme without stacking

### 4.1 Live instance (normal case)

Every call to `applyTheme`/`apply`/`applyTokens` goes through `run()` (applier-core.ts:77-140), which starts with `restore(false)` (:78):

1. `activeEngine.restore()` (dom.ts:1251-1277): stops observer, timers, rAF, listeners (`stop`, dom.ts:1223-1249, I7); reverts every ledger entry whose current value still equals `m` (I4), leaves page-changed props with the page's value (I5), removes an empty `style` attribute that was not there before (I6), writes back original text only when semantically identical (D12, I11); removes element markers, the base sheet and `ROOT_MARK`.
2. Region tags are put back (applier-core.ts:62-66).
3. Restore hooks are **not** run (`withHooks = false`): pet, blur/table tools, the banner, auto-core's navigation listener and `skinlyAutoLive` survive a swap. A swap is not a Restore.
4. A new engine is created on the restored document (applier-core.ts:98-104): `detectNative` reads the page's own background (dom.ts:431), the ledger records page-owned originals.

All of 1-4 run in one page task, so no frame is painted between the old and the new theme. On very large pages the engine time-slices after the first synchronous batch (dom.ts:1201), so the rest of the page turns over in the next batches; the old theme is already fully gone [INFERRED from code; check visually].

**Page-owned originals after the swap:** exactly what an apply of the new theme on an untouched page would record, except properties the page itself changed while the old theme was on, which keep the page's latest value (I5). After a later Restore the page is byte-identical to the original when the page changed nothing (D12).

**Same-origin frames:** `runInPage(..., true)` (api.ts:208-222) calls `applyTheme` in the top frame and in every same-origin frame applier (applier.ts:91-93, tokens only); each swaps its own engine the same way. Cross-origin frames get nothing (frames.ts:4-15). See R3 for a possible double-theming of same-origin iframes.

### 4.2 Fresh instance with leftovers (the S2.3 gap)

When it happens: this world's `skinlyApplier` is new (applier.ts:81) but the document still carries another instance's writes. In normal use that is an extension reload or update while the tab stays open (the old instance is orphaned but still in the page).

Today: `run()` → `restore(false)` → no `activeEngine`, and `markerCleanup` is gated on `withHooks` (applier-core.ts:68), so nothing is cleaned. The new engine then (a) detects the native look from the old theme's background (dom.ts:431), (b) reads the old theme's inline colours as page originals and transforms them again (stacking), and (c) on Restore puts the old theme's colours back instead of the page's. The engine-level test that proves cleanup-then-apply works exists (marker.test.ts:287-305); the applier never calls it.

**Fix (S5.2):**

- `cleanup.ts`: split out `engineCleanup(doc)`: our adopted sheets (engine signature and legacy `data-skinly` first selector, cleanup.ts:12-21, :25-29), `undoEngineMarks(doc)` (dom.ts:359-365, walks open shadow roots and same-origin iframes), and removal of `ROOT_MARK`, `ENGINE_MARK` and `data-skinly-r`. `markerCleanup` keeps its behaviour by calling `engineCleanup` and then its UI-host and tool sweep (cleanup.ts:32-36).
- `applier-core.ts run()`: capture `const fresh = activeEngine === undefined` **before** `restore(false)` (:78); right after it and before `snapshot(doc)` (:80), `if (fresh && hasLeftovers(doc)) engineCleanup(doc)`. `hasLeftovers` = root has `ROOT_MARK` or one of our sheets is adopted (cheap; avoids a full DOM walk on every first apply and after a live Restore, which leaves neither).
- Why not the full `markerCleanup`: it removes UI hosts (`[data-skinly-ui],[data-skinly-scene]`, cleanup.ts:32) and tool attributes that can belong to live scripts of this world (the pet controller of this applier, scene.js, blur tools). Removing them under a live controller desyncs it. They are still removed by Restore.
- The orphan stops reacting once its sheet is detached (`standDownIfCleaned`, dom.ts:1217-1221), so it does not re-theme what the cleanup gave back.
- Invariants: the cleanup runs before `snapshot(doc)`, so `compare(before, after)` (applier-core.ts:80, :120) still sees only the new engine's changes. After the cleanup the page-owned originals are the ones the orphan recorded in its markers (best effort, D4); the new ledger is built on them, so a later live Restore is exact relative to that state.

---

## 5. Persistence

### 5.1 What a click writes, in order

1. `intent` (storage key `intent`, intent.ts:13): stage `click`, the built-in plan of the resolved theme, `popupApplies` when granted at open. Skipped when ineligible or refused.
2. `settings.theme = choice` (settings.ts:52, :173-175).
3. Background, only when the origin is granted: `sites[origin] = record(kept, "auto", previous)` (siteActions.ts:36-48: keeps `blur`, `blurImages`, `look` from the kept plan or the previous record; never copies `paused`), then `ensureRegistered(origin)`, then the tab apply when the popup is gone, then badge, then `clearIntent(intent)`.

No new key, no new field, no schema bump. `STORAGE_VERSION` stays 3 (sites.ts:16).

### 5.2 Failure in the middle

| Fails | Leaves | Recovery |
|---|---|---|
| intent write | no memory; page themed this tab only; popup believes "granted" optimistically | next popup open shows no record; next click retries |
| settings write | global default stays old (`recordErrors(["popup-error"])` as Popup.tsx:199) | next click |
| `saveSite` | keeper returns `error`, intent cleared (keeper.ts:52, :86) | next click |
| `ensureRegistered` after `saveSite` | record auto-on but no registration; "Why not themed here?" says `not-registered` (Popup.tsx:433) | `reconcile` on the next worker start registers it (siteActions.ts:117-150) |
| page apply (`ok: false`) | record already holds the new theme; page **unthemed** (run() restores on failure, applier-core.ts:111/122/137) | error message; next load tries the record again |

### 5.3 Keeper and the next page load

- Registration is per origin with `AUTO_FILES` at `document_start` (siteActions.ts:21, :92-104). The next load runs `runAuto` with the new record (auto-core.ts:83-120).
- On an open tab where auto is already live (`skinlyAutoLive`, applier-auto.ts:24), the swap keeps auto-core's navigation re-apply running, and it re-reads the record on every same-document navigation (auto-core.ts:170-180). So the record must hold the clicked theme, which it does once the keeper ran. Between the click and the keeper (milliseconds) a navigation could re-apply the old record theme; the keeper's write then wins on the next navigation [INFERRED, low].
- **Keeper change (S5.2), `applyToTab(tabId, origin, plan)`:** today any themed page is skipped (keeper.ts:37-38), so on Edge a page showing theme A stays A after the user picked B and allowed. New rule: ask the page what it shows (`runInPage(tabId, "shownTheme")`, a one-word widening of `PageMethod`, api.ts:196; the method exists, applier-core.ts:160). If it equals `plan.themeId`, skip. If another theme is live, `runInPage(tabId, "apply", plan, true)`. If none, inject `AUTO_FILES` as today. The `popupThemes` rule (keeper.ts:56) is unchanged, so the Chrome popup-alive path and the AI flow never get a second apply.

### 5.4 "Auto"

- Global: `settings.theme = "auto"` (THEME_CHOICES, themes/index.ts:32). Unremembered pages, the shortcut (commands.ts:82) and "Change my page" (pipeline.ts:102) resolve it at apply time.
- Site record: the plan stores the **resolved** theme (calm-light or midnight at click time), because `StylePlan.themeId` cannot be "auto" (plan/schema.ts:3, :130) and applier-core falls back to calm-light for a non-built-in id (applier-core.ts:94). The popup sends the same resolved id to the page, so the page and the record agree. Following the colour scheme per load would need a new record field: not proposed (O2).

---

## 6. Un-pause and Restore interplay (state model; F2 UX is S5.3)

States per site: `none` → `remembered (auto)` ⇄ `paused`; plus the page state `themed` / `original`.

| From | Action | Site after | Page after |
|---|---|---|---|
| any | Theme click, granted | remembered, theme = clicked, `paused` removed, registered | clicked theme |
| remembered | Restore (popup) | paused, unregistered, permission kept (Popup.tsx:315; siteActions.ts:166-173) | original (exact on a live instance) |
| paused | Theme click | remembered (E5) | clicked theme |
| paused | Resume | remembered with its old plan (siteActions.ts:176-182) | record theme (keeper applies, keeper.ts:56-57) |
| paused | reload | paused (auto-core reports `paused`, auto-core.ts:92-95) | original |
| any | Theme click, refused | unchanged (a paused site stays paused) | clicked theme, this tab only |
| any | Restore (shortcut) | **unchanged** today (commands.ts:43-50) | original |

After Restore the popup shows: status "Original restored." (Popup.tsx:323), site section "Paused on this site. Resume to theme every page again." with Resume (Popup.tsx:585-587). The radio stays on the site's theme; clicking it applies and un-pauses (onClick). S5.3 decides the copy (a hint that picking a theme turns it back on) and the Restore button state, and closes the shortcut gap (shortcut Restore should pause like the popup).

---

## 7. Popup UI changes

- **Removed:** nothing. There is no separate Apply control (Popup.tsx:468-474 has Change my page, Restore original, Cancel; specs.md §2). `pickTheme` (Popup.tsx:196-200) is replaced by `applyChoice`.
- **Radios:** `onClick={() => applyChoice(id)}` instead of `onChange`. Checked radio (O4 recommendation) = `selected` state: initialised on open to this site's remembered built-in theme when the record's provider is `builtin` and its theme is built-in (paused or not), otherwise `settings.theme`; set to the clicked choice on every click. A site with an AI record shows no radio checked (its look is not one of the seven). The `.on` class follows the same value.
- **Disabled:** radios are disabled while `busy` (AI flow working or consent, Popup.tsx:449). They are **not** disabled while a theme applies, so rapid clicks and arrow keys work (latest wins). Change my page and Restore are disabled while `themeBusy`, so a Restore cannot interleave with a swap.
- **Busy indication:** `aria-busy="true"` on the `fieldset.themes` and a status line `applying(name)` in the header `role="status"` (Popup.tsx:462) while `themeBusy`. No spinner list (the 3-stage list is for the AI flow).
- **Result:** success line reuses `S.popup.applied(name, 0)` (strings.ts:31) until S5.4 rewords it (built-in applies always report 0 fixes, applier-core.ts:133). Site memory shows through the existing site section (Popup.tsx:583-592).
- **Errors:** `MSG.blocked` (ai/messages.ts:7), `applyFailureMessage(r)` (ai/messages.ts:54), `S.popup.keepDenied` / `S.popup.thisPageOnly` (strings.ts:43, :82).
- **Keyboard / ARIA:** native radios in a `fieldset` with `legend` stay (Popup.tsx:489-513; a11y.test.ts:58). Focus is not moved by an apply. Arrow keys apply like clicks. Status changes are announced by the existing `role="status"` line.
- **New strings** (placeholder copy, S5.4 owns final words), in `src/ui/strings.ts` under `S.popup`:
  - `applying: (name) => \`Applying ${name}…\``
  - `themeOn: (name) => \`${name} is on.\`` (if S5.4 drops the readability-fix wording)
  - `pickToResume: "Pick a theme to turn it back on for this site."` (S5.3, after Restore)
  - `choiceSaved: "Saved as your theme for other pages."` (ineligible page; shown after `MSG.blocked`)

---

## 8. AI flow isolation

- Not changed: `start()`, `runTransform`, `transform`, consent, preview, Keep/Undo/Try another, `commitKeep`, `keepOnSite`, `resume`, `checkPendingIntent` (Popup.tsx:104-117, 228-283, 330-409), `flow.ts`, `pipeline.ts`, `intent.ts`.
- Shared, reused as is: `handOver`, `makeIntent` stage `click`, `clickKept`, `deniedHere`, `grantedAtOpen`. The theme click writes an intent of the **same shape** "Change my page" writes in its click. The keeper cannot tell them apart and does not need to: both mean "keep this built-in theme for the site".
- Changed in shared code: only `applyToTab` (§5.3), whose new branch runs only when the popup is not theming (`popupThemes` false, keeper.ts:56) and the page shows a theme other than the kept one. For "Change my page" that is the Edge case where the popup died at the prompt, and putting the kept built-in theme on is what `applyToTab` was meant to do (keeper.ts:28-32).
- Coexistence on one site: one record per origin (sites.ts:50). The last action wins. A theme click writes `provider: "builtin"`; a kept AI plan writes the provider id (Popup.tsx:358-369). The popup's site line already names the provider (Popup.tsx:585). The baseline of "Change my page" is `settings.theme`, which the last theme click set.
- While the AI flow runs, radios are disabled (E10), so a theme click cannot race its apply. In the preview state a theme click replaces the AI preview and the AI record (E11, O3).

---

## 9. Error and edge states (for S5.4)

| Condition | Detected by | Message key | Page / storage | Recovery |
|---|---|---|---|---|
| Non-web page (chrome://, edge://, about:, data:, file://) | `site` undefined / `checkUrl` | `MSG.blocked` (+ `S.popup.choiceSaved`) | untouched / settings only | open a web page |
| Store page, `.pdf` path, blocklisted host | `checkUrl(tabUrl)` (eligibility.ts:30-41) | `MSG.blocked` (+ `choiceSaved`) | untouched / settings only | none |
| Injection refused (PDF viewer without `.pdf`, other) [INFERRED] | `ensureApplier` throws | `applyFailureMessage(undefined)` (S.fail.denied) | untouched | none |
| Tab navigated since the popup opened (activeTab lost, no host permission) [INFERRED] | `executeScript` throws | `applyFailureMessage(undefined)` | untouched | reopen the popup |
| Permission refused | `requestOrigins` false | `S.popup.keepDenied`, then `thisPageOnly` on reopen | themed this tab; no record | Keep on this site |
| Permission API error / concurrent request | `askPermission` → false (Popup.tsx:202-208) | as refused | as refused | as refused |
| Apply rolled back (`invariants`, `invalid-plan`, `bad-theme`, `error`) | `ApplyResult.ok === false` (applier-core.ts:30-32) | `applyFailureMessage(r)`; S5.4: wording must say the page is back to its **original** look (a failed swap leaves it unthemed) | unthemed; record holds the new theme | pick another theme |
| Page script never answers | result undefined | `applyFailureMessage(undefined)` | unknown | reload |
| Keeper failed (save or register) | not visible in the popup | none now; "Why not themed here?" (Popup.tsx:415-447) | record may be missing / unregistered | next click; `reconcile` |
| Site cap (200 records) | `withSite` drops the oldest (sites.ts:133-140) | none | oldest site forgotten | none |
| AI flow running | `busy` | radios disabled | n/a | wait or Cancel |
| Offline | `useOnline` | existing `S.popup.offline` banner (built-in themes still work) | n/a | n/a |

---

## 10. Test plan

Layers: **P** = popup component with mocked `api.ts` + `wireBackground` (tests/popup.test.ts pattern, tests/helpers/popupBackground.ts:21-38); **F** = fake chrome with the real popup, background, keeper and storage (tests/persistence.test.ts pattern, tests/helpers/fakeChrome.ts: `prompt`, `popupDies`, `granted`, call log); **K** = keeper unit with mocked api; **A** = jsdom integration with the real `createApplier` + engine (tests/applier.test.ts, tests/engine/marker.test.ts patterns).

### S5.2

| Layer | Test name | Asserts |
|---|---|---|
| P | theme click applies at once, with no second action | one `applyTheme(<id>)` call for the clicked theme; no `runTransform`; success line |
| F | theme click: the intent write then the permission request come first, inside the click | log prefix `["storage.set intent", "permissions.request <origin>/*"]`; no `await` before the request |
| F | theme click remembers the site: built-in record, auto, one registration, no auto files injected while the popup is open | record `{provider: builtin, mode: auto, plan.themeId}`; registration; `exec` has no `applier-auto.js` |
| P | clicking the already-checked theme applies it again | second `applyTheme` with the same id |
| P | Auto applies the variant for the colour scheme and stores it | `matchMedia` dark → `applyTheme("midnight")`, `settings.theme === "auto"`, record theme `midnight` |
| P | rapid clicks end in the last theme: page, settings and record | deferred `applyTheme` promises; last call is D; no stale result shown; settings D; record D; one `requestOrigins` |
| F | permission denied: the theme stays on this tab only, nothing kept, one message, Keep on this site; a second click does not ask again | page themed; no record, no registration; `keepDenied` text; request count unchanged after a second click |
| F | Edge, allow: the background puts the clicked theme on a tab that showed another theme | stub page reports `shownTheme` A; after allow, `apply` with plan B in all frames |
| K | applyToTab skips a tab already showing the kept theme / re-applies another theme / injects the auto files into an unthemed tab / ignores a tab that left the origin | four cases (the last exists: persistence.test.ts:192-204) |
| P | a theme click on an ineligible page saves the choice, shows the blocked message, injects nothing, asks nothing | `storageSet settings`; `MSG.blocked`; no `injectFile`, no `requestOrigins` |
| P | a `.pdf` URL on an allowed origin is ineligible (full URL checked) | no `requestOrigins` |
| P | theme radios are disabled while Change my page runs | `:disabled` count 7 in `working` |
| P | a theme click in the preview state replaces the AI theme and its record | record provider `builtin`; preview section gone |
| P | busy: fieldset aria-busy and the applying line while the apply runs; buttons disabled; cleared after | attributes before and after |
| P | apply failure shows the failure message and no success line | `applyFailureMessage(r)` |
| A | swap A→B on a live instance leaves one engine sheet and B's colours only | sheets with `ENGINE_SHEET_SIGNATURE` = 1; marker values equal a fresh B apply on the same page |
| A | restore after a swap is exact (D12) | `outerHTML` byte-identical to before A |
| A | applyTheme A, B, C, B in a row ends on B with one sheet; restore exact | as above |
| A | a fresh applier on a page with an orphan's theme cleans first: one sheet, originals are the page's, restore exact | orphan via a second `createColorEngine` not restored (marker.test.ts `lost()` helper); then `createApplier(doc).applyTheme(B)`; restore → original `outerHTML` |
| A | the fresh-instance cleanup leaves UI hosts alone | a `[data-skinly-ui]` host survives `applyTheme` on a fresh instance |
| A | a fresh first apply on an untouched page does not walk the DOM for cleanup | spy: `engineCleanup` not called when no `ROOT_MARK` and no sheet |

Adapt (S5.2 prompt must list them): popup.test.ts "saves the picked theme" (:106-110) and "T6: all 6 built-in themes …" (:112-123) now trigger applies and permission requests; their assertions on settings and `checked` should stay; mocks for `requestOrigins` / `createPageClient().applyTheme` are needed. All "Change my page" tests in popup.test.ts and persistence.test.ts must stay unchanged and green (AI isolation).

### S5.3

| Layer | Test name | Asserts |
|---|---|---|
| F | a theme click un-pauses a restored site without a prompt | `paused` gone; registration back; no `permissions.request` UI (already granted) |
| P | after Restore, clicking the checked theme applies it again | `applyTheme` called; status not "Original restored." |
| F | shortcut Restore pauses a remembered site like the popup | `paused: true`, unregistered (after the S5.3 change) |
| A | same-origin iframe: swap then restore is exact inside the iframe | top applier + frame applier (`tokensOnly`) on one jsdom iframe; iframe `outerHTML` equal after restore (R3) |
| A | page change during theme A survives the swap to B and the final restore (I5) | changed inline prop keeps the page value |

### S5.4

One P test per row of the §9 table that has a message key (the message shown and the page call made or not).

---

## 11. Implementation plan

### S5.2 (Opus 5.5 / high), in order

1. `src/extension/cleanup.ts`: export `engineCleanup(doc)` (sheets, `undoEngineMarks`, `ROOT_MARK`, `ENGINE_MARK`, `data-skinly-r`); `markerCleanup` calls it, then the UI-host and tool sweep. Behaviour of `markerCleanup` unchanged.
2. `src/extension/applier-core.ts` `run()`: `fresh` captured before `restore(false)`; `if (fresh && hasLeftovers(doc)) engineCleanup(doc)` before `snapshot(doc)`.
3. `src/extension/api.ts`: add `"shownTheme"` to `PageMethod` (api.ts:196). No new chrome call.
4. `src/extension/keeper.ts`: `applyToTab(tabId, origin, plan?)` theme-aware (§5.3); `keep()` passes `intent.kept?.plan` (resume passes the record's plan).
5. `src/extension/popup/Popup.tsx`: `applyChoice` (§2.0) replacing `pickTheme`; radios `onClick`; `selected` state and its initialisation in `refreshSite`; `tabUrl.current` set in `refreshSite`; refs `clickSeq`, `pageQueue`, `permissionPending`; `themeBusy`; radios disabled while `busy`; Change my page / Restore disabled while `themeBusy`; `deniedHere` set on refusal.
6. `src/ui/strings.ts`: `applying`, `choiceSaved` (placeholders).
7. Tests from the S5.2 table; adapt the two popup tests named above.

Files: 6 src + tests. No new permission, dependency or storage key.

### S5.3 (Sonnet 5.5 / high)

Restore button state (disabled when the page reports no theme and nothing to clean, or kept enabled as a safety net: S5.3 decides), `pickToResume` hint after Restore, shortcut parity (`restore-page` pauses a remembered site; `transform-page` saves and un-pauses when the origin is already granted, no prompt from a shortcut), the S5.3 tests, including the iframe exact-restore test.

### S5.4 (Sonnet 5.5 / medium)

Final copy for every §7 / §9 key; the failed-swap wording ("back to its original look"); blocked-page line with `choiceSaved`; one test per message.

---

## 12. Risks and open questions

### Owner must decide (yes/no, recommended answer first)

- **O1** On a refused permission, keep the clicked theme on this tab (spec F1, **recommended yes**)? The prompt's test list says "permission denied leaves the page untouched"; this design reads that as "leaves the site untouched (no record, no registration)". If the owner wants the page untouched too, the popup waits for the answer before applying, so the theme appears only after the prompt is answered.
- **O2** On a remembered site, "Auto" is stored as the light/dark variant chosen at click time (**recommended yes**: no schema change). "No" means a new optional record field (schema change, flagged).
- **O3** A theme click on a site whose kept theme came from the AI replaces it with the built-in theme (**recommended yes**: D5 says the click remembers the site; last action wins; "Change my page" can make a new AI theme).
- **O4** The checked radio shows this site's remembered built-in theme when there is one, and the global choice otherwise (**recommended yes**; "no" keeps today's: always the global choice).

### Implementer decides (defaults given)

- **R1** Theme applied in parallel with the prompt (default, follows O1). [INFERRED] On Edge the popup may die before its `applyTheme` call is sent; the keeper's theme-aware `applyToTab` covers the allow case; on deny nothing is applied and the reopened popup says "this page only".
- **R2** Granted at open + popup closed in the few ms before the page call is sent: the keeper does not apply (`popupApplies`), so the page keeps its old look until reload; the record is right. Default: accept (human close latency is far above the dispatch time).
- **R3** [INFERRED] Same-origin iframes may be themed twice: the top engine walks same-origin iframe documents (dom.ts:1181-1193) and each same-origin frame also gets its own tokens-only applier (applier.ts:91-93), both writing inline `!important` colours (`shouldSkipElement` does not skip `ENGINE_MARK`, dom.ts:406-409). This exists today for "Change my page" and the shortcut; a swap repeats it. Default: S5.3 adds the iframe exact-restore test; if it fails, report it under "Bugs found" (engine scope) instead of fixing it in S5.3.
- **R4** Concurrent `permissions.request` [INFERRED]: guarded by the pending-promise ref.
- **R5** A remembered site whose permission was removed in the browser while the page stayed open: auto-core stays live in that document and re-applies the old record on same-document navigation after a refused click. Default: accept; a reload fixes it.
- **R6** Large pages turn over in batches after a swap (dom.ts:1201, time slicing). Default: accept; owner checks visually.
- **R7** Arrow-key navigation through the radios applies each theme and may show the prompt on the first one. Default: accept (it is the keyboard form of a click); latest wins.
- **R8** The fresh-instance cleanup also undoes marks inside same-origin iframes (dom.ts:335-351) that a live frame applier wrote [INFERRED, rare: needs a lost top instance with a live frame instance]. Default: accept.
- **R9** Other open tabs of the site keep their old theme until reload or their next same-document navigation. Default: accept.
- **R10** The click intent shape is shared with "Change my page"; the keeper's new branch is the only shared-code change. Default: keep it there; the existing persistence tests for "Change my page" must stay green unchanged.
