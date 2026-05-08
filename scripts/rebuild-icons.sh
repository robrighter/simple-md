#!/usr/bin/env bash
# Rebuilds Tauri bundle icons (PNGs, .icns, .ico) from public/favicon.svg.
#
# Pipeline:
#   1. rsvg-convert  → public/favicon.svg → /tmp/simple-md-icon-1024.png (square master)
#   2. tauri icon    → expands the master into every platform variant under src-tauri/icons/
#
# Run after editing favicon.svg.
#
# Requires: librsvg (brew install librsvg). Tauri CLI is already a dev dep.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert not found. Install with: brew install librsvg" >&2
  exit 1
fi

SRC="public/favicon.svg"
WORK=$(mktemp -d)
trap 'rm -rf "${WORK}"' EXIT

MASTER="${WORK}/icon-1024.png"

echo "Rasterizing ${SRC} at 1024×1024..."
rsvg-convert --width 1024 --height 1024 --keep-aspect-ratio "${SRC}" --output "${MASTER}"

echo "Generating Tauri icon variants..."
npx @tauri-apps/cli icon "${MASTER}" --output src-tauri/icons

echo "Done. Updated icons in src-tauri/icons/"
