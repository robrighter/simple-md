# Tauri sidecar binaries

This directory holds the `llama-server` binary that the AI feature spawns at
runtime. Tauri references it via `externalBin` in `tauri.conf.json` and looks
for files named `llama-server-<rust-target-triple>` (e.g.
`llama-server-aarch64-apple-darwin`).

The binaries here are tracked as **placeholders** — the real ~30MB binary is
not committed to source control. Before you run `npm run tauri:dev` or
`npm run tauri:build`, install the real binary for your host with:

```bash
npm run ai:fetch-sidecar
```

The script downloads a release of [llama.cpp](https://github.com/ggml-org/llama.cpp)
matching your host platform. To pin a different release, set `LLAMA_VERSION`
before running the script.

If you need a binary for a target the script doesn't handle, drop the file in
this directory yourself with the matching `llama-server-<target-triple>` name
and `chmod +x` it.
