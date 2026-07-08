# Build Simple MD as a Windows Store MSIX bundle (x64 + arm64, no AI sidecar).
# Run from the repo root on Windows: .\scripts\build-store.ps1
#
# Prerequisites:
#   - Rust / cargo with targets: x86_64-pc-windows-msvc, aarch64-pc-windows-msvc
#   - Node.js / npm
#   - Windows SDK 10.0.26100+ (for MakeAppx.exe)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot  = Split-Path $PSScriptRoot -Parent
$Version   = "1.1.2.0"
$MakeAppx  = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe"
$TauriCmd  = Join-Path $RepoRoot "node_modules\.bin\tauri.cmd"

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

    # ── 2. Build frontend once (shared by both arch builds) ───────────────────
    Write-Host "Building frontend (store build, no AI)..." -ForegroundColor Cyan
    $env:SIMPLE_MD_STORE_BUILD = '1'
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed." }

    $StoreConfig = Join-Path $RepoRoot "src-tauri\tauri.store.conf.json"

    # ── 3. Helper: build one arch, stage it, pack it to .msix ─────────────────
    function Build-Arch {
        param(
            [string]$Target,
            [string]$Arch,          # "x64" or "arm64"
            [string]$ManifestFile   # path to the AppxManifest for this arch
        )

        Write-Host ""
        Write-Host "Building $Arch release binary..." -ForegroundColor Cyan

        # Run tauri build for this target (frontend already built, skip beforeBuildCommand)
        & $TauriCmd build --target $Target --config $StoreConfig --bundles nsis | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Error "tauri build failed for $Arch." }

        # Locate compiled binary
        $BinDir = Join-Path $RepoRoot "src-tauri\target\$Target\release"
        $AppExe = Get-ChildItem $BinDir -Filter "*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch "(?i)(setup|install|uninstall|crash)" } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if (-not $AppExe) { Write-Error "Could not find app executable in $BinDir" }
        Write-Host "  Binary: $($AppExe.FullName)" -ForegroundColor DarkGray

        # Stage MSIX layout
        $Stage     = Join-Path $RepoRoot "src-tauri\target\msix-staging-$Arch"
        $AssetsDir = Join-Path $Stage "Assets"
        if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
        New-Item -ItemType Directory -Path $Stage    | Out-Null
        New-Item -ItemType Directory -Path $AssetsDir | Out-Null

        Copy-Item $AppExe.FullName (Join-Path $Stage "simple-md.exe")
        Copy-Item $ManifestFile    (Join-Path $Stage "AppxManifest.xml")

        $Icons = @(
            "StoreLogo.png","Square30x30Logo.png","Square44x44Logo.png",
            "Square71x71Logo.png","Square89x89Logo.png","Square107x107Logo.png",
            "Square142x142Logo.png","Square150x150Logo.png","Square284x284Logo.png",
            "Square310x310Logo.png","Wide310x150Logo.png"
        )
        foreach ($icon in $Icons) {
            $src = Join-Path $RepoRoot "src-tauri\icons\$icon"
            if (Test-Path $src) { Copy-Item $src (Join-Path $AssetsDir $icon) }
            else { Write-Warning "Icon missing: $icon" }
        }

        # Pack to individual .msix
        $OutDir  = Join-Path $RepoRoot "release"
        if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
        $MsixOut = Join-Path $OutDir "SimpleMD_${Version}_${Arch}.msix"

        Write-Host "  Packing $Arch MSIX..." -ForegroundColor Cyan
        & $MakeAppx pack /d $Stage /p $MsixOut /nv /o | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Error "MakeAppx pack failed for $Arch." }
        Write-Host "  Packed: $MsixOut" -ForegroundColor DarkGray

        return $MsixOut
    }

    # ── 4. Build both architectures ───────────────────────────────────────────
    $X64Msix   = Build-Arch `
        -Target "x86_64-pc-windows-msvc" `
        -Arch   "x64" `
        -ManifestFile (Join-Path $RepoRoot "src-tauri\AppxManifest.xml")

    $Arm64Msix = Build-Arch `
        -Target "aarch64-pc-windows-msvc" `
        -Arch   "arm64" `
        -ManifestFile (Join-Path $RepoRoot "src-tauri\AppxManifest.arm64.xml")

    # ── 5. Bundle both .msix into one .msixbundle ─────────────────────────────
    $BundleStage = Join-Path $RepoRoot "src-tauri\target\msix-bundle-staging"
    if (Test-Path $BundleStage) { Remove-Item -Recurse -Force $BundleStage }
    New-Item -ItemType Directory -Path $BundleStage | Out-Null

    Copy-Item $X64Msix   $BundleStage
    Copy-Item $Arm64Msix $BundleStage

    $OutBundle = Join-Path $RepoRoot "release\SimpleMD_${Version}.msixbundle"
    Write-Host ""
    Write-Host "Bundling x64 + arm64 into .msixbundle..." -ForegroundColor Cyan
    & $MakeAppx bundle /d $BundleStage /p $OutBundle /o
    if ($LASTEXITCODE -ne 0) { Write-Error "MakeAppx bundle failed." }

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host " Bundle ready: $OutBundle"                          -ForegroundColor Green
    Write-Host " Upload this file to Partner Center > Packages."   -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green

} finally {
    $env:SIMPLE_MD_STORE_BUILD = ''
    Pop-Location
}
