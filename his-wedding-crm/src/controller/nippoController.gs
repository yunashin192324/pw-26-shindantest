/**
 * nippoController.gs
 * 実際に使われている店舗日報・エリア進捗・全国集計・通期進捗をダッシュボードに再現するAPI（Q&A八巡目）。
 * スコープの考え方はdashboardController.gsのdashboardScope_をそのまま踏襲する
 * （STAFF＝自店舗固定／MANAGER＝自店舗または自地方／HQ・ARRANGE・ADMIN＝指定自由）。
 */

function getWeeklySummary(filter) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};
    return { ok: true, data: nippoService_getWeeklySummary(filter, dashboardScope_(ctx, filter.storeId, filter.region)) };
  } catch (e) {
    return handleControllerError_(e, 'getWeeklySummary');
  }
}

function getStaffReport(filter) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};
    return { ok: true, data: nippoService_getStaffReport(filter, dashboardScope_(ctx, filter.storeId, filter.region)) };
  } catch (e) {
    return handleControllerError_(e, 'getStaffReport');
  }
}

function getAreaProgressByStore(area, filter) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};
    return { ok: true, data: nippoService_getAreaProgressByStore(area, filter, dashboardScope_(ctx, filter.storeId, filter.region)) };
  } catch (e) {
    return handleControllerError_(e, 'getAreaProgressByStore');
  }
}

/** 全国店舗×方面の集計は、地方×区分マトリクスと同じくHQ・ARRANGE・ADMIN限定（Q&A一巡目G-17の踏襲） */
function getStoreAreaMatrix(filter) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    return { ok: true, data: nippoService_getStoreAreaMatrix(filter || {}) };
  } catch (e) {
    return handleControllerError_(e, 'getStoreAreaMatrix');
  }
}

function getMultiYearTrend(filter, yearsBack) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};
    return { ok: true, data: nippoService_getMultiYearTrend(filter, dashboardScope_(ctx, filter.storeId, filter.region), yearsBack) };
  } catch (e) {
    return handleControllerError_(e, 'getMultiYearTrend');
  }
}
