#!/usr/bin/env bash
# Downloads a llama.cpp `llama-server` binary for the current host platform and
# drops it into src-tauri/binaries/llama-server-<rust-target-triple> so Tauri's
# `externalBin` can pick it up at bundle time.
#
# Run once before `npm run tauri:dev` or `npm run tauri:build`.
#
# Override LLAMA_VERSION to pin a specific upstream release.
set -euo pipefail

cd "$(dirname "$0")/.."

LLAMA_VERSION="${LLAMA_VERSION:-b9060}"
RELEASE_BASE="https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_VERSION}"

uname_m=$(uname -m)
uname_s=$(uname -s)

case "${uname_s}-${uname_m}" in
  Darwin-arm64)
    RUST_TARGET="aarch64-apple-darwin"
    ASSET="llama-${LLAMA_VERSION}-bin-macos-arm64.tar.gz"
    BIN_NAME="llama-server"
    ;;
  Darwin-x86_64)
    RUST_TARGET="x86_64-apple-darwin"
    ASSET="llama-${LLAMA_VERSION}-bin-macos-x64.tar.gz"
    BIN_NAME="llama-server"
    ;;
  Linux-x86_64)
    RUST_TARGET="x86_64-unknown-linux-gnu"
    ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-x64.tar.gz"
    BIN_NAME="llama-server"
    ;;
  *)
    echo "Unsupported host: ${uname_s}-${uname_m}" >&2
    echo "Drop a llama-server binary into src-tauri/binaries/llama-server-<target-triple> manually." >&2
    exit 1
    ;;
esac

DEST_DIR="src-tauri/binaries"
DEST="${DEST_DIR}/llama-server-${RUST_TARGET}"
mkdir -p "${DEST_DIR}"

# Force-replace by default. Older builds of llama-server don't recognize
# newer model architectures (e.g. gemma4), so an "already present" skip is
# usually the wrong call. Set FORCE=0 to skip if the binary already exists.
if [[ -x "${DEST}" && "${FORCE:-1}" == "0" ]]; then
  echo "llama-server already present at ${DEST}; skipping (FORCE=0)." >&2
  exit 0
fi

WORK=$(mktemp -d)
trap 'rm -rf "${WORK}"' EXIT

echo "Downloading ${ASSET}..."
curl -fL --retry 3 -o "${WORK}/llama.tar.gz" "${RELEASE_BASE}/${ASSET}"

case "${ASSET}" in
  *.tar.gz)
    tar -xzf "${WORK}/llama.tar.gz" -C "${WORK}"
    ;;
  *.zip)
    unzip -q "${WORK}/llama.tar.gz" -d "${WORK}"
    ;;
esac

EXTRACTED=$(find "${WORK}" -type f -name "${BIN_NAME}" | head -n1 || true)
if [[ -z "${EXTRACTED}" ]]; then
  echo "Could not find ${BIN_NAME} in the downloaded archive." >&2
  exit 1
fi

cp "${EXTRACTED}" "${DEST}"
chmod +x "${DEST}"

# Also copy any companion dynamic libs (libllama.dylib, libggml*.dylib, etc.)
# alongside the binary so the loader can find them. Recent llama.cpp builds
# split the binary from its libraries; keeping them in the same directory
# matches @rpath @loader_path resolution.
EXTRACTED_DIR=$(dirname "${EXTRACTED}")
for lib in "${EXTRACTED_DIR}"/*.dylib "${EXTRACTED_DIR}"/*.so; do
  if [[ -f "${lib}" ]]; then
    cp "${lib}" "${DEST_DIR}/"
  fi
done

echo "Installed sidecar at ${DEST}"
