#!/bin/zsh
set -euo pipefail

APP_NAME="Simple MD.app"
SOURCE_DIR="${0:A:h}"
SOURCE_APP="$SOURCE_DIR/$APP_NAME"
TARGET_APP="/Applications/$APP_NAME"

if [[ ! -d "$SOURCE_APP" ]]; then
  echo "Could not find $APP_NAME next to this installer."
  exit 1
fi

echo "Clearing macOS quarantine from $APP_NAME..."
xattr -dr com.apple.quarantine "$SOURCE_APP" 2>/dev/null || true

if [[ -d "$TARGET_APP" ]]; then
  echo "Replacing existing $TARGET_APP..."
  rm -rf "$TARGET_APP"
fi

echo "Installing $APP_NAME to /Applications..."
ditto "$SOURCE_APP" "$TARGET_APP"
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

echo "Opening Simple MD..."
open "$TARGET_APP"

echo "Done."
