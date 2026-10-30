$marker = '^PHASE10 DONE'
$prompt = @'
AUTOPILOT 4 (token saving). Read CLAUDE.md, docs/SPEC.md and docs/PROGRESS.md. Run git status, git log --oneline -15 and git branch -a. Goal: finish Phase 10 ONLY, then stop. Do NOT start Phase 11.

Preflight: if chore/logo is not merged into main yet, run npm run check and merge it with --no-ff. Then continue on branch feat/scenes-pets-assets from the first unfinished Scope step of docs/PHASE_10.md (read that doc once). Commit or finish any uncommitted work first and note it in docs/PROGRESS.md.

Token rules: do not re-read files you just wrote; never print whole files; pipe command output through tail -20; while working run targeted tests (npx vitest run <file>) and run the full npm run check only at the end of each Scope step, before its commit; no extra audits beyond the safety greps (docs/AUDIT.md C1, C2, C6, C7, C9, C10, C12); skip the fresh-clone run and just run npm run check and npm run release in place; keep summaries to a few lines. If tokens get short, do the Scope steps in this order: 1, 2, 3, 4, 5, 6, 10, 7, 8, 9, and note anything not done in docs/PROGRESS.md and docs/HUMAN_CHECKS.md.

Rules: no e2e or browser automation; no new dependency; no new permission; no network calls from new code; do NOT run scripts/probe.ts or scripts/bakeoff.ts and do NOT read .env.local; never print a key; no tests weakened or skipped; no publishing; never delete or move files outside the repo. If a step fails 3 times, write the problem in docs/PROGRESS.md and move on. You cannot see a browser, so build the art carefully and list "look at this on private/preview.html" items in docs/HUMAN_CHECKS.md.

Finish: merge into main with --no-ff, tag v0.2.0-rc1, append a 5-line summary to docs/PROGRESS.md saying Phase 11 is not started, put the [human] items in docs/HUMAN_CHECKS.md, then make the last line of docs/PROGRESS.md exactly: PHASE10 DONE
'@
for ($i = 1; $i -le 40; $i++) {
  if ((Test-Path docs\PROGRESS.md) -and (Select-String -Path docs\PROGRESS.md -Pattern $marker -Quiet)) { Write-Host "All done"; break }
  Write-Host "Run $i  $(Get-Date)"
  claude -p $prompt --permission-mode auto
  Start-Sleep -Seconds 1500
}