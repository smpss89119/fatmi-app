#!/bin/bash
# Publish staging/ to BOTH the live root and preview/ (identical files, same version).
# preview/ is kept because 建毅's home-screen icon points at /fatmi-app/preview/; it must stay the official app.
# data.json is NOT copied: the hourly job owns root data.json and copies it to preview/ (and staging/).
# Usage: ./promote.sh            (DEST=/tmp/x ./promote.sh to dry-run into another folder)
set -e
cd "$(dirname "$0")"
DEST=${DEST:-.}
V=$(python3 -c 'import json;print(json.load(open("staging/version.json"))["version"])')
grep -q "const APP_VERSION = \"$V\";" staging/app.js || { echo "staging/app.js APP_VERSION != staging/version.json ($V)" >&2; exit 1; }
BUILT=$(date +%Y-%m-%dT%H:%M:%S+08:00)
for d in "$DEST" "$DEST/preview"; do
  mkdir -p "$d"
  for f in app.js app.css data.js body-svg.js sw.js icon-180.png icon-512.png; do cp staging/$f "$d/$f"; done
  cp -f staging/icon-*.png "$d/"
  sed 's/減脂喵測試/減脂喵/g' staging/index.html > "$d/index.html"
  sed 's/減脂喵測試/減脂喵/g' staging/manifest.webmanifest > "$d/manifest.webmanifest"
  printf '{"version":"%s","builtAt":"%s"}\n' "$V" "$BUILT" > "$d/version.json"
done
echo "promoted $V to $DEST and $DEST/preview"
