#!/bin/bash
# Promote preview build to live root. Usage: ./promote.sh 2026.11.07-5 fatcat-2-20261107f
set -e
V=$1; C=$2
for f in app.js app.css data.js body-svg.js index.html manifest.webmanifest icon-180.png icon-512.png; do cp preview/$f ./$f; done
# versioned icons referenced by preview index/manifest (cache-bust)
cp -f preview/icon-*.png ./
sed -i "s/^const APP_VERSION = \".*\";/const APP_VERSION = \"$V\";/" app.js
sed -e "s/const C = \"fatcat-preview-[0-9a-z]*\"/const C = \"$C\"/" preview/sw.js > sw.js
printf '{"version":"%s","builtAt":"%s"}\n' "$V" "$(date +%Y-%m-%dT%H:%M:%S+07:00)" > version.json
