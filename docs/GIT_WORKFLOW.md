# GIT WORKFLOW

The repo stays local until you decide to connect GitHub. If you ever push, make the repo private first, because fixtures come from real pages.

## Setup (once)
```
git init -b main
git add -A
git commit -m "chore: docs pack"
```
Check `git status` shows no `.env.local`, `private/` or `dist/`. They are ignored by .gitignore.

## Branches
One branch per phase, cut from main:
- phase/0-scaffold
- phase/1-analyzer
- phase/2-themes
- phase/3-providers
- phase/4-flow
- phase/5-sites
- phase/6-pet
- phase/7-palette
- phase/8-privacy-tools
- phase/9-release

Claude Code creates the branch at the start of the phase (`git switch -c phase/<n>-<name>` from main). Never work on main directly.

## Commits
Format: `<type>(<area>): <what>`. Types: feat, fix, test, chore, docs. Areas: scaffold, analyzer, themes, providers, flow, sites, pet, palette, blur, tables, release.
Examples: `feat(analyzer): region detection with node cap`, `fix(flow): rollback when invariants fail`, `test(sites): eviction at cap 200`.
One commit per Scope step, `npm run check` green before every commit. No giant "everything" commits.
Claude Code adds its own attribution lines to commit messages when its settings say so. Leave them as they are.

## Token rules (so you do not run out of limit)
- `/clear` between sessions. One phase per session, two prompts at most.
- Prompts only name the files to read (CLAUDE.md, SPEC, the phase doc). Do not paste long logs: paste the last 30 lines of an error.
- Do not ask Claude Code to "review everything". Use the audit prompt, which has a fixed shape.
- If a phase will not fit in the limit you have left, stop at a commit boundary and use the resume prompt later.

## Finishing a phase
1. Build prompt finishes, all [auto] items pass, everything committed.
2. New session: audit prompt. Fix prompt for any FAIL. Re-run the audit only for the failed checks.
3. You do the [human] items.
4. Merge and tag (you run these, or ask Claude Code with the exact lines below):
```
git switch main
git merge --no-ff phase/<n>-<name> -m "merge: phase <n>"
git tag phase-<n>-done
```
5. Next phase starts from main.

## If a session dies mid-phase
Use the resume prompt from docs/archive/premium/PROMPTS.md. Uncommitted work is either committed (if it passes check) or stashed with `git stash -m "phase<n> wip"`. Nothing is silently thrown away.

## Tags
- phase-0-done ... phase-9-done after each merge.
- v0.1.0-rc1 after Phase 9. A real release tag only after your QA matrix passes.

## Before any push
- Fixtures contain scrubbed public pages only, but still check `git log -p` for emails, phone numbers and your own name (the audit's C11 does this).
- If history contains anything personal, squash or recreate the history before pushing. Never force-push a shared branch.
- Keep `store/`, `private/`, `release/` and `.env*` out of git (already in .gitignore).
