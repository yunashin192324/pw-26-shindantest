/**
 * sheetUtil.gs
 * 全Repositoryが共通で使う、スプレッドシート読み書きの低レベルヘルパー。
 * 第7章2章：「Service層はスプレッドシートの列番号やシート名を直接知らなくてよい作りにする」に基づき、
 * 列位置ではなく列名（ヘッダー）でアクセスする方式に統一する（第3章2章の「位置ではなくIDで取る」思想を
 * スプレッドシートの列アクセスにも一貫して適用したもの）。
 *
 * 第2章2章のシート一覧＋運用上必要な補助シート（FormItemMaster・UnmappedResponses・Settings）を
 * すべてここで定義する。
 */

const SHEET_NAMES = {
  FORM_RESPONSES: 'FormResponses',
  UNMAPPED_RESPONSES: 'UnmappedResponses',
  CASES: 'Cases',
  CUSTOMERS: 'Customers',
  WEDDING_REQUESTS: 'WeddingRequests',
  PHOTO_REQUESTS: 'PhotoRequests',
  SALES_HISTORY: 'SalesHistory',
  CASE_NOTES: 'CaseNotes',
  // 案件メモ（構造化。Q&A九巡目：実際に使っている接客記録シートの備考欄にある固定見出し
  // 「CPLこんな方です／時期／エリア／ゲスト・パーティー／式場／旅行／お披露目・前撮り／TAVICA／結果」を再現）
  CASE_SUMMARY_MEMO: 'CaseSummaryMemo',
  // お渡し・回収書類チェックリスト（Q&A九巡目）
  DOCUMENT_CHECKLIST_ITEMS: 'DocumentChecklistItems',
  CASE_DOCUMENT_CHECKS: 'CaseDocumentChecks',
  CONTRACTS: 'Contracts',
  LOST_CASES: 'LostCases',
  OPERATIONS: 'Operations',
  OPERATION_HISTORY: 'OperationHistory',
  OPERATION_MEMOS: 'OperationMemos',
  TASKS: 'Tasks',
  STORES: 'Stores',
  STAFF: 'Staff',
  PRODUCTS: 'Products',
  REGIONS: 'Regions',
  AREAS: 'Areas',
  CITIES: 'Cities',
  WEDDING_VENUES: 'WeddingVenues',
  PHOTO_PLANS: 'PhotoPlans',
  PARTNERS: 'Partners',
  INQUIRY_METHODS: 'InquiryMethods',
  MEDIA_MASTER: 'Media',
  TARGETS: 'Targets',
  HISTORICAL_ACTUALS: 'HistoricalActuals',
  ANALYTICS_CACHE: 'AnalyticsCache',
  SYSTEM_LOGS: 'SystemLogs',
  FORM_ITEM_MASTER: 'FormItemMaster',
  SETTINGS: 'Settings',
  // 過去データアーカイブ（年ごとに別ファイルのスプレッドシートへ退避する）の索引。Q&A六巡目。
  ARCHIVE_INDEX: 'ArchiveIndex',
  // 案件の削除・結合で消した行の控え（誤操作時に手で戻せるよう、元の行をJSONで残す。追記のみ）
  DELETED_RECORDS: 'DeletedRecords',
  // 過去の月次日報スプレッドシートの取り込み（service/pastNippoImportService.gs）
  PAST_NIPPO_SOURCES: 'PastNippoSources',
  PAST_NIPPO_STORE_MAP: 'PastNippoStoreMap',
  PAST_NIPPO_MONTHLY: 'PastNippoMonthly',
  // 精算（施行後の売上・原価。本部・手配課・管理者のみ閲覧・入力）。1案件に複数行（本体・衣裳組み込み等）
  SETTLEMENTS: 'Settlements',
  // 過去の精算スプレッドシート（方面別・月別の売上・粗利表）の取り込み
  PAST_SETTLEMENT_SOURCES: 'PastSettlementSources',
  PAST_SETTLEMENT_AREA_MAP: 'PastSettlementAreaMap'
};

// 後から追加したシートの見出し。SHEET_NAMESと同じファイルに置き、setupDatabase.gs（SHEET_DEFINITIONS_）
// からもservice側からも同じ定義を参照する（Apps Scriptはファイルの読み込み順に依存するため、
// SHEET_NAMESと同じ場所に置いておけば必ず先に定義される）。
const DELETED_RECORDS_HEADERS_ = ['削除日時', '実行者', '操作', '対象CASE_ID', '残した案件ID', 'シート名', '元の行JSON'];
const PAST_NIPPO_SOURCES_HEADERS_ = ['スプレッドシートのURL', '状態', '処理日時', '問合せ件数', 'キャンセル件数', 'メモ'];
const PAST_NIPPO_STORE_MAP_HEADERS_ = ['タブ名', '店舗ID', '店舗名（確認用）', '判定'];
const PAST_NIPPO_MONTHLY_HEADERS_ = ['取込元ID', '取込元ファイル名', '年月', '店舗ID', '方面',
  '新規問合せ', '成約数', 'CXL数', 'NB_PAX', 'CXL_PAX', '挙式月成約数', '取込日時'];
// 精算：計上月（yyyy-MM）の月で集計する。区分＝挙式／フォト、種別＝本体／衣裳（組み込み）。
// 粗利・原価率は保存せず、集計時に売上・原価から計算する。
// 店舗ID・チャレンジ番号・方面は、保存時に案件・成約から写しておく（アーカイブ後も精算行だけで集計できるように）。
const SETTLEMENT_HEADERS_ = ['SETTLEMENT_ID', 'CASE_ID', 'チャレンジ番号', '店舗ID', '方面', '計上月', '区分', '種別', 'AGT', '式場', 'プラン',
  '売上', '原価', 'CXL', 'メモ', '登録者', '登録日時', '更新者', '更新日時'];
const PAST_SETTLEMENT_SOURCES_HEADERS_ = ['スプレッドシートのURL', '状態', '処理日時', '明細件数', '売上合計', 'メモ'];
const PAST_SETTLEMENT_AREA_MAP_HEADERS_ = ['シート名', '方面（集計方面）', '判定'];
// HistoricalActualsに後から足した列（setupDatabase.gsの定義と同じ）
const HISTORICAL_ACTUALS_EXTRA_HEADERS_ = ['CXL数', 'NB_PAX', 'CXL_PAX', '挙式月成約数'];

/**
 * データベース用スプレッドシート（第7章7-1：既存の回答シートとは別に新規で用意する専用DB）を取得する。
 * スクリプトプロパティ DB_SPREADSHEET_ID にIDを設定しておく（setup/setupDatabase.gs 参照）。
 * 未設定の場合は、このスクリプトがバインドされているスプレッドシート自身をDBとして使う
 * （setup実行時にバインド運用にした場合の簡便化のため）。
 */
function getDatabaseSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty('DB_SPREADSHEET_ID');
  if (ssId) {
    return SpreadsheetApp.openById(ssId);
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new AppError('SYSTEM', 'DB_SPREADSHEET_ID が設定されていません。setupDatabase() を先に実行してください。');
}

function getSheet_(sheetName) {
  const ss = getDatabaseSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new AppError('SYSTEM', 'シートが見つかりません: ' + sheetName);
  }
  return sheet;
}

/**
 * シートが無ければ作成してヘッダーを書き込む（後から追加したシート用。setupDatabaseを再実行しなくても
 * 動くようにするため）。既存シートの場合は、足りない列だけを右端に追加する。
 */
function getOrCreateSheet_(sheetName, headers) {
  const ss = getDatabaseSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    return sheet;
  }
  ensureColumns_(sheet, headers);
  return sheet;
}

/** 既存シートのヘッダーに、指定した列名のうち無いものを右端へ追加する（既存の列・データは動かさない） */
function ensureColumns_(sheet, headers) {
  const headerMap = getHeaderMap_(sheet);
  const missing = headers.filter(function (h) { return !(h in headerMap); });
  if (missing.length === 0) return;
  const startCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  sheet.getRange(1, startCol, 1, missing.length).setFontWeight('bold');
}

/** CASE_ID列が fromId の行を、すべて toId に書き換える（列全体を1回で読み書きする）。書き換えた行数を返す */
function repointCaseId_(sheet, fromId, toId) {
  const headerMap = getHeaderMap_(sheet);
  if (!('CASE_ID' in headerMap)) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const range = sheet.getRange(2, headerMap.CASE_ID + 1, lastRow - 1, 1);
  const values = range.getValues();
  let count = 0;
  values.forEach(function (r) {
    if (r[0] === fromId) { r[0] = toId; count++; }
  });
  if (count > 0) range.setValues(values);
  return count;
}

/** ヘッダー行（1行目）から {列名: 0始まりインデックス} のマップを作る */
function getHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach(function (h, i) {
    if (h !== '') map[h] = i;
  });
  return map;
}

/** 指定列名の値を配列で返す（ヘッダー行を除く） */
function getColumnValues_(sheet, colName) {
  const headerMap = getHeaderMap_(sheet);
  if (!(colName in headerMap)) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const colIndex = headerMap[colName] + 1;
  return sheet.getRange(2, colIndex, lastRow - 1, 1).getValues().map(function (r) { return r[0]; });
}

/** シート全行を、ヘッダー名をキーとするオブジェクトの配列に変換する */
function sheetToObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol === 0) return [];
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values.map(function (row, rowIdx) {
    const obj = {};
    headers.forEach(function (h, i) {
      if (h !== '') obj[h] = row[i];
    });
    obj.__row = rowIdx + 2; // 実シート上の行番号（1始まり、ヘッダー込み）
    return obj;
  });
}

/** オブジェクトをヘッダー順の配列に変換して1行追加する */
function appendRowFromObject_(sheet, obj) {
  const headerMap = getHeaderMap_(sheet);
  const lastCol = sheet.getLastColumn();
  const row = new Array(lastCol).fill('');
  Object.keys(obj).forEach(function (key) {
    if (key in headerMap) {
      row[headerMap[key]] = obj[key];
    }
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/** キー列の値で行を検索し、一致した行番号（1始まり）を返す。見つからなければ-1 */
function findRowIndexByKey_(sheet, keyColName, keyValue) {
  const values = getColumnValues_(sheet, keyColName);
  for (let i = 0; i < values.length; i++) {
    if (values[i] === keyValue) return i + 2;
  }
  return -1;
}

/** キー列の値で行を検索し、patchObjの内容だけ部分更新する（他の列は保持） */
function updateRowByKey_(sheet, keyColName, keyValue, patchObj) {
  const rowIndex = findRowIndexByKey_(sheet, keyColName, keyValue);
  if (rowIndex === -1) {
    throw new AppError('SYSTEM', keyColName + '=' + keyValue + ' の行が見つかりません（' + sheet.getName() + '）');
  }
  return updateRowAtIndex_(sheet, rowIndex, patchObj);
}

/** 指定した行番号（1始まり・ヘッダー込み）の行を、ヘッダー名をキーとするpatchObjで部分更新する */
function updateRowAtIndex_(sheet, rowIndex, patchObj) {
  const headerMap = getHeaderMap_(sheet);
  Object.keys(patchObj).forEach(function (key) {
    if (key in headerMap) {
      sheet.getRange(rowIndex, headerMap[key] + 1).setValue(patchObj[key]);
    }
  });
  return rowIndex;
}

/** 2つの列の値の組み合わせで行を検索し、一致した行番号（1始まり）を返す。見つからなければ-1 */
function findRowIndexByTwoKeys_(sheet, keyColName1, keyValue1, keyColName2, keyValue2) {
  const headerMap = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !(keyColName1 in headerMap) || !(keyColName2 in headerMap)) return -1;
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const col1 = headerMap[keyColName1], col2 = headerMap[keyColName2];
  for (let i = 0; i < values.length; i++) {
    if (values[i][col1] === keyValue1 && values[i][col2] === keyValue2) return i + 2;
  }
  return -1;
}

/**
 * キー列の値で行を検索し、あれば部分更新、無ければ新規追加する（案件メモなど「1案件1行」を
 * 前提とするシートの保存に使う。Q&A九巡目）。
 */
function upsertRowByKey_(sheet, keyColName, keyValue, obj) {
  const rowIndex = findRowIndexByKey_(sheet, keyColName, keyValue);
  if (rowIndex === -1) {
    appendRowFromObject_(sheet, obj);
  } else {
    updateRowAtIndex_(sheet, rowIndex, obj);
  }
}

/**
 * 2つのキー列の組み合わせで行を検索し、あれば部分更新、無ければ新規追加する
 * （書類チェックリストのように「案件×項目」の組み合わせで1行を持つシートの保存に使う。Q&A九巡目）。
 */
function upsertRowByTwoKeys_(sheet, keyColName1, keyValue1, keyColName2, keyValue2, obj) {
  const rowIndex = findRowIndexByTwoKeys_(sheet, keyColName1, keyValue1, keyColName2, keyValue2);
  if (rowIndex === -1) {
    appendRowFromObject_(sheet, obj);
  } else {
    updateRowAtIndex_(sheet, rowIndex, obj);
  }
}

/** 指定列名の値が一致する全行を、ヘッダー名をキーとするオブジェクトの配列として返す（__row付き） */
function getRowsAsObjectsByKey_(sheet, keyColName, keyValue) {
  return sheetToObjects_(sheet).filter(function (r) { return r[keyColName] === keyValue; });
}

/**
 * 指定した行番号（__row。1始まり・ヘッダー込み）の行をまとめて削除する。
 * 上から消すと後続行の番号がズレるため、必ず降順（下の行から）で削除する。
 */
function deleteRows_(sheet, rowIndexes) {
  const sorted = rowIndexes.slice().sort(function (a, b) { return b - a; });
  sorted.forEach(function (rowIndex) { sheet.deleteRow(rowIndex); });
}

/** 指定行番号の1行をオブジェクトとして取得する */
function getRowAsObject_(sheet, rowIndex) {
  const headerMap = getHeaderMap_(sheet);
  const lastCol = sheet.getLastColumn();
  const row = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  const obj = {};
  Object.keys(headerMap).forEach(function (key) {
    obj[key] = row[headerMap[key]];
  });
  obj.__row = rowIndex;
  return obj;
}

function formatDateYYYYMMDD_(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyyMMdd');
}

/** 第11章8章：日付項目は西暦YYYY-MM-DD統一 */
function formatDateISO_(date) {
  if (!date) return '';
  if (typeof date === 'string') return date;
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function formatDateTimeISO_(date) {
  if (!date) return '';
  if (typeof date === 'string') return date;
  return Utilities.formatDate(date, 'Asia/Tokyo', "yyyy-MM-dd HH:mm:ss");
}
