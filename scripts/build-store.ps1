# Build Simple MD as a Windows Store MSIX package (no AI sidecar).
# Run from the repo root on Windows: .\scripts\build-store.ps1
#
# Prerequisites:
#   - Rust / cargo (stable-x86_64-pc-windows-msvc)
#   - Node.js / npm
#   - Windows SDK 10.0.26100+ (for MakeAppx.exe)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot   = Split-Path $PSScriptRoot -Parent
$Target     = "x86_64-pc-windows-msvc"
$Version    = "1.0.0.0"
$MakeAppx   = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe"
$TauriCmd   = Join-Path $RepoRoot "node_modules\.bin\tauri.cmd"

if (-not (Test-Path $MakeAppx)) {
    Write-Error "MakeAppx.exe not found at $MakeAppx. Install the Windows 10 SDK."
}

Push-Location $RepoRoot
try {
    # ── 1. Install npm dependencies ────────────────────────────────────────────
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed." }
    }

    if (-not (Test-Path $TauriCmd)) {
        Write-Error "Tauri CLI not found at $TauriCmd. Run 'npm install' first."
    }

    # ── 2. Build release binary (no AI sidecar) ────────────────────────────────
    # SIMPLE_MD_STORE_BUILD=1 tells Vite to compile out the AI UI entirely.
    # tauri.store.conf.json overrides externalBin to [] so tauri-build does not
    # require the llama-server sidecar binary to be present.
    Write-Host "Building Store release (target: $Target, no AI)..." -ForegroundColor Cyan
    $env:SIMPLE_MD_STORE_BUILD = '1'
    $StoreConfig = Join-Path $RepoRoot "src-tauri\tauri.store.conf.json"
    & $TauriCmd build --target $Target --config $StoreConfig --bundles nsis
    $env:SIMPLE_MD_STORE_BUILD = ''
    if ($LASTEXITCODE -ne 0) { Write-Error "tauri build failed." }

    # ── 3. Locate the compiled binary ──────────────────────────────────────────
    $BinDir = Join-Path $RepoRoot "src-tauri\target\$Target\release"
    $AppExe = Get-ChildItem $BinDir -Filter "*.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "(?i)(setup|install|uninstall|crash)" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $AppExe) { Write-Error "Could not find app executable in $BinDir" }
    Write-Host "Found binary: $($AppExe.FullName)" -ForegroundColor DarkGray

    # ── 4. Stage MSIX layout ───────────────────────────────────────────────────
    $MsixStage = Join-Path $RepoRoot "src-tauri\target\msix-staging"
    $AssetsDir  = Join-Path $MsixStage "Assets"

    if (Test-Path $MsixStage) { Remove-Item -Recurse -Force $MsixStage }
    New-Item -ItemType Directory -Path $MsixStage | Out-Null
    New-Item -ItemType Directory -Path $AssetsDir  | Out-Null

    # Main binary (renamed to match AppxManifest Executable="simple-md.exe")
    Copy-Item $AppExe.FullName (Join-Path $MsixStage "simple-md.exe")

    # Icons
    $Icons = @(
        "StoreLogo.png",
        "Square30x30Logo.png",
        "Square44x44Logo.png",
        "Square71x71Logo.png",
        "Square89x89Logo.png",
        "Square107x107Logo.png",
        "Square142x142Logo.png",
        "Square150x150Logo.png",
        "Square284x284Logo.png",
        "Square310x310Logo.png",
        "Wide310x150Logo.png"
    )
    foreach ($icon in $Icons) {
        $src = Join-Path $RepoRoot "src-tauri\icons\$icon"
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $AssetsDir $icon)
        } else {
            Write-Warning "Icon missing: $icon"
        }
    }

    # Manifest
    Copy-Item (Join-Path $RepoRoot "src-tauri\AppxManifest.xml") (Join-Path $MsixStage "AppxManifest.xml")

    Write-Host "MSIX staging layout:" -ForegroundColor DarkGray
    Get-ChildItem $MsixStage -Recurse | Select-Object FullName | ForEach-Object { Write-Host "  $($_.FullName.Replace($MsixStage, ''))" -ForegroundColor DarkGray }

    # ── 5. Create MSIX with MakeAppx ───────────────────────────────────────────
    $OutDir  = Join-Path $RepoRoot "release"
    $OutMsix = Join-Path $OutDir "SimpleMD_${Version}_x64.msix"

    if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

    Write-Host "Running MakeAppx..." -ForegroundColor Cyan
    & $MakeAppx pack /d $MsixStage /p $OutMsix /nv /o
    if ($LASTEXITCODE -ne 0) { Write-Error "MakeAppx failed." }

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host " MSIX ready: $OutMsix" -ForegroundColor Green
    Write-Host " Upload this file to Partner Center > Packages." -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green

} finally {
    Pop-Location
}
