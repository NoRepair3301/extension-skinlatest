# HANDOFF — S6.1 Rename map and leftover scanner
Status: DONE     Date: 2026-11-06     Model/effort used: Sonnet 5.5 / medium (per prompt)
## What changed
- workflow/RENAME_MAP.md — classes A-K with counts, owners, compat rules, must-change-together groups, new naming table.
- scripts/rename-check.mjs — zero-dependency scanner (`--summary`, `--class X`, `--json`, `--list-allowed`, `--root`); exports `scan`, `classify`, `exitCode`, `collectFiles`.
- scripts/rename-allowlist.json — 20 entries, each with a reason (class K history, tooling self-references, legacy `skinly1:` compat lines).
- tests/rename-check.test.ts — 13 tests on temp dirs and fake input (hit, path entry, pattern entry, missing reason, skips, classes A/F, exit codes incl. CLI 0/1/2).
- package.json — only the `rename-check` script entry. No src/ change (`git diff --stat -- src` empty).
## Gate results
tsc 0 errors; eslint 0 errors; vitest 1622 pass / 0 fail / 99 files (was 1609 / 98); GATE GREEN (build + validate-dist inside the gate).
## Starting leftovers (`node scripts/rename-check.mjs --summary`, exits 1 as expected)
Total 492 hits in 111 files (164 allowlisted, all class K). A 202/50 (S6.2) · B 109/14, C 5/3, D 2/1 (S6.3) · E 8/5, F 1/1 (S6.4) · G 0 · H 18/14 (S6.5) · I 94/29, J 53/22 (S6.6, tests move with their contract).
## Decisions made (also in DECISIONS.md)
Scanner script/allowlist/test are classed K so they do not count; allowlist hides CHANGELOG.md wholesale (S6.6 must review the new Unreleased lines by eye); file names containing the old name count as hits on line 0 (binary files are matched by name only); the test loads the .mjs through a dynamic import because the repo has no `@types/node` and no `.d.ts` for it.
## Out-of-scope touches
None.
## Bugs found / gaps (outside scope)
- No theme-code encode/decode exists in `src/`: `skinly1:` appears only in the help string `src/ui/strings.ts:42`. S6.4's "import accepts both" has no code to adapt; see RENAME_MAP class F for the recommended default (rename the string, do not invent a feature).
- Auto-script ids `skinly-<hash>` (`src/extension/siteActions.ts:27`) stay registered across an update; S6.3 must unregister old ids once (RENAME_MAP class C).
## Owner choices and art
- Names to choose (D10): store title/tagline, GitHub repo name (default `Repaint`). Redraw if they contain the old wordmark: `assets/skinly-logo-512.png`, `assets/icons/icon-{16,32,48,128}.png` (listed only, not touched). Delete ignored leftovers `release/skinly-ai-0.1.0.zip`, `-0.2.0.zip`.
- Unclear compat: old DOM markers on already-open tabs after an update (default: tab reload clears them, no legacy list).
## Owner manual checks (no browser)
1. `node scripts/rename-check.mjs --summary` prints counts per class and exits 1. 2. `node scripts/rename-check.mjs --list-allowed` shows only archive/history, tooling and legacy-compat entries, each with a reason. 3. Read `workflow/RENAME_MAP.md` ("Must change together", "New naming table") and tell me any name you want different.
## Suggested commit message
chore(rename): add rename map and leftover scanner (S6.1)
  git add -A
  git commit -m "chore(rename): add rename map and leftover scanner (S6.1)"
  git tag stage-S6.1
  git push
## Next substage: S6.2 (Sonnet 5.5 / high) — DOM markers data-skinly* to data-repaint* across src and tests. Relies on: class A list in RENAME_MAP, `ROOT_MARK`/`ENGINE_MARK` at src/engine/dom.ts:137-138, validate-dist `ENGINE_MARKER`, scanner `--class A` to prove progress.
