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
const LOCATION_MASTER_SHEET_NAME = '撮影場所マスタ';
const RESERVATION_SHEET_NAME = '予約一覧';
const HISTORY_SHEET_NAME = 'やり取り履歴';
const ARCHIVE_SHEET_NAME = '過去一覧';
const STATUS_LOG_SHEET_NAME = 'ステータス変更履歴';

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
// ★要件：撮影日の45日前時点でSTSがFNになっていない場合に日本側へアラート
const ALERT_DAYS_BEFORE = 45;
// ★要件：撮影日から何日後までに納品(DriveフォルダURL登録)がないとアラートするか。
// 国（支店）ごとに異なるため支店マスタの「納品期限日数」列で管理し、未設定ならこの値を使う
const DELIVERY_ALERT_DEFAULT_DAYS = 30;

// --- 支店側がSTS(支店側)を編集してよい条件（キー＝対になるSTS(JP側)の現在値） ---
// null = 値の制限なし（STATUS_CODESから自由に選べる）／配列 = その中からのみ選べる／
// キーが存在しない値（OK,FN,CW,UC,CFなど）のときは支店側は編集不可（ロック）
//  - NC/RQ/CHK：日本側からの依頼待ち・確認依頼中の状態。支店側は自由に回答できる
//    （空きがなければ UC＝空きなし、を含めどのコードでも返せる）
//  - CR：日本側が既存予約のキャンセルを依頼した状態。支店側は CW（チャージなしで取消）か
//    CF（キャンセルチャージが発生）のいずれかで回答する
const BRANCH_EDIT_GATE = {
  'NC': null,
  'RQ': null,
  'CHK': null,
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
const COL_INVOICE_NO = '請求番号';   // ラベル名は支店マスタの「請求番号欄名称」で支店ごとに変更可能
const COL_SHOP = '店舗／担当（現地）';
// ★要件：当日の現地運用向け項目（現地記入欄）
const COL_DAY_STAFF = '当日の担当';
const COL_HAIR_MAKEUP = 'ヘアメイク';
const COL_PHOTOGRAPHER = 'カメラマン';
const COL_ASSISTANT = 'アシスタント';
const COL_PICKUP_TIME = '配車時間';
const COL_LOCAL_MEMO = 'メモ（現地用）';
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
    COL_AREA, COL_BILLING_REGION, COL_JP_SHOP, COL_INVOICE_NO, COL_SHOP,
    COL_DAY_STAFF, COL_HAIR_MAKEUP, COL_PHOTOGRAPHER, COL_ASSISTANT, COL_PICKUP_TIME, COL_LOCAL_MEMO,
    COL_REMARKS, COL_MEMO, COL_LAST_UPDATED, COL_DRIVE_URL
  ];
  for (let n = 1; n <= OPTION_COUNT; n++) {
    base.push(opNameCol_(n), opStsJpCol_(n), opStsBranchCol_(n));
  }
  return base;
})();

// STS(JP側)・STS(支店側)・オプション欄は、日本側／支店側のどちらが書けるか・どの値まで選べるかに
// 追加の検証（役割チェック・BRANCH_EDIT_GATE）が必要なフィールド
const STATUS_COMMIT_FIELDS = (() => {
  const list = [COL_STATUS_JP, COL_STATUS_BRANCH];
  for (let n = 1; n <= OPTION_COUNT; n++) list.push(opNameCol_(n), opStsJpCol_(n), opStsBranchCol_(n));
  return list;
})();

// ★要件：既存予約の中の項目は「その場で自動保存」ではなく、まとめて
// （a）保存のみ（通知しない）／（b）メッセージのみ送信／（c）変更内容＋メッセージを送信
// のいずれかを選んで確定する。COMMITTABLE_FIELDS はその対象となる全フィールド
// （システム列・DriveフォルダURLは専用フローがあるため除く）。
const COMMITTABLE_FIELDS = RESERVATION_HEADERS.filter(h => ![
  COL_BRANCH_CODE, COL_KANRI_NO, COL_LAST_UPDATED, COL_DRIVE_URL
].includes(h));

// 日付として保存すべきフィールド（<input type="date">で受け渡しし、実Dateとして保存する）
// checkAlerts/archivePastReservations/sortReservationSheet_ は撮影日FIXがDate型であることを前提にしている
const DATE_FIELDS = [COL_CONFIRMED_DATE, COL_CEREMONY_DATE];

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
const BM_COL_INVOICE_LABEL = '請求番号欄名称';   // BRANCHロールのみ使用。空欄なら「請求番号」を使用（支店が独自名称に変更可）
const BM_COL_DELIVERY_DAYS = '納品期限日数';     // BRANCHロールのみ使用。空欄ならDELIVERY_ALERT_DEFAULT_DAYSを使用
const BM_COL_ACTIVE = '有効';
const BRANCH_MASTER_HEADERS = [
  BM_COL_CODE, BM_COL_NAME, BM_COL_COUNTRY, BM_COL_CITY, BM_COL_ROLE, BM_COL_TEAM,
  BM_COL_PASSCODE, BM_COL_EMAIL, BM_COL_PREFIX, BM_COL_INVOICE_LABEL, BM_COL_DELIVERY_DAYS, BM_COL_ACTIVE
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
const H_COL_SENDER_ROLE = '送信者ロール'; // 'JP' or 'BRANCH'（未読＝要対応の判定に使用）
const H_COL_BODY = '内容';
const H_COL_CHECK_JP = 'CHECK JP';
const H_COL_DATE_JP = 'DATE JP';
const H_COL_CHECKED_BY_JP = 'CHECK JP 氏名';
const H_COL_CHECK_BRANCH = 'CHECK 支店';
const H_COL_DATE_BRANCH = 'DATE 支店';
const H_COL_CHECKED_BY_BRANCH = 'CHECK 支店 氏名';
const HISTORY_HEADERS = [
  H_COL_ID, H_COL_BRANCH_CODE, H_COL_KANRI, H_COL_CHALLENGE_NO, H_COL_CONFIRMED_DATE,
  H_COL_GROOM_NAME, H_COL_BRIDE_NAME, H_COL_DATETIME, H_COL_SENDER, H_COL_SENDER_ROLE, H_COL_BODY,
  H_COL_CHECK_JP, H_COL_DATE_JP, H_COL_CHECKED_BY_JP, H_COL_CHECK_BRANCH, H_COL_DATE_BRANCH, H_COL_CHECKED_BY_BRANCH
];

// --- ステータス変更履歴（STS JP／STS 支店／各OPのSTSを「誰が・いつ・何から何に」変更したかの監査ログ） ---
const SL_COL_KANRI = '管理番号';
const SL_COL_FIELD = 'フィールド';
const SL_COL_OLD = '変更前';
const SL_COL_NEW = '変更後';
const SL_COL_WHO = '変更者';
const SL_COL_WHEN = '日時';
const STATUS_LOG_HEADERS = [SL_COL_KANRI, SL_COL_FIELD, SL_COL_OLD, SL_COL_NEW, SL_COL_WHO, SL_COL_WHEN];

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
  ensureSheetWithHeaders_(ss, LOCATION_MASTER_SHEET_NAME, MASTER_ITEM_HEADERS);
  ensureSheetWithHeaders_(ss, RESERVATION_SHEET_NAME, RESERVATION_HEADERS);
  ensureSheetWithHeaders_(ss, HISTORY_SHEET_NAME, HISTORY_HEADERS);
  ensureSheetWithHeaders_(ss, ARCHIVE_SHEET_NAME, RESERVATION_HEADERS);
  ensureSheetWithHeaders_(ss, STATUS_LOG_SHEET_NAME, STATUS_LOG_HEADERS);

  const bm = ss.getSheetByName(BRANCH_MASTER_SHEET_NAME);
  if (bm.getLastRow() < 2) {
    const rows = [
      // 支店コード, 支店名, 国, 都市, ロール, 手配チーム, パスコード, 通知先メール, 番号プレフィックス, 請求番号欄名称, 納品期限日数, 有効
      ['KANTO', '関東手配課', '', '', JP_ROLE, '関東', 'CHANGE-ME-KANTO', 'tw-avanti@his-world.com', '', '', '', true],
      ['KANSAI', '関西手配課', '', '', JP_ROLE, '関西', 'CHANGE-ME-KANSAI', 'o-avanti@his-world.com', '', '', '', true],
      // ローマは既に「R-」採番で運用中のためプレフィックスは変更しない
      ['ROW', 'ローマ支店', 'イタリア', 'ローマ', BRANCH_ROLE, '', 'CHANGE-ME-ROW', 'row-branch@his-world.com', 'R', '', '', true],
      ['VIE', 'ウィーン支店', 'オーストリア', 'ウィーン', BRANCH_ROLE, '', 'CHANGE-ME-VIE', 'vienna-branch@his-world.com', 'VIE', '', '', true],
      ['AMS', 'アムステルダム支店', 'オランダ', 'アムステルダム', BRANCH_ROLE, '', 'CHANGE-ME-AMS', 'amsterdam-branch@his-world.com', 'AMS', '', '', true],
      ['GVA', 'ジュネーブ支店', 'スイス', 'ジュネーブ', BRANCH_ROLE, '', 'CHANGE-ME-GVA', 'geneva-branch@his-world.com', 'GVA', '', '', true],
      ['ATH', 'アテネ支店', 'ギリシャ', 'アテネ', BRANCH_ROLE, '', 'CHANGE-ME-ATH', 'athens-branch@his-world.com', 'ATH', '', '', true],
      ['IST', 'イスタンブール支店', 'トルコ', 'イスタンブール', BRANCH_ROLE, '', 'CHANGE-ME-IST', 'istanbul-branch@his-world.com', 'IST', '', '', true],
      ['DXB', 'ドバイ支店', 'アラブ首長国連邦', 'ドバイ', BRANCH_ROLE, '', 'CHANGE-ME-DXB', 'dubai-branch@his-world.com', 'DXB', '', '', true],
      ['CAI', 'カイロ支店', 'エジプト', 'カイロ', BRANCH_ROLE, '', 'CHANGE-ME-CAI', 'cairo-branch@his-world.com', 'CAI', '', '', true],
      ['CAS', 'カサブランカ支店', 'モロッコ', 'カサブランカ', BRANCH_ROLE, '', 'CHANGE-ME-CAS', 'casablanca-branch@his-world.com', 'CAS', '', '', true],
      ['LON', 'ロンドン支店', 'イギリス', 'ロンドン', BRANCH_ROLE, '', 'CHANGE-ME-LON', 'london-branch@his-world.com', 'LON', '', '', true],
      ['FRA', 'フランクフルト支店', 'ドイツ', 'フランクフルト', BRANCH_ROLE, '', 'CHANGE-ME-FRA', 'frankfurt-branch@his-world.com', 'FRA', '', '', true],
      ['NBO', 'ナイロビ支店', 'ケニア', 'ナイロビ', BRANCH_ROLE, '', 'CHANGE-ME-NBO', 'nairobi-branch@his-world.com', 'NBO', '', '', true],
      ['CUN', 'カンクン支店', 'メキシコ', 'カンクン', BRANCH_ROLE, '', 'CHANGE-ME-CUN', 'cancun-branch@his-world.com', 'CUN', '', '', true],
      ['YVR', 'バンクーバー支店', 'カナダ', 'バンクーバー', BRANCH_ROLE, '', 'CHANGE-ME-YVR', 'vancouver-branch@his-world.com', 'YVR', '', '', true],
      ['LPB', 'ラパス支店', 'ボリビア', 'ラパス', BRANCH_ROLE, '', 'CHANGE-ME-LPB', 'lapaz-branch@his-world.com', 'LPB', '', '', true],
      ['FIJ', 'フィジー支店', 'フィジー', '', BRANCH_ROLE, '', 'CHANGE-ME-FIJ', 'fiji-branch@his-world.com', 'FIJ', '', '', true],
      ['AUS', 'オーストラリア支店', 'オーストラリア', '', BRANCH_ROLE, '', 'CHANGE-ME-AUS', 'australia-branch@his-world.com', 'AUS', '', '', true],
      ['NZL', 'ニュージーランド支店', 'ニュージーランド', '', BRANCH_ROLE, '', 'CHANGE-ME-NZL', 'newzealand-branch@his-world.com', 'NZL', '', '', true],
      ['DPS', 'デンパサール支店', 'インドネシア', 'デンパサール', BRANCH_ROLE, '', 'CHANGE-ME-DPS', 'denpasar-branch@his-world.com', 'DPS', '', '', true],
      ['TPE', '台北支店', '台湾', '台北', BRANCH_ROLE, '', 'CHANGE-ME-TPE', 'taipei-branch@his-world.com', 'TPE', '', '', true],
      ['SIN', 'シンガポール支店', 'シンガポール', 'シンガポール', BRANCH_ROLE, '', 'CHANGE-ME-SIN', 'singapore-branch@his-world.com', 'SIN', '', '', true],
      ['REP', 'シェムリアップ支店', 'カンボジア', 'シェムリアップ', BRANCH_ROLE, '', 'CHANGE-ME-REP', 'siemreap-branch@his-world.com', 'REP', '', '', true],
      ['TAS', 'タシケント支店', 'ウズベキスタン', 'タシケント', BRANCH_ROLE, '', 'CHANGE-ME-TAS', 'tashkent-branch@his-world.com', 'TAS', '', '', true],
      ['JED', 'ジェッダ支店', 'サウジアラビア', 'ジェッダ', BRANCH_ROLE, '', 'CHANGE-ME-JED', 'jeddah-branch@his-world.com', 'JED', '', '', true]
    ];
    bm.getRange(2, 1, rows.length, BRANCH_MASTER_HEADERS.length).setValues(rows);
  }
  formatHeaderRow_(bm);
  formatHeaderRow_(ss.getSheetByName(PLAN_MASTER_SHEET_NAME));
  formatHeaderRow_(ss.getSheetByName(OPTION_MASTER_SHEET_NAME));
  formatHeaderRow_(ss.getSheetByName(LOCATION_MASTER_SHEET_NAME));

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

// ★要件：メッセージ・変更履歴に個人名を残す。
// 各拠点のGoogleアカウントは「氏名@his-world.com」形式で運用されている前提のため、
// ログイン中のGoogleアカウントのメールアドレスからローカル部（氏名部分）を取り出す。
// Webアプリを「アクセスしたユーザーとして実行」かつ組織内限定で公開している場合のみ取得できる。
// 取得できない場合（デプロイ設定が異なる等）は空文字を返し、呼び出し側は支店名/チーム名にフォールバックする。
function getActiveUserName_() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) return email.split('@')[0];
  } catch (e) {
    // ignore
  }
  return '';
}

// 履歴・メールに使う「送信者ラベル」。個人名が取得できれば「氏名（支店名/チーム名）」、
// 取得できなければ従来どおり支店名/チーム名のみ。
function senderLabel_(session) {
  const personal = getActiveUserName_();
  return personal ? `${personal}（${session.branchName}）` : session.branchName;
}

// ログイン中の実際の担当者名を画面表示用に返す（取得できなければ空文字）
function apiGetCurrentUserName(token) {
  requireSession_(token);
  return { name: getActiveUserName_() };
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
    invoiceLabel: r[BM_COL_INVOICE_LABEL] || '請求番号',
    deliveryDays: Number(r[BM_COL_DELIVERY_DAYS]) || null,
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
// 撮影希望場所：支店ごとのマスター候補一覧（任意入力の補助用。強制の選択式にはしない）
function apiListLocations(token, branchCode) {
  const session = requireSession_(token);
  const target = session.role === BRANCH_ROLE ? session.branchCode : String(branchCode || '').toUpperCase();
  return listMasterItems_(LOCATION_MASTER_SHEET_NAME, target);
}
function apiSaveLocationItem(token, branchCode, name, originalName, active) {
  const session = requireSession_(token);
  assertBranchAccess_(session, branchCode);
  return saveMasterItem_(LOCATION_MASTER_SHEET_NAME, branchCode, name, originalName, active);
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
  const needsActionMap = needsActionMap_(session);

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
    lastUpdated: formatMaybeDate_(r[COL_LAST_UPDATED]),
    // ★要件：相手側からの未読メッセージ／変更がある案件は一目でわかるように
    needsAction: !!needsActionMap[String(r[COL_KANRI_NO])]
  }));

  // ★要件：まず要対応（未読あり）を最優先で上に、その中・その他はそれぞれ撮影日FIXが「今日に近い順」
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  list.sort((a, b) => {
    if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
    return dayDistanceFromToday_(a.confirmedDate, todayStr) - dayDistanceFromToday_(b.confirmedDate, todayStr);
  });

  const result = { ok: true, role: session.role, branchCode: session.branchCode, branchName: session.branchName, team: session.team, reservations: list };
  if (session.role === JP_ROLE) {
    result.branches = listBranchesRaw_().filter(b => b.role === BRANCH_ROLE);
    result.teams = JP_TEAMS;
  }
  return result;
}

// 「自分側からみて未読の、相手側から来たメッセージ・変更」がある管理番号の集合を作る。
// BRANCH側セッション → 送信者ロールがJPで、CHECK 支店が未チェックのものがあれば要対応
// JP側セッション     → 送信者ロールがBRANCHで、CHECK JPが未チェックのものがあれば要対応
function needsActionMap_(session) {
  const hSheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
  const hRows = getRowsAsObjects_(hSheet);
  const map = {};
  const counterpartRole = session.role === BRANCH_ROLE ? JP_ROLE : BRANCH_ROLE;
  const checkCol = session.role === BRANCH_ROLE ? H_COL_CHECK_BRANCH : H_COL_CHECK_JP;
  hRows.forEach(r => {
    if (r[H_COL_SENDER_ROLE] !== counterpartRole) return;
    if (isActiveFlag_(r[checkCol])) return;
    map[String(r[H_COL_KANRI])] = true;
  });
  return map;
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
// ⑤-2 統計ダッシュボード（JPのみ）
// =====================================================
// ★要件：日本側だけの統計タブ。「現在進行中（まだ生きている）」の案件だけを対象に、
// 今月から12ヶ月分を月別に「未対応／RQ／OK／FN」の内訳付きで表示する（直近3ヶ月は大きく、
// 残り9ヶ月は小さく）。その下に国別件数・日本側店舗別件数も表示する。
// 「現在進行中」＝過去一覧（アーカイブ済み）に移っていない、かつ STS(JP側)・STS(支店側)ともに
// CW（キャンセル成立）ではない案件。これとは別に、アーカイブ済みも含めた「累計」件数も返す
// （「あと何件残っているか」が主目的だが、累計もわかるとよい、という要望のため）。
// 関東／関西のチェックで絞り込み可能（ダッシュボードのスコープ選択と同じ仕組みを流用）。
function apiGetStats(token, scope) {
  const session = requireSession_(token);
  assertJp_(session);
  const branchMeta = branchMetaMap_();
  const needsActionMap = needsActionMap_(session);

  const ss = getSpreadsheet_();
  const currentRows = getRowsAsObjects_(ss.getSheetByName(RESERVATION_SHEET_NAME)).filter(r => rowInScope_(session, scope, r));
  const archiveRows = getRowsAsObjects_(ss.getSheetByName(ARCHIVE_SHEET_NAME)).filter(r => rowInScope_(session, scope, r));

  // 「現在進行中」＝予約一覧に載っている、かつキャンセル成立（CW）でないもの
  const liveRows = currentRows.filter(r => r[COL_STATUS_JP] !== 'CW' && r[COL_STATUS_BRANCH] !== 'CW');

  // 1件につき「未対応／RQ／OK／FN」のいずれか1つだけに分類する（合計＝件数になるように排他的に判定）。
  // 優先順位：①相手側からの未読メッセージ・変更があれば「未対応」／②FNで確定していれば「FN」／
  // ③OKまで進んでいれば「OK」／④それ以外（RQ・CHK・CR・NC・UC・CFなど）はまとめて「RQ」
  function bucketOf_(r) {
    if (needsActionMap[String(r[COL_KANRI_NO])]) return 'needsAction';
    if (r[COL_STATUS_JP] === 'FN' || r[COL_STATUS_BRANCH] === 'FN') return 'FN';
    if (r[COL_STATUS_JP] === 'OK' || r[COL_STATUS_BRANCH] === 'OK') return 'OK';
    return 'RQ';
  }
  function emptyBucket_() { return { total: 0, needsAction: 0, rq: 0, ok: 0, fn: 0 }; }
  function addToBucket_(bucket, kind) {
    bucket.total++;
    if (kind === 'needsAction') bucket.needsAction++;
    else if (kind === 'RQ') bucket.rq++;
    else if (kind === 'OK') bucket.ok++;
    else if (kind === 'FN') bucket.fn++;
  }

  // 今月から12ヶ月分の器を先に用意しておく（データが0件の月も表示するため）
  const monthBuckets = {};
  const monthOrder = [];
  const tz = 'Asia/Tokyo';
  const base = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const key = Utilities.formatDate(d, tz, 'yyyy/MM');
    monthOrder.push(key);
    monthBuckets[key] = Object.assign({ key, label: `${d.getMonth() + 1}月` }, emptyBucket_());
  }
  const undated = Object.assign({ label: '撮影日未定' }, emptyBucket_());

  const byCountry = {};
  const byJpShop = {};

  liveRows.forEach(r => {
    const meta = branchMeta[r[COL_BRANCH_CODE]] || {};
    const country = meta.country || r[COL_BRANCH_CODE] || '(不明)';
    byCountry[country] = (byCountry[country] || 0) + 1;

    const jpShop = r[COL_JP_SHOP] || '(未設定)';
    byJpShop[jpShop] = (byJpShop[jpShop] || 0) + 1;

    const dVal = r[COL_CONFIRMED_DATE];
    let monthKey = null;
    if (dVal instanceof Date) {
      monthKey = Utilities.formatDate(dVal, tz, 'yyyy/MM');
    } else {
      const m = String(dVal || '').match(/^(\d{4}\/\d{1,2})\//);
      if (m) monthKey = m[1].replace(/\/(\d)$/, '/0$1');
    }

    const kind = bucketOf_(r);
    if (monthKey && monthBuckets[monthKey]) {
      addToBucket_(monthBuckets[monthKey], kind);
    } else {
      // 今月より前の月、13ヶ月より先、または日付未定はまとめて「撮影日未定／対象期間外」として扱う
      addToBucket_(undated, kind);
    }
  });

  const sortEntriesByCountDesc = (obj) => Object.keys(obj).map(k => ({ key: k, count: obj[k] }))
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    total: liveRows.length, // 現在進行中（生きている）件数
    cumulativeTotal: currentRows.length + archiveRows.length, // 累計（アーカイブ済み・キャンセル済みも含む全期間）
    months: monthOrder.map(k => monthBuckets[k]), // 今月から12ヶ月分（先頭3件が「直近3ヶ月」）
    undated,
    byCountry: sortEntriesByCountDesc(byCountry),
    byJpShop: sortEntriesByCountDesc(byJpShop),
    teams: JP_TEAMS,
    branches: listBranchesRaw_().filter(b => b.role === BRANCH_ROLE)
  };
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
  // ★要件：請求番号の欄名称は支店ごとに変えられる（支店マスタの「請求番号欄名称」、未設定なら「請求番号」）
  detail.invoiceLabel = meta.invoiceLabel || '請求番号';

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
    senderRole: r[H_COL_SENDER_ROLE],
    body: r[H_COL_BODY],
    checkJp: isActiveFlag_(r[H_COL_CHECK_JP]),
    checkedByJp: r[H_COL_CHECKED_BY_JP] || '',
    dateJp: formatMaybeDate_(r[H_COL_DATE_JP]),
    checkBranch: isActiveFlag_(r[H_COL_CHECK_BRANCH]),
    checkedByBranch: r[H_COL_CHECKED_BY_BRANCH] || '',
    dateBranch: formatMaybeDate_(r[H_COL_DATE_BRANCH])
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
// ⑦ 予約フィールドの変更
// =====================================================
// 既存予約内の項目（ステータス・撮影日・ホテル・共有メモ…ほぼ全項目）は、その場で自動保存せず、
// まとめて次の3通りのいずれかで確定する：
//   (a) apiSaveFieldsQuiet   … 保存のみ（履歴・メール通知なし）
//   (b) apiCommitChanges（changes空）… メッセージのみ送信
//   (c) apiCommitChanges（changes＋message）… 変更内容とメッセージをまとめて1回で相手に通知
// changes は { フィールド名: 新しい値 } の集合（例: { "STS JP": "RQ", "OP3": "ドローン撮影" }）。

// (a) 保存のみ：通知（履歴・メール）を発生させずに保存する
function apiSaveFieldsQuiet(token, kanriNo, changes) {
  const session = requireSession_(token);
  if (!changes || Object.keys(changes).length === 0) throw new Error('保存する変更がありません。');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    const writes = Object.keys(changes).map(field => prepareFieldWrite_(session, headers, rowData, field, changes[field]));
    writes.forEach(w => sheet.getRange(rowIndex, w.colIdx).setValue(w.valueToStore));
    sheet.getRange(rowIndex, headers.indexOf(COL_LAST_UPDATED) + 1).setValue(new Date());

    const who = senderLabel_(session);
    writes.forEach(w => logStatusChangeIfApplicable_(kanriNo, w, who));

    if (Object.keys(changes).includes(COL_CONFIRMED_DATE)) sortReservationSheet_(sheet);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// (b)/(c) メッセージのみ、または「変更内容＋メッセージ」をまとめて1回で相手に通知する。
// changesが空ならメッセージのみの送信として扱う（履歴1件・メール1通）。
function apiCommitChanges(token, kanriNo, changes, message) {
  const session = requireSession_(token);
  changes = changes || {};
  message = String(message || '').trim();
  if (Object.keys(changes).length === 0 && !message) {
    throw new Error('送信するメッセージまたは変更内容がありません。');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    const summaryLines = [];
    const writes = [];
    let dateChanged = false;

    Object.keys(changes).forEach(field => {
      const prepared = prepareFieldWrite_(session, headers, rowData, field, changes[field]);
      if (prepared.changed) summaryLines.push(prepared.summaryLine);
      writes.push(prepared);
      if (field === COL_CONFIRMED_DATE) dateChanged = true;
    });

    if (summaryLines.length === 0 && !message) {
      return { ok: true, noChange: true };
    }

    const who = senderLabel_(session);
    if (writes.length > 0) {
      writes.forEach(w => sheet.getRange(rowIndex, w.colIdx).setValue(w.valueToStore));
      sheet.getRange(rowIndex, headers.indexOf(COL_LAST_UPDATED) + 1).setValue(new Date());
      writes.forEach(w => logStatusChangeIfApplicable_(kanriNo, w, who));
    }
    if (dateChanged) sortReservationSheet_(sheet);

    const freshRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    const bodyParts = [];
    if (summaryLines.length > 0) bodyParts.push(`[変更内容]\n${summaryLines.join('\n')}`);
    if (message) bodyParts.push(`[メッセージ]\n${message}`);
    const body = bodyParts.join('\n\n');
    const direction = session.role === JP_ROLE ? 'JP_TO_BRANCH' : 'BRANCH_TO_JP';
    const kind = summaryLines.length > 0 && message ? '変更＋メッセージ' : (summaryLines.length > 0 ? '変更内容' : 'メッセージ');

    appendHistory_(headers, freshRow, who, body, session.role);
    sendDirectionalMail_(headers, freshRow, direction, session, body, kind);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// 1フィールド分の検証・保存準備（役割チェック・STSゲート・列挙値チェック・日付変換）を共通化したもの
function prepareFieldWrite_(session, headers, rowData, field, value) {
  if (!COMMITTABLE_FIELDS.includes(field)) {
    throw new Error(`「${field}」はこの方法では変更できません。`);
  }
  validateFieldPermission_(session, headers, rowData, field, value);

  const colIdx = headers.indexOf(field);
  const isDateField = DATE_FIELDS.includes(field);
  const rawOld = rowData[colIdx];
  const oldDisplay = isDateField ? (formatMaybeDate_(rawOld) || '未定') : (rawOld || '(未設定)');
  const valueToStore = isDateField ? parseDateFromInput_(value) : (value || '');
  const newDisplay = isDateField ? (formatMaybeDate_(valueToStore) || '未定') : (valueToStore || '(未設定)');
  const changed = isDateField ? (oldDisplay !== newDisplay) : (String(rawOld || '') !== String(valueToStore));

  return { field, colIdx: colIdx + 1, valueToStore, changed, oldDisplay, newDisplay, summaryLine: `${field}: ${oldDisplay} → ${newDisplay}` };
}

// STS(JP側)／STS(支店側)（メイン・オプション共通）の変更を「誰が・いつ・何から何に」変更したか記録する
function logStatusChangeIfApplicable_(kanriNo, prepared, who) {
  if (!prepared.changed) return;
  if (!isJpStatusField_(prepared.field) && !isBranchStatusField_(prepared.field)) return;
  const sheet = getSpreadsheet_().getSheetByName(STATUS_LOG_SHEET_NAME);
  if (!sheet) return;
  sheet.appendRow([kanriNo, prepared.field, prepared.oldDisplay, prepared.newDisplay, who, new Date()]);
}

function validateFieldPermission_(session, headers, rowData, field, value) {
  if (isJpStatusField_(field)) {
    if (session.role !== JP_ROLE) throw new Error(`「${field}」は日本側のみ変更できます。`);
    if (value && !STATUS_CODES.includes(value)) throw new Error(`STSの値は ${STATUS_CODES.join('/')} のいずれかにしてください。`);
    return;
  }
  if (isBranchStatusField_(field)) {
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
    return;
  }
  // オプション名(OPn)欄はどちらの役割でも変更可（ステータスではなく単なるラベルのため）
  if (field === COL_AREA && value && !JP_TEAMS.includes(value)) {
    throw new Error(`管轄は ${JP_TEAMS.join('/')} のいずれかにしてください。`);
  }
  if (field === COL_BILLING_REGION && value && !BILLING_REGIONS.includes(value)) {
    throw new Error(`請求先は ${BILLING_REGIONS.join('/')} のいずれかにしてください。`);
  }
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

// メッセージ単体の送信は apiCommitChanges(token, kanriNo, {}, message) を使う
// （「メッセージのみ送信」「変更内容＋メッセージを送信」「保存のみ」の3択を1つのAPI体系に統一するため）

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
    appendHistory_(headers, freshRow, senderLabel_(session), `[DriveフォルダURL更新]\n${trimmed}`, session.role);
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
    appendHistory_(headers, newRowData, senderLabel_(session), `[新規案件作成]\n${initMsg}`, session.role);
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
  const checkedByCol = isJp ? H_COL_CHECKED_BY_JP : H_COL_CHECKED_BY_BRANCH;

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
      // ★要件：既読チェックは「誰が・いつ」確認したかも記録する
      const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
      sheet.getRange(targetRow, headers.indexOf(dateCol) + 1).setValue(ts);
      sheet.getRange(targetRow, headers.indexOf(checkedByCol) + 1).setValue(senderLabel_(session));
    } else {
      sheet.getRange(targetRow, headers.indexOf(dateCol) + 1).setValue('');
      sheet.getRange(targetRow, headers.indexOf(checkedByCol) + 1).setValue('');
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ★要件：STSの値（OK/RQ等）をタップしたら「誰が・いつ・何から何に変更したか」を確認できるようにする
function apiGetFieldHistory(token, kanriNo, field) {
  const session = requireSession_(token);
  const { headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  assertRowVisible_(session, headers, rowData);

  const sheet = getSpreadsheet_().getSheetByName(STATUS_LOG_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet).filter(r =>
    String(r[SL_COL_KANRI]) === String(kanriNo) && r[SL_COL_FIELD] === field
  );
  rows.sort((a, b) => new Date(b[SL_COL_WHEN]) - new Date(a[SL_COL_WHEN]));
  return rows.map(r => ({
    oldValue: r[SL_COL_OLD],
    newValue: r[SL_COL_NEW],
    who: r[SL_COL_WHO],
    datetime: r[SL_COL_WHEN] instanceof Date ? Utilities.formatDate(r[SL_COL_WHEN], 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') : r[SL_COL_WHEN]
  }));
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

// "yyyy/MM/dd"形式の日付文字列と今日との差（日数の絶対値）を返す。未定・不正な値はInfinity（末尾に回す）
function dayDistanceFromToday_(dateStr, todayStr) {
  const m1 = String(dateStr || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m1) return Infinity;
  const m2 = String(todayStr || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  const d1 = new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
  const d2 = m2 ? new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3])) : new Date();
  return Math.abs(d1.getTime() - d2.getTime());
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
    area: r[COL_AREA],
    confirmedDate: formatMaybeDate_(r[COL_CONFIRMED_DATE]),
    confirmedDateRaw: toComparableDate_(r[COL_CONFIRMED_DATE]),
    ceremonyDate: formatMaybeDate_(r[COL_CEREMONY_DATE])
  };
}

// =====================================================
// ⑬ 履歴追加・メール送信の共通処理
// =====================================================
function appendHistory_(headers, rowData, sender, body, senderRole) {
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
  // ★要件：どちら側（JP／BRANCH）からのメッセージかを記録し、ダッシュボードの「要対応」判定に使う
  set(H_COL_SENDER_ROLE, senderRole || '');
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
  const body = `${senderLabel_(session)} から更新がありました。\n\n` +
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
        MailApp.sendEmail(recipient, `[要確認] 撮影${ALERT_DAYS_BEFORE}日前：${row[headers.indexOf(COL_KANRI_NO)]}（${row[headers.indexOf(COL_BRANCH_CODE)]}支店）`, '未完了ステータスがあります。ポータルをご確認ください。');
      }
    }
  });
}

// ★要件：撮影日から一定日数（国・支店ごとに支店マスタ「納品期限日数」で設定、未設定なら既定30日）過ぎても
// DriveフォルダURL（納品）が未登録の案件を日本側へメール通知する
function checkDeliveryAlerts() {
  const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const branchMeta = branchMetaMap_();
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  data.forEach(row => {
    const driveUrl = String(row[headers.indexOf(COL_DRIVE_URL)] || '').trim();
    if (driveUrl) return; // 既に納品済み

    const dVal = row[headers.indexOf(COL_CONFIRMED_DATE)];
    if (!(dVal instanceof Date)) return;
    const shootMidnight = new Date(dVal.getFullYear(), dVal.getMonth(), dVal.getDate());
    const daysPast = Math.round((todayMidnight.getTime() - shootMidnight.getTime()) / 86400000);
    if (daysPast <= 0) return; // 未来日・当日はスキップ

    const shootStr = Utilities.formatDate(dVal, 'Asia/Tokyo', 'yyyy/MM/dd');
    const branchCode = row[headers.indexOf(COL_BRANCH_CODE)];
    const meta = branchMeta[branchCode] || {};
    const limitDays = meta.deliveryDays || DELIVERY_ALERT_DEFAULT_DAYS;
    if (daysPast < limitDays) return;

    // 毎日重複送信しないよう、期限当日のみ通知する
    if (daysPast !== limitDays) return;

    const area = row[headers.indexOf(COL_AREA)];
    const recipient = getJpTeamEmail_(area);
    const kanri = row[headers.indexOf(COL_KANRI_NO)];
    MailApp.sendEmail(
      recipient,
      `[要確認] 納品未登録：${kanri}（${branchCode}支店・撮影日から${limitDays}日経過）`,
      `撮影日から${limitDays}日が経過していますが、DriveフォルダURL（納品）が未登録です。ポータルをご確認ください。\n\n管理番号: ${kanri}\n撮影日: ${shootStr}`
    );
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
  ScriptApp.newTrigger('checkDeliveryAlerts').timeBased().everyDays(1).atHour(8).create();
  SpreadsheetApp.getUi().alert('日次トリガー（アーカイブ・アラート・納品期限アラート）を再設定しました。');
}
