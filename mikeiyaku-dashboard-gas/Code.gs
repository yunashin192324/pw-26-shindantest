/**
 * ============================================================================
 * Code.gs
 * 「46期未成約リスト」ダッシュボード - バックエンドAPI
 * ----------------------------------------------------------------------------
 * フロントエンド（Index.html / Javascript.html）から google.script.run 経由で
 * 呼び出される全APIをここに定義する。InitSheet.gs で構築したシート構造を前提とする。
 *
 * 店舗・スタッフは「店舗マスタ」「スタッフマスタ」シート（InitSheet.gs が作成）を
 * 正として動的に扱う。「店舗マスタ」シートが存在しない古い環境向けに、下記の
 * DEFAULT_SHOP_LIST を最終フォールバックとして残している。
 * ============================================================================
 */

// ---- フォールバック用の既定10店舗（「店舗マスタ」シートが無い場合のみ使用） --
const DEFAULT_SHOP_LIST = [
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

// ---- 店舗別データシート 共通27列ヘッダー（順序はシートの実列と完全一致） --
const HEADERS_27 = [
  'リセール',
  'STS',
  '成約PAX',
  '月',
  '対象年月日',
  '営業所コード',
  '社員番号',
  '社員名',
  '未成約理由(大)',
  '都市コード',
  '種別',
  '出発年月',
  '旅行目的(小)',
  '接客方法',
  'HIS利用歴',
  '詳細',
  'ACT日',
  'ACT内容',
  '備考',
  '記録番号',
  '入力日',
  '対応状況',
  '予約番号',
  '次回ACT・進捗★手入力',
  '相談予約No☆自動反映',
  '名前☆自動反映',
  '連絡先☆自動反映'
];

// ---- 各種ドロップダウンマスタ（固定選択肢） -------------------------------
const REASON_MASTER = [
  '料金のみ／旅行・日程検討中',
  '料金が高い',
  '席が取れない',
  'ツアー内容（料金以外）',
  '手数料',
  '代案提示中',
  '方面がまとまっていない',
  'ホテルが取れない',
  'HISオンラインに誘導',
  'インフォーム力が足りなかった',
  'カード利用希望のため',
  '燃油サーチャージ'
];

const TYPE_MASTER = [
  'Ciao',
  'imp',
  'AirZ・DP',
  'PEX',
  'IT',
  '代売',
  'ホテルのみ',
  'ﾋﾞｼﾞﾈｽ以上',
  'ﾉｰﾏﾙ'
];

const PURPOSE_MASTER = [
  'ハネムーン',
  '友人・知人',
  '家族旅行（子・12歳以上）',
  '家族旅行（子・12歳未満）',
  '一人旅',
  '家族旅行（夫婦のみ）',
  '家族旅行（3世代）',
  '挙式',
  '挙式列席者',
  '社員・団体旅行',
  '学生旅行',
  'イベント・その他',
  '家族旅行（その他）'
];

const CONTACT_MASTER = [
  '来店(相談予約)',
  '来店(W/I)',
  '電話',
  'VC',
  'メール'
];

// ---- シート名 --------------------------------------------------------------
const SUMMARY_SHEET_NAME = '店舗別サマリ';
const SHOP_MASTER_SHEET_NAME = '店舗マスタ';
const STAFF_MASTER_SHEET_NAME = 'スタッフマスタ';

/**
 * ① Webアプリとしてアクセスされた際のエントリポイント。
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('46期未成約ダッシュボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Index.html から他のHTMLファイル（Javascript.html等）をインクルードするためのヘルパー。
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// 店舗マスタ / スタッフマスタ 共通ヘルパー
// ============================================================================

/**
 * 「店舗マスタ」シートの全行（有効・無効を問わず）を返す。
 * シートが存在しない場合は null（＝旧環境。呼び出し側は DEFAULT_SHOP_LIST にフォールバックする）。
 */
function getAllShopMasterRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const list = [];
  values.forEach(function (row, i) {
    const code = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    if (!code && !name) return;
    list.push({ rowIndex: i + 2, code: code, name: name, active: row[2] !== false });
  });
  return list;
}

/**
 * 現在有効な店舗一覧（{code, name}の配列）を返す。ダッシュボードデータ取得・
 * 新規登録・CSVインポート等、アプリ全体から店舗を横断参照する処理はすべてこれを使う。
 */
function getShopList_() {
  const rows = getAllShopMasterRows_();
  if (rows === null) return DEFAULT_SHOP_LIST.slice(); // 「店舗マスタ」未作成の旧環境向けフォールバック
  return rows.filter(function (s) { return s.active; }).map(function (s) { return { code: s.code, name: s.name }; });
}

/**
 * 「スタッフマスタ」シートの全行を返す。
 */
function getStaffMasterRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const list = [];
  values.forEach(function (row, i) {
    const officeCode = String(row[0] || '').trim();
    const empNo = row[1];
    const empName = String(row[2] || '').trim();
    if (!empName && (empNo === '' || empNo === null)) return;
    list.push({ rowIndex: i + 2, officeCode: officeCode, employeeNo: empNo, employeeName: empName, active: row[3] !== false });
  });
  return list;
}

/**
 * ② フロントエンドの各種セレクトボックス／フォームで使用するマスタデータ一式を返す。
 */
function getMetaMasters() {
  try {
    const shopList = getShopList_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const employeeMap = {};

    // スタッフマスタに登録済みの社員（まだ実績が無いスタッフも含む）を先に反映
    getStaffMasterRows_().forEach(function (s) {
      if (!s.active) return;
      const key = String(s.employeeNo) + '_' + String(s.employeeName);
      employeeMap[key] = { employeeNo: s.employeeNo, employeeName: s.employeeName, officeCode: s.officeCode };
    });

    // 各店舗の実績データから、マスタ未登録の社員も自動的に拾い上げる
    shopList.forEach(function (shop) {
      const sheet = ss.getSheetByName(shop.name);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      const values = sheet.getRange(2, 1, lastRow - 1, HEADERS_27.length).getValues();
      values.forEach(function (row) {
        const empNo = row[6];  // 社員番号（7列目）
        const empName = row[7]; // 社員名（8列目）
        if ((empNo === '' || empNo === null) && (empName === '' || empName === null)) return;

        const key = String(empNo) + '_' + String(empName);
        if (!employeeMap[key]) {
          employeeMap[key] = {
            employeeNo: empNo,
            employeeName: empName,
            officeCode: row[5] // 営業所コード（6列目）
          };
        }
      });
    });

    return {
      success: true,
      shopList: shopList.map(function (s) { return s.name; }),
      reasonMaster: REASON_MASTER.slice(),
      typeMaster: TYPE_MASTER.slice(),
      purposeMaster: PURPOSE_MASTER.slice(),
      contactMaster: CONTACT_MASTER.slice(),
      employeeList: Object.keys(employeeMap).map(function (k) { return employeeMap[k]; })
    };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * ③ 全店舗シートの生データを統合・クリーニングして返す（ダッシュボードの主データソース）。
 */
function getDashboardData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shopList = getShopList_();
    const result = [];
    const errorTokens = ['#NUM!', '#REF!', '#N/A', '#VALUE!', '#DIV/0!', '#NAME?', '#NULL!', '#ERROR!'];
    const lastCol = HEADERS_27.length;

    shopList.forEach(function (shop) {
      const sheet = ss.getSheetByName(shop.name);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      for (let i = 0; i < values.length; i++) {
        const row = values[i];

        const isBlank = row.every(function (cell) { return cell === '' || cell === null; });
        if (isBlank) continue;

        const hasError = row.some(function (cell) {
          return typeof cell === 'string' && errorTokens.indexOf(cell) !== -1;
        });
        if (hasError) continue;

        const obj = {};
        for (let c = 0; c < lastCol; c++) {
          obj[HEADERS_27[c]] = serializeCellValue_(row[c]);
        }
        obj.__sheetName = shop.name;
        obj.__rowIndex = i + 2; // スプレッドシート上の物理行番号（2行目スタート）

        result.push(obj);
      }
    });

    return { success: true, data: result, count: result.length };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 統計値（リセール数／リセール中／成約件数／PAX数）を1行分のデータからバケットへ加算する。
 */
function accumulateEmployeeStats_(bucket, resale, sts, pax) {
  if (resale === '〇') bucket['リセール数'] += 1;
  if (sts === 'リセール中') bucket['リセール中'] += 1;
  if (sts === '成約') {
    bucket['成約件数'] += 1;
    bucket['PAX数'] += Number(pax) || 0;
  }
}

/**
 * ④ 個人別サマリ（上期/下期）を店舗データ＋スタッフマスタから動的に集計して返す。
 * （「個人別サマリ(上期)」「個人別サマリ(下期)」シートはヘッダーのみのテンプレートで
 *   実データ行を持たないため、Webアプリ側では読み取らずその場で再計算する）
 * @param {string} period "first_half"（上期）または "second_half"（下期）
 */
function getEmployeeSummary(period) {
  try {
    const monthCodes = period === 'second_half'
      ? ['05', '06', '07', '08', '09', '10']
      : ['12', '01', '02', '03', '04'];
    const blockLabels = ['累計'].concat(monthCodes.map(monthLabel_));

    const shopList = getShopList_();
    const shopNameByCode = {};
    shopList.forEach(function (s) { shopNameByCode[s.code] = s.name; });

    const employeesByKey = {};
    const order = [];

    const ensureEmployee = function (officeCode, empNo, empName) {
      const key = String(empNo) + '_' + String(empName);
      if (!employeesByKey[key]) {
        const periods = {};
        blockLabels.forEach(function (label) {
          periods[label] = { 'リセール数': 0, 'リセール中': 0, '成約件数': 0, 'PAX数': 0 };
        });
        employeesByKey[key] = {
          officeCode: officeCode,
          officeName: shopNameByCode[officeCode] || officeCode,
          employeeNo: empNo,
          employeeName: empName,
          periods: periods
        };
        order.push(key);
      }
      return employeesByKey[key];
    };

    // スタッフマスタ登録分は、実績が無くても一覧に表示されるよう先に確保しておく
    getStaffMasterRows_().forEach(function (s) {
      if (!s.active) return;
      ensureEmployee(s.officeCode, s.employeeNo, s.employeeName);
    });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    shopList.forEach(function (shop) {
      const sheet = ss.getSheetByName(shop.name);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      const values = sheet.getRange(2, 1, lastRow - 1, HEADERS_27.length).getValues();
      values.forEach(function (row) {
        const resale = row[0];
        const sts = row[1];
        const pax = row[2];
        const monthCode = String(row[3] || '');
        const empNo = row[6];
        const empName = row[7];
        if ((empNo === '' || empNo === null) && (empName === '' || empName === null)) return;

        const emp = ensureEmployee(shop.code, empNo, empName);

        accumulateEmployeeStats_(emp.periods['累計'], resale, sts, pax);

        if (monthCodes.indexOf(monthCode) !== -1) {
          const monthKey = monthLabel_(monthCode);
          if (emp.periods[monthKey]) {
            accumulateEmployeeStats_(emp.periods[monthKey], resale, sts, pax);
          }
        }
      });
    });

    const employees = order.map(function (key) { return employeesByKey[key]; });

    return { success: true, blockOrder: blockLabels, employees: employees };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * ⑤ 新規相談登録フォームから送信されたデータを、対象店舗シートへ1行追記する。
 * @param {Object} rowObject 27列ヘッダー名をキーとするオブジェクト + sheetName（登録先店舗）
 */
function addUncontractedData(rowObject) {
  try {
    if (!rowObject || !rowObject.sheetName) {
      throw new Error('店舗名（sheetName）が指定されていません。');
    }
    const shopList = getShopList_();
    if (!shopList.some(function (s) { return s.name === rowObject.sheetName; })) {
      throw new Error('不正な店舗名です: ' + rowObject.sheetName);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(rowObject.sheetName);
    if (!sheet) {
      throw new Error('シートが見つかりません: ' + rowObject.sheetName);
    }

    // 27列の共通カラム順に、送信オブジェクトの値をマッピングして1次元配列を作成
    const newRow = HEADERS_27.map(function (header) {
      const v = rowObject[header];
      return (v === undefined || v === null) ? '' : v;
    });

    // 「対象年月日」（YYYYMMDD）から月（2桁文字列）を自動抽出し、「月」列（4列目）へ反映
    const targetDate = String(rowObject['対象年月日'] || '');
    if (targetDate.length >= 6) {
      newRow[3] = targetDate.substring(4, 6);
    }

    const lastRow = sheet.getLastRow();
    const targetRowIndex = lastRow + 1;
    sheet.getRange(targetRowIndex, 1, 1, HEADERS_27.length).setValues([newRow]);

    return {
      success: true,
      sheetName: rowObject.sheetName,
      rowIndex: targetRowIndex,
      row: newRow
    };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 営業日報から抽出したCSVを一括投入する。
 * ・CSVはメタ情報の行が先頭に含まれていても構わない（先頭セルが「対象年月日」の行をヘッダー行として自動検出）。
 * ・「営業所コード」列の値から投入先の店舗シートを判定する。
 * ・重複判定キー（対象年月日＋営業所コード＋社員番号＋都市コード＋出発年月）が完全一致する行は、
 *   シート内の既存データ・および今回の取り込みバッチ内の両方に対してスキップする。
 * ・「対象年月日」から「月」列を自動導出し、リセール／STS等の管理列は空欄（未対応）として投入する。
 * @param {string} csvText CSVファイルの中身（テキスト）
 */
function importUncontractedCsv(csvText) {
  try {
    if (!csvText || typeof csvText !== 'string') {
      throw new Error('CSVデータが空です。');
    }

    const rows = Utilities.parseCsv(csvText);
    if (!rows || rows.length === 0) {
      throw new Error('CSVの解析結果が空でした。');
    }

    // ヘッダー行（先頭セルが「対象年月日」の行）を自動検出する。
    // 「理由別サマリ」等のメタ情報行が前段にあっても正しく本体のヘッダーを見つけられるようにするため。
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && String(rows[i][0]).trim() === '対象年月日') {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) {
      throw new Error('ヘッダー行（「対象年月日」列）が見つかりません。CSVの形式をご確認ください。');
    }

    const headerRow = rows[headerRowIndex].map(function (h) { return String(h).trim(); });
    const colIndex = {};
    headerRow.forEach(function (h, i) { colIndex[h] = i; });

    ['対象年月日', '営業所コード'].forEach(function (h) {
      if (colIndex[h] === undefined) {
        throw new Error('CSVに必須列「' + h + '」がありません。');
      }
    });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const officeCodeToSheetName = {};
    getShopList_().forEach(function (s) { officeCodeToSheetName[s.code] = s.name; });

    const getVal = function (row, header) {
      const idx = colIndex[header];
      if (idx === undefined || idx >= row.length) return '';
      const v = row[idx];
      return v === undefined || v === null ? '' : String(v).trim();
    };

    const rowsBySheet = {}; // sheetName -> 27列配列の配列
    let skippedDuplicateCount = 0;
    let skippedUnknownOfficeCount = 0;
    let skippedBlankCount = 0;
    const unknownOfficeCodes = {};

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(function (c) { return String(c).trim() === ''; })) continue;

      const targetDate = getVal(row, '対象年月日');
      const officeCode = getVal(row, '営業所コード');

      if (!targetDate || !officeCode) {
        skippedBlankCount++;
        continue;
      }

      const sheetName = officeCodeToSheetName[officeCode];
      if (!sheetName) {
        skippedUnknownOfficeCount++;
        unknownOfficeCodes[officeCode] = true;
        continue;
      }

      const monthCode = targetDate.length >= 6 ? targetDate.substring(4, 6) : '';

      const newRow = [];
      newRow[0] = '';                              // リセール（未対応）
      newRow[1] = '';                              // STS（未対応）
      newRow[2] = '';                              // 成約PAX
      newRow[3] = monthCode;                        // 月（対象年月日から自動導出）
      newRow[4] = targetDate;                       // 対象年月日
      newRow[5] = officeCode;                       // 営業所コード
      newRow[6] = getVal(row, '社員番号');
      newRow[7] = getVal(row, '社員名');
      newRow[8] = getVal(row, '未成約理由(大)');
      newRow[9] = getVal(row, '都市コード');
      newRow[10] = getVal(row, '種別');
      newRow[11] = getVal(row, '出発年月');
      newRow[12] = getVal(row, '旅行目的(小)');
      newRow[13] = getVal(row, '接客方法');
      newRow[14] = getVal(row, 'HIS利用歴');
      newRow[15] = getVal(row, '詳細');
      newRow[16] = '';                              // ACT日
      newRow[17] = '';                              // ACT内容
      newRow[18] = '';                              // 備考
      newRow[19] = '';                              // 記録番号
      newRow[20] = '';                              // 入力日
      newRow[21] = '';                              // 対応状況
      newRow[22] = getVal(row, '予約番号');
      newRow[23] = '';                              // 次回ACT・進捗★手入力（進捗メモ）
      newRow[24] = '';                              // 相談予約No☆自動反映
      newRow[25] = '';                              // 名前☆自動反映
      newRow[26] = '';                              // 連絡先☆自動反映

      if (!rowsBySheet[sheetName]) rowsBySheet[sheetName] = [];
      rowsBySheet[sheetName].push(newRow);
    }

    // 重複判定キー：対象年月日＋営業所コード＋社員番号＋都市コード＋出発年月
    const buildKey = function (row) {
      return [row[4], row[5], row[6], row[9], row[11]].join('｜');
    };

    Object.keys(rowsBySheet).forEach(function (sheetName) {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        skippedUnknownOfficeCount += rowsBySheet[sheetName].length;
        delete rowsBySheet[sheetName];
        return;
      }

      const existingKeys = {};
      const lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        const existingValues = sheet.getRange(2, 1, lastRow - 1, HEADERS_27.length).getValues();
        existingValues.forEach(function (row) { existingKeys[buildKey(row)] = true; });
      }

      const uniqueRows = [];
      rowsBySheet[sheetName].forEach(function (row) {
        const key = buildKey(row);
        if (existingKeys[key]) {
          skippedDuplicateCount++;
          return;
        }
        existingKeys[key] = true; // 同一バッチ内での重複投入も防ぐ
        uniqueRows.push(row);
      });
      rowsBySheet[sheetName] = uniqueRows;
    });

    // 店舗（シート）ごとに一括書き込み（getRange().setValues() でAPI呼び出しを最小化）
    const perSheetCounts = {};
    let importedCount = 0;
    Object.keys(rowsBySheet).forEach(function (sheetName) {
      const newRows = rowsBySheet[sheetName];
      if (newRows.length === 0) return;
      const sheet = ss.getSheetByName(sheetName);
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, newRows.length, HEADERS_27.length).setValues(newRows);
      perSheetCounts[sheetName] = newRows.length;
      importedCount += newRows.length;
    });

    return {
      success: true,
      importedCount: importedCount,
      skippedDuplicateCount: skippedDuplicateCount,
      skippedUnknownOfficeCount: skippedUnknownOfficeCount,
      skippedBlankCount: skippedBlankCount,
      unknownOfficeCodes: Object.keys(unknownOfficeCodes),
      perSheetCounts: perSheetCounts
    };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * ⑥ SPAグリッド上でのインライン編集（STS／成約PAX）を対象セルへ即時反映する。
 * @param {string} sheetName 対象店舗シート名
 * @param {number} rowIndex シート上の物理行番号（整数）
 * @param {string} newStatus "失注" | "成約" | "リセール中"
 * @param {number|string} contractPax 成約PAX（newStatusが"成約"の場合のみ使用）
 */
function updateStatus(sheetName, rowIndex, newStatus, contractPax) {
  try {
    const shopList = getShopList_();
    if (!shopList.some(function (s) { return s.name === sheetName; })) {
      throw new Error('不正な店舗名です: ' + sheetName);
    }

    const rIdx = parseInt(rowIndex, 10);
    if (isNaN(rIdx) || rIdx < 2) {
      throw new Error('不正な行番号です: ' + rowIndex);
    }

    const validStatuses = ['失注', '成約', 'リセール中'];
    if (validStatuses.indexOf(newStatus) === -1) {
      throw new Error('不正なステータスです: ' + newStatus);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('シートが見つかりません: ' + sheetName);
    }

    sheet.getRange(rIdx, 2).setValue(newStatus); // STS（2列目）

    if (newStatus === '成約') {
      sheet.getRange(rIdx, 3).setValue(contractPax === undefined || contractPax === null ? '' : contractPax); // 成約PAX（3列目）

      // ガードレール：成約になった際、リセール列（1列目）が空白なら自動で初期値を補完する
      const resaleCell = sheet.getRange(rIdx, 1);
      const resaleValue = resaleCell.getValue();
      if (resaleValue === '' || resaleValue === null) {
        resaleCell.setValue('✖');
      }
    } else if (newStatus === '失注' || newStatus === 'リセール中') {
      sheet.getRange(rIdx, 3).clearContent(); // 成約PAXをクリア
    }

    const updatedValues = sheet.getRange(rIdx, 1, 1, HEADERS_27.length).getValues()[0];
    const updatedObj = {};
    for (let c = 0; c < HEADERS_27.length; c++) {
      updatedObj[HEADERS_27[c]] = serializeCellValue_(updatedValues[c]);
    }
    updatedObj.__sheetName = sheetName;
    updatedObj.__rowIndex = rIdx;

    return { success: true, data: updatedObj };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * データグリッドのテキストセル（成約PAX／詳細／ACT日／ACT内容／備考／予約番号 等）の
 * ダブルクリック→インライン編集での即時同期保存に対応する汎用セル更新API。
 * @param {string} sheetName 対象店舗シート名
 * @param {number} rowIndex シート上の物理行番号（整数）
 * @param {string} columnName HEADERS_27 に含まれる列名
 * @param {*} value 更新後の値
 */
function updateCellValue(sheetName, rowIndex, columnName, value) {
  try {
    const shopList = getShopList_();
    if (!shopList.some(function (s) { return s.name === sheetName; })) {
      throw new Error('不正な店舗名です: ' + sheetName);
    }

    const rIdx = parseInt(rowIndex, 10);
    if (isNaN(rIdx) || rIdx < 2) {
      throw new Error('不正な行番号です: ' + rowIndex);
    }

    const colIdx = HEADERS_27.indexOf(columnName);
    if (colIdx === -1) {
      throw new Error('不正な列名です: ' + columnName);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('シートが見つかりません: ' + sheetName);
    }

    sheet.getRange(rIdx, colIdx + 1).setValue(value);

    const updatedValues = sheet.getRange(rIdx, 1, 1, HEADERS_27.length).getValues()[0];
    const updatedObj = {};
    for (let c = 0; c < HEADERS_27.length; c++) {
      updatedObj[HEADERS_27[c]] = serializeCellValue_(updatedValues[c]);
    }
    updatedObj.__sheetName = sheetName;
    updatedObj.__rowIndex = rIdx;

    return { success: true, data: updatedObj };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

// ============================================================================
// 店舗マスタ管理（「店舗・スタッフ管理」タブ）
// ============================================================================

/**
 * 店舗マスタの全件（有効・無効を問わず）を返す。
 */
function getShopMasterList() {
  try {
    const rows = getAllShopMasterRows_();
    if (rows === null) {
      throw new Error('「店舗マスタ」シートが見つかりません。InitSheet.gs の setupAllSheets() を実行してください。');
    }
    return { success: true, shops: rows };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 新しい店舗を追加する：①店舗マスタへ1行追加 ②27列ヘッダー付きのデータシートを新規作成
 * ③店舗別サマリの各集計ブロックへこの店舗の行（COUNTIFS/SUMIFS数式つき）を追加する。
 */
function addShopMaster(code, name) {
  try {
    code = String(code || '').trim();
    name = String(name || '').trim();
    if (!code || !name) {
      throw new Error('店番と店舗名は必須です。');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
    if (!masterSheet) {
      throw new Error('「店舗マスタ」シートが見つかりません。InitSheet.gs の setupAllSheets() を実行してください。');
    }

    const existing = getAllShopMasterRows_() || [];
    if (existing.some(function (s) { return s.code === code; })) {
      throw new Error('店番「' + code + '」は既に登録されています。');
    }
    if (existing.some(function (s) { return s.name === name; })) {
      throw new Error('店舗名「' + name + '」は既に登録されています。');
    }
    if (ss.getSheetByName(name)) {
      throw new Error('同名のシート「' + name + '」が既に存在します。');
    }

    masterSheet.appendRow([code, name, true]);
    createShopSheets_(ss, [{ code: code, name: name }], HEADERS_27);
    appendShopRowToSummary_(ss, { code: code, name: name });

    return { success: true, code: code, name: name };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 店舗名を変更する：データシート名を変更（店舗別サマリの数式は名前変更に自動追従する）し、
 * 店舗マスタと、店舗別サマリ上の店舗名テキストセル（数式ではない箇所）を更新する。
 */
function renameShopMaster(code, newName) {
  try {
    code = String(code || '').trim();
    newName = String(newName || '').trim();
    if (!code || !newName) {
      throw new Error('店番と新しい店舗名は必須です。');
    }

    const rows = getAllShopMasterRows_();
    if (rows === null) {
      throw new Error('「店舗マスタ」シートが見つかりません。');
    }
    const target = rows.find(function (s) { return s.code === code; });
    if (!target) {
      throw new Error('店番「' + code + '」が見つかりません。');
    }
    if (rows.some(function (s) { return s.code !== code && s.name === newName; })) {
      throw new Error('店舗名「' + newName + '」は既に使われています。');
    }

    const oldName = target.name;
    if (oldName === newName) {
      return { success: true, code: code, name: newName };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = ss.getSheetByName(oldName);
    if (dataSheet) {
      dataSheet.setName(newName); // 店舗別サマリの数式（'旧店舗名'!...）はGoogleシートが自動で追従する
    }

    const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
    masterSheet.getRange(target.rowIndex, 2).setValue(newName);

    updateShopNameInSummary_(ss, code, newName);

    return { success: true, code: code, name: newName };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 店舗を有効化／無効化する（ソフトデリート）。無効化された店舗はダッシュボードやフィルタから
 * 除外されるが、データシート自体は削除されない。
 */
function setShopActive(code, active) {
  try {
    code = String(code || '').trim();
    const rows = getAllShopMasterRows_();
    if (rows === null) {
      throw new Error('「店舗マスタ」シートが見つかりません。');
    }
    const target = rows.find(function (s) { return s.code === code; });
    if (!target) {
      throw new Error('店番「' + code + '」が見つかりません。');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
    masterSheet.getRange(target.rowIndex, 3).setValue(!!active);

    return { success: true, code: code, active: !!active };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 店舗を完全に削除する。データ流出・誤削除防止のため、対象店舗のデータシートに
 * データ行が1件でも残っている場合はエラーとし、setShopActive() による無効化を促す。
 */
function deleteShopMaster(code) {
  try {
    code = String(code || '').trim();
    const rows = getAllShopMasterRows_();
    if (rows === null) {
      throw new Error('「店舗マスタ」シートが見つかりません。');
    }
    const target = rows.find(function (s) { return s.code === code; });
    if (!target) {
      throw new Error('店番「' + code + '」が見つかりません。');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = ss.getSheetByName(target.name);
    if (dataSheet && dataSheet.getLastRow() >= 2) {
      throw new Error('「' + target.name + '」にはデータが' + (dataSheet.getLastRow() - 1) + '件残っているため削除できません。先にデータを整理するか、無効化をご利用ください。');
    }

    if (dataSheet) {
      ss.deleteSheet(dataSheet);
    }

    const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
    masterSheet.deleteRow(target.rowIndex);

    removeShopRowFromSummary_(ss, code);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 店舗別サマリ上の「店舗」テキストセル（数式ではない箇所）を、店番をキーに一括更新する。
 * ブロック幅10列＋区切り1列の構成に沿って、各ブロックの店番セル（先頭列）を走査する。
 */
function updateShopNameInSummary_(ss, code, newName) {
  const sheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 3 || lastCol < 2) return;

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  for (let col = 0; col < lastCol; col += 11) {
    for (let r = 2; r < lastRow; r++) { // 0-indexed：3行目以降がデータ行
      if (String(values[r][col]) === code) {
        sheet.getRange(r + 1, col + 2).setValue(newName); // 「店舗」セル（1-indexed）
      }
    }
  }
}

/**
 * 店舗別サマリの末尾に、新規店舗の集計行（COUNTIFS/SUMIFS数式）を1行追加する。
 * InitSheet.gs の createShopSummarySheet_ と同一のブロック構成・数式ロジックを踏襲する。
 */
function appendShopRowToSummary_(ss, shop) {
  const sheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!sheet) return;

  const MONTH_CODES_FULL = ['12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];
  const blockLabels = ['46期累計'].concat(MONTH_CODES_FULL.map(monthLabel_));
  const blockStartCols = [];
  let cursor = 1;
  blockLabels.forEach(function () { blockStartCols.push(cursor); cursor += 11; });

  const rowNum = sheet.getLastRow() + 1;
  const shopName = shop.name;

  blockLabels.forEach(function (label, blockIdx) {
    const startCol = blockStartCols[blockIdx];
    const monthCode = blockIdx === 0 ? null : MONTH_CODES_FULL[blockIdx - 1];

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
      f未成約 = "=COUNTA('" + shopName + "'!$E$2:$E)";
      fリセールアクション = "=COUNTIFS('" + shopName + "'!$A$2:$A,\"〇\")";
      f成約 = "=COUNTIFS('" + shopName + "'!$B$2:$B,\"成約\")";
      fPAX = "=SUMIFS('" + shopName + "'!$C$2:$C,'" + shopName + "'!$B$2:$B,\"成約\")";
      fリセール中 = "=COUNTIFS('" + shopName + "'!$B$2:$B,\"リセール中\")";
      f失注 = "=COUNTIFS('" + shopName + "'!$B$2:$B,\"失注\")";
    } else {
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
}

/**
 * 店舗別サマリから、指定した店番の行（全ブロックにまたがる1行）を削除する。
 */
function removeShopRowFromSummary_(ss, code) {
  const sheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;

  const colAValues = sheet.getRange(3, 1, lastRow - 2, 1).getValues();
  for (let i = 0; i < colAValues.length; i++) {
    if (String(colAValues[i][0]) === code) {
      sheet.deleteRow(3 + i);
      return;
    }
  }
}

// ============================================================================
// スタッフマスタ管理（「店舗・スタッフ管理」タブ）
// ============================================================================

/**
 * スタッフマスタの全件と、実績データはあるがマスタ未登録のスタッフ（登録候補）を返す。
 */
function getStaffMasterList() {
  try {
    const master = getStaffMasterRows_();
    const shopList = getShopList_();
    const shopNameByCode = {};
    shopList.forEach(function (s) { shopNameByCode[s.code] = s.name; });

    const masterKeys = {};
    master.forEach(function (s) { masterKeys[String(s.employeeNo) + '_' + String(s.employeeName)] = true; });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const unregisteredMap = {};
    shopList.forEach(function (shop) {
      const sheet = ss.getSheetByName(shop.name);
      if (!sheet) return;
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      const values = sheet.getRange(2, 7, lastRow - 1, 2).getValues(); // G列(社員番号)・H列(社員名)
      values.forEach(function (row) {
        const empNo = row[0];
        const empName = row[1];
        if ((empNo === '' || empNo === null) && (empName === '' || empName === null)) return;

        const key = String(empNo) + '_' + String(empName);
        if (masterKeys[key]) return;
        if (!unregisteredMap[key]) {
          unregisteredMap[key] = { officeCode: shop.code, officeName: shop.name, employeeNo: empNo, employeeName: empName };
        }
      });
    });

    return {
      success: true,
      staff: master.map(function (s) {
        return {
          rowIndex: s.rowIndex,
          officeCode: s.officeCode,
          officeName: shopNameByCode[s.officeCode] || s.officeCode,
          employeeNo: s.employeeNo,
          employeeName: s.employeeName,
          active: s.active
        };
      }),
      unregistered: Object.keys(unregisteredMap).map(function (k) { return unregisteredMap[k]; })
    };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * スタッフマスタへ新しいスタッフを1件追加する（実績の有無に関わらず事前登録できる）。
 */
function addStaffMaster(officeCode, employeeNo, employeeName) {
  try {
    officeCode = String(officeCode || '').trim();
    employeeName = String(employeeName || '').trim();
    if (!officeCode || !employeeName) {
      throw new Error('所属店舗と社員名は必須です。');
    }

    const shopList = getShopList_();
    if (!shopList.some(function (s) { return s.code === officeCode; })) {
      throw new Error('不正な店舗（営業所コード）です: ' + officeCode);
    }

    const existing = getStaffMasterRows_();
    if (existing.some(function (s) { return String(s.employeeNo) === String(employeeNo) && s.employeeName === employeeName; })) {
      throw new Error('同じ社員番号・社員名のスタッフが既に登録されています。');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
    if (!sheet) {
      throw new Error('「スタッフマスタ」シートが見つかりません。InitSheet.gs の setupAllSheets() を実行してください。');
    }
    sheet.appendRow([officeCode, employeeNo === undefined || employeeNo === null ? '' : employeeNo, employeeName, true]);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * スタッフマスタの既存行を更新する（rowIndexで対象行を特定）。
 */
function updateStaffMaster(rowIndex, officeCode, employeeNo, employeeName) {
  try {
    const rIdx = parseInt(rowIndex, 10);
    if (isNaN(rIdx) || rIdx < 2) {
      throw new Error('不正な行番号です: ' + rowIndex);
    }
    officeCode = String(officeCode || '').trim();
    employeeName = String(employeeName || '').trim();
    if (!officeCode || !employeeName) {
      throw new Error('所属店舗と社員名は必須です。');
    }

    const shopList = getShopList_();
    if (!shopList.some(function (s) { return s.code === officeCode; })) {
      throw new Error('不正な店舗（営業所コード）です: ' + officeCode);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
    if (!sheet) {
      throw new Error('「スタッフマスタ」シートが見つかりません。');
    }
    sheet.getRange(rIdx, 1, 1, 3).setValues([[officeCode, employeeNo === undefined || employeeNo === null ? '' : employeeNo, employeeName]]);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * スタッフマスタの行を削除する（過去の実績データ自体は削除されない）。
 */
function deleteStaffMaster(rowIndex) {
  try {
    const rIdx = parseInt(rowIndex, 10);
    if (isNaN(rIdx) || rIdx < 2) {
      throw new Error('不正な行番号です: ' + rowIndex);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
    if (!sheet) {
      throw new Error('「スタッフマスタ」シートが見つかりません。');
    }
    sheet.deleteRow(rIdx);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * セル値をフロントエンドへ渡す前にシリアライズする（Dateオブジェクト等の変換エラーを回避）。
 */
function serializeCellValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (value === null || value === undefined) return '';
  return value;
}
