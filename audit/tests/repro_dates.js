const { createBackend } = require(process.argv[2]);
const be = createBackend(); const S = be.sandbox;
be.sheets[S.STAFF_SHEET_NAME].getRange(2,1,1,5).setValues([['master@example.com','M','','','マスタ権限']]);
const labels = S.COLUMNS.map((c, i) => String(i + 1).padStart(3, '0') + ':' + c.label);
const mk = (no, dep, sales) => S.COLUMNS.map(c => ({ reservationNo: no, departureDate: dep, salesAmount: sales, area: '東', office: 'A' })[c.key] || '');
const r = S.importCsv({ matrix: [labels, mk('R1', '2026/02/30', '1000'), mk('R2', '2026/13/01', '¥1,500'), mk('R3', '2026年3月5日', '(1,500)'), mk('R4', '2024/02/29', '１５００'), mk('R5', '2026/03/05', '1,500円')] }, 'x.csv');
console.log('取込結果:', JSON.stringify({ imported: r.imported }));
S.getBootstrapData({ mode: 'all' }).rows.forEach(x => console.log('  ', x.reservationNo, '出発予定日=' + x.departureDate, '売上=' + x.salesAmount));
