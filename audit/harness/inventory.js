// 全関数の一覧・呼び出し関係・画面からサーバーへの経路・権限確認の有無・シート書き込み箇所を機械的に取り出す。
const fs = require('fs'), path = require('path');
const acorn = require('acorn'), walk = require('acorn-walk');
const APP = process.argv[2];
const read = f => fs.readFileSync(path.join(APP, f), 'utf8');
const server = read('Code.gs') + '\n' + read('InitSheet.gs');
const jsHtml = read('Javascript.html');
const client = jsHtml.replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
const parse = src => acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true });
const sAst = parse(server), cAst = parse(client);
const funcs = (ast) => { const m = {}; ast.body.forEach(n => { if (n.type === 'FunctionDeclaration') m[n.id.name] = n; }); return m; };
const sF = funcs(sAst), cF = funcs(cAst);
const callsIn = node => { const s = new Set(); walk.simple(node, { CallExpression(c) { if (c.callee.type === 'Identifier') s.add(c.callee.name); } }); return s; };
// 画面から呼ばれるサーバー関数
const runCalls = {};
walk.ancestor(cAst, { MemberExpression(n) {
  // google.script.run....withSuccessHandler(..).NAME(  → 最後のプロパティ名
  if (n.property && n.property.type === 'Identifier') {
    let o = n.object, chain = [];
    while (o) { if (o.type === 'CallExpression') o = o.callee; else if (o.type === 'MemberExpression') { chain.push(o.property && o.property.name); o = o.object; } else break; }
    if (chain.includes('run') && chain.includes('script') && !['withSuccessHandler', 'withFailureHandler', 'withUserObject'].includes(n.property.name)) {
      (runCalls[n.property.name] = runCalls[n.property.name] || []).push(n.loc.start.line);
    }
  }
} });
// 公開関数（末尾が _ でない）と、本体で行っている権限確認
const authOf = (name, seen = new Set()) => {
  const n = sF[name]; if (!n || seen.has(name)) return [];
  seen.add(name);
  const direct = [...callsIn(n.body)];
  const marks = direct.filter(c => /^(assertMaster_|assertSetupAllowed_|checkRowEditable_|assertSetupReady_)$/.test(c));
  const src = server.slice(n.start, n.end);
  if (/getCurrentUserContext_\(\)/.test(src) && /registered|ROLES\.indexOf|accessDenied|bootstrapMode/.test(src)) marks.push('ctx確認');
  return marks;
};
const publicFns = Object.keys(sF).filter(n => !/_$/.test(n)).sort();
const triggerNames = ['doGet', 'onOpen', 'onEdit', 'onSpreadsheetChange', 'include'];
console.log('== サーバー関数：' + Object.keys(sF).length + '個（公開 ' + publicFns.length + '・内部 ' + (Object.keys(sF).length - publicFns.length) + '）');
console.log('== 公開関数ごとの「画面からの呼び出し元の行」と「権限確認」');
publicFns.forEach(n => console.log(('  ' + n).padEnd(36) + ' 呼び出し元:' + (runCalls[n] ? runCalls[n].join(',') : (triggerNames.includes(n) ? '（トリガー等）' : '（画面から呼ばれていない）')).padEnd(26) + ' 権限確認:' + (authOf(n).join('/') || 'なし')));
console.log('== 画面から呼んでいるのにサーバーに無い関数: ' + JSON.stringify(Object.keys(runCalls).filter(n => !sF[n])));
// 呼ばれていない内部関数
const allCalls = new Set([...callsIn(sAst)]);
// 文字列で渡される関数名（トリガー等）も考慮
const strRefs = new Set((server.match(/'([A-Za-z_]\w*)'/g) || []).map(s => s.slice(1, -1)));
console.log('== 呼ばれていないサーバー内部関数: ' + JSON.stringify(Object.keys(sF).filter(n => /_$/.test(n) && !allCalls.has(n) && !strRefs.has(n))));
const cAll = new Set([...callsIn(cAst)]);
const cRefs = new Set((client.match(/\b[A-Za-z_]\w*\b/g) || []).filter(w => cF[w]).filter((w, i, a) => a.indexOf(w) !== a.lastIndexOf(w)));
console.log('== 画面側の関数：' + Object.keys(cF).length + '個。一度も参照されない関数: ' + JSON.stringify(Object.keys(cF).filter(n => !cAll.has(n) && !cRefs.has(n))));
// シートへの書き込み・削除の箇所
const writes = [];
walk.ancestor(sAst, { CallExpression(c, anc) {
  if (c.callee.type === 'MemberExpression' && /^(setValues|setValue|deleteRow|deleteRows|clearContent|clear|insertSheet|deleteSheet|setProperty|deleteProperty|put|putAll|remove|create|addEditors|newTrigger)$/.test(c.callee.property.name)) {
    const fn = anc.slice().reverse().find(a => a.type === 'FunctionDeclaration');
    writes.push((fn ? fn.id.name : '?') + '→' + c.callee.property.name);
  }
} });
const byFn = {}; writes.forEach(w => { const [f, m] = w.split('→'); (byFn[f] = byFn[f] || new Set()).add(m); });
console.log('== 書き込み・削除をする関数（' + Object.keys(byFn).length + '個）');
Object.keys(byFn).sort().forEach(f => console.log('  ' + f.padEnd(34) + [...byFn[f]].join(',')));
// 外部接続
console.log('== 外部への接続（URL・外部サービス）');
(server + client + read('Index.html')).match(/https?:\/\/[^\s"'<>)]+/g).filter((v, i, a) => a.indexOf(v) === i).forEach(u => console.log('  ' + u));
['UrlFetchApp', 'GmailApp', 'MailApp', 'CalendarApp', 'DriveApp', 'ScriptApp', 'CacheService', 'PropertiesService', 'LockService', 'SpreadsheetApp.openById', 'SpreadsheetApp.create', 'Session.getEffectiveUser', 'Session.getActiveUser'].forEach(k => {
  const n = (server.split(k).length - 1); if (n) console.log('  ' + k + ': ' + n + '箇所');
});
