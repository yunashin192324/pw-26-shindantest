#!/bin/sh
# 元動画 → WebP連番 (gaze-frames/f000.webp ...)。ffmpeg が必要。
# 使い方: tools/extract-gaze-frames.sh 元動画.mp4
set -e
mkdir -p "$(dirname "$0")/../gaze-frames"
ffmpeg -i "$1" -an -vf scale=896:504:flags=lanczos -c:v libwebp -quality 50 \
  -compression_level 6 -start_number 0 "$(dirname "$0")/../gaze-frames/f%03d.webp"
