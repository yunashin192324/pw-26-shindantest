/**
 * logRepository.gs
 * SystemLogs（監査ログ）・AnalyticsCache（集計キャッシュ）・UnmappedResponses（未マッピング回答）
 * への書き込みを担当する。
 * 第6章5章：削除・訂正の機能は設けない（追記のみ）。
 */

function writeSystemLog_(entry) {
  const sheet = getSheet_(SHEET_NAMES.SYSTEM_LOGS);
  appendRowFromObject_(sheet, {
    日時: entry.日時 || new Date(),
    実行者: entry.実行者 || safeGetCurrentUserEmail_(),
    操作種別: entry.操作種別 || '',
    対象CASE_ID: entry.対象CASE_ID || '',
    変更前後の値の要約: entry.変更前後の値の要約 || ''
  });
}

function systemLogRepo_getAll() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.SYSTEM_LOGS));
}

/* ---------- AnalyticsCache ---------- */

function analyticsCacheRepo_replaceAll(rows) {
  const sheet = getSheet_(SHEET_NAMES.ANALYTICS_CACHE);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length === 0) return;
  const headerMap = getHeaderMap_(sheet);
  const lastCol = sheet.getLastColumn();
  const values = rows.map(function (obj) {
    const row = new Array(lastCol).fill('');
    Object.keys(obj).forEach(function (key) {
      if (key in headerMap) row[headerMap[key]] = obj[key];
    });
    return row;
  });
  sheet.getRange(2, 1, values.length, lastCol).setValues(values);
}

function analyticsCacheRepo_getAll() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.ANALYTICS_CACHE));
}

/* ---------- UnmappedResponses（第3章5章） ---------- */

function unmappedResponseRepo_insert(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.UNMAPPED_RESPONSES), obj);
}

function unmappedResponseRepo_getAll() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.UNMAPPED_RESPONSES));
}
