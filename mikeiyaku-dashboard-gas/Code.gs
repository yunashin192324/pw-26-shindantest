/**
 * ============================================================================
 * Code.gs
 * 「46期未成約リスト」ダッシュボード - バックエンドAPI
 * ----------------------------------------------------------------------------
 * フロントエンド（Index.html / Javascript.html）から google.script.run 経由で
 * 呼び出される全APIをここに定義する。InitSheet.gs で構築したシート構造を前提とする。
 * ============================================================================
 */

// ---- 10店舗（マスタ・サマリシートを除く個別データシート） ----------------
const SHOP_SHEET_NAMES = [
  '水戸コムボックス310',
  '高崎オーパ',
  'イオンモール甲府昭和',
  '宇都宮',
  'ららぽーと沼津',
  'けやきウォーク前橋',
  'イーアスつくば',
  'MIDORI長野',
  'イオンモール太田',
  '(旧)イオンモール甲府昭和'
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

// ---- サマリシート名 --------------------------------------------------------
const SUMMARY_SHEET_NAME = '店舗別サマリ';
const EMP_SHEET_FIRST = '個人別サマリ(上期)';
const EMP_SHEET_SECOND = '個人別サマリ(下期)';

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

/**
 * ② フロントエンドの各種セレクトボックス／フォームで使用するマスタデータ一式を返す。
 */
function getMetaMasters() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const employeeMap = {};

    SHOP_SHEET_NAMES.forEach(function (sheetName) {
      const sheet = ss.getSheetByName(sheetName);
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
      shopList: SHOP_SHEET_NAMES.slice(),
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
    const result = [];
    const errorTokens = ['#NUM!', '#REF!', '#N/A', '#VALUE!', '#DIV/0!', '#NAME?', '#NULL!', '#ERROR!'];
    const lastCol = HEADERS_27.length;

    SHOP_SHEET_NAMES.forEach(function (sheetName) {
      const sheet = ss.getSheetByName(sheetName);
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
        obj.__sheetName = sheetName;
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
 * ④ 個人別サマリ（上期/下期）シートのデータを構造化して返す。
 * @param {string} period "first_half"（上期）または "second_half"（下期）
 */
function getEmployeeSummary(period) {
  try {
    const sheetName = period === 'second_half' ? EMP_SHEET_SECOND : EMP_SHEET_FIRST;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return { success: false, error: 'シート「' + sheetName + '」が見つかりません。' };
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 4) {
      return { success: true, blockOrder: [], employees: [] };
    }

    const headerValues = sheet.getRange(1, 1, 2, lastCol).getValues();
    const blockRow = headerValues[0];
    const metricRow = headerValues[1];

    // 結合セルで空欄になっている行1のブロックラベルを、直前の値でキャリーフォワードして復元する
    const carriedBlockRow = [];
    let lastBlockLabel = '';
    for (let c = 0; c < lastCol; c++) {
      if (blockRow[c] !== '' && blockRow[c] !== null) {
        lastBlockLabel = blockRow[c];
      }
      carriedBlockRow[c] = lastBlockLabel;
    }

    const blockOrder = [];
    for (let c = 4; c < lastCol; c++) {
      const label = carriedBlockRow[c];
      if (label !== '' && blockOrder.indexOf(label) === -1) {
        blockOrder.push(label);
      }
    }

    const employees = [];
    if (lastRow >= 3) {
      const dataValues = sheet.getRange(3, 1, lastRow - 2, lastCol).getValues();
      dataValues.forEach(function (row) {
        const officeCode = row[0];
        const officeName = row[1];
        const empNo = row[2];
        const empName = row[3];

        const isBlank = (officeCode === '' || officeCode === null)
          && (officeName === '' || officeName === null)
          && (empNo === '' || empNo === null)
          && (empName === '' || empName === null);
        if (isBlank) return;

        const periods = {};
        for (let c = 4; c < lastCol; c++) {
          const block = carriedBlockRow[c];
          const metric = metricRow[c];
          if (!block || !metric) continue;
          if (!periods[block]) periods[block] = {};
          periods[block][metric] = serializeCellValue_(row[c]);
        }

        employees.push({
          officeCode: serializeCellValue_(officeCode),
          officeName: serializeCellValue_(officeName),
          employeeNo: serializeCellValue_(empNo),
          employeeName: serializeCellValue_(empName),
          periods: periods
        });
      });
    }

    return { success: true, blockOrder: blockOrder, employees: employees };
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
    if (SHOP_SHEET_NAMES.indexOf(rowObject.sheetName) === -1) {
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
 * ⑥ SPAグリッド上でのインライン編集（STS／成約PAX）を対象セルへ即時反映する。
 * @param {string} sheetName 対象店舗シート名
 * @param {number} rowIndex シート上の物理行番号（整数）
 * @param {string} newStatus "失注" | "成約" | "リセール中"
 * @param {number|string} contractPax 成約PAX（newStatusが"成約"の場合のみ使用）
 */
function updateStatus(sheetName, rowIndex, newStatus, contractPax) {
  try {
    if (SHOP_SHEET_NAMES.indexOf(sheetName) === -1) {
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
    if (SHOP_SHEET_NAMES.indexOf(sheetName) === -1) {
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
