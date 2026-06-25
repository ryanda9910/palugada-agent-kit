#!/usr/bin/env bash
# Render the demo recording. Deterministic + key-free (scripted provider, real tools).
# Output: demo.gif (+ demo.mp4 if ffmpeg is present).
set -euo pipefail
cd "$(dirname "$0")"

echo "› building…"
npx tsc -p tsconfig.json >/dev/null

echo "› recording demo.gif (vhs)…"
vhs demo.tape

if command -v ffmpeg >/dev/null 2>&1; then
  echo "› demo.gif → demo.mp4 (ffmpeg)…"
  ffmpeg -y -loglevel error -i demo.gif \
    -movflags faststart -pix_fmt yuv420p \
    -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" demo.mp4
fi

echo "› done:"
ls -lh demo.gif demo.mp4 2>/dev/null | awk '{print "   "$9" "$5}'
