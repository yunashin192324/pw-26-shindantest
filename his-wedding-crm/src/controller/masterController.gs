/**
 * masterController.gs
 * マスタ系API（店舗・担当者・商品・地方・方面・都市・式場・フォトプラン・現地会社・目標・設定）。
 */

/** getMasterData（店舗・担当者）。MANAGER＝自店舗分のみ／HQ・ARRANGE・ADMIN＝ALL（三者は同格） */
function getMasterData(kind) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.MANAGER, ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);

    if (kind === 'stores') {
      let rows = storeRepo_getAll();
      if (ctx.role === ROLES.MANAGER) rows = rows.filter(function (s) { return s.STORE_ID === ctx.storeId; });
      return { ok: true, data: rows };
    }
    if (kind === 'staff') {
      let rows = staffRepo_getAll();
      if (ctx.role === ROLES.MANAGER) rows = rows.filter(function (s) { return s.店舗ID === ctx.storeId; });
      return { ok: true, data: rows };
    }
    throw new AppError('VALIDATION', '不明なマスタ種別です。');
  } catch (e) {
    return handleControllerError_(e, 'getMasterData');
  }
}

/** saveMasterData（店舗・担当者）。MANAGER＝自店舗のみ／HQ・ARRANGE・ADMIN＝ALL（三者は同格） */
function saveMasterData(kind, obj) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.MANAGER, ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);

    if (kind === 'stores') {
      if (ctx.role === ROLES.MANAGER && obj.STORE_ID && obj.STORE_ID !== ctx.storeId) throw permissionDeniedError_();
      const id = storeRepo_save(obj);
      writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_MASTER:stores', 対象CASE_ID: '', 変更前後の値の要約: id });
      return { ok: true, data: { id: id } };
    }
    if (kind === 'staff') {
      if (ctx.role === ROLES.MANAGER && obj.店舗ID !== ctx.storeId) throw permissionDeniedError_();
      const id = staffRepo_save(obj);
      writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_MASTER:staff', 対象CASE_ID: '', 変更前後の値の要約: id });
      return { ok: true, data: { id: id } };
    }
    throw new AppError('VALIDATION', '不明なマスタ種別です。');
  } catch (e) {
    return handleControllerError_(e, 'saveMasterData');
  }
}

/** saveMasterData（商品・地方・方面・都市・式場・フォトプラン・現地会社）。HQ・ARRANGE・ADMIN、ALL */
function saveCommonMasterData(kind, obj) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);

    const sheetByKind = {
      products: SHEET_NAMES.PRODUCTS, regions: SHEET_NAMES.REGIONS, areas: SHEET_NAMES.AREAS, cities: SHEET_NAMES.CITIES,
      venues: SHEET_NAMES.WEDDING_VENUES, photoPlans: SHEET_NAMES.PHOTO_PLANS, partners: SHEET_NAMES.PARTNERS,
      inquiryMethods: SHEET_NAMES.INQUIRY_METHODS, media: SHEET_NAMES.MEDIA_MASTER
    };
    const idColByKind = {
      products: 'PRODUCT_ID', regions: 'REGION_ID', areas: 'AREA_ID', cities: 'CITY_ID',
      venues: 'VENUE_ID', photoPlans: 'PLAN_ID', partners: 'PARTNER_ID',
      inquiryMethods: 'METHOD_ID', media: 'MEDIA_ID'
    };
    const sheetName = sheetByKind[kind];
    if (!sheetName) throw new AppError('VALIDATION', '不明なマスタ種別です。');
    const idCol = idColByKind[kind];

    if (obj[idCol]) {
      masterRepo_updateById(sheetName, idCol, obj[idCol], obj);
    } else {
      obj[idCol] = kind.toUpperCase() + '-' + Utilities.getUuid().slice(0, 8);
      masterRepo_insert(sheetName, obj);
    }
    writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_MASTER:' + kind, 対象CASE_ID: '', 変更前後の値の要約: obj[idCol] });
    return { ok: true, data: { id: obj[idCol] } };
  } catch (e) {
    return handleControllerError_(e, 'saveCommonMasterData');
  }
}

/**
 * 全社共通マスタの一覧取得（プルダウン表示用）。閲覧のみのため全ロールに許可する。
 * 案件詳細・接客記録などの選択式入力を成立させるために必要な参照系エンドポイント。
 */
function getReferenceMasters() {
  try {
    getCurrentUserContext(); // ログインチェックのみ
    return {
      ok: true,
      data: {
        stores: storeRepo_getAll(),
        products: productRepo_getAll(),
        regions: regionRepo_getAll(),
        areas: areaRepo_getAll(),
        cities: cityRepo_getAll(),
        venues: venueRepo_getAll(),
        photoPlans: photoPlanRepo_getAll(),
        partners: partnerRepo_getAll(),
        inquiryMethods: masterRepo_getAll(SHEET_NAMES.INQUIRY_METHODS),
        media: masterRepo_getAll(SHEET_NAMES.MEDIA_MASTER),
        staff: staffRepo_getAll()
      }
    };
  } catch (e) {
    return handleControllerError_(e, 'getReferenceMasters');
  }
}

/**
 * getTargets / saveTargets。Q&A一巡目A-2で確定：店長にも目標登録の権限を付与する
 * （MANAGERは自店舗のみ、HQ・ARRANGE・ADMINはALL。三者は同格＝Q&A二巡目）。
 */
function getTargets(storeId) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.MANAGER, ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    let rows = targetRepo_getAll();
    if (ctx.role === ROLES.MANAGER) rows = rows.filter(function (r) { return r.店舗ID === ctx.storeId; });
    else if (storeId) rows = rows.filter(function (r) { return r.店舗ID === storeId; });
    return { ok: true, data: rows };
  } catch (e) {
    return handleControllerError_(e, 'getTargets');
  }
}

function saveTargets(obj) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.MANAGER, ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    if (ctx.role === ROLES.MANAGER && obj.店舗ID !== ctx.storeId) throw permissionDeniedError_();
    targetRepo_save(obj);
    writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_TARGETS', 対象CASE_ID: '', 変更前後の値の要約: obj.年月 + '/' + obj.店舗ID });
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'saveTargets');
  }
}

/**
 * getSettings / saveSettings。手配課・本部・管理者は同格グループのため、いずれも操作できる
 * （Q&A三巡目：「手配課と本部と管理者は一つにまとめてOK」）。
 */
function getSettings() {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    return { ok: true, data: settingsRepo_getAll() };
  } catch (e) {
    return handleControllerError_(e, 'getSettings');
  }
}

function saveSettings(key, value, description) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);
    saveSetting_(key, value, description);
    writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_SETTINGS', 対象CASE_ID: '', 変更前後の値の要約: key + '=' + value });
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'saveSettings');
  }
}
