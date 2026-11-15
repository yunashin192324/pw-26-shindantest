/**
 * caseRepository.gs
 * Cases・WeddingRequests・PhotoRequests・SalesHistory・CaseNotes・Contracts・LostCases・Tasks
 * シートへの実際の読み書きだけを担当する（第7章2章：SQLで言うDAOに相当）。
 * 業務ロジック（成約時にOperationsを作る等）はここに書かず、service/caseService.gs に集約する。
 */

/* ---------- Cases ---------- */

function caseRepo_insertCase(caseObj) {
  const sheet = getSheet_(SHEET_NAMES.CASES);
  appendRowFromObject_(sheet, caseObj);
  return caseObj.CASE_ID;
}

function caseRepo_getById(caseId) {
  const sheet = getSheet_(SHEET_NAMES.CASES);
  const rowIndex = findRowIndexByKey_(sheet, 'CASE_ID', caseId);
  if (rowIndex === -1) return null;
  return getRowAsObject_(sheet, rowIndex);
}

function caseRepo_updateById(caseId, patch) {
  const sheet = getSheet_(SHEET_NAMES.CASES);
  patch.更新日時 = new Date();
  updateRowByKey_(sheet, 'CASE_ID', caseId, patch);
}

function caseRepo_getAll() {
  const sheet = getSheet_(SHEET_NAMES.CASES);
  return sheetToObjects_(sheet);
}

/**
 * チャレンジ番号は案件（Cases）に1つだけ持つ（Q&A一巡目 C-8）。
 * 旧・日報システムのisChallengeDuplicate_を踏襲した重複チェック（対象列のみ取得して比較する）。
 */
function caseRepo_isChallengeNumberDuplicate(challengeNo, excludeCaseId) {
  if (!challengeNo) return false;
  const sheet = getSheet_(SHEET_NAMES.CASES);
  const ids = getColumnValues_(sheet, 'CASE_ID');
  const values = getColumnValues_(sheet, 'チャレンジ番号');
  return values.some(function (v, i) {
    if (excludeCaseId && ids[i] === excludeCaseId) return false;
    return String(v || '').trim() === challengeNo;
  });
}

/* ---------- Customers（案件に紐づく参照。実体はcustomerRepository.gs） ---------- */

function caseRepo_getCustomerByCaseId(caseId) {
  return customerRepo_getByCaseId(caseId);
}

/* ---------- WeddingRequests / PhotoRequests ---------- */

function caseRepo_insertWeddingRequest(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.WEDDING_REQUESTS), obj);
}

function caseRepo_insertPhotoRequest(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.PHOTO_REQUESTS), obj);
}

function caseRepo_getWeddingRequestByCaseId(caseId) {
  const sheet = getSheet_(SHEET_NAMES.WEDDING_REQUESTS);
  const rowIndex = findRowIndexByKey_(sheet, 'CASE_ID', caseId);
  return rowIndex === -1 ? null : getRowAsObject_(sheet, rowIndex);
}

function caseRepo_getPhotoRequestByCaseId(caseId) {
  const sheet = getSheet_(SHEET_NAMES.PHOTO_REQUESTS);
  const rowIndex = findRowIndexByKey_(sheet, 'CASE_ID', caseId);
  return rowIndex === -1 ? null : getRowAsObject_(sheet, rowIndex);
}

/* ---------- SalesHistory（接客履歴。日付・媒体・窓口・担当・備考。Q&A九巡目：実シートに合わせた） ---------- */

function caseRepo_insertSalesHistory(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.SALES_HISTORY), obj);
}

function caseRepo_getSalesHistoryByCaseId(caseId) {
  const rows = sheetToObjects_(getSheet_(SHEET_NAMES.SALES_HISTORY));
  return rows.filter(function (r) { return r.CASE_ID === caseId; })
    .sort(function (a, b) { return new Date(b.日付) - new Date(a.日付); });
}

/* ---------- CaseNotes（経過メモ。後日の電話対応等の追記ログ。Q&A一巡目 A-1） ---------- */

function caseRepo_insertCaseNote(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.CASE_NOTES), obj);
}

function caseRepo_getCaseNotesByCaseId(caseId) {
  const rows = sheetToObjects_(getSheet_(SHEET_NAMES.CASE_NOTES));
  return rows.filter(function (r) { return r.CASE_ID === caseId; })
    .sort(function (a, b) { return new Date(b.投稿日時) - new Date(a.投稿日時); });
}

/**
 * ---------- CaseSummaryMemo（案件メモ。構造化・1案件1行。Q&A九巡目） ----------
 * 実際の接客記録シートの備考欄にある固定見出しをそのまま再現した、案件理解の要約メモ。
 * 案件詳細を開くたびに毎回埋める入力フォームではなく、分かった範囲で随時上書き保存する運用。
 */
function caseRepo_getSummaryMemoByCaseId(caseId) {
  const sheet = getSheet_(SHEET_NAMES.CASE_SUMMARY_MEMO);
  const rowIndex = findRowIndexByKey_(sheet, 'CASE_ID', caseId);
  return rowIndex === -1 ? null : getRowAsObject_(sheet, rowIndex);
}

function caseRepo_saveSummaryMemo(caseId, patch) {
  const sheet = getSheet_(SHEET_NAMES.CASE_SUMMARY_MEMO);
  upsertRowByKey_(sheet, 'CASE_ID', caseId, Object.assign({ CASE_ID: caseId }, patch));
}

/**
 * ---------- 書類チェックリスト（DocumentChecklistItems・CaseDocumentChecks。Q&A九巡目） ----------
 */
function documentChecklistRepo_getAll() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.DOCUMENT_CHECKLIST_ITEMS))
    .filter(function (r) { return r.使用終了 !== true && r.使用終了 !== 'TRUE'; })
    .sort(function (a, b) { return (a.表示順 || 0) - (b.表示順 || 0); });
}

function caseRepo_getDocumentChecksByCaseId(caseId) {
  return getRowsAsObjectsByKey_(getSheet_(SHEET_NAMES.CASE_DOCUMENT_CHECKS), 'CASE_ID', caseId);
}

function caseRepo_setDocumentCheck(caseId, itemId, checked, updater) {
  const sheet = getSheet_(SHEET_NAMES.CASE_DOCUMENT_CHECKS);
  upsertRowByTwoKeys_(sheet, 'CASE_ID', caseId, 'ITEM_ID', itemId, {
    CASE_ID: caseId, ITEM_ID: itemId, チェック済み: checked, 更新日時: new Date(), 更新者: updater
  });
}

/* ---------- Contracts（成約情報。1案件に複数件持てる。第2章9章） ---------- */

function caseRepo_insertContract(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.CONTRACTS), obj);
}

function caseRepo_getContractsByCaseId(caseId) {
  const rows = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS));
  return rows.filter(function (r) { return r.CASE_ID === caseId; })
    .sort(function (a, b) { return new Date(b.契約日) - new Date(a.契約日); });
}

function caseRepo_getActiveContractByCaseId(caseId) {
  const rows = caseRepo_getContractsByCaseId(caseId);
  return rows.find(function (r) { return r.有効フラグ === true || r.有効フラグ === 'TRUE'; }) || null;
}

function caseRepo_deactivateContractsByCaseId(caseId) {
  const sheet = getSheet_(SHEET_NAMES.CONTRACTS);
  const rows = sheetToObjects_(sheet);
  rows.filter(function (r) { return r.CASE_ID === caseId; }).forEach(function (r) {
    updateRowByKey_(sheet, 'CONTRACT_ID', r.CONTRACT_ID, { 有効フラグ: false });
  });
}

/* ---------- LostCases（未成約・キャンセル。1案件に複数件持てる。第2章10章） ---------- */

function caseRepo_insertLostCase(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.LOST_CASES), obj);
}

function caseRepo_getLostCasesByCaseId(caseId) {
  const rows = sheetToObjects_(getSheet_(SHEET_NAMES.LOST_CASES));
  return rows.filter(function (r) { return r.CASE_ID === caseId; })
    .sort(function (a, b) { return new Date(b.未成約日) - new Date(a.未成約日); });
}

function caseRepo_getAllLostCases() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.LOST_CASES));
}

/* ---------- Tasks（タスク管理） ---------- */

function taskRepo_insert(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.TASKS), obj);
}

function taskRepo_getAll() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.TASKS));
}

function taskRepo_updateById(taskId, patch) {
  updateRowByKey_(getSheet_(SHEET_NAMES.TASKS), 'TASK_ID', taskId, patch);
}

function taskRepo_getByCaseId(caseId) {
  return taskRepo_getAll().filter(function (r) { return r.CASE_ID === caseId; });
}
