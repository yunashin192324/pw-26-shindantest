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
  '最終アクション日',
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

// ---- 権限レベル（スタッフマスタ「権限レベル」列に格納する文字列） -----------
const ROLE_GENERAL = '一般';       // 自店舗のみ閲覧
const ROLE_MANAGER = '管理者';     // 所長・チーフ：全店舗を閲覧（CSV・マスタ編集は不可）
const ROLE_MASTER = 'マスタ管理';  // 全店舗閲覧＋CSVインポート＋店舗・スタッフマスタの編集/追加

/**
 * 「スタッフマスタ」シートの全行を返す。
 * 列構成: 営業所コード / 社員番号 / 社員名 / Googleアカウント / 権限レベル / 有効
 */
function getStaffMasterRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const list = [];
  values.forEach(function (row, i) {
    const officeCode = String(row[0] || '').trim();
    const empNo = row[1];
    const empName = String(row[2] || '').trim();
    const googleAccount = String(row[3] || '').trim();
    const role = normalizeRole_(row[4]);
    if (!empName && (empNo === '' || empNo === null)) return;
    list.push({
      rowIndex: i + 2,
      officeCode: officeCode,
      employeeNo: empNo,
      employeeName: empName,
      googleAccount: googleAccount,
      role: role,
      active: row[5] !== false
    });
  });
  return list;
}

/**
 * スタッフマスタ「権限レベル」列の値を、既知の3値（一般／管理者／マスタ管理）に正規化する。
 * 空欄・不明な値は「一般」として扱う。旧バージョンのTRUE/FALSE（管理者権限チェックボックス）が
 * 残っている場合は、後方互換のためTRUE→管理者として読み替える。
 */
function normalizeRole_(rawValue) {
  const v = String(rawValue === undefined || rawValue === null ? '' : rawValue).trim();
  if (v === ROLE_MASTER) return ROLE_MASTER;
  if (v === ROLE_MANAGER) return ROLE_MANAGER;
  if (v.toUpperCase() === 'TRUE') return ROLE_MANAGER; // 旧仕様（管理者権限チェックボックス）からの後方互換
  return ROLE_GENERAL;
}

/**
 * ログイン中ユーザーの権限コンテキストを解決する。
 * Session.getActiveUser().getEmail() で取得したメールアドレスを「スタッフマスタ」の
 * Googleアカウント列と照合し、一致すればその人の権限レベル・所属店舗を返す。
 * ・マスタ管理　　　　＝ 全店舗閲覧＋CSVインポート＋店舗/スタッフマスタの編集・追加
 * ・管理者（所長・チーフ）＝ 全店舗閲覧のみ（CSV・マスタ編集は不可）
 * ・一般　　　　　　　＝ officeCode で自店舗のデータのみに絞り込む
 * ・メール取得不可、またはスタッフマスタに未登録（導入初期の未登録ユーザー等）の場合は
 *   フェイルオープン（＝マスタ管理相当）とする。締め出しを避けるため。
 */
function getCurrentUserContext_() {
  let email = '';
  try {
    email = Session.getActiveUser().getEmail() || '';
  } catch (e) {
    email = '';
  }

  const staff = getStaffMasterRows_();
  let matched = null;
  if (email) {
    const emailLower = email.trim().toLowerCase();
    matched = staff.find(function (s) {
      return s.googleAccount && s.googleAccount.trim().toLowerCase() === emailLower;
    }) || null;
  }

  let role, officeCode, officeName, employeeName, identified;
  if (matched) {
    const shopList = getShopList_();
    const shop = shopList.find(function (s) { return s.code === matched.officeCode; });
    role = matched.role;
    officeCode = matched.officeCode;
    officeName = shop ? shop.name : matched.officeCode;
    employeeName = matched.employeeName;
    identified = true;
  } else {
    role = ROLE_MASTER; // フェイルオープン：未登録ユーザーの締め出しを避けるため最上位権限扱い
    officeCode = null;
    officeName = null;
    employeeName = null;
    identified = false;
  }

  return {
    email: email,
    identified: identified,
    role: role,
    officeCode: officeCode,
    officeName: officeName,
    employeeName: employeeName,
    canViewAllStores: role === ROLE_MANAGER || role === ROLE_MASTER,
    canImportCsv: role === ROLE_MASTER,
    canManageMaster: role === ROLE_MASTER
  };
}

/**
 * フロントエンドから呼び出す、ログイン中ユーザーの権限コンテキスト取得API。
 */
function getCurrentUserContext() {
  try {
    return { success: true, context: getCurrentUserContext_() };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * ② フロントエンドの各種セレクトボックス／フォームで使用するマスタデータ一式を返す。
 */
function getMetaMasters() {
  try {
    const ctx = getCurrentUserContext_();
    let shopList = getShopList_();
    if (!ctx.canViewAllStores && ctx.officeCode) {
      shopList = shopList.filter(function (s) { return s.code === ctx.officeCode; });
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const employeeMap = {};

    // スタッフマスタに登録済みの社員（まだ実績が無いスタッフも含む）を先に反映
    // （一般スタッフは自店舗のスタッフのみに絞り込む）
    getStaffMasterRows_().forEach(function (s) {
      if (!s.active) return;
      if (!ctx.canViewAllStores && ctx.officeCode && s.officeCode !== ctx.officeCode) return;
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
      employeeList: Object.keys(employeeMap).map(function (k) { return employeeMap[k]; }),
      userContext: ctx
    };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

// ============================================================================
// 会計期ヘルパー（46期は2025年11月始まり・10月終わり。以降は1期ずつスライド）
// ============================================================================
const FISCAL_BASE_PERIOD = 46;
const FISCAL_BASE_START_CAL_YEAR = 2025; // 46期の開始暦年（2025年11月に開始）
const RETENTION_PERIOD_COUNT = 4;        // 保存対象：直近4半期（＝過去2年）

/**
 * "YYYYMMDD" 形式の対象年月日から、その日付が属する会計期・上期/下期を算出する。
 * @return {{periodNumber:number, half:'first_half'|'second_half'}|null}
 */
function getFiscalPeriodInfo_(yyyymmdd) {
  const s = String(yyyymmdd || '');
  if (s.length < 6) return null;
  const y = parseInt(s.substring(0, 4), 10);
  const m = parseInt(s.substring(4, 6), 10);
  if (!y || !m) return null;
  const fiscalStartCalYear = (m >= 11) ? y : y - 1;
  const periodNumber = FISCAL_BASE_PERIOD + (fiscalStartCalYear - FISCAL_BASE_START_CAL_YEAR);
  const half = (m >= 11 || m <= 4) ? 'first_half' : 'second_half';
  return { periodNumber: periodNumber, half: half };
}

function periodKey_(periodNumber, half) {
  return periodNumber + '_' + half;
}
function periodLabel_(periodNumber, half) {
  return periodNumber + '期' + (half === 'first_half' ? '上期' : '下期');
}

/**
 * 指定日時点（省略時は現在時刻）を基準に、直近 RETENTION_PERIOD_COUNT 半期分
 * （＝過去2年）の期を古い順に並べて返す。個人別サマリのタブ一覧・データ保存期間の
 * 両方で同じ「直近2年」の定義を共有するための唯一の基準関数。
 */
function getRecentPeriods_(referenceDate) {
  const now = referenceDate || new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  let p = FISCAL_BASE_PERIOD + (((m >= 11) ? y : y - 1) - FISCAL_BASE_START_CAL_YEAR);
  let h = (m >= 11 || m <= 4) ? 'first_half' : 'second_half';

  const seq = [];
  for (let i = 0; i < RETENTION_PERIOD_COUNT; i++) {
    seq.push({ periodNumber: p, half: h, key: periodKey_(p, h), label: periodLabel_(p, h) });
    if (h === 'second_half') { h = 'first_half'; } else { h = 'second_half'; p = p - 1; }
  }
  seq.reverse(); // 古い→新しい順
  return seq;
}

/**
 * フロントエンドから呼び出す、個人別サマリのタブに表示する直近2年分の期一覧API。
 */
function getAvailablePeriods() {
  try {
    return { success: true, periods: getRecentPeriods_() };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 保存対象期間（直近2年）の開始日を "YYYYMMDD" で返す。この日付より前の対象年月日は
 * リセールリスト・個人別サマリのいずれからも対象外とする。
 */
function getRetentionCutoffDate_() {
  const oldest = getRecentPeriods_()[0];
  const fiscalStartCalYear = FISCAL_BASE_START_CAL_YEAR + (oldest.periodNumber - FISCAL_BASE_PERIOD);
  return fiscalStartCalYear + '1101'; // その期の開始日（11月1日）
}

/**
 * ③ 全店舗シートの生データを統合・クリーニングして返す（ダッシュボードの主データソース）。
 * 直近2年（＝保存期間）より前の対象年月日の行は除外する。
 */
function getDashboardData() {
  try {
    const ctx = getCurrentUserContext_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let shopList = getShopList_();
    if (!ctx.canViewAllStores && ctx.officeCode) {
      shopList = shopList.filter(function (s) { return s.code === ctx.officeCode; });
    }
    const result = [];
    const errorTokens = ['#NUM!', '#REF!', '#N/A', '#VALUE!', '#DIV/0!', '#NAME?', '#NULL!', '#ERROR!'];
    const lastCol = HEADERS_27.length;
    const cutoffDate = getRetentionCutoffDate_();

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

        // 保存期間（直近2年）より前のデータは対象外
        const targetDate = String(row[4] || ''); // 対象年月日（5列目）
        if (targetDate && targetDate < cutoffDate) continue;

        const obj = {};
        for (let c = 0; c < lastCol; c++) {
          obj[HEADERS_27[c]] = serializeCellValue_(row[c]);
        }
        obj.__sheetName = shop.name;
        obj.__rowIndex = i + 2; // スプレッドシート上の物理行番号（2行目スタート）

        result.push(obj);
      }
    });

    return { success: true, data: result, count: result.length, userContext: ctx };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 統計値（未成約数／リセール数／リセール中／成約件数／PAX数）を1行分のデータからバケットへ加算する。
 * ・未成約数：このバケットに属する全行数（＝分母。リセール継続率＝リセール数÷未成約数の算出に使用）
 * ・リセール数：リセール列が「〇」の行数（＝リセールアクション数）
 */
function accumulateEmployeeStats_(bucket, resale, sts, pax) {
  bucket['未成約数'] += 1;
  if (resale === '〇') bucket['リセール数'] += 1;
  if (sts === 'リセール中') bucket['リセール中'] += 1;
  if (sts === '成約') {
    bucket['成約件数'] += 1;
    bucket['PAX数'] += Number(pax) || 0;
  }
}

/**
 * ④ 個人別サマリを店舗データ＋スタッフマスタから動的に集計して返す。
 * 表示可能な期は直近2年（4半期）に限定される（getAvailablePeriods() 参照）。
 * 各社員の集計値は選択された期（1半期）のみを対象にしたシンプルな値（月次内訳なし）で返す。
 * @param {string} periodKey "46_first_half" のような "<期番号>_first_half|second_half" 形式
 */
function getEmployeeSummary(periodKey) {
  try {
    const ctx = getCurrentUserContext_();

    const recentPeriods = getRecentPeriods_();
    const target = recentPeriods.filter(function (p) { return p.key === periodKey; })[0]
      || recentPeriods[recentPeriods.length - 1]; // 不正・未指定の場合は最新期にフォールバック

    let shopList = getShopList_();
    if (!ctx.canViewAllStores && ctx.officeCode) {
      shopList = shopList.filter(function (s) { return s.code === ctx.officeCode; });
    }
    const shopNameByCode = {};
    shopList.forEach(function (s) { shopNameByCode[s.code] = s.name; });

    const employeesByKey = {};
    const order = [];

    const ensureEmployee = function (officeCode, empNo, empName) {
      const key = String(empNo) + '_' + String(empName);
      if (!employeesByKey[key]) {
        employeesByKey[key] = {
          officeCode: officeCode,
          officeName: shopNameByCode[officeCode] || officeCode,
          employeeNo: empNo,
          employeeName: empName,
          stats: { '未成約数': 0, 'リセール数': 0, 'リセール中': 0, '成約件数': 0, 'PAX数': 0 }
        };
        order.push(key);
      }
      return employeesByKey[key];
    };

    // スタッフマスタ登録分は、実績が無くても一覧に表示されるよう先に確保しておく
    // （一般スタッフは自店舗のスタッフのみに絞り込む）
    getStaffMasterRows_().forEach(function (s) {
      if (!s.active) return;
      if (!ctx.canViewAllStores && ctx.officeCode && s.officeCode !== ctx.officeCode) return;
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
        const targetDate = String(row[4] || ''); // 対象年月日（実際の年を含む。会計期の判定に使用）
        const empNo = row[6];
        const empName = row[7];
        if ((empNo === '' || empNo === null) && (empName === '' || empName === null)) return;

        const info = getFiscalPeriodInfo_(targetDate);
        if (!info || info.periodNumber !== target.periodNumber || info.half !== target.half) return;

        const emp = ensureEmployee(shop.code, empNo, empName);
        accumulateEmployeeStats_(emp.stats, resale, sts, pax);
      });
    });

    const employees = order.map(function (key) { return employeesByKey[key]; });

    return { success: true, period: { key: target.key, label: target.label }, availablePeriods: recentPeriods, employees: employees, userContext: ctx };
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
 * 営業日報から抽出したCSVを一括投入する（マスタ管理者のみ実行可能）。
 * ・CSVはメタ情報の行が先頭に含まれていても構わない（先頭セルが「対象年月日」の行をヘッダー行として自動検出）。
 * ・実際の営業日報CSVは以下の33列を含むが、ヘッダー名で参照するため列の並び順やCSV側の
 *   追加列（未成約理由(小)・方面・国名・都市名・エージェント・出発日・キャリア・ホテル・
 *   媒体カテゴリ名・媒体名・旅行目的(大)・大学名・企業名・本部コード・本部名・エリアコード・
 *   エリア名・営業所名・班コード・班名など）があっても影響を受けない。
 *   このシステムが実際に取り込むのは次の12列のみ：
 *     対象年月日・営業所コード・社員番号・社員名・未成約理由(大)・都市コード・種別・
 *     出発年月・旅行目的(小)・接客方法・HIS利用歴・詳細
 *   （「予約番号」はCSVからは取り込まず、成約時に「新規相談登録」画面等から手入力する運用）
 * ・「営業所コード」列の値から投入先の店舗シートを判定する。未登録の営業所コードは
 *   仮の店舗名で店舗マスタへ自動登録される（店舗・スタッフの登録は基本CSVインポートから行う運用のため）。
 * ・社員番号＋社員名の組み合わせがスタッフマスタに無い場合も、一般権限で自動登録する。
 * ・重複判定キー（対象年月日＋営業所コード＋社員番号＋都市コード＋出発年月）が完全一致する行は、
 *   シート内の既存データ・および今回の取り込みバッチ内の両方に対してスキップする。
 * ・「対象年月日」から「月」列を自動導出し、リセール／STS／予約番号等の管理列は空欄（未対応）として投入する。
 * @param {string} csvText CSVファイルの中身（テキスト）
 */
function importUncontractedCsv(csvText) {
  try {
    const ctx = getCurrentUserContext_();
    if (!ctx.canImportCsv) {
      throw new Error('CSVインポートはマスタ管理権限を持つユーザーのみ実行できます。');
    }

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

    // スタッフマスタの既存キー（社員番号_社員名）を先に読み込んでおく（自動登録の重複防止）
    const staffMasterKeys = {};
    getStaffMasterRows_().forEach(function (s) {
      staffMasterKeys[String(s.employeeNo) + '_' + String(s.employeeName)] = true;
    });
    const staffMasterSheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
    const newStaffRows = []; // スタッフマスタへ追記する行（[営業所コード, 社員番号, 社員名, '', '一般', true]）
    let autoRegisteredStaffCount = 0;

    const autoRegisteredShopCodes = [];

    const getVal = function (row, header) {
      const idx = colIndex[header];
      if (idx === undefined || idx >= row.length) return '';
      const v = row[idx];
      return v === undefined || v === null ? '' : String(v).trim();
    };

    const rowsBySheet = {}; // sheetName -> 27列配列の配列
    let skippedDuplicateCount = 0;
    let skippedBlankCount = 0;

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(function (c) { return String(c).trim() === ''; })) continue;

      const targetDate = getVal(row, '対象年月日');
      const officeCode = getVal(row, '営業所コード');

      if (!targetDate || !officeCode) {
        skippedBlankCount++;
        continue;
      }

      // 未登録の営業所コードは、仮の店舗名で店舗マスタへ自動登録する
      // （店舗・スタッフの登録は基本CSVインポートから読み取る運用のため）
      let sheetName = officeCodeToSheetName[officeCode];
      if (!sheetName) {
        sheetName = autoRegisterShop_(ss, officeCode);
        officeCodeToSheetName[officeCode] = sheetName;
        autoRegisteredShopCodes.push(officeCode);
      }

      const empNo = getVal(row, '社員番号');
      const empName = getVal(row, '社員名');
      if (empName || empNo) {
        const staffKey = String(empNo) + '_' + String(empName);
        if (!staffMasterKeys[staffKey]) {
          staffMasterKeys[staffKey] = true;
          newStaffRows.push([officeCode, empNo, empName, '', ROLE_GENERAL, true]);
          autoRegisteredStaffCount++;
        }
      }

      const monthCode = targetDate.length >= 6 ? targetDate.substring(4, 6) : '';

      const newRow = [];
      newRow[0] = '';                              // リセール（未対応）
      newRow[1] = '';                              // STS（未対応）
      newRow[2] = '';                              // 成約PAX
      newRow[3] = monthCode;                        // 月（対象年月日から自動導出）
      newRow[4] = targetDate;                       // 対象年月日
      newRow[5] = officeCode;                       // 営業所コード
      newRow[6] = empNo;
      newRow[7] = empName;
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
      newRow[20] = '';                              // 最終アクション日
      newRow[21] = '';                              // 対応状況
      newRow[22] = '';                              // 予約番号（CSV対象外。成約時に手入力する運用）
      newRow[23] = '';                              // 次回ACT・進捗★手入力（進捗メモ）
      newRow[24] = '';                              // 相談予約No☆自動反映
      newRow[25] = '';                              // 名前☆自動反映
      newRow[26] = '';                              // 連絡先☆自動反映

      if (!rowsBySheet[sheetName]) rowsBySheet[sheetName] = [];
      rowsBySheet[sheetName].push(newRow);
    }

    if (newStaffRows.length > 0 && staffMasterSheet) {
      staffMasterSheet.getRange(staffMasterSheet.getLastRow() + 1, 1, newStaffRows.length, 6).setValues(newStaffRows);
    }

    // 重複判定キー：対象年月日＋営業所コード＋社員番号＋都市コード＋出発年月
    const buildKey = function (row) {
      return [row[4], row[5], row[6], row[9], row[11]].join('｜');
    };

    Object.keys(rowsBySheet).forEach(function (sheetName) {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
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
      skippedBlankCount: skippedBlankCount,
      autoRegisteredShopCodes: autoRegisteredShopCodes,
      autoRegisteredStaffCount: autoRegisteredStaffCount,
      perSheetCounts: perSheetCounts
    };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * 未登録の営業所コードを、仮の店舗名で店舗マスタへ自動登録する（CSVインポート専用の内部ヘルパー）。
 * 店番のみ分かって正式な店舗名が分からない状態のため、マスタ管理者が後から
 * 「店舗・スタッフ管理」画面で正式名称にリネームできるよう、識別しやすい仮名称を付与する。
 * @return {string} 作成された店舗のシート名（＝仮の店舗名）
 */
function autoRegisterShop_(ss, officeCode) {
  const placeholderName = '未設定(' + officeCode + ')';
  const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
  if (masterSheet) {
    masterSheet.appendRow([officeCode, placeholderName, true]);
  }
  createShopSheets_(ss, [{ code: officeCode, name: placeholderName }], HEADERS_27);
  appendShopRowToSummary_(ss, { code: officeCode, name: placeholderName });
  return placeholderName;
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

    // アラート判定の基準日として、ステータス変更のたびに「最終アクション日」（21列目）を今日の日付で更新する
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    sheet.getRange(rIdx, 21).setValue(todayStr);

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

// ---- リセールリストでスタッフが編集できる列（それ以外はCSV由来の読み取り専用） ---
// 「リセール」「STS」は専用API（updateStatus）で更新するため、ここには含めない。
const EDITABLE_COLUMNS = ['成約PAX', 'ACT日', 'ACT内容', '次回ACT・進捗★手入力'];

/**
 * データグリッドのテキストセル（成約PAX／ACT日／ACT内容／進捗メモ）の
 * ダブルクリック→インライン編集での即時同期保存に対応する汎用セル更新API。
 * 未成約理由・都市コード・詳細等、営業日報CSVから取り込む列はここでは更新できない
 * （EDITABLE_COLUMNS に無い列名を指定するとエラーになる）。
 * @param {string} sheetName 対象店舗シート名
 * @param {number} rowIndex シート上の物理行番号（整数）
 * @param {string} columnName HEADERS_27 に含まれる列名（EDITABLE_COLUMNSのいずれかのみ）
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

    if (EDITABLE_COLUMNS.indexOf(columnName) === -1) {
      throw new Error('この列はスタッフによる編集ができません（CSV由来の読み取り専用列です）: ' + columnName);
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

    // アラート判定の基準日として、セル編集のたびに「最終アクション日」（21列目）を今日の日付で更新する
    // （最終アクション日そのものを手動編集した場合は、その値を尊重してここでは上書きしない）
    if (colIdx + 1 !== 21) {
      const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      sheet.getRange(rIdx, 21).setValue(todayStr);
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

// ============================================================================
// 店舗マスタ管理（「店舗・スタッフ管理」タブ）
// ============================================================================

/**
 * マスタ管理権限が無い場合はエラーを投げる（店舗・スタッフ管理系API共通のガード）。
 */
function assertCanManageMaster_() {
  if (!getCurrentUserContext_().canManageMaster) {
    throw new Error('店舗・スタッフマスタの管理はマスタ管理権限を持つユーザーのみ実行できます。');
  }
}

/**
 * 店舗マスタの全件（有効・無効を問わず）を返す。マスタ管理者のみ利用可能。
 */
function getShopMasterList() {
  try {
    assertCanManageMaster_();
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
    assertCanManageMaster_();
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
    assertCanManageMaster_();
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
    assertCanManageMaster_();
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
    assertCanManageMaster_();
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

  const MONTH_CODES_FULL = ['11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
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
 * マスタ管理者のみ利用可能。
 */
function getStaffMasterList() {
  try {
    assertCanManageMaster_();
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
          googleAccount: s.googleAccount,
          role: s.role,
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
 * スタッフマスタへ新しいスタッフを1件追加する（実績の有無に関わらず事前登録できる）。マスタ管理者のみ利用可能。
 * @param {string} googleAccount ログイン権限判定に使うGoogleアカウント（gmail等）。管理者・マスタ管理は必須。
 * @param {string} role 権限レベル（'一般' | '管理者' | 'マスタ管理'）。
 */
function addStaffMaster(officeCode, employeeNo, employeeName, googleAccount, role) {
  try {
    assertCanManageMaster_();
    officeCode = String(officeCode || '').trim();
    employeeName = String(employeeName || '').trim();
    googleAccount = String(googleAccount || '').trim();
    role = normalizeRole_(role);
    if (!officeCode || !employeeName) {
      throw new Error('所属店舗と社員名は必須です。');
    }
    if (role !== ROLE_GENERAL && !googleAccount) {
      throw new Error('管理者・マスタ管理権限を付与する場合、Googleアカウントの登録が必須です。');
    }

    const shopList = getShopList_();
    if (!shopList.some(function (s) { return s.code === officeCode; })) {
      throw new Error('不正な店舗（営業所コード）です: ' + officeCode);
    }

    const existing = getStaffMasterRows_();
    if (existing.some(function (s) { return String(s.employeeNo) === String(employeeNo) && s.employeeName === employeeName; })) {
      throw new Error('同じ社員番号・社員名のスタッフが既に登録されています。');
    }
    if (googleAccount && existing.some(function (s) { return s.googleAccount && s.googleAccount.toLowerCase() === googleAccount.toLowerCase(); })) {
      throw new Error('同じGoogleアカウントが既に別のスタッフに登録されています。');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
    if (!sheet) {
      throw new Error('「スタッフマスタ」シートが見つかりません。InitSheet.gs の setupAllSheets() を実行してください。');
    }
    sheet.appendRow([officeCode, employeeNo === undefined || employeeNo === null ? '' : employeeNo, employeeName, googleAccount, role, true]);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * スタッフマスタの既存行を更新する（rowIndexで対象行を特定）。マスタ管理者のみ利用可能。
 */
function updateStaffMaster(rowIndex, officeCode, employeeNo, employeeName, googleAccount, role) {
  try {
    assertCanManageMaster_();
    const rIdx = parseInt(rowIndex, 10);
    if (isNaN(rIdx) || rIdx < 2) {
      throw new Error('不正な行番号です: ' + rowIndex);
    }
    officeCode = String(officeCode || '').trim();
    employeeName = String(employeeName || '').trim();
    googleAccount = String(googleAccount || '').trim();
    role = normalizeRole_(role);
    if (!officeCode || !employeeName) {
      throw new Error('所属店舗と社員名は必須です。');
    }
    if (role !== ROLE_GENERAL && !googleAccount) {
      throw new Error('管理者・マスタ管理権限を付与する場合、Googleアカウントの登録が必須です。');
    }

    const shopList = getShopList_();
    if (!shopList.some(function (s) { return s.code === officeCode; })) {
      throw new Error('不正な店舗（営業所コード）です: ' + officeCode);
    }

    const existing = getStaffMasterRows_();
    if (googleAccount && existing.some(function (s) { return s.rowIndex !== rIdx && s.googleAccount && s.googleAccount.toLowerCase() === googleAccount.toLowerCase(); })) {
      throw new Error('同じGoogleアカウントが既に別のスタッフに登録されています。');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
    if (!sheet) {
      throw new Error('「スタッフマスタ」シートが見つかりません。');
    }
    sheet.getRange(rIdx, 1, 1, 5).setValues([[officeCode, employeeNo === undefined || employeeNo === null ? '' : employeeNo, employeeName, googleAccount, role]]);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message + '\n' + err.stack };
  }
}

/**
 * スタッフマスタの行を削除する（過去の実績データ自体は削除されない）。マスタ管理者のみ利用可能。
 */
function deleteStaffMaster(rowIndex) {
  try {
    assertCanManageMaster_();
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
