# Simple MD

Local-first desktop Markdown editor. Tauri 2 + Rust backend, React 19 + TypeScript + Vite frontend. macOS is the primary target today (Windows/Linux are in scope per the spec but unverified).

The filesystem is the source of truth — no proprietary store, no cloud, no DB.

Detailed product/tech spec: `docs/product-and-technical-spec.md`.

## Commands

```bash
npm install
npm run dev          # Vite only (browser at :1420, no Tauri shell)
npm run lint         # eslint flat config
npm run build        # tsc -b && vite build (writes ./dist)
npm run tauri:dev    # full desktop app, hot reload
npm run tauri:build  # release bundle (DMG packaging is not yet polished)
npm run tauri build -- --debug --bundles app   # debug .app bundle
```

Debug app bundle output: `src-tauri/target/debug/bundle/macos/Simple MD.app`.

## Layout

```
src/
  App.tsx                  Top-level shell: tabs, workspaces, modes, file ops, recents
  main.tsx                 React entry
  app/
    types.ts               DocumentMode, TreeNode, OpenDocument, ChartSpec, etc.
    sampleDocument.ts      Welcome doc + sidebar hint
  components/              Pure presentational shell pieces (Toolbar, TabStrip, StatusBar, ModeToggle, WorkspaceSidebar)
  features/
    editor/EditorPane.tsx  CodeMirror 6 source editor
    preview/MarkdownPreview.tsx  react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight; intercepts ```chart fences
    charts/InlineChart.tsx Recharts renderer for chart fences
    reports/               reportRegistry + TaskReport (structured report descriptors attached to docs)
  lib/
    desktop.ts             Thin wrappers around Tauri invoke + dialog/opener plugins; gracefully no-ops in browser via isTauri()
    document.ts            Path/string helpers + file:// URL normalization for OS-opened targets
    chartSpec.ts           Chart JSON parsing/validation/series inference
src-tauri/
  src/lib.rs               All Tauri commands + single-instance + macOS RunEvent::Opened wiring
  src/main.rs              Calls simple_md_lib::run()
  capabilities/default.json  Window permissions (core, dialog, opener, opener:allow-open-path)
  tauri.conf.json          Bundle config + .md/.markdown/.mdown/.mkd file associations
docs/product-and-technical-spec.md   Long-form product+tech spec
```

## Document modes

`DocumentMode = 'preview' | 'source' | 'wysiwyg' | 'split'`. Mapped to UI tabs **Display / Text / Hybrid / Split**.

- `preview` — read-only rendered view (`MarkdownPreview`, react-markdown pipeline).
- `source` — raw Markdown source in CodeMirror (`EditorPane`).
- `wysiwyg` — **labeled "Hybrid"** in the UI. Real editable rendered view powered by Milkdown's Crepe preset (`HybridEditor`). ProseMirror under the hood with commonmark + GFM; lossless Markdown round-trip via `crepe.on(listener => listener.markdownUpdated(...))`.
- `split` — side-by-side: source on left, rendered on right.

Naming gotcha: the **internal value `wysiwyg` displays as "Hybrid"** to the user. The internal name "split" used to be called "hybrid" — it was renamed when the WYSIWYG mode shipped, since "Hybrid" is a clearer label for "edit rich text directly while Markdown stays the source." If you see legacy refs to `'hybrid'` as a mode value, they're stale.

The `HybridEditor` is keyed on `activeDocument.id` so switching documents remounts the editor. Inside the lifecycle the `content` prop is captured **once on mount** — Milkdown owns the document state, we just observe markdown updates via the listener and forward them to `handleContentChange`.

## Tauri commands (Rust → JS)

Defined in `src-tauri/src/lib.rs`, wrapped in `src/lib/desktop.ts`:

- `list_workspace(path)` → `WorkspaceSnapshot { path, name, tree }`. Filters tree to markdown files only.
- `open_document(path)` / `save_document(path, content)` → `DocumentPayload`.
- `create_note(parentDir, name, initialContent?)` — auto-appends `.md` if missing; rejects existing files.
- `create_folder(parentDir, name)`.
- `rename_path(path, newName)` — single leaf only; rejects path separators / `.` / `..`.
- `delete_path(path)` — recursive for directories.
- `fetch_remote_markdown(url)` — HTTPS only, 10 MB cap, 30s timeout, max 5 redirects, normalizes `github.com/.../blob/...` → `raw.githubusercontent.com/...`. Validates content via content-type or path or heuristic clue match.
- `opened_targets()` / `clear_opened_targets()` — drains the queue of paths the OS asked us to open. Combined with the `'opened'` event so files double-clicked in Finder land in the running app.

Markdown file extensions recognized everywhere: `md`, `markdown`, `mdown`, `mkd`.

## Charts: ```chart fenced blocks

`MarkdownPreview` looks for `language-chart` code fences and routes the body to `InlineChart`. The body must be JSON matching `ChartSpec` (`bar` | `line` | `area` | `pie`). Series and xKey are inferred when omitted (`lib/chartSpec.ts`). Errors render an inline `chart-error` panel rather than throwing.

## State conventions

- Open documents live in `App` state; the active doc id is the source of truth (`activeDocumentId`). Documents have `id` = path for filesystem docs, `id` = normalized URL for HTTPS imports, `id` = `scratch-<ts>` for unsaved scratchpads.
- Recents persist in `localStorage` key `simple-md-recents` (8 items each for files and workspaces).
- `useDeferredValue` is used to keep preview rendering off the typing critical path. `startTransition` wraps doc inserts.
- `useEffectEvent` is used (React 19) — don't add it as a dep.
- Saving a scratchpad without a path opens a `window.prompt` for the filename and writes into the resolved target directory (selected tree node → its dir → first workspace).

## UI layout

Two-column shell, no chrome between you and the document.

- Left rail (`app-sidebar`, ~260px): workspace tree + unified Recents. Right-click any file/folder/workspace-root for rename/delete (workspace roots can only be removed from the sidebar). No brand block, no hint card.
- Main column: `doc-bar` (Open / New ▾ / Save / Import… on the left, mode tabs on the right) → `tab-strip` (open documents + `+` for scratchpad) → the document → status bar.
- Status bar carries: last action, dirty indicator, mode, word/line/char counts, current path. If the active doc has a `sourceUrl`, the path is a clickable link that opens the source URL externally — that's how the previous "Open Source URL" button got reabsorbed.

## Toolbar contract

The toolbar is intentionally minimal: **Open**, **New ▾** (note / folder), **Save**, **Import…**. Rename/Delete moved to right-click in the sidebar. New scratchpad moved to the `+` button on the tab strip. File-open lives behind OS file association + recents — there's no top-level "Open File" button.

- **No git repo here.** This directory isn't versioned; don't run `git` workflows expecting a remote.
- React 19 + TypeScript 6 (yes, 6 — that's intentional in `package.json`). Vite 8. Don't downgrade.
- ESLint flat config in `eslint.config.js` ignores `dist`, `src-tauri/target`, `src-tauri/gen`.
- Tauri permissions are minimal in `capabilities/default.json`. Adding new commands typically also requires an entry in `invoke_handler!` (not a capability) — but new plugins do need permissions.
- `lib/desktop.ts` returns no-op stubs / throws when `isTauri()` is false so plain `npm run dev` in a browser still mostly works for UI iteration.
- Path handling is string-based (no `path` module on the JS side). `lib/document.ts` `dirname`/`isSameOrChildPath`/`replacePathPrefix` handle both `/` and `\` — preserve that when touching them.
- The Rust side normalizes `github.com/.../blob/...` URLs to `raw.githubusercontent.com` before fetching. Don't replicate that on the JS side.
- macOS file open uses `RunEvent::Opened` (file associations + drag-onto-dock); CLI args use single-instance plugin. Both funnel through `OpenedTargets` state and the `'opened'` event.
- DMG packaging "needs a polish pass" per README — only the `.app` bundle is known-good.

## AI assistant (Phases 1–2: chat + document mutation)

Local-only. Runs Gemma 4 E2B / E4B via a bundled `llama-server` sidecar. No data leaves the machine.

Files:
- `src-tauri/src/ai.rs` — settings, model download with `ai:download` progress events, sidecar lifecycle, runtime status. Models stored at `app_data_dir/models/<variant>.gguf`. Settings at `app_data_dir/ai-settings.json`.
- `src/features/ai/runtime.ts` — invoke + event wrappers + `streamChat()` SSE parser hitting `http://127.0.0.1:<port>/v1/chat/completions`.
- `src/features/ai/useAi.ts` — single hook owning all AI state (settings, models, runtime, chat history, abort controller).
- `src/features/ai/{AICallout,AIPanel,LicenseDialog}.tsx` — sidebar callout (entry point), right-edge slide-in chat panel, one-time Gemma terms dialog.
- `src/features/ai/models.ts` — variant metadata. Download URLs themselves live in `src-tauri/src/ai.rs::Variant::download_url`.

Sidecar:
- `src-tauri/binaries/llama-server-<rust-target-triple>` — referenced by Tauri's `externalBin` in `tauri.conf.json`. Real binary is **not committed**; placeholders are. Run `npm run ai:fetch-sidecar` once on each machine before `npm run tauri:dev`.
- Script pulls from `ggml-org/llama.cpp` GitHub releases; pin a release via `LLAMA_VERSION` env var.

Behavior:
- Sidebar callout opens the chat panel. The panel offers a Models dialog (Download / Start), spawns the sidecar with chosen model + a random free port, health-checks `/health` for up to 60s, then streams chat via OpenAI-compatible SSE.
- The active document is auto-injected as a system message on each turn so the model has context.
- License accept is one-time, stored in `app_data_dir/ai-settings.json`.

Document mutation (Phase 2):
- Each completed assistant turn gains three actions: **Insert / Replace / Append**.
- `EditorPane` exposes an imperative `EditorApi` (`hasSelection`, `getSelection`, `replaceSelection`, `insertAtCursor`, `appendToDocument`). Owned by an `editorRef` in `App` and forwarded to `AIPanel`.
- Insert/Append apply directly (single-undo via CodeMirror history). **Replace** opens a side-by-side preview modal first because it's destructive.
- In Display/Rendered modes the editor isn't mounted; Insert/Replace fall back to Append with a status pill explaining why.
- Reply text is run through `extract.ts::extractEditPayload` to strip a single outer code fence + obvious lead-ins ("Here's the rewrite:") that small models often emit even when told not to.
- The system prompt explicitly tells the model: edits = plain Markdown, no preamble, no fences. Acts as a soft contract; the extractor is the safety net.

What's intentionally NOT done yet:
- **Resumable downloads** — failed download deletes the partial file; retry re-downloads from scratch.
- **Tool calling / agent loop** — the model can't autonomously edit; every mutation needs a click.
- **Selection-based "rewrite this"** — there's no "highlight + ask" flow yet; user types the instruction and clicks Replace. That's a clean follow-up.
- **Gemma 4 GGUF URLs:**
  - We pull from `ggml-org/gemma-4-E{2,4}B-it-GGUF` (the official ggml-org community repos that llama.cpp uses for its `-hf` shorthand). Verified public and ungated. URLs live in `src-tauri/src/ai.rs::Variant::download_url`.
  - **E2B only ships Q8_0 and BF16 upstream** — no Q4_K_M available. We use Q8_0 (~5GB).
  - **E4B has Q4_K_M** (~2.5GB), which is what we use.
  - If Google later publishes their own QAT-Q4_0 GGUFs at `google/gemma-4-E*-it-qat-q4_0-gguf` (matching the Gemma 3 pattern), it'd be worth swapping — those would be smaller and license-blessed.
  - The Rust download code passes `HF_TOKEN` as a bearer token if the env var is set, so a future swap to a gated repo Just Works once the user has accepted the license on HF.

## When in doubt

- For product/UX intent, read `docs/product-and-technical-spec.md`.
- For the IPC contract, `src-tauri/src/lib.rs` + `src/lib/desktop.ts` are the two halves to keep in sync.
- For type changes, `src/app/types.ts` is the canonical TS shape; mirror non-trivially in the Rust `Serialize` structs.
