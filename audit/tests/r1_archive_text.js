// 第1巡目：アーカイブの対象判定。出発予定日に「1月頃」のような日付でない文字がある行は、空欄と同じく本体に残す。
const { createBackend } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 1, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限']]);
// アーカイブ先のスプレッドシートを試験用の偽物で用意する
const SheetClass = be.sheets[S.SHEET_NAME].constructor; const archives = {};
S.SpreadsheetApp.create = name => { const sh = {}; const ss = { getSheetByName: n => sh[n] || null, insertSheet: n => (sh[n] = new SheetClass(n)), getSheets: () => Object.values(sh), getUrl: () => '#a', getId: () => 'arc1', deleteSheet: s => { delete sh[s.getName()]; } }; ss.insertSheet('Sheet1'); archives.arc1 = ss; return ss; };
S.SpreadsheetApp.openById = id => { if (!archives[id]) throw new Error('nf'); return archives[id]; };
const idx = k => S.ALL_COLUMNS.findIndex(c => c.key === k);
const row = f => S.ALL_COLUMNS.map(c => (c.key in f) ? f[c.key] : '');
be.sheets[S.SHEET_NAME].getRange(2, 1, 4, N).setValues([
  row({ reservationNo: 'A1', departureDate: '1月頃', area: '東', office: 'A' }),
  row({ reservationNo: 'A2', departureDate: new be.SDate(2024, 0, 5), area: '東', office: 'A' }),
  row({ reservationNo: 'A3', departureDate: '2024/02/01', area: '東', office: 'A' }),
  row({ reservationNo: 'A4', departureDate: new be.SDate(2027, 0, 5), area: '東', office: 'A' })]);
const pv = S.previewArchiveCandidates('2025-01-01');
assert(pv.archivable === 2, '事前確認の対象件数は2件（A2・A3）：' + pv.archivable);
const res = S.archiveOldReservations('2025-01-01', 'アーカイブ');
assert(res.archived === 2, '移動したのは2件：' + res.archived);
const left = be.sheets[S.SHEET_NAME].data.slice(1).filter(r => r && r[idx('reservationNo')]).map(r => r[idx('reservationNo')]).sort();
assert(JSON.stringify(left) === '["A1","A4"]', '本体に残ったのは A1（1月頃）と A4：' + JSON.stringify(left));
console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
