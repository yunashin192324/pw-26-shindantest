/**
 * ============================================================================
 * Code.gs
 * 営業セールスダッシュボード - バックエンドAPI
 * ----------------------------------------------------------------------------
 * Googleスプレッドシート + Google Apps Script のみで構成するWebアプリ。
 * フロントエンド（Index.html / Javascript.html）から google.script.run 経由で
 * 呼び出される全APIをここに定義する。シート構造の作成は InitSheet.gs が担う。
 *
 * このアプリが扱うCSV由来の項目は、営業日報CSVのうち以下19項目のみに限定している
 * （それ以外の列はインポート時に読み捨てる）。
 *   006:エリア／007:営業所／013:最終目的地／014:予約日／016:出発予定日／
 *   019:顧客ID／020:予約番号／023:性別／024:国籍／029:商品分類／
 *   031:キャリア／037:ツアーブランド区分／038:ツアーコード／
 *   046:売上(商品請求金額)／047:入金額／051:STS／058:担当者／
 *   070:商品タイトル／076:旅行日数
 * これに加えて、現場で入力する項目（CHK日・保険・Wifi・TAViCA・キャンサポ・メモ）を
 * EDITABLE_COLUMNS としてシートの後ろに追加している。
 * ============================================================================
 */

var APP_TITLE = '営業セールスダッシュボード';
var SHEET_NAME = '予約データ';
var STAFF_SHEET_NAME = 'スタッフ権限';
var STAFF_NAME_SHEET_NAME = '担当者マスタ';
var TIMEZONE = 'Asia/Tokyo';
var SERVER_VERSION = '2.1.0';

// ---- 権限レベル ----
var ROLE_STAFF = '社員';
var ROLE_MANAGER = '所長・チーフ';
var ROLE_MASTER = 'マスタ権限';
var ROLES = [ROLE_STAFF, ROLE_MANAGER, ROLE_MASTER];

// ---- CSVから抽出する19項目の定義（表示順・シート列1〜19の並びに統一する） ----
// key   : プログラム内部で使うキー
// label : シートの見出し・CSV側の "NNN:見出し" のNNN以降と一致させる文言
// type  : 'text' | 'number' | 'date'（保存形式と表示形式の判定に使う）
var COLUMNS = [
  { key: 'area',           label: 'エリア',              type: 'text'   },
  { key: 'office',         label: '営業所',              type: 'text'   },
  { key: 'destination',    label: '最終目的地',          type: 'text'   },
  { key: 'bookingDate',    label: '予約日',              type: 'date'   },
  { key: 'departureDate',  label: '出発予定日',          type: 'date'   },
  { key: 'customerId',     label: '顧客ID',              type: 'text'   },
  { key: 'reservationNo',  label: '予約番号',            type: 'text'   },
  { key: 'gender',         label: '性別',                type: 'text'   },
  { key: 'nationality',    label: '国籍',                type: 'text'   },
  { key: 'productCategory',label: '商品分類',            type: 'text'   },
  { key: 'carrier',        label: 'キャリア',            type: 'text'   },
  { key: 'tourBrand',      label: 'ツアーブランド区分',  type: 'text'   },
  { key: 'tourCode',       label: 'ツアーコード',        type: 'text'   },
  { key: 'salesAmount',    label: '売上(商品請求金額)',  type: 'number' },
  { key: 'paymentAmount',  label: '入金額',              type: 'number' },
  { key: 'sts',            label: 'STS',                 type: 'text'   },
  { key: 'staff',          label: '担当者',              type: 'text'   },
  { key: 'productTitle',   label: '商品タイトル',        type: 'text'   },
  { key: 'travelDays',     label: '旅行日数',            type: 'number' }
];

// ---- 現場で入力する項目（シート列20〜33）。CSVには含まれず、画面から直接編集する ----
var EDITABLE_COLUMNS = [
  { key: 'chkDate',         label: 'CHK日',          type: 'date'   },
  { key: 'insuranceStatus', label: '保険',            type: 'text'   },
  { key: 'insuranceQty',    label: '保険数量',        type: 'number' },
  { key: 'insuranceReason', label: '保険理由',        type: 'text'   },
  { key: 'wifiStatus',      label: 'Wifi',            type: 'text'   },
  { key: 'wifiQty',         label: 'Wifi数量',        type: 'number' },
  { key: 'wifiReason',      label: 'Wifi理由',        type: 'text'   },
  { key: 'tavicaStatus',    label: 'TAViCA',          type: 'text'   },
  { key: 'tavicaQty',       label: 'TAViCA数量',      type: 'number' },
  { key: 'tavicaReason',    label: 'TAViCA理由',      type: 'text'   },
  { key: 'cansapoStatus',   label: 'キャンサポ',      type: 'text'   },
  { key: 'cansapoQty',      label: 'キャンサポ数量',  type: 'number' },
  { key: 'cansapoReason',   label: 'キャンサポ理由',  type: 'text'   },
  { key: 'memo',            label: 'メモ',            type: 'text'   }
];

var ALL_COLUMNS = COLUMNS.concat(EDITABLE_COLUMNS);
var EDITABLE_KEY_SET = {};
EDITABLE_COLUMNS.forEach(function (c) { EDITABLE_KEY_SET[c.key] = true; });
var ALL_COLUMN_INDEX_BY_KEY = {};
ALL_COLUMNS.forEach(function (c, i) { ALL_COLUMN_INDEX_BY_KEY[c.key] = i; });

// 保険・Wifi・TAViCA・キャンサポ：ステータス列・数量列・理由列（失注時のみ使う）の対応表。
// 分析ダッシュボードの内訳グラフ・個人別サマリー・一覧表の編集セルはすべてこの定義を使う。
var ANCILLARY_ITEMS = [
  { key: 'insurance', label: '保険',      statusKey: 'insuranceStatus', qtyKey: 'insuranceQty', reasonKey: 'insuranceReason' },
  { key: 'wifi',       label: 'Wifi',      statusKey: 'wifiStatus',      qtyKey: 'wifiQty',       reasonKey: 'wifiReason' },
  { key: 'tavica',     label: 'TAViCA',    statusKey: 'tavicaStatus',    qtyKey: 'tavicaQty',     reasonKey: 'tavicaReason' },
  { key: 'cansapo',    label: 'キャンサポ', statusKey: 'cansapoStatus',  qtyKey: 'cansapoQty',    reasonKey: 'cansapoReason' }
];
var ANCILLARY_ITEM_BY_KEY = {};
ANCILLARY_ITEMS.forEach(function (a) { ANCILLARY_ITEM_BY_KEY[a.key] = a; });
var ANCILLARY_ITEM_BY_STATUS_KEY = {};
ANCILLARY_ITEMS.forEach(function (a) { ANCILLARY_ITEM_BY_STATUS_KEY[a.statusKey] = a; });

// 保険/Wifi/TAViCA/キャンサポ 共通のステータス選択肢。
// '-'（NO ACT）が未入力時の既定値。'×'（失注）を選ぶと理由入力・数量0固定になり、
// '〇'（NB付帯）'☆'（PUSH成約）は数量の入力が必須になる（Javascript.html側で制御）。
var ANCILLARY_STATUS_OPTIONS = [
  { value: '-', label: 'NO ACT' },
  { value: '〇', label: 'NB付帯' },
  { value: '×', label: '失注' },
  { value: '△', label: 'セールス中' },
  { value: '☆', label: 'PUSH成約' }
];

/**
 * ① Webアプリとしてアクセスされた際のエントリポイント。
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Index.html から他のHTMLファイルをインクルードするためのヘルパー。
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// セットアップ状態
// ============================================================================

/**
 * 「予約データ」シートが存在し、見出し行が想定どおり（33列）かを確認する。
 * ウェブアプリ起動時に呼び、未セットアップならセットアップ案内バーを出す。
 */
function getSetupStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return { ready: false, reason: 'sheet_missing', detail: 'シート「' + SHEET_NAME + '」がまだ作成されていません。' };
  }
  if (sheet.getLastColumn() < ALL_COLUMNS.length) {
    return { ready: false, reason: 'header_incomplete', detail: '見出し列が ' + ALL_COLUMNS.length + ' 列に足りません。' };
  }
  var headerRow = sheet.getRange(1, 1, 1, ALL_COLUMNS.length).getValues()[0];
  for (var i = 0; i < ALL_COLUMNS.length; i++) {
    if (String(headerRow[i]).trim() !== ALL_COLUMNS[i].label) {
      return {
        ready: false,
        reason: 'header_mismatch',
        detail: (i + 1) + '列目の見出しが一致しません（期待：' + ALL_COLUMNS[i].label + ' / 実際：' + headerRow[i] + '）。'
      };
    }
  }
  return { ready: true };
}

/**
 * 初期セットアップを実行する（ウェブアプリの案内バーから呼ばれる）。
 * データシート・スタッフ権限シート・担当者マスタシートをまとめて作る。実体は InitSheet.gs 。
 */
function runInitialSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  buildDataSheet_(ss);
  buildStaffSheet_(ss);
  buildStaffNameSheet_(ss);
  return getSetupStatus();
}

function assertSetupReady_() {
  var status = getSetupStatus();
  if (!status.ready) {
    throw new Error('初期セットアップが完了していません。先に「初期セットアップを実行する」を押してください。');
  }
  return status;
}

function getDataSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('シート「' + SHEET_NAME + '」が見つかりません。初期セットアップを実行してください。');
  return sheet;
}

// ============================================================================
// 権限（スタッフ権限シートによるアクセス制御）
// ============================================================================

/**
 * 実行者のGoogleアカウントを「スタッフ権限」シートで引き、権限情報を返す。
 * ・シートが無い／1件も登録が無い間は、最初のセットアップができるよう
 *   全員をマスタ権限として扱う（bootstrapMode: true）。
 * ・シートはあるが該当アカウントの登録が無い場合は、閲覧不可（role: ''）として返す。
 */
function getCurrentUserContext_() {
  var email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return { email: email, name: '', office: '', area: '', role: ROLE_MASTER, registered: false, bootstrapMode: true };
  }
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var rowEmail = String(row[0] || '').trim().toLowerCase();
    if (rowEmail && rowEmail === email) {
      return {
        email: email,
        name: String(row[1] || ''),
        office: String(row[2] || ''),
        area: String(row[3] || ''),
        role: String(row[4] || '').trim(),
        registered: true,
        bootstrapMode: false
      };
    }
  }
  return { email: email, name: '', office: '', area: '', role: '', registered: false, bootstrapMode: false };
}

/** クライアントから直接呼べる公開版（ヘッダーの権限バッジ表示などに使う）。 */
function getCurrentUserContext() {
  return getCurrentUserContext_();
}

/** 権限に応じてデータ行を絞り込む（社員=自店舗のみ、所長・チーフ=自エリアのみ、マスタ=全件）。 */
function applyRoleScope_(rows, ctx) {
  if (ctx.role === ROLE_MASTER) return rows;
  if (ctx.role === ROLE_MANAGER) return rows.filter(function (r) { return r.area === ctx.area; });
  if (ctx.role === ROLE_STAFF) return rows.filter(function (r) { return r.office === ctx.office; });
  return []; // 権限未登録・不明なロールには何も見せない
}

function assertMaster_(ctxArg) {
  var ctx = ctxArg || getCurrentUserContext_();
  if (ctx.role !== ROLE_MASTER) {
    throw new Error('マスタ権限のユーザーのみ実行できます。');
  }
  return ctx;
}

// ============================================================================
// 画面初期表示データ
// ============================================================================

/**
 * 画面ロード時に一度だけ呼ぶ。項目定義＋（権限で絞り込んだ）全データ行＋メタ情報を
 * まとめて返す。以降の絞り込み・並べ替え・集計はすべてブラウザ側（Javascript.html）で行う。
 */
function getBootstrapData() {
  var status = getSetupStatus();
  var ctx = getCurrentUserContext_();

  if (!status.ready) {
    return {
      ready: false, accessDenied: false, status: status,
      columns: COLUMNS, editableColumns: EDITABLE_COLUMNS, ancillaryItems: ANCILLARY_ITEMS,
      ancillaryStatusOptions: ANCILLARY_STATUS_OPTIONS,
      columnOrder: null, rows: [], staffNameMap: {}, meta: null, userContext: ctx
    };
  }

  if (!ctx.bootstrapMode && !ctx.registered) {
    return {
      ready: true, accessDenied: true, status: status,
      columns: COLUMNS, editableColumns: EDITABLE_COLUMNS, ancillaryItems: ANCILLARY_ITEMS,
      ancillaryStatusOptions: ANCILLARY_STATUS_OPTIONS,
      columnOrder: null, rows: [], staffNameMap: {}, meta: null, userContext: ctx
    };
  }

  var sheet = getDataSheet_();
  var rows = applyRoleScope_(readAllRows_(sheet), ctx);
  var props = PropertiesService.getDocumentProperties();

  var columnOrder = null;
  var columnOrderRaw = props.getProperty('dataListColumnOrder');
  if (columnOrderRaw) {
    try { columnOrder = JSON.parse(columnOrderRaw); } catch (e) { columnOrder = null; }
  }

  return {
    ready: true,
    accessDenied: false,
    status: status,
    columns: COLUMNS,
    editableColumns: EDITABLE_COLUMNS,
    ancillaryItems: ANCILLARY_ITEMS,
    ancillaryStatusOptions: ANCILLARY_STATUS_OPTIONS,
    columnOrder: columnOrder,
    rows: rows,
    staffNameMap: getStaffNameMap_(),
    userContext: ctx,
    meta: {
      totalRows: rows.length,
      lastImportedAt: props.getProperty('lastImportedAt') || null,
      lastImportedFile: props.getProperty('lastImportedFile') || null,
      sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
      serverVersion: SERVER_VERSION
    }
  };
}

/**
 * シートのデータ行を、フロントエンドで扱いやすい「正規形」のオブジェクト配列に変換する。
 * 日付は 'yyyy-MM-dd' 文字列、数値は Number（空欄は null）、文字は String に統一する。
 * この正規形は importCsv() 側の変換結果とも一致させている（重複判定や書き戻しを共通化するため）。
 */
function readAllRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, ALL_COLUMNS.length).getValues();
  var rows = [];
  for (var r = 0; r < values.length; r++) {
    var raw = values[r];
    var isBlank = raw.every(function (v) { return v === '' || v === null; });
    if (isBlank) continue;

    var obj = {};
    for (var c = 0; c < ALL_COLUMNS.length; c++) {
      var col = ALL_COLUMNS[c];
      obj[col.key] = normalizeCellValue_(col, raw[c]);
    }
    obj.rowIndex = r + 2; // シート上の実行番号（1始まり）。編集APIの対象行指定に使う。
    rows.push(obj);
  }
  return rows;
}

/** シートのセル値1つを、項目の型に応じた正規形（日付=文字列/数値=Number/文字=String）に変換する。 */
function normalizeCellValue_(col, v) {
  if (col.type === 'date') {
    return (v instanceof Date) ? Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd') : (v ? String(v) : null);
  }
  if (col.type === 'number') {
    return (v === '' || v === null || v === undefined) ? null : Number(v);
  }
  return (v === null || v === undefined) ? '' : String(v);
}

/** 正規形の値1つを、シートに書き込むセル値（Date/Number/String）に変換する。 */
function cellValueFor_(col, v) {
  if (v === null || v === undefined || v === '') return '';
  if (col.type === 'date') {
    var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
  }
  return v;
}

// ============================================================================
// CSVインポート（対象はCSV由来の19項目のみ。現場入力項目は空欄のまま追加する）
// ============================================================================

/**
 * 見出しセルの "006:エリア" のような表記から、番号プレフィックスを除いた
 * ラベル部分だけを取り出す。列の並び順が変わっても項目名だけで判定できるようにする。
 */
function normalizeHeaderLabel_(raw) {
  if (raw === null || raw === undefined) return '';
  var s = String(raw).replace(/^﻿/, '').trim();
  var m = s.match(/^\d{3}\s*[:：]\s*(.+)$/);
  return (m ? m[1] : s).trim();
}

/**
 * CSVの先頭数行の中から見出し行を推定し、19項目それぞれが何列目にあるかを求める。
 * 列の並び順や余分な列があっても、項目名の一致だけで抽出できるようにするための処理。
 */
function detectHeaderRow_(matrix) {
  var bestRow = -1, bestCount = -1, bestMap = null;
  var scanLimit = Math.min(matrix.length, 5);
  for (var r = 0; r < scanLimit; r++) {
    var map = {};
    var count = 0;
    for (var i = 0; i < COLUMNS.length; i++) {
      var col = COLUMNS[i];
      var idx = -1;
      for (var c = 0; c < matrix[r].length; c++) {
        if (normalizeHeaderLabel_(matrix[r][c]) === col.label) { idx = c; break; }
      }
      map[col.key] = idx;
      if (idx !== -1) count++;
    }
    if (count > bestCount) { bestCount = count; bestRow = r; bestMap = map; }
  }
  if (bestCount < Math.ceil(COLUMNS.length / 2)) {
    throw new Error('CSVのヘッダー行から対象項目を十分に検出できませんでした。見出しに「006:エリア」のような列名が含まれているファイルかご確認ください。');
  }
  var missingLabels = COLUMNS.filter(function (col) { return bestMap[col.key] === -1; }).map(function (col) { return col.label; });
  return { rowIndex: bestRow, colIndexByKey: bestMap, missingLabels: missingLabels };
}

/**
 * CSVの1セルを、項目の型（text/number/date）に応じて正規形の値へ変換する。
 * readAllRows_() が返す形式と揃えることで、重複判定やシート書き戻しを共通化している。
 */
function convertValue_(col, raw) {
  var s = (raw === undefined || raw === null) ? '' : String(raw).trim();
  if (col.type === 'date') {
    if (!s || s === '-') return null;
    var m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!m) return null;
    var mo = ('0' + m[2]).slice(-2), d = ('0' + m[3]).slice(-2);
    return m[1] + '-' + mo + '-' + d;
  }
  if (col.type === 'number') {
    if (!s || s === '-') return null;
    var n = Number(s.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  return s; // text: "10:郊外エリア" のような表記もそのまま保持する
}

/**
 * 正規形1行分のオブジェクトから、CSV由来19項目の完全一致による重複判定キーを作る。
 * 「19項目が一致する行＝同じ行」とみなし、CSVを重ねて取り込んでも増殖しないようにする。
 * 現場入力項目（CHK日・保険など）はキーに含めない（値が違っても同じ予約とみなす）。
 */
function buildDedupeKey_(record) {
  return COLUMNS.map(function (col) {
    var v = record[col.key];
    return (v === null || v === undefined) ? '' : String(v);
  }).join('');
}

/** 行オブジェクトのうち、現場入力項目が何個埋まっているかを数える（重複統合時の優先判定に使う）。 */
function countFilledEditableFields_(record) {
  var n = 0;
  EDITABLE_COLUMNS.forEach(function (col) {
    var v = record[col.key];
    if (v !== null && v !== undefined && v !== '') n++;
  });
  return n;
}

/**
 * 正規形の行データ配列を、シートに書き込むためのセル値（Date/Number/String）の配列へ変換する。
 * CSV由来19項目に無いキー（現場入力項目）は、値が無ければ空欄になる。
 */
function recordsToSheetRows_(records) {
  return records.map(function (rec) {
    return ALL_COLUMNS.map(function (col) { return cellValueFor_(col, rec[col.key]); });
  });
}

/** シート末尾に必要行数を確保する（足りなければ行を追加する）。 */
function ensureRowCapacity_(sheet, neededLastRow) {
  var current = sheet.getMaxRows();
  if (current < neededLastRow) {
    sheet.insertRowsAfter(current, neededLastRow - current);
  }
}

/** 指定範囲へ、項目の型に応じた表示形式（文字列は@、数値は#,##0、日付はyyyy/mm/dd）を適用する。 */
function applyColumnFormats_(sheet, startRow, numRows) {
  ALL_COLUMNS.forEach(function (col, i) {
    var range = sheet.getRange(startRow, i + 1, numRows, 1);
    if (col.type === 'date') range.setNumberFormat('yyyy/mm/dd');
    else if (col.type === 'number') range.setNumberFormat('#,##0');
    else range.setNumberFormat('@'); // 顧客ID・予約番号などの先頭0落ち・数値化を防ぐ
  });
}

/** 正規形レコードの配列をシート末尾へ追記する。 */
function appendRecords_(sheet, records) {
  if (records.length === 0) return;
  var startRow = sheet.getLastRow() + 1;
  ensureRowCapacity_(sheet, startRow + records.length - 1);
  applyColumnFormats_(sheet, startRow, records.length);
  var values = recordsToSheetRows_(records);
  sheet.getRange(startRow, 1, values.length, ALL_COLUMNS.length).setValues(values);
}

/**
 * CSVテキストを取り込む（マスタ権限のみ）。
 * ・見出し行の位置と各項目の列位置は名前で判定するため、列順が変わっても対応できる。
 * ・対象19項目以外の列は読み捨てる。現場入力項目（CHK日・保険など）は空欄で追加する。
 * ・19項目すべてが完全一致する行は「重複」としてスキップする（重ねて取り込んでも増殖しない）。
 */
function importCsv(csvText, fileName) {
  assertSetupReady_();
  assertMaster_();
  if (!csvText || !String(csvText).trim()) {
    throw new Error('CSVの内容が空です。ファイルをご確認ください。');
  }

  var matrix;
  try {
    matrix = Utilities.parseCsv(csvText);
  } catch (e) {
    throw new Error('CSVの解析に失敗しました。ファイル形式・文字コードをご確認ください。（' + e.message + '）');
  }
  if (!matrix || matrix.length < 2) {
    throw new Error('CSVにデータ行が見つかりません。');
  }

  var headerInfo = detectHeaderRow_(matrix);
  var sheet = getDataSheet_();
  var existingRows = readAllRows_(sheet);
  var existingKeys = {};
  existingRows.forEach(function (r) { existingKeys[buildDedupeKey_(r)] = true; });

  var newRecords = [];
  var batchKeys = {};
  var skippedDuplicate = 0;
  var skippedBlank = 0;

  for (var r = headerInfo.rowIndex + 1; r < matrix.length; r++) {
    var rawRow = matrix[r];
    var rowIsBlank = !rawRow || rawRow.every(function (v) { return v === undefined || String(v).trim() === ''; });
    if (rowIsBlank) { skippedBlank++; continue; }

    var record = {};
    for (var ci = 0; ci < COLUMNS.length; ci++) {
      var col = COLUMNS[ci];
      var idx = headerInfo.colIndexByKey[col.key];
      var raw = (idx === -1 || idx === undefined) ? '' : rawRow[idx];
      record[col.key] = convertValue_(col, raw);
    }

    var allEmpty = COLUMNS.every(function (col) {
      var v = record[col.key];
      return v === '' || v === null || v === undefined;
    });
    if (allEmpty) { skippedBlank++; continue; }

    var key = buildDedupeKey_(record);
    if (existingKeys[key] || batchKeys[key]) { skippedDuplicate++; continue; }
    batchKeys[key] = true;
    newRecords.push(record);
  }

  appendRecords_(sheet, newRecords);

  var props = PropertiesService.getDocumentProperties();
  props.setProperty('lastImportedAt', new Date().toISOString());
  props.setProperty('lastImportedFile', fileName || '');

  return {
    fileName: fileName || '',
    csvDataRows: matrix.length - headerInfo.rowIndex - 1,
    imported: newRecords.length,
    skippedDuplicate: skippedDuplicate,
    skippedBlank: skippedBlank,
    missingColumns: headerInfo.missingLabels,
    totalRows: Math.max(sheet.getLastRow() - 1, 0)
  };
}

// ============================================================================
// 一覧表の編集（CHK日・保険/Wifi/TAViCA/キャンサポ・メモ）
// ============================================================================

/**
 * 実行者が指定行を編集してよいかを確認し、CSV由来19項目を正規形で返す。
 * 社員=自店舗、所長・チーフ=自エリア以外の行は編集させない。
 */
function assertRowEditable_(ctx, sheet, rowIndex) {
  if (!ctx.bootstrapMode && !ctx.registered) {
    throw new Error('アクセス権がありません。管理者にお問い合わせください。');
  }
  var lastRow = sheet.getLastRow();
  rowIndex = Number(rowIndex);
  if (!rowIndex || rowIndex < 2 || rowIndex > lastRow) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  var rowValues = sheet.getRange(rowIndex, 1, 1, COLUMNS.length).getValues()[0];
  var rowRecord = {};
  COLUMNS.forEach(function (col, i) { rowRecord[col.key] = normalizeCellValue_(col, rowValues[i]); });

  if (ctx.role === ROLE_STAFF && rowRecord.office !== ctx.office) {
    throw new Error('自店舗以外のデータは編集できません。');
  }
  if (ctx.role === ROLE_MANAGER && rowRecord.area !== ctx.area) {
    throw new Error('自エリア以外のデータは編集できません。');
  }
  if ([ROLE_STAFF, ROLE_MANAGER, ROLE_MASTER].indexOf(ctx.role) === -1) {
    throw new Error('アクセス権がありません。');
  }
  return rowRecord;
}

/** 指定セルへ、項目の型に応じた表示形式と値を書き込む。 */
function writeCell_(sheet, rowIndex, columnKey, normalizedValue) {
  var col = ALL_COLUMNS[ALL_COLUMN_INDEX_BY_KEY[columnKey]];
  var colIndex = ALL_COLUMN_INDEX_BY_KEY[columnKey] + 1;
  var cell = sheet.getRange(rowIndex, colIndex);
  cell.setNumberFormat(col.type === 'date' ? 'yyyy/mm/dd' : (col.type === 'number' ? '#,##0' : '@'));
  cell.setValue(cellValueFor_(col, normalizedValue));
}

/**
 * 一覧表の現場入力項目を1セルだけ更新する。
 * ・CSV由来の19項目は編集不可（EDITABLE_KEY_SET に無いキーは拒否する）。
 * ・自分の閲覧範囲外の行（社員=他店舗／所長・チーフ=他エリア）は編集不可。
 * ・保険/Wifi/TAViCA/キャンサポのステータスを変更したときは、数量・理由を
 *   ステータスに応じて自動調整する（〇・☆は数量を維持、×は数量0、それ以外は数量を空に。
 *   ×以外に変えたら理由は消す）。「×」への変更自体は setAncillaryLost() を使うこと
 *   （理由の入力とセットで1回のサーバー呼び出しにするため）。
 */
function updateCellValue(rowIndex, columnKey, value) {
  if (!EDITABLE_KEY_SET[columnKey]) {
    throw new Error('この項目は編集できません。');
  }
  var ctx = getCurrentUserContext_();
  var sheet = getDataSheet_();
  assertRowEditable_(ctx, sheet, rowIndex);
  rowIndex = Number(rowIndex);

  var col = ALL_COLUMNS[ALL_COLUMN_INDEX_BY_KEY[columnKey]];
  var normalized = normalizeEditableInput_(col, value);
  writeCell_(sheet, rowIndex, columnKey, normalized);

  var ancillary = ANCILLARY_ITEM_BY_STATUS_KEY[columnKey];
  if (ancillary) {
    if (normalized === '〇' || normalized === '☆') {
      // 数量は現在の値を維持する（クライアント側で入力必須のアラートを出す）。
    } else if (normalized === '×') {
      writeCell_(sheet, rowIndex, ancillary.qtyKey, 0);
    } else {
      writeCell_(sheet, rowIndex, ancillary.qtyKey, null);
    }
    if (normalized !== '×') {
      writeCell_(sheet, rowIndex, ancillary.reasonKey, null);
    }
  }

  return { ok: true };
}

/**
 * 保険/Wifi/TAViCA/キャンサポを「×（失注）」にする専用API。
 * ステータス・数量(0)・理由を1回のサーバー呼び出しでまとめて保存する
 * （updateCellValueを複数回呼ぶと、通信の順序によって理由が消えてしまう恐れがあるため）。
 */
function setAncillaryLost(rowIndex, itemKey, reason) {
  var item = ANCILLARY_ITEM_BY_KEY[itemKey];
  if (!item) throw new Error('付帯商品の指定が不正です。');
  var ctx = getCurrentUserContext_();
  var sheet = getDataSheet_();
  assertRowEditable_(ctx, sheet, rowIndex);
  rowIndex = Number(rowIndex);

  writeCell_(sheet, rowIndex, item.statusKey, '×');
  writeCell_(sheet, rowIndex, item.qtyKey, 0);
  writeCell_(sheet, rowIndex, item.reasonKey, String(reason || '').trim());

  return { ok: true };
}

/** 編集項目の入力値を正規形（readAllRows_と同じ形）に変換する。 */
function normalizeEditableInput_(col, value) {
  if (value === null || value === undefined) return null;
  var s = String(value).trim();
  if (!s) return null;
  if (col.type === 'number') {
    var n = Number(s);
    return isNaN(n) ? null : n;
  }
  if (col.type === 'date') {
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? s.slice(0, 10) : null;
  }
  return s;
}

// ============================================================================
// 一覧表の列の並び順（チームで自由に変更できるようにする）
// ============================================================================

/** 保存済みの列順を返す。未保存なら null（クライアント側の既定順を使わせる）。 */
function getColumnOrderPreference() {
  var raw = PropertiesService.getDocumentProperties().getProperty('dataListColumnOrder');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/** 列順（キーの配列）をスプレッドシート単位で保存し、全員に反映させる。 */
function saveColumnOrderPreference(orderKeys) {
  if (!orderKeys || !orderKeys.length) {
    throw new Error('列の並び順が空です。');
  }
  PropertiesService.getDocumentProperties().setProperty('dataListColumnOrder', JSON.stringify(orderKeys));
  return { ok: true };
}

// ============================================================================
// データ管理（重複削除・全削除）※マスタ権限のみ
// ============================================================================

/**
 * 完全一致（CSV由来19項目が同じ）の重複行を1件に統合する。
 * 複数行が重複している場合は、現場入力項目（CHK日・保険など）がより多く
 * 埋まっている行を優先して残す（入力済みの記録を誤って消さないため）。
 */
function removeDuplicateRows() {
  assertMaster_();
  var sheet = getDataSheet_();
  var rows = readAllRows_(sheet);
  var bestByKey = {};
  var order = [];

  rows.forEach(function (r) {
    var key = buildDedupeKey_(r);
    if (!(key in bestByKey)) {
      bestByKey[key] = r;
      order.push(key);
    } else if (countFilledEditableFields_(r) > countFilledEditableFields_(bestByKey[key])) {
      bestByKey[key] = r;
    }
  });

  var deduped = order.map(function (k) { return bestByKey[k]; });
  var removed = rows.length - deduped.length;
  if (removed === 0) {
    return { removed: 0, totalRows: rows.length };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, ALL_COLUMNS.length).clearContent();
  appendRecords_(sheet, deduped);

  return { removed: removed, totalRows: deduped.length };
}

/** データ行をすべて削除する（見出し行は残す）。confirmText が「削除」と完全一致した場合のみ実行する。 */
function clearAllData(confirmText) {
  assertMaster_();
  if (confirmText !== '削除') {
    throw new Error('確認文字列が一致しません。「削除」と入力してから実行してください。');
  }
  var sheet = getDataSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, ALL_COLUMNS.length).clearContent();
  }
  var props = PropertiesService.getDocumentProperties();
  props.deleteProperty('lastImportedAt');
  props.deleteProperty('lastImportedFile');
  return { ok: true };
}

// ============================================================================
// スタッフ権限の管理（マスタ権限のみ）
// ============================================================================

function getOrCreateStaffSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STAFF_SHEET_NAME);
  if (!sheet) sheet = buildStaffSheet_(ss);
  return sheet;
}

/** スタッフ権限の一覧を返す（マスタ権限のみ）。 */
function getStaffAccessList() {
  assertMaster_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var list = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (v) { return v === '' || v === null; })) continue;
    list.push({
      rowIndex: i + 2,
      email: String(row[0] || ''),
      name: String(row[1] || ''),
      office: String(row[2] || ''),
      area: String(row[3] || ''),
      role: String(row[4] || '')
    });
  }
  return list;
}

function validateStaffInput_(email, role) {
  var s = String(email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) {
    throw new Error('正しいGoogleアカウント（メールアドレス）を入力してください。');
  }
  if (ROLES.indexOf(role) === -1) {
    throw new Error('権限の指定が不正です。');
  }
}

/** スタッフ権限を1件追加する（マスタ権限のみ）。 */
function addStaffAccess(email, name, office, area, role) {
  assertMaster_();
  validateStaffInput_(email, role);
  var sheet = getOrCreateStaffSheet_();
  var rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, 5).setValues([[String(email).trim().toLowerCase(), name || '', office || '', area || '', role]]);
  return getStaffAccessList();
}

/** スタッフ権限を1件更新する（マスタ権限のみ）。 */
function updateStaffAccess(rowIndex, email, name, office, area, role) {
  assertMaster_();
  validateStaffInput_(email, role);
  var sheet = getOrCreateStaffSheet_();
  rowIndex = Number(rowIndex);
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  sheet.getRange(rowIndex, 1, 1, 5).setValues([[String(email).trim().toLowerCase(), name || '', office || '', area || '', role]]);
  return getStaffAccessList();
}

/** スタッフ権限を1件削除する（マスタ権限のみ）。 */
function deleteStaffAccess(rowIndex) {
  assertMaster_();
  var sheet = getOrCreateStaffSheet_();
  rowIndex = Number(rowIndex);
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  sheet.deleteRow(rowIndex);
  return getStaffAccessList();
}

// ============================================================================
// 担当者マスタ（CSVの「担当者」コードを氏名表示に変換するための対応表）※マスタ権限のみ編集可
// ============================================================================

function getOrCreateStaffNameSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STAFF_NAME_SHEET_NAME);
  if (!sheet) sheet = buildStaffNameSheet_(ss);
  return sheet;
}

/** 担当者コード→氏名の対応表を返す（一覧表示・個人別サマリーで担当者名に変換するのに使う）。 */
function getStaffNameMap_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_NAME_SHEET_NAME);
  var map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    var code = String(values[i][0] || '').trim();
    var name = String(values[i][1] || '').trim();
    if (code && name) map[code] = name;
  }
  return map;
}

/** 担当者マスタの一覧を返す（マスタ権限のみ）。 */
function getStaffNameList() {
  assertMaster_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_NAME_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  var list = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (v) { return v === '' || v === null; })) continue;
    list.push({ rowIndex: i + 2, code: String(row[0] || ''), name: String(row[1] || '') });
  }
  return list;
}

function validateStaffNameInput_(code, name) {
  if (!String(code || '').trim()) throw new Error('担当者コードを入力してください。');
  if (!String(name || '').trim()) throw new Error('氏名を入力してください。');
}

/** 担当者マスタを1件追加する（マスタ権限のみ）。 */
function addStaffName(code, name) {
  assertMaster_();
  validateStaffNameInput_(code, name);
  var sheet = getOrCreateStaffNameSheet_();
  var rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, 2).setValues([[String(code).trim(), String(name).trim()]]);
  return getStaffNameList();
}

/** 担当者マスタを1件更新する（マスタ権限のみ）。 */
function updateStaffName(rowIndex, code, name) {
  assertMaster_();
  validateStaffNameInput_(code, name);
  var sheet = getOrCreateStaffNameSheet_();
  rowIndex = Number(rowIndex);
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  sheet.getRange(rowIndex, 1, 1, 2).setValues([[String(code).trim(), String(name).trim()]]);
  return getStaffNameList();
}

/** 担当者マスタを1件削除する（マスタ権限のみ）。 */
function deleteStaffName(rowIndex) {
  assertMaster_();
  var sheet = getOrCreateStaffNameSheet_();
  rowIndex = Number(rowIndex);
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  sheet.deleteRow(rowIndex);
  return getStaffNameList();
}
