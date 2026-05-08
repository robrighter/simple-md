# Simple MD

A local-first Markdown editor built with Tauri, React, and Rust. The filesystem is the source of truth — no cloud accounts, no proprietary store, no lock-in.

## Features

- **Four view modes**, with the active document always front and center:
  - **Display** — read-only rendered view with GFM, syntax highlighting, and KaTeX math
  - **Text** — raw Markdown source in CodeMirror 6
  - **Hybrid** — true WYSIWYG editing via Milkdown / ProseMirror, lossless Markdown round-trip
  - **Split** — source on the left, rendered preview on the right
- **Inline charts** rendered from fenced ```chart blocks (JSON spec) via Recharts
- **Folder workspaces** with rename / delete via right-click, plus single-file open from disk
- **HTTPS import** of remote Markdown (auto-converts `github.com/.../blob/...` URLs to raw)
- **OS file association** for `.md`, `.markdown`, `.mdown`, `.mkd` — opens the app on double-click
- **Local AI assistant** powered by Gemma 4 running entirely on-device:
  - Pick between Gemma 4 E2B (Q8_0, ~5GB) and E4B (Q4_K_M, ~2.5GB)
  - One-time download with progress, license-gated by Google's Gemma Terms
  - Chat with the active document attached as context
  - **Insert / Replace / Append** assistant replies straight into the editor

## First-run setup

```bash
npm install
npm run ai:fetch-sidecar    # downloads llama-server for your platform (~60MB)
npm run icons:rebuild       # rasterizes app icons from public/favicon.svg (optional)
npm run tauri:dev
```

Required tools on macOS:
- Node 20+
- Rust toolchain (stable)
- `librsvg` (`brew install librsvg`) — only needed if you run `icons:rebuild`

The sidecar fetch script pulls a pinned llama.cpp release from GitHub. If you're on a host the script doesn't recognize, drop a `llama-server` binary into `src-tauri/binaries/llama-server-<rust-target-triple>` manually.

## Day-to-day commands

```bash
npm run tauri:dev                         # full desktop app, hot reload
npm run dev                               # vite-only frontend (some features no-op)
npm run lint                              # eslint flat config
npm run build                             # tsc -b && vite build
npm run tauri:build                       # release bundle
npm run tauri build -- --debug --bundles app    # debug .app bundle
npm run ai:fetch-sidecar                  # refresh the bundled llama-server
npm run icons:rebuild                     # regenerate Tauri icon set from favicon.svg
```

## Project layout

```
src/
  App.tsx                      shell — modes, tabs, workspaces, AI panel
  app/
    types.ts                   DocumentMode, OpenDocument, ChartSpec, etc.
    sampleDocument.ts          welcome doc shown on first launch
  components/                  Toolbar, TabStrip, StatusBar, ModeToggle, WorkspaceSidebar, Dialog
  features/
    editor/
      EditorPane.tsx           CodeMirror 6 source editor (forward-ref EditorApi)
      HybridEditor.tsx         Milkdown WYSIWYG editor for the Hybrid mode
    preview/MarkdownPreview.tsx  react-markdown + remark-gfm + remark-math + KaTeX
    charts/InlineChart.tsx     Recharts renderer for fenced chart blocks
    reports/                   structured-report descriptors
    ai/                        AICallout, AIPanel, LicenseDialog, useAi hook, runtime IPC
  lib/
    desktop.ts                 thin wrappers around Tauri commands + plugin-dialog
    document.ts                path/string helpers + file:// normalization
    chartSpec.ts               chart JSON validation/series inference
src-tauri/
  src/
    lib.rs                     workspace + file commands, OS file-open routing
    ai.rs                      AI runtime: model download, sidecar lifecycle, chat passthrough
  binaries/                    llama-server + dylibs (NOT committed — see .gitignore)
  examples/probe-runtime.rs    standalone end-to-end runtime test
docs/product-and-technical-spec.md   long-form product+tech spec
scripts/
  fetch-llama-server.sh        downloads the AI sidecar from llama.cpp releases
  rebuild-icons.sh             rasterizes favicon.svg into the Tauri icon set
```

## Architecture notes

- **Rust ↔ JS contract:** every Tauri command in `src-tauri/src/lib.rs` and `src-tauri/src/ai.rs` has a matching wrapper in `src/lib/desktop.ts` or `src/features/ai/runtime.ts`. Type changes need to land in both halves.
- **AI sidecar runs out-of-process.** We spawn `llama-server` directly from `src-tauri/binaries/` via `tokio::process::Command` (not Tauri's sidecar mechanism, because that wouldn't co-locate the binary with its dylibs). Health check polls `/health` for up to 120s; if the process dies before that, the user gets the tail of stderr.
- **Mode `wysiwyg` displays as "Hybrid"** in the UI. The internal name `split` used to be `hybrid`; renamed when the WYSIWYG mode shipped.
- **No git repo by default** — this project ships without one. Initialize with `git init` if you want history.

## Build output

The macOS debug app bundle lands at:

```
src-tauri/target/debug/bundle/macos/Simple MD.app
```

Release builds (`npm run tauri:build`) target each platform's installer. DMG packaging on macOS still needs polish.

## Detailed spec

`docs/product-and-technical-spec.md` has the long-form product and technical spec.
