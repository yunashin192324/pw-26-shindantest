/**
 * operationController.gs
 * 手配系API（画面08・09、本部・手配課専用）。第6章4章のとおり、STAFF・MANAGERは呼び出し自体を拒否する。
 */

function getOperationList() {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    return { ok: true, data: operationService_listWithAlerts() };
  } catch (e) {
    return handleControllerError_(e, 'getOperationList');
  }
}

function getOperationDetail(caseId) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    const op = operationRepo_getByCaseId(caseId);
    if (!op) throw new AppError('VALIDATION', '手配情報が見つかりません。');
    const history = operationHistoryRepo_getByCaseId(caseId);
    const memos = operationMemoRepo_getByCaseId(caseId);
    const caseRecord = caseRepo_getById(caseId);
    const customer = customerRepo_getByCaseId(caseId);
    return { ok: true, data: { operation: op, history: history, memos: memos, caseRecord: caseRecord, customer: customer } };
  } catch (e) {
    return handleControllerError_(e, 'getOperationDetail');
  }
}

function saveOperation(input) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    const result = operationService_saveOperation(input, ctx);
    return { ok: true, data: result };
  } catch (e) {
    return handleControllerError_(e, 'saveOperation');
  }
}

function addOperationMemo(caseId, content) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    operationService_addMemo(caseId, content, ctx);
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'addOperationMemo');
  }
}

/** 過去アーカイブが存在する年の一覧（Q&A六巡目：手配一覧「過去」タブの年セレクタ用） */
function getOperationArchiveYears() {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    return { ok: true, data: archiveService_listArchiveYears() };
  } catch (e) {
    return handleControllerError_(e, 'getOperationArchiveYears');
  }
}

/** 指定年の手配過去一覧（アーカイブ済み。参照専用） */
function getOperationArchiveList(year) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    return { ok: true, data: archiveService_getOperationArchiveList(year, {}) };
  } catch (e) {
    return handleControllerError_(e, 'getOperationArchiveList');
  }
}
