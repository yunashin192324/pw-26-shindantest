// 第2巡目：行ごとの編集権限（仕様：社員＝自店舗のみ、所長・チーフ＝自エリアのみ、AL・マスタ＝全件）を、
// 画面を通さずサーバーの3つの保存処理（まとめて保存・一括変更・付帯の一括登録）で全行×全権限について確かめる。
// 正しい行トークンを付けて呼ぶ（トークンの不一致で拒否されるのではなく、権限で拒否されることを確かめるため）。
const zlib = require('zlib');
const { createBackend } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
const USERS = [
  { email: 'master@example.com', role: 'マスタ権限', office: '', area: '', can: r => true },
  { email: 'al@example.com', role: 'AL', office: '', area: '', can: r => true },
  { email: 'mgrE@example.com', role: '所長・チーフ', office: '', area: '東', can: r => r.area === '東' },
  { email: 'stA@example.com', role: '社員', office: 'A店', area: '東', can: r => r.office === 'A店' },
  { email: 'stB@example.com', role: '社員', office: 'B店', area: '西', can: r => r.office === 'B店' }
];
const ROWS = [];
['東', '西', ''].forEach(area => ['A店', 'B店', 'C店', ''].forEach(office => ROWS.push({ area, office })));
function setup() {
  const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, USERS.length, 5).setValues(USERS.map(u => [u.email, 'x', u.office, u.area, u.role]));
  be.sheets[S.SHEET_NAME].getRange(2, 1, ROWS.length, N).setValues(ROWS.map((r, i) => S.ALL_COLUMNS.map(c => c.key === 'area' ? r.area : c.key === 'office' ? r.office : c.key === 'reservationNo' ? 'R' + i : c.key === 'departureDate' ? new be.SDate(2027, 0, 1) : '')));
  return { be, S, N };
}
function tokens(S) { // マスタの立場で全行のトークンを取る
  S.Session.getActiveUser = () => ({ getEmail: () => 'master@example.com' });
  const res = S.getBootstrapData({ mode: 'all', packing: 'gzip' });
  const p = JSON.parse(zlib.gunzipSync(Buffer.from(res.packedRows, 'base64')).toString('utf8'));
  const get = (k, i) => { const c = p.c[p.k.indexOf(k)]; return c.d ? c.d[c.i[i]] : c.v[i]; };
  const t = {}; for (let i = 0; i < p.n; i++) t[get('rowIndex', i)] = get('_t', i); return t;
}
const OPS = {
  batchUpdateCells: (S, ri, tok) => S.batchUpdateCells([{ kind: 'field', rowIndex: ri, token: tok, columnKey: 'memo', value: 'W' }]),
  bulkUpdateCellValue: (S, ri, tok) => S.bulkUpdateCellValue([ri], 'memo', 'W', [tok]),
  bulkSetAncillaryStatus: (S, ri, tok) => S.bulkSetAncillaryStatus([ri], 'insurance', '×', '', 'W', [tok])
};
for (const opName of Object.keys(OPS)) {
  let bad = 0; const examples = [];
  for (const u of USERS) {
    const { be, S } = setup(); const tok = tokens(S);
    S.Session.getActiveUser = () => ({ getEmail: () => u.email });
    ROWS.forEach((r, i) => {
      const ri = i + 2;
      try { OPS[opName](S, ri, tok[ri]); } catch (e) { /* 拒否 */ }
    });
    const memoIdx = S.ALL_COLUMNS.findIndex(c => c.key === (opName === 'bulkSetAncillaryStatus' ? 'insuranceReason' : 'memo'));
    ROWS.forEach((r, i) => {
      const written = be.sheets[S.SHEET_NAME].data[i + 1][memoIdx] === 'W';
      if (written !== u.can(r)) { bad++; if (examples.length < 3) examples.push(u.role + '(' + (u.office || u.area || '全') + ')→行[' + (r.area || '空') + '/' + (r.office || '空') + '] ' + (written ? '書けた' : '書けない')); }
    });
  }
  assert(bad === 0, opName + '：' + USERS.length + '人×' + ROWS.length + '行で、書ける行が仕様どおり（食い違い ' + bad + '）' + (examples.length ? ' 例: ' + examples.join('、') : ''));
}
console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
