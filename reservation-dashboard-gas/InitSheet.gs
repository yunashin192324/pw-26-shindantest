/**
 * ============================================================================
 * InitSheet.gs
 * 予約データ分析ダッシュボード - シート初期化スクリプト
 * ----------------------------------------------------------------------------
 * このファイルをGoogle Apps Scriptエディタに貼り付け、setupAllSheetsFromMenu() を
 * 実行するか、スプレッドシートのメニュー「予約データダッシュボード」→「① 初期セットアップ」を
 * 実行すると、以下の3枚のシートを作成する。
 *   ・「予約データ」      ：CSV由来19項目＋現場入力14項目（合計33列・見出し付き）
 *   ・「スタッフ権限」    ：Googleアカウントごとの閲覧権限（社員／所長・チーフ／マスタ権限）
 *   ・「担当者マスタ」    ：CSVの「担当者」コード（例：BGK078）→ 氏名の対応表
 * 既にシートがある場合は中身を残したまま、見出しと表示形式だけを整える（安全に再実行できる）。
 * ============================================================================
 */

/**
 * スプレッドシートを開いた際にメニューを追加する（1クリック実行用）。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('予約データダッシュボード')
    .addItem('① 初期セットアップ（シート作成）', 'setupAllSheetsFromMenu')
    .addItem('② 重複行を削除する', 'removeDuplicateRowsFromMenu')
    .addToUi();
}

/** メニューから実行する用（完了メッセージをUIで表示する）。ウェブアプリからは runInitialSetup() を呼ぶこと。 */
function setupAllSheetsFromMenu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  buildDataSheet_(ss);
  buildStaffSheet_(ss);
  buildStaffNameSheet_(ss);
  SpreadsheetApp.getUi().alert(
    'シート「' + SHEET_NAME + '」「' + STAFF_SHEET_NAME + '」「' + STAFF_NAME_SHEET_NAME + '」の初期セットアップが完了しました。\n' +
    '「' + STAFF_SHEET_NAME + '」シートに、あなた自身のGoogleアカウントを「マスタ権限」で1行登録してください。'
  );
}

/** メニューから実行する用の重複削除。 */
function removeDuplicateRowsFromMenu() {
  var result = removeDuplicateRows();
  SpreadsheetApp.getUi().alert(
    result.removed > 0
      ? '重複行を ' + result.removed + ' 件削除しました（残り ' + result.totalRows + ' 件）。'
      : '重複している行はありませんでした。'
  );
}

/**
 * データ保存用シート「予約データ」を作成・整備する（何度実行しても安全）。
 * 見出しは Code.gs の ALL_COLUMNS 定義（CSV由来19項目＋現場入力14項目＝33列）と完全に一致させる。
 * 以前のバージョン（列数が少ない）で運用していたシートに対して再実行した場合も、
 * 既存データ行を残したまま足りない列の見出しだけを追加する。
 */
function buildDataSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  var headerLabels = ALL_COLUMNS.map(function (col) { return col.label; });
  var headerRange = sheet.getRange(1, 1, 1, headerLabels.length);
  headerRange.setValues([headerLabels]);
  headerRange.setFontWeight('bold').setBackground('#1d4ed8').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setTabColor('#1d4ed8');

  // 既存データ行も含めて、項目の型に応じた表示形式を再適用しておく
  // （手入力やCSV貼り付けで数値化・日付化が崩れてしまった場合の保険）。
  var maxRows = Math.max(sheet.getMaxRows(), 2);
  applyColumnFormats_(sheet, 2, maxRows - 1);

  // 列幅をおおまかに整える（見た目の初期状態を整えるだけで、必須ではない）。
  var widths = [
    110, 150, 90, 90, 90, 130, 150, 70, 70, 90, 80, 150, 110, 110, 100, 70, 90, 220, 80, // CSV由来19項目
    90,                                    // CHK日
    60, 60, 140,                           // 保険：ステータス／数量／理由
    60, 60, 140,                           // Wifi：ステータス／数量／理由
    70, 60, 140,                           // TAViCA：ステータス／数量／理由
    80, 60, 140,                           // キャンサポ：ステータス／数量／理由
    200                                    // メモ
  ];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  if (sheet.getMaxColumns() > ALL_COLUMNS.length) {
    sheet.hideColumns(ALL_COLUMNS.length + 1, sheet.getMaxColumns() - ALL_COLUMNS.length);
  }

  return sheet;
}

/**
 * スタッフ権限シートを作成・整備する（何度実行しても安全）。
 * 列：Googleアカウント／氏名／所属店舗／所属エリア／権限（社員・所長・チーフ・マスタ権限）
 * このシートに1件も登録が無い間は、Code.gsのgetCurrentUserContext_()が
 * 誰でもマスタ権限として扱う（＝最初のセットアップができる状態）。
 * 運用を始める前に、必ず自分自身をマスタ権限で1行登録すること。
 */
function buildStaffSheet_(ss) {
  var sheet = ss.getSheetByName(STAFF_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STAFF_SHEET_NAME);
  }

  var headerLabels = ['Googleアカウント', '氏名', '所属店舗', '所属エリア', '権限'];
  var headerRange = sheet.getRange(1, 1, 1, headerLabels.length);
  headerRange.setValues([headerLabels]);
  headerRange.setFontWeight('bold').setBackground('#1d4ed8').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setTabColor('#7c3aed');

  var maxRows = Math.max(sheet.getMaxRows(), 2);
  sheet.getRange(2, 1, maxRows - 1, 2).setNumberFormat('@');
  sheet.getRange(2, 3, maxRows - 1, 2).setNumberFormat('@');
  sheet.getRange(2, 5, maxRows - 1, 1).setNumberFormat('@');

  var widths = [220, 120, 160, 120, 130];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  // 権限列にプルダウン（社員／所長・チーフ／マスタ権限）を設定しておく
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(ROLES, true).setAllowInvalid(false).build();
  sheet.getRange(2, 5, Math.max(maxRows - 1, 1), 1).setDataValidation(rule);

  if (sheet.getMaxColumns() > headerLabels.length) {
    sheet.hideColumns(headerLabels.length + 1, sheet.getMaxColumns() - headerLabels.length);
  }

  return sheet;
}

/**
 * 担当者マスタシートを作成・整備する（何度実行しても安全）。
 * 列：担当者コード（CSVの「担当者」列の値。例：BGK078）／氏名
 * 「予約データ一覧」「個人別サマリー」の担当者列は、ここに登録された氏名があれば
 * コードの代わりに氏名を表示する（未登録のコードはそのままコード表示）。
 */
function buildStaffNameSheet_(ss) {
  var sheet = ss.getSheetByName(STAFF_NAME_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STAFF_NAME_SHEET_NAME);
  }

  var headerLabels = ['担当者コード', '氏名'];
  var headerRange = sheet.getRange(1, 1, 1, headerLabels.length);
  headerRange.setValues([headerLabels]);
  headerRange.setFontWeight('bold').setBackground('#1d4ed8').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setTabColor('#0891b2');

  var maxRows = Math.max(sheet.getMaxRows(), 2);
  sheet.getRange(2, 1, maxRows - 1, 2).setNumberFormat('@');

  var widths = [140, 160];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  if (sheet.getMaxColumns() > headerLabels.length) {
    sheet.hideColumns(headerLabels.length + 1, sheet.getMaxColumns() - headerLabels.length);
  }

  return sheet;
}
