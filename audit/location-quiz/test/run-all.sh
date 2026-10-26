#!/bin/sh
# 監査で使った試験一式を実行する（総当たりは1ファイルあたり5〜15分かかる）
set -e
cd "$(dirname "$0")"
node scenarios.js ../original.txt > scenarios-original.md
node scenarios.js ../fixed.txt > scenarios-fixed.md
node causes.js ../original.txt > causes-original.txt
node causes.js ../fixed.txt > causes-fixed.txt
node independent.js > independent.txt
node ties.js ../original.txt > ties-original.txt
node ties.js ../fixed.txt > ties-fixed.txt
node browser.js ../original.txt > browser-original.txt
node browser.js ../fixed.txt > browser-fixed.txt
if [ "$1" = "--full" ]; then
  node enumerate.js ../original.txt enum-original.json > enum-original-stdout.txt
  node enumerate.js ../fixed.txt enum-fixed.json fixed > enum-fixed-stdout.txt
fi
tail -n1 scenarios-original.md scenarios-fixed.md
