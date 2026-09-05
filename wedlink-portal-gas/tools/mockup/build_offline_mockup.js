// WEDLINK オフラインPC用モックアップ ビルドスクリプト（フルHTML・スタンドアロン）
const fs = require('fs');
const path = require('path');
const { readSource, extractBodyInner, apiNamesOf, buildScripts } = require('./mockup_core');

const OUT_DIR = path.join(__dirname, 'dist');
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, 'WEDLINK-モックアップ_PC用.html');

const { codeGs, indexHtml, stylesheetHtml, javascriptHtml } = readSource();
const bodyInner = extractBodyInner(indexHtml);
const apiNames = apiNamesOf(codeGs);
const scripts = buildScripts({ codeGs, javascriptHtml, apiNames });

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>WEDLINK 支店ポータル（オフラインPC用モックアップ）</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${stylesheetHtml.replace(/<\/?style>/g, '')}

/* ===== オフラインモックアップ専用（実アプリには存在しない見た目の追加分） ===== */
.demo-banner {
  background: #fff7e6; border-bottom: 1px solid #f0d9a8; color: #6b4e16;
  font-size: 0.82rem; padding: 8px 14px; display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center;
}
.demo-banner b { color: #8a5a00; }
.demo-banner button { border: 1px solid #d8b466; background: #fff; color: #6b4e16; border-radius: 6px;
  padding: 3px 9px; font-size: 0.8rem; cursor: pointer; }
.demo-banner button:hover { background: #fdf1d8; }
@media (prefers-color-scheme: dark) {
  .demo-banner { background: #3a2f12; border-bottom-color: #5c4a1c; color: #f0d9a8; }
  .demo-banner button { background: #241d0c; border-color: #5c4a1c; color: #f0d9a8; }
}
</style>
</head>
<body>
<div class="demo-banner" id="demo-banner">
  <span>🖥️ <b>オフラインPC用モックアップ</b>（実物のCode.gs / Index.html / JavaScript.html をそのまま使用。ブラウザ内のダミーデータのみで動作し、外部通信は行いません）</span>
  <span>｜ログイン例：</span>
  <button type="button" data-demo-login="KANTO,CHANGE-ME-KANTO">関東手配課</button>
  <button type="button" data-demo-login="KANSAI,CHANGE-ME-KANSAI">関西手配課</button>
  <button type="button" data-demo-login="ROW,CHANGE-ME-ROW">ローマ支店（伊・同意書必須）</button>
  <button type="button" data-demo-login="IST,CHANGE-ME-IST">イスタンブール支店（パスポート欄）</button>
  <button type="button" data-demo-login="VIE,CHANGE-ME-VIE">ウィーン支店（店舗直結ON）</button>
  <button type="button" data-demo-login="MLE,CHANGE-ME-MLE">マーレ支店（英語表示・メール通知OFF）</button>
  <button type="button" data-demo-login="SHOP1,CHANGE-ME-SHOP1">新宿店（店舗ロール）</button>
</div>
${bodyInner}
${scripts}
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('書き出しました:', OUT, `(${(html.length / 1024).toFixed(0)} KB)`);
console.log('公開したAPI関数の数:', apiNames.length);
