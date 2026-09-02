/**
 * ============================================================================
 * Code.gs
 * 予約データ分析ダッシュボード - バックエンドAPI
 * ----------------------------------------------------------------------------
 * Googleスプレッドシート + Google Apps Script のみで構成するWebアプリ。
 * フロントエンド（Index.html / Javascript.html）から google.script.run 経由で
 * 呼び出される全APIをここに定義する。シート構造の作成は InitSheet.gs が担う。
 *
 * このアプリが扱う項目は、営業日報CSVのうち以下19項目のみに限定している
 * （それ以外の列はインポート時に読み捨てる）。
 *   006:エリア／007:営業所／013:最終目的地／014:予約日／016:出発予定日／
 *   019:顧客ID／020:予約番号／023:性別／024:国籍／029:商品分類／
 *   031:キャリア／037:ツアーブランド区分／038:ツアーコード／
 *   046:売上(商品請求金額)／047:入金額／051:STS／058:担当者／
 *   070:商品タイトル／076:旅行日数
 * ============================================================================
 */

var APP_TITLE = '予約データ分析ダッシュボード';
var SHEET_NAME = '予約データ';
var TIMEZONE = 'Asia/Tokyo';
var SERVER_VERSION = '1.0.0';

// ---- 抽出対象19項目の定義（表示順・シート列順はこの並びに統一する） --------
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
 * 「予約データ」シートが存在し、見出し行が想定どおりかを確認する。
 * ウェブアプリ起動時に呼び、未セットアップならセットアップ案内バーを出す。
 */
function getSetupStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return { ready: false, reason: 'sheet_missing', detail: 'シート「' + SHEET_NAME + '」がまだ作成されていません。' };
  }
  if (sheet.getLastColumn() < COLUMNS.length) {
    return { ready: false, reason: 'header_incomplete', detail: '見出し列が ' + COLUMNS.length + ' 列に足りません。' };
  }
  var headerRow = sheet.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  for (var i = 0; i < COLUMNS.length; i++) {
    if (String(headerRow[i]).trim() !== COLUMNS[i].label) {
      return {
        ready: false,
        reason: 'header_mismatch',
        detail: (i + 1) + '列目の見出しが一致しません（期待：' + COLUMNS[i].label + ' / 実際：' + headerRow[i] + '）。'
      };
    }
  }
  return { ready: true };
}

/**
 * 初期セットアップを実行する（ウェブアプリの案内バーから呼ばれる）。
 * 実体は InitSheet.gs の buildDataSheet_() 。
 */
function runInitialSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  buildDataSheet_(ss);
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
// 画面初期表示データ
// ============================================================================

/**
 * 画面ロード時に一度だけ呼ぶ。項目定義＋全データ行＋メタ情報をまとめて返す。
 * 以降の絞り込み・並べ替え・集計はすべてブラウザ側（Javascript.html）で行う。
 */
function getBootstrapData() {
  var status = getSetupStatus();
  if (!status.ready) {
    return { ready: false, status: status, columns: COLUMNS, rows: [], meta: null };
  }
  var sheet = getDataSheet_();
  var rows = readAllRows_(sheet);
  var props = PropertiesService.getDocumentProperties();
  return {
    ready: true,
    status: status,
    columns: COLUMNS,
    rows: rows,
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
 * シートのデータ行を、フロントエンドで扱いやすい「正規形」のオブジェット配列に変換する。
 * 日付は 'yyyy-MM-dd' 文字列、数値は Number（空欄は null）、文字は String に統一する。
 * この正規形は importCsv() 側の変換結果とも一致させている（重複判定や書き戻しを共通化するため）。
 */
function readAllRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  var rows = [];
  for (var r = 0; r < values.length; r++) {
    var raw = values[r];
    var isBlank = raw.every(function (v) { return v === '' || v === null; });
    if (isBlank) continue;

    var obj = {};
    for (var c = 0; c < COLUMNS.length; c++) {
      var col = COLUMNS[c];
      var v = raw[c];
      if (col.type === 'date') {
        obj[col.key] = (v instanceof Date) ? Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd') : (v ? String(v) : null);
      } else if (col.type === 'number') {
        obj[col.key] = (v === '' || v === null) ? null : Number(v);
      } else {
        obj[col.key] = (v === null || v === undefined) ? '' : String(v);
      }
    }
    obj.rowIndex = r + 2; // シート上の実行番号（1始まり）。将来の行単位操作用。
    rows.push(obj);
  }
  return rows;
}

// ============================================================================
// CSVインポート
// ============================================================================

/**
 * 見出しセルの "006:エリア" のような表記から、番号プレフィックスを除いた
 * ラベル部分だけを取り出す。列の並び順が変わっても項目名だけで判定できるようにする。
 */
function normalizeHeaderLabel_(raw) {
  if (raw === null || raw === undefined) return '';
  var s = String(raw).replace(/^\uFEFF/, '').trim();
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
 * 正規形1行分のオブジェクトから、完全一致による重複判定キーを作る。
 * 「全19項目が一致する行＝同じ行」とみなし、CSVを重ねて取り込んでも増殖しないようにする。
 */
function buildDedupeKey_(record) {
  return COLUMNS.map(function (col) {
    var v = record[col.key];
    return (v === null || v === undefined) ? '' : String(v);
  }).join('');
}

/**
 * 正規形の行データ配列を、シートに書き込むためのセル値（Date/Number/String）の配列へ変換する。
 */
function recordsToSheetRows_(records) {
  return records.map(function (rec) {
    return COLUMNS.map(function (col) {
      var v = rec[col.key];
      if (v === null || v === undefined || v === '') return '';
      if (col.type === 'date') {
        var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
      }
      return v;
    });
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
  COLUMNS.forEach(function (col, i) {
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
  sheet.getRange(startRow, 1, values.length, COLUMNS.length).setValues(values);
}

/**
 * CSVテキストを取り込む。
 * ・見出し行の位置と各項目の列位置は名前で判定するため、列順が変わっても対応できる。
 * ・対象19項目以外の列は読み捨てる。
 * ・19項目すべてが完全一致する行は「重複」としてスキップする（重ねて取り込んでも増殖しない）。
 */
function importCsv(csvText, fileName) {
  assertSetupReady_();
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
// データ管理（重複削除・全削除）
// ============================================================================

/** 完全一致（19項目すべて同じ）の重複行だけを1件に統合する。 */
function removeDuplicateRows() {
  var sheet = getDataSheet_();
  var rows = readAllRows_(sheet);
  var seen = {};
  var deduped = [];
  var removed = 0;

  rows.forEach(function (r) {
    var key = buildDedupeKey_(r);
    if (seen[key]) { removed++; return; }
    seen[key] = true;
    deduped.push(r);
  });

  if (removed === 0) {
    return { removed: 0, totalRows: rows.length };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).clearContent();
  appendRecords_(sheet, deduped);

  return { removed: removed, totalRows: deduped.length };
}

/** データ行をすべて削除する（見出し行は残す）。confirmText が「削除」と完全一致した場合のみ実行する。 */
function clearAllData(confirmText) {
  if (confirmText !== '削除') {
    throw new Error('確認文字列が一致しません。「削除」と入力してから実行してください。');
  }
  var sheet = getDataSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).clearContent();
  }
  var props = PropertiesService.getDocumentProperties();
  props.deleteProperty('lastImportedAt');
  props.deleteProperty('lastImportedFile');
  return { ok: true };
}
