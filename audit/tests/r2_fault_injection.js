// 第2巡目：故障注入。書き込み系の処理で、シートへの書き込み（setValues・setValue・clearContent・deleteRows・insertRowsAfter）の
// k回目をわざと失敗させ、次を確かめる。
//  I1 予約データが失われない（本体＋アーカイブに、元の行の内容がすべて残る）
//  I2 失敗が呼び出し元に伝わる（成功したように見せない）
//  I3 失敗後に画面へ返すデータが、シートの実際の内容と一致する（古い写しを表示し続けない）
//  I4 失敗後にもう一度実行すると、正しい結果になる（アーカイブ先に同じ行が2重に入らない等）
const { createBackend } = require(process.argv[2]);
const zlib = require('zlib');
const only = process.argv[3] || '';
let pass = 0, fail = 0; const assert = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };

function setup() {
  const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 2, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限'], ['s@example.com', 'S', 'A店', '東', '社員']]);
  be.sheets[S.STAFF_NAME_SHEET_NAME].getRange(2, 1, 2, 2).setValues([['C1', '山田'], ['C2', '佐藤']]);
  const row = f => S.ALL_COLUMNS.map(c => (c.key in f) ? f[c.key] : '');
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(row({ reservationNo: 'R' + i, area: '東', office: i % 2 ? 'A店' : 'B店', staff: 'C' + (1 + i % 2), departureDate: new be.SDate(i < 6 ? 2023 : 2027, i % 12, 3), bookingDate: new be.SDate(2023, 0, 1 + i), salesAmount: 1000 * i, memo: 'm' + i }));
  rows.push(rows[1].slice()); rows.push(rows[2].slice()); // 重複
  rows.push(row({ reservationNo: 'RX', area: '東', office: 'A店', departureDate: '未定', memo: '手入力' }));
  be.sheets[S.SHEET_NAME].getRange(2, 1, rows.length, N).setValues(rows);
  // アーカイブ先（試験用の偽物）
  const SheetClass = be.sheets[S.SHEET_NAME].constructor; const archives = {};
  S.SpreadsheetApp.create = name => { const sh = {}; const ss = { getSheetByName: n => sh[n] || null, insertSheet: n => (sh[n] = new SheetClass(n)), getSheets: () => Object.values(sh), getUrl: () => '#a', getId: () => 'arc1', deleteSheet: s => { delete sh[s.getName()]; }, setSpreadsheetTimeZone() {}, addEditors() {} }; ss.insertSheet('Sheet1'); archives.arc1 = ss; return ss; };
  S.SpreadsheetApp.openById = id => { if (!archives[id]) throw new Error('nf'); return archives[id]; };
  return { be, S, N, archives };
}
// 書き込みの回数を数え、failAt回目で失敗させる
function instrument(be, S) {
  const anySheet = be.sheets[S.SHEET_NAME];
  const RP = anySheet.getRange(1, 1).constructor.prototype, SP = anySheet.constructor.prototype;
  const st = { n: 0, failAt: 0 };
  const hook = (proto, name) => { const o = proto[name]; proto[name] = function () { st.n++; if (st.n === st.failAt) throw new Error('INJECTED'); return o.apply(this, arguments); }; };
  ['setValues', 'setValue', 'clearContent'].forEach(n => hook(RP, n));
  ['deleteRows', 'insertRowsAfter'].forEach(n => hook(SP, n));
  return st;
}
const fmt = v => (v && v.getFullYear) ? 'D' + v.getFullYear() + '-' + (v.getMonth() + 1) + '-' + v.getDate() : String(v === undefined || v === null ? '' : v);
const rowsOf = (sheet, N) => sheet ? sheet.data.slice(1).filter(r => r && r.some(v => v !== '' && v !== null && v !== undefined)).map(r => r.slice(0, N).map(fmt).join('\t')) : [];
function decode(res) {
  if (res.rows) return res.rows;
  const p = JSON.parse(zlib.gunzipSync(Buffer.from(res.packedRows, 'base64')).toString('utf8')); const out = [];
  for (let i = 0; i < p.n; i++) { const r = {}; p.k.forEach((k, ci) => { const c = p.c[ci]; r[k] = c.d ? c.d[c.i[i]] : c.v[i]; }); delete r._t; out.push(r); }
  return out;
}
function viewNow(S) { return JSON.stringify(decode(S.getBootstrapData({ mode: 'all', packing: 'gzip' }))); }
function viewFresh(S) { S.__cacheStore.clear(); return viewNow(S); }

const ops = {
  importCsv: S => S.importCsv(csvFor(S), 'x.csv'),
  removeDuplicateRows: S => S.removeDuplicateRows(),
  archiveOldReservations: S => S.archiveOldReservations('2025-01-01', 'アーカイブ'),
  batchUpdateCells: S => S.batchUpdateCells([{ rowIndex: 3, kind: 'field', columnKey: 'memo', value: 'x1', rowToken: tok(S, 3) }, { rowIndex: 9, kind: 'field', columnKey: 'memo', value: 'x2', rowToken: tok(S, 9) }]),
  importStaffNameCsv: S => S.importStaffNameCsv({ matrix: [['■担当者NO', '社員名称', '■Gmailアドレス', '所属店舗', '所属エリア', '役職名'], ['C3', '鈴木', 'c3@example.com', 'A店', '東', '社員'], ['C1', '山田太郎', 's@example.com', 'B店', '東', '社員']] }, 'h.csv')
};
function tok(S, rowIndex) { const rows = decode(S.getBootstrapData({ mode: 'all', packing: 'gzip' })); const p = JSON.parse(zlib.gunzipSync(Buffer.from(S.getBootstrapData({ mode: 'all', packing: 'gzip' }).packedRows, 'base64')).toString('utf8')); const ri = p.c[p.k.indexOf('rowIndex')], tt = p.c[p.k.indexOf('_t')]; for (let i = 0; i < p.n; i++) { const r = ri.d ? ri.d[ri.i[i]] : ri.v[i]; if (r === rowIndex) return tt.d ? tt.d[tt.i[i]] : tt.v[i]; } return null; }
function csvFor(S) {
  const labels = S.COLUMNS.map((c, i) => String(i + 1).padStart(3, '0') + ':' + c.label);
  const mk = i => S.COLUMNS.map(c => ({ reservationNo: 'N' + i, departureDate: '2027/05/0' + (i + 1), area: '東', office: 'A店', staff: 'C1' })[c.key] || '');
  return { matrix: [labels].concat([0, 1, 2, 3, 4].map(mk)) };
}

for (const name of Object.keys(ops)) {
  if (only && name !== only) continue;
  // 失敗させない実行で、書き込みの回数を数える
  let total;
  { const env = setup(); const st = instrument(env.be, env.S); env.S.getBootstrapData({ mode: 'all' }); st.n = 0; ops[name](env.S); total = st.n; }
  const findings = { lost: 0, silent: 0, stale: 0, retryBad: 0 };
  for (let k = 1; k <= total; k++) {
    const env = setup(); const { be, S, N } = env; const st = instrument(be, S);
    const beforeMain = rowsOf(be.sheets[S.SHEET_NAME], N);
    viewNow(S); // 写しを作っておく（画面を開いた後の状態）
    st.n = 0; st.failAt = k;
    let threw = false;
    try { ops[name](S); } catch (e) { threw = /INJECTED/.test(e.message); if (!threw) console.log('  別のエラー:', e.message); }
    st.failAt = 0;
    const arc = env.archives.arc1 && env.archives.arc1.getSheetByName(S.SHEET_NAME);
    const afterAll = rowsOf(be.sheets[S.SHEET_NAME], N).concat(rowsOf(arc, N));
    const missing = beforeMain.filter(r => afterAll.indexOf(r) === -1);
    if (name !== 'batchUpdateCells' && missing.length) { findings.lost++; console.log('  [' + name + ' k=' + k + '] 失われた行: ' + missing.length + ' 例: ' + missing[0].slice(0, 60)); }
    if (!threw) { findings.silent++; console.log('  [' + name + ' k=' + k + '] 失敗が伝わらない'); }
    const shown = viewNow(S), fresh = viewFresh(S);
    if (shown !== fresh) { findings.stale++; console.log('  [' + name + ' k=' + k + '] 失敗後、画面に返すデータがシートの内容と違う（古い写し）'); }
    // もう一度実行（今度は失敗させない）
    let retryErr = null;
    try { ops[name](S); } catch (e) { retryErr = e.message; }
    if (name === 'archiveOldReservations' && arc) {
      // 元の本体に同じ内容の行が2行ある場合（重複行）は、アーカイブ先にも2行あってよい
      const a = rowsOf(arc, N); const cnt = {}; a.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
      const dup = Object.keys(cnt).filter(r => cnt[r] > beforeMain.filter(x => x === r).length);
      if (dup.length) { findings.retryBad++; console.log('  [' + name + ' k=' + k + '] 再実行でアーカイブ先に同じ行が2重：' + dup.length + '行'); }
      const leftOld = rowsOf(be.sheets[S.SHEET_NAME], N).filter(r => r.split('\t')[4].indexOf('D2023') === 0).length;
      const arcCount = a.length;
      if (leftOld || arcCount !== 8) { findings.retryBad++; console.log('  [' + name + ' k=' + k + '] 再実行後：本体に残った古い行 ' + leftOld + '・アーカイブ先 ' + arcCount + '行（8行のはず）' + (retryErr ? ' エラー:' + retryErr : '')); }
    }
    if (name === 'importCsv') {
      const m = rowsOf(be.sheets[S.SHEET_NAME], N); const nn = m.filter(r => /\tN\d\t|^N\d\t/.test('\t' + r)).length;
      if (nn !== 5) { findings.retryBad++; console.log('  [' + name + ' k=' + k + '] 再実行後の取込行数が5でない：' + nn + (retryErr ? ' エラー:' + retryErr : '')); }
    }
  }
  assert(findings.lost === 0, name + '：途中で失敗してもデータが失われない（' + total + '通りの失敗位置）');
  assert(findings.silent === 0, name + '：失敗が呼び出し元に伝わる');
  assert(findings.stale === 0, name + '：失敗後に画面へ返すデータがシートの実際の内容と一致する（不一致 ' + findings.stale + '/' + total + '）');
  assert(findings.retryBad === 0, name + '：失敗後の再実行で正しい結果になる（不正 ' + findings.retryBad + '/' + total + '）');
}
console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
