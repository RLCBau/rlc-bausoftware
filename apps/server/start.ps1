Write-Host "?? Server wird gestartet auf http://localhost:4000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "npm run dev" -WindowStyle Minimized

Start-Sleep -Seconds 5

Write-Host "?? Hole Admin-Token..." -ForegroundColor Yellow

$body = @{ email = "admin@rlc.local"; password = "rlc123" } | ConvertTo-Json
$resp = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method Post -ContentType "application/json" -Body $body
$TOKEN = $resp.token

Set-Content -Path ".\auth_token.txt" -Value $TOKEN
Write-Host "? Fertig! Dein Token wurde gespeichert in auth_token.txt" -ForegroundColor Green



