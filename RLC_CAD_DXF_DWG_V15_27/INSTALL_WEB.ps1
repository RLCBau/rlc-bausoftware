param(
  [string]$RlcRoot = "C:\RLC\rlc-app",
  [switch]$RunChecks
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = Join-Path $RlcRoot "apps\web"
$BackupRoot = Join-Path $RlcRoot (".rlc-backups\dxf_dwg_v15_27_" + (Get-Date -Format "yyyyMMdd_HHmmss"))

function Copy-WithBackup([string]$RelativePath) {
  $Source = Join-Path $PackageRoot $RelativePath
  $Target = Join-Path $RlcRoot $RelativePath
  $Backup = Join-Path $BackupRoot $RelativePath
  if (!(Test-Path $Source)) { throw "Payload fehlt: $Source" }
  if (Test-Path $Target) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Backup) | Out-Null
    Copy-Item -Force $Target $Backup
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
  Copy-Item -Force $Source $Target
  Write-Host "Installiert: $RelativePath"
}

Copy-WithBackup "apps\web\src\pages\cad\CADViewer.tsx"
Copy-WithBackup "apps\web\src\pages\cad\rlcCadEngine.ts"

if ($RunChecks) {
  Push-Location $WebRoot
  try {
    npm run build
  } finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "RLC CAD DXF/DWG V15.27 Web installiert."
Write-Host "Backup: $BackupRoot"
