# Capture Windows Store screenshots for Simple MD.
# Run AFTER building the app. Saves PNGs to release\screenshots\.
# Each screenshot pauses so you can set up the right scene before capture.
#
# Usage: .\scripts\screenshot-store.ps1
# Optionally pass -AppPath to override the executable location.

param(
    [string]$AppPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$RepoRoot   = Split-Path $PSScriptRoot -Parent
$OutDir     = Join-Path $RepoRoot "release\screenshots"
$Target     = "x86_64-pc-windows-msvc"

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

# Resolve app path
if (-not $AppPath) {
    $Candidates = @(
        (Join-Path $RepoRoot "src-tauri\target\$Target\release\simple_md.exe"),
        (Join-Path $RepoRoot "src-tauri\target\release\simple_md.exe"),
        (Join-Path $RepoRoot "release\windows-x64\simple-md-x64.exe")
    )
    foreach ($c in $Candidates) {
        if (Test-Path $c) { $AppPath = $c; break }
    }
}

if (-not $AppPath -or -not (Test-Path $AppPath)) {
    Write-Error "Could not find Simple MD executable. Run build-store.ps1 first, or pass -AppPath."
}

Write-Host "Using executable: $AppPath" -ForegroundColor DarkGray

function Take-Screenshot {
    param([string]$FileName, [string]$Scene)

    Write-Host ""
    Write-Host "── SCREENSHOT: $Scene ──" -ForegroundColor Yellow
    Write-Host "  Set up the app as described, then press ENTER to capture."
    Write-Host "  The screenshot will capture the full 1920x1080 window."
    Read-Host "  Press ENTER when ready"

    # Resize and position window (best-effort)
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@ -ErrorAction SilentlyContinue

    $hwnd = [Win32]::FindWindow($null, "Simple MD")
    if ($hwnd -ne [IntPtr]::Zero) {
        [Win32]::ShowWindow($hwnd, 3)   # SW_MAXIMIZE
        [Win32]::SetForegroundWindow($hwnd)
        Start-Sleep -Milliseconds 500
    }

    # Capture at 1920x1080 from top-left of primary screen
    $bmp    = New-Object System.Drawing.Bitmap(1920, 1080)
    $gfx    = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen(0, 0, 0, 0, [System.Drawing.Size]::new(1920, 1080))
    $gfx.Dispose()

    $path = Join-Path $OutDir $FileName
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Host "  Saved: $path" -ForegroundColor Green
}

# Launch the app
Write-Host "Launching Simple MD..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $AppPath -PassThru
Start-Sleep -Seconds 4

Write-Host ""
Write-Host "Simple MD should now be running." -ForegroundColor Cyan
Write-Host "You will be guided through 5 screenshot scenes." -ForegroundColor Cyan
Write-Host "Resize the window to 1920x1080 and position it at the top-left of your screen."
Write-Host ""

# ── Scene 1: Display mode with rich content ────────────────────────────────────
Write-Host "SCENE 1 of 5 — Display mode" -ForegroundColor Magenta
Write-Host "  Open a document that has headings, a table, and ideally some math."
Write-Host "  Click the 'Display' tab to switch to rendered preview."
Write-Host "  Open the workspace sidebar so the file tree is visible."
Take-Screenshot "01-display-mode.png" "Display mode — rendered preview with sidebar"

# ── Scene 2: Hybrid/WYSIWYG mode ──────────────────────────────────────────────
Write-Host "SCENE 2 of 5 — Hybrid mode" -ForegroundColor Magenta
Write-Host "  Same document. Click the 'Hybrid' tab."
Write-Host "  Place the cursor somewhere mid-paragraph so the edit state is visible."
Take-Screenshot "02-hybrid-mode.png" "Hybrid mode — editable rendered view"

# ── Scene 3: Split mode ────────────────────────────────────────────────────────
Write-Host "SCENE 3 of 5 — Split mode" -ForegroundColor Magenta
Write-Host "  Click the 'Split' tab to show source on left and preview on right."
Take-Screenshot "03-split-mode.png" "Split mode — source left, preview right"

# ── Scene 4: Workspace tree + multiple tabs ────────────────────────────────────
Write-Host "SCENE 4 of 5 — Workspace + tabs" -ForegroundColor Magenta
Write-Host "  Open 2-3 documents so the tab strip shows multiple tabs."
Write-Host "  Make sure the sidebar workspace tree is expanded."
Write-Host "  Display mode is fine."
Take-Screenshot "04-workspace-tabs.png" "Workspace sidebar + multiple document tabs"

# ── Scene 5: Math rendering ────────────────────────────────────────────────────
Write-Host "SCENE 5 of 5 — Math rendering" -ForegroundColor Magenta
Write-Host "  Open (or create) a document with LaTeX math."
Write-Host "  Example inline math: \$E = mc^2\$"
Write-Host "  Example block math: \$\$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}\$\$"
Write-Host "  Switch to Display mode so equations render."
Take-Screenshot "05-math-rendering.png" "Math / LaTeX rendering in Display mode"

Write-Host ""
Write-Host "All screenshots saved to: $OutDir" -ForegroundColor Green
Write-Host "Review them, then upload to Partner Center > Store listings > Screenshots." -ForegroundColor Green
