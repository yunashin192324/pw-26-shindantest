/**
 * operationRepository.gs
 * Operations（手配管理）・OperationHistory（手配履歴）・OperationMemos（自由記述メモ、第4章10章）
 * シートへの読み書きを担当する。
 */

function operationRepo_insert(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.OPERATIONS), obj);
}

function operationRepo_getByCaseId(caseId) {
  const sheet = getSheet_(SHEET_NAMES.OPERATIONS);
  const rowIndex = findRowIndexByKey_(sheet, 'CASE_ID', caseId);
  return rowIndex === -1 ? null : getRowAsObject_(sheet, rowIndex);
}

function operationRepo_updateByCaseId(caseId, patch) {
  patch.更新日時 = new Date();
  updateRowByKey_(getSheet_(SHEET_NAMES.OPERATIONS), 'CASE_ID', caseId, patch);
}

function operationRepo_getAll() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.OPERATIONS));
}

/* ---------- OperationHistory ---------- */

function operationHistoryRepo_insert(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.OPERATION_HISTORY), obj);
}

function operationHistoryRepo_getByCaseId(caseId) {
  const rows = sheetToObjects_(getSheet_(SHEET_NAMES.OPERATION_HISTORY));
  return rows.filter(function (r) { return r.CASE_ID === caseId; })
    .sort(function (a, b) { return new Date(b.更新日時) - new Date(a.更新日時); });
}

/* ---------- OperationMemos（第4章10章：案件ごとの自由記述メモ。複数件登録・履歴保持） ---------- */

function operationMemoRepo_insert(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.OPERATION_MEMOS), obj);
}

function operationMemoRepo_getByCaseId(caseId) {
  const rows = sheetToObjects_(getSheet_(SHEET_NAMES.OPERATION_MEMOS));
  return rows.filter(function (r) { return r.CASE_ID === caseId; })
    .sort(function (a, b) { return new Date(b.投稿日時) - new Date(a.投稿日時); });
}
