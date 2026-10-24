const { createBackend } = require(process.argv[2]);
const be = createBackend(); const S = be.sandbox;
be.sheets[S.STAFF_SHEET_NAME].getRange(2,1,1,5).setValues([['master@example.com','M','','','マスタ権限']]);
const labels = S.COLUMNS.map((c, i) => String(i + 1).padStart(3, '0') + ':' + c.label);
const mk = (no, dep, sales) => S.COLUMNS.map(c => ({ reservationNo: no, departureDate: dep, salesAmount: sales, area: '東', office: 'A' })[c.key] || '');
const r = S.importCsv({ matrix: [labels, mk('R1', '2026/02/30', '1000'), mk('R2', '2026/13/01', '¥1,500'), mk('R3', '2026年3月5日', '(1,500)'), mk('R4', '2024/02/29', '１５００'), mk('R5', '2026/03/05', '1,500円')] }, 'x.csv');
console.log('取込結果:', JSON.stringify({ imported: r.imported }));
const rows = S.getBootstrapData({ mode: 'all' }).rows;
rows.forEach(x => console.log('  ', x.reservationNo, '出発予定日=' + x.departureDate, '売上=' + x.salesAmount));
// 期待（仕様）：存在しない日付・読めない書式は別の日付にせず空欄、うるう日と正しい日付はそのまま。
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
const dep = no => (rows.find(x => x.reservationNo === no) || {}).departureDate;
assert(dep('R1') === null, '2026/02/30 は空欄（3月2日にしない）');
assert(dep('R2') === null, '2026/13/01 は空欄（2027年1月1日にしない）');
assert(dep('R3') === null, '2026年3月5日（読めない書式）は空欄');
assert(dep('R4') === '2024-02-29', '2024/02/29（うるう日）はそのまま');
assert(dep('R5') === '2026-03-05', '2026/03/05 はそのまま');
assert(r.unreadable && r.unreadable.date && r.unreadable.date.count === 3, '読めなかった日付3件を取込結果で知らせる');
console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
