# Downloads a llama.cpp `llama-server` binary for Windows (x64)
# and drops it into src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe
# so Tauri's `externalBin` can pick it up at bundle time.
#
# Run once before `npm run tauri:dev` or `npm run tauri:build`.
#
# Override $env:LLAMA_VERSION to pin a specific upstream release.
#   e.g.  $env:LLAMA_VERSION = "b9060"; .\scripts\fetch-llama-server.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $ScriptDir "..")

$LlamaVersion = if ($env:LLAMA_VERSION) { $env:LLAMA_VERSION } else { "b9060" }
$ReleaseBase  = "https://github.com/ggml-org/llama.cpp/releases/download/$LlamaVersion"

# Determine target triple and asset name based on Windows architecture
$Arch = (Get-WmiObject Win32_OperatingSystem).OSArchitecture
if ($Arch -match "ARM") {
    # ARM64 Windows — use native CPU build
    $RustTarget = "aarch64-pc-windows-msvc"
    $Asset      = "llama-$LlamaVersion-bin-win-cpu-arm64.zip"
} else {
    # x64 Windows (default; also runs on ARM64 via emulation)
    $RustTarget = "x86_64-pc-windows-msvc"
    $Asset      = "llama-$LlamaVersion-bin-win-cpu-x64.zip"
}

$DestDir  = "src-tauri\binaries"
$DestFile = Join-Path $DestDir "llama-server-$RustTarget.exe"
New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

$Force = if ($env:FORCE -eq "0") { $false } else { $true }
if ((Test-Path $DestFile) -and -not $Force) {
    Write-Host "llama-server already present at $DestFile; skipping (FORCE=0)." -ForegroundColor Yellow
    exit 0
}

$WorkDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

try {
    $ZipPath = Join-Path $WorkDir "llama.zip"
    Write-Host "Downloading $Asset..."
    $retries = 3
    for ($i = 1; $i -le $retries; $i++) {
        try {
            Invoke-WebRequest -Uri "$ReleaseBase/$Asset" -OutFile $ZipPath -UseBasicParsing
            break
        } catch {
            if ($i -eq $retries) { throw }
            Write-Host "  Retry $i/$retries..."
            Start-Sleep -Seconds 2
        }
    }

    Write-Host "Extracting..."
    Expand-Archive -Path $ZipPath -DestinationPath $WorkDir -Force

    $Exe = Get-ChildItem -Path $WorkDir -Filter "llama-server.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $Exe) {
        Write-Error "Could not find llama-server.exe in the downloaded archive."
        exit 1
    }

    Copy-Item -Path $Exe.FullName -Destination $DestFile -Force

    # Copy companion DLLs (ggml.dll, llama.dll, etc.)
    $ExtractedDir = $Exe.DirectoryName
    Get-ChildItem -Path $ExtractedDir -Filter "*.dll" | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $DestDir -Force
        Write-Host "  Copied $($_.Name)"
    }

    Write-Host "Installed sidecar at $DestFile" -ForegroundColor Green
} finally {
    Remove-Item -Recurse -Force $WorkDir -ErrorAction SilentlyContinue
}
