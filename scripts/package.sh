#!/usr/bin/env bash
# Build a Chrome Web Store zip from the extension root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")"
OUT="QueueDeck-${VERSION}.zip"

rm -f "$OUT"
zip -r "$OUT" \
  manifest.json \
  background.js \
  content.js \
  storage.js \
  popup.html popup.css popup.js \
  options.html options.css options.js \
  icons \
  -x "*.DS_Store"

echo "Created $OUT"
unzip -l "$OUT"
