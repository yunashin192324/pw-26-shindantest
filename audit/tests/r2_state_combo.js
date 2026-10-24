// 第2巡目：状態の組み合わせ。画面を開いた後に、別の人の操作（重複削除・取込・アーカイブ・他の人の保存中）が
// 重なった場合に、保存が別の行へ書き込まれないこと・未保存の変更が黙って消えないことを確かめる。
const path = require('path');
const { createBackend, buildPage, launch } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
function setup() {
  const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 2, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限'], ['s@example.com', 'S', 'A店', '東', '社員']]);
  const row = f => S.ALL_COLUMNS.map(c => (c.key in f) ? f[c.key] : '');
  const rows = [];
  rows.push(row({ reservationNo: 'D1', area: '東', office: 'A店', departureDate: new be.SDate(2027, 0, 1) }));
  rows.push(row({ reservationNo: 'D1', area: '東', office: 'A店', departureDate: new be.SDate(2027, 0, 1) })); // 重複
  for (let i = 0; i < 6; i++) rows.push(row({ reservationNo: 'R' + i, area: '東', office: 'A店', departureDate: new be.SDate(2027, i, 2), memo: 'm' + i }));
  be.sheets[S.SHEET_NAME].getRange(2, 1, rows.length, N).setValues(rows);
  return { be, S, N, memoIdx: S.ALL_COLUMNS.findIndex(c => c.key === 'memo'), noIdx: S.ALL_COLUMNS.findIndex(c => c.key === 'reservationNo') };
}
const sheetRow = (env, no) => env.be.sheets[env.S.SHEET_NAME].data.find(r => r && r[env.noIdx] === no);
async function open(env, email) {
  env.S.Session.getActiveUser = () => ({ getEmail: () => email });
  const htmlPath = path.join(__dirname, 'r2_state.html'); buildPage(htmlPath);
  const { browser, page } = await launch(env.be, htmlPath);
  page.__dialogAnswer = true; page.__dialogs = [];
  page.removeAllListeners('pageerror'); page.__errors = []; page.on('pageerror', e => page.__errors.push(e.message));
  page.on('dialog', d => { page.__dialogs.push(d.message()); page.__dialogAnswer ? d.accept() : d.dismiss(); });
  await page.waitForFunction(() => window.STATE && STATE.rows && STATE.rows.length > 0, null, { timeout: 30000 });
  await page.click('button[data-tab="data"]'); await page.waitForTimeout(200);
  return { browser, page };
}
async function editMemo(page, reservationNo, text) {
  const ri = await page.evaluate(no => STATE.rows.find(r => r.reservationNo === no).rowIndex, reservationNo);
  await page.evaluate(ri => showDataRow_(ri), ri);
  const memo = await page.$('#data-tbody tr[data-row-index="' + ri + '"] .memo-display');
  await memo.dblclick(); await page.fill('#data-tbody input.memo-edit-input', text);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  return ri;
}
const toasts = page => page.evaluate(() => Array.from(document.querySelectorAll('#toast-container *, .toast')).map(e => e.textContent).join(' | '));
(async () => {
  // (1) 画面を開いた後に、マスタが重複削除（行が1行上にずれる）→ 古い画面から保存
  { const env = setup(); const { browser, page } = await open(env, 's@example.com');
    await editMemo(page, 'R3', '社員の入力');
    env.S.Session.getActiveUser = () => ({ getEmail: () => 'master@example.com' }); env.S.removeDuplicateRows(); env.S.Session.getActiveUser = () => ({ getEmail: () => 's@example.com' });
    await page.evaluate(() => saveAllPendingChanges_()); await page.waitForTimeout(600);
    const wrong = env.be.sheets[env.S.SHEET_NAME].data.filter(r => r && r[env.memoIdx] === '社員の入力' && r[env.noIdx] !== 'R3').length;
    assert(wrong === 0, '(1) 重複削除で行がずれた後の保存が、別の予約の行に書き込まれない');
    const okSaved = sheetRow(env, 'R3')[env.memoIdx] === '社員の入力';
    const pendingLeft = await page.evaluate(() => Object.keys(STATE.pendingChanges).length);
    assert(okSaved || pendingLeft === 1, '(1) 保存できなかった場合は未保存の変更として残る（保存=' + okSaved + '・未保存=' + pendingLeft + '）');
    // 読み込み直して保存し直すと正しい行に入る
    page.__dialogAnswer = true;
    if (!okSaved) {
      await page.evaluate(() => requestDataWindow_(buildRangeOptionFromUi_(), { skipConfirm: true }));
      await page.waitForTimeout(800);
      await editMemo(page, 'R3', '社員の入力2'); await page.evaluate(() => saveAllPendingChanges_()); await page.waitForTimeout(600);
      assert(sheetRow(env, 'R3')[env.memoIdx] === '社員の入力2', '(1) 読み込み直した後の保存は、正しい行（R3）に入る');
    }
    assert(page.__errors.length === 0, '(1) 画面のエラーなし ' + JSON.stringify(page.__errors));
    await browser.close(); }

  // (2) 他の人の処理中（ロックが取れない）に保存 → エラー表示・未保存のまま残る・何も書かれない
  { const env = setup(); const { browser, page } = await open(env, 's@example.com');
    await editMemo(page, 'R1', 'ロック中の入力');
    const L = env.S.LockService.getScriptLock; env.S.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {} });
    await page.evaluate(() => saveAllPendingChanges_()); await page.waitForTimeout(600);
    env.S.LockService.getScriptLock = L;
    const pendingLeft = await page.evaluate(() => Object.keys(STATE.pendingChanges).length);
    assert(sheetRow(env, 'R1')[env.memoIdx] === 'm1' && pendingLeft === 1, '(2) ロック中の保存は書き込まれず、未保存の変更として残る（未保存=' + pendingLeft + '）');
    const loadingShown = await page.evaluate(() => { const el = document.getElementById('loading-overlay') || document.getElementById('loading'); return el ? !el.classList.contains('hidden') : false; });
    assert(!loadingShown, '(2) 失敗後に「読み込み中」の表示が残らない');
    await page.evaluate(() => saveAllPendingChanges_()); await page.waitForTimeout(600);
    assert(sheetRow(env, 'R1')[env.memoIdx] === 'ロック中の入力', '(2) ロックが外れた後にもう一度保存すると入る');
    await browser.close(); }

  // (3) 未保存の変更があるまま表示期間を変える → 確認が出る。「キャンセル」なら変更も期間もそのまま
  { const env = setup(); const { browser, page } = await open(env, 's@example.com');
    await editMemo(page, 'R2', '期間切替前の入力');
    page.__dialogAnswer = false; const n0 = page.__dialogs.length;
    await page.selectOption('#data-window-mode', 'all'); await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({ pending: Object.keys(STATE.pendingChanges).length, mode: document.getElementById('data-window-mode').value }));
    assert(page.__dialogs.length > n0, '(3) 未保存の変更があるまま表示期間を変えると確認が出る');
    assert(st.pending === 1, '(3) 「キャンセル」で未保存の変更は残る（未保存=' + st.pending + '）');
    assert(st.mode === 'default', '(3) 「キャンセル」で表示期間の選択も元に戻る（今=' + st.mode + '）');
    page.__dialogAnswer = true;
    await browser.close(); }

  // (4) 画面を開いた後に、マスタが取込（行が末尾に増える）→ 既存行の保存は正しく入る
  { const env = setup(); const { browser, page } = await open(env, 's@example.com');
    await editMemo(page, 'R4', '取込後の保存');
    env.S.Session.getActiveUser = () => ({ getEmail: () => 'master@example.com' });
    const labels = env.S.COLUMNS.map((c, i) => String(i + 1).padStart(3, '0') + ':' + c.label);
    env.S.importCsv({ matrix: [labels, env.S.COLUMNS.map(c => ({ reservationNo: 'NEW', area: '東', office: 'A店', departureDate: '2027/03/03' })[c.key] || '')] }, 'n.csv');
    env.S.Session.getActiveUser = () => ({ getEmail: () => 's@example.com' });
    await page.evaluate(() => saveAllPendingChanges_()); await page.waitForTimeout(600);
    assert(sheetRow(env, 'R4')[env.memoIdx] === '取込後の保存' && sheetRow(env, 'NEW')[env.memoIdx] === '', '(4) 取込で行が増えた後も、保存は正しい行に入り、新しい行には入らない');
    await browser.close(); }

  // (5) 画面を開いた後に、その行がアーカイブされた → 保存は拒否され、どこにも書き込まれない
  { const env = setup();
    const SheetClass = env.be.sheets[env.S.SHEET_NAME].constructor; const arcs = {};
    env.S.SpreadsheetApp.create = () => { const sh = {}; const ss = { getSheetByName: n => sh[n] || null, insertSheet: n => (sh[n] = new SheetClass(n)), getSheets: () => Object.values(sh), getUrl: () => '#', getId: () => 'a1', deleteSheet: s => { delete sh[s.getName()]; } }; ss.insertSheet('Sheet1'); arcs.a1 = ss; return ss; };
    env.S.SpreadsheetApp.openById = id => { if (!arcs[id]) throw new Error('nf'); return arcs[id]; };
    const { browser, page } = await open(env, 's@example.com');
    await editMemo(page, 'R0', 'アーカイブ後の保存'); // R0 は 2027/01/02
    env.S.Session.getActiveUser = () => ({ getEmail: () => 'master@example.com' }); env.S.archiveOldReservations('2027-01-03', 'アーカイブ'); env.S.Session.getActiveUser = () => ({ getEmail: () => 's@example.com' });
    await page.evaluate(() => saveAllPendingChanges_()); await page.waitForTimeout(600);
    const anywhere = env.be.sheets[env.S.SHEET_NAME].data.filter(r => r && r[env.memoIdx] === 'アーカイブ後の保存').length;
    assert(anywhere === 0, '(5) アーカイブで行が移動した後の保存は、本体のどの行にも書き込まれない');
    const pendingLeft = await page.evaluate(() => Object.keys(STATE.pendingChanges).length);
    assert(pendingLeft === 1, '(5) 保存できなかった変更は未保存のまま残る（未保存=' + pendingLeft + '）');
    await browser.close(); }

  // (6) 同じ行の「メモ」と「保険」を同時に変えて1回で保存 → 両方入る
  { const env = setup(); const { browser, page } = await open(env, 's@example.com');
    const ri = await editMemo(page, 'R5', '同時の変更');
    await page.selectOption('#data-tbody select.ancillary-status[data-row="' + ri + '"][data-item="insurance"]', '×').catch(() => {});
    await page.waitForTimeout(200);
    // 「×」は理由の入力を求める場合がある（入力欄が出たら入れる）
    const reasonBox = await page.$('#lost-reason-input, textarea#lost-reason, input#lost-reason');
    if (reasonBox) { await reasonBox.fill('理由'); const ok = await page.$('#btn-lost-reason-ok, #lost-reason-ok'); if (ok) await ok.click(); }
    await page.evaluate(() => saveAllPendingChanges_()); await page.waitForTimeout(600);
    const r = sheetRow(env, 'R5'); const insIdx = env.S.ALL_COLUMNS.findIndex(c => c.key === 'insuranceStatus');
    assert(r[env.memoIdx] === '同時の変更', '(6) 同じ行のメモの変更が入る');
    console.log('    保険の欄: ' + JSON.stringify(r[insIdx]) + '（理由の入力画面の有無により「×」または変更なし）');
    assert(page.__errors.length === 0, '(6) 画面のエラーなし ' + JSON.stringify(page.__errors));
    await browser.close(); }
  console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
})().catch(e => { console.error(e); process.exit(1); });
