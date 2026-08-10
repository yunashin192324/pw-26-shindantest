// 3種類のテストをまとめて実行する。
//   node run_all.js
// 1つでも失敗したら終了コード1で終わる（＝反映前の確認に使える）。
const { execFileSync } = require('child_process');
const path = require('path');

const FILES = [
  ['サーバー側ロジック', 'gas_test.js'],
  ['全API横断の監査',   'audit_test.js'],
  ['画面（jsdom）',      'ui_test.js']
];

let failed = 0;
const summary = [];
for (const [label, file] of FILES) {
  console.log(`\n${'#'.repeat(60)}\n# ${label}（${file}）\n${'#'.repeat(60)}`);
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    failed++;
  }
  process.stdout.write(out);
  const m = out.match(/結果: (\d+) 件成功 \/ (\d+) 件失敗/);
  summary.push(m ? { label, ok: Number(m[1]), ng: Number(m[2]) } : { label, ok: 0, ng: -1 });
}

console.log(`\n${'='.repeat(60)}\n総合結果`);
let totalOk = 0, totalNg = 0;
summary.forEach(s => {
  totalOk += s.ok; totalNg += Math.max(s.ng, 0);
  console.log(`  ${s.ng === 0 ? '✅' : '❌'} ${s.label}: ${s.ok} 件成功 / ${s.ng} 件失敗`);
});
console.log(`  合計: ${totalOk} 件成功 / ${totalNg} 件失敗`);
console.log('='.repeat(60));
process.exit(failed === 0 && totalNg === 0 ? 0 : 1);
