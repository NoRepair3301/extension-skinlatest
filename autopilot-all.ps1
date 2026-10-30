$prompt = Get-Content -Raw .\prompt-launch.txt
for ($i = 1; $i -le 40; $i++) {
  Write-Host "Run $i $(Get-Date -Format HH:mm)"
  claude -p $prompt --permission-mode auto
  $tail = (Get-Content .\docs\PROGRESS.md -Tail 3 -ErrorAction SilentlyContinue) -join "`n"
  if ($tail -match "ALL DONE") { Write-Host "DONE"; break }
  Start-Sleep -Seconds 600
}