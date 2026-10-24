#!/bin/bash
# 監査で作成した試験をすべて実行する（第1巡目 r1_*、第2巡目 r2_*、外部の指摘 r3_*、日付の再現 repro_dates）。
# 必要なもの：Node.js、Playwright と Chromium（画面を使う試験のみ）。
# 修正前の版で試す場合は APP_DIR=元のフォルダ/ を付けて実行する（最後の / を忘れずに）。
cd "$(dirname "$0")"
H="$PWD/harness/uh_cur.js"
for f in tests/r1_*.js tests/r2_*.js tests/r3_*.js tests/repro_dates.js; do
  echo "== $f"
  node "$f" "$H" 2>&1 | grep -E "^(PASS|FAIL|SPEC|NOTE|TOTAL)|^   " | grep -v "^PASS"
done
