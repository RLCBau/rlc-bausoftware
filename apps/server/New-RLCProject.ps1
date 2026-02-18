# === Crea progetto RLC Bausoftware ===
$root="C:\RLC\rlc-app\apps\server\data\projects"

# --- dati progetto (modifica se vuoi) ---
$code="B2025-001"
$name="Parkplatz Süd"
# ---------------------------------------

$slug=$name.ToLower() -replace '[^a-z0-9\- ]','' -replace '\s+','-'
$proj="$root\$code" + "_" + $slug

# crea tutte le cartelle standard
mkdir $proj,$($proj+"\cad"),$($proj+"\lv"),$($proj+"\abrechnung"),$($proj+"\regieberichte"),$($proj+"\lieferscheine"),$($proj+"\dokumente"),$($proj+"\images"),$($proj+"\.rlc") -Force | Out-Null

# crea file meta
'{"code":"'+$code+'","name":"'+$name+'","slug":"'+$slug+'","createdAt":"'+(Get-Date).ToString("s")+'"}' |
Set-Content -Encoding UTF8 ($proj+"\ .rlc\project.json".Replace(" ",""))

Write-Host ""
Write-Host "✅ Progetto creato in:" $proj -ForegroundColor Green
Start-Process explorer $proj
