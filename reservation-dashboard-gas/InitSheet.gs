/**
 * ============================================================================
 * InitSheet.gs
 * 予約データ分析ダッシュボード - シート初期化スクリプト
 * ----------------------------------------------------------------------------
 * このファイルをGoogle Apps Scriptエディタに貼り付け、setupAllSheets() を実行するか、
 * スプレッドシートのメニュー「予約データダッシュボード」→「① 初期セットアップ」を
 * 実行すると、データ保存用シート「予約データ」（19列・見出し付き）を作成する。
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
  SpreadsheetApp.getUi().alert('シート「' + SHEET_NAME + '」の初期セットアップが完了しました。');
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
 * 見出しは Code.gs の COLUMNS 定義（19項目）と完全に一致させる。
 */
function buildDataSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  var headerLabels = COLUMNS.map(function (col) { return col.label; });
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
  var widths = [110, 150, 90, 90, 90, 130, 150, 70, 70, 90, 80, 150, 110, 110, 100, 70, 90, 220, 80];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  if (sheet.getMaxColumns() > COLUMNS.length) {
    sheet.hideColumns(COLUMNS.length + 1, sheet.getMaxColumns() - COLUMNS.length);
  }

  return sheet;
}
