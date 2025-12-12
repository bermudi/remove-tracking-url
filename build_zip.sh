#!/usr/bin/env bash
set -euo pipefail

if ! command -v 7z >/dev/null 2>&1; then
  echo "Error: '7z' was not found on PATH. Please install p7zip (7z) and retry." >&2
  exit 1
fi

VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | cut -d'"' -f4)

rm -f url-cleaner-*.zip

7z a -tzip "url-cleaner-${VERSION}.zip" \
  manifest.json \
  background.js \
  popup.html \
  popup.js \
  icons \
  -xr!url-cleaner-*.zip -xr!*.md* -xr!*.sh* -xr!.gitignore -xr!.git/* -xr!Archive.zip

echo "Build complete: url-cleaner-${VERSION}.zip"
