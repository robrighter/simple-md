#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
APP_NAME="Simple MD"
APP_BUNDLE="$ROOT_DIR/src-tauri/target/release/bundle/macos/$APP_NAME.app"
RELEASE_DIR="$ROOT_DIR/release"
STAGING_DIR="$RELEASE_DIR/$APP_NAME $VERSION Mac Apple Silicon"
ZIP_PATH="$RELEASE_DIR/Simple-MD-$VERSION-Mac-Apple-Silicon.zip"
INSTALLER_PATH="$STAGING_DIR/Install $APP_NAME.command"

SKIP_BUILD="${SKIP_BUILD:-0}"

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "Building $APP_NAME $VERSION..."
  set +e
  (cd "$ROOT_DIR" && npm run tauri:build)
  BUILD_STATUS=$?
  set -e

  if [[ $BUILD_STATUS -ne 0 && ! -d "$APP_BUNDLE" ]]; then
    echo "Build failed and no app bundle was produced."
    exit "$BUILD_STATUS"
  fi

  if [[ $BUILD_STATUS -ne 0 ]]; then
    echo "Tauri returned a non-zero status after producing the app bundle."
    echo "Continuing because the known DMG bundling step can fail after .app creation."
  fi
fi

if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "Could not find app bundle: $APP_BUNDLE"
  echo "Run npm run tauri:build first, or run this script without SKIP_BUILD=1."
  exit 1
fi

echo "Preparing release folder..."
rm -rf "$STAGING_DIR" "$ZIP_PATH"
mkdir -p "$STAGING_DIR"
ditto "$APP_BUNDLE" "$STAGING_DIR/$APP_NAME.app"

cat > "$INSTALLER_PATH" <<'INSTALLER'
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
INSTALLER

chmod +x "$INSTALLER_PATH"

echo "Creating zip..."
ditto -c -k --sequesterRsrc --keepParent "$STAGING_DIR" "$ZIP_PATH"

echo "Created:"
echo "$ZIP_PATH"
echo
echo "Install command after Safari extracts it:"
echo "~/Downloads/$APP_NAME\\ $VERSION\\ Mac\\ Apple\\ Silicon/Install\\ $APP_NAME.command"
