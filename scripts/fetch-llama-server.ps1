# Downloads a llama.cpp llama-server binary for Windows and drops it into
# src-tauri/binaries/llama-server-<rust-target-triple>.exe so Tauri's
# externalBin can pick it up at bundle time.
#
# Run once before `npm run tauri:dev` or `npm run tauri:build`.
#
# Override $env:LLAMA_VERSION or pass -LlamaVersion to pin a release.
#   $env:LLAMA_VERSION = "b9060"; .\scripts\fetch-llama-server.ps1
#   .\scripts\fetch-llama-server.ps1 -LlamaVersion b9060 -Force

param(
    [string]$LlamaVersion = "",
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $LlamaVersion) {
    $LlamaVersion = if ($env:LLAMA_VERSION) { $env:LLAMA_VERSION } else { "b9060" }
}

$RepoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $RepoRoot

$RustTarget = if ($env:CARGO_BUILD_TARGET) {
    $env:CARGO_BUILD_TARGET
} else {
    $Arch = (Get-CimInstance Win32_OperatingSystem).OSArchitecture
    if ($Arch -match "ARM") {
        "aarch64-pc-windows-msvc"
    } else {
        "x86_64-pc-windows-msvc"
    }
}

$WinArch = if ($RustTarget -like "aarch64*") { "arm64" } else { "x64" }
$Asset = "llama-$LlamaVersion-bin-win-cpu-$WinArch.zip"
$Url = "https://github.com/ggml-org/llama.cpp/releases/download/$LlamaVersion/$Asset"

$DestDir = Join-Path $RepoRoot "src-tauri\binaries"
$DestFile = Join-Path $DestDir "llama-server-$RustTarget.exe"
New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

if ((Test-Path $DestFile) -and -not $Force -and $env:FORCE -ne "1") {
    Write-Host "llama-server already present at $DestFile; skipping (use -Force or FORCE=1 to re-download)." -ForegroundColor Yellow
    return
}

$WorkDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

try {
    $ZipPath = Join-Path $WorkDir "llama.zip"
    Write-Host "Downloading $Asset..." -ForegroundColor Cyan

    $Retries = 3
    for ($i = 1; $i -le $Retries; $i++) {
        try {
            Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
            break
        } catch {
            if ($i -eq $Retries) { throw }
            Write-Host "  Retry $i/$Retries..."
            Start-Sleep -Seconds 2
        }
    }

    Write-Host "Extracting..." -ForegroundColor Cyan
    Expand-Archive -Path $ZipPath -DestinationPath $WorkDir -Force

    $Exe = Get-ChildItem -Path $WorkDir -Filter "llama-server.exe" -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $Exe) {
        Write-Error "Could not find llama-server.exe in the downloaded archive."
        exit 1
    }

    Copy-Item -Path $Exe.FullName -Destination $DestFile -Force

    $ExtractedDir = $Exe.DirectoryName
    Get-ChildItem -Path $ExtractedDir -Filter "*.dll" | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $DestDir -Force
        Write-Host "  Copied $($_.Name)"
    }

    Write-Host "Installed sidecar at $DestFile" -ForegroundColor Green
} finally {
    Remove-Item -Recurse -Force $WorkDir -ErrorAction SilentlyContinue
}
