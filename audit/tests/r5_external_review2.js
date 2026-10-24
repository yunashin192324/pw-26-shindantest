// 外部の監査報告（Gemini v2.7.10 報告）の指摘のうち、v2.7.9 で再現したものを合否の出る試験にしたもの。
// 修正前（v2.7.9）では失敗し、修正後（v2.7.10）では合格することを確かめる。
const path = require('path');
const { createBackend, loadChromium, chromiumLaunchOptions } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
const mk = () => { const be = createBackend(); const S = be.sandbox; be.sheets[S.SHEET_NAME].maxRows = 5000;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 2, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限'], ['s@example.com', 'S', 'A店', '東', '社員']]); return { be, S, N: S.ALL_COLUMNS.length }; };
const row = (S, f) => S.ALL_COLUMNS.map(c => (c.key in f) ? f[c.key] : '');
const tryCall = fn => { try { return { v: fn() }; } catch (e) { return { err: e.message }; } };
const staffRows = (be, S) => JSON.stringify(be.sheets[S.STAFF_SHEET_NAME].data.slice(1, 3).map(r => r.slice(0, 5)));
const nameRows = (be, S) => JSON.stringify(be.sheets[S.STAFF_NAME_SHEET_NAME].data.slice(1, 3).map(r => r.slice(0, 2)));

(async () => {
  // AUDIT-001：権限管理・担当者マスタの行番号に小数（2.5）
  for (const [label, call, snap] of [
    ['updateStaffAccess(2.5)', S => S.updateStaffAccess(2.5, 'master@example.com', 'M', '', '', '社員'), staffRows],
    ['deleteStaffAccess(2.5)', S => S.deleteStaffAccess(2.5), staffRows],
    ['updateStaffName(2.5)', S => S.updateStaffName(2.5, 'C9', 'X'), nameRows],
    ['deleteStaffName(2.5)', S => S.deleteStaffName(2.5), nameRows]]) {
    const { be, S } = mk(); be.sheets[S.STAFF_NAME_SHEET_NAME].getRange(2, 1, 2, 2).setValues([['C1', '山田'], ['C2', '佐藤']]);
    const before = snap(be, S); const r = tryCall(() => call(S));
    assert(!!r.err && snap(be, S) === before, 'AUDIT-001 ' + label + ' は拒否され、シートは変わらない（' + (r.err ? r.err.slice(0, 20) : '受け付けた') + '）');
  }
  { const { be, S } = mk(); assert(!tryCall(() => S.updateStaffAccess(3, 's@example.com', 'S2', 'A店', '東', '社員', 's@example.com')).err, 'AUDIT-001 整数の行番号（3）は従来どおり更新できる'); }

  // AUDIT-002：同名で別コードの店舗がある中で、所属「717:イオン店」
  { const { be, S, N } = mk(); be.sheets[S.STAFF_SHEET_NAME].getRange(3, 1, 1, 5).setValues([['s@example.com', 'S', '717:イオン店', '東', '社員']]);
    be.sheets[S.SHEET_NAME].getRange(2, 1, 2, N).setValues([row(S, { reservationNo: 'R1', area: '東', office: '717:イオン', departureDate: new be.SDate(2027, 0, 1) }), row(S, { reservationNo: 'R2', area: '東', office: '718:イオン', departureDate: new be.SDate(2027, 0, 1) })]);
    S.Session.getActiveUser = () => ({ getEmail: () => 's@example.com' });
    const seen = S.getBootstrapData({ mode: 'all' }).rows.map(r => r.reservationNo);
    assert(JSON.stringify(seen) === '["R1"]', 'AUDIT-002 所属「717:イオン店」には 717:イオン の行だけが見える（見えた行=' + JSON.stringify(seen) + '）');
    be.sheets[S.STAFF_SHEET_NAME].getRange(3, 1, 1, 5).setValues([['s@example.com', 'S', 'イオン店', '東', '社員']]); S.__cacheStore.clear();
    const seen2 = S.getBootstrapData({ mode: 'all' }).rows.map(r => r.reservationNo);
    assert(seen2.length === 0, 'AUDIT-002 コードの無い「イオン店」は、どちらの店舗か決められないため、従来どおり何も見えない（見えた行=' + JSON.stringify(seen2) + '）'); }

  // AUDIT-003：氏名・役職が「toString」など
  { const { be, S, N } = mk(); be.sheets[S.STAFF_SHEET_NAME].getRange(3, 1, 1, 5).setValues([['s@example.com', 'toString', '未知店', '東', '社員']]);
    be.sheets[S.STAFF_NAME_SHEET_NAME].getRange(2, 1, 1, 2).setValues([['C_PROTO', 'toString']]);
    be.sheets[S.SHEET_NAME].getRange(2, 1, 1, N).setValues([row(S, { reservationNo: 'R1', area: '東', office: 'A店', staff: 'C_PROTO', departureDate: new be.SDate(2027, 0, 1) })]);
    assert(!tryCall(() => S.getAffiliationDiagnostics()).err, 'AUDIT-003 氏名が「toString」の人がいても、所属の照合状況の確認が止まらない');
    const r = tryCall(() => S.importStaffNameCsv({ matrix: [['■担当者NO', '社員名称', '■Gmailアドレス', '所属店舗', '所属エリア', '役職名'], ['C9', '山田', 'c9@example.com', 'A店', '東', 'toString'], ['constructor', '佐藤', 'c8@example.com', 'A店', '東', '社員']] }, 'h.csv'));
    const tally = r.v && (r.v.roleRawTally || r.v.roleTally || null);
    assert(!r.err && r.v.added === 2, 'AUDIT-003 担当者コード「constructor」も新しい担当者として追加される（added=' + (r.v && r.v.added) + '）');
    if (tally) assert(tally.toString === 1, 'AUDIT-003 役職「toString」の件数が正しく1件と数えられる（' + JSON.stringify(tally) + '）'); }

  // AUDIT-004：配列でない引数・付帯商品の名前「toString」
  { const { S } = mk();
    for (const [label, call] of [['batchUpdateCells("x")', () => S.batchUpdateCells('x')], ['bulkUpdateCellValue("x")', () => S.bulkUpdateCellValue('x', 'memo', 'a')], ['bulkSetAncillaryStatus("x")', () => S.bulkSetAncillaryStatus('x', 'insurance', '-', '', '')], ['addAffiliationAliases("x")', () => S.addAffiliationAliases('x')], ['bulkSetAncillaryStatus(toString)', () => S.bulkSetAncillaryStatus([2], 'toString', '-', '', '')]]) {
      const r = tryCall(call);
      assert(!!r.err && !/is not a function|Cannot read prop/.test(r.err), 'AUDIT-004 ' + label + ' は分かりやすいエラーで拒否（' + (r.err || '受け付けた').slice(0, 30) + '）');
    } }

  // AUDIT-006：他の人の処理中（ロックが取れない）でも、所属の照合状況に集計と案が出る
  { const { be, S, N } = mk();
    be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 4, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限'], ['a@example.com', '山田', '銀座営業所X', '東', '社員'], ['b@example.com', '佐藤', '銀座営業所X', '東', '社員'], ['c@example.com', '鈴木', '銀座営業所X', '東', '社員']]);
    be.sheets[S.STAFF_NAME_SHEET_NAME].getRange(2, 1, 3, 2).setValues([['C1', '山田'], ['C2', '佐藤'], ['C3', '鈴木']]);
    const rows = []; for (let i = 0; i < 30; i++) rows.push(row(S, { reservationNo: 'R' + i, area: '東', office: '111:銀座', staff: 'C' + (1 + i % 3), departureDate: new be.SDate(2027, 0, 1) }));
    be.sheets[S.SHEET_NAME].getRange(2, 1, rows.length, N).setValues(rows);
    const L = S.LockService.getScriptLock; S.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {} });
    const d = S.getAffiliationDiagnostics(); S.LockService.getScriptLock = L;
    const p = (d.staff || []).filter(x => x.problem)[0] || {};
    assert(p.proposal && p.proposal.to === '111:銀座' && p.vote && (d.autoLinked || []).length === 0, 'AUDIT-006 ロックが取れないときも、担当予約の集計（vote）と対応先の案（111:銀座）が出る（自動の登録はしない）（案=' + JSON.stringify(p.proposal || null).slice(0, 40) + '）'); }

  // AUDIT-007・008：モックアップ
  const DIR = process.env.MOCKUP_DIR || path.join(__dirname, '..', '..', 'reservation-dashboard-gas', 'mockup');
  const browser = await loadChromium().launch(chromiumLaunchOptions());
  for (const f of ['index.html', 'index-mobile.html']) {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto('file://' + path.join(DIR, f)); await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const out = {};
      STATE.role = '社員'; applyRoleUi(); const card = document.getElementById('column-order-card');
      out.cardHiddenForStaff = !!card && card.classList.contains('hidden');
      STATE.role = 'マスタ権限'; applyRoleUi(); out.cardShownForMaster = !!card && !card.classList.contains('hidden');
      out.al = mapCsvRoleToAppRole('ｴﾘｱ・ﾘｰﾀﾞｰ').role;
      // 一括登録したメモの未保存の変更は消える
      const row = STATE.rows[0];
      STATE.pendingChanges = {}; STATE.pendingChanges[pendingKey(row.rowIndex, 'memo')] = { kind: 'field', rowIndex: row.rowIndex, columnKey: 'memo', original: row.memo, value: '手入力' };
      STATE.selectedRowIndexes = {}; STATE.selectedRowIndexes[row.rowIndex] = true;
      const memoInput = document.getElementById('bulk-memo-input'); if (memoInput) memoInput.value = '一括';
      try { applyBulkField('memo'); } catch (e) { out.bulkErr = e.message; }
      out.pendingLeft = Object.keys(STATE.pendingChanges).length; out.memo = row.memo;
      // 既にあるコードの担当者を追加しようとすると拒否される
      const n0 = STATE.staffNameList.length; const code0 = STATE.staffNameList[0] && STATE.staffNameList[0].code;
      return Object.assign(out, { n0, code0 });
    });
    assert(r.cardHiddenForStaff && r.cardShownForMaster, 'AUDIT-007 ' + f + '：列の並び順の欄は、社員には表示せず、マスタには表示する');
    assert(r.pendingLeft === 0 && r.memo === '一括', 'AUDIT-007 ' + f + '：一括登録した項目の未保存の変更は消え、値は一括登録の値（' + r.memo + '・未保存=' + r.pendingLeft + (r.bulkErr ? '・エラー ' + r.bulkErr : '') + '）');
    assert(r.al === 'AL', 'AUDIT-008 ' + f + '：役職「ｴﾘｱ・ﾘｰﾀﾞｰ」は AL と判定（' + r.al + '）');
    if (r.code0) {
      await page.evaluate(() => { if (typeof openStaffNameModal === 'function') openStaffNameModal(null); });
      await page.evaluate(code => { document.getElementById('staff-name-form-rowindex').value = ''; document.getElementById('staff-name-form-code').value = code; document.getElementById('staff-name-form-name').value = '重複'; document.getElementById('staff-name-form').dispatchEvent(new Event('submit', { cancelable: true })); }, r.code0);
      const n1 = await page.evaluate(() => STATE.staffNameList.length);
      assert(n1 === r.n0, 'AUDIT-008 ' + f + '：既にある担当者コード「' + r.code0 + '」の追加は拒否（件数 ' + r.n0 + '→' + n1 + '）');
    }
    assert(errors.length === 0, f + '：画面のエラーなし ' + JSON.stringify(errors.slice(0, 2)));
    await page.close();
  }
  await browser.close();
  console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
})().catch(e => { console.error(e); process.exit(1); });
