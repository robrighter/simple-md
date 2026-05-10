# Building Simple MD

This document covers building the desktop app for every supported platform. The frontend build (`npm run build`) is identical everywhere; the differences are all in the Rust/Tauri side and the AI sidecar binary.

## Prerequisites (all platforms)

```bash
npm install          # JS dependencies
rustup update stable # keep Rust current
```

The AI feature requires a `llama-server` sidecar binary placed in `src-tauri/binaries/` before building (see per-platform instructions below). Building without it will fail at bundle time because Tauri's `externalBin` requires the file to exist. The sidecar version is pinned to `b9060` in `scripts/fetch-llama-server.sh`; change `LLAMA_VERSION` there (or in your environment) to pin a different release.

---

## macOS

macOS is the primary development target. Both Apple Silicon and Intel are supported.

### Toolchain

- Xcode Command Line Tools: `xcode-select --install`
- Rust targets are installed automatically by rustup when you build.

### Sidecar

The fetch script handles macOS automatically:

```bash
npm run ai:fetch-sidecar        # Apple Silicon (aarch64-apple-darwin)
LLAMA_VERSION=b9060 npm run ai:fetch-sidecar   # pin a specific release
```

For Intel (`x86_64-apple-darwin`) the script also handles it; it detects the host via `uname -m`.

### Build

```bash
npm run tauri:build             # native arch
npx tauri build --target aarch64-apple-darwin    # force Apple Silicon
npx tauri build --target x86_64-apple-darwin     # force Intel
```

Output: `src-tauri/target/<triple>/release/bundle/macos/Simple MD.app`

> **Note:** DMG packaging needs a polish pass per the README — the `.app` bundle is the known-good output.

---

## Windows — ARM64 (aarch64-pc-windows-msvc)

### Toolchain

1. **Rust ARM64 target** — likely already installed if you're on a Windows ARM machine:
   ```powershell
   rustup target add aarch64-pc-windows-msvc
   rustup toolchain install stable-aarch64-pc-windows-msvc
   ```

2. **MSVC ARM64 build tools** — open an **elevated** PowerShell (Run as Administrator) and run:
   ```powershell
   & 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe' modify `
       --installPath 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools' `
       --add Microsoft.VisualStudio.Component.VC.Tools.ARM64 `
       --passive --norestart
   ```
   This installs `vcruntime.lib`, `msvcrt.lib`, and the ARM64 compiler/linker. **Elevation is required** — the installer silently exits 0 without installing if not elevated.

3. **LLVM/Clang** — required by the `ring` crypto crate's ARM64 assembly build:
   ```powershell
   winget install LLVM.LLVM --accept-source-agreements --accept-package-agreements
   ```

### Sidecar

The fetch script does not support Windows. Download the ARM64 CPU binary from the llama.cpp release manually:

```
https://github.com/ggml-org/llama.cpp/releases/download/b9060/llama-b9060-bin-win-cpu-arm64.zip
```

Extract the zip and copy files into `src-tauri/binaries/`:
- Rename `llama-server.exe` → `llama-server-aarch64-pc-windows-msvc.exe`
- Copy all `.dll` files alongside it (`ggml*.dll`, `llama*.dll`, `libomp140.aarch64.dll`, `mtmd.dll`)

### Build

Create a batch file (or run these lines in sequence from a cmd prompt):

```bat
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" arm64
set PATH=C:\Program Files\LLVM\bin;%PATH%
set RUSTUP_TOOLCHAIN=stable-aarch64-pc-windows-msvc
npx tauri build --target aarch64-pc-windows-msvc
```

The `vcvarsall arm64` call sets up the Windows SDK lib paths and MSVC ARM64 environment. LLVM must be prepended to PATH **after** `vcvarsall` because that script rewrites PATH and drops LLVM.

Output:
- `src-tauri/target/aarch64-pc-windows-msvc/release/bundle/msi/Simple MD_0.1.0_arm64_en-US.msi`
- `src-tauri/target/aarch64-pc-windows-msvc/release/bundle/nsis/Simple MD_0.1.0_arm64-setup.exe`

---

## Windows — x64 (x86_64-pc-windows-msvc)

### Toolchain

- VS Build Tools 2022 with the **Desktop development with C++** workload (x64 tools are included by default).
- Rust x64 target (default on x64 Windows):
  ```powershell
  rustup target add x86_64-pc-windows-msvc
  ```

### Sidecar

Download the x64 CPU binary from the llama.cpp release:

```
https://github.com/ggml-org/llama.cpp/releases/download/b9060/llama-b9060-bin-win-cpu-x64.zip
```

Extract and copy into `src-tauri/binaries/`:
- Rename `llama-server.exe` → `llama-server-x86_64-pc-windows-msvc.exe`
- Copy all `.dll` files alongside it

### Build

From a **VS Developer Command Prompt** (or after running `vcvarsall.bat amd64`):

```powershell
npx tauri build --target x86_64-pc-windows-msvc
```

Or without a developer prompt, Cargo will locate the MSVC toolchain automatically on x64 Windows.

Output:
- `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/Simple MD_0.1.0_x64_en-US.msi`
- `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Simple MD_0.1.0_x64-setup.exe`

---

## Linux — x64 (x86_64-unknown-linux-gnu)

### Toolchain

Install system dependencies (Debian/Ubuntu):

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libxdo-dev
```

Rust target:

```bash
rustup target add x86_64-unknown-linux-gnu
```

### Sidecar

The fetch script handles Linux x64 automatically:

```bash
npm run ai:fetch-sidecar
```

This downloads `llama-server` from the llama.cpp Ubuntu x64 release and places it at `src-tauri/binaries/llama-server-x86_64-unknown-linux-gnu`.

### Build

```bash
npm run tauri:build
# or explicitly:
npx tauri build --target x86_64-unknown-linux-gnu
```

Output: `src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/`
(AppImage and/or deb depending on your system)

---

## Notes on the AI sidecar

- The sidecar binary is **not committed** to source control — only a `README.md` placeholder lives in `src-tauri/binaries/`. You must place the correct binary there before building.
- The version pinned in `scripts/fetch-llama-server.sh` is `b9060`. Override with `LLAMA_VERSION=bXXXX npm run ai:fetch-sidecar`.
- GPU-accelerated builds (CUDA, Vulkan, etc.) are available in the llama.cpp releases for platforms that support them. Drop the appropriate `llama-server` binary in place of the CPU one to enable GPU inference.
- If AI is not needed, you can place any valid executable with the correct name as a placeholder and the app will build — the AI panel will show an error at runtime but the editor itself will work normally.
