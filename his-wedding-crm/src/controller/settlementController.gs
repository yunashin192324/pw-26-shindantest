/**
 * settlementController.gs
 * 精算（売上・原価）の入力と集計のAPI。本部・手配課・管理者（HQ・ARRANGE・ADMIN）だけが使える。
 * 店舗（STAFF・MANAGER）からは、画面に出さないだけでなく、サーバー側でも必ず拒否する。
 */

function requireSettlementRole_(ctx) {
  requireRole_(ctx, BACKOFFICE_ROLES_);
}

/** 精算集計の絞り込み（地方・店舗）。filter.region / filter.storeId */
function settlementScope_(filter) {
  filter = filter || {};
  return { region: filter.region || '', storeId: filter.storeId || '' };
}

function getCaseSettlements(caseId) {
  try {
    const ctx = getCurrentUserContext();
    requireSettlementRole_(ctx);
    return { ok: true, data: settlementService_forCase(caseId) };
  } catch (e) {
    return handleControllerError_(e, 'getCaseSettlements');
  }
}

function saveSettlement(obj) {
  try {
    const ctx = getCurrentUserContext();
    requireSettlementRole_(ctx);
    return { ok: true, data: settlementService_save(obj || {}, ctx) };
  } catch (e) {
    return handleControllerError_(e, 'saveSettlement');
  }
}

function deleteSettlement(settlementId) {
  try {
    const ctx = getCurrentUserContext();
    requireSettlementRole_(ctx);
    settlementService_delete(settlementId, ctx);
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'deleteSettlement');
  }
}

function getSettlementSalesSummary(filter) {
  try {
    const ctx = getCurrentUserContext();
    requireSettlementRole_(ctx);
    return { ok: true, data: settlementService_getSalesSummary(filter || {}, settlementScope_(filter)) };
  } catch (e) {
    return handleControllerError_(e, 'getSettlementSalesSummary');
  }
}

function getSettlementFnlCounts(filter) {
  try {
    const ctx = getCurrentUserContext();
    requireSettlementRole_(ctx);
    return { ok: true, data: settlementService_getFnlCounts(filter || {}, settlementScope_(filter)) };
  } catch (e) {
    return handleControllerError_(e, 'getSettlementFnlCounts');
  }
}

function getSettlementBreakdown(filter) {
  try {
    const ctx = getCurrentUserContext();
    requireSettlementRole_(ctx);
    return { ok: true, data: settlementService_getBreakdown(filter || {}, settlementScope_(filter)) };
  } catch (e) {
    return handleControllerError_(e, 'getSettlementBreakdown');
  }
}

function getSettlementList(filter) {
  try {
    const ctx = getCurrentUserContext();
    requireSettlementRole_(ctx);
    return { ok: true, data: settlementService_getList(filter || {}, settlementScope_(filter)) };
  } catch (e) {
    return handleControllerError_(e, 'getSettlementList');
  }
}
