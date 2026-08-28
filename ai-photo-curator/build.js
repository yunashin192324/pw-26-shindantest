#!/usr/bin/env node
/**
 * ai-photo-curator のビルドスクリプト（Google Sites 埋め込みコード専用・軽量版）
 * ============================================================
 * src/app.js（人が編集する素のJavaScriptソース）から、Google Sitesの
 * 「埋め込みコード」ボックスにそのまま貼り付けられる単一の index.html を
 * 生成します。React/Babel/JSZipなどの外部ライブラリは一切使わないため、
 * ビルドで行うのは実質「使われているTailwindクラスだけを静的CSSとして
 * 生成し、app.jsと一緒に1ファイルにまとめる」だけです。
 *
 * 使い方:
 *   cd ai-photo-curator
 *   npm install
 *   npm run build
 *
 * 出力: ai-photo-curator/index.html
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");

const ROOT = __dirname;
const SRC_JS = path.join(ROOT, "src", "app.js");
const OUT_HTML = path.join(ROOT, "index.html");

function buildTailwindCSS() {
  const inputCssPath = path.join(os.tmpdir(), "ai-photo-curator-tailwind-input.css");
  const outputCssPath = path.join(os.tmpdir(), "ai-photo-curator-tailwind-output.css");
  fs.writeFileSync(inputCssPath, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");

  const tailwindBin = path.join(ROOT, "node_modules", ".bin", "tailwindcss");
  execFileSync(tailwindBin, [
    "-c", path.join(ROOT, "tailwind.config.js"),
    "-i", inputCssPath,
    "-o", outputCssPath,
    "--minify"
  ], { cwd: ROOT, stdio: "inherit" });

  return fs.readFileSync(outputCssPath, "utf8");
}

function main() {
  console.log("Tailwind CSSをビルド中...");
  const tailwindCss = buildTailwindCSS();

  console.log("app.jsを読み込み中...");
  const appJs = fs.readFileSync(SRC_JS, "utf8");

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>AI Photo Curator</title>

<!--
  ============================================================
  Google Sites「埋め込みコード」専用・単一ファイル版
  ============================================================
  React / JSZip / Tailwind CDN など、外部ライブラリ・外部CDNを一切
  使わない素のHTML/CSS/JavaScriptです。このファイルの中身をまるごと
  Google Sitesの「挿入」→「埋め込み」→「埋め込みコード」ボックスに
  貼り付けるだけで動作します（別途どこかにホスティングする必要は
  ありません）。

  ページを開いた際にブラウザが通信するのは、ボタン操作でAIを呼び出す
  ときの Google Apps Script（あなたの会社のGoogleアカウントで動く
  プロキシ）だけです。Apps ScriptからGemini API
  (generativelanguage.googleapis.com) を呼ぶ通信も含め、発生する外部
  通信はすべてGoogleドメインのみで完結します。

  このファイルは src/app.js から build.js で自動生成されています。
  直接編集せず、src/app.js を編集して "npm run build" を
  再実行してください（新しいTailwindクラスを使った場合のみビルドが
  必要です。既存クラスの組み合わせを変えるだけなら直接 index.html の
  <script> 部分を編集しても問題ありません）。
-->

<style>
html, body, #root { height: 100%; margin: 0; }
body { background: #0a0a0a; }
${tailwindCss}
</style>
</head>
<body>
<div id="root">
  <div style="color:#888; font-family: sans-serif; text-align:center; padding-top:40vh;">読み込み中...</div>
</div>

<!-- 隠しファイル入力（写真追加・フォルダ読込ボタンから呼び出される） -->
<input id="fileInput" type="file" multiple accept="image/jpeg, image/png, image/webp" class="hidden">
<input id="folderInput" type="file" webkitdirectory directory multiple accept="image/jpeg, image/png, image/webp" class="hidden">

<script>
${appJs}
</script>
</body>
</html>
`;

  fs.writeFileSync(OUT_HTML, html);
  console.log(`書き出し完了: ${OUT_HTML} (${html.length.toLocaleString()} bytes)`);
}

main();
