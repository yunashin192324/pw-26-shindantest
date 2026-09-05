// WEDLINK スマホプレビュー（Artifact向けbodyフラグメント）ビルドスクリプト
const fs = require('fs');
const path = require('path');
const { readSource, extractBodyInner, apiNamesOf, buildScripts } = require('./mockup_core');

const OUT_DIR = path.join(__dirname, 'dist');
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, 'wedlink-portal-preview.html');

const { codeGs, indexHtml, stylesheetHtml, javascriptHtml } = readSource();
const bodyInner = extractBodyInner(indexHtml);
const apiNames = apiNamesOf(codeGs);
const scripts = buildScripts({ codeGs, javascriptHtml, apiNames });

const html = `<title>WEDLINK モバイル</title>
<style>
${stylesheetHtml.replace(/<\/?style>/g, '')}

/* ===== スマホプレビュー専用（実アプリには存在しない見た目の追加分） ===== */
/* 実物のStylesheet.htmlはダークモード対応が無いため、常に自分の背景色を明示して
   Artifactビューアの背景（特にダーク時）を透けさせない（単一テーマとして固定する）。 */
html, body { background: #f5f5fa; }
.demo-bar {
  background: #fff7e6; border-bottom: 1px solid #f0d9a8; color: #6b4e16;
  font-size: 0.78rem; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
}
.demo-bar .demo-title { font-weight: 700; color: #8a5a00; }
.demo-bar select {
  border: 1px solid #d8b466; background: #fff; color: #6b4e16; border-radius: 6px;
  padding: 6px 8px; font-size: 0.85rem; width: 100%;
}
</style>
<div class="demo-bar">
  <span class="demo-title">📱 スマホプレビュー（実物のアプリ一式をダミーデータで動作。外部通信なし）</span>
  <select data-demo-login id="demo-login-select">
    <option value="">ログイン例を選択...</option>
    <option value="KANTO,CHANGE-ME-KANTO">関東手配課</option>
    <option value="KANSAI,CHANGE-ME-KANSAI">関西手配課</option>
    <option value="ROW,CHANGE-ME-ROW">ローマ支店（イタリア・同意書必須）</option>
    <option value="IST,CHANGE-ME-IST">イスタンブール支店（パスポート欄あり）</option>
    <option value="VIE,CHANGE-ME-VIE">ウィーン支店（店舗直結ON）</option>
    <option value="MLE,CHANGE-ME-MLE">マーレ支店（英語表示・メール通知OFF）</option>
    <option value="SHOP1,CHANGE-ME-SHOP1">新宿店（店舗ロール）</option>
  </select>
</div>
${bodyInner}
${scripts}
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('書き出しました:', OUT, `(${(html.length / 1024).toFixed(0)} KB)`);
