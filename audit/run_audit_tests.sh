#!/bin/bash
# 監査で作成した試験をすべて実行し、1つでも失敗・未実施があれば成功扱いにしない。
#   第1巡目 r1_*、第2巡目 r2_*、外部の指摘 r3_*・r4_*・r5_*、日付の再現 repro_dates
# 必要なもの：Node.js。画面を使う試験には Playwright と Chromium も必要。
#   Playwright の場所が標準でない場合は NODE_PATH を、Chromium の場所は CHROMIUM_PATH を指定する。
# 修正前の版で試す場合は APP_DIR=元のフォルダ/ を付けて実行する（最後の / を忘れずに）。
# 終了コード：0＝すべて合格、1＝失敗あり、2＝実行できなかった試験あり（失敗は無い）
set -u
cd "$(dirname "$0")" || exit 2
H="$PWD/harness/uh_cur.js"
if ! command -v node >/dev/null 2>&1; then echo "エラー: Node.js が見つかりません。"; exit 2; fi
HAVE_PW=1
if ! node -e "require('playwright')" >/dev/null 2>&1; then
  HAVE_PW=0
  echo "注意: Playwright が見つかりません。画面を使う試験は実行できず「未実施」になります（NODE_PATH を確認してください）。"
fi
passed=0; failed=0; skipped=0; failed_list=""; skipped_list=""
for f in tests/r1_*.js tests/r2_*.js tests/r3_*.js tests/r4_*.js tests/r5_*.js tests/repro_dates.js; do
  [ -e "$f" ] || continue
  echo "== $f"
  if [ "$HAVE_PW" = 0 ] && grep -q "launch\|loadChromium" "$f"; then
    echo "   未実施（画面を使う試験。Playwright が無い）"; skipped=$((skipped+1)); skipped_list="$skipped_list $f"; continue
  fi
  out=$(node "$f" "$H" 2>&1); ec=$?
  echo "$out" | grep -E "^(FAIL|SPEC|NOTE|TOTAL)|^   "
  # 合格とするのは「終了コード0・FAILが無い・最後に TOTAL ... FAIL=0 がある」場合だけ（読み込みの失敗などを見逃さない）
  if [ $ec -ne 0 ] || echo "$out" | grep -q "^FAIL" || ! echo "$out" | grep -q "^TOTAL PASS=[0-9]* FAIL=0$"; then
    [ $ec -ne 0 ] && echo "$out" | grep -E "Error|エラー" | head -3
    echo "   → 失敗（終了コード=$ec）"; failed=$((failed+1)); failed_list="$failed_list $f"
  else
    passed=$((passed+1))
  fi
done
echo
echo "合格 $passed 本／失敗 $failed 本／未実施 $skipped 本"
[ -n "$failed_list" ] && echo "失敗:$failed_list"
[ -n "$skipped_list" ] && echo "未実施:$skipped_list"
if [ $failed -gt 0 ]; then exit 1; fi
if [ $skipped -gt 0 ]; then exit 2; fi
exit 0
