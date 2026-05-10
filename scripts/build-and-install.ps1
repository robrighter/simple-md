# Build Simple MD and launch the installer.
# Run from the repo root: .\scripts\build-and-install.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path $PSScriptRoot -Parent

Push-Location $RepoRoot
try {
    # Ensure dependencies are installed
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing dependencies..." -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed." }
    }

    # Fetch the llama-server sidecar if missing (required by Tauri's externalBin)
    $Sidecar = "src-tauri\binaries\llama-server-x86_64-pc-windows-msvc.exe"
    if (-not (Test-Path $Sidecar)) {
        Write-Host "Fetching llama-server sidecar..." -ForegroundColor Cyan
        & "$PSScriptRoot\fetch-llama-server.ps1"
    }

    # Use the local tauri CLI directly
    $TauriCmd = "node_modules\.bin\tauri.cmd"
    if (-not (Test-Path $TauriCmd)) {
        Write-Error "Tauri CLI not found at $TauriCmd. Run 'npm install' and try again."
    }

    Write-Host "Building Simple MD release..." -ForegroundColor Cyan
    & $TauriCmd build --target x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { Write-Error "tauri build failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}

# Prefer the NSIS .exe installer; fall back to MSI.
# With --target the output lands under target\<triple>\release\bundle.
$BundleRoot = Join-Path $RepoRoot "src-tauri\target\x86_64-pc-windows-msvc\release\bundle"
$Installer = Get-ChildItem "$BundleRoot\nsis\*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $Installer) {
    $Installer = Get-ChildItem "$BundleRoot\msi\*.msi" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if (-not $Installer) {
    Write-Error "No installer found under $BundleRoot. Check the build output above for errors."
}

Write-Host ""
Write-Host "Launching installer: $($Installer.Name)" -ForegroundColor Green
Start-Process -FilePath $Installer.FullName
