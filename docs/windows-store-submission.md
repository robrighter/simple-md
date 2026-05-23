# Windows Store Submission Guide — Simple MD

**Store ID:** 9MX452D9DHVQ  
**Package Family Name:** RobRighter.SimpleMD_9frd0hc0c2w54  
**Publisher CN:** CN=231AD612-7448-4A51-A946-11B802E9219B  
**Website:** https://simple-md.robrighter.com

---

## Status

| Step | Status |
|------|--------|
| Version bumped to 1.0.0 | ✅ Done (`tauri.conf.json`, `Cargo.toml`) |
| `tauri.store.conf.json` (no AI sidecar) | ✅ Done |
| `src-tauri/AppxManifest.xml` | ✅ Done |
| `scripts/build-store.ps1` | ✅ Done |
| `Wide310x150Logo.png` generated | ✅ Done |
| MSIX built | ✅ `release/SimpleMD_1.0.0.0_x64.msix` (7 MB) |
| Screenshots | ⬜ Run `scripts\screenshot-store.ps1` from Windows |
| Partner Center form | ⬜ Manual — copy from Steps 4–8 below |
| Upload MSIX | ⬜ Manual — Partner Center > Packages |
| Submit | ⬜ Manual — Partner Center > Submit |

---

## Overview

Submitting a Tauri app to the Windows Store means building a signed MSIX package, configuring the Tauri bundle to use your Partner Center publisher identity, and completing the Partner Center submission form. Steps 1–3 are one-time build/config work. Steps 4–6 are Partner Center form work. Step 7 is the actual upload and submit.

---

## Step 1 — Update Tauri config for Windows Store identity

Tauri generates an `AppxManifest.xml` from `tauri.conf.json`. The publisher identity **must exactly match** what Partner Center assigned you.

### 1a. Update `tauri.windows.conf.json`

The `bundle.windows` section controls the MSIX manifest. Replace the file contents with:

```json
{
  "bundle": {
    "resources": {
      "binaries/*.dll": "./"
    },
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "",
      "wix": {},
      "nsis": {}
    }
  }
}
```

### 1b. Add a `tauri.store.conf.json` for Store-specific overrides

Create `/src-tauri/tauri.store.conf.json`:

```json
{
  "identifier": "RobRighter.SimpleMD",
  "bundle": {
    "publisher": "CN=231AD612-7448-4A51-A946-11B802E9219B",
    "publisherName": "Rob Righter",
    "targets": ["nsis", "msi"],
    "windows": {
      "allowDowngrades": false
    }
  }
}
```

> **Note:** For the actual MSIX Store bundle, build with `tauri build --target x86_64-pc-windows-msvc -- --bundles nsis` and then package as MSIX using the Windows Application Packaging Project, **or** use `tauri build` with the MSIX target once Tauri ships first-class MSIX support. As of Tauri 2.x the recommended Store path is to build the NSIS installer, then wrap it in an MSIX using `MakeAppx` + the Store's package signing. See Step 3.

### 1c. Bump the version in `tauri.conf.json`

The Store requires a 4-part version (`major.minor.patch.0`). Update:

```json
"version": "1.0.0"
```

> Increment for each Store submission. The Store rejects packages with the same or lower version number.

---

## Step 2 — Icon and asset audit

The icons directory already contains the required Store tile sizes. Verify each file exists and is non-placeholder:

| File | Required size | Status |
|------|--------------|--------|
| `icons/StoreLogo.png` | 50×50 | Check |
| `icons/Square44x44Logo.png` | 44×44 | Check |
| `icons/Square71x71Logo.png` | 71×71 | Check |
| `icons/Square89x89Logo.png` | 89×89 | Check |
| `icons/Square107x107Logo.png` | 107×107 | Check |
| `icons/Square142x142Logo.png` | 142×142 | Check |
| `icons/Square150x150Logo.png` | 150×150 | Check |
| `icons/Square284x284Logo.png` | 284×284 | Check |
| `icons/Square310x310Logo.png` | 310×310 | Check |
| `icons/Square30x30Logo.png` | 30×30 | Check |

All icons must be real artwork — Microsoft rejects placeholder icons. Check them with an image viewer before submitting.

---

## Step 3 — Build and package the MSIX

### 3a. Build the MSIX (automated)

Run the Store build script from the repo root on a Windows machine:

```powershell
.\scripts\build-store.ps1
```

This script:
- Builds the Tauri release binary without the AI sidecar
- Stages the MSIX layout under `src-tauri/target/msix-staging/`
- Runs MakeAppx to produce `release/SimpleMD_1.0.0.0_x64.msix`

**The MSIX has already been built:** `release/SimpleMD_1.0.0.0_x64.msix` (7 MB)

### 3b. Sign the package for local testing (optional)

For Store submission the package is **re-signed by Microsoft** — you do not need a code-signing certificate. To sideload-test before upload, sign with a self-signed cert:

```powershell
New-SelfSignedCertificate -Type Custom -Subject "CN=231AD612-7448-4A51-A946-11B802E9219B" `
  -KeyUsage DigitalSignature -FriendlyName "SimpleMD Test" `
  -CertStoreLocation "Cert:\CurrentUser\My" -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")

SignTool.exe sign /fd sha256 /a /f <cert.pfx> /p <password> SimpleMD_1.0.0.0_x64.msix
```

### 3d. ⚠️ Bundled AI sidecar — Store policy check required

Simple MD bundles `llama-server` as an external binary (`externalBin` in `tauri.conf.json`). Microsoft's Store policy (section 10.2) restricts apps from running arbitrary executables not declared in the manifest. Before submitting:

- [ ] Review [Microsoft Store Policy 10.2](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies#102-security) regarding executable content.
- [ ] Consider whether to **exclude the AI feature from the Store build** and offer it separately, or to declare the sidecar explicitly in the AppxManifest as an `<uap3:Extension>` with `EntryPoint="Windows.FullTrustApplication"`.
- [ ] If keeping AI: add the `runFullTrust` restricted capability to the manifest. Note this capability requires Microsoft approval and will delay certification.

The safest path for the initial Store release is to **build a Store variant without the AI sidecar** and ship the AI feature through direct download only, then re-submit with the sidecar once you have Microsoft approval for the restricted capability.

---

## Step 4 — Partner Center: App properties

Log in at [partner.microsoft.com](https://partner.microsoft.com) → Apps and games → Simple MD.

### Category and subcategory
- **Category:** Productivity
- **Subcategory:** Documents

### Support info
- **Website:** `https://simple-md.robrighter.com`
- **Privacy policy URL:** `https://simple-md.robrighter.com/privacy`
- **Support contact:** `robrighter@gmail.com`

### Product declarations

| Declaration | Value |
|-------------|-------|
| This app has been tested to meet accessibility guidelines | Check if true, otherwise leave unchecked |
| This product requires access to the internet to work | No (local-first) |
| This product requires the purchase of a separate app or service | No |
| This product accesses personal information from external sources | No (note: AI feature does not send data externally — model runs locally) |

---

## Step 5 — Age ratings (IARC questionnaire)

Complete the IARC rating questionnaire inside Partner Center. For Simple MD, expected answers:

- Violence: None
- Adult/mature content: None
- Gambling: No
- User-generated content shared online: No
- In-app purchases: No
- Location data: No
- Personal data collected: No (or "used only on device" if AI settings count)

Expected rating: **ESRB Everyone / PEGI 3** (all regions).

---

## Step 6 — Store listing

Navigate to **Store listings → English (United States)**. Fill in the following fields.

### App name
```
Simple MD
```

### Short description (max 150 characters)
```
A local-first Markdown editor with live preview, hybrid editing, math support, and built-in AI — your files, your machine.
```

### Description (max 10,000 characters)

```
Simple MD is a fast, calm Markdown editor that keeps your files exactly where they belong — on your hard drive, in normal folders, with no cloud account required.

Write in plain Markdown, read in a clean rendered view, or use Hybrid mode to edit your document visually while Markdown stays the underlying format. Switch modes at any time from the toolbar. Your content is always a real .md file.

WHAT YOU CAN DO

• Open any folder as a workspace and browse your Markdown files in a sidebar tree
• Edit in Source mode with a full-featured code editor (syntax highlighting, undo/redo, find/replace)
• Read in Display mode with a clean, high-fidelity rendered view
• Write naturally in Hybrid mode — bold, headings, lists, and links render as you type, but the file stays Markdown
• Use Split mode to see source and preview side by side
• Write math with LaTeX — both inline ($...$) and block ($$...$$) expressions render correctly
• Embed charts directly in your Markdown using simple JSON code fences
• Open .md, .markdown, .mdown, and .mkd files directly from File Explorer — Simple MD can be your system default Markdown editor
• Import public Markdown documents from HTTPS URLs
• Keep recent files and workspaces a click away from the sidebar

LOCAL-FIRST AND PRIVATE

Simple MD has no account, no sync, no telemetry, and no subscription. Every file you open or create is a plain text file you own completely. Close the app and your files are right there in your folders, readable in any text editor.

BUILT FOR REAL MARKDOWN

Simple MD renders GitHub-Flavored Markdown, tables, task lists, footnotes, and code blocks with syntax highlighting. Math rendering uses KaTeX for accuracy and speed. Charts are rendered with Recharts.

OPEN MULTIPLE DOCUMENTS

Work with multiple files at the same time using the tab strip. Each document remembers its view mode. Unsaved scratch documents are supported — start writing immediately and save whenever you're ready.

Simple MD is built on Tauri and Rust for a small, fast, native Windows application. It uses React and CodeMirror for its editing surfaces.
```

### What's new in this version
```
Initial release on the Microsoft Store.
```

### Keywords (helps search ranking, comma-separated)
```
markdown, markdown editor, notes, writing, text editor, local notes, offline editor, math editor, LaTeX, KaTeX, note taking, document editor, plain text, .md
```

### Copyright and trademark info
```
© 2026 Rob Righter
```

---

## Step 7 — Screenshots

Microsoft requires at least **4 screenshots** at **1366×768 or larger** (up to 3840×2160). Recommended: 4–10 screenshots at **1920×1080**.

### Run the screenshot helper

An interactive screenshot script is ready. From a Windows PowerShell window (not WSL):

```powershell
cd C:\Users\robri\development\simple-md
.\scripts\screenshot-store.ps1
```

The script launches Simple MD, resizes it to 1920×1080, and guides you through 5 scenes — pressing ENTER between each one to capture. Screenshots save to `release\screenshots\`.

Alternatively, run the app manually and capture each scene:

| File | What to show | Mode |
|------|-------------|------|
| `01-display-mode.png` | Rendered headers, a table, sidebar open | Display |
| `02-hybrid-mode.png` | Editing with rich text rendering, cursor visible | Hybrid |
| `03-split-mode.png` | Source left, preview right | Split |
| `04-workspace-tabs.png` | 3+ open document tabs, sidebar file tree | Display |
| `05-math-rendering.png` | LaTeX equations rendered (KaTeX) | Display |

You also need a **Store icon** at 300×300 pixels — this is different from the tile icons. Export a 300×300 version of the app icon and upload it under **Store listings → Store logos**.

---

## Step 8 — Pricing and availability

- **Price:** Free (or set your price tier)
- **Markets:** Leave as "All available markets" unless you want to restrict
- **Visibility:** Public
- **Release schedule:** Release as soon as it passes certification (recommended for first submission)

---

## Step 9 — Packages upload

1. In Partner Center → **Packages**, click **Upload your packages**.
2. Upload the `.msix` file built in Step 3.
3. Partner Center will parse the manifest and display:
   - **Package family name:** RobRighter.SimpleMD_9frd0hc0c2w54 ✓
   - **Architecture:** x64
   - **Version:** 1.0.0.0
4. Verify the fields match your Partner Center package identity. If they don't match, the upload will fail with an identity mismatch error — go back to Step 1.

### OS version targeting

Set the minimum OS version to **Windows 10 version 1809 (10.0.17763.0)** — this is what Tauri 2 / WebView2 requires.

---

## Step 10 — Certification notes (optional text to reviewers)

In the **Notes for certification** field, add:

```
Simple MD is a local Markdown editor. It reads and writes .md files on the user's local filesystem using Tauri's filesystem APIs. It does not connect to any external services during normal operation. The app optionally fetches public Markdown documents from HTTPS URLs when the user explicitly provides a URL using the Import feature. No telemetry, no accounts, no cloud sync.

File type associations (.md, .markdown, .mdown, .mkd) are declared in the package manifest and are used to open files from File Explorer.

Test instructions: launch the app, click New > Note, type some Markdown, switch between Display / Hybrid / Split / Source modes using the tabs in the toolbar, and save the file. To test file association, right-click any .md file in Explorer and choose Open With > Simple MD.
```

---

## Step 11 — Submit

1. Review the **Submission summary** page — all sections should show a green checkmark.
2. Click **Submit to the Store**.
3. Certification typically takes **1–3 business days** for a new app, up to 7 days if manual review is triggered.
4. You will receive email updates at `robrighter@gmail.com` as the submission moves through each stage.

---

## Post-approval checklist

- [ ] The Store deep link and Web Store URL will be available in Partner Center once the app is live — add both to `simple-md.robrighter.com`.
- [ ] Add a "Get it on Windows" badge to the website (Microsoft provides official badge assets).
- [ ] Update the README and product spec with the Store link.
- [ ] Set up a Store submission update process: every release needs a version bump in `tauri.conf.json` (the Store rejects equal or lower versions), a new MSIX build, and a Partner Center package update.

---

## Quick reference: Partner Center URLs

| Page | URL |
|------|-----|
| Dashboard | https://partner.microsoft.com/dashboard |
| Your app | https://partner.microsoft.com/dashboard/products/9MX452D9DHVQ |
| Store policies | https://learn.microsoft.com/en-us/windows/apps/publish/store-policies |
| MSIX Packaging Tool | https://apps.microsoft.com/detail/9n5lw3jbcxkf |
| Required Store assets spec | https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/screenshots-and-images |
