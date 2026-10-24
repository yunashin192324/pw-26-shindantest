// 列の並び順（全員の表示に反映される設定）を保存できるのはマスタ権限だけ（v2.7.9、利用者の判断による仕様）。
// サーバー：社員・所長・AL・未登録は拒否し設定は変わらない／マスタは保存できる。画面：マスタ以外には欄を表示しない。
const path = require('path');
const { createBackend, buildPage, launch } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
(async () => {
  const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 4, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限'], ['st@example.com', 'S', 'A店', '東', '社員'], ['mg@example.com', 'G', '', '東', '所長・チーフ'], ['al@example.com', 'L', '', '', 'AL']]);
  be.sheets[S.SHEET_NAME].getRange(2, 1, 1, N).setValues([S.ALL_COLUMNS.map(c => c.key === 'area' ? '東' : c.key === 'office' ? 'A店' : c.key === 'reservationNo' ? 'R1' : c.key === 'departureDate' ? new be.SDate(2027, 0, 1) : '')]);
  const prop = () => S.PropertiesService.getDocumentProperties().getProperty('dataListColumnOrder');
  const as = e => { S.Session.getActiveUser = () => ({ getEmail: () => e }); };
  for (const e of ['st@example.com', 'mg@example.com', 'al@example.com', 'nobody@example.com']) {
    as(e); const before = prop(); let err = null;
    try { S.saveColumnOrderPreference(['memo', 'reservationNo']); } catch (x) { err = x.message; }
    assert(!!err && prop() === before, e + '：列の並び順を保存できない（' + (err || '保存できた') + '）');
  }
  as('master@example.com'); S.saveColumnOrderPreference(['memo', 'reservationNo']);
  assert(prop() === '["memo","reservationNo"]', 'マスタ権限は保存できる');
  const htmlPath = path.join(__dirname, 'r4_col.html'); buildPage(htmlPath);
  for (const [e, shown] of [['st@example.com', false], ['al@example.com', false], ['master@example.com', true]]) {
    as(e); const { browser, page } = await launch(be, htmlPath); const errors = [];
    page.removeAllListeners('pageerror'); page.on('pageerror', x => errors.push(x.message));
    await page.waitForFunction(() => window.STATE && STATE.userContext, null, { timeout: 30000 }); await page.waitForTimeout(300);
    const hidden = await page.evaluate(() => document.getElementById('column-order-card').classList.contains('hidden'));
    assert(hidden === !shown && errors.length === 0, e + '：列の並び順の欄は' + (shown ? '表示される' : '表示されない') + '（hidden=' + hidden + '）');
    await browser.close();
  }
  console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
})().catch(e => { console.error(e); process.exit(1); });
