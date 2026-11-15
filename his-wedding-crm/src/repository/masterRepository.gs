/**
 * masterRepository.gs
 * マスタ系シート（Stores・Staff・Products・Countries・Cities・WeddingVenues・PhotoPlans・
 * Partners・Targets・Settings）への読み書きを担当する。
 * 第4章14章：削除は行わず「使用終了」フラグで無効化する。
 */

function masterRepo_getAll(sheetName) {
  return sheetToObjects_(getSheet_(sheetName));
}

function masterRepo_insert(sheetName, obj) {
  appendRowFromObject_(getSheet_(sheetName), obj);
}

function masterRepo_updateById(sheetName, idColumn, idValue, patch) {
  updateRowByKey_(getSheet_(sheetName), idColumn, idValue, patch);
}

/* ---------- Stores / Staff ---------- */

function storeRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.STORES); }
function storeRepo_getById(storeId) {
  return storeRepo_getAll().find(function (s) { return s.STORE_ID === storeId; }) || null;
}
function storeRepo_save(obj) {
  if (obj.STORE_ID) {
    masterRepo_updateById(SHEET_NAMES.STORES, 'STORE_ID', obj.STORE_ID, obj);
  } else {
    obj.STORE_ID = 'STORE-' + Utilities.getUuid().slice(0, 8);
    masterRepo_insert(SHEET_NAMES.STORES, obj);
  }
  return obj.STORE_ID;
}

function staffRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.STAFF); }
function staffRepo_getByEmail(email) {
  const rows = staffRepo_getAll();
  return rows.find(function (s) { return String(s.メール).toLowerCase() === String(email).toLowerCase(); }) || null;
}
function staffRepo_save(obj) {
  if (obj.STAFF_ID) {
    masterRepo_updateById(SHEET_NAMES.STAFF, 'STAFF_ID', obj.STAFF_ID, obj);
  } else {
    obj.STAFF_ID = 'STAFF-' + Utilities.getUuid().slice(0, 8);
    masterRepo_insert(SHEET_NAMES.STAFF, obj);
  }
  return obj.STAFF_ID;
}

/* ---------- 商品・地方・方面・都市・式場・フォトプラン・現地会社（全社共通マスタ） ---------- */

function productRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.PRODUCTS); }
function regionRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.REGIONS); }
function areaRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.AREAS); }
function cityRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.CITIES); }
function venueRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.WEDDING_VENUES); }
function photoPlanRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.PHOTO_PLANS); }
function partnerRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.PARTNERS); }

/** 式場／フォトプランマスタの「標準納品日数」を取得する（未設定なら null。dateUtil.gs参照） */
function venueStandardDeliveryDays_(venueName) {
  const v = venueRepo_getAll().find(function (r) { return r.式場名 === venueName; });
  return v && v.標準納品日数 !== '' ? Number(v.標準納品日数) : null;
}
function photoPlanStandardDeliveryDays_(planName) {
  const p = photoPlanRepo_getAll().find(function (r) { return r.プラン名 === planName; });
  return p && p.標準納品日数 !== '' ? Number(p.標準納品日数) : null;
}

/* ---------- Targets（目標管理）／HistoricalActuals（前年実績の遡及入力） ---------- */

function targetRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.TARGETS); }
function targetRepo_save(obj) {
  upsertByCompositeKey_(SHEET_NAMES.TARGETS, ['年月', '店舗ID'], obj);
}

function historicalActualsRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.HISTORICAL_ACTUALS); }
function historicalActualsRepo_save(obj) {
  obj.登録日時 = new Date();
  upsertByCompositeKey_(SHEET_NAMES.HISTORICAL_ACTUALS, ['年月', '店舗ID', '方面'], obj);
}

/** 複合キー（年月＋店舗ID等）で既存行を更新、なければ追加する共通ヘルパー */
function upsertByCompositeKey_(sheetName, keyCols, obj) {
  const sheet = getSheet_(sheetName);
  const rows = sheetToObjects_(sheet);
  const existing = rows.find(function (r) { return keyCols.every(function (k) { return r[k] === obj[k]; }); });
  if (existing) {
    const headerMap = getHeaderMap_(sheet);
    Object.keys(obj).forEach(function (key) {
      if (key in headerMap) sheet.getRange(existing.__row, headerMap[key] + 1).setValue(obj[key]);
    });
  } else {
    appendRowFromObject_(sheet, obj);
  }
}

/* ---------- Settings（第4章14章画面13：システムパラメータ） ---------- */

function settingsRepo_getAll() { return masterRepo_getAll(SHEET_NAMES.SETTINGS); }

function getSetting_(key, defaultValue) {
  const rows = settingsRepo_getAll();
  const row = rows.find(function (r) { return r.キー === key; });
  return row ? row.値 : defaultValue;
}

function getSettingNumber_(key, defaultValue) {
  const v = getSetting_(key, defaultValue);
  const n = Number(v);
  return isNaN(n) ? defaultValue : n;
}

function saveSetting_(key, value, description) {
  const sheet = getSheet_(SHEET_NAMES.SETTINGS);
  const rowIndex = findRowIndexByKey_(sheet, 'キー', key);
  if (rowIndex === -1) {
    appendRowFromObject_(sheet, { キー: key, 値: value, 説明: description || '' });
  } else {
    updateRowByKey_(sheet, 'キー', key, { 値: value });
  }
}
