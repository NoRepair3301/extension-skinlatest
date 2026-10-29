$prompt = @'
Read CLAUDE.md, docs/SPEC.md and docs/PROGRESS.md. Run git status, git log --oneline -15 and npm run check. Continue the AUTOPILOT from the first unfinished phase or step. Same rules as before: autopilot wins over CLAUDE.md on one phase per session, official-docs-only web research for providers, merge to main with --no-ff and tags. One phase doc at a time, commit each step with npm run check green, safety greps at the end of each phase, [human] items into docs/HUMAN_CHECKS.md, never print a key, no e2e, no new dependency. Commit or discard half-finished work after noting what it was in docs/PROGRESS.md. If a step fails 3 times, note it and move on.
When Phase 9 is merged and tagged, do the FINAL STEP: in a fresh clone run npm ci and npm run check; run every common check C1 to C14 from docs/AUDIT.md across the whole repo and quote the evidence; fix each failure with a test first and re-run; write docs/FINAL_REPORT.md with a PASS or FAIL table, everything UNVERIFIED, and the full list of [human] checks. Then make the last line of docs/PROGRESS.md exactly: ALL DONE
'@
for ($i = 1; $i -le 40; $i++) {
  if ((Test-Path docs\PROGRESS.md) -and (Select-String -Path docs\PROGRESS.md -Pattern '^ALL DONE' -Quiet)) { Write-Host "All done"; break }
  Write-Host "Run $i  $(Get-Date)"
  claude -p $prompt --permission-mode auto
  Start-Sleep -Seconds 1500
}