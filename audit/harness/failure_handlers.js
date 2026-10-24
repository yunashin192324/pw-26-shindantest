// 画面からのサーバー呼び出し（google.script.run）すべてに失敗時の処理があるか、読み込み中の表示が失敗時に消えるかを調べる。
const acorn = require('acorn'), walk = require('acorn-walk'), fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
const ast = acorn.parse(src, { ecmaVersion: 2022, locations: true });
const results = [];
walk.ancestor(ast, { CallExpression(node, anc) {
  // 一番外側の呼び出しだけを見る：callee が MemberExpression で、その中に google.script.run を含む
  if (node.callee.type !== 'MemberExpression') return;
  const name = node.callee.property.name;
  if (['withSuccessHandler', 'withFailureHandler', 'withUserObject'].includes(name)) return;
  const text = src.slice(node.callee.object.start, node.callee.object.end);
  if (!/google\.script\.run/.test(text)) return;
  const fn = anc.slice().reverse().find(a => /Function/.test(a.type));
  const fnText = fn ? src.slice(fn.start, fn.end) : '';
  const failMatch = text.match(/withFailureHandler\(([\s\S]*)\)\s*$/) || text.match(/withFailureHandler\(([\s\S]*?)\)\s*\./);
  const failText = failMatch ? failMatch[1] : '';
  const loadingOn = /showLoading\(true\)/.test(src.slice(Math.max(0, node.start - 2500), node.start)) && /showLoading\(true\)/.test(fnText);
  results.push({ line: node.loc.start.line, name, hasFail: /withFailureHandler/.test(text), loadingOn,
    failHides: /showLoading\(false\)|requestDataWindow_|onError\b/.test(failText) || /function \(\) \{\}/.test(failText) });
} });
results.forEach(r => {
  const bad = !r.hasFail || (r.loadingOn && !r.failHides);
  console.log((bad ? '要確認 ' : 'OK     ') + ('L' + r.line).padEnd(6) + r.name.padEnd(28) + '失敗処理:' + (r.hasFail ? 'あり' : 'なし') + (r.loadingOn ? '  読込表示→失敗時に消す:' + (r.failHides ? 'はい' : 'いいえ') : ''));
});
console.log('呼び出し箇所: ' + results.length);
