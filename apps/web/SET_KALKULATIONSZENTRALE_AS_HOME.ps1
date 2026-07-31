$ErrorActionPreference = "Stop"

$Root = "C:\RLC\rlc-app\apps\web"
$App = Join-Path $Root "src\App.tsx"
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupDir = Join-Path $Root ".rlc-backups\kalkulationszentrale-home-$Stamp"
$BackupApp = Join-Path $BackupDir "App.tsx"

if (-not (Test-Path $App)) {
    throw "App.tsx non trovato: $App"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
Copy-Item $App $BackupApp -Force

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Text = [System.IO.File]::ReadAllText($App, [System.Text.Encoding]::UTF8)

$OldMenu = @'
    items: [
      { key: "lv-import", label: "LV / Positionen" },
'@

$NewMenu = @'
    items: [
      { key: "kalkulationszentrale", label: "Kalkulationszentrale" },
      { key: "lv-import", label: "LV / Positionen" },
'@

if (-not $Text.Contains($OldMenu)) {
    throw "Blocco menu Kalkulation non trovato oppure già modificato."
}
$Text = $Text.Replace($OldMenu, $NewMenu)

$OldOverview = '  kalkulation: <KalkulationUebersicht />,'
$NewOverview = '  kalkulation: <Navigate to="/kalkulation/kalkulationszentrale" replace />,'
if (-not $Text.Contains($OldOverview)) {
    throw "OVERVIEW kalkulation non trovato."
}
$Text = $Text.Replace($OldOverview, $NewOverview)

$OldRoute = '              <Route path="/kalkulation" element={<KalkulationUebersicht />} />'
$NewRoute = @'
              <Route
                path="/kalkulation"
                element={<Navigate to="/kalkulation/kalkulationszentrale" replace />}
              />
'@
if (-not $Text.Contains($OldRoute)) {
    throw "Route /kalkulation non trovata."
}
$Text = $Text.Replace($OldRoute, $NewRoute.TrimEnd("`r","`n"))

$LateRoute = '              <Route path="/kalkulation/kalkulationszentrale" element={<Kalkulationszentrale />} />'
if ($Text.Contains($LateRoute)) {
    $Text = $Text.Replace($LateRoute + "`r`n", "")
    $Text = $Text.Replace($LateRoute + "`n", "")
    $Text = $Text.Replace($LateRoute, "")
}

$Anchor = '              <Route path="/kalkulation/mit-ki" element={<KalkulationMitKI />} />'
$CentralRoute = '              <Route path="/kalkulation/kalkulationszentrale" element={<Kalkulationszentrale />} />'
if (-not $Text.Contains($Anchor)) {
    throw "Route Kalkulation mit KI non trovata."
}
$Text = $Text.Replace($Anchor, "$Anchor`r`n$CentralRoute")

[System.IO.File]::WriteAllText($App, $Text, $Utf8NoBom)

Write-Host ""
Write-Host "=== Verifica menu e route ==="
Select-String -Path $App -Pattern "Kalkulationszentrale|kalkulationszentrale"

Write-Host ""
Write-Host "=== Controllo encoding ==="
$Bad = Select-String -Path $App -Pattern "Ã|Â|â€|ðŸ"
if ($Bad) {
    Write-Host "Caratteri sospetti trovati. Ripristino backup."
    Copy-Item $BackupApp $App -Force
    throw "Controllo encoding fallito."
}
Write-Host "Encoding pulito."

Write-Host ""
Write-Host "=== Build Web locale ==="
Set-Location $Root

try {
    npm run build
}
catch {
    Write-Host "Build fallita. Ripristino backup."
    Copy-Item $BackupApp $App -Force
    throw
}

Write-Host ""
Write-Host "============================================================"
Write-Host "KALKULATIONSZENTRALE ORA È LA HOME DELLA KALKULATION"
Write-Host "Menu: Kalkulation > Kalkulationszentrale"
Write-Host "Root: /kalkulation -> /kalkulation/kalkulationszentrale"
Write-Host "Backup: $BackupApp"
Write-Host "============================================================"
