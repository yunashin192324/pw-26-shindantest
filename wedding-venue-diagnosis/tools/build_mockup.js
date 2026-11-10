/* 配布用ファイルを作る。実行: node tools/build_mockup.js
   1) dist/wedding-venue-diagnosis-mockup.html … CSS・JS を1つにまとめたモックアップ（オフラインで開ける）
   2) dist/site/ … 自社サイトにアップロードする公開用一式（index.html・css・js・images） */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let html = read('index.html');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => '<style>\n' + read(href) + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  '<script>\n' + read(src).replace(/<\/script/gi, '<\\/script') + '\n</script>');

if (/<(link|script)[^>]+(href|src)=/.test(html)) throw new Error('外部ファイルの参照が残っています');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'wedding-venue-diagnosis-mockup.html');
fs.writeFileSync(out, html);
console.log('書き出しました: ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');

// 公開用一式
const SITE = path.join(ROOT, 'dist', 'site');
fs.rmSync(SITE, { recursive: true, force: true });
const copy = rel => {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, path.join(SITE, rel), { recursive: true });
};
['index.html', 'css', 'js', 'images'].forEach(copy);
console.log('書き出しました: ' + SITE + '（このフォルダの中身をサーバーにアップロードしてください）');
