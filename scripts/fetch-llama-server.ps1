# Downloads llama-server.exe for Windows x64 and places it where Tauri's
# externalBin can find it at bundle time.
# Run once before building: .\scripts\fetch-llama-server.ps1

param(
    [string]$LlamaVersion = "",
    [switch]$Force
)

if (-not $LlamaVersion) {
    $LlamaVersion = if ($env:LLAMA_VERSION) { $env:LLAMA_VERSION } else { "b9060" }
}

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path $PSScriptRoot -Parent
$RustTarget = if ($env:CARGO_BUILD_TARGET) { $env:CARGO_BUILD_TARGET } else {
    $arch = (rustc -Vv 2>$null | Select-String "host:").ToString().Split(":")[1].Trim()
    $arch
}
$DestDir = Join-Path $RepoRoot "src-tauri\binaries"
$Dest = Join-Path $DestDir "llama-server-$RustTarget.exe"

if ((Test-Path $Dest) -and -not $Force) {
    Write-Host "llama-server already present at $Dest; skipping (use -Force to re-download)." -ForegroundColor Yellow
    return
}

$WinArch = if ($RustTarget -like "aarch64*") { "arm64" } else { "x64" }
$Asset = "llama-$LlamaVersion-bin-win-cpu-$WinArch.zip"
$Url = "https://github.com/ggml-org/llama.cpp/releases/download/$LlamaVersion/$Asset"

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

$TempZip = Join-Path $env:TEMP "llama-server-$LlamaVersion.zip"
$TempDir = Join-Path $env:TEMP "llama-server-$LlamaVersion"

try {
    Write-Host "Downloading $Asset..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $Url -OutFile $TempZip -UseBasicParsing

    Write-Host "Extracting..." -ForegroundColor Cyan
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
    Expand-Archive -Path $TempZip -DestinationPath $TempDir

    $Exe = Get-ChildItem $TempDir -Recurse -Filter "llama-server.exe" |
        Select-Object -First 1

    if (-not $Exe) {
        Write-Error "Could not find llama-server.exe in the downloaded archive."
    }

    Copy-Item $Exe.FullName $Dest -Force
    Write-Host "Installed sidecar at $Dest" -ForegroundColor Green

    # Copy companion DLLs — llama.cpp splits the binary from its libraries
    $Dlls = Get-ChildItem (Split-Path $Exe.FullName) -Filter "*.dll"
    foreach ($Dll in $Dlls) {
        Copy-Item $Dll.FullName (Join-Path $DestDir $Dll.Name) -Force
        Write-Host "  + $($Dll.Name)" -ForegroundColor DarkGray
    }
} finally {
    Remove-Item $TempZip -ErrorAction SilentlyContinue
    Remove-Item $TempDir -Recurse -ErrorAction SilentlyContinue
}
