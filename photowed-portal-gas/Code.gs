// =====================================================
// ★PhotoWED 統合ポータル：全支店横断WEBアプリ版 (Code.gs)
// ROW支店専用スクリプト(ROW_fixed.gs)を、世界中の支店へコード改修なしで横展開できる
// 「1つのWebアプリ + 支店マスタ」構成に再設計したもの。
//
// 設計方針：
//  ・支店ごとにスクリプトをコピーしない。ロジックは1本のスクリプトに集約する。
//  ・支店固有の情報（支店名／国／都市／ログインコード／通知先メール／案件番号プレフィックス）は
//    コードに書かず「支店マスタ」シートで管理する。支店を増やす時はマスタに1行追加するだけ。
//  ・日本側は「関東手配課」「関西手配課」の2アカウントに分離。どちらでログインしても
//    全支店を横断閲覧・操作でき、チェックボックスで表示範囲（全国／関東／関西／支店ごと）を絞り込める。
//  ・支店ユーザーは自分の支店のデータのみ閲覧・操作可能。
//  ・プラン・オプションは支店ごとに異なるため「プランマスタ／オプションマスタ」で支店別に管理する。
// =====================================================

// --- このWebアプリが使うスプレッドシートのID ---
const SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE';

// --- シート名 ---
const BRANCH_MASTER_SHEET_NAME = '支店マスタ';
const PLAN_MASTER_SHEET_NAME = 'プランマスタ';
const OPTION_MASTER_SHEET_NAME = 'オプションマスタ';
const RESERVATION_SHEET_NAME = '予約一覧';
const HISTORY_SHEET_NAME = 'やり取り履歴';
const ARCHIVE_SHEET_NAME = '過去一覧';

// --- システムエラー通知先 ---
const SYSTEM_ALERT_EMAIL = 'it-planning@his-world.com';

// --- ロール ---
const BRANCH_ROLE = 'BRANCH';
const JP_ROLE = 'JP';
// 日本側の手配チーム（固定2チーム。"管轄"列の値と一致させる）
const JP_TEAMS = ['関東', '関西'];

// --- セッション設定 ---
const SESSION_TTL_SEC = 21600; // 6時間（CacheServiceの上限）

// --- ステータスコード（"確定"等の和訳ラベルは使わず、コードそのものを運用する） ---
const STATUS_CODES = ['RQ', 'OK', 'CHK', 'CR', 'FN', 'CW', 'NC', 'UC', 'CF'];
const ALERT_COMPLETED_STATUS = 'FN';
const ALERT_DAYS_BEFORE = 40;

// --- 支店側がSTS(支店側)を編集してよい条件（キー＝対になるSTS(JP側)の現在値） ---
// null = 値の制限なし（STATUS_CODESから自由に選べる）／配列 = その中からのみ選べる／
// キーが存在しない値（OK,CHK,FN,CW,UC,CFなど）のときは支店側は編集不可（ロック）
const BRANCH_EDIT_GATE = {
  'NC': null,
  'RQ': null,
  'CR': ['CW', 'CF']
};
// 請求先（日本の地域区分）
const BILLING_REGIONS = ['北海道', '東北', '関東', '中部', '関西', '中四国', '九州'];

// --- 予約一覧の列定義 ---
const COL_BRANCH_CODE = '支店コード';
const COL_KANRI_NO = '管理番号';
const COL_CHALLENGE_NO = 'CHG NO';
const COL_STATUS_JP = 'STS JP';
const COL_STATUS_BRANCH = 'STS 支店';
const COL_CONFIRMED_DATE = '撮影日FIX';
const COL_CEREMONY_DATE = '挙式日FIX';
const COL_HOPE1 = '希望日①';
const COL_HOPE2 = '希望日②';
const COL_HOPE3 = '希望日③';
const COL_GROOM_NAME = '新郎名（ローマ字）';
const COL_BRIDE_NAME = '新婦名（ローマ字）';
const COL_PLAN = 'プラン名';
const COL_LOCATION = '撮影希望場所';
const COL_PREP = '準備場所';
const COL_HOTEL = 'ホテル';
const COL_AREA = '管轄';
const COL_BILLING_REGION = '請求先';
const COL_JP_SHOP = '日本支店名';
const COL_SHOP = '店舗／担当（現地）';
const COL_REMARKS = '備考';
const COL_MEMO = '共有メモ';
const COL_LAST_UPDATED = '最終更新日';
const COL_DRIVE_URL = 'DriveフォルダURL';

const OPTION_COUNT = 5;
function opNameCol_(n) { return `OP${n}`; }
function opStsJpCol_(n) { return `OP${n} STS JP`; }
function opStsBranchCol_(n) { return `OP${n} STS 支店`; }

const RESERVATION_HEADERS = (() => {
  const base = [
    COL_BRANCH_CODE, COL_KANRI_NO, COL_CHALLENGE_NO, COL_STATUS_JP, COL_STATUS_BRANCH,
    COL_CONFIRMED_DATE, COL_CEREMONY_DATE, COL_HOPE1, COL_HOPE2, COL_HOPE3,
    COL_GROOM_NAME, COL_BRIDE_NAME, COL_PLAN, COL_LOCATION, COL_PREP, COL_HOTEL,
    COL_AREA, COL_BILLING_REGION, COL_JP_SHOP, COL_SHOP, COL_REMARKS, COL_MEMO,
    COL_LAST_UPDATED, COL_DRIVE_URL
  ];
  for (let n = 1; n <= OPTION_COUNT; n++) {
    base.push(opNameCol_(n), opStsJpCol_(n), opStsBranchCol_(n));
  }
  return base;
})();

// STS(JP側)・STS(支店側)・オプション欄は、通常のフィールド更新(apiUpdateField)ではなく
// 専用の決定フロー(apiCommitStatusChanges)でのみ変更できる（②相手への通知を確実に飛ばすため）
const STATUS_COMMIT_FIELDS = (() => {
  const list = [COL_STATUS_JP, COL_STATUS_BRANCH];
  for (let n = 1; n <= OPTION_COUNT; n++) list.push(opNameCol_(n), opStsJpCol_(n), opStsBranchCol_(n));
  return list;
})();

// 支店・JPのどちらも編集してよい運用系フィールド（システム列・ステータス系の列は除く）
const EDITABLE_FIELDS = RESERVATION_HEADERS.filter(h => ![
  COL_BRANCH_CODE, COL_KANRI_NO, COL_LAST_UPDATED, COL_DRIVE_URL, ...STATUS_COMMIT_FIELDS
].includes(h));

// 日付として保存すべきフィールド（<input type="date">で受け渡しし、実Dateとして保存する）
// checkAlerts/archivePastReservations/sortReservationSheet_ は撮影日FIXがDate型であることを前提にしている
const DATE_FIELDS = [COL_CONFIRMED_DATE, COL_CEREMONY_DATE];
// 変更時に自動で履歴ログ＋通知を残す日付フィールド
const AUTO_LOG_DATE_FIELDS = [COL_CONFIRMED_DATE, COL_CEREMONY_DATE];

// --- 支店マスタの列定義 ---
const BM_COL_CODE = '支店コード';
const BM_COL_NAME = '支店名';
const BM_COL_COUNTRY = '国';
const BM_COL_CITY = '都市';
const BM_COL_ROLE = 'ロール';
const BM_COL_TEAM = '手配チーム';               // JPロールのみ使用（関東/関西）
const BM_COL_PASSCODE = 'ログインパスコード';
const BM_COL_EMAIL = '通知先メール';
const BM_COL_PREFIX = '案件番号プレフィックス';  // BRANCHロールのみ使用。支店ごとに一意
const BM_COL_ACTIVE = '有効';
const BRANCH_MASTER_HEADERS = [
  BM_COL_CODE, BM_COL_NAME, BM_COL_COUNTRY, BM_COL_CITY, BM_COL_ROLE, BM_COL_TEAM,
  BM_COL_PASSCODE, BM_COL_EMAIL, BM_COL_PREFIX, BM_COL_ACTIVE
];

// --- プラン／オプションマスタの列定義（支店ごとに管理） ---
const MM_COL_BRANCH = '支店コード';
const MM_COL_NAME = '名称';
const MM_COL_ACTIVE = '有効';
const MASTER_ITEM_HEADERS = [MM_COL_BRANCH, MM_COL_NAME, MM_COL_ACTIVE];

// --- 履歴シートの列定義 ---
const H_COL_ID = '__id';
const H_COL_BRANCH_CODE = '支店コード';
const H_COL_KANRI = '管理番号';
const H_COL_CHALLENGE_NO = 'CHG NO';
const H_COL_CONFIRMED_DATE = '撮影日FIX';
const H_COL_GROOM_NAME = '新郎名（ローマ字）';
const H_COL_BRIDE_NAME = '新婦名（ローマ字）';
const H_COL_DATETIME = '日時';
const H_COL_SENDER = '送信者';
const H_COL_BODY = '内容';
const H_COL_CHECK_JP = 'CHECK JP';
const H_COL_DATE_JP = 'DATE JP';
const H_COL_CHECK_BRANCH = 'CHECK 支店';
const H_COL_DATE_BRANCH = 'DATE 支店';
const HISTORY_HEADERS = [
  H_COL_ID, H_COL_BRANCH_CODE, H_COL_KANRI, H_COL_CHALLENGE_NO, H_COL_CONFIRMED_DATE,
  H_COL_GROOM_NAME, H_COL_BRIDE_NAME, H_COL_DATETIME, H_COL_SENDER, H_COL_BODY,
  H_COL_CHECK_JP, H_COL_DATE_JP, H_COL_CHECK_BRANCH, H_COL_DATE_BRANCH
];

// =====================================================
// ⓪ Webアプリのエントリポイント
// =====================================================
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('PhotoWED 支店ポータル')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =====================================================
// ① 初期セットアップ（初回のみ手動実行）
// =====================================================
function setupPortal() {
  const ss = getSpreadsheet_();

  ensureSheetWithHeaders_(ss, BRANCH_MASTER_SHEET_NAME, BRANCH_MASTER_HEADERS);
  ensureSheetWithHeaders_(ss, PLAN_MASTER_SHEET_NAME, MASTER_ITEM_HEADERS);
  ensureSheetWithHeaders_(ss, OPTION_MASTER_SHEET_NAME, MASTER_ITEM_HEADERS);
  ensureSheetWithHeaders_(ss, RESERVATION_SHEET_NAME, RESERVATION_HEADERS);
  ensureSheetWithHeaders_(ss, HISTORY_SHEET_NAME, HISTORY_HEADERS);
  ensureSheetWithHeaders_(ss, ARCHIVE_SHEET_NAME, RESERVATION_HEADERS);

  const bm = ss.getSheetByName(BRANCH_MASTER_SHEET_NAME);
  if (bm.getLastRow() < 2) {
    const rows = [
      // 支店コード, 支店名, 国, 都市, ロール, 手配チーム, パスコード, 通知先メール, 番号プレフィックス, 有効
      ['KANTO', '関東手配課', '', '', JP_ROLE, '関東', 'CHANGE-ME-KANTO', 'tw-avanti@his-world.com', '', true],
      ['KANSAI', '関西手配課', '', '', JP_ROLE, '関西', 'CHANGE-ME-KANSAI', 'o-avanti@his-world.com', '', true],
      // ローマは既に「R-」採番で運用中のためプレフィックスは変更しない
      ['ROW', 'ローマ支店', 'イタリア', 'ローマ', BRANCH_ROLE, '', 'CHANGE-ME-ROW', 'row-branch@his-world.com', 'R', true],
      ['VIE', 'ウィーン支店', 'オーストリア', 'ウィーン', BRANCH_ROLE, '', 'CHANGE-ME-VIE', 'vienna-branch@his-world.com', 'VIE', true],
      ['AMS', 'アムステルダム支店', 'オランダ', 'アムステルダム', BRANCH_ROLE, '', 'CHANGE-ME-AMS', 'amsterdam-branch@his-world.com', 'AMS', true],
      ['GVA', 'ジュネーブ支店', 'スイス', 'ジュネーブ', BRANCH_ROLE, '', 'CHANGE-ME-GVA', 'geneva-branch@his-world.com', 'GVA', true],
      ['ATH', 'アテネ支店', 'ギリシャ', 'アテネ', BRANCH_ROLE, '', 'CHANGE-ME-ATH', 'athens-branch@his-world.com', 'ATH', true],
      ['IST', 'イスタンブール支店', 'トルコ', 'イスタンブール', BRANCH_ROLE, '', 'CHANGE-ME-IST', 'istanbul-branch@his-world.com', 'IST', true],
      ['DXB', 'ドバイ支店', 'アラブ首長国連邦', 'ドバイ', BRANCH_ROLE, '', 'CHANGE-ME-DXB', 'dubai-branch@his-world.com', 'DXB', true],
      ['CAI', 'カイロ支店', 'エジプト', 'カイロ', BRANCH_ROLE, '', 'CHANGE-ME-CAI', 'cairo-branch@his-world.com', 'CAI', true],
      ['CAS', 'カサブランカ支店', 'モロッコ', 'カサブランカ', BRANCH_ROLE, '', 'CHANGE-ME-CAS', 'casablanca-branch@his-world.com', 'CAS', true],
      ['LON', 'ロンドン支店', 'イギリス', 'ロンドン', BRANCH_ROLE, '', 'CHANGE-ME-LON', 'london-branch@his-world.com', 'LON', true],
      ['FRA', 'フランクフルト支店', 'ドイツ', 'フランクフルト', BRANCH_ROLE, '', 'CHANGE-ME-FRA', 'frankfurt-branch@his-world.com', 'FRA', true],
      ['NBO', 'ナイロビ支店', 'ケニア', 'ナイロビ', BRANCH_ROLE, '', 'CHANGE-ME-NBO', 'nairobi-branch@his-world.com', 'NBO', true],
      ['CUN', 'カンクン支店', 'メキシコ', 'カンクン', BRANCH_ROLE, '', 'CHANGE-ME-CUN', 'cancun-branch@his-world.com', 'CUN', true],
      ['YVR', 'バンクーバー支店', 'カナダ', 'バンクーバー', BRANCH_ROLE, '', 'CHANGE-ME-YVR', 'vancouver-branch@his-world.com', 'YVR', true],
      ['LPB', 'ラパス支店', 'ボリビア', 'ラパス', BRANCH_ROLE, '', 'CHANGE-ME-LPB', 'lapaz-branch@his-world.com', 'LPB', true],
      ['FIJ', 'フィジー支店', 'フィジー', '', BRANCH_ROLE, '', 'CHANGE-ME-FIJ', 'fiji-branch@his-world.com', 'FIJ', true],
      ['AUS', 'オーストラリア支店', 'オーストラリア', '', BRANCH_ROLE, '', 'CHANGE-ME-AUS', 'australia-branch@his-world.com', 'AUS', true],
      ['NZL', 'ニュージーランド支店', 'ニュージーランド', '', BRANCH_ROLE, '', 'CHANGE-ME-NZL', 'newzealand-branch@his-world.com', 'NZL', true],
      ['DPS', 'デンパサール支店', 'インドネシア', 'デンパサール', BRANCH_ROLE, '', 'CHANGE-ME-DPS', 'denpasar-branch@his-world.com', 'DPS', true],
      ['TPE', '台北支店', '台湾', '台北', BRANCH_ROLE, '', 'CHANGE-ME-TPE', 'taipei-branch@his-world.com', 'TPE', true],
      ['SIN', 'シンガポール支店', 'シンガポール', 'シンガポール', BRANCH_ROLE, '', 'CHANGE-ME-SIN', 'singapore-branch@his-world.com', 'SIN', true],
      ['REP', 'シェムリアップ支店', 'カンボジア', 'シェムリアップ', BRANCH_ROLE, '', 'CHANGE-ME-REP', 'siemreap-branch@his-world.com', 'REP', true],
      ['TAS', 'タシケント支店', 'ウズベキスタン', 'タシケント', BRANCH_ROLE, '', 'CHANGE-ME-TAS', 'tashkent-branch@his-world.com', 'TAS', true],
      ['JED', 'ジェッダ支店', 'サウジアラビア', 'ジェッダ', BRANCH_ROLE, '', 'CHANGE-ME-JED', 'jeddah-branch@his-world.com', 'JED', true]
    ];
    bm.getRange(2, 1, rows.length, BRANCH_MASTER_HEADERS.length).setValues(rows);
  }
  formatHeaderRow_(bm);
  formatHeaderRow_(ss.getSheetByName(PLAN_MASTER_SHEET_NAME));
  formatHeaderRow_(ss.getSheetByName(OPTION_MASTER_SHEET_NAME));

  SpreadsheetApp.getUi().alert(
    'セットアップが完了しました。\n\n' +
    '「支店マスタ」シートで各行のログインパスコード・通知先メールを実際の値に書き換えてから、\n' +
    'デプロイ（ウェブアプリとして導入）してください。\n' +
    '支店を追加したいときは「支店マスタ」シートに1行追加するだけでOKです（コード変更不要）。\n' +
    '案件番号プレフィックスは支店ごとに一意である必要があります（ローマ支店は既存運用のため "R" のまま変更しないでください）。'
  );
}

function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function formatHeaderRow_(sheet) {
  if (!sheet) return;
  const range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setBackground('#00bcd4').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function getSpreadsheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'PUT_YOUR_SPREADSHEET_ID_HERE') {
    throw new Error('SPREADSHEET_ID が未設定です。Code.gs 上部に対象スプレッドシートのIDを設定してください。');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// =====================================================
// ② 認証・セッション
// =====================================================
// スプレッドシートのチェックボックス列は実体がboolean(true/false)のことも、
// プレーンテキストで"TRUE"/"FALSE"のこともあるため、両対応で真偽判定する
function isActiveFlag_(val) {
  return val === true || String(val).trim().toUpperCase() === 'TRUE';
}

// ログイン画面のプルダウンに出す一覧（未ログインでも呼べる。パスコード・メール等は含めない）
function apiListLoginOptions() {
  const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
  return getRowsAsObjects_(sheet)
    .filter(r => isActiveFlag_(r[BM_COL_ACTIVE]))
    .map(r => ({
      code: r[BM_COL_CODE],
      name: r[BM_COL_NAME],
      role: String(r[BM_COL_ROLE]).trim().toUpperCase() === JP_ROLE ? JP_ROLE : BRANCH_ROLE
    }));
}

function apiLogin(branchCode, passcode) {
  const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet);

  const match = rows.find(r =>
    String(r[BM_COL_CODE]).trim().toUpperCase() === String(branchCode).trim().toUpperCase() &&
    String(r[BM_COL_PASSCODE]) === String(passcode) &&
    isActiveFlag_(r[BM_COL_ACTIVE])
  );

  if (!match) {
    return { ok: false, error: '支店コードまたはパスコードが違います。' };
  }

  const role = String(match[BM_COL_ROLE]).trim().toUpperCase() === JP_ROLE ? JP_ROLE : BRANCH_ROLE;
  const token = Utilities.getUuid();
  const session = {
    token,
    branchCode: String(match[BM_COL_CODE]).trim().toUpperCase(),
    branchName: match[BM_COL_NAME],
    role,
    team: role === JP_ROLE ? match[BM_COL_TEAM] : ''
  };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(session), SESSION_TTL_SEC);

  return { ok: true, session };
}

function apiLogout(token) {
  CacheService.getScriptCache().remove('sess_' + token);
  return { ok: true };
}

function requireSession_(token) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get('sess_' + token);
  if (!raw) throw new Error('セッションの有効期限が切れました。再度ログインしてください。');
  const session = JSON.parse(raw);
  cache.put('sess_' + token, raw, SESSION_TTL_SEC); // スライディング延長
  return session;
}

function assertJp_(session) {
  if (session.role !== JP_ROLE) throw new Error('この操作は日本手配課（関東／関西）のみ実行できます。');
}

function assertBranchAccess_(session, branchCode) {
  if (session.role === BRANCH_ROLE && session.branchCode !== String(branchCode).trim().toUpperCase()) {
    throw new Error('自分の支店以外のデータは操作できません。');
  }
}

// =====================================================
// ③ 支店マスタ管理（JPのみ）— これが「横展開」の実体
// =====================================================
function apiListBranches(token) {
  const session = requireSession_(token);
  assertJp_(session);
  return listBranchesRaw_();
}

function listBranchesRaw_() {
  const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
  return getRowsAsObjects_(sheet).map(r => ({
    code: r[BM_COL_CODE], name: r[BM_COL_NAME], country: r[BM_COL_COUNTRY], city: r[BM_COL_CITY],
    role: r[BM_COL_ROLE], team: r[BM_COL_TEAM], email: r[BM_COL_EMAIL], prefix: r[BM_COL_PREFIX],
    active: isActiveFlag_(r[BM_COL_ACTIVE])
    // ログインパスコードは一覧APIには返さない（画面表示上の漏洩防止）
  }));
}

function apiSaveBranch(token, branch) {
  const session = requireSession_(token);
  assertJp_(session);
  if (!branch.code || !branch.name) {
    throw new Error('支店コード・支店名は必須です。');
  }
  const role = branch.role === JP_ROLE ? JP_ROLE : BRANCH_ROLE;
  const code = String(branch.code).trim().toUpperCase();
  const prefix = role === BRANCH_ROLE ? (String(branch.prefix || code).trim().toUpperCase()) : '';

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow();
    const codeColIdx = headers.indexOf(BM_COL_CODE);
    const prefixColIdx = headers.indexOf(BM_COL_PREFIX);
    const passcodeColIdx = headers.indexOf(BM_COL_PASSCODE);
    let targetRow = -1;
    let existingPasscode = '';

    if (lastRow > 1) {
      const existing = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      for (let i = 0; i < existing.length; i++) {
        const rowCode = String(existing[i][codeColIdx]).trim().toUpperCase();
        if (rowCode === code) {
          targetRow = i + 2;
          existingPasscode = existing[i][passcodeColIdx];
          continue;
        }
        // 案件番号プレフィックスの重複チェック（支店が増えても番号が破綻しないための必須制約）
        if (role === BRANCH_ROLE && prefix &&
            String(existing[i][prefixColIdx]).trim().toUpperCase() === prefix) {
          throw new Error(`案件番号プレフィックス「${prefix}」は既に「${existing[i][headers.indexOf(BM_COL_NAME)]}」で使用されています。別のプレフィックスにしてください。`);
        }
      }
    }

    // 新規追加時はパスコード必須。既存支店の編集で未入力の場合は現在のパスコードを維持する
    const passcode = String(branch.passcode || '').trim();
    if (targetRow === -1 && !passcode) {
      throw new Error('新規追加の場合はログインパスコードが必須です。');
    }
    const finalPasscode = passcode || existingPasscode;

    const rowData = headers.map(h => {
      switch (h) {
        case BM_COL_CODE: return code;
        case BM_COL_NAME: return branch.name;
        case BM_COL_COUNTRY: return branch.country || '';
        case BM_COL_CITY: return branch.city || '';
        case BM_COL_ROLE: return role;
        case BM_COL_TEAM: return role === JP_ROLE ? (branch.team || '') : '';
        case BM_COL_PASSCODE: return finalPasscode;
        case BM_COL_EMAIL: return branch.email || '';
        case BM_COL_PREFIX: return prefix;
        case BM_COL_ACTIVE: return branch.active !== false;
        default: return '';
      }
    });
    if (targetRow === -1) {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([rowData]);
    } else {
      sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// 有効／無効のみを切り替える軽量API（パスコードを再送する必要がない）
function apiSetBranchActive(token, code, active) {
  const session = requireSession_(token);
  assertJp_(session);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow();
    const codeColIdx = headers.indexOf(BM_COL_CODE);
    const activeColIdx = headers.indexOf(BM_COL_ACTIVE);
    if (lastRow > 1) {
      const codes = sheet.getRange(2, codeColIdx + 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < codes.length; i++) {
        if (String(codes[i][0]).trim().toUpperCase() === String(code).trim().toUpperCase()) {
          sheet.getRange(i + 2, activeColIdx + 1).setValue(!!active);
          return { ok: true };
        }
      }
    }
    throw new Error('対象の支店が見つかりません。');
  } finally {
    lock.releaseLock();
  }
}

// =====================================================
// ④ プラン／オプションマスタ管理（支店ごと。自支店 or JPが操作可能）
// =====================================================
function apiListPlans(token, branchCode) {
  const session = requireSession_(token);
  const target = session.role === BRANCH_ROLE ? session.branchCode : String(branchCode || '').toUpperCase();
  return listMasterItems_(PLAN_MASTER_SHEET_NAME, target);
}
function apiListOptionItems(token, branchCode) {
  const session = requireSession_(token);
  const target = session.role === BRANCH_ROLE ? session.branchCode : String(branchCode || '').toUpperCase();
  return listMasterItems_(OPTION_MASTER_SHEET_NAME, target);
}
function apiSavePlanItem(token, branchCode, name, originalName, active) {
  const session = requireSession_(token);
  assertBranchAccess_(session, branchCode);
  return saveMasterItem_(PLAN_MASTER_SHEET_NAME, branchCode, name, originalName, active);
}
function apiSaveOptionItem(token, branchCode, name, originalName, active) {
  const session = requireSession_(token);
  assertBranchAccess_(session, branchCode);
  return saveMasterItem_(OPTION_MASTER_SHEET_NAME, branchCode, name, originalName, active);
}

function listMasterItems_(sheetName, branchCode) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  return getRowsAsObjects_(sheet)
    .filter(r => String(r[MM_COL_BRANCH]).trim().toUpperCase() === String(branchCode).trim().toUpperCase())
    .map(r => ({ name: r[MM_COL_NAME], active: isActiveFlag_(r[MM_COL_ACTIVE]) }));
}

function saveMasterItem_(sheetName, branchCode, name, originalName, active) {
  if (!name || !String(name).trim()) throw new Error('名称を入力してください。');
  const code = String(branchCode).trim().toUpperCase();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(sheetName);
    const lastRow = sheet.getLastRow();
    let targetRow = -1;
    if (lastRow > 1) {
      const values = sheet.getRange(2, 1, lastRow - 1, MASTER_ITEM_HEADERS.length).getValues();
      const matchName = (originalName || name);
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0]).trim().toUpperCase() === code &&
            String(values[i][1]) === String(matchName)) {
          targetRow = i + 2;
          break;
        }
      }
    }
    const rowData = [code, name, active !== false];
    if (targetRow === -1) {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑤ ダッシュボード（予約一覧の取得：役割・表示範囲に応じてスコープを絞る）
// =====================================================
// scope（JPロールのみ使用）: { showAll: bool, teams: ['関東','関西'の部分集合], branches: [支店コードの部分集合] }
function apiGetDashboard(token, scope) {
  const session = requireSession_(token);
  const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet);
  const branchMeta = branchMetaMap_();

  const scoped = rows.filter(r => rowInScope_(session, scope, r));

  const list = scoped.map(r => ({
    branchCode: r[COL_BRANCH_CODE],
    branchName: (branchMeta[r[COL_BRANCH_CODE]] || {}).name || r[COL_BRANCH_CODE],
    country: (branchMeta[r[COL_BRANCH_CODE]] || {}).country || '',
    city: (branchMeta[r[COL_BRANCH_CODE]] || {}).city || '',
    kanriNo: r[COL_KANRI_NO],
    challengeNo: r[COL_CHALLENGE_NO],
    statusJp: r[COL_STATUS_JP],
    statusBranch: r[COL_STATUS_BRANCH],
    confirmedDate: formatMaybeDate_(r[COL_CONFIRMED_DATE]),
    ceremonyDate: formatMaybeDate_(r[COL_CEREMONY_DATE]),
    groomName: r[COL_GROOM_NAME],
    brideName: r[COL_BRIDE_NAME],
    plan: r[COL_PLAN],
    area: r[COL_AREA],
    lastUpdated: formatMaybeDate_(r[COL_LAST_UPDATED])
  }));

  const result = { ok: true, role: session.role, branchCode: session.branchCode, branchName: session.branchName, team: session.team, reservations: list };
  if (session.role === JP_ROLE) {
    result.branches = listBranchesRaw_().filter(b => b.role === BRANCH_ROLE);
    result.teams = JP_TEAMS;
  }
  return result;
}

function branchMetaMap_() {
  const map = {};
  listBranchesRaw_().forEach(b => { map[b.code] = b; });
  return map;
}

function rowInScope_(session, scope, row) {
  if (session.role === BRANCH_ROLE) {
    return String(row[COL_BRANCH_CODE]).toUpperCase() === session.branchCode;
  }
  // JPロール
  if (!scope || scope.showAll) return true;
  const teams = scope.teams || [];
  const branches = scope.branches || [];
  if (teams.length === 0 && branches.length === 0) return true; // 何も選択されていない場合は全件表示
  const matchesTeam = teams.includes(row[COL_AREA]);
  const matchesBranch = branches.map(b => String(b).toUpperCase()).includes(String(row[COL_BRANCH_CODE]).toUpperCase());
  return matchesTeam || matchesBranch;
}

// =====================================================
// ⑥ 予約詳細
// =====================================================
function apiGetReservationDetail(token, kanriNo) {
  const session = requireSession_(token);
  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  assertRowVisible_(session, headers, rowData);

  const getV = (name) => rowData[headers.indexOf(name)];
  const detail = {};
  headers.forEach((h, i) => {
    detail[h] = DATE_FIELDS.includes(h) ? formatDateForInput_(rowData[i]) : formatMaybeDate_(rowData[i]);
  });
  const meta = branchMetaMap_()[getV(COL_BRANCH_CODE)] || {};
  detail.branchName = meta.name || getV(COL_BRANCH_CODE);
  detail.country = meta.country || '';
  detail.city = meta.city || '';

  const options = [];
  for (let n = 1; n <= OPTION_COUNT; n++) {
    const name = getV(opNameCol_(n));
    options.push({
      n, name: name || '',
      stsJp: getV(opStsJpCol_(n)),
      stsBranch: getV(opStsBranchCol_(n))
    });
  }
  detail.options = options;

  const hSheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
  const hRows = getRowsAsObjects_(hSheet).filter(r => String(r[H_COL_KANRI]) === String(kanriNo));
  // ★要件：メッセージは新しい日付が上（降順）
  hRows.sort((a, b) => new Date(b[H_COL_DATETIME]) - new Date(a[H_COL_DATETIME]));
  detail.history = hRows.map(r => ({
    id: r[H_COL_ID],
    datetime: formatMaybeDate_(r[H_COL_DATETIME]),
    sender: r[H_COL_SENDER],
    body: r[H_COL_BODY],
    checkJp: isActiveFlag_(r[H_COL_CHECK_JP]),
    checkBranch: isActiveFlag_(r[H_COL_CHECK_BRANCH])
  }));

  return { ok: true, role: session.role, detail };
}

function assertRowVisible_(session, headers, rowData) {
  if (session.role === JP_ROLE) return;
  const branchOfRow = String(rowData[headers.indexOf(COL_BRANCH_CODE)]).toUpperCase();
  if (branchOfRow !== session.branchCode) {
    throw new Error('この案件を閲覧・操作する権限がありません。');
  }
}

// 現行の「予約一覧」だけでなく「過去一覧」（アーカイブ済み案件）も横断して探す。
// これにより、アーカイブ後の案件でも検索・詳細閲覧・修正ができる。
function findReservationRow_(kanriNo) {
  const ss = getSpreadsheet_();
  for (const sheetName of [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME]) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const kanriColIdx = headers.indexOf(COL_KANRI_NO);
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][kanriColIdx]) === String(kanriNo)) {
        return { sheet, headers, rowIndex: i + 2, rowData: values[i] };
      }
    }
  }
  return { sheet: null, headers: [], rowIndex: -1, rowData: null };
}

// =====================================================
// ⑦ フィールド更新（ステータス・撮影日・挙式日・ホテル・共有メモ等）
// =====================================================
function apiUpdateField(token, kanriNo, fieldName, value) {
  const session = requireSession_(token);
  if (!EDITABLE_FIELDS.includes(fieldName)) {
    throw new Error(`「${fieldName}」はこの方法では編集できません（ステータス系の項目は「変更を決定して送信」から操作してください）。`);
  }
  if (fieldName === COL_AREA && value && !JP_TEAMS.includes(value)) {
    throw new Error(`管轄は ${JP_TEAMS.join('/')} のいずれかにしてください。`);
  }
  if (fieldName === COL_BILLING_REGION && value && !BILLING_REGIONS.includes(value)) {
    throw new Error(`請求先は ${BILLING_REGIONS.join('/')} のいずれかにしてください。`);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    const isDateField = DATE_FIELDS.includes(fieldName);
    const oldValue = rowData[headers.indexOf(fieldName)];
    const oldDisplay = isDateField ? formatMaybeDate_(oldValue) : oldValue;
    const valueToStore = isDateField ? parseDateFromInput_(value) : value;

    const colIdx = headers.indexOf(fieldName) + 1;
    sheet.getRange(rowIndex, colIdx).setValue(valueToStore);
    sheet.getRange(rowIndex, headers.indexOf(COL_LAST_UPDATED) + 1).setValue(new Date());

    if (fieldName === COL_CONFIRMED_DATE) {
      sortReservationSheet_(sheet);
    }

    // ★要件：日付変更時は自動で履歴に変更ログを残し、双方に通知する
    if (AUTO_LOG_DATE_FIELDS.includes(fieldName)) {
      const newDisplay = formatMaybeDate_(valueToStore) || '未定';
      if (String(oldDisplay || '未定') !== String(newDisplay)) {
        const freshRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
        const msg = `[${fieldName}を変更]\n${oldDisplay || '未定'} → ${newDisplay}`;
        appendHistory_(headers, freshRow, `${session.branchName}（${session.role === JP_ROLE ? session.team + '手配課' : '支店'}）`, msg);
        sendDirectionalMail_(headers, freshRow, 'BOTH', session, msg, `${fieldName}変更`);
      }
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑦-B ステータス変更の決定（STS JP／STS 支店／オプション欄。まとめて1回で相手に通知する）
// =====================================================
// changes: { "STS JP": "RQ", "OP3": "ドローン撮影", "OP3 STS JP": "RQ", ... } のような { フィールド名: 新しい値 } の集合。
// 個々のフィールドをapiUpdateFieldのように即時保存せず、ここでまとめて検証・保存し、
// 「決定して送信」ボタン1回につき履歴ログ1件・通知メール1通にまとめる。
function apiCommitStatusChanges(token, kanriNo, changes) {
  const session = requireSession_(token);
  if (!changes || Object.keys(changes).length === 0) throw new Error('変更内容がありません。');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    const summaryLines = [];
    const writes = [];

    Object.keys(changes).forEach(field => {
      if (!STATUS_COMMIT_FIELDS.includes(field)) {
        throw new Error(`「${field}」はこの方法では変更できません。`);
      }
      const value = changes[field];
      const colIdx = headers.indexOf(field);
      const oldValue = rowData[colIdx] || '';

      if (isJpStatusField_(field)) {
        if (session.role !== JP_ROLE) throw new Error(`「${field}」は日本側のみ変更できます。`);
        if (value && !STATUS_CODES.includes(value)) throw new Error(`STSの値は ${STATUS_CODES.join('/')} のいずれかにしてください。`);
      } else if (isBranchStatusField_(field)) {
        if (session.role !== BRANCH_ROLE) throw new Error(`「${field}」は支店側のみ変更できます。`);
        const pairedField = pairedJpFieldFor_(field);
        const pairedValue = pairedField ? (rowData[headers.indexOf(pairedField)] || '') : '';
        if (!(pairedValue in BRANCH_EDIT_GATE)) {
          throw new Error(`現在の${pairedField}（${pairedValue || '未設定'}）の状態では「${field}」は変更できません。`);
        }
        const allowed = BRANCH_EDIT_GATE[pairedValue];
        if (allowed !== null && value && !allowed.includes(value)) {
          throw new Error(`${pairedField}が${pairedValue}のときは「${field}」は ${allowed.join('/')} のいずれかにしてください。`);
        }
        if (value && !STATUS_CODES.includes(value)) throw new Error(`STSの値は ${STATUS_CODES.join('/')} のいずれかにしてください。`);
      }
      // オプション名(OPn)欄はどちらの役割でも変更可（ステータスではなく単なるラベルのため）

      if (String(oldValue) !== String(value || '')) {
        summaryLines.push(`${field}: ${oldValue || '(未設定)'} → ${value || '(未設定)'}`);
      }
      writes.push({ colIdx: colIdx + 1, value: value || '' });
    });

    if (summaryLines.length === 0) {
      return { ok: true, noChange: true };
    }

    writes.forEach(w => sheet.getRange(rowIndex, w.colIdx).setValue(w.value));
    sheet.getRange(rowIndex, headers.indexOf(COL_LAST_UPDATED) + 1).setValue(new Date());

    const freshRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    const msg = `[ステータス変更]\n${summaryLines.join('\n')}`;
    const direction = session.role === JP_ROLE ? 'JP_TO_BRANCH' : 'BRANCH_TO_JP';
    appendHistory_(headers, freshRow, session.branchName, msg);
    sendDirectionalMail_(headers, freshRow, direction, session, msg, 'ステータス変更');
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function isJpStatusField_(field) {
  return field === COL_STATUS_JP || /^OP\d+ STS JP$/.test(field);
}
function isBranchStatusField_(field) {
  return field === COL_STATUS_BRANCH || /^OP\d+ STS 支店$/.test(field);
}
function pairedJpFieldFor_(field) {
  if (field === COL_STATUS_BRANCH) return COL_STATUS_JP;
  const m = field.match(/^(OP\d+) STS 支店$/);
  return m ? `${m[1]} STS JP` : null;
}

// =====================================================
// ⑧ メッセージ送信（JP⇔支店・双方向。履歴に直接記録する）
// =====================================================
function apiSendMessage(token, kanriNo, message) {
  const session = requireSession_(token);
  if (!message || !String(message).trim()) throw new Error('メッセージが空です。');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    sheet.getRange(rowIndex, headers.indexOf(COL_LAST_UPDATED) + 1).setValue(new Date());
    const freshRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

    const direction = session.role === JP_ROLE ? 'JP_TO_BRANCH' : 'BRANCH_TO_JP';
    const senderLabel = session.role === JP_ROLE ? `${session.branchName}` : session.branchName;
    appendHistory_(headers, freshRow, senderLabel, `[${direction === 'JP_TO_BRANCH' ? '日本→支店' : '支店→日本'}]\n${message}`);
    sendDirectionalMail_(headers, freshRow, direction, session, message, 'メッセージ');
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑨ DriveフォルダURL通知
// =====================================================
function apiSetDriveUrl(token, kanriNo, url) {
  const session = requireSession_(token);
  const trimmed = String(url).trim();
  if (!trimmed.startsWith('http')) throw new Error('有効なURLを入力してください。');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    sheet.getRange(rowIndex, headers.indexOf(COL_DRIVE_URL) + 1).setValue(trimmed);
    sheet.getRange(rowIndex, headers.indexOf(COL_LAST_UPDATED) + 1).setValue(new Date());

    const freshRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    appendHistory_(headers, freshRow, session.branchName, `[DriveフォルダURL更新]\n${trimmed}`);
    sendDirectionalMail_(headers, freshRow, 'BOTH', session, trimmed, 'DriveフォルダURL');
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑩ 新規案件作成（貼り付けテキストからの自動解析）
// =====================================================
function apiCreateReservation(token, branchCode, rawText) {
  const session = requireSession_(token);
  const targetBranch = session.role === JP_ROLE ? String(branchCode).toUpperCase() : session.branchCode;
  if (!targetBranch) throw new Error('支店コードを指定してください。');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newNo = nextKanriNo_(targetBranch);
    const newRowIndex = sheet.getLastRow() + 1;

    const parsed = parseReservationText_(rawText);

    const newRowData = new Array(headers.length).fill('');
    const setV = (name, val) => { const i = headers.indexOf(name); if (i !== -1 && val) newRowData[i] = val; };
    setV(COL_BRANCH_CODE, targetBranch);
    setV(COL_KANRI_NO, newNo);
    setV(COL_LAST_UPDATED, new Date());
    setV(COL_STATUS_JP, 'RQ');
    setV(COL_STATUS_BRANCH, 'NC');
    setV(COL_CHALLENGE_NO, parsed.challengeNo);
    setV(COL_GROOM_NAME, parsed.groomName);
    setV(COL_BRIDE_NAME, parsed.brideName);
    setV(COL_HOPE1, parsed.hopeDates && parsed.hopeDates[0]);
    setV(COL_HOPE2, parsed.hopeDates && parsed.hopeDates[1]);
    setV(COL_HOPE3, parsed.hopeDates && parsed.hopeDates[2]);
    setV(COL_AREA, parsed.area);

    sheet.getRange(newRowIndex, 1, 1, headers.length).setValues([newRowData]);

    const initMsg = parsed.remarks ? `新規手配依頼が追加されました。\n【備考】\n${parsed.remarks}` : '新規手配依頼が追加されました。';
    appendHistory_(headers, newRowData, session.branchName, `[新規案件作成]\n${initMsg}`);
    sendDirectionalMail_(headers, newRowData, 'BRANCH_TO_JP', session, initMsg, '新規案件');

    sortReservationSheet_(sheet);
    return { ok: true, kanriNo: newNo };
  } finally {
    lock.releaseLock();
  }
}

// 支店ごとに独立して連番採番（プレフィックスが将来変わっても、支店コードで数えるので破綻しない）。
// アーカイブ済み（過去一覧）分も含めて最大値を見るため、アーカイブ後に番号が再利用されて衝突することもない。
function nextKanriNo_(branchCode) {
  const prefix = getBranchPrefix_(branchCode);
  let max = 0;
  const ss = getSpreadsheet_();
  [RESERVATION_SHEET_NAME, ARCHIVE_SHEET_NAME].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const branchColIdx = headers.indexOf(COL_BRANCH_CODE);
    const kanriColIdx = headers.indexOf(COL_KANRI_NO);
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    values.forEach(row => {
      if (String(row[branchColIdx]).toUpperCase() !== branchCode) return;
      const m = String(row[kanriColIdx]).match(/-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  });
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

function getBranchPrefix_(branchCode) {
  const meta = branchMetaMap_()[branchCode];
  return (meta && meta.prefix) ? meta.prefix : branchCode;
}

// 手配依頼テキストの解析（元ROWスクリプトのロジックを踏襲・全支店共通で利用）
function parseReservationText_(rawText) {
  let challengeNo = '', groomName = '', brideName = '', area = '';
  let hopeDates = [];

  const splitIndex = rawText.search(/^\s*(備考|ATTN:|＜NBINFO＞|お客様からの質問です|第1希望：)/m);
  const remarksText = splitIndex !== -1 ? rawText.substring(splitIndex).trim() : '';
  const mainText = splitIndex !== -1 ? rawText.substring(0, splitIndex) : rawText;

  const areaMatch = rawText.match(/担当者：\s*(.+)/);
  if (areaMatch) area = areaMatch[1].includes('アバンティ＆オアシス業務チーム') ? '関東' : '関西';

  const chMatch = rawText.match(/([A-Za-z0-9]{11})/);
  challengeNo = chMatch ? chMatch[1] : '';

  const groomMatch = mainText.match(/^\s*01\s+(.*?)(?:\(|$)/m);
  if (groomMatch) groomName = groomMatch[1].trim();
  const brideMatch = mainText.match(/^\s*02\s+(.*?)(?:\(|$)/m);
  if (brideMatch) brideName = brideMatch[1].trim();

  const rqLines = mainText.matchAll(/RQ\s+(\d{2,4}\/\d{1,2}\/\d{1,2})/g);
  for (const m of rqLines) hopeDates.push(m[1]);

  return { challengeNo, groomName, brideName, area, hopeDates, remarks: remarksText };
}

// =====================================================
// ⑪ 履歴の既読チェック
// =====================================================
function apiToggleHistoryCheck(token, historyId, checked) {
  const session = requireSession_(token);
  const isJp = session.role === JP_ROLE;
  const checkCol = isJp ? H_COL_CHECK_JP : H_COL_CHECK_BRANCH;
  const dateCol = isJp ? H_COL_DATE_JP : H_COL_DATE_BRANCH;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow();
    const idColIdx = headers.indexOf(H_COL_ID);
    const ids = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1).getValues();
    let targetRow = -1;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(historyId)) { targetRow = i + 2; break; }
    }
    if (targetRow === -1) throw new Error('対象の履歴が見つかりません。');

    sheet.getRange(targetRow, headers.indexOf(checkCol) + 1).setValue(checked);
    if (checked) {
      const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
      sheet.getRange(targetRow, headers.indexOf(dateCol) + 1).setValue(ts);
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑫ 検索
// =====================================================
// criteria: { kanriNo, challengeNo, name, dateField('shoot'|'ceremony'|'either'),
//             dateFrom, dateTo, country, city, statusJp, statusBranch, scope, includeArchive }
function apiSearchReservations(token, criteria) {
  const session = requireSession_(token);
  criteria = criteria || {};
  const branchMeta = branchMetaMap_();

  const sheetNames = [RESERVATION_SHEET_NAME];
  if (criteria.includeArchive) sheetNames.push(ARCHIVE_SHEET_NAME);

  let results = [];
  sheetNames.forEach(sheetName => {
    const sheet = getSpreadsheet_().getSheetByName(sheetName);
    const rows = getRowsAsObjects_(sheet);
    rows.forEach(r => {
      if (!rowInScope_(session, criteria.scope, r)) return;
      if (!matchesSearch_(r, criteria, branchMeta)) return;
      results.push(toSearchResult_(r, branchMeta, sheetName === ARCHIVE_SHEET_NAME ? '過去一覧' : '予約一覧'));
    });
  });

  results.sort((a, b) => String(a.confirmedDateRaw || '9999').localeCompare(String(b.confirmedDateRaw || '9999')));
  return { ok: true, results };
}

function matchesSearch_(r, c, branchMeta) {
  const norm = (s) => String(s || '').trim().toLowerCase();

  if (c.kanriNo && !norm(r[COL_KANRI_NO]).includes(norm(c.kanriNo))) return false;
  if (c.challengeNo && !norm(r[COL_CHALLENGE_NO]).includes(norm(c.challengeNo))) return false;
  if (c.name) {
    const hay = norm(r[COL_GROOM_NAME]) + ' ' + norm(r[COL_BRIDE_NAME]);
    if (!hay.includes(norm(c.name))) return false;
  }
  const meta = branchMeta[r[COL_BRANCH_CODE]] || {};
  if (c.country && !norm(meta.country).includes(norm(c.country))) return false;
  if (c.city && !norm(meta.city).includes(norm(c.city))) return false;
  if (c.statusJp && r[COL_STATUS_JP] !== c.statusJp) return false;
  if (c.statusBranch && r[COL_STATUS_BRANCH] !== c.statusBranch) return false;

  if (c.dateFrom || c.dateTo) {
    const shoot = toComparableDate_(r[COL_CONFIRMED_DATE]);
    const ceremony = toComparableDate_(r[COL_CEREMONY_DATE]);
    const field = c.dateField || 'either';
    const inRange = (d) => d && (!c.dateFrom || d >= c.dateFrom) && (!c.dateTo || d <= c.dateTo);
    if (field === 'shoot' && !inRange(shoot)) return false;
    if (field === 'ceremony' && !inRange(ceremony)) return false;
    if (field === 'either' && !inRange(shoot) && !inRange(ceremony)) return false;
  }
  return true;
}

function toComparableDate_(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  const m = String(val || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return null;
}

function toSearchResult_(r, branchMeta, source) {
  const meta = branchMeta[r[COL_BRANCH_CODE]] || {};
  return {
    source,
    branchCode: r[COL_BRANCH_CODE],
    branchName: meta.name || r[COL_BRANCH_CODE],
    country: meta.country || '',
    city: meta.city || '',
    kanriNo: r[COL_KANRI_NO],
    challengeNo: r[COL_CHALLENGE_NO],
    groomName: r[COL_GROOM_NAME],
    brideName: r[COL_BRIDE_NAME],
    statusJp: r[COL_STATUS_JP],
    statusBranch: r[COL_STATUS_BRANCH],
    confirmedDate: formatMaybeDate_(r[COL_CONFIRMED_DATE]),
    confirmedDateRaw: toComparableDate_(r[COL_CONFIRMED_DATE]),
    ceremonyDate: formatMaybeDate_(r[COL_CEREMONY_DATE])
  };
}

// =====================================================
// ⑬ 履歴追加・メール送信の共通処理
// =====================================================
function appendHistory_(headers, rowData, sender, body) {
  const h = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
  const getV = (name) => rowData[headers.indexOf(name)];
  const dateVal = getV(COL_CONFIRMED_DATE);
  const dateStr = dateVal instanceof Date
    ? Utilities.formatDate(dateVal, 'Asia/Tokyo', 'yyyy/MM/dd')
    : (dateVal || '未定');

  const row = new Array(HISTORY_HEADERS.length).fill('');
  const set = (name, val) => { row[HISTORY_HEADERS.indexOf(name)] = val; };
  set(H_COL_ID, Utilities.getUuid());
  set(H_COL_BRANCH_CODE, getV(COL_BRANCH_CODE));
  set(H_COL_KANRI, getV(COL_KANRI_NO));
  set(H_COL_CHALLENGE_NO, getV(COL_CHALLENGE_NO));
  set(H_COL_CONFIRMED_DATE, dateStr);
  set(H_COL_GROOM_NAME, getV(COL_GROOM_NAME));
  set(H_COL_BRIDE_NAME, getV(COL_BRIDE_NAME));
  set(H_COL_DATETIME, new Date());
  set(H_COL_SENDER, sender);
  set(H_COL_BODY, body);

  h.appendRow(row);
}

function sendDirectionalMail_(headers, rowData, direction, session, message, kind) {
  const getV = (name) => rowData[headers.indexOf(name)] || '';
  const branchCode = getV(COL_BRANCH_CODE);
  const area = getV(COL_AREA);
  const kanri = getV(COL_KANRI_NO);
  const chgNo = getV(COL_CHALLENGE_NO) || 'No CH';
  const groom = getV(COL_GROOM_NAME);
  const bride = getV(COL_BRIDE_NAME);

  const jpEmail = getJpTeamEmail_(area);
  const branchEmail = getBranchEmail_(branchCode);

  let recipients;
  if (direction === 'JP_TO_BRANCH') recipients = branchEmail;
  else if (direction === 'BRANCH_TO_JP') recipients = jpEmail;
  else recipients = [jpEmail, branchEmail].filter(Boolean).join(',');

  if (!recipients) return;

  const subj = `[PhotoWED][${branchCode}] 【${kanri} ｜ ${chgNo}】${kind}のお知らせ`;
  const body = `${session.branchName} から更新がありました。\n\n` +
               `管理番号: ${kanri}\nChallenge No: ${chgNo}\n新郎: ${groom}\n新婦: ${bride}\n\n` +
               `--- ${kind} ---\n${message}\n\n` +
               `ポータルで確認する: (Webアプリのデプロイ後のURLをここに記載してください)`;

  MailApp.sendEmail(recipients, subj, body);
}

function getBranchEmail_(branchCode) {
  const meta = branchMetaMap_()[branchCode];
  return meta ? meta.email : '';
}

function getJpTeamEmail_(teamLabel) {
  const rows = listBranchesRaw_();
  const found = rows.find(r => r.role === JP_ROLE && r.team === teamLabel);
  if (found) return found.email;
  // "管轄"が未設定・不明な場合は関東手配課へフォールバック
  const fallback = rows.find(r => r.role === JP_ROLE && r.team === '関東');
  return fallback ? fallback.email : SYSTEM_ALERT_EMAIL;
}

// =====================================================
// ⑭ アラート・アーカイブ（全支店横断・支店マスタのメールへ自動振り分け）
// =====================================================
function checkAlerts() {
  const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const targetDateStr = Utilities.formatDate(new Date(Date.now() + ALERT_DAYS_BEFORE * 86400000), 'Asia/Tokyo', 'yyyy/MM/dd');

  const statusCols = [COL_STATUS_JP, COL_STATUS_BRANCH];
  for (let n = 1; n <= OPTION_COUNT; n++) statusCols.push(opStsJpCol_(n), opStsBranchCol_(n));

  data.forEach(row => {
    const dVal = row[headers.indexOf(COL_CONFIRMED_DATE)];
    if (dVal instanceof Date && Utilities.formatDate(dVal, 'Asia/Tokyo', 'yyyy/MM/dd') === targetDateStr) {
      const incomplete = statusCols.filter(c => {
        const v = row[headers.indexOf(c)];
        return v && v !== ALERT_COMPLETED_STATUS;
      });
      if (incomplete.length > 0) {
        const area = row[headers.indexOf(COL_AREA)];
        const recipient = getJpTeamEmail_(area);
        MailApp.sendEmail(recipient, `[要確認] 撮影40日前：${row[headers.indexOf(COL_KANRI_NO)]}（${row[headers.indexOf(COL_BRANCH_CODE)]}支店）`, '未完了ステータスがあります。ポータルをご確認ください。');
      }
    }
  });
}

function archivePastReservations() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(RESERVATION_SHEET_NAME);
  const archive = ss.getSheetByName(ARCHIVE_SHEET_NAME) || ss.insertSheet(ARCHIVE_SHEET_NAME);
  if (sheet.getLastRow() < 2) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');

  const asDateStr = (v) => v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd') : '';

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const shootStr = asDateStr(row[headers.indexOf(COL_CONFIRMED_DATE)]);
    const ceremonyStr = asDateStr(row[headers.indexOf(COL_CEREMONY_DATE)]);
    const stsJp = String(row[headers.indexOf(COL_STATUS_JP)]).trim();
    const stsBranch = String(row[headers.indexOf(COL_STATUS_BRANCH)]).trim();
    const isCW = (stsJp === 'CW' || stsBranch === 'CW');
    // ★要件：ステータスに関わらず、撮影日または挙式日が過ぎたら過去一覧へ移動する
    const isPastDate = (shootStr && shootStr < todayStr) || (ceremonyStr && ceremonyStr < todayStr);
    if (isCW || isPastDate) {
      archive.appendRow(row);
      sheet.deleteRow(i + 2);
    }
  }
}

function sortReservationSheet_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(COL_CONFIRMED_DATE) + 1;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).sort({ column: idx, ascending: true });
}

// =====================================================
// ⑮ ユーティリティ
// =====================================================
function getRowsAsObjects_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function formatMaybeDate_(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy/MM/dd');
  return val;
}

// <input type="date"> はISO形式(yyyy-MM-dd)でしか値を受け付けないため、Dateフィールド専用に変換する
function formatDateForInput_(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  const m = String(val || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return val || '';
}

// <input type="date"> から届くISO形式(yyyy-MM-dd)の文字列を、シートに保存する実Dateへ変換する。
// 空欄（日付クリア）はそのまま空文字として保存する。
function parseDateFromInput_(val) {
  const trimmed = String(val || '').trim();
  if (!trimmed) return '';
  try {
    return Utilities.parseDate(trimmed, 'Asia/Tokyo', 'yyyy-MM-dd');
  } catch (e) {
    return trimmed; // 想定外フォーマットはそのまま文字列で保存（データ消失より安全側）
  }
}

// =====================================================
// ⑯ トリガー設定
// =====================================================
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('archivePastReservations').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('checkAlerts').timeBased().everyDays(1).atHour(8).create();
  SpreadsheetApp.getUi().alert('日次トリガー（アーカイブ・アラート）を再設定しました。');
}
