// 第1巡目：シートに直接入力された、日付列の日付でない文字（未定など）・数値列の文字が、重複削除の書き直しで消えたり化けたりしないか。
const { createBackend } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 1, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限']]);
const idx = k => S.ALL_COLUMNS.findIndex(c => c.key === k);
const row = f => S.ALL_COLUMNS.map(c => (c.key in f) ? f[c.key] : '');
be.sheets[S.SHEET_NAME].getRange(2, 1, 4, N).setValues([
  row({ reservationNo: 'R1', departureDate: '未定', bookingDate: new be.SDate(2026, 0, 5), chkDate: '要確認', salesAmount: 'TBD', area: '東', office: 'A' }),
  row({ reservationNo: 'R2', departureDate: '2026/02/30', area: '東', office: 'A' }),
  row({ reservationNo: 'R3', departureDate: new be.SDate(2026, 4, 1), area: '東', office: 'A' }),
  row({ reservationNo: 'R3', departureDate: new be.SDate(2026, 4, 1), area: '東', office: 'A' })]);
S.removeDuplicateRows();
const data = be.sheets[S.SHEET_NAME].data;
const find = no => data.find(r => r && r[idx('reservationNo')] === no);
const v = (r, k) => { const x = r[idx(k)]; return x instanceof be.SDate || (x && x.getFullYear) ? 'Date(' + x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate() + ')' : x; };
const r1 = find('R1'), r2 = find('R2');
console.log('  書き直し後 R1:', v(r1, 'departureDate'), v(r1, 'chkDate'), v(r1, 'salesAmount'), ' R2:', v(r2, 'departureDate'));
assert(v(r1, 'departureDate') === '未定', '日付列の「未定」が書き直しで消えない');
assert(v(r1, 'chkDate') === '要確認', 'CHK日の「要確認」が書き直しで消えない');
assert(v(r2, 'departureDate') === '2026/02/30' || v(r2, 'departureDate') === '2026-02-30', '日付列の「2026/02/30」が3月2日に化けない');
assert(v(r1, 'salesAmount') === 'TBD' || v(r1, 'salesAmount') === '', '数値列の文字：' + v(r1, 'salesAmount'));
assert(data.filter(r => r && r[idx('reservationNo')] === 'R3').length === 1, '重複は1行になる');
console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
