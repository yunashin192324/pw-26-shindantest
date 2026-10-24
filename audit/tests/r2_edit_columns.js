// 第2巡目：画面から編集できるのは現場入力の14項目だけ（予約データ由来の19項目・見出し行・範囲外の行は書けない）か。
const zlib = require('zlib');
const { createBackend } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 2, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限'], ['st@example.com', 'S', 'A店', '東', '社員']]);
be.sheets[S.SHEET_NAME].getRange(2, 1, 2, N).setValues([0, 1].map(i => S.ALL_COLUMNS.map(c => c.key === 'area' ? '東' : c.key === 'office' ? (i ? 'B店' : 'A店') : c.key === 'reservationNo' ? 'R' + i : '')));
const res = S.getBootstrapData({ mode: 'all', packing: 'gzip' }); const p = JSON.parse(zlib.gunzipSync(Buffer.from(res.packedRows, 'base64')).toString('utf8'));
const tok = p.c[p.k.indexOf('_t')]; const t0 = tok.d ? tok.d[tok.i[0]] : tok.v[0];
S.Session.getActiveUser = () => ({ getEmail: () => 'st@example.com' });
const before = JSON.stringify(be.sheets[S.SHEET_NAME].data);
const tries = S.COLUMNS.map(c => c.key).concat(['rowIndex', '_t', '__proto__', 'constructor', 'toString']);
let leaked = [];
tries.forEach(k => { try { const r = S.batchUpdateCells([{ kind: 'field', rowIndex: 2, token: t0, columnKey: k, value: 'B店' }]); if (r && r.updated) leaked.push(k); } catch (e) {} });
[1, 0, -1, 2.5, 4, 999999, '2', null].forEach(ri => { try { const r = S.batchUpdateCells([{ kind: 'field', rowIndex: ri, token: null, columnKey: 'memo', value: 'X' }]); if (r && r.updated && ri !== '2') leaked.push('row' + ri); } catch (e) {} });
try { S.bulkUpdateCellValue([2], 'office', 'B店', [t0]); leaked.push('bulk:office'); } catch (e) {}
const after = JSON.stringify(be.sheets[S.SHEET_NAME].data.map((r, i) => i === 1 ? r.map((v, j) => S.ALL_COLUMNS[j] && S.ALL_COLUMNS[j].key === 'memo' ? '' : v) : r));
assert(leaked.length === 0, '予約データ由来の項目・内部の名前・見出し行や範囲外の行への書き込みは受け付けない（受け付けた: ' + JSON.stringify(leaked) + '）');
assert(after === before, 'シートの内容は、2行目のメモ以外変わっていない');
console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
