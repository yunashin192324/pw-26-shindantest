/**
 * 追加・変更した機能の動作確認（Node.jsで実行： TZ=Asia/Tokyo node test/run_tests.js ）。
 * 実データは使わず、月次日報の店舗タブと同じ見出し・列位置の架空データで確認する。
 */
'use strict';
const vm = require('vm');
const { createEnv } = require('./gas_mock.js');

let failures = 0, passes = 0;
function check(label, cond, detail) {
  if (cond) { passes++; console.log('  ok   ' + label); }
  else { failures++; console.log('  NG   ' + label + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); }
}
function section(t) { console.log('\n■ ' + t); }

function freshEnv() {
  const env = createEnv();
  const run = function (code) { return vm.runInContext(code, env.ctx); };
  run('setupDatabase()');
  run(`
    appendRowFromObject_(getSheet_(SHEET_NAMES.STORES), { STORE_ID: 'ST-SJK', 店舗名: '新宿', 地方: '関東', 区分: 'AVA', 使用終了: false });
    appendRowFromObject_(getSheet_(SHEET_NAMES.STORES), { STORE_ID: 'ST-KTG', 店舗名: '関東一般店', 地方: '関東', 区分: '一般', 使用終了: false });
    [['S-ADM','本部','ST-001','admin@example.com','ADMIN'],['S-MGR','店長','ST-SJK','mgr@example.com','MANAGER'],
     ['S-STF','スタッフ','ST-SJK','staff@example.com','STAFF'],['S-OTH','他店店長','ST-002','other@example.com','MANAGER']]
      .forEach(function (r) { appendRowFromObject_(getSheet_(SHEET_NAMES.STAFF), { STAFF_ID: r[0], 氏名: r[1], 店舗ID: r[2], メール: r[3], 権限: r[4], 在籍: true }); });
  `);
  return { env: env, run: run, as: function (email) { env.state.email = email; } };
}

function manualCase(t, o) {
  const res = manualCaseRaw(t, o);
  if (o && o.既に成約済みか && !res.ok) throw new Error('テスト用の案件を作れませんでした: ' + JSON.stringify(res));
  return res;
}
function manualCaseRaw(t, o) {
  return t.run('createCase(' + JSON.stringify(Object.assign({
    新郎姓: '山田', 新郎名: '太郎', 新婦姓: '佐藤', 新婦名: '花子', 店舗ID: 'ST-SJK', 相談区分: '挙式',
    チャレンジ番号: 'AB123456789', 相談内容: 'ハワイ挙式', 担当者: 'スタッフ', 問合せ方法: '電話', 媒体: 'Instagram'
  }, o || {})) + ')');
}

/** フォーム送信をまねて案件を作る（FormItemMasterとの照合部分だけ差し替える） */
function formCase(t, names, storeName) {
  t.run(`mapFormResponseToRecords_ = function () {
    return { consultationType: '挙式', unmapped: [], byTable: {
      Cases: { 店舗ID: ${JSON.stringify(storeName)}, 流入経路: 'ゼクシィ' },
      Customers: ${JSON.stringify(names)}, WeddingRequests: { 希望挙式エリア: 'ハワイ' }, PhotoRequests: {} } };
  };
  notifyCounselingReceived_ = function () {}; notifyNewVisitToStore_ = function () {};`);
  t.run('onFormSubmitInstallable({ response: { getId: function () { return "FR-' + Math.random().toString(36).slice(2, 8) + '"; } } })');
  const cases = t.run('caseRepo_getAll()');
  return cases[cases.length - 1].CASE_ID;
}

// ------------------------------------------------------------
section('1. 問合せ方法・媒体の編集');
(function () {
  const t = freshEnv();
  t.as('staff@example.com');
  const formId = formCase(t, { 新郎姓: '鈴木', 新郎名: '一郎', 新婦姓: '高橋', 新婦名: '二葉' }, '新宿');
  const fc = t.run('caseRepo_getById(' + JSON.stringify(formId) + ')');
  check('フォーム経由の案件は問合せ方法が空欄（未設定）で作られる', fc.問合せ方法 === '', fc.問合せ方法);
  check('フォーム経由の案件の媒体はフォームの回答（流入経路）が入る', fc.媒体 === 'ゼクシィ', fc.媒体);

  const r = t.run('updateCaseCore(' + JSON.stringify(formId) + ', { 問合せ方法: "来店", 媒体: "Instagram", 案件状態: "成約", 店舗ID: "ST-002" })');
  const after = t.run('caseRepo_getById(' + JSON.stringify(formId) + ')');
  check('スタッフが問合せ方法・媒体を直せる', r.ok && after.問合せ方法 === '来店' && after.媒体 === 'Instagram', { r: r, m: after.問合せ方法 });
  check('編集できない項目（案件状態・店舗ID）は書き換わらない', after.案件状態 === '来店前' && after.店舗ID === 'ST-SJK', { s: after.案件状態, st: after.店舗ID });

  t.run('saveSetting_("FORM_DEFAULT_INQUIRY_METHOD", "Web")');
  const formId2 = formCase(t, { 新郎姓: '伊藤', 新婦姓: '渡辺' }, '新宿');
  check('設定 FORM_DEFAULT_INQUIRY_METHOD=Web なら従来どおり「Web」で作られる', t.run('caseRepo_getById(' + JSON.stringify(formId2) + ')').問合せ方法 === 'Web');

  t.as('other@example.com');
  const denied = t.run('updateCaseCore(' + JSON.stringify(formId) + ', { 問合せ方法: "電話" })');
  check('他店舗の店長は編集できない', denied.ok === false && denied.type === 'PERMISSION', denied);

  t.as('staff@example.com');
  manualCase(t, { チャレンジ番号: 'ZZ123456789' });
  const dup = t.run('updateCaseCore(' + JSON.stringify(formId) + ', { チャレンジ番号: "ZZ123456789" })');
  check('チャレンジ番号の重複時は、相手の案件IDと結合の案内が出る', dup.ok === false && /CASE-/.test(dup.message) && /結合/.test(dup.message), dup.message);
})();

// ------------------------------------------------------------
section('2. 重複した案件の結合・削除');
(function () {
  const t = freshEnv();
  t.as('staff@example.com');
  const manual = manualCase(t, { 新郎姓: '山田', 新婦姓: '佐藤', チャレンジ番号: 'AB123456789' }).data.caseId;
  t.run('saveSalesHistory({ CASE_ID: ' + JSON.stringify(manual) + ', 日付: "2026-11-01", 媒体: "来店", 担当: "スタッフ" })');
  t.run('addCaseNote(' + JSON.stringify(manual) + ', "手動登録側のメモ")');
  t.run('saveCaseSummaryMemo({ CASE_ID: ' + JSON.stringify(manual) + ', 時期: "来年春" })');
  t.run('toggleDocumentCheck(' + JSON.stringify(manual) + ', "DC-001", true)');
  const form = formCase(t, { 新郎姓: '山田', 新郎名: '太郎', 新婦姓: '佐藤', 新婦名: '花子', 新郎電話: '090-0000-0000' }, '新宿');
  t.run('saveCaseSummaryMemo({ CASE_ID: ' + JSON.stringify(form) + ', 時期: "来年5月", 式場: "カハラ" })');
  t.run('toggleDocumentCheck(' + JSON.stringify(form) + ', "DC-002", true)');

  const detail = t.run('getCaseDetail(' + JSON.stringify(form) + ')').data;
  check('案件詳細で、同じお客様と思われる案件が見つかる', detail.duplicateCandidates.length === 1 && detail.duplicateCandidates[0].CASE_ID === manual, detail.duplicateCandidates);

  const staffMerge = t.run('mergeCases(' + JSON.stringify(form) + ', ' + JSON.stringify(manual) + ')');
  check('スタッフは結合できない（店長・本部のみ）', staffMerge.ok === false && staffMerge.type === 'PERMISSION', staffMerge);

  t.as('mgr@example.com');
  const res = t.run('mergeCases(' + JSON.stringify(form) + ', ' + JSON.stringify(manual) + ')');
  check('店長が結合できる', res.ok === true, res);
  const cases = t.run('caseRepo_getAll()');
  check('消した方の案件の行が無くなる', !cases.some(function (c) { return c.CASE_ID === manual; }));
  const kept = t.run('caseRepo_getById(' + JSON.stringify(form) + ')');
  check('残した案件に、空欄だった項目（チャレンジ番号・問合せ方法）が埋まる', kept.チャレンジ番号 === 'AB123456789' && kept.問合せ方法 === '電話', { c: kept.チャレンジ番号, m: kept.問合せ方法 });
  check('残した案件の媒体（フォームの回答）はそのまま', kept.媒体 === 'ゼクシィ', kept.媒体);
  check('接客履歴が残した案件へ移る', t.run('caseRepo_getSalesHistoryByCaseId(' + JSON.stringify(form) + ')').length === 1);
  check('経過メモが残した案件へ移る', t.run('caseRepo_getCaseNotesByCaseId(' + JSON.stringify(form) + ')').length === 1);
  const memo = t.run('caseRepo_getSummaryMemoByCaseId(' + JSON.stringify(form) + ')');
  check('案件メモは両方の文章を残して結合される', /来年5月/.test(memo.時期) && /来年春/.test(memo.時期) && memo.式場 === 'カハラ', memo.時期);
  const checks = t.run('caseRepo_getDocumentChecksByCaseId(' + JSON.stringify(form) + ')');
  check('書類チェックは両方のチェックがまとまる', checks.length === 2 && checks.every(function (c) { return c.チェック済み === true; }), checks.length);
  const customers = t.run('sheetToObjects_(getSheet_(SHEET_NAMES.CUSTOMERS))');
  check('顧客の行は1件になる', customers.filter(function (c) { return c.CASE_ID === form || c.CASE_ID === manual; }).length === 1);
  const deleted = t.run('sheetToObjects_(getSheet_(SHEET_NAMES.DELETED_RECORDS))');
  check('消した行の控えが DeletedRecords に残る', deleted.some(function (d) { return d.シート名 === 'Cases' && d.対象CASE_ID === manual && d.操作 === 'MERGE'; }), deleted.length);
  const received = new Date(kept.受付日時).getTime();
  check('受付日時は早い方（先に手動登録した日時）になる', received <= Date.now());

  // 両方に有効な成約がある場合は結合しない
  t.as('admin@example.com');
  const a = manualCase(t, { 新郎姓: '木村', 新婦姓: '林', チャレンジ番号: 'CD123456789', 既に成約済みか: true, 商品: 'PRD-1', プラン: 'P1', 式場またはプラン名: 'カハラ', 方面: 'ハワイ', 挙式日: '2027-05-01' }).data.caseId;
  const b = manualCase(t, { 新郎姓: '木村', 新婦姓: '林', チャレンジ番号: 'EF123456789', 既に成約済みか: true, 商品: 'PRD-1', プラン: 'P1', 式場またはプラン名: 'カハラ', 方面: 'ハワイ', 挙式日: '2027-05-01' }).data.caseId;
  const both = t.run('mergeCases(' + JSON.stringify(a) + ', ' + JSON.stringify(b) + ')');
  check('両方に有効な成約がある案件は結合しない（数字の二重を防ぐ）', both.ok === false && /有効な成約/.test(both.message), both.message);

  // 削除
  const before = t.run('sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS)).length');
  const del = t.run('deleteCase(' + JSON.stringify(b) + ')');
  const after = t.run('sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS)).length');
  check('案件を削除すると、ひもづく契約・手配も消える', del.ok === true && after === before - 1 && !t.run('operationRepo_getByCaseId(' + JSON.stringify(b) + ')'), { del: del, before: before, after: after });
  check('削除した行の控えが残る', t.run('sheetToObjects_(getSheet_(SHEET_NAMES.DELETED_RECORDS))').some(function (d) { return d.操作 === 'DELETE' && d.対象CASE_ID === b && d.シート名 === 'Contracts'; }));
  t.as('other@example.com');
  const otherDel = t.run('deleteCase(' + JSON.stringify(a) + ')');
  check('他店舗の店長は削除できない', otherDel.ok === false, otherDel);
})();

// ------------------------------------------------------------
section('3. 過去の月次日報の取り込み');

/** 月次日報の店舗タブと同じ見出し・列位置の架空タブを作る（見出し行の位置は layoutOffset でずらせる） */
function makeStoreTab(entries, cancels, layoutOffset) {
  const W = 34, rows = [];
  const blank = function () { return new Array(W).fill(''); };
  for (let i = 0; i < 29 + (layoutOffset || 0); i++) rows.push(blank());
  rows[19][1] = '新規'; rows[19][10] = '成約'; // 上部の集計欄（明細の見出しと誤認しないこと）
  let r = blank(); r[1] = '▼問合せ・NB'; rows.push(r);
  rows.push(blank());
  r = blank();
  r[1] = '新規/\n既存'; r[2] = '問合せ方法\n（新規のみ）'; r[4] = '媒体（新規のみ）\n1件目　　　2件目'; r[8] = '問合せ\nNB日'; r[10] = '担当者';
  r[11] = 'チャレンジ'; r[13] = 'CPL\n旅行'; r[14] = '列席\n旅行'; r[15] = '挙式日'; r[16] = '挙式月'; r[17] = '方面'; r[19] = '問合\n結果';
  r[20] = 'AGT'; r[21] = '式場'; r[25] = 'プラン'; r[27] = '未成約理由 / 備考'; r[31] = '代表者名\n履歴シートリンク';
  rows.push(r);
  entries.forEach(function (e) {
    const x = blank();
    x[1] = e.type; x[2] = e.method || ''; x[4] = e.media || ''; x[8] = e.nb; x[10] = e.staff || 'A'; x[11] = e.ch || '';
    x[13] = e.cpl === undefined ? '' : e.cpl; x[14] = e.guest === undefined ? '' : e.guest; x[15] = e.wd || ''; x[16] = new Date(1899, 11, 1);
    x[17] = e.area || ''; x[19] = e.result || ''; x[20] = e.agt || ''; x[21] = e.venue || '';
    rows.push(x);
  });
  for (let i = 0; i < 5; i++) { const x = blank(); x[16] = new Date(1899, 11, 1); rows.push(x); } // 空行（挙式月の数式だけ入っている）
  r = blank(); r[1] = '▼キャンセル（ALL CXL/旅行のみCXL/ゲストのみCXLなどすべてのキャンセルをこちらに入れる）'; rows.push(r);
  r = blank(); r[1] = 'CXL年月日'; r[3] = '担当者'; r[4] = 'チャレンジ'; r[6] = '挙式日'; r[7] = '挙式月'; r[8] = 'PAX'; r[9] = '方面'; r[11] = 'AGT'; r[12] = '式場'; r[16] = '理由';
  rows.push(r);
  cancels.forEach(function (c) {
    const x = blank();
    x[1] = c.date || ''; x[3] = c.staff || 'A'; x[4] = c.ch || ''; x[8] = c.pax === undefined ? '' : c.pax; x[9] = c.area || ''; x[11] = c.agt || '';
    rows.push(x);
  });
  r = blank(); r[1] = '▼各種集計'; rows.push(r);
  for (let i = 0; i < 3; i++) { const x = blank(); x[1] = '集計'; x[5] = 99; rows.push(x); }
  return rows;
}

(function () {
  const t = freshEnv();
  const D = function (y, m, d) { return new Date(y, m - 1, d); };
  // 46期11月（2025年11月）のファイル
  const book = new t.env.Spreadsheet('46期AVA日報11月');
  book.sheets = [];
  const sjk = new t.env.Sheet('新宿', makeStoreTab([
    { type: '新規', nb: D(2025, 11, 3), result: '成約', area: 'ハワイ', cpl: 2, guest: 10, wd: D(2026, 6, 1), agt: 'X社', ch: 'AAA11111111' },
    { type: '新規', nb: D(2025, 11, 5), result: '未成約', area: 'ハワイ' },
    { type: '新規', nb: '11/20', result: '成約', area: '沖縄', cpl: 2, guest: 0, wd: '2026/3/3' },  // 年なしの日付（ファイル名の期から補う）
    { type: '既存', nb: D(2025, 11, 21), result: '成約', area: 'ハワイ', cpl: 0, guest: 4 },        // 旅行の追加手配
    { type: '新規', nb: D(2025, 12, 1), result: '', area: 'ハワイ' },                                 // ファイルの月以外のNB日
    { type: '新規', nb: '', result: '成約', area: 'ハワイ', staff: 'B' }                              // NB日が空欄（数えない）
  ], [
    { date: D(2025, 11, 10), pax: 12, area: 'ハワイ', agt: 'X社', ch: 'AAA11111111' },
    { date: D(2025, 11, 12), pax: 3, area: 'ハワイ', agt: '' },   // ゲストのみキャンセル（AGTなし→件数に数えずPAXだけ）
    { date: '', pax: 1, ch: 'BBB' }                                // 日付なし（数えない）
  ]));
  const ktg = new t.env.Sheet('関東一般店', makeStoreTab([
    { type: '新規', nb: D(2025, 11, 8), result: '成約', area: 'ハワイ', cpl: 2, guest: 0 }
  ], [], 51));
  const summary = new t.env.Sheet('【関東】11月進捗', [['', '店舗', '新規'], ['', '新宿', 5]]);
  const ghost = new t.env.Sheet('関東予備', makeStoreTab([], []));
  book.sheets.push(sjk, ktg, summary, ghost);
  t.env.ctx.SpreadsheetApp.register(book);

  t.run('pastNippo_setup()');
  t.run('appendRowFromObject_(getSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES), { "スプレッドシートのURL": ' + JSON.stringify(book.getUrl()) + ' })');
  const preview = t.run('pastNippo_preview()');
  check('確認だけ（書き込まない）：件数が出る（新宿5件＋関東一般店1件。NB日空欄の1件は数えない）', preview.files === 1 && preview.entries === 6 && preview.cancels === 2, preview);
  check('確認だけでは前年実績に書き込まない', t.run('historicalActualsRepo_getAll().length') === 0);
  const map = t.run('sheetToObjects_(getSheet_(SHEET_NAMES.PAST_NIPPO_STORE_MAP))');
  check('タブ名と店舗の対応表が自動で作られる（店舗名が一致すれば店舗IDが入る）',
    map.find(function (m) { return m.タブ名 === '新宿'; }).店舗ID === 'ST-SJK' && map.find(function (m) { return m.タブ名 === '関東一般店'; }).店舗ID === 'ST-KTG', map);
  check('集計タブ（明細の見出しが無いタブ）は対応表に入らない', !map.some(function (m) { return m.タブ名 === '【関東】11月進捗'; }));
  const memo = t.run('sheetToObjects_(getSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES))')[0].メモ;
  check('メモ欄に注意点が出る（NB日空欄・読み飛ばしたタブ・方面マスタに無い方面）',
    /問合せNB日が空欄/.test(memo) && /読み飛ばしたタブ.*【関東】11月進捗/.test(memo) && /ファイルの月以外/.test(memo), memo);

  const imp = t.run('pastNippo_import()');
  check('取り込める', imp.files === 1, imp);
  const hist = t.run('historicalActualsRepo_getAll()');
  const row = function (ym, store, area) { return hist.find(function (h) { return pastNippo_normYm_(h.年月) === ym && h.店舗ID === store && h.方面 === area; }); };
  t.run('function pastNippo_normYm_x(v){return pastNippo_normYm_(v);}');
  const pn = function (v) { return t.env.ctx.pastNippo_normYm_(v); };
  const find = function (ym, store, area) { return hist.find(function (h) { return pn(h.年月) === ym && h.店舗ID === store && h.方面 === area; }); };
  const hw = find('2025-11', 'ST-SJK', 'ハワイ');
  check('新宿・2025年11月・ハワイ：新規2・成約2（既存の成約も含む）', hw && hw.来店数 === 2 && hw.成約数 === 2, hw);
  check('　NB_PAX＝CPL＋列席の合計（2+10+0+4=16）', hw && hw.NB_PAX === 16, hw && hw.NB_PAX);
  check('　CXL数はAGTのある行だけ（1）、CXL_PAXは全行（12+3=15）', hw && hw.CXL数 === 1 && hw.CXL_PAX === 15, hw && [hw.CXL数, hw.CXL_PAX]);
  const ok = find('2025-11', 'ST-SJK', '沖縄');
  check('年なしの日付「11/20」はファイル名の期（46期＝2025年11月〜）から2025年として読む', ok && ok.来店数 === 1 && ok.成約数 === 1, ok);
  const dec = find('2025-12', 'ST-SJK', 'ハワイ');
  check('NB日が12月の行は12月に数える', dec && dec.来店数 === 1, dec);
  const wed = find('2026-06', 'ST-SJK', 'ハワイ');
  check('挙式月成約数：挙式日の月（2026年6月）で数える', wed && wed.挙式月成約数 === 1, wed);
  const wedOk = find('2026-03', 'ST-SJK', '沖縄');
  check('挙式日「2026/3/3」の文字列も読める', wedOk && wedOk.挙式月成約数 === 1, wedOk);
  const k = find('2025-11', 'ST-KTG', 'ハワイ');
  check('見出し行の位置が違うタブ（関東一般店）も読める', k && k.来店数 === 1 && k.成約数 === 1, k);
  check('年月は「yyyy-MM」の文字列で保存される（日付に変換されない）', typeof hw.年月 === 'string' && hw.年月 === '2025-11', hw.年月);

  // 二重取込の防止・手入力の行の優先
  t.run('getSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES).getRange(2, 2).setValue("")');
  t.run('historicalActualsRepo_save({ 年月: "2025-12", 店舗ID: "ST-SJK", 方面: "ハワイ", 来店数: 7, 成約数: 3, 登録者: "本部" })');
  const imp2 = t.run('pastNippo_import()');
  const hist2 = t.run('historicalActualsRepo_getAll()');
  const hw2 = hist2.filter(function (h) { return pn(h.年月) === '2025-11' && h.店舗ID === 'ST-SJK' && h.方面 === 'ハワイ'; });
  check('同じファイルをもう一度取り込んでも二重にならない', hw2.length === 1 && hw2[0].来店数 === 2, hw2);
  const manual = hist2.filter(function (h) { return pn(h.年月) === '2025-12' && h.店舗ID === 'ST-SJK' && h.方面 === 'ハワイ'; });
  check('手入力の前年実績がある月は手入力の値を残す', manual.length === 1 && manual[0].来店数 === 7 && imp2.keptManual === 1, { manual: manual, k: imp2.keptManual });

  // 店舗IDが未設定のタブがあるファイルは取り込まない
  const book2 = new t.env.Spreadsheet('46期AVA日報12月');
  book2.sheets = [new t.env.Sheet('未知の店', makeStoreTab([{ type: '新規', nb: D(2025, 12, 2), result: '成約', area: 'ハワイ' }], []))];
  t.env.ctx.SpreadsheetApp.register(book2);
  t.run('appendRowFromObject_(getSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES), { "スプレッドシートのURL": ' + JSON.stringify(book2.getUrl()) + ' })');
  const imp3 = t.run('pastNippo_import()');
  const st = t.run('sheetToObjects_(getSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES))')[1];
  check('店舗が分からないタブがあるファイルはエラーにして取り込まない', st.状態 === 'エラー' && /未知の店/.test(st.メモ) && imp3.skipped === 1, st);
  t.run('const s = getSheet_(SHEET_NAMES.PAST_NIPPO_STORE_MAP); const r = findRowIndexByKey_(s, "タブ名", "未知の店"); s.getRange(r, 2).setValue("対象外");');
  t.run('pastNippo_import()');
  const st2 = t.run('sheetToObjects_(getSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES))')[1];
  check('「対象外」にしたタブは数えずに取り込みを進める', st2.状態 === '取込済み', st2);

  t.run('pastNippo_clearImported()');
  const left = t.run('historicalActualsRepo_getAll()');
  check('取り消しで「日報取込」の行だけ消え、手入力の行は残る', left.length === 1 && left[0].登録者 === '本部', left);
})();

// ------------------------------------------------------------
section('4. 稼働前の月の前年比較・NETの数え方・古くなったデータ');
/** 期ごとの通期推移から、指定した年月のセルを探す */
function trendCell(trend, ym) {
  for (let i = 0; i < trend.periods.length; i++) {
    const p = trend.periods[i];
    if (ym >= p.fromIso.slice(0, 7) && ym <= p.toIso.slice(0, 7)) {
      const mi = (Number(ym.slice(5, 7)) - 11 + 12) % 12;
      return trend.table[mi]['y' + i];
    }
  }
  return undefined;
}
function trendTotal(trend, ym) {
  for (let i = 0; i < trend.periods.length; i++) {
    const p = trend.periods[i];
    if (ym >= p.fromIso.slice(0, 7) && ym <= p.toIso.slice(0, 7)) return trend.totalsByPeriod[i];
  }
  return undefined;
}
(function () {
  const t = freshEnv();
  const now = new Date();
  const Y = now.getFullYear();
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  const thisYm = Y + '-' + pad(now.getMonth() + 1);
  t.run('saveSetting_("SYSTEM_START_MONTH", ' + JSON.stringify(thisYm) + ')');
  // 稼働前（前年同月・今年の前月）の取り込み値
  const prevYm = (Y - 1) + '-' + pad(now.getMonth() + 1);
  const lastMonth = new Date(Y, now.getMonth() - 1, 1);
  const lastYm = lastMonth.getFullYear() + '-' + pad(lastMonth.getMonth() + 1);
  [[prevYm, 10, 6, 1, 20, 2], [lastYm, 8, 5, 2, 15, 4]].forEach(function (r) {
    t.run('appendRowFromObject_(getSheet_(SHEET_NAMES.HISTORICAL_ACTUALS), ' + JSON.stringify({
      年月: r[0], 店舗ID: 'ST-SJK', 方面: 'ハワイ', 来店数: r[1], 成約数: r[2], CXL数: r[3], NB_PAX: r[4], CXL_PAX: r[5], 登録者: '日報取込' }) + ')');
  });
  t.as('admin@example.com');
  const c1 = manualCase(t, { チャレンジ番号: 'GH123456789', 既に成約済みか: true, 商品: 'PRD-1', プラン: 'P1', 式場またはプラン名: 'カハラ', 方面: 'ハワイ', 挙式日: (Y + 1) + '-04-01' }).data.caseId;
  manualCase(t, { 新郎姓: '別', 新婦姓: '人', チャレンジ番号: 'IJ123456789' });
  t.run('updateRowByKey_(getSheet_(SHEET_NAMES.CONTRACTS), "CASE_ID", ' + JSON.stringify(c1) + ', { CPL旅行人数: 2, 列席旅行人数: 6 })');
  t.run('cancelContract({ CASE_ID: ' + JSON.stringify(c1) + ', 未成約理由カテゴリ: "価格" })');

  t.run('nippoService_startMonthCache_ = null');
  const trend = t.run('nippoService_getMultiYearTrend({}, {}, 3)');
  check('通期推移は期（11月始まり）で並ぶ', trend.table[0].month === '11月' && trend.table[11].month === '10月' && /期$/.test(trend.periods[0].label), trend.periods);
  const cur = trendCell(trend, thisYm);
  check('稼働後の月：あとでキャンセルされた成約もNBに数え、CXLを別に数える（NB1・CXL1・NET0）', cur.NB === 1 && cur.CXL === 1 && cur.NET === 0 && cur.PAX_NB === 8 && cur.PAX_CXL === 8, cur);
  const prev = trendCell(trend, prevYm);
  check('前年同月：取り込んだ値（新規10・NB6・CXL1・NET5）', prev.hasData && prev.新規問合せ === 10 && prev.NB === 6 && prev.CXL === 1 && prev.NET === 5, prev);
  const lm = trendCell(trend, lastYm);
  check('稼働前の月：0件ではなく取り込んだ値を出す', lm && lm.hasData && lm.新規問合せ === 8 && lm.fromHistorical === true, lm);
  const weekly = t.run('nippoService_getWeeklySummary({ yearMonth: ' + JSON.stringify(thisYm) + ' }, {})');
  check('週次の前年（稼働前）は0ではなく「データなし」', weekly.rows.every(function (r) { return r.previous.hasData === false; }), weekly.rows.map(function (r) { return r.previous; }));

  t.run('batchRebuildAnalyticsCache()');
  const dash = t.run('dashboardService_getData({ from: "' + lastYm + '-01", to: "' + t.run('formatDateISO_(new Date())') + '" })');
  check('ダッシュボードの期間に稼働前の月があれば、取り込み値（新規8・成約5）を足す',
    dash.summary.来店数 === 8 + 2 && dash.summary.成約数 === 5 + 1 && dash.summary.稼働前の月を含む === true, dash.summary);
  const dashDefault = t.run('dashboardService_getData({})');
  check('ダッシュボードの期間を指定しないときは今期（期首〜今日）', dashDefault.periodFrom === t.run('fiscalPeriodStartIso_()') && /-11-01$/.test(dashDefault.periodFrom), dashDefault.periodFrom);
  check('ダッシュボードの前年（稼働前の月）は取り込んだ値を使う（前年同月の新規10）', dash.summary && dash.summary.来店数前年 === 10 && dash.summary.成約数前年 === 6, dash.summary);

  // 古くなったデータ：アーカイブ前の月次集計
  const t2 = freshEnv();
  t2.as('admin@example.com');
  const oldYear = Y - 3;
  const caseId = manualCase(t2, { チャレンジ番号: 'KL123456789', 既に成約済みか: true, 商品: 'PRD-1', プラン: 'P1', 式場またはプラン名: 'カハラ', 方面: 'ハワイ', 挙式日: oldYear + '-09-01' }).data.caseId;
  t2.run('updateRowByKey_(getSheet_(SHEET_NAMES.CASES), "CASE_ID", ' + JSON.stringify(caseId) + ', { 受付日時: new Date(' + oldYear + ', 2, 5), 案件状態: "完了" })');
  t2.run('updateRowByKey_(getSheet_(SHEET_NAMES.CONTRACTS), "CASE_ID", ' + JSON.stringify(caseId) + ', { 契約日: "' + oldYear + '-03-10", CPL旅行人数: 2, 列席旅行人数: 3 })');
  t2.run('saveSetting_("SYSTEM_START_MONTH", "' + oldYear + '-01")');
  t2.run('nippoService_startMonthCache_ = null');
  t2.run('batchArchiveOldRecords()');
  check('アーカイブで本体シートから案件が移る', t2.run('caseRepo_getAll().length') === 0);
  const snap = t2.run('historicalActualsRepo_getAll()').filter(function (h) { return h.登録者 === 'システム集計'; });
  check('移す前に、その年の月次集計がHistoricalActuals（システム集計）に保存される', snap.length >= 2, snap);
  const mar = snap.find(function (h) { return h.年月 === oldYear + '-03' && h.方面 === 'ハワイ'; });
  check('　成約数・NB_PAXが入る', mar && mar.成約数 === 1 && mar.NB_PAX === 5, mar);
  const sep = snap.find(function (h) { return h.年月 === oldYear + '-09'; });
  check('　挙式月成約数は挙式月（9月）に入る', sep && sep.挙式月成約数 === 1, sep);
  t2.run('nippoService_startMonthCache_ = null');
  t2.run('saveSetting_("SYSTEM_START_MONTH", "' + oldYear + '-01")');
  const afterTrend = t2.run('nippoService_getMultiYearTrend({}, {}, 5)');
  const tot = trendTotal(afterTrend, oldYear + '-03');
  check('アーカイブ後も、移した年の通期推移に数字が出る（新規1・NB1・NB_PAX5）', tot.新規問合せ === 1 && tot.NB === 1 && tot.PAX_NB === 5, tot);
  const dash2 = t2.run('dashboardService_getData({ from: "' + (oldYear + 1) + '-01-01", to: "' + (oldYear + 1) + '-12-31" })');
  check('ダッシュボードの前年（アーカイブ済みの年）は保存した月次集計を使う', dash2.summary && dash2.summary.成約数前年 === 1, dash2.summary);
  t2.run('batchArchiveOldRecords()');
  check('2回目のバッチで同じ年の集計を二重に保存しない', t2.run('historicalActualsRepo_getAll()').filter(function (h) { return h.登録者 === 'システム集計'; }).length === snap.length);
})();

// ------------------------------------------------------------
section('5. 稼働前の内訳の前年比（担当者別・式場/プラン/AGT・媒体・週次）・方面のまとめ・マスタ');
(function () {
  const t = freshEnv();
  const now = new Date();
  const Y = now.getFullYear();
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  const thisYm = Y + '-' + pad(now.getMonth() + 1);
  t.run('saveSetting_("SYSTEM_START_MONTH", ' + JSON.stringify(thisYm) + ')');
  // 担当者マスタの「日報での表記」で、日報の「山」をCRMの「スタッフ」にそろえる
  t.run('ensureColumns_(getSheet_(SHEET_NAMES.STAFF), ["日報での表記"]); updateRowByKey_(getSheet_(SHEET_NAMES.STAFF), "STAFF_ID", "S-STF", { 日報での表記: "山" })');

  const D = function (m, d) { return new Date(Y - 1, m - 1, d); };
  const fp = t.run('fiscalPeriodOf_(new Date(' + (Y - 1) + ', ' + now.getMonth() + ', 2))').period;
  const book = new t.env.Spreadsheet(fp + '期AVA日報' + (now.getMonth() + 1) + '月');
  book.sheets = [new t.env.Sheet('新宿', makeStoreTab([
    { type: '新規', nb: D(now.getMonth() + 1, 1), staff: '山', result: '成約', area: 'バリ島/他アジア', venue: 'アヤナ', agt: 'BSB', cpl: 2, guest: 4, media: 'インスタ' },
    { type: '新規', nb: D(now.getMonth() + 1, 2), staff: '山', result: '未成約', area: 'ハワイ', media: 'Google' },
    { type: '新規', nb: D(now.getMonth() + 1, 3), staff: '川', result: '成約', area: 'ハワイ', venue: 'カハラ', agt: 'ARW', cpl: 2, guest: 0, media: 'インスタ' }
  ], [
    { date: D(now.getMonth() + 1, 4), staff: '山', pax: 6, area: 'バリ島/他アジア', agt: 'BSB' }
  ]))];
  // 媒体2件目（G列）を入れる
  book.sheets[0].data[33][6] = 'ゼクシィネット';
  t.env.ctx.SpreadsheetApp.register(book);
  t.run('pastNippo_setup()');
  t.run('appendRowFromObject_(getSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES), { "スプレッドシートのURL": ' + JSON.stringify(book.getUrl()) + ' })');
  const imp = t.run('pastNippo_import()');
  check('取り込みで、明細が別のスプレッドシート（過去日報明細）に期ごとのシートで保存される',
    imp.files === 1 && t.run('pastDetail_spreadsheet_(false) !== null') && t.run('pastDetail_spreadsheet_(false).getSheetByName("Entries_' + fp + '期").getLastRow()') === 4, imp);
  check('明細の保存先はCRMのデータ用スプレッドシートとは別', t.run('pastDetail_spreadsheet_(false).getId() !== getDatabaseSpreadsheet_().getId()'));

  // 今期の実データ（成約1件：バリ島）
  t.as('admin@example.com');
  manualCase(t, { チャレンジ番号: 'MN123456789', 既に成約済みか: true, 商品: 'PRD-1', プラン: 'P1', 式場またはプラン名: 'アヤナ', 方面: 'バリ島', 都市: 'バリ島', 挙式日: (Y + 1) + '-05-01' });
  t.run('nippoService_startMonthCache_ = null; nippoService_familyCache_ = {};');

  const today = t.run('formatDateISO_(new Date())');
  const staff = t.run('nippoService_getStaffReport({ from: "' + thisYm + '-01", to: "' + today + '" }, {})');
  const yama = staff.find(function (r) { return r.staff === 'スタッフ'; });
  check('担当者別：稼働前の前年を日報の明細から出す（「山」→担当者「スタッフ」：新規2・NB1・CXL1・PAX6）',
    yama && yama.前年 && yama.前年.新規問合せ === 2 && yama.前年.NB === 1 && yama.前年.CXL === 1 && yama.前年.PAX_NB === 6, yama);
  const kawa = staff.find(function (r) { return r.staff === '川'; });
  check('担当者別：日報での表記が無い担当者は日報の名前のまま出る', kawa && kawa.前年.NB === 1, kawa);

  const rank = t.run('dashboardService_getAreaRankings("バリ島・他アジア", { from: "' + thisYm + '-01", to: "' + today + '" }, {})');
  const ayana = rank.venueRanking.find(function (r) { return r.label === 'アヤナ'; });
  check('方面内ランキング：今期（バリ島）と前年（日報の「バリ島/他アジア」）を同じ集計方面で比べる', ayana && ayana.count === 1 && ayana.prevCount === 1, rank.venueRanking);
  const agt = rank.agtRanking.find(function (r) { return r.label === 'BSB'; });
  check('AGTランキングの前年も日報の明細から出る', agt && agt.prevCount === 1, rank.agtRanking);
  const hwRank = t.run('dashboardService_getAreaRankings("ハワイ", { from: "' + thisYm + '-01", to: "' + today + '" }, {})');
  check('別の方面（ハワイ）の前年には混ざらない', hwRank.venueRanking.some(function (r) { return r.label === 'カハラ' && r.prevCount === 1; }) && !hwRank.venueRanking.some(function (r) { return r.label === 'アヤナ'; }), hwRank.venueRanking);

  const media = t.run('dashboardService_getMediaBreakdown({ from: "' + thisYm + '-01", to: "' + today + '" }, {})');
  const insta = media.find(function (m) { return m.media === 'インスタ'; });
  const zexy = media.find(function (m) { return m.media === 'ゼクシィネット'; });
  check('媒体別：前年を日報の明細から出す（インスタ2件、2件目の媒体も数える）', insta && insta.prevCount === 2 && zexy && zexy.prevCount === 1, media);

  const weekly = t.run('nippoService_getWeeklySummary({ yearMonth: ' + JSON.stringify(thisYm) + ' }, {})');
  const prevNB = weekly.rows.reduce(function (s, r) { return s + (r.previous.hasData ? r.previous.NB : 0); }, 0);
  check('週次：稼働前の前年の週も日報の明細から出る（NB合計2）', prevNB === 2 && weekly.rows.some(function (r) { return r.previous.hasData; }), weekly.rows.map(function (r) { return r.previous; }));

  const prog = t.run('nippoService_getAreaProgressByStore("バリ島・他アジア", { from: "' + thisYm + '-01", to: "' + today + '" }, {})');
  const progRow = prog.table.find(function (r) { return r.plan === 'アヤナ'; });
  check('エリア進捗：前年を日報の明細から出す', progRow && progRow.byStore['ST-SJK'].prev === 1, prog.table);

  const nat = t.run('nippoService_getStoreAreaMatrix({ from: "' + thisYm + '-01", to: "' + today + '" })');
  check('全国店舗×方面の列は日報の方面（集計方面）', nat.areas.indexOf('バリ島・他アジア') !== -1 && nat.areas.indexOf('バリ島') === -1, nat.areas);

  const masters = t.run('getReferenceMasters()').data;
  check('問合せ方法マスタは日報と同じ（来店・電話・オンライン・メール・LINE・国内）',
    masters.inquiryMethods.map(function (m) { return m.名称; }).join(',') === '来店,電話,オンライン,メール,LINE,国内', masters.inquiryMethods.map(function (m) { return m.名称; }));
  check('媒体マスタは日報の問合せ媒体の一覧', masters.media.some(function (m) { return m.名称 === 'AVA公式LINE'; }) && masters.media.length === 18);
  check('方面の選択肢（集計方面）は日報の方面', masters.areaGroups.indexOf('バリ島・他アジア') !== -1 && masters.areaGroups.indexOf('オセアニア・アメリカ・カリブ') !== -1, masters.areaGroups);
  const added = t.run('saveCommonMasterData("inquiryMethods", { 名称: "Instagram DM", 表示順: 7, 使用終了: false })');
  check('問合せ方法は本部が画面から追加できる', added.ok === true && t.run('masterRepo_getAll(SHEET_NAMES.INQUIRY_METHODS).length') === 7, added);
  const ct = t.run('sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS))').find(function (r) { return r.方面 === 'バリ島'; });
  check('成約に都市が記録される', ct && ct.都市 === 'バリ島', ct);
})();

console.log('\n結果：' + passes + '件成功 / ' + failures + '件失敗');
process.exit(failures ? 1 : 0);
