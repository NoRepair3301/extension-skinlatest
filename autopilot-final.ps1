$prompt = Get-Content -Raw .\prompt-final.txt
for ($i = 1; $i -le 30; $i++) {
  Write-Host "Run $i $(Get-Date -Format HH:mm)"
  claude -p $prompt --permission-mode auto
  $tail = (Get-Content .\docs\PROGRESS.md -Tail 3 -ErrorAction SilentlyContinue) -join "`n"
  if ($tail -match "FINAL DONE") { Write-Host "DONE"; break }
  Start-Sleep -Seconds 600
}