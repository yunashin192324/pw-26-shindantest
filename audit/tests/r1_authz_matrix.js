// 第1巡目：権限の確認表。サーバーの公開関数をすべて、未登録の人・社員・所長の立場で直接呼び出し、
// シート・設定・トリガーが書き換わらないこと（読み取り系は他人のデータを返さないこと）を確かめる。
const path = require('path');
const { createBackend } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
function setup() {
  const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
  S.__deployerEmail = 'deployer@example.com';
  const row = f => S.ALL_COLUMNS.map(c => (c.key in f) ? f[c.key] : '');
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 3, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限'], ['staff@example.com', 'S', 'A店', '東', '社員'], ['mgr@example.com', 'G', '', '東', '所長・チーフ']]);
  be.sheets[S.STAFF_NAME_SHEET_NAME].getRange(2, 1, 1, 2).setValues([['C1', '山田']]);
  be.sheets[S.SHEET_NAME].getRange(2, 1, 3, N).setValues([row({ area: '東', office: 'A店', reservationNo: 'R1', staff: 'C1', departureDate: new be.SDate(2026, 11, 1), memo: 'm1' }), row({ area: '西', office: 'B店', reservationNo: 'R2', departureDate: new be.SDate(2026, 11, 2), memo: '秘密' }), row({ area: '東', office: 'A店', reservationNo: 'R1', staff: 'C1', departureDate: new be.SDate(2026, 11, 1), memo: 'm1' })]);
  return { be, S };
}
const snapshotState = (be, S) => JSON.stringify({ sheets: Object.keys(be.sheets).sort().map(k => [k, be.sheets[k].data]), props: Object.assign({}, (() => { const p = S.PropertiesService.getDocumentProperties(); const o = {}; ['dataVersion', 'dataListColumnOrder', 'changeWatchInstalled', 'affiliationAutoLinked', 'archiveSpreadsheetId'].forEach(k => o[k] = p.getProperty(k)); return o; })()), triggers: S.__triggers.length });
const ARGS = {
  addAffiliationAlias: ['office', 'X', 'B店'], addAffiliationAliases: [[{ kind: 'office', from: 'X', to: 'B店' }]], addStaffAccess: ['evil@example.com', 'E', '', '', 'マスタ権限'],
  addStaffName: ['Z1', 'Z'], archiveOldReservations: ['2030-01-01', 'アーカイブ'], batchUpdateCells: [[{ rowIndex: 3, kind: 'field', columnKey: 'memo', value: 'hack' }]],
  bulkSetAncillaryStatus: [[3], 'insurance', '×', '', 'hack'], bulkUpdateCellValue: [[3], 'memo', 'hack'], clearAllData: ['削除'], deleteStaffAccess: [2], deleteStaffName: [2],
  getAffiliationDiagnostics: [], getArchiveInfo: [], getBootstrapData: [{ mode: 'all' }], getColumnOrderPreference: [], getCurrentUserContext: [], getSetupStatus: [],
  getStaffAccessList: [], getStaffNameList: [], importCsv: ['a,b\n1,2', 'x.csv'], importStaffNameCsv: [{ matrix: [['■担当者NO', '社員名称', '■Gmailアドレス'], ['E1', 'E', 'evil@example.com']] }, 'h.csv'],
  include: ['Javascript'], onEdit: [{ range: { getSheet: 'x' } }], onSpreadsheetChange: [{ changeType: 'EDIT', source: { getId: 'x' } }], previewArchiveCandidates: ['2030-01-01'],
  removeDuplicateRows: [], removeDuplicateRowsFromMenu: [], runInitialSetup: [], saveColumnOrderPreference: [['memo']], setupAllSheetsFromMenu: [],
  updateStaffAccess: [2, 'master@example.com', 'M', '', '', '社員'], updateStaffName: [2, 'C1', 'hack'], warmSnapshot: []
};
const READ_ONLY_OK = ['getBootstrapData', 'getColumnOrderPreference', 'getCurrentUserContext', 'getSetupStatus', 'include', 'warmSnapshot', 'onEdit', 'onSpreadsheetChange'];
for (const who of ['nobody@example.com', 'staff@example.com', 'mgr@example.com']) {
  const { S: S0 } = setup();
  const fns = Object.keys(ARGS).sort();
  const missing = Object.keys(S0).filter(k => typeof S0[k] === 'function' && !/_$/.test(k) && /^[a-z]/.test(k) && !ARGS[k] && !['doGet', 'onOpen'].includes(k));
  if (who === 'nobody@example.com') assert(missing.length === 0, '公開関数をすべて試験対象にしている（漏れ: ' + JSON.stringify(missing) + '）');
  for (const fn of fns) {
    const { be, S } = setup();
    S.HtmlService = { createHtmlOutputFromFile: n => ({ getContent: () => 'x' }) };
    S.SpreadsheetApp.getUi = () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); }; // Webアプリから呼ばれた状態
    S.Session.getActiveUser = () => ({ getEmail: () => who });
    const before = snapshotState(be, S);
    let res, err = null;
    try { res = S[fn].apply(null, JSON.parse(JSON.stringify(ARGS[fn]))); } catch (e) { err = e.message; }
    const after = snapshotState(be, S);
    const changed = before !== after;
    const leaked = res && JSON.stringify(res).indexOf('秘密') !== -1 && who !== 'master@example.com';
    if (READ_ONLY_OK.includes(fn)) {
      const allowedChange = fn === 'onSpreadsheetChange' ? false : false;
      assert(!leaked && (!changed || allowedChange), who + ' → ' + fn + '：他店舗のデータを返さず、シート・設定を変えない' + (changed ? '（変化あり）' : '') + (leaked ? '（他店舗のメモが見えた）' : ''));
    } else { // 列順の保存も、v2.7.9 からマスタ権限のみ（利用者の判断による）
      assert(!changed && !leaked, who + ' → ' + fn + '：' + (err ? '拒否（' + err.slice(0, 30) + '）' : '例外なし') + (changed ? '・シート／設定が変わった' : '・変化なし'));
    }
  }
}
console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
