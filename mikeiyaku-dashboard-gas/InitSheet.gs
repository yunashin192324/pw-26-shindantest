/**
 * ============================================================================
 * InitSheet.gs
 * 「46期未成約リスト」ダッシュボード - データベース（スプレッドシート）初期化スクリプト
 * ----------------------------------------------------------------------------
 * このファイルをGoogle Apps Scriptエディタに貼り付け、setupAllSheets() を実行するだけで、
 *   ① 店舗別データシート（10枚・27列共通ヘッダー）
 *   ② 店舗別サマリシート（46期累計＋月別12ブロックの集計テンプレート）
 *   ③ 個人別サマリ(上期) / 個人別サマリ(下期) シート（2段ヘッダーのダミーレイアウト）
 *   ④ 店舗マスタ / スタッフマスタ シート（Webアプリの「店舗・スタッフ管理」タブが読み書きする台帳）
 * を自動構築します。既存のシートは上書きせず、スキップされます。
 * ============================================================================
 */

/**
 * スプレッドシートを開いた際にメニューを追加する（1クリック実行用）。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('46期未成約ダッシュボード')
    .addItem('① 全シートを初期化（InitSheet）', 'setupAllSheets')
    .addItem('② AI分析用サマリを作成／更新（Gemini用）', 'buildAiAnalysisSheetFromMenu')
    .addToUi();
}

/**
 * メイン実行関数。全シートを初期化する。
 */
function setupAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- 10店舗マスタ（店番・店舗名） ------------------------------------
  const SHOP_LIST = [
    { code: '046', name: '水戸コムボックス310' },
    { code: '051', name: '高崎オーパ' },
    { code: '053', name: 'イオンモール甲府昭和' },
    { code: '054', name: '宇都宮' },
    { code: '081', name: 'ららぽーと沼津' },
    { code: '596', name: 'けやきウォーク前橋' },
    { code: '717', name: 'イーアスつくば' },
    { code: '763', name: 'MIDORI長野' },
    { code: 'B66', name: 'イオンモール太田' },
    { code: 'B79', name: '(旧)イオンモール甲府昭和' }
  ];

  // ---- 店舗別データシート 共通27列ヘッダー ------------------------------
  const HEADERS_27 = [
    'リセール',                  // 1
    'STS',                        // 2
    '成約PAX',                    // 3
    '月',                          // 4
    '対象年月日',                 // 5
    '営業所コード',               // 6
    '社員番号',                   // 7
    '社員名',                     // 8
    '未成約理由(大)',             // 9
    '都市コード',                 // 10
    '種別',                       // 11
    '出発年月',                   // 12
    '旅行目的(小)',               // 13
    '接客方法',                   // 14
    'HIS利用歴',                  // 15
    '詳細',                       // 16
    'ACT日',                       // 17
    'ACT内容',                     // 18
    '備考',                       // 19
    '記録番号',                   // 20
    '最終アクション日',           // 21
    '対応状況',                   // 22
    '予約番号',                   // 23
    '次回ACT・進捗★手入力',       // 24
    '相談予約No☆自動反映',        // 25
    '名前☆自動反映',              // 26
    '連絡先☆自動反映'             // 27
  ];

  // ---- 46期の月順（11月始まり・10月終わり）------------------------------
  const MONTH_CODES_FULL = ['11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
  // ---- 個人別サマリ 上期（11月～4月）・下期（5月～10月）の対象月 ----------
  const FIRST_HALF_CODES = ['11', '12', '01', '02', '03', '04'];
  const SECOND_HALF_CODES = ['05', '06', '07', '08', '09', '10'];

  createShopSheets_(ss, SHOP_LIST, HEADERS_27);
  createShopSummarySheet_(ss, SHOP_LIST, MONTH_CODES_FULL);
  createEmployeeSummarySheet_(ss, '個人別サマリ(上期)', FIRST_HALF_CODES);
  createEmployeeSummarySheet_(ss, '個人別サマリ(下期)', SECOND_HALF_CODES);
  createShopMasterSheet_(ss, SHOP_LIST);
  createStaffMasterSheet_(ss);

  SpreadsheetApp.getUi().alert('シート構築が完了しました。\n（既存シートはスキップされています）');
}

/**
 * ① 店舗別データシート（10枚）を作成し、27列の共通ヘッダーを書き込む。
 * 既存シートがある場合はスキップ（上書きしない）。
 */
function createShopSheets_(ss, shopList, headers) {
  shopList.forEach(function (shop) {
    const existing = ss.getSheetByName(shop.name);
    if (existing) {
      Logger.log('シート「' + shop.name + '」は既に存在するためスキップしました。');
      return;
    }

    const sheet = ss.insertSheet(shop.name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1c4587')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sheet.setColumnWidths(1, headers.length, 110);
  });
}

/**
 * ② 「店舗別サマリ」シートを作成する。
 * ・A~J列: 46期累計パート
 * ・L列以降: 11月〜10月の月別パート（同じ10列構成のブロックを右方向に展開）
 * ・1行目: ブロックラベル（結合セル）、2行目: サブヘッダー
 * ・3行目以降: 10店舗分の店番・店舗名（マスター行）＋ 各種集計式（COUNTIFS/SUMIFS）
 */
function createShopSummarySheet_(ss, shopList, monthCodesFull) {
  const sheetName = '店舗別サマリ';
  const existing = ss.getSheetByName(sheetName);
  if (existing) {
    Logger.log('シート「' + sheetName + '」は既に存在するためスキップしました。');
    return;
  }

  const sheet = ss.insertSheet(sheetName);

  const subHeaders = ['店番', '店舗', '未成約件数', 'リセールアクション数', '成約件数', 'PAX数', 'リセール中', '失注数', 'リセール率', 'リセール成約率'];
  const blockLabels = ['46期累計'].concat(monthCodesFull.map(monthLabel_));

  // 各ブロックの開始列を計算（1ブロック=10列、ブロック間に空白1列）
  const blockStartCols = [];
  let cursor = 1;
  blockLabels.forEach(function () {
    blockStartCols.push(cursor);
    cursor += 11;
  });
  const lastUsedCol = blockStartCols[blockStartCols.length - 1] + 9;

  // 1行目（ブロックラベル・結合セル）・2行目（サブヘッダー）
  blockLabels.forEach(function (label, idx) {
    const startCol = blockStartCols[idx];
    sheet.getRange(1, startCol, 1, 10).merge().setValue(label);
    sheet.getRange(2, startCol, 1, 10).setValues([subHeaders]);
  });

  // 3行目以降：店舗ごとのマスター行 + 集計式
  const HEADER_ROWS = 2;
  shopList.forEach(function (shop, shopIdx) {
    const rowNum = HEADER_ROWS + 1 + shopIdx;
    const shopName = shop.name;

    blockLabels.forEach(function (label, blockIdx) {
      const startCol = blockStartCols[blockIdx];
      const monthCode = blockIdx === 0 ? null : monthCodesFull[blockIdx - 1];

      const col店番 = startCol;
      const col店舗 = startCol + 1;
      const col未成約 = startCol + 2;
      const colリセールアクション = startCol + 3;
      const col成約 = startCol + 4;
      const colPAX = startCol + 5;
      const colリセール中 = startCol + 6;
      const col失注 = startCol + 7;
      const colリセール率 = startCol + 8;
      const colリセール成約率 = startCol + 9;

      sheet.getRange(rowNum, col店番).setValue(shop.code);
      sheet.getRange(rowNum, col店舗).setValue(shopName);

      let f未成約, fリセールアクション, f成約, fPAX, fリセール中, f失注;

      if (blockIdx === 0) {
        // 46期累計：シート全体を対象に集計
        f未成約 = "=COUNTA('" + shopName + "'!$E$2:$E)";
        fリセールアクション = "=COUNTIFS('" + shopName + "'!$A$2:$A,\"〇\")";
        f成約 = "=COUNTIFS('" + shopName + "'!$B$2:$B,\"成約\")";
        fPAX = "=SUMIFS('" + shopName + "'!$C$2:$C,'" + shopName + "'!$B$2:$B,\"成約\")";
        fリセール中 = "=COUNTIFS('" + shopName + "'!$B$2:$B,\"リセール中\")";
        f失注 = "=COUNTIFS('" + shopName + "'!$B$2:$B,\"失注\")";
      } else {
        // 月別：「月」列（D列）が対象月コードと一致する行のみ集計
        f未成約 = "=COUNTIFS('" + shopName + "'!$D$2:$D,\"" + monthCode + "\")";
        fリセールアクション = "=COUNTIFS('" + shopName + "'!$D$2:$D,\"" + monthCode + "\",'" + shopName + "'!$A$2:$A,\"〇\")";
        f成約 = "=COUNTIFS('" + shopName + "'!$D$2:$D,\"" + monthCode + "\",'" + shopName + "'!$B$2:$B,\"成約\")";
        fPAX = "=SUMIFS('" + shopName + "'!$C$2:$C,'" + shopName + "'!$D$2:$D,\"" + monthCode + "\",'" + shopName + "'!$B$2:$B,\"成約\")";
        fリセール中 = "=COUNTIFS('" + shopName + "'!$D$2:$D,\"" + monthCode + "\",'" + shopName + "'!$B$2:$B,\"リセール中\")";
        f失注 = "=COUNTIFS('" + shopName + "'!$D$2:$D,\"" + monthCode + "\",'" + shopName + "'!$B$2:$B,\"失注\")";
      }

      sheet.getRange(rowNum, col未成約).setFormula(f未成約);
      sheet.getRange(rowNum, colリセールアクション).setFormula(fリセールアクション);
      sheet.getRange(rowNum, col成約).setFormula(f成約);
      sheet.getRange(rowNum, colPAX).setFormula(fPAX);
      sheet.getRange(rowNum, colリセール中).setFormula(fリセール中);
      sheet.getRange(rowNum, col失注).setFormula(f失注);

      const aリセールアクション = colToA1_(colリセールアクション) + rowNum;
      const a未成約 = colToA1_(col未成約) + rowNum;
      const a成約 = colToA1_(col成約) + rowNum;

      sheet.getRange(rowNum, colリセール率).setFormula('=IFERROR(' + aリセールアクション + '/' + a未成約 + ',0)');
      sheet.getRange(rowNum, colリセール成約率).setFormula('=IFERROR(' + a成約 + '/' + aリセールアクション + ',0)');
      sheet.getRange(rowNum, colリセール率, 1, 2).setNumberFormat('0.0%');
    });
  });

  sheet.getRange(1, 1, 2, lastUsedCol)
    .setFontWeight('bold')
    .setBackground('#1c4587')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(2);
  sheet.setColumnWidths(1, lastUsedCol, 95);
}

/**
 * ③ 「個人別サマリ(上期)」「個人別サマリ(下期)」シートを作成する。
 * ・A~D列: 営業所コード / 営業所名 / 社員番号 / 社員名（1〜2行目縦結合）
 * ・E列以降: 「累計」＋対象月ごとのブロック（4指標: リセール数/リセール中/成約件数/PAX数）
 * ・1行目: 月名結合ヘッダー（結合セル）、2行目: 4指標のサブヘッダー
 * ・社員実データは未確定のため、ヘッダーのみのダミーレイアウトとして生成する。
 */
function createEmployeeSummarySheet_(ss, sheetName, monthCodes) {
  const existing = ss.getSheetByName(sheetName);
  if (existing) {
    Logger.log('シート「' + sheetName + '」は既に存在するためスキップしました。');
    return;
  }

  const sheet = ss.insertSheet(sheetName);

  const basicHeaders = ['営業所コード', '営業所名', '社員番号', '社員名'];
  basicHeaders.forEach(function (label, idx) {
    const col = idx + 1;
    sheet.getRange(1, col, 2, 1).merge();
    sheet.getRange(1, col).setValue(label);
  });

  const metricHeaders = ['リセール数', 'リセール中', '成約件数', 'PAX数'];
  const blockLabels = ['累計'].concat(monthCodes.map(monthLabel_));

  blockLabels.forEach(function (label, idx) {
    const startCol = 5 + idx * 5;
    sheet.getRange(1, startCol, 1, 4).merge().setValue(label);
    sheet.getRange(2, startCol, 1, 4).setValues([metricHeaders]);
  });

  const lastBlockStart = 5 + (blockLabels.length - 1) * 5;
  const totalCols = lastBlockStart + 3;

  sheet.getRange(1, 1, 2, totalCols)
    .setFontWeight('bold')
    .setBackground('#1c4587')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(4);
  sheet.setColumnWidths(1, totalCols, 95);
}

/**
 * ④-a 「店舗マスタ」シートを作成する。
 * Webアプリの「店舗・スタッフ管理」タブが読み書きする店舗台帳（店番・店舗名・有効フラグ）。
 * 既存10店舗を初期データとしてシードする。
 */
function createShopMasterSheet_(ss, shopList) {
  const sheetName = '店舗マスタ';
  const existing = ss.getSheetByName(sheetName);
  if (existing) {
    Logger.log('シート「' + sheetName + '」は既に存在するためスキップしました。');
    return;
  }

  const sheet = ss.insertSheet(sheetName);
  const headers = ['店番', '店舗名', '有効'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#1c4587').setFontColor('#ffffff').setHorizontalAlignment('center');

  const rows = shopList.map(function (shop) { return [shop.code, shop.name, true]; });
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 3, 140);
}

/**
 * ④-b 「スタッフマスタ」シートを作成する。
 * Webアプリの「店舗・スタッフ管理」タブが読み書きするスタッフ台帳
 * （営業所コード・社員番号・社員名・Googleアカウント・権限レベル・有効フラグ）。
 * 実績データとは独立して、相談実績がまだ無いスタッフも事前に登録できるようにするための台帳。
 * ・権限レベルは「一般」「管理者」「マスタ管理」の3段階（空欄は「一般」扱い）。
 *   一般＝自店舗のみ閲覧／管理者（所長・チーフ）＝全店舗閲覧／マスタ管理＝全店舗閲覧＋
 *   CSVインポート＋店舗・スタッフマスタの編集追加。
 * 初期状態では空（基本は営業日報CSVインポート時に自動登録され、手動登録も可能）。
 */
function createStaffMasterSheet_(ss) {
  const sheetName = 'スタッフマスタ';
  const existing = ss.getSheetByName(sheetName);
  if (existing) {
    Logger.log('シート「' + sheetName + '」は既に存在するためスキップしました。');
    return;
  }

  const sheet = ss.insertSheet(sheetName);
  const headers = ['営業所コード', '社員番号', '社員名', 'Googleアカウント', '権限レベル', '有効'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#1c4587').setFontColor('#ffffff').setHorizontalAlignment('center');

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 3, 140);
  sheet.setColumnWidth(4, 220);
  sheet.setColumnWidths(5, 2, 110);

  // 「権限レベル」列に一般／管理者／マスタ管理のドロップダウンを設定（直接シート編集する場合の誤入力防止）
  const roleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['一般', '管理者', 'マスタ管理'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 5, 998, 1).setDataValidation(roleRule);
}

/**
 * 月コード（"12","01"...）を表示ラベル（"12月","1月"...）に変換する。
 */
function monthLabel_(code) {
  const num = code.indexOf('0') === 0 ? code.substring(1) : code;
  return num + '月';
}

/**
 * 列番号（1始まり）をA1形式の列アルファベットに変換する。
 */
function colToA1_(col) {
  let letter = '';
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}
