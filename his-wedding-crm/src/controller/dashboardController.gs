/**
 * dashboardController.gs
 * ダッシュボード集計API。
 * STAFF・MANAGER＝自店舗（MANAGERのみ他店舗はAnalyticsCacheの集計値のみ許可）／
 * HQ・ARRANGE・ADMIN＝全店舗。
 */

function getDashboardData(filter) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};

    if (ctx.role === ROLES.STAFF) {
      filter.storeId = ctx.storeId;
    } else if (ctx.role === ROLES.MANAGER) {
      if (!filter.storeId && !filter.region) filter.storeId = ctx.storeId;
    }
    // HQ・ARRANGE・ADMIN：filterで指定された条件をそのまま使う（ALL）

    const data = dashboardService_getData(filter);
    data.viewingOtherStore = (ctx.role === ROLES.MANAGER && filter.storeId && filter.storeId !== ctx.storeId);
    return { ok: true, data: data };
  } catch (e) {
    return handleControllerError_(e, 'getDashboardData');
  }
}

function dashboardScope_(ctx, requestedStoreId, requestedRegion) {
  if (ctx.role === ROLES.STAFF) return { storeId: ctx.storeId };
  if (ctx.role === ROLES.MANAGER) return requestedRegion ? { region: requestedRegion } : { storeId: requestedStoreId || ctx.storeId };
  return { storeId: requestedStoreId || '', region: requestedRegion || '' };
}

function getMediaBreakdown(filter) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};
    // バグ修正：以前はfilter.regionがdashboardScope_に渡っておらず、地方フィルタが効かなかった
    return { ok: true, data: dashboardService_getMediaBreakdown(filter, dashboardScope_(ctx, filter.storeId, filter.region)) };
  } catch (e) {
    return handleControllerError_(e, 'getMediaBreakdown');
  }
}

function getAgtShare(filter) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};
    return { ok: true, data: dashboardService_getAgtShare(filter, dashboardScope_(ctx, filter.storeId, filter.region)) };
  } catch (e) {
    return handleControllerError_(e, 'getAgtShare');
  }
}

function getAreaShare(filter) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};
    return { ok: true, data: dashboardService_getAreaShare(filter, dashboardScope_(ctx, filter.storeId, filter.region)) };
  } catch (e) {
    return handleControllerError_(e, 'getAreaShare');
  }
}

function getAreaRankings(area, filter) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};
    return { ok: true, data: dashboardService_getAreaRankings(area, filter, dashboardScope_(ctx, filter.storeId, filter.region)) };
  } catch (e) {
    return handleControllerError_(e, 'getAreaRankings');
  }
}

function getBookingPipeline(filter, monthsAhead) {
  try {
    const ctx = getCurrentUserContext();
    filter = filter || {};
    return { ok: true, data: dashboardService_getBookingPipeline(filter, dashboardScope_(ctx, filter.storeId, filter.region), monthsAhead) };
  } catch (e) {
    return handleControllerError_(e, 'getBookingPipeline');
  }
}

/** 地方×区分マトリクスは全国を俯瞰するため、HQ・ARRANGE・ADMINのみに限定する（Q&A一巡目G-17） */
function getRegionCategoryMatrix(filter) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    return { ok: true, data: dashboardService_getRegionCategoryMatrix(filter || {}) };
  } catch (e) {
    return handleControllerError_(e, 'getRegionCategoryMatrix');
  }
}

/** 地方内の方面別実績は、その地方に所属する店舗のMANAGER／HQ・ARRANGE・ADMINが見られる */
function getRegionAreaStats(region, filter) {
  try {
    const ctx = getCurrentUserContext();
    if (ctx.role === ROLES.STAFF) throw permissionDeniedError_();
    if (ctx.role === ROLES.MANAGER) {
      const myStore = storeRepo_getById(ctx.storeId);
      if (!myStore || myStore.地方 !== region) throw permissionDeniedError_();
    }
    return { ok: true, data: dashboardService_getRegionAreaStats(region, filter || {}) };
  } catch (e) {
    return handleControllerError_(e, 'getRegionAreaStats');
  }
}

/**
 * 前年実績の遡及入力（Q&A一巡目A-1・G-17）。MANAGERは自店舗、HQ・ARRANGE・ADMINは全店舗を編集できる
 * （Q&A二巡目：「手配課と本部と管理者は同じ」の原則に合わせ、ARRANGEもHQ・ADMINと同格に扱う）。
 */
function getHistoricalActuals(storeId) {
  try {
    const ctx = getCurrentUserContext();
    let rows = historicalActualsRepo_getAll();
    if (ctx.role === ROLES.STAFF) throw permissionDeniedError_();
    if (ctx.role === ROLES.MANAGER) rows = rows.filter(function (r) { return r.店舗ID === ctx.storeId; });
    else if (storeId) rows = rows.filter(function (r) { return r.店舗ID === storeId; });
    return { ok: true, data: rows };
  } catch (e) {
    return handleControllerError_(e, 'getHistoricalActuals');
  }
}

function saveHistoricalActuals(obj) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.MANAGER, ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    if (ctx.role === ROLES.MANAGER && obj.店舗ID !== ctx.storeId) throw permissionDeniedError_();
    historicalActualsRepo_save(Object.assign({ 登録者: ctx.name || ctx.email }, obj));
    writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_HISTORICAL_ACTUALS', 対象CASE_ID: '', 変更前後の値の要約: JSON.stringify(obj) });
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'saveHistoricalActuals');
  }
}
