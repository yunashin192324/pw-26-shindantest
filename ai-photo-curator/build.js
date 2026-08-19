#!/usr/bin/env node
/**
 * ai-photo-curator のビルドスクリプト
 * ============================================================
 * src/app-source.jsx（人が編集するJSXソース）から、外部CDNに一切
 * 依存しない単一の index.html を生成します。
 *
 *   1. Babel（@babel/preset-react, runtime: classic）でJSXを
 *      プレーンなJavaScriptへ事前コンパイル（ブラウザ上でのBabel変換を不要にする）
 *   2. Tailwind CSS CLIで、実際にsrc/app-source.jsx内で使われている
 *      クラスだけを静的CSSとして生成
 *   3. React / ReactDOM / JSZip のUMDビルド（node_modules内）を
 *      そのままテキストとして読み込み
 *   4. すべてを1つのHTMLファイルに埋め込んで index.html として書き出す
 *
 * 使い方:
 *   cd ai-photo-curator
 *   npm install
 *   npm run build
 *
 * 出力: ai-photo-curator/index.html
 *       （これをそのままGoogle Sites埋め込み用にホスティングします）
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");
const babel = require("@babel/core");

const ROOT = __dirname;
const SRC_JSX = path.join(ROOT, "src", "app-source.jsx");
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

function buildAppScript() {
  const source = fs.readFileSync(SRC_JSX, "utf8");
  const out = babel.transform(source, {
    presets: [["@babel/preset-react", { runtime: "classic" }]],
    filename: "app-source.jsx",
    babelrc: false,
    configFile: false
  });
  return out.code;
}

function readUmdLib(pkgRelativePath) {
  return fs.readFileSync(path.join(ROOT, "node_modules", pkgRelativePath), "utf8");
}

function main() {
  console.log("Tailwind CSSをビルド中...");
  const tailwindCss = buildTailwindCSS();

  console.log("JSXをコンパイル中...");
  const appJs = buildAppScript();

  console.log("React / ReactDOM / JSZipを読み込み中...");
  const reactJs = readUmdLib("react/umd/react.production.min.js");
  const reactDomJs = readUmdLib("react-dom/umd/react-dom.production.min.js");
  const jszipJs = readUmdLib("jszip/dist/jszip.min.js");

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>AI Photo Curator</title>

<!--
  ============================================================
  完全オフライン同梱版（Google Sites 埋め込み・社内セキュリティ対応）
  ============================================================
  会社のセキュリティポリシーで「Google関連サービス以外は使用不可」という
  制約があるため、このファイルはページの表示に外部CDN（unpkg.com /
  cdn.tailwindcss.com / cdnjs.cloudflare.com 等）を一切使いません。

  React・ReactDOM・JSZip・（実際に使われている分だけの）Tailwind CSSは
  すべてこのファイルの中にビルド時に埋め込み済みです。JSXも事前に
  プレーンなJavaScriptへ変換済みのため、ブラウザ上でのBabel変換も
  不要です。

  ページを開いた際にブラウザが通信するのは、ボタン操作でAIを呼び出す
  ときの Google Apps Script（あなたの会社のGoogleアカウントで動く
  プロキシ）だけです。Apps ScriptからGemini API
  (generativelanguage.googleapis.com) を呼ぶ通信も含め、発生する外部
  通信はすべてGoogleドメインのみで完結します。

  このファイルは src/app-source.jsx から build.js で自動生成されています。
  直接編集せず、src/app-source.jsx を編集して "npm run build" を
  再実行してください。
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

<!-- React（UMD本番ビルドを同梱、外部CDN不使用） -->
<script>
${reactJs}
</script>

<!-- ReactDOM（UMD本番ビルドを同梱、外部CDN不使用） -->
<script>
${reactDomJs}
</script>

<!-- JSZip（選択画像のZIP一括ダウンロード用。同梱済みで外部CDN不使用） -->
<script>
${jszipJs}
</script>

<!-- アプリ本体（事前にJSXをプレーンJSへコンパイル済み。ブラウザ上でのBabel変換は不要） -->
<script>
(function () {
  function showFatalError(message) {
    var rootEl = document.getElementById("root");
    if (!rootEl) return;
    rootEl.innerHTML =
      '<div style="max-width:640px;margin:15vh auto;padding:24px;' +
      'font-family:sans-serif;color:#e8e0d8;background:#1a1a1a;' +
      'border:1px solid #442222;border-radius:12px;line-height:1.7;">' +
      '<div style="color:#ff8080;font-weight:bold;margin-bottom:8px;">読み込みに失敗しました</div>' +
      '<div style="font-size:14px;white-space:pre-wrap;">' + message + '</div></div>';
  }
  if (!window.React || !window.ReactDOM) {
    showFatalError("React / ReactDOM の初期化に失敗しました。ページを再読み込みしてください。");
    return;
  }
  try {
${appJs}
  } catch (err) {
    console.error("アプリの初期化に失敗しました:", err);
    showFatalError("アプリの初期化中にエラーが発生しました。\\n" + (err && err.message ? err.message : err));
  }
})();
</script>
</body>
</html>
`;

  fs.writeFileSync(OUT_HTML, html);
  console.log(`書き出し完了: ${OUT_HTML} (${html.length.toLocaleString()} bytes)`);
}

main();
