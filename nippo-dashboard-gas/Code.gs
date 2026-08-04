/**
 * 日報管理システム バックエンド (V8.2)
 *
 * V8.2 での追加機能:
 *   ・MASTERシートの「店舗」行が持つ 地方(C列) / 区分(D列: 一般・AVA等) の
 *     メタ情報を集計し、ダッシュボードの店舗セレクターで「地方ごと」「区分ごと」
 *     にまとめて集計できるようにした（getRawDataForDashboard の storeMeta /
 *     regions / categories、dashboard.html の buildStoreFilterOptions）。
 *
 * V8.1 での追加修正:
 *   ・実際の運用シートには「設定」シートが存在せず、権限情報はMASTERシート内に
 *     「A列:権限 / B列:メール / C列:ADMIN or manager / D列:店舗名」という行で
 *     格納されていた。getRoleConfig() がこの実際の構造を見ておらず、常に空を
 *     返して全員が unknown（閲覧権限なし）になっていたため修正。
 *   ・上記の「権限」行（社員のメールアドレス等）が getMasterData() 経由で
 *     日報入力フォームを開いた全ユーザーに送られてしまっていたため、
 *     フォーム描画に使わないこの行をレスポンスから除外するよう修正。
 *
 * V7 からの変更点（コードレビューで発見した不具合の修正）:
 *   1. [重大/セキュリティ] Session.getActiveUser().getEmail() が空文字を返した
 *      ユーザーを無条件に admin 扱いしていた権限バグを修正（unknown 扱いに変更）。
 *   2. [重大/情報漏えい] ダッシュボードが役割に関わらず全店舗の生データを
 *      ブラウザに送信していた問題を修正。店舗スタッフ／未登録ユーザーには
 *      サーバー側で必要なデータのみに絞ってから返すよう変更。
 *   3. LockService のロック解放を try/finally で保証し、例外発生時に
 *      ロックが解放されないケースを解消。
 *   4. チャレンジNO重複チェックが毎回シート全列を読み込んでいた非効率を解消
 *      （該当列のみ取得するよう変更）。updateRow でも共通化。
 *   5. チャレンジNOのフォーマットをサーバー側でも検証（フロント側のみだと
 *      直接APIを叩かれた場合に不正値が登録できてしまうため）。
 *   6. doGet に page=admin のルーティングが存在せず、admin.html が事実上
 *      表示不可能だった問題を修正。また admin.html から呼ばれているのに
 *      本ファイルに実装が存在しなかった getAdminMenuData / runBuildSummary /
 *      setupMonthlyTrigger を実装（runArchive は現行の年度別シート自動分割
 *      設計と要件が矛盾するため、データを破壊しない安全な説明メッセージを
 *      返すのみに留めています。実装が必要な場合は仕様を確認してください）。
 *
 * ■ トリガー設定（月次メール）
 *   管理者メニュー（?page=admin）の「自動集計トリガーの設定」から実行できます。
 *   手動で設定する場合: GASエディタ → 時計アイコン → トリガーを追加
 *   関数: sendMonthlyReport / イベントのソース: 時間主導型 / タイプ: 月タイマー / 1日 / 午前8〜9時
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const CACHE_KEY_DASHBOARD = 'dashboard_raw_v4';
const CACHE_DURATION = 600;
const CHALLENGE_PATTERN = /^[a-zA-Z0-9]{11}$/;

const DATA_HEADERS = [
  'timestamp','type','method','media','nbDate','staff',
  'challenge','cplTour','guestTour','weddingDate','area',
  'result','agt','venue','plan','reason','historyLink','store'
];
const COL = {
  timestamp: 1, type: 2, method: 3, media: 4, nbDate: 5, staff: 6,
  challenge: 7, cplTour: 8, guestTour: 9, weddingDate: 10, area: 11,
  result: 12, agt: 13, venue: 14, plan: 15, reason: 16, historyLink: 17, store: 18
};

// ==========================================
// シートヘルパー
// ==========================================

function getSheet(name) {
  return SS.getSheetByName(name);
}

function getCurrentYearSheet() {
  const year = new Date().getFullYear();
  const name = 'DATA_' + year;
  let sheet = SS.getSheetByName(name);
  if (!sheet) {
    const base = SS.getSheetByName('DATA');
    if (base) {
      sheet = base.copyTo(SS);
      sheet.setName(name);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    } else {
      sheet = SS.insertSheet(name);
      sheet.appendRow(DATA_HEADERS);
    }
  }
  return sheet;
}

function getPrevYearSheet() {
  const year = new Date().getFullYear() - 1;
  return SS.getSheetByName('DATA_' + year) || SS.getSheetByName('PREV_YEAR');
}

/**
 * チャレンジNOの重複チェック（対象列のみ取得して比較する）
 * excludeRowIndex を指定すると、その行自身は比較対象から除外する。
 */
function isChallengeDuplicate_(sheet, challengeVal, excludeRowIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, COL.challenge, lastRow - 1, 1).getValues();
  return values.some(function(r, i) {
    const rowIndex = i + 2;
    if (excludeRowIndex && rowIndex === excludeRowIndex) return false;
    return String(r[0] || '').trim() === challengeVal;
  });
}

// ==========================================
// 権限設定
// ==========================================

/**
 * 権限情報は独立した「設定」シートではなく、MASTERシートの中に
 *   A列: 権限 / B列: メールアドレス / C列: ADMIN or manager / D列: 店舗名(managerのみ)
 * という行として格納されている（実際の運用シートの構成に合わせている）。
 * ADMIN以外でD列に店舗名がある行はすべて店舗スタッフとして扱う。
 */
function getRoleConfig() {
  const sheet = getSheet('MASTER');
  if (!sheet) return { ADMINS: [], STORE_MAP: {} };
  const data = sheet.getDataRange().getValues();
  const admins = [];
  const storeMap = {};
  data.forEach(function(row) {
    const key = String(row[0] || '').trim();
    if (key !== '権限') return;
    const email = String(row[1] || '').trim().toLowerCase();
    const type  = String(row[2] || '').trim();
    const store = String(row[3] || '').trim();
    if (!email) return;
    if (type === 'ADMIN') {
      admins.push(email);
    } else if (store) {
      storeMap[email] = store;
    }
  });
  return { ADMINS: admins, STORE_MAP: storeMap };
}

function _getUserAuth() {
  const userEmail = Session.getActiveUser().getEmail().toLowerCase();
  const roleConfig = getRoleConfig();
  let role = 'unknown';
  let store = '';
  // 注意: userEmail が空文字になるケース（ドメイン外ユーザー等）を admin 扱いしていた
  // V7 の重大な権限バグを修正。空メールは必ず unknown（権限なし）とする。
  if (userEmail && roleConfig.ADMINS.includes(userEmail)) {
    role = 'admin';
  } else if (userEmail && roleConfig.STORE_MAP[userEmail]) {
    role = 'staff';
    store = roleConfig.STORE_MAP[userEmail];
  }
  return { email: userEmail, role: role, store: store };
}

// ==========================================
// エントリーポイント
// ==========================================

function doGet(e) {
  const page = e.parameter.page;
  if (page === 'dashboard') {
    return HtmlService.createTemplateFromFile('dashboard')
      .evaluate()
      .setTitle('営業ダッシュボード')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }
  if (page === 'admin') {
    return HtmlService.createTemplateFromFile('admin')
      .evaluate()
      .setTitle('管理者メニュー')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('日報入力システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==========================================
// マスターデータ
// ==========================================

function getMasterData() {
  const masterSheet = getSheet('MASTER');
  if (!masterSheet) return { _error: 'MASTERシートが見つかりません。' };
  const data = masterSheet.getDataRange().getValues();
  const master = {};
  data.forEach(function(row) {
    const key    = String(row[0] || '').trim();
    const val    = String(row[1] || '').trim();
    const parent = String(row[2] || '').trim();
    if (!key || !val) return;
    // 「権限」行（社員のメールアドレスや管理者/店舗の割り当て）はフォーム描画に不要な
    // 機密情報のため、日報入力フォームを開いた全ユーザーに送らないよう除外する。
    if (key === '権限') return;
    if (!master[key]) master[key] = [];
    master[key].push({ text: val, parent: parent });
  });
  master._formConfig = getFormConfig();
  return master;
}

function getFormConfig() {
  const sheet = getSheet('フォーム設定');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const config = {};
  data.forEach(function(row) {
    const fieldId  = String(row[0] || '').trim();
    const label    = String(row[1] || '').trim();
    const visible  = String(row[2] || '表示').trim() === '表示';
    const required = String(row[3] || '任意').trim() === '必須';
    if (!fieldId) return;
    config[fieldId] = { label: label, visible: visible, required: required };
  });
  return config;
}

// ==========================================
// 日報送信（重複チェック付き）
// ==========================================

function submitDailyReport(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = getCurrentYearSheet();
    if (!sheet) throw new Error('データシートの取得に失敗しました');

    // チャレンジNOの形式チェック（フロント側のバリデーションを回避されても防御できるように）
    const challengeVal = String(payload.challenge || '').trim();
    if (challengeVal) {
      if (!CHALLENGE_PATTERN.test(challengeVal)) {
        return {
          success: false,
          error: 'チャレンジNOは半角英数字11桁で入力してください。',
          errorType: 'INVALID_CHALLENGE'
        };
      }
      if (isChallengeDuplicate_(sheet, challengeVal, null)) {
        return {
          success: false,
          error: 'チャレンジNO「' + challengeVal + '」はすでに登録されています。',
          errorType: 'DUPLICATE_CHALLENGE'
        };
      }
    }

    const row = DATA_HEADERS.map(function(h) { return payload[h] || ''; });
    row[0] = new Date();
    sheet.appendRow(row);

    CacheService.getScriptCache().remove(CACHE_KEY_DASHBOARD);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 行の編集
// ==========================================

function updateRow(sheetName, rowIndex, payload) {
  try {
    const auth = _getUserAuth();
    if (auth.role === 'unknown') return { success: false, error: '編集権限がありません' };

    const sheet = getSheet(sheetName);
    if (!sheet) throw new Error('シート「' + sheetName + '」が見つかりません');

    // 店舗スタッフは自店舗のみ編集可
    if (auth.role === 'staff') {
      const currentRow = sheet.getRange(rowIndex, 1, 1, DATA_HEADERS.length).getValues()[0];
      if (String(currentRow[COL.store - 1]).trim() !== auth.store) {
        return { success: false, error: '他店舗のデータは編集できません' };
      }
    }

    // チャレンジNO変更時のフォーマット・重複チェック
    const newChallenge = String(payload.challenge || '').trim();
    if (newChallenge) {
      if (!CHALLENGE_PATTERN.test(newChallenge)) {
        return {
          success: false,
          error: 'チャレンジNOは半角英数字11桁で入力してください。',
          errorType: 'INVALID_CHALLENGE'
        };
      }
      if (isChallengeDuplicate_(sheet, newChallenge, rowIndex)) {
        return {
          success: false,
          error: 'チャレンジNO「' + newChallenge + '」は他の行で使用されています',
          errorType: 'DUPLICATE_CHALLENGE'
        };
      }
    }

    // timestamp(A列)は保持、それ以外を上書き
    const originalTimestamp = sheet.getRange(rowIndex, 1).getValue();
    const updatedRow = DATA_HEADERS.map(function(h) {
      if (h === 'timestamp') return originalTimestamp;
      return payload[h] !== undefined ? payload[h] : '';
    });

    sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    CacheService.getScriptCache().remove(CACHE_KEY_DASHBOARD);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// 行の削除
// ==========================================

function deleteRow(sheetName, rowIndex) {
  try {
    // 削除は管理者のみ
    const auth = _getUserAuth();
    if (auth.role !== 'admin') return { success: false, error: '削除は管理者のみ実行できます' };

    const sheet = getSheet(sheetName);
    if (!sheet) throw new Error('シート「' + sheetName + '」が見つかりません');
    if (rowIndex <= 1) throw new Error('ヘッダー行は削除できません');

    sheet.deleteRow(rowIndex);
    CacheService.getScriptCache().remove(CACHE_KEY_DASHBOARD);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// ダッシュボードデータ（キャッシュ付き／役割に応じてサーバー側で絞り込み）
// ==========================================

/**
 * キャッシュされる「生データ」を組み立てる。この結果は店舗を問わず全社共通なので
 * キャッシュしてよいが、そのままクライアントに返してはいけない（店舗スタッフや
 * 権限のないユーザーにも他店舗のデータが見えてしまうため）。
 * 役割に応じた絞り込みは必ず getRawDataForDashboard 側で行うこと。
 */
function _buildDashboardCache() {
  // 今年度データ（行番号・シート名を末尾に付加）
  let currentData = [];
  const currentSheet = getCurrentYearSheet();
  const currentSheetName = currentSheet ? currentSheet.getName() : '';
  if (currentSheet && currentSheet.getLastRow() > 0) {
    currentData = currentSheet.getDataRange().getValues().map(function(row, idx) {
      const converted = row.map(function(cell) {
        return cell instanceof Date ? cell.toISOString() : cell;
      });
      converted.push(idx + 1);           // [18] シート行番号
      converted.push(currentSheetName);  // [19] シート名
      return converted;
    });
  }

  // 前年度データ
  let prevData = [];
  const prevSheet = getPrevYearSheet();
  if (prevSheet && prevSheet.getLastRow() > 0) {
    prevData = prevSheet.getDataRange().getValues().map(function(row) {
      return row.map(function(cell) {
        return cell instanceof Date ? cell.toISOString() : cell;
      });
    });
  }

  // 店舗一覧（MASTERシートの「店舗」行は B列:店舗名 / C列:地方 / D列:区分(一般・AVA等) を持つ。
  // 地方・区分ごとの集計をダッシュボードで選べるように、店舗名だけでなくこのメタ情報も収集する）。
  const stores = [];
  const storeMeta = {};
  const regionSet = {};
  const categorySet = {};
  const masterSheet = getSheet('MASTER');
  if (masterSheet) {
    masterSheet.getDataRange().getValues().forEach(function(row) {
      if (String(row[0]).trim() !== '店舗') return;
      const name = String(row[1] || '').trim();
      if (!name) return;
      const region   = String(row[2] || '').trim();
      const category = String(row[3] || '').trim();
      stores.push(name);
      storeMeta[name] = { region: region, category: category };
      if (region) regionSet[region] = true;
      if (category) categorySet[category] = true;
    });
  }

  return {
    current: currentData,
    prev: prevData,
    availableStores: stores,
    storeMeta: storeMeta,
    regions: Object.keys(regionSet).sort(),
    categories: Object.keys(categorySet).sort(),
    kpiConfig: getKpiConfig()
  };
}

function getRawDataForDashboard() {
  const auth = _getUserAuth();

  // 権限のないユーザーにはデータを一切返さない（V7 では未登録ユーザーでも
  // 全社分の生データがそのままブラウザに送られてしまっていた）。
  if (auth.role === 'unknown') {
    return {
      auth: { email: auth.email, role: 'unknown', store: '', availableStores: [] },
      current: [],
      prev: [],
      kpiConfig: getKpiConfig(),
      storeMeta: {},
      regions: [],
      categories: []
    };
  }

  const cache = CacheService.getScriptCache();
  let cached = null;
  try {
    const raw = cache.get(CACHE_KEY_DASHBOARD);
    if (raw) cached = JSON.parse(raw);
  } catch (e) { /* 破損 → 再取得 */ }

  const full = cached || _buildDashboardCache();
  if (!cached) {
    try { cache.put(CACHE_KEY_DASHBOARD, JSON.stringify(full), CACHE_DURATION); } catch (e) { /* 100KB超 → スキップ */ }
  }

  // ここでユーザーの役割に応じて必要な行だけに絞り込んでから返す。
  const isStaff = auth.role === 'staff';
  const current = isStaff ? full.current.filter(function(r) { return String(r[COL.store - 1]).trim() === auth.store; }) : full.current;
  const prev    = isStaff ? full.prev.filter(function(r) { return String(r[COL.store - 1]).trim() === auth.store; }) : full.prev;

  return {
    auth: { email: auth.email, role: auth.role, store: auth.store, availableStores: full.availableStores },
    current: current,
    prev: prev,
    kpiConfig: full.kpiConfig,
    storeMeta: full.storeMeta,
    regions: full.regions,
    categories: full.categories
  };
}

// ==========================================
// KPI設定
// ==========================================

function getKpiConfig() {
  const defaultConfig = [
    { id: 'total',     label: '総問合せ数 (今月)', order: 1, visible: true, style: 'default' },
    { id: 'contracts', label: '成約数 (今月)',     order: 2, visible: true, style: 'success' },
    { id: 'cvr',       label: '成約率 (CVR)',      order: 3, visible: true, style: 'warning' }
  ];
  const sheet = getSheet('KPI設定');
  if (!sheet) return defaultConfig;
  const data = sheet.getDataRange().getValues();
  const config = [];
  data.forEach(function(row) {
    const id      = String(row[0] || '').trim();
    const label   = String(row[1] || '').trim();
    const order   = parseInt(row[2]) || 99;
    const visible = String(row[3] || '表示').trim() === '表示';
    const style   = String(row[4] || 'default').trim();
    if (!id || !label) return;
    config.push({ id: id, label: label, order: order, visible: visible, style: style });
  });
  if (config.length === 0) return defaultConfig;
  return config.filter(function(k) { return k.visible; })
               .sort(function(a, b) { return a.order - b.order; });
}

// ==========================================
// 月次レポート自動メール送信
// ==========================================

function sendMonthlyReport() {
  const now = new Date();
  const prevMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const targetYear  = prevMonth.getFullYear();
  const targetMonth = prevMonth.getMonth();

  const sheet = getSheet('DATA_' + targetYear) || getSheet('DATA') || getSheet('PREV_YEAR');
  if (!sheet) { Logger.log('sendMonthlyReport: データシートが見つかりません'); return; }

  const allData = sheet.getDataRange().getValues();
  const monthData = allData.filter(function(row, idx) {
    if (idx === 0 || !row[0]) return false;
    const d = new Date(row[0]);
    return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
  });

  if (monthData.length === 0) { Logger.log('sendMonthlyReport: 前月データなし'); return; }

  // 店舗別集計
  const storeStats = {};
  monthData.forEach(function(row) {
    const store = String(row[COL.store - 1] || '不明').trim();
    if (!storeStats[store]) storeStats[store] = { total: 0, newCount: 0, contracts: 0 };
    storeStats[store].total++;
    if (String(row[COL.type - 1]).trim() === '新規') storeStats[store].newCount++;
    if (String(row[COL.result - 1]).trim() === '成約') storeStats[store].contracts++;
  });

  const grandTotal     = monthData.length;
  const grandContracts = monthData.filter(function(r) { return String(r[COL.result - 1]).trim() === '成約'; }).length;
  const grandCvr       = grandTotal > 0 ? ((grandContracts / grandTotal) * 100).toFixed(1) : '0.0';
  const monthLabel     = targetYear + '年' + (targetMonth + 1) + '月';

  let body = monthLabel + ' 月次営業レポート\n';
  body += '=========================================\n\n';
  body += '【全社合計】\n';
  body += '  問合せ数: ' + grandTotal + '件\n';
  body += '  成約数　: ' + grandContracts + '件\n';
  body += '  成約率  : ' + grandCvr + '%\n\n';
  body += '【店舗別内訳】\n';

  Object.keys(storeStats).sort().forEach(function(store) {
    const s = storeStats[store];
    const cvr = s.total > 0 ? ((s.contracts / s.total) * 100).toFixed(1) : '0.0';
    body += '\n  ■ ' + store + '\n';
    body += '    問合せ: ' + s.total + '件（新規: ' + s.newCount + '件）\n';
    body += '    成約　: ' + s.contracts + '件　成約率: ' + cvr + '%\n';
  });

  body += '\n=========================================\n';
  body += '※このメールはGASによる自動送信です。\n';

  const roleConfig = getRoleConfig();
  if (roleConfig.ADMINS.length === 0) { Logger.log('sendMonthlyReport: 送信先ADMINが未設定'); return; }

  const subject = '【自動レポート】' + monthLabel + ' 月次営業実績';
  roleConfig.ADMINS.forEach(function(email) {
    try {
      MailApp.sendEmail({ to: email, subject: subject, body: body });
      Logger.log('送信完了: ' + email);
    } catch (e) {
      Logger.log('送信失敗: ' + email + ' / ' + e.toString());
    }
  });
}

// ==========================================
// 管理者メニュー（admin.html から呼び出される機能）
//
// ※ V7 の admin.html はこれらの関数を呼び出していましたが、本ファイルには
//    実装が存在せず、doGet にも page=admin のルーティングがなかったため、
//    管理者メニュー自体が事実上機能していませんでした。今回、実データを
//    破壊しない範囲で最小限の実装を追加しています。
// ==========================================

const PROP_KEY_SUMMARY_UPDATED = 'SUMMARY_LAST_UPDATED';

function getAdminMenuData() {
  const auth = _getUserAuth();
  if (auth.role !== 'admin') return { success: false, error: '管理者のみアクセスできます' };
  try {
    const dataSheet = getCurrentYearSheet();
    const dataRows = dataSheet ? Math.max(dataSheet.getLastRow() - 1, 0) : 0;
    const summarySheet = getSheet('SUMMARY');
    const summaryRows = summarySheet ? Math.max(summarySheet.getLastRow() - 1, 0) : 0;
    const lastUpdated = PropertiesService.getScriptProperties().getProperty(PROP_KEY_SUMMARY_UPDATED) || '未実行';
    return { success: true, dataRows: dataRows, summaryRows: summaryRows, lastUpdated: lastUpdated };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 今年度データを店舗×月で集計し、SUMMARYシートへ書き出す。
 * 既存データを削除する処理は含まない（安全な集計のみ）。
 */
function runBuildSummary() {
  const auth = _getUserAuth();
  if (auth.role !== 'admin') return { success: false, error: '管理者のみ実行できます' };
  try {
    const sheet = getCurrentYearSheet();
    if (!sheet || sheet.getLastRow() < 2) return { success: false, error: '集計対象のデータがありません' };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, DATA_HEADERS.length).getValues();
    const stats = {};
    data.forEach(function(row) {
      if (!row[COL.timestamp - 1]) return;
      const d = new Date(row[COL.timestamp - 1]);
      if (isNaN(d.getTime())) return;
      const store = String(row[COL.store - 1] || '不明').trim();
      const month = d.getMonth() + 1;
      const key = store + '|' + month;
      if (!stats[key]) stats[key] = { store: store, month: month, total: 0, contracts: 0 };
      stats[key].total++;
      if (String(row[COL.result - 1]).trim() === '成約') stats[key].contracts++;
    });

    let summarySheet = getSheet('SUMMARY');
    if (!summarySheet) summarySheet = SS.insertSheet('SUMMARY');
    summarySheet.clear();

    const header = ['店舗', '月', '問合せ数', '成約数', '成約率(%)'];
    const rows = Object.keys(stats).sort().map(function(key) {
      const s = stats[key];
      const cvr = s.total > 0 ? Math.round((s.contracts / s.total) * 1000) / 10 : 0;
      return [s.store, s.month + '月', s.total, s.contracts, cvr];
    });

    summarySheet.getRange(1, 1, 1, header.length).setValues([header]);
    if (rows.length > 0) summarySheet.getRange(2, 1, rows.length, header.length).setValues(rows);

    PropertiesService.getScriptProperties().setProperty(
      PROP_KEY_SUMMARY_UPDATED,
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * sendMonthlyReport を毎月1日に自動実行するトリガーを設定する（冪等）。
 */
function setupMonthlyTrigger() {
  const auth = _getUserAuth();
  if (auth.role !== 'admin') return { success: false, error: '管理者のみ実行できます' };
  try {
    const already = ScriptApp.getProjectTriggers().some(function(t) {
      return t.getHandlerFunction() === 'sendMonthlyReport';
    });
    if (already) return { success: true, alreadyExists: true };

    ScriptApp.newTrigger('sendMonthlyReport')
      .timeBased()
      .onMonthDay(1)
      .atHour(8)
      .create();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 年度末アーカイブ。
 *
 * ⚠ 未実装（意図的）: このシステムは getCurrentYearSheet() により年度ごとに
 * DATA_2025 / DATA_2026 のように自動でシートが分かれる設計です。admin.html が
 * 想定している「単一のDATAシートから前年度データをPREV_YEARへ移動して削除する」
 * という仕様は、現在のデータ構造と矛盾し、誤って実装すると年度別シートの
 * データを壊す危険があります。そのため安全側に倒し、データを一切変更せず
 * 説明メッセージを返すだけの実装としています。本当に必要な場合は、要件を
 * 確認した上で改めて実装してください。
 */
function runArchive() {
  const auth = _getUserAuth();
  if (auth.role !== 'admin') return { success: false, error: '管理者のみ実行できます' };
  return {
    success: false,
    error: '現在のシステムは年度ごとに自動でシート（DATA_' + new Date().getFullYear() +
      ' 等）が分かれる設計のため、手動でのアーカイブ処理は行っていません。' +
      '過去年度のデータは各 DATA_年 シートをご確認ください。仕様変更が必要な場合は開発担当にご相談ください。'
  };
}
