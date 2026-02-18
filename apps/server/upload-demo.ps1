param (
  [string]$FilePath,
  [string]$Kind = "PDF"
)

# === CONFIG ===
$PROJECT_ID = "9c223e31-e014-4ed8-926d-8c5ba06bf3ae"
$API = "http://localhost:4000/api/files"
$CONTENT = "application/pdf"

# === STEP 1: Validazione file ===
if (-not (Test-Path $FilePath)) {
  Write-Host "File non trovato: $FilePath" -ForegroundColor Red
  exit
}
$FILENAME = [IO.Path]::GetFileName($FilePath)
Write-Host "Caricamento file: $FILENAME ..." -ForegroundColor Cyan

# === STEP 2: Crea record documento ===
$body = @{ projectId=$PROJECT_ID; kind=$Kind; name=$FILENAME } | ConvertTo-Json
$init = Invoke-RestMethod -Uri "$API/init" -Method Post -ContentType "application/json" -Body $body
$DOC_ID = $init.documentId
Write-Host "Documento creato con ID: $DOC_ID"


# === STEP 3: Ottieni URL firmata ===
$body2 = @{ documentId=$DOC_ID; filename=$FILENAME; contentType=$CONTENT } | ConvertTo-Json
$up = Invoke-RestMethod -Uri "$API/upload-url" -Method Post -ContentType "application/json" -Body $body2
$URL = $up.uploadUrl
Write-Host "URL firmata ottenuta"

# === STEP 4: Upload vero e proprio su MinIO ===
Invoke-WebRequest -Uri $URL -Method Put -InFile $FilePath -ContentType $CONTENT
Write-Host "Upload completato"

# === STEP 5: Verifica finale nel DB ===
$list = Invoke-RestMethod "$API/project/$PROJECT_ID/list"
Write-Host "Documenti nel progetto:"
$list | ConvertTo-Json -Depth 5
