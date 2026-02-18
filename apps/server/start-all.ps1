# Start Backend & Frontend, Token speichern, Browser öffnen
$serverDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$webDir    = Join-Path $serverDir "..\web"

Write-Host "API starten (4000)…"
Start-Process powershell -ArgumentList "npm run dev" -WorkingDirectory $serverDir -WindowStyle Minimized

Write-Host "Frontend starten (5173)…"
Start-Process powershell -ArgumentList "npm run dev" -WorkingDirectory $webDir -WindowStyle Minimized

# kurz warten
Start-Sleep -Seconds 5

Write-Host "Token holen…"
try {
  $body = @{ email = "admin@rlc.local"; password = "rlc123" } | ConvertTo-Json
  $resp = Invoke-RestMethod "http://localhost:4000/api/auth/login" -Method Post -ContentType "application/json" -Body $body
  $TOKEN = $resp.token
  Set-Content -Path (Join-Path $serverDir "auth_token.txt") -Value $TOKEN
  Write-Host "Token gespeichert in auth_token.txt"
} catch {
  Write-Host "Login/Token fehlgeschlagen: $_" -ForegroundColor Yellow
}

Start-Process "http://localhost:5173"
Write-Host "Fertig. Backend: :4000, Frontend: :5173"
