# PROMPTS

Paste one prompt per session. Each build prompt is 120 words or fewer on purpose: the rules live in CLAUDE.md and the phase doc, not in the prompt.

## Setup before every session
1. Open a terminal in the project folder and start Claude Code.
2. Run `/clear` so the old chat does not eat your limit.
3. Run `/usage` and check you have room. If you are low, wait for the reset instead of starting a phase and getting cut off halfway.
4. Make sure `ANTHROPIC_API_KEY` is not set in your terminal, so Claude Code uses your plan and not API billing.
5. Pick the model. Default for every phase: `/model sonnet` and `/effort medium`. Use `/model opus` with `/effort medium` only for Phase 1 and Phase 4 (analysis and the pipeline are the hardest parts). Switch back to Sonnet afterwards.
6. Use at most two prompts per phase session: the build prompt, then one fix or resume prompt if needed. Anything bigger means start a new session.

## Build prompts

### P0 (scaffold)
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_0.md only. Build Phase 0 exactly as written, one Scope step at a time, on branch phase/0-scaffold. Commit after each step using the commit format in docs/GIT_WORKFLOW.md and run `npm run check` before each commit. Add no dependency that CLAUDE.md does not list. STOP when every [auto] Acceptance item passes. Then print the [human] items as a checklist for me. Do not start Phase 1.

### P1 (analyser) — Opus medium
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_1.md only. First check that fixtures/web/ holds at least 10 html files; if not, STOP and tell me. Build Phase 1 on branch phase/1-analyzer, one Scope step at a time, committing after each step with `npm run check` green. The analyser must be read-only: it never changes the page. STOP when every [auto] Acceptance item passes, print the [human] items, and do not start Phase 2.

### P2 (themes and applier)
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_2.md only. Build Phase 2 on branch phase/2-themes, one Scope step at a time, committing after each step with `npm run check` green. Every style must come from the fixed CSS templates through the compiler, never from raw strings. If the contrast script fails for a theme, fix the theme colours, not the threshold. STOP when every [auto] Acceptance item passes, print the [human] items, and do not start Phase 3.

### P3 (providers and keys)
Read CLAUDE.md, docs/SPEC.md, docs/PHASE_3.md and docs/providers/*.md only. If docs/providers/gemini.md or groq.md is missing, or lacks the endpoint, a request example, the JSON output parameter and model ids, STOP and say exactly what is missing. Never guess API details. Never print, log or commit any key; read keys only from .env.local inside scripts. Build on branch phase/3-providers, committing after each step. STOP when every [auto] item passes and print the [human] items. Do not start Phase 4.

### P4 (the flow) — Opus medium
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_4.md only. Build Phase 4 on branch phase/4-flow, one Scope step at a time, committing after each step with `npm run check` green. The AI is called only after consent, and only with the StructuralSummary. Any provider output goes through the validator before anything else touches it. Keep the 3 second gap and 20 calls per day guards. STOP when every [auto] item passes, print the [human] items, and do not start Phase 5.

### P5 (remember per site)
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_5.md only. Build Phase 5 on branch phase/5-sites, one Scope step at a time, committing after each step with `npm run check` green. Request host permission only for the active origin, only from a user click, never a wildcard. The auto path never calls a provider and never trusts stored data without validating it. STOP when every [auto] item passes, print the [human] items, and do not start Phase 6.

### P6 (pet)
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_6.md only. Build Phase 6 on branch phase/6-pet, one Scope step at a time, committing after each step with `npm run check` green. The pet is original art built with createElementNS, off by default, with no network, no audio and no page text. When disabled it must leave no element, observer or animation frame behind. STOP when every [auto] item passes, print the [human] items, and do not start Phase 7.

### P7 (palette and shortcuts)
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_7.md only. Build Phase 7 on branch phase/7-palette, one Scope step at a time, committing after each step with `npm run check` green. The palette only scrolls to, focuses and highlights an element. It never clicks anything and never stores or sends labels. STOP when every [auto] item passes, print the [human] items, and do not start Phase 8.

### P8 (blur, screenshot, tables)
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_8.md only. Build Phase 8 on branch phase/8-privacy-tools, one Scope step at a time, committing after each step with `npm run check` green. Blur uses only the one CSS template. The screenshot never leaves the browser. Table sort and filter are the only allowed reorder and hide actions, and they must be fully reversible. STOP when every [auto] item passes, print the [human] items, and do not start Phase 9.

### P9 (release)
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_9.md only. Build Phase 9 on branch phase/9-release, one Scope step at a time, committing after each step with `npm run check` green. If icons need a new dependency, STOP and ask me. Store text must match what the code really does. STOP when every [auto] item passes, print the [human] items, tag v0.1.0-rc1, and do not publish or submit anything.

## Audit prompt (new session, `/clear` first, change `<n>`)
Read CLAUDE.md, docs/SPEC.md, docs/AUDIT.md and docs/PHASE_<n>.md. Audit the current branch against them. Do not edit any file. Run the commands in docs/AUDIT.md yourself and quote the output. Print a table: check, PASS or FAIL, evidence (file:line or command output). End with the failures ranked from most to least serious, each with the smallest fix you would make. Do not fix anything.

## Fix prompt (paste the failure list from the audit)
Read CLAUDE.md and docs/PHASE_<n>.md only. Fix only the failures listed below, in order. For each one: write a failing test first, make it pass with the smallest change, run `npm run check`, and commit with `fix(<area>): <what>`. No refactors, no new features, no extra files. Failures: <paste here>

## Resume prompt (session died, limit ran out, or network dropped)
Read CLAUDE.md, docs/SPEC.md and docs/PHASE_<n>.md only. Run `git status`, `git log --oneline -15` and `npm run check`. Work out which Scope steps are already done and committed. Commit or discard any half-finished work after telling me what it is, then continue from the first unfinished step. Same STOP rule as the phase doc.

## If something goes wrong
- `ECONNREFUSED ... retrying` in Claude Code is Claude Code failing to reach Anthropic, not your tests. Check VPN or proxy, wait for the retries, and if the session died use the resume prompt.
- Limit hit mid-phase: stop, wait for the reset, then use the resume prompt in a fresh session.
- Claude Code asks to install a new dependency not in CLAUDE.md: say no, and ask it to do the step without it.
- A test fails and Claude Code wants to loosen it: say no. Fix the code, or tell me and we decide together.
