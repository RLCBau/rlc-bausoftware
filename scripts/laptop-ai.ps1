[CmdletBinding()]
param(
    [ValidateSet("install", "start", "stop", "status", "test")]
    [string]$Action = "status",

    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-RlcCommand {
    param([Parameter(Mandatory = $true)][string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Comando richiesto non trovato: $Name"
    }
    return $command
}

function New-RlcHex {
    param([Parameter(Mandatory = $true)][int]$ByteCount)
    $bytes = New-Object byte[] $ByteCount
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Get-RlcEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $prefix = "$Name="
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line.StartsWith($prefix, [System.StringComparison]::Ordinal)) {
            return $line.Substring($prefix.Length).Trim()
        }
    }
    return ""
}

function Set-RlcEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $prefix = "$Name="
    $lines = [System.Collections.Generic.List[string]]::new()
    $updated = $false

    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line.StartsWith($prefix, [System.StringComparison]::Ordinal)) {
            if (-not $updated) {
                $lines.Add("$Name=$Value")
                $updated = $true
            }
        }
        else {
            $lines.Add($line)
        }
    }

    if (-not $updated) {
        $lines.Add("$Name=$Value")
    }

    [System.IO.File]::WriteAllLines(
        $Path,
        $lines,
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Invoke-RlcCompose {
    param([Parameter(Mandatory = $true)][string[]]$CommandArguments)
    $dockerArguments = @("compose") + $script:RlcComposeOptions + $CommandArguments
    & docker @dockerArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose non riuscito (exit code $LASTEXITCODE)."
    }
}

$resolvedRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$baseCompose = Join-Path $resolvedRoot "docker-compose.yml"
$enterpriseCompose = Join-Path $resolvedRoot "docker-compose.enterprise.yml"
$laptopCompose = Join-Path $resolvedRoot "docker-compose.laptop-ai.yml"
$templateFile = Join-Path $resolvedRoot ".env.laptop.example"
$environmentFile = Join-Path $resolvedRoot ".env.laptop"
$rootEnvironmentFile = Join-Path $resolvedRoot ".env"

foreach ($requiredFile in @(
    $baseCompose,
    $enterpriseCompose,
    $laptopCompose,
    $templateFile
)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "File richiesto non trovato: $requiredFile"
    }
}

Get-RlcCommand -Name "docker" | Out-Null
& docker compose version
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop con Docker Compose v2 non e disponibile."
}

if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) {
    Copy-Item -LiteralPath $templateFile -Destination $environmentFile
}

Set-RlcEnvValue -Path $environmentFile -Name "RLC_AI_MODE" -Value "LOCAL"
Set-RlcEnvValue -Path $environmentFile -Name "RLC_PUBLIC_API_URL" -Value "http://127.0.0.1:4000"

if (-not (Get-RlcEnvValue -Path $environmentFile -Name "RLC_SERVER_ID")) {
    Set-RlcEnvValue -Path $environmentFile -Name "RLC_SERVER_ID" -Value "rlc-laptop-$(New-RlcHex -ByteCount 16)"
}

if (-not (Get-RlcEnvValue -Path $environmentFile -Name "RLC_PAIRING_SECRET")) {
    Set-RlcEnvValue -Path $environmentFile -Name "RLC_PAIRING_SECRET" -Value (New-RlcHex -ByteCount 32)
}

$gitExclude = Join-Path $resolvedRoot ".git\info\exclude"
if (Test-Path -LiteralPath (Split-Path -Parent $gitExclude)) {
    $excludeEntry = "/.env.laptop"
    $existing = if (Test-Path -LiteralPath $gitExclude) {
        [System.IO.File]::ReadAllLines($gitExclude)
    }
    else {
        @()
    }
    if ($existing -notcontains $excludeEntry) {
        [System.IO.File]::AppendAllText(
            $gitExclude,
            "`r`n$excludeEntry`r`n",
            [System.Text.UTF8Encoding]::new($false)
        )
    }
}

$script:RlcComposeOptions = @(
    "--project-name", "rlc-laptop"
)
if (Test-Path -LiteralPath $rootEnvironmentFile -PathType Leaf) {
    $script:RlcComposeOptions += @("--env-file", $rootEnvironmentFile)
}
$script:RlcComposeOptions += @(
    "--env-file", $environmentFile,
    "-f", $baseCompose,
    "-f", $enterpriseCompose,
    "-f", $laptopCompose
)

switch ($Action) {
    "install" {
        Invoke-RlcCompose -CommandArguments @("pull", "ollama")
        Invoke-RlcCompose -CommandArguments @("up", "-d", "ollama")
        Invoke-RlcCompose -CommandArguments @("--profile", "setup", "run", "--rm", "ollama-init")
        Invoke-RlcCompose -CommandArguments @("up", "-d", "--build", "server")
        Invoke-RlcCompose -CommandArguments @("exec", "-T", "server", "npm", "run", "ai:smoke")
        Write-Host "RLC KI locale installata. OpenAI e disattivato in questa istanza."
    }
    "start" {
        Invoke-RlcCompose -CommandArguments @("up", "-d", "ollama", "server")
        Invoke-RlcCompose -CommandArguments @("ps")
    }
    "stop" {
        Invoke-RlcCompose -CommandArguments @("stop", "server", "ollama")
        Write-Host "RLC KI locale arrestata. Database e volumi non sono stati cancellati."
    }
    "test" {
        Invoke-RlcCompose -CommandArguments @("exec", "-T", "server", "npm", "run", "ai:smoke")
    }
    "status" {
        Invoke-RlcCompose -CommandArguments @("ps")
    }
}
