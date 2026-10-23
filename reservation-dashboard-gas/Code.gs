/**
 * ============================================================================
 * Code.gs
 * 営業セールスダッシュボード - バックエンドAPI
 * ----------------------------------------------------------------------------
 * Googleスプレッドシート + Google Apps Script のみで構成するWebアプリ。
 * フロントエンド（Index.html / Javascript.html）から google.script.run 経由で
 * 呼び出される全APIをここに定義する。シート構造の作成は InitSheet.gs が担う。
 *
 * このアプリが扱うCSV由来の項目は、営業日報CSVのうち以下19項目のみに限定している
 * （それ以外の列はインポート時に読み捨てる）。
 *   006:エリア／007:営業所／013:最終目的地／014:予約日／016:出発予定日／
 *   019:顧客ID／020:予約番号／023:性別／024:国籍／029:商品分類／
 *   031:キャリア／037:ツアーブランド区分／038:ツアーコード／
 *   046:売上(商品請求金額)／047:入金額／051:STS／058:担当者／
 *   070:商品タイトル／076:旅行日数
 * これに加えて、現場で入力する項目（CHK日・保険・Wifi・TAViCA・キャンサポ・メモ）を
 * EDITABLE_COLUMNS としてシートの後ろに追加している。
 * ============================================================================
 */

var APP_TITLE = '営業セールスダッシュボード';
var SHEET_NAME = '予約データ';
var STAFF_SHEET_NAME = 'スタッフ権限';
var STAFF_NAME_SHEET_NAME = '担当者マスタ';
var TIMEZONE = 'Asia/Tokyo';
var SERVER_VERSION = '2.7.2';

// 予約番号（チャレンジ番号）は半角英数字ちょうど11桁（Javascript.htmlのCHALLENGE_RECORD_BASE_URL判定と同じ桁数）。
// 数字だけの予約番号（例：01234567890）はGoogleスプレッドシート上で数値として誤認識され、
// 先頭の0が失われることがあるため、読み込み時に11桁へゼロ埋めして復元する。
var RESERVATION_NO_DIGIT_LENGTH = 11;

// ---- 権限レベル ----
// 社員　　　＝自店舗のみ閲覧・入力
// 所長・チーフ＝自エリアのみ閲覧・入力
// AL　　　　＝全エリア閲覧・入力（CSVインポート・権限管理などの管理機能は不可）
// マスタ権限＝全ての権限（閲覧・入力に加え、CSVインポート・データ削除・権限管理も可能）
var ROLE_STAFF = '社員';
var ROLE_MANAGER = '所長・チーフ';
var ROLE_AL = 'AL';
var ROLE_MASTER = 'マスタ権限';
var ROLES = [ROLE_STAFF, ROLE_MANAGER, ROLE_AL, ROLE_MASTER];

// ---- CSVから抽出する19項目の定義（表示順・シート列1〜19の並びに統一する） ----
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

// ---- 現場で入力する項目（シート列20〜33）。CSVには含まれず、画面から直接編集する ----
var EDITABLE_COLUMNS = [
  { key: 'chkDate',         label: 'CHK日',          type: 'date'   },
  { key: 'insuranceStatus', label: '保険',            type: 'text'   },
  { key: 'insuranceQty',    label: '保険数量',        type: 'number' },
  { key: 'insuranceReason', label: '保険理由',        type: 'text'   },
  { key: 'wifiStatus',      label: 'Wifi',            type: 'text'   },
  { key: 'wifiQty',         label: 'Wifi数量',        type: 'number' },
  { key: 'wifiReason',      label: 'Wifi理由',        type: 'text'   },
  { key: 'tavicaStatus',    label: 'TAViCA',          type: 'text'   },
  { key: 'tavicaQty',       label: 'TAViCA数量',      type: 'number' },
  { key: 'tavicaReason',    label: 'TAViCA理由',      type: 'text'   },
  { key: 'cansapoStatus',   label: 'キャンサポ',      type: 'text'   },
  { key: 'cansapoQty',      label: 'キャンサポ数量',  type: 'number' },
  { key: 'cansapoReason',   label: 'キャンサポ理由',  type: 'text'   },
  { key: 'memo',            label: 'メモ',            type: 'text'   }
];

var ALL_COLUMNS = COLUMNS.concat(EDITABLE_COLUMNS);
var EDITABLE_KEY_SET = {};
EDITABLE_COLUMNS.forEach(function (c) { EDITABLE_KEY_SET[c.key] = true; });
var ALL_COLUMN_INDEX_BY_KEY = {};
ALL_COLUMNS.forEach(function (c, i) { ALL_COLUMN_INDEX_BY_KEY[c.key] = i; });

// 保険・Wifi・TAViCA・キャンサポ：ステータス列・数量列・理由列（失注時のみ使う）の対応表。
// 分析ダッシュボードの内訳グラフ・個人別サマリー・一覧表の編集セルはすべてこの定義を使う。
var ANCILLARY_ITEMS = [
  { key: 'insurance', label: '保険',      statusKey: 'insuranceStatus', qtyKey: 'insuranceQty', reasonKey: 'insuranceReason' },
  { key: 'wifi',       label: 'Wifi',      statusKey: 'wifiStatus',      qtyKey: 'wifiQty',       reasonKey: 'wifiReason' },
  { key: 'cansapo',    label: 'キャンサポ', statusKey: 'cansapoStatus',  qtyKey: 'cansapoQty',    reasonKey: 'cansapoReason' },
  { key: 'tavica',     label: 'TAViCA',    statusKey: 'tavicaStatus',    qtyKey: 'tavicaQty',     reasonKey: 'tavicaReason' }
];
var ANCILLARY_ITEM_BY_KEY = {};
ANCILLARY_ITEMS.forEach(function (a) { ANCILLARY_ITEM_BY_KEY[a.key] = a; });
var ANCILLARY_ITEM_BY_STATUS_KEY = {};
ANCILLARY_ITEMS.forEach(function (a) { ANCILLARY_ITEM_BY_STATUS_KEY[a.statusKey] = a; });

// 保険/Wifi/TAViCA/キャンサポ 共通のステータス選択肢。
// '-'（NO ACT）が未入力時の既定値。'×'（失注）を選ぶと理由入力・数量0固定になり、
// '〇'（NB付帯）'☆'（PUSH成約）は数量の入力が必須になる（Javascript.html側で制御）。
var ANCILLARY_STATUS_OPTIONS = [
  { value: '-', label: 'NO ACT' },
  { value: '〇', label: 'NB付帯' },
  { value: '×', label: '失注' },
  { value: '△', label: 'セールス中' },
  { value: '☆', label: 'PUSH成約' }
];

/**
 * ① Webアプリとしてアクセスされた際のエントリポイント。
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  // 他のサイトの枠（iframe）の中に表示させない（既定の設定）。外部のページに透明に重ねて表示し、
  // 削除などのボタンを押させる攻撃（クリックジャッキング）を防ぐため。Googleサイト等への埋め込みが
  // 必要になった場合は、README「他のページへの埋め込み」を参照。
}

/**
 * Index.html から他のHTMLファイルをインクルードするためのヘルパー。
 */
var INCLUDABLE_FILES_ = ['Javascript'];
function include(filename) {
  // 画面（google.script.run）からも呼べてしまうため、画面の部品として読み込むファイルだけに限る。
  if (INCLUDABLE_FILES_.indexOf(filename) === -1) throw new Error('このファイルは読み込めません。');
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// セットアップ状態
// ============================================================================

/**
 * 「予約データ」シートが存在し、見出し行が想定どおり（33列）かを確認する。
 * ウェブアプリ起動時に呼び、未セットアップならセットアップ案内バーを出す。
 */
function getSetupStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return { ready: false, reason: 'sheet_missing', detail: 'シート「' + SHEET_NAME + '」がまだ作成されていません。' };
  }
  if (sheet.getLastColumn() < ALL_COLUMNS.length) {
    return { ready: false, reason: 'header_incomplete', detail: '見出し列が ' + ALL_COLUMNS.length + ' 列に足りません。' };
  }
  var headerRow = sheet.getRange(1, 1, 1, ALL_COLUMNS.length).getValues()[0];
  for (var i = 0; i < ALL_COLUMNS.length; i++) {
    if (String(headerRow[i]).trim() !== ALL_COLUMNS[i].label) {
      return {
        ready: false,
        reason: 'header_mismatch',
        detail: (i + 1) + '列目の見出しが一致しません（期待：' + ALL_COLUMNS[i].label + ' / 実際：' + headerRow[i] + '）。'
      };
    }
  }
  return { ready: true };
}

/**
 * 初期セットアップを実行する（ウェブアプリの案内バーから呼ばれる）。
 * データシート・スタッフ権限シート・担当者マスタシートをまとめて作る。実体は InitSheet.gs 。
 */
function runInitialSetup() {
  assertSetupAllowed_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ensureSpreadsheetTimeZone_(ss);
  buildDataSheet_(ss);
  buildStaffSheet_(ss);
  buildStaffNameSheet_(ss);
  ensureChangeTrigger_();
  markDataChanged_();
  var status = getSetupStatus();
  if (tz.warning) { status.timeZoneWarning = tz.warning; console.warn(tz.warning); }
  return status;
}

/** スプレッドシートのタイムゾーン（取得できなければnull）。 */
function spreadsheetTimeZoneSafe_() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); } catch (e) { return null; }
}

/** Webアプリをデプロイした（＝スクリプトの実行者になっている）Googleアカウント。取れない場合は空文字。 */
function deployerEmail_() {
  try {
    return (Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  } catch (e) {
    return '';
  }
}

/**
 * 初期セットアップを実行してよい人か（マスタ権限、またはWebアプリをデプロイした本人）を確かめる。
 * 画面（google.script.run）から誰でも呼べてしまうため、シートの書式の作り直しや写しの破棄を
 * 権限の無い人に繰り返し実行されないようにする。Apps Scriptエディタからの実行は、実行者＝デプロイした本人。
 */
function assertSetupAllowed_() {
  var active = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  var deployer = deployerEmail_();
  if (active && deployer && active === deployer) return;
  if (getCurrentUserContext_().role === ROLE_MASTER) return;
  throw new Error('初期セットアップは、マスタ権限のユーザー（またはWebアプリをデプロイした管理者）のみ実行できます。');
}

/**
 * スプレッドシートのタイムゾーンを、このアプリの基準（TIMEZONE）にそろえる。
 * タイムゾーンが違うと、日付を書き込んだときにシート上の表示が前日・翌日にずれる。
 * ただし、既に予約データが入っている場合に変更すると、入っている日付の読み取り結果がずれるため変更せず、
 * 警告の文言を返す（管理者がデータの状態を確認したうえで手動で変更する）。
 */
function ensureSpreadsheetTimeZone_(ss) {
  try {
    var current = ss.getSpreadsheetTimeZone();
    if (current === TIMEZONE) return { ok: true };
    var dataSheet = ss.getSheetByName(SHEET_NAME);
    if (!dataSheet || dataSheet.getLastRow() < 2) {
      ss.setSpreadsheetTimeZone(TIMEZONE);
      return { ok: true, changed: true };
    }
    return { ok: false, warning: 'スプレッドシートのタイムゾーンが「' + current + '」になっています（このアプリは「' + TIMEZONE + '」が前提です）。' +
      '既にデータがあるため自動では変更していません。日付が1日ずれて見える場合は、管理者にご相談ください。' };
  } catch (e) {
    return { ok: false };
  }
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
// 権限（スタッフ権限シートによるアクセス制御）
// ============================================================================

/**
 * 実行者のGoogleアカウントを「スタッフ権限」シートで引き、権限情報を返す。
 * ・シートが無い／1件も登録が無い間は、最初のセットアップができるよう
 *   Webアプリをデプロイした本人だけをマスタ権限として扱う（bootstrapMode: true）。それ以外の人は閲覧不可。
 * ・シートはあるが該当アカウントの登録が無い場合は、閲覧不可（role: ''）として返す。
 */
/**
 * 同じGoogleアカウントの行がスタッフ権限シートに複数ある場合（人事データCSVインポートで
 * 所属変更を新規行として追加したことによる履歴）は、シート上で一番下＝最後に追加された行を
 * 現在の所属・権限として採用する。
 */
function getCurrentUserContext_() {
  var email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    // スタッフ権限が1件も無い間（最初のセットアップ時、またはシートの削除・名前の変更・全行の削除をしてしまった場合）は、
    // Webアプリをデプロイした本人だけをマスタ権限として扱う（以前は全員をマスタ権限として扱っていたため、
    // シートを誤って消すと組織内の誰でも全データを閲覧・削除できる状態になっていた）。
    var deployer = deployerEmail_();
    if (email && deployer && email === deployer) {
      return { email: email, name: '', office: '', area: '', role: ROLE_MASTER, registered: false, bootstrapMode: true };
    }
    return { email: email, name: '', office: '', area: '', role: '', registered: false, bootstrapMode: false };
  }
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var found = null;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var rowEmail = String(row[0] || '').trim().toLowerCase();
    if (rowEmail && rowEmail === email) {
      found = {
        email: email,
        name: String(row[1] || '').trim(),
        office: String(row[2] || '').trim(),
        area: String(row[3] || '').trim(),
        role: String(row[4] || '').trim(),
        registered: true,
        bootstrapMode: false
      };
    }
  }
  if (found) return found;
  return { email: email, name: '', office: '', area: '', role: '', registered: false, bootstrapMode: false };
}

/** クライアントから直接呼べる公開版（ヘッダーの権限バッジ表示などに使う）。 */
function getCurrentUserContext() {
  return getCurrentUserContext_();
}

var AFFILIATION_CODE_PATTERN_ = /^([0-9A-Za-z]{1,6})\s*:\s*/;
var AFFILIATION_KANJI_DIGITS_ = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };

/** 全角半角の違い（NFKC正規化）と前後の空白をそろえた表記。 */
function affiliationText_(s) {
  return String(s === null || s === undefined ? '' : s).normalize('NFKC').trim();
}

/** 「717:イーアスつくば」の「717」のような、先頭の店舗・エリアコード（無ければ空文字）。 */
function affiliationCode_(s) {
  var m = affiliationText_(s).match(AFFILIATION_CODE_PATTERN_);
  return m ? m[1].toUpperCase() : '';
}

/** 「一」〜「九十九」の漢数字を算用数字の文字列にする（第十一→11、第二十→20、第三→3）。 */
function kanjiNumberToDigits_(k) {
  var d = AFFILIATION_KANJI_DIGITS_;
  var i = k.indexOf('十');
  if (i === -1) return d[k];
  var tens = i === 0 ? 1 : Number(d[k.charAt(0)]);
  var ones = i === k.length - 1 ? 0 : Number(d[k.charAt(i + 1)]);
  return String(tens * 10 + ones);
}

/**
 * 所属店舗・所属エリアの名称を、比較用の形にそろえる（推測を含まない、決まった表記ルールだけで変換する）。
 * 営業日報CSV側は「717:イーアスつくば」「71:東京第2エリア」、人事データ側は「イーアスつくば営業所」
 * 「東京第二ｴﾘｱ」のように表記が異なるため、次の違いだけを取り除く。
 * ・全角半角（NFKC正規化）・空白 ・先頭のコード（「717:」等） ・括弧書きの注記
 * ・漢数字の「第一」〜「第十」と算用数字 ・末尾の「営業所」「支店」「店」「エリア」（1回だけ）
 * それ以外の文字（地名・施設名など）は1文字でも違えば別の所属として扱う。
 */
function affiliationKey_(s) {
  var t = affiliationText_(s).replace(AFFILIATION_CODE_PATTERN_, '');
  t = t.replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '');
  t = t.replace(/第([一二三四五六七八九]?十[一二三四五六七八九]?|[一二三四五六七八九])/g, function (_, k) { return '第' + kanjiNumberToDigits_(k); });
  var stripped = t.replace(/(?:営業所|支店|店|エリア)$/, '');
  return stripped || t;
}

/**
 * 予約データに実在する所属名の一覧から、「同じ比較用表記になるのに店舗コードが異なる」もの（例：
 * 「717:イオン」と「718:イオン」）を調べた結果。このような表記は、どちらの店舗か決められないため
 * 表記ルールでは一致させず、スタッフ権限側にコード付きの正確な表記を書いた場合だけ一致させる。
 */
function buildAffiliationIndex_(officeValues, areaValues) {
  function index(values) {
    var codesByKey = {};
    (values || []).forEach(function (v) {
      var text = affiliationText_(v);
      if (!text) return;
      var key = affiliationKey_(text);
      var code = affiliationCode_(text);
      if (!codesByKey[key]) codesByKey[key] = {};
      if (code) codesByKey[key][code] = true;
    });
    var ambiguous = {};
    Object.keys(codesByKey).forEach(function (k) { if (Object.keys(codesByKey[k]).length > 1) ambiguous[k] = true; });
    return { ambiguous: ambiguous };
  }
  return { office: index(officeValues), area: index(areaValues) };
}

/**
 * スタッフ権限側の所属（staffValue）と予約データ側の所属（rowValue）が同じ所属かを判定する。
 * ・表記が完全に同じ（全角半角・前後空白の違いのみ）なら一致
 * ・それ以外は、比較用表記（affiliationKey_）が同じで、かつ取り違えの恐れが無い場合だけ一致
 *   （双方にコードがあってコードが違う場合、または同じ表記に別コードの所属が複数ある場合は一致させない）
 */
function affiliationMatches_(staffValue, rowValue, kindIndex) {
  var a = affiliationText_(staffValue), b = affiliationText_(rowValue);
  if (!a || !b) return false;
  if (a === b) return true;
  var ka = affiliationKey_(a), kb = affiliationKey_(b);
  if (!ka || ka !== kb) return false;
  var ca = affiliationCode_(a), cb = affiliationCode_(b);
  if (ca && cb && ca !== cb) return false;
  if (kindIndex && kindIndex.ambiguous[kb]) return false;
  return true;
}

/**
 * 権限に応じて、1行（所属店舗・所属エリア）が閲覧範囲に入るかを判定する（社員=自店舗のみ、所長・チーフ=自エリアのみ、AL・マスタ=全件）。
 * 店舗は店舗どうし、エリアはエリアどうしだけを比べる（店舗名とエリア名を交差して比べると、
 * 「横浜エリア」と「横浜店」のような別の所属を同じとみなしてしまうため）。
 * 氏名・担当者コード・メールアドレスなどから閲覧範囲を推測して広げることは一切しない。
 * affIndex（buildAffiliationIndex_の結果）を渡すと、表記ルールで取り違えの恐れがある所属を除外できる。
 */
function isRowInRoleScope_(ctx, office, area, affIndex) {
  if (ctx.role === ROLE_MASTER || ctx.role === ROLE_AL) return true;
  if (ctx.role === ROLE_MANAGER) return !!ctx.area && affiliationMatches_(ctx.area, area, affIndex && affIndex.area);
  if (ctx.role === ROLE_STAFF) return !!ctx.office && staffOfficeMatches_(ctx, office, affIndex && affIndex.office);
  return false; // 権限未登録・不明なロールには何も見せない
}

/**
 * 社員の所属店舗と予約データの営業所が同じ店舗か。所属店舗の先頭に、その人自身の所属エリア名が
 * 付いている場合（人事データの「駐在所属名称」が「東京第一ｴﾘｱﾄﾗﾍﾞﾙﾜﾝﾀﾞｰﾗﾝﾄﾞ新宿」のように
 * エリア名＋店舗名になっている場合）は、エリア名を除いた店舗名でも比べる。
 * 使うのはその人の行に書かれている所属店舗・所属エリアだけで、推測で閲覧範囲を広げることはしない。
 */
function staffOfficeMatches_(ctx, rowOffice, officeIndex) {
  if (affiliationMatches_(ctx.office, rowOffice, officeIndex)) return true;
  var storeOnly = officeWithoutAreaPrefix_(ctx.office, ctx.area);
  return !!storeOnly && affiliationMatches_(storeOnly, rowOffice, officeIndex);
}

/** 所属店舗の先頭にある、その人の所属エリア名を除いた店舗名（付いていなければ空文字）。 */
function officeWithoutAreaPrefix_(office, area) {
  var o = affiliationText_(office).replace(AFFILIATION_CODE_PATTERN_, '');
  var a = affiliationText_(area);
  if (!o || !a) return '';
  var candidates = [a, a.replace(AFFILIATION_CODE_PATTERN_, '').trim()];
  for (var i = 0; i < candidates.length; i++) {
    var p = candidates[i];
    if (p && o.length > p.length && o.indexOf(p) === 0) {
      return o.slice(p.length).replace(/^[\s・:\-－]+/, '').trim();
    }
  }
  return '';
}

/**
 * 1人の利用者について、予約データに実在する所属名（distinctValues）のうちどれが閲覧範囲に入るかを
 * 前もって1回だけ判定しておき、行ごとの判定を表の参照だけで済ませる（数万行でも速く絞り込むため）。
 */
function buildScopeMatcher_(ctx, distinctOffices, distinctAreas, affIndex) {
  if (ctx.role === ROLE_MASTER || ctx.role === ROLE_AL) return function () { return true; };
  var allowed = Object.create(null);
  var isManager = ctx.role === ROLE_MANAGER;
  (isManager ? distinctAreas : distinctOffices).forEach(function (v) {
    if (isManager ? isRowInRoleScope_(ctx, '', v, affIndex) : isRowInRoleScope_(ctx, v, '', affIndex)) allowed[v] = true;
  });
  if (isManager) return function (office, area) { return allowed[area] === true; };
  if (ctx.role === ROLE_STAFF) return function (office) { return allowed[office] === true; };
  return function () { return false; };
}

function assertMaster_(ctxArg) {
  var ctx = ctxArg || getCurrentUserContext_();
  if (ctx.role !== ROLE_MASTER) {
    throw new Error('マスタ権限のユーザーのみ実行できます。');
  }
  return ctx;
}

/**
 * 書き込み系API共通の排他制御。スクリプトロックを取得してからfnを実行し、
 * 必ずロックを解放する。複数人が同時にCSVインポート・一括登録・重複削除・アーカイブ等を
 * 実行すると、シートへの書き込み位置（getLastRow()+1）が衝突してデータが上書き・消失したり、
 * 行の詰め直し（重複削除・アーカイブ）の最中に他のユーザーの保存が古い行番号に書き込まれて
 * 無関係の行を破壊したりする事故が起こり得るため、これらの操作は同時に1つしか実行できないようにする。
 * ロックが取得できない場合（既に誰かが実行中）は、待たせすぎないよう一定時間でエラーにする。
 */
function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('他のユーザーがデータを更新中です。少し待ってから再度お試しください。');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// 画面初期表示データ
// ============================================================================

// ---- 表示期間（データが増えるほど画面が重くなるのを防ぐための既定の絞り込み） ----
// 既定では「出発予定日が直近Nヶ月以内、または未来（まだ出発していない予定）」の行だけを読み込む。
// 過去の古いデータは、画面側の「表示期間」操作（全期間を表示／期間を指定）で明示的に呼び出したときだけ読み込む。
var DEFAULT_LIST_WINDOW_MONTHS = 6;

/**
 * 日付のnか月前を返す。その月に同じ日が無い場合は月末にする（8月31日の6か月前は2月28日／29日）。
 * Date.setMonth だけだと「2月31日」が3月3日に繰り上がり、表示期間の開始日が数日ずれるため。
 */
function monthsAgo_(date, n) {
  var d = new Date(date.getTime());
  var day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  var lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/**
 * rangeOption（省略可）から、実際に使う表示期間（from/to、'yyyy-MM-dd'文字列）を決める。
 * ・省略 または {mode:'default'}      → 出発予定日が「今日からNヶ月前」以降（未来は上限なし）
 * ・{mode:'all'}                      → 絞り込み無し（全期間）
 * ・{mode:'custom', from, to}         → 指定された期間（from・toはどちらか省略可）
 */
function resolveListWindow_(rangeOption) {
  if (rangeOption && rangeOption.mode === 'all') {
    return { mode: 'all', from: null, to: null };
  }
  if (rangeOption && rangeOption.mode === 'custom') {
    var from = rangeOption.from || null;
    var to = rangeOption.to || null;
    if (!from && !to) return { mode: 'all', from: null, to: null }; // 期間未指定は全期間として扱う
    return { mode: 'custom', from: from, to: to };
  }
  var cutoff = monthsAgo_(new Date(), DEFAULT_LIST_WINDOW_MONTHS);
  return { mode: 'default', from: Utilities.formatDate(cutoff, TIMEZONE, 'yyyy-MM-dd'), to: null, months: DEFAULT_LIST_WINDOW_MONTHS };
}

// ============================================================================
// 起動の高速化：データの写し（スナップショット）と圧縮送信
// ----------------------------------------------------------------------------
// 起動が遅くなる主な原因は、(1) 毎回シート全体（数万行×33列）を読み込むこと、(2) 画面へ送るデータが
// 大きいこと（行ごとに33項目の名前付きデータを送ると、2万行で約13MBになる）の2つ。これに対して、
// ・送るデータを「列ごとにまとめ、同じ値は辞書の番号に置き換え、gzip圧縮した文字列」にする（数十分の1）
// ・シートの内容を圧縮した写しをサーバー側のキャッシュに保存し、データが変わっていなければ
//   シートを読まずに写しから応答する。同じ閲覧範囲・同じ表示期間の応答そのものも保存して使い回す。
// 写しが古くならないよう、次のいずれかで自動的に使われなくなる。
// ・このアプリからの書き込み（CSV取込・編集・一括登録・重複削除・アーカイブ・全削除）で版番号を更新
// ・スプレッドシートを直接手で編集した場合も、onEdit（単純トリガー）で版番号を更新
// ・並べ替え・行の挿入や削除・検索と置換など、onEditでは検知できない直接の変更は、初期セットアップで
//   登録する変更検知トリガー（onSpreadsheetChange）で版番号を更新
// ・行の追加・削除で最終行が変わった場合（キャッシュの名前に最終行番号を含めている）
// ・保存から1時間経過（CacheServiceの有効期限）。変更検知トリガーが未登録の間は5分で使われなくなる
// さらに、編集の保存時は画面に表示した時点の行の内容（行トークン）と現在の行を照合するため、
// 万一写しが古くても、別の行を誤って上書きすることはない（照合に失敗した場合は写しも作り直す）。
// ============================================================================

var DATA_VERSION_PROP_ = 'dataVersion';
var CACHE_PREFIX_ = 'v3:';
var CACHE_TTL_SEC_ = 3600;
var CACHE_TTL_UNWATCHED_SEC_ = 300;
var CHANGE_WATCH_PROP_ = 'changeWatchInstalled';
var CHANGE_HANDLER_NAME_ = 'onSpreadsheetChange';
var CACHE_CHUNK_CHARS_ = 90000;
var CACHE_MAX_CHUNKS_ = 400;
var PACKED_FORMAT_ = 'col1';
var SNAPSHOT_KEYS_ = ALL_COLUMNS.map(function (c) { return c.key; }).concat(['rowIndex', '_t']);

/** 予約データの版番号（アプリや手入力で予約データが変わるたびに変わる値）。 */
function getDataVersion_() {
  return PropertiesService.getDocumentProperties().getProperty(DATA_VERSION_PROP_) || '0';
}

/**
 * 予約データへの書き込みを確定させてから版番号を更新する（書き込み系の処理の最後に必ず呼ぶ）。
 * 先に版番号だけ変えると、その直後に画面を開いた人が反映前の値を新しい版番号の写しとして保存しうるため。
 */
function markDataChanged_() {
  SpreadsheetApp.flush();
  bumpDataVersion_();
}

/** 予約データが変わったことを記録し、保存済みの写し・応答を以後使わないようにする。 */
function bumpDataVersion_() {
  PropertiesService.getDocumentProperties().setProperty(
    DATA_VERSION_PROP_, new Date().getTime().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36));
}

/**
 * スプレッドシートを直接手で編集したときに自動で呼ばれる（単純トリガー）。
 * 予約データシートの編集であれば版番号を更新し、古い写しが表示に使われないようにする。
 */
function onEdit(e) {
  try {
    var sheet = e && e.range && e.range.getSheet();
    if (sheet && sheet.getName() === SHEET_NAME) bumpDataVersion_();
  } catch (err) {
    // 手入力そのものは妨げない（行の増減は最終行番号の変化で、行の入れ替えは保存時の行照合で検出する）。
    console.warn('onEdit: ' + err);
  }
}

/**
 * スプレッドシートに変更があったときに自動で呼ばれる（初期セットアップで登録する変更検知トリガー）。
 * 並べ替え・行の挿入や削除・検索と置換など、onEditでは検知できない変更でも版番号を更新する。
 * どのシートの変更かは判別できない場合があるため、変更があれば常に更新する（写しを作り直すだけで害はない）。
 * 画面（google.script.run）からも呼べてしまうため、本物のトリガーの呼び出し（e.sourceにスプレッドシートが入る）だけを受け付ける。
 */
function onSpreadsheetChange(e) {
  try {
    if (e && e.source && typeof e.source.getId === 'function') bumpDataVersion_();
  } catch (err) {
    console.warn('onSpreadsheetChange: ' + err);
  }
}

/**
 * 変更検知トリガーを登録する（既に登録済みなら何もしない）。初期セットアップから呼ぶ。
 * 登録できなかった場合（権限の承認前など）もセットアップ自体は続け、写しの有効期限を短くして安全側で動かす。
 */
function ensureChangeTrigger_() {
  try {
    var exists = ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === CHANGE_HANDLER_NAME_ && t.getEventType() === ScriptApp.EventType.ON_CHANGE;
    });
    if (!exists) {
      ScriptApp.newTrigger(CHANGE_HANDLER_NAME_).forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onChange().create();
    }
    PropertiesService.getDocumentProperties().setProperty(CHANGE_WATCH_PROP_, '1');
    return true;
  } catch (e) {
    console.warn('ensureChangeTrigger_: ' + e);
    return false;
  }
}

/** 写しの有効期限（秒）。変更検知トリガーが未登録の間は、直接の変更が反映されるまでの時間を短くする。 */
function cacheTtlSec_() {
  return PropertiesService.getDocumentProperties().getProperty(CHANGE_WATCH_PROP_) === '1' ? CACHE_TTL_SEC_ : CACHE_TTL_UNWATCHED_SEC_;
}

/** 文字列から短い照合用の値を作る（暗号用途ではない。2種類の計算を組み合わせて偶然の一致を防ぐ）。 */
function hashText_(s) {
  var imul = Math.imul; // 数万行×百数十文字を回すため、毎回の参照を避けて手元に置く
  var h1 = 0x811c9dc5 | 0, h2 = 0x9747b28c | 0;
  for (var i = 0, len = s.length; i < len; i++) {
    var c = s.charCodeAt(i);
    h1 = imul(h1 ^ c, 16777619);
    h2 = imul(h2 ^ c, 0x5bd1e995);
    h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(36) + '.' + (h2 >>> 0).toString(36);
}

/** シートの1行（生の値）の、CSV由来19項目から作る行トークン（画面表示時と保存時の行の同一性の照合に使う）。 */
function rowTokenFromRaw_(raw) {
  var record = {};
  for (var c = 0; c < COLUMNS.length; c++) record[COLUMNS[c].key] = normalizeCellValue_(COLUMNS[c], raw[c]);
  return hashText_(buildDedupeKey_(record));
}

/**
 * シートの値（2次元配列）を、列ごとの配列（正規形の値）に変換する。空行は除く。
 * rowIndexBase：values[0] がシートの何行目か（通常は2）。rowIndexOffset：rowIndexに足す値（アーカイブ用）。
 */
function buildColumnar_(values, rowIndexBase, rowIndexOffset) {
  // 数万行×33列を回すため、繰り返し使う定義・関数は手元の変数に置いてから使う。
  var allCols = ALL_COLUMNS, nCol = allCols.length, nCsv = COLUMNS.length;
  var normalize = normalizeCellValue_, hash = hashText_;
  var cols = {}, colArrays = new Array(nCol);
  for (var k = 0; k < nCol; k++) colArrays[k] = cols[allCols[k].key] = [];
  var rowIndexArr = cols.rowIndex = [];
  var tokenArr = cols._t = [];
  var parts = new Array(nCsv);
  var offset = rowIndexBase + (rowIndexOffset || 0);
  for (var r = 0; r < values.length; r++) {
    var raw = values[r];
    var blank = true;
    for (var b = 0; b < nCol; b++) { if (raw[b] !== '' && raw[b] !== null && raw[b] !== undefined) { blank = false; break; } }
    if (blank) continue;
    for (var c = 0; c < nCol; c++) {
      var v = normalize(allCols[c], raw[c]);
      colArrays[c].push(v);
      if (c < nCsv) parts[c] = (v === null || v === undefined) ? '' : String(v);
    }
    rowIndexArr.push(r + offset);
    tokenArr.push(hash(parts.join('\u0001')));
  }
  return { n: rowIndexArr.length, cols: cols };
}

/**
 * 列ごとの配列の一部（parts：[{cols, n, indices}]、indicesがnullなら全行）をつなげて、送信用の文字列にする。
 * 値の種類が少ない列（エリア・営業所・担当者・日付など）は「辞書＋番号」にして小さくする。
 */
function packColumnar_(parts, keys) {
  var n = 0;
  parts.forEach(function (p) { n += p.indices ? p.indices.length : p.n; });
  var out = { f: PACKED_FORMAT_, n: n, k: keys, c: [] };
  keys.forEach(function (key) {
    var dict = [], idxOf = new Map(), codes = new Array(n), pos = 0;
    parts.forEach(function (p) {
      var arr = p.cols[key];
      var count = p.indices ? p.indices.length : p.n;
      for (var i = 0; i < count; i++) {
        var v = arr ? arr[p.indices ? p.indices[i] : i] : null;
        if (v === undefined) v = null;
        var j = idxOf.get(v);
        if (j === undefined) { j = dict.length; dict.push(v); idxOf.set(v, j); }
        codes[pos++] = j;
      }
    });
    if (n < 8 || dict.length * 2 <= n) out.c.push({ d: dict, i: codes });
    else out.c.push({ v: codes.map(function (j) { return dict[j]; }) });
  });
  return JSON.stringify(out);
}

/** packColumnar_ の文字列を、列ごとの配列に戻す。 */
function unpackColumnar_(json) {
  var o = JSON.parse(json);
  var cols = {};
  o.k.forEach(function (key, ci) {
    var c = o.c[ci];
    if (c.d) {
      var arr = new Array(o.n);
      for (var i = 0; i < o.n; i++) arr[i] = c.d[c.i[i]];
      cols[key] = arr;
    } else {
      cols[key] = c.v;
    }
  });
  return { n: o.n, cols: cols };
}

/** 列ごとの配列を、従来どおりの「行ごとのオブジェクト」の配列に戻す（後方互換の応答形式用）。 */
function columnarToRows_(n, cols, keys) {
  var rows = new Array(n);
  for (var i = 0; i < n; i++) {
    var o = {};
    for (var k = 0; k < keys.length; k++) {
      var arr = cols[keys[k]];
      if (arr) o[keys[k]] = arr[i];
    }
    rows[i] = o;
  }
  return rows;
}

function gzipBase64_(text) {
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(text, 'application/json')).getBytes());
}
function gunzipBase64_(b64) {
  return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString('UTF-8');
}

/**
 * CacheServiceは1件100KBまでのため、大きな文字列は分割して保存する。すべての断片がそろい、
 * 長さも一致した場合だけ読み出しに成功とみなす（一部だけ消えていた場合は使わない）。
 */
function cacheGetLarge_(key) {
  var cache = CacheService.getScriptCache();
  var metaRaw = cache.get(key + '#m');
  if (!metaRaw) return null;
  var meta = JSON.parse(metaRaw);
  var names = [];
  for (var i = 0; i < meta.c; i++) names.push(key + '#' + i);
  var got = cache.getAll(names);
  var pieces = new Array(names.length);
  for (var j = 0; j < names.length; j++) {
    if (typeof got[names[j]] !== 'string') return null;
    pieces[j] = got[names[j]];
  }
  var text = pieces.join('');
  if (text.length !== meta.len) return null;
  return { text: text, extra: meta.x || null };
}

function cachePutLarge_(key, text, extra) {
  var count = Math.ceil(text.length / CACHE_CHUNK_CHARS_);
  if (count > CACHE_MAX_CHUNKS_) return false;
  var metaText = JSON.stringify({ c: count, len: text.length, x: extra || null });
  if (metaText.length > CACHE_CHUNK_CHARS_) return false;
  var items = {};
  for (var i = 0; i < count; i++) items[key + '#' + i] = text.substr(i * CACHE_CHUNK_CHARS_, CACHE_CHUNK_CHARS_);
  try {
    var cache = CacheService.getScriptCache();
    var ttl = cacheTtlSec_();
    cache.putAll(items, ttl);
    cache.put(key + '#m', metaText, ttl);
    return true;
  } catch (e) {
    console.warn('cachePutLarge_: ' + e);
    return false;
  }
}

/**
 * 予約データ全行の写しを返す。キャッシュに今の版番号・最終行の写しがあればシートを読まない。
 * 戻り値：{ snap:{n, cols}, packedAllB64:全行の送信用文字列(gzip+base64), source:'cache'|'sheet' }
 */
function loadSnapshot_(sheet, version, lastRow, timing) {
  var key = CACHE_PREFIX_ + 's:' + version + ':' + lastRow;
  var t0 = new Date().getTime();
  var hit = null;
  try { hit = cacheGetLarge_(key); } catch (e) { hit = null; }
  if (hit) {
    var snapFromCache = unpackColumnar_(gunzipBase64_(hit.text));
    timing.snapshot = 'cache';
    timing.snapshotMs = new Date().getTime() - t0;
    return { snap: snapFromCache, packedAllB64: hit.text, source: 'cache' };
  }
  var values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, ALL_COLUMNS.length).getValues() : [];
  timing.readMs = new Date().getTime() - t0;
  var t1 = new Date().getTime();
  var snap = buildColumnar_(values, 2, 0);
  var b64 = gzipBase64_(packColumnar_([{ cols: snap.cols, n: snap.n, indices: null }], SNAPSHOT_KEYS_));
  timing.buildMs = new Date().getTime() - t1;
  timing.snapshot = 'sheet';
  timing.cached = cachePutLarge_(key, b64, null);
  return { snap: snap, packedAllB64: b64, source: 'sheet' };
}

/** 列ごとの配列から、重複の無い値の一覧を作る。 */
function distinctOf_(arr) {
  var seen = Object.create(null), out = [];
  for (var i = 0; i < arr.length; i++) {
    var v = arr[i];
    if (v === null || v === undefined || v === '') continue;
    if (seen[v] !== true) { seen[v] = true; out.push(v); }
  }
  return out;
}

/** 利用者ごとの閲覧範囲を表す文字列（同じ範囲の利用者どうしで保存済みの応答を使い回すためのキー）。 */
function scopeKeyOf_(ctx) {
  if (ctx.role === ROLE_MASTER || ctx.role === ROLE_AL) return 'ALL';
  if (ctx.role === ROLE_MANAGER) return 'A|' + affiliationText_(ctx.area);
  if (ctx.role === ROLE_STAFF) return 'O|' + affiliationText_(ctx.office) + '|' + affiliationText_(ctx.area); // 所属エリアも判定に使うため
  return 'NONE';
}

/** 画面に返す担当者マスタ（担当者コード→氏名）を、返す行に出てくる担当者の分だけに絞る（他店舗の氏名を送らない）。 */
function staffNameMapFor_(codes) {
  var all = getStaffNameMap_();
  var out = {};
  (codes || []).forEach(function (c) { if (Object.prototype.hasOwnProperty.call(all, c)) out[c] = all[c]; });
  return out;
}

/**
 * アーカイブ先の行のうち、閲覧範囲と表示期間に入るものを返す（「アーカイブ済みデータも含める」選択時のみ）。
 * rowIndexには本体の行番号と衝突しないよう ARCHIVE_ROW_INDEX_OFFSET_ を足し、isArchived を付ける。
 */
function getArchivePart_(ctx, window_, mainDistinct) {
  var empty = { part: null, totalInRoleScope: 0, excludedByWindow: 0, codes: [] };
  var id = PropertiesService.getDocumentProperties().getProperty(ARCHIVE_SPREADSHEET_ID_PROP_);
  if (!id) return empty;
  var archiveSheet;
  try {
    archiveSheet = SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
  } catch (e) {
    return empty; // アーカイブ先が削除済み等で開けない場合は、無視して本体データのみ返す。
  }
  if (!archiveSheet) return empty;
  var lastRow = archiveSheet.getLastRow();
  // アーカイブ先の写しも保存して使い回す（数万件になると、毎回読み込むと時間がかかるため）。
  // アーカイブ先へ書き込むのはアーカイブの実行だけで、その際に本体の版番号が更新されるため、本体の版番号と
  // アーカイブ先の最終行番号を写しの名前に含める（アーカイブ先を直接編集した場合は、写しの有効期限まで反映されない）。
  var archiveKey = CACHE_PREFIX_ + 'a:' + getDataVersion_() + ':' + hashText_(id) + ':' + lastRow;
  var snap = null;
  try {
    var hit = cacheGetLarge_(archiveKey);
    if (hit) snap = unpackColumnar_(gunzipBase64_(hit.text));
  } catch (e) { snap = null; }
  if (!snap) {
    var values = lastRow >= 2 ? archiveSheet.getRange(2, 1, lastRow - 1, ALL_COLUMNS.length).getValues() : [];
    snap = buildColumnar_(values, 2, ARCHIVE_ROW_INDEX_OFFSET_);
    cachePutLarge_(archiveKey, gzipBase64_(packColumnar_([{ cols: snap.cols, n: snap.n, indices: null }], SNAPSHOT_KEYS_)), null);
  }
  snap.cols.isArchived = snap.cols.rowIndex.map(function () { return true; });
  var offices = distinctOf_(snap.cols.office), areas = distinctOf_(snap.cols.area);
  var affIndex = buildAffiliationIndex_(offices.concat(mainDistinct.offices), areas.concat(mainDistinct.areas));
  var sel = selectRows_(snap, ctx, window_, affIndex);
  return { part: { cols: snap.cols, n: snap.n, indices: sel.indices }, totalInRoleScope: sel.totalInRoleScope,
    excludedByWindow: sel.totalInRoleScope - sel.indices.length, codes: sel.codes };
}

/**
 * 写しの中から、閲覧範囲（権限）と表示期間に入る行の位置を選ぶ。出発予定日が空欄の行は表示期間では除外しない。
 */
function selectRows_(snap, ctx, window_, affIndex) {
  var cols = snap.cols;
  var match = buildScopeMatcher_(ctx, distinctOf_(cols.office), distinctOf_(cols.area), affIndex);
  var from = window_ && window_.from, to = window_ && window_.to;
  var indices = [], total = 0, codeSeen = Object.create(null), codes = [];
  for (var i = 0; i < snap.n; i++) {
    if (!match(cols.office[i], cols.area[i])) continue;
    total++;
    var dep = cols.departureDate[i];
    if (dep && ((from && dep < from) || (to && dep > to))) continue;
    indices.push(i);
    var code = cols.staff[i];
    if (code && codeSeen[code] !== true) { codeSeen[code] = true; codes.push(code); }
  }
  return { indices: indices, totalInRoleScope: total, codes: codes };
}

/** 画面の初期化に必要な固定の定義（項目・選択肢など）。 */
function bootstrapBase_(status, ctx) {
  return {
    status: status,
    columns: COLUMNS, editableColumns: EDITABLE_COLUMNS, ancillaryItems: ANCILLARY_ITEMS,
    ancillaryStatusOptions: ANCILLARY_STATUS_OPTIONS,
    userContext: { email: ctx.email, name: ctx.name, office: ctx.office, area: ctx.area, role: ctx.role,
      registered: ctx.registered, bootstrapMode: ctx.bootstrapMode }
  };
}

/**
 * 画面ロード時に呼ぶ。項目定義＋（権限と表示期間で絞り込んだ）データ行＋メタ情報をまとめて返す。
 * ・権限による絞り込み（社員=自店舗のみ／所長・チーフ=自エリアのみ／AL・マスタ=全件）
 * ・表示期間による絞り込み（既定では出発予定日が直近6ヶ月＋今後の予定のみ。全期間は {mode:'all'}）
 * rangeOption.packing：
 * ・'gzip'：行データを圧縮した文字列（packedRows）で返す（通常の画面はこれを使う）
 * ・'col'：圧縮しない列ごとの文字列で返す（gzipを展開できない古いブラウザ用）
 * ・省略：従来どおり行ごとのオブジェクトの配列（rows）で返す
 * 以降、読み込んだ範囲内での絞り込み・並べ替え・集計はブラウザ側（Javascript.html）で行う。
 */
function getBootstrapData(rangeOption) {
  var tStart = new Date().getTime();
  var timing = {};
  var status = getSetupStatus();
  var ctx = getCurrentUserContext_();
  var base = bootstrapBase_(status, ctx);
  var emptyRows = function (extra) {
    var o = Object.assign({}, base, extra, { columnOrder: null, rows: [], staffNameMap: {}, meta: null });
    return o;
  };

  if (!status.ready) return emptyRows({ ready: false, accessDenied: false });
  if (!ctx.bootstrapMode && !ctx.registered) return emptyRows({ ready: true, accessDenied: true });
  // 「スタッフ権限」シートに登録はあるが、権限欄が空欄、または社員／所長・チーフ／AL／マスタ権限の
  // いずれでもない値になっている場合は、「データが空」と区別して明示的に知らせる。
  if (!ctx.bootstrapMode && ctx.registered && ROLES.indexOf(ctx.role) === -1) {
    return emptyRows({ ready: true, accessDenied: false, invalidRole: true });
  }

  var sheet = getDataSheet_();
  var window_ = resolveListWindow_(rangeOption);
  var includeArchive = !!(rangeOption && rangeOption.includeArchive);
  var packing = rangeOption && rangeOption.packing;
  var props = PropertiesService.getDocumentProperties();
  var version = getDataVersion_();
  var lastRow = sheet.getLastRow();

  var packedB64 = null, totalInRoleScope = 0, excludedByWindow = 0, archivedRowCount = 0, codes = [];
  var responseKey = CACHE_PREFIX_ + 'r:' + version + ':' + lastRow + ':' +
    hashText_(scopeKeyOf_(ctx) + '|' + (window_.from || '') + '~' + (window_.to || ''));

  var cachedResponse = null;
  if (!includeArchive) {
    try { cachedResponse = cacheGetLarge_(responseKey); } catch (e) { cachedResponse = null; }
  }
  if (cachedResponse && cachedResponse.extra) {
    packedB64 = cachedResponse.text;
    totalInRoleScope = cachedResponse.extra.total;
    excludedByWindow = cachedResponse.extra.excluded;
    codes = cachedResponse.extra.codes || [];
    timing.snapshot = 'response-cache';
  } else {
    var loaded = loadSnapshot_(sheet, version, lastRow, timing);
    var snap = loaded.snap;
    var mainDistinct = { offices: distinctOf_(snap.cols.office), areas: distinctOf_(snap.cols.area) };
    var affIndex = buildAffiliationIndex_(mainDistinct.offices, mainDistinct.areas);
    var tSel = new Date().getTime();
    var sel = selectRows_(snap, ctx, window_, affIndex);
    totalInRoleScope = sel.totalInRoleScope;
    excludedByWindow = sel.totalInRoleScope - sel.indices.length;
    codes = sel.codes;
    var parts = [{ cols: snap.cols, n: snap.n, indices: sel.indices }];
    var keys = SNAPSHOT_KEYS_;
    if (includeArchive) {
      var arc = getArchivePart_(ctx, window_, mainDistinct);
      if (arc.part) {
        parts.push(arc.part);
        keys = SNAPSHOT_KEYS_.concat(['isArchived']);
        archivedRowCount = arc.part.indices.length;
        totalInRoleScope += arc.totalInRoleScope;
        excludedByWindow += arc.excludedByWindow;
        var seenCode = {};
        codes.forEach(function (c) { seenCode[c] = true; });
        arc.codes.forEach(function (c) { if (!seenCode[c]) { seenCode[c] = true; codes.push(c); } });
      }
    }
    if (parts.length === 1 && sel.indices.length === snap.n) {
      packedB64 = loaded.packedAllB64; // 全行が対象なら、写しの文字列をそのまま使う
    } else {
      packedB64 = gzipBase64_(packColumnar_(parts, keys));
    }
    timing.selectPackMs = new Date().getTime() - tSel;
    if (!includeArchive) {
      cachePutLarge_(responseKey, packedB64, { total: totalInRoleScope, excluded: excludedByWindow, codes: codes });
    }
  }

  var columnOrder = null;
  var columnOrderRaw = props.getProperty('dataListColumnOrder');
  if (columnOrderRaw) {
    try { columnOrder = JSON.parse(columnOrderRaw); } catch (e) { columnOrder = null; }
  }

  var result = Object.assign({}, base, {
    ready: true,
    accessDenied: false,
    invalidRole: false,
    columnOrder: columnOrder,
    staffNameMap: staffNameMapFor_(codes),
    meta: {
      totalRows: null, // 下で設定する
      window: window_,
      totalRowsInYourScope: totalInRoleScope,
      excludedByWindow: excludedByWindow,
      includesArchive: includeArchive,
      archivedRowCount: archivedRowCount,
      lastImportedAt: props.getProperty('lastImportedAt') || null,
      lastImportedFile: props.getProperty('lastImportedFile') || null,
      sheetUrl: ctx.role === ROLE_MASTER ? SpreadsheetApp.getActiveSpreadsheet().getUrl() : null,
      serverVersion: SERVER_VERSION,
      dataVersion: version,
      changeWatchInstalled: props.getProperty(CHANGE_WATCH_PROP_) === '1',
      spreadsheetTimeZone: ctx.role === ROLE_MASTER ? spreadsheetTimeZoneSafe_() : null,
      timing: timing
    }
  });

  if (packing === 'gzip') {
    result.packedRows = packedB64;
    result.packing = 'gzip';
    result.meta.totalRows = totalInRoleScope - excludedByWindow;
    result.meta.packedChars = packedB64.length;
  } else {
    var unpacked = unpackColumnar_(gunzipBase64_(packedB64));
    if (packing === 'col') {
      result.packedRows = JSON.stringify({ f: PACKED_FORMAT_, n: unpacked.n, k: Object.keys(unpacked.cols), c: Object.keys(unpacked.cols).map(function (k) { return { v: unpacked.cols[k] }; }) });
      result.packing = 'col';
    } else {
      result.rows = columnarToRows_(unpacked.n, unpacked.cols, Object.keys(unpacked.cols));
    }
    result.meta.totalRows = unpacked.n;
  }
  timing.serverMs = new Date().getTime() - tStart;
  return result;
}

/**
 * 所属の照合状況の診断（マスタ権限のみ。データ管理タブの「所属の照合状況を確認」から呼ぶ）。
 * スタッフ権限シートの各アカウント（同じアカウントが複数行あれば、ログイン時と同じく一番下の行）について、
 * 実際の閲覧判定と同じ処理で「何件の予約が見えるか」を数え、0件のアカウントや、表記が紛らわしいため
 * 自動では一致させていない所属名を一覧にする。閲覧範囲を推測で広げることはしない（直すのはシートの所属欄）。
 */
function getAffiliationDiagnostics() {
  assertMaster_();
  var sheet = getDataSheet_();
  var loaded = loadSnapshot_(sheet, getDataVersion_(), sheet.getLastRow(), {});
  var cols = loaded.snap.cols;
  var countOf = function (arr) {
    var m = Object.create(null);
    for (var i = 0; i < arr.length; i++) { var v = arr[i]; if (v === null || v === undefined || v === '') continue; m[v] = (m[v] || 0) + 1; }
    return m;
  };
  var officeCount = countOf(cols.office), areaCount = countOf(cols.area);
  var offices = Object.keys(officeCount), areas = Object.keys(areaCount);
  var affIndex = buildAffiliationIndex_(offices, areas);

  var latestByEmail = {};
  listStaffAccess_().forEach(function (s) {
    var key = String(s.email || '').trim().toLowerCase();
    if (key) latestByEmail[key] = s;
  });
  var staff = Object.keys(latestByEmail).map(function (key) {
    var s = latestByEmail[key];
    var ctx = { role: String(s.role || '').trim(), office: s.office, area: s.area };
    var item = { email: s.email, name: s.name, role: ctx.role, office: s.office, area: s.area, matchedRows: 0, matchedValues: [], problem: '' };
    if (ROLES.indexOf(ctx.role) === -1) { item.problem = '権限欄が「社員／所長・チーフ／AL／マスタ権限」のいずれでもないため、何も表示されません。'; return item; }
    if (ctx.role === ROLE_MASTER || ctx.role === ROLE_AL) { item.matchedRows = loaded.snap.n; return item; }
    var isManager = ctx.role === ROLE_MANAGER;
    var mine = isManager ? s.area : s.office;
    if (!affiliationText_(mine)) { item.problem = (isManager ? '所属エリア' : '所属店舗') + 'が空欄のため、何も表示されません。'; return item; }
    var match = buildScopeMatcher_(ctx, offices, areas, affIndex);
    (isManager ? areas : offices).forEach(function (v) {
      if (isManager ? match('', v) : match(v, '')) { item.matchedRows += (isManager ? areaCount : officeCount)[v]; item.matchedValues.push(v); }
    });
    if (item.matchedRows === 0) {
      var kindIndex = isManager ? affIndex.area : affIndex.office;
      var mineForHint = isManager ? mine : (officeWithoutAreaPrefix_(s.office, s.area) || mine);
      item.suggestions = similarAffiliations_(mineForHint, isManager ? areaCount : officeCount);
      item.problem = kindIndex.ambiguous[affiliationKey_(mineForHint)]
        ? '同じ名前で番号の違う' + (isManager ? 'エリア' : '店舗') + 'が予約データに複数あり、どれか決められないため、何も表示されません。所属欄に番号付き（例：717:○○）で入力してください。'
        : '予約データに、この' + (isManager ? '所属エリア' : '所属店舗') + 'と一致する' + (isManager ? 'エリア' : '営業所') + 'がありません（表記の違い・店舗名ではなく部署名が入っている等）。';
    }
    return item;
  });
  var ambiguousList = function (kindIndex, counts) {
    var groups = {};
    Object.keys(counts).forEach(function (v) {
      var k = affiliationKey_(affiliationText_(v));
      if (kindIndex.ambiguous[k]) (groups[k] = groups[k] || []).push({ value: v, count: counts[v] });
    });
    return Object.keys(groups).map(function (k) { return { key: k, values: groups[k] }; });
  };
  var countList = function (counts) {
    return Object.keys(counts).map(function (v) { return { value: v, count: counts[v] }; })
      .sort(function (x, y) { return y.count - x.count || String(x.value).localeCompare(String(y.value), 'ja'); });
  };
  return {
    totalRows: loaded.snap.n,
    staff: staff,
    ambiguous: { office: ambiguousList(affIndex.office, officeCount), area: ambiguousList(affIndex.area, areaCount) },
    dataOffices: countList(officeCount),
    dataAreas: countList(areaCount)
  };
}

/**
 * 診断の表示用：所属欄の表記と名前が近い、予約データ上の営業所・エリア（最大3件）。
 * 比較用表記の一方が他方を含むものを挙げるだけで、閲覧範囲の判定には使わない（直すかどうかは管理者が判断する）。
 */
function similarAffiliations_(mine, counts) {
  var k = affiliationKey_(mine);
  if (!k || k.length < 2) return [];
  var out = [];
  Object.keys(counts).forEach(function (v) {
    var kv = affiliationKey_(v);
    if (kv && kv.length >= 2 && (k.indexOf(kv) !== -1 || kv.indexOf(k) !== -1)) out.push({ value: v, count: counts[v] });
  });
  out.sort(function (x, y) { return y.count - x.count; });
  return out.slice(0, 3);
}

/**
 * データ変更の直後に画面から（結果を待たずに）呼ばれ、次に画面を開く人のために写しを作り直しておく。
 * 既に今の版の写しがあれば何もしない。同時に複数呼ばれても、作り直すのは1件だけにする。
 */
function warmSnapshot() {
  var ctx = getCurrentUserContext_();
  if (!ctx.bootstrapMode && !ctx.registered) return { ok: false };
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(0)) return { ok: true, skipped: 'busy' };
  try {
    var sheet = getDataSheet_();
    var timing = {};
    var loaded = loadSnapshot_(sheet, getDataVersion_(), sheet.getLastRow(), timing);
    return { ok: true, source: loaded.source, timing: timing };
  } finally {
    lock.releaseLock();
  }
}

/**
 * シートのデータ行を、フロントエンドで扱いやすい「正規形」のオブジェクト配列に変換する。
 * 日付は 'yyyy-MM-dd' 文字列、数値は Number（空欄は null）、文字は String に統一する。
 * この正規形は importCsv() 側の変換結果とも一致させている（重複判定や書き戻しを共通化するため）。
 */
function readAllRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, ALL_COLUMNS.length).getValues();
  var rows = [];
  for (var r = 0; r < values.length; r++) {
    var raw = values[r];
    var isBlank = raw.every(function (v) { return v === '' || v === null; });
    if (isBlank) continue;

    var obj = {};
    for (var c = 0; c < ALL_COLUMNS.length; c++) {
      var col = ALL_COLUMNS[c];
      obj[col.key] = normalizeCellValue_(col, raw[c]);
    }
    obj.rowIndex = r + 2; // シート上の実行番号（1始まり）。編集APIの対象行指定に使う。
    rows.push(obj);
  }
  return rows;
}

var scriptTimeZoneMatches_ = null;

/**
 * 日付を 'yyyy-MM-dd' にする。Utilities.formatDate は1回ごとにGoogle側の処理を呼ぶため、数万件の日付を
 * 変換すると起動が遅くなる。スクリプトの時刻帯がTIMEZONEと同じなら、JavaScriptの日付計算の結果は
 * Utilities.formatDate(v, TIMEZONE, ...) と必ず一致するため、その場合だけ高速な計算で求める。
 */
function formatIsoDate_(d) {
  if (scriptTimeZoneMatches_ === null) {
    try { scriptTimeZoneMatches_ = Session.getScriptTimeZone() === TIMEZONE; } catch (e) { scriptTimeZoneMatches_ = false; }
  }
  if (!scriptTimeZoneMatches_) return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
  var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  if (isNaN(y)) return null;
  return (y < 1000 ? ('000' + y).slice(-4) : String(y)) + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

/** シートのセル値1つを、項目の型に応じた正規形（日付=文字列/数値=Number/文字=String）に変換する。 */
function normalizeCellValue_(col, v) {
  if (col.type === 'date') {
    if (v instanceof Date) return formatIsoDate_(v);
    if (v === '' || v === null || v === undefined) return null;
    // スプレッドシートを直接編集して「2026/10/5」のような文字列として入った日付も、CSV取込時
    // （convertValue_）と同じ 'yyyy-MM-dd' にそろえる。そろえないと、表示期間の判定（文字列の大小比較）・
    // 重複判定・画面の日付入力欄への表示がずれる。日付として読めない文字列はそのまま返す。
    var dm = String(v).trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    return dm ? dm[1] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2) : String(v);
  }
  if (col.type === 'number') {
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    // 「1,000」のような桁区切り付きの文字列も数値として読み、「-」等の数値でない文字列は空欄扱いにする
    // （CSV取込時のconvertValue_と同じ扱い。NaNのまま集計や書き戻しに使われるのを防ぐ）。
    var numText = String(v).replace(/,/g, '').trim();
    if (numText === '') return null;
    var n = Number(numText);
    return isNaN(n) ? null : n;
  }
  if (col.key === 'reservationNo' && typeof v === 'number') {
    return zeroPadReservationNo_(v);
  }
  return (v === null || v === undefined) ? '' : String(v);
}

/**
 * 予約番号（チャレンジ番号）がシート上で数値化され、先頭の0が失われてしまった値を
 * 本来の桁数（11桁）に復元する。数字だけの予約番号は必ず11桁という前提のもとの処理。
 */
function zeroPadReservationNo_(numericValue) {
  var digits = String(numericValue);
  if (digits.length >= RESERVATION_NO_DIGIT_LENGTH) return digits;
  return ('00000000000' + digits).slice(-RESERVATION_NO_DIGIT_LENGTH);
}

/** 正規形の値1つを、シートに書き込むセル値（Date/Number/String）に変換する。 */
/**
 * シートへ書き込む文字列が「=」「+」「-」「@」で始まる場合、先頭に ' を付けて文字のまま保存させる。
 * 付けないと「=要確認」のようなメモや取込データが数式として扱われ、値が壊れる（外部へ情報を送る数式を
 * 仕込まれる危険もある）。' は表示されず、読み出した値にも含まれないため、照合や重複判定には影響しない。
 */
function protectSheetText_(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
}
function protectSheetRows_(rows) {
  return rows.map(function (row) { return row.map(protectSheetText_); });
}

function cellValueFor_(col, v) {
  if (v === null || v === undefined || v === '') return '';
  if (col.type === 'date') {
    var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
  }
  return v;
}

// ============================================================================
// CSVインポート（対象はCSV由来の19項目のみ。現場入力項目は空欄のまま追加する）
// ============================================================================

/**
 * 見出しセルの "006:エリア" のような表記から、番号プレフィックスを除いた
 * ラベル部分だけを取り出す。列の並び順が変わっても項目名だけで判定できるようにする。
 */
function normalizeHeaderLabel_(raw) {
  if (raw === null || raw === undefined) return '';
  // Excelの見出しはセル内で改行されていることがあるため、改行を除いてから判定する。
  var s = String(raw).replace(/^﻿/, '').replace(/[\r\n]+/g, '').trim();
  var m = s.match(/^\d{3}\s*[:：]\s*([\s\S]+)$/);
  return (m ? m[1] : s).trim();
}

/**
 * CSVの先頭数行の中から見出し行を推定し、19項目それぞれが何列目にあるかを求める。
 * 列の並び順や余分な列があっても、項目名の一致だけで抽出できるようにするための処理。
 */
var HEADER_SCAN_ROWS_ = 20; // 見出し行を探す範囲（先頭に表題や集計が入っているExcelにも対応するため。Excel取込の画面側の判定と同じ）

function detectHeaderRow_(matrix) {
  var bestRow = -1, bestCount = -1, bestMap = null;
  var scanLimit = Math.min(matrix.length, HEADER_SCAN_ROWS_);
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
  if (col.key === 'reservationNo' && /^\d+$/.test(s) && s.length > 0 && s.length < RESERVATION_NO_DIGIT_LENGTH) {
    // CSVを作る側（Excel等）で既に先頭の0が失われた数字だけの予約番号も、シート上で数値化された場合
    // (normalizeCellValue_)と同様に11桁へ復元する。先頭0を保ったまま文字列として届いた場合は
    // 既に11桁あるのでここには来ない。
    return zeroPadReservationNo_(s);
  }
  return s; // text: "10:郊外エリア" のような表記もそのまま保持する
}

/**
 * 正規形1行分のオブジェクトから、CSV由来19項目の完全一致による重複判定キーを作る。
 * 「19項目が一致する行＝同じ行」とみなし、CSVを重ねて取り込んでも増殖しないようにする。
 * 現場入力項目（CHK日・保険など）はキーに含めない（値が違っても同じ予約とみなす）。
 */
function buildDedupeKey_(record) {
  // 区切り文字（制御文字\u0001。通常のデータには含まれない）を挟んで連結する。
  // 区切り文字が無いと、例えば customerId="12"+reservationNo="345" と customerId="123"+reservationNo="45"
  // のように、隣接する列の値の桁数が違うだけで連結結果が一致してしまい、別の予約データを誤って
  // 「重複」と判定してしまう（CSVインポート時にスキップされる／重複削除で消去される）。
  return COLUMNS.map(function (col) {
    var v = record[col.key];
    return (v === null || v === undefined) ? '' : String(v);
  }).join('\u0001');
}

/** 行オブジェクトのうち、現場入力項目が何個埋まっているかを数える（重複統合時の優先判定に使う）。 */
function countFilledEditableFields_(record) {
  var n = 0;
  EDITABLE_COLUMNS.forEach(function (col) {
    var v = record[col.key];
    if (v !== null && v !== undefined && v !== '') n++;
  });
  return n;
}

/**
 * 正規形の行データ配列を、シートに書き込むためのセル値（Date/Number/String）の配列へ変換する。
 * CSV由来19項目に無いキー（現場入力項目）は、値が無ければ空欄になる。
 */
function recordsToSheetRows_(records) {
  return records.map(function (rec) {
    return ALL_COLUMNS.map(function (col) { return cellValueFor_(col, rec[col.key]); });
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
  ALL_COLUMNS.forEach(function (col, i) {
    var range = sheet.getRange(startRow, i + 1, numRows, 1);
    if (col.type === 'date') range.setNumberFormat('yyyy/mm/dd');
    else if (col.type === 'number') range.setNumberFormat('#,##0');
    else range.setNumberFormat('@'); // 顧客ID・予約番号などの先頭0落ち・数値化を防ぐ
  });
}

/**
 * 「予約データ」シートのデータ行を、recordsの内容で丸ごと置き換える（重複削除・アーカイブ・全削除用）。
 * ・先に2行目から上書きし、その後で余った下の行を削除する。以前は「全行の中身を消してから
 *   書き戻す」順序だったため、書き戻しの途中で失敗（実行時間の上限・一時的なエラー）すると、
 *   残すはずのデータがシートから消えてしまう危険があった。この順序なら、途中で失敗しても
 *   元のデータが消えることはない（最悪でも古い行が下に残るだけで、失われはしない）。
 * ・余った行は中身を消すだけでなく行ごと削除する。スプレッドシートのセル数の上限や重さは、
 *   値の入っているセル数ではなく、シートの行数×列数で決まるため、行を削除しないと
 *   アーカイブしても容量が減らない。
 * ・見出しより下の行をすべて削除することはできない（スプレッドシートの制約）ため、
 *   0件になる場合も空の2行目だけは残す。
 */
function rewriteDataRows_(sheet, records) {
  var n = records.length;
  if (n > 0) {
    ensureRowCapacity_(sheet, n + 1);
    applyColumnFormats_(sheet, 2, n);
    // 表示形式（文字列は@）の変更を書き込み前に確定させ、数値化による先頭0落ちを防ぐ。
    SpreadsheetApp.flush();
    sheet.getRange(2, 1, n, ALL_COLUMNS.length).setValues(protectSheetRows_(recordsToSheetRows_(records)));
  } else {
    sheet.getRange(2, 1, 1, sheet.getMaxColumns()).clearContent();
  }
  var firstStaleRow = Math.max(n + 2, 3);
  var maxRows = sheet.getMaxRows();
  if (maxRows >= firstStaleRow) {
    sheet.deleteRows(firstStaleRow, maxRows - firstStaleRow + 1);
  }
}

/** 正規形レコードの配列をシート末尾へ追記する。 */
function appendRecords_(sheet, records) {
  if (records.length === 0) return;
  var startRow = sheet.getLastRow() + 1;
  ensureRowCapacity_(sheet, startRow + records.length - 1);
  applyColumnFormats_(sheet, startRow, records.length);
  // 表示形式（文字列は@）の変更を書き込み前に確定させ、数値化による先頭0落ちを防ぐ。
  SpreadsheetApp.flush();
  var values = recordsToSheetRows_(records);
  sheet.getRange(startRow, 1, values.length, ALL_COLUMNS.length).setValues(protectSheetRows_(values));
}

/**
 * CSV取込時に、アーカイブ済みの予約と同じ行を見分けるための重複判定キーの集合を返す。
 * importCsvの重複チェックは本体シートしか見ていないため、これが無いと、アーカイブ後に過去の
 * 営業日報CSVを取り込み直した場合に、アーカイブ済みの予約が「新規」として本体へ戻ってしまう。
 * アーカイブされ得るのは出発予定日がこれまでの基準日より前の行だけなので、取込対象にそのような行が
 * 無ければアーカイブ先は開かない（通常の取込を遅くしないため）。照合が不要・不可能な場合はnull。
 */
function getArchivedKeysIfNeeded_(records) {
  var props = PropertiesService.getDocumentProperties();
  var id = props.getProperty(ARCHIVE_SPREADSHEET_ID_PROP_);
  if (!id || records.length === 0) return null;
  // 基準日の記録が無い（この照合機能の追加前にアーカイブした）場合は、出発予定日のある行すべてを対象にする。
  var maxCutoff = props.getProperty(ARCHIVE_MAX_CUTOFF_PROP_);
  var needed = records.some(function (r) { return r.departureDate && (!maxCutoff || r.departureDate < maxCutoff); });
  if (!needed) return null;
  var archiveSheet;
  try {
    archiveSheet = SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
  } catch (e) {
    return null; // アーカイブ先が削除済み等で開けない場合は照合しない。
  }
  if (!archiveSheet) return null;
  var keys = {};
  readAllRows_(archiveSheet).forEach(function (r) { keys[buildDedupeKey_(r)] = true; });
  return keys;
}

/**
 * 取込の入力を2次元配列（行×列の文字列）にする。
 * ・文字列：CSVファイルの中身（Utilities.parseCsvで分解する）
 * ・{matrix:[[...],...]}：Excelファイルを画面側で読み取った表（CSVを経由しないため、セル内の改行やカンマも崩れない）
 */
function parseImportInput_(input) {
  if (input && typeof input === 'object') {
    if (!Array.isArray(input.matrix)) throw new Error('取り込むデータの形式が正しくありません。');
    return input.matrix.map(function (row) {
      if (!Array.isArray(row)) throw new Error('取り込むデータの形式が正しくありません。');
      return row.map(function (v) { return (v === null || v === undefined) ? '' : String(v); });
    });
  }
  if (!input || !String(input).trim()) {
    throw new Error('CSVの内容が空です。ファイルをご確認ください。');
  }
  try {
    return Utilities.parseCsv(input);
  } catch (e) {
    throw new Error('CSVの解析に失敗しました。ファイル形式・文字コードをご確認ください。（' + e.message + '）');
  }
}

/**
 * CSVテキストを取り込む（マスタ権限のみ）。
 * ・見出し行の位置と各項目の列位置は名前で判定するため、列順が変わっても対応できる。
 * ・対象19項目以外の列は読み捨てる。現場入力項目（CHK日・保険など）は空欄で追加する。
 * ・19項目すべてが完全一致する行は「重複」としてスキップする（重ねて取り込んでも増殖しない）。
 */
function importCsv(csvText, fileName) {
  assertSetupReady_();
  assertMaster_();
  var matrix = parseImportInput_(csvText);
  if (!matrix || matrix.length < 2) {
    throw new Error('CSVにデータ行が見つかりません。');
  }

  var headerInfo = detectHeaderRow_(matrix);

  // 既存データの重複チェックから追記までを排他ロックの中で行う。ロックが無いと、
  // 複数人が同時にCSVインポートした場合に、お互いの「既存行」の読み取りがすれ違って
  // 重複チェックが効かなくなったり、書き込み位置（末尾行）が衝突したりする。
  return withScriptLock_(function () {
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

  // アーカイブ済み（別スプレッドシートへ移動済み）の予約と同じ行は、本体へ再登録しない。
  var skippedArchived = 0;
  var archivedKeys = getArchivedKeysIfNeeded_(newRecords);
  if (archivedKeys) {
    newRecords = newRecords.filter(function (rec) {
      if (archivedKeys[buildDedupeKey_(rec)]) { skippedArchived++; return false; }
      return true;
    });
  }

  appendRecords_(sheet, newRecords);
  if (newRecords.length > 0) markDataChanged_();

  var props = PropertiesService.getDocumentProperties();
  props.setProperty('lastImportedAt', new Date().toISOString());
  props.setProperty('lastImportedFile', fileName || '');

  return {
    fileName: fileName || '',
    csvDataRows: matrix.length - headerInfo.rowIndex - 1,
    imported: newRecords.length,
    skippedDuplicate: skippedDuplicate,
    skippedArchived: skippedArchived,
    skippedBlank: skippedBlank,
    missingColumns: headerInfo.missingLabels,
    totalRows: Math.max(sheet.getLastRow() - 1, 0)
  };
  });
}

// ============================================================================
// 一覧表の編集（CHK日・保険/Wifi/TAViCA/キャンサポ・メモ）
// ============================================================================

/**
 * 編集系API（一括登録・まとめて保存）用に、編集対象の行だけをシートから読み込んでメモリ上に持つ。
 * ・読み込みは最初にまとめて行い、権限確認・値の変更はメモリ上で行い、最後に変更のあった行だけを
 *   書き戻す（読み込みと書き込みを交互に繰り返すと、1件ごとに確定処理が走り極端に遅くなるため）。
 * ・シート全体ではなく、対象行の付近（近い行どうしをまとめた範囲）だけを読む。データが増えても、
 *   保存にかかる時間が対象の件数にだけ比例するようにするため。対象行が散らばりすぎている場合は、
 *   読み込み回数を増やしすぎないよう、最初の対象行から最後の対象行までを1回で読む。
 */
var EDIT_READ_CLUSTER_GAP_ = 50;
var EDIT_READ_MAX_CLUSTERS_ = 20;

function loadSheetForEdit_(sheet, rowIndexes) {
  var lastRow = sheet.getLastRow();
  var seen = {}, wanted = [];
  (rowIndexes || []).forEach(function (raw) {
    var r = Number(raw);
    if (r >= 2 && r <= lastRow && Math.floor(r) === r && !seen[r]) { seen[r] = true; wanted.push(r); }
  });
  wanted.sort(function (a, b) { return a - b; });
  var clusters = [];
  wanted.forEach(function (r) {
    var last = clusters[clusters.length - 1];
    if (last && r - last.end <= EDIT_READ_CLUSTER_GAP_) last.end = r; else clusters.push({ start: r, end: r });
  });
  if (clusters.length > EDIT_READ_MAX_CLUSTERS_) {
    clusters = [{ start: wanted[0], end: wanted[wanted.length - 1] }];
  }
  var rows = {};
  clusters.forEach(function (cl) {
    var values = sheet.getRange(cl.start, 1, cl.end - cl.start + 1, ALL_COLUMNS.length).getValues();
    for (var i = 0; i < values.length; i++) {
      if (seen[cl.start + i]) rows[cl.start + i] = values[i];
    }
  });
  return { sheet: sheet, lastRow: lastRow, rows: rows, dirty: {}, affIndex: null, tokenMismatch: false };
}

/**
 * 表記ルールでの所属一致に取り違えの恐れが無いかを判定するための索引（予約データの所属名の一覧から作る）。
 * 保存のたびにシート全体を読まずに済むよう、所属名の2列だけを読み、結果は版番号ごとに保存して使い回す。
 */
function getAffiliationIndexFor_(sheet, lastRow) {
  var key = CACHE_PREFIX_ + 'a:' + getDataVersion_() + ':' + lastRow;
  try {
    var hit = cacheGetLarge_(key);
    if (hit) { var o = JSON.parse(hit.text); return buildAffiliationIndex_(o.o, o.a); }
  } catch (e) { /* キャッシュが使えない場合はシートから作る */ }
  var ai = ALL_COLUMN_INDEX_BY_KEY.area, oi = ALL_COLUMN_INDEX_BY_KEY.office;
  var first = Math.min(ai, oi), width = Math.abs(ai - oi) + 1;
  var vals = lastRow >= 2 ? sheet.getRange(2, first + 1, lastRow - 1, width).getValues() : [];
  var offices = distinctOf_(vals.map(function (r) { return normalizeCellValue_(ALL_COLUMNS[oi], r[oi - first]); }));
  var areas = distinctOf_(vals.map(function (r) { return normalizeCellValue_(ALL_COLUMNS[ai], r[ai - first]); }));
  cachePutLarge_(key, JSON.stringify({ o: offices, a: areas }), null);
  return buildAffiliationIndex_(offices, areas);
}

/**
 * 実行者が指定行を編集してよいかを確認し、行番号（数値）を返す。
 * ・社員=自店舗、所長・チーフ=自エリア以外の行は編集させない（AL・マスタは全件編集可）。
 * ・アーカイブ行（行番号にARCHIVE_ROW_INDEX_OFFSET_を足したもの）はシートの行数を超えるため、ここで拒否される。
 * ・token（画面に表示した時点の行トークン）が指定されていれば、今の行の内容と照合し、違えば拒否する。
 *   他の人の重複削除・アーカイブ・手作業での並べ替え等で行の位置が変わっていた場合に、
 *   別の予約の行へ誤って書き込むことを防ぐため。
 */
function checkRowEditable_(ctx, snap, rowIndexRaw, token) {
  if (!ctx.bootstrapMode && !ctx.registered) {
    throw new Error('アクセス権がありません。管理者にお問い合わせください。');
  }
  if (ROLES.indexOf(ctx.role) === -1) {
    throw new Error('アクセス権がありません。');
  }
  var rowIndex = Number(rowIndexRaw);
  var raw = snap.rows[rowIndex];
  if (!rowIndex || rowIndex < 2 || rowIndex > snap.lastRow || Math.floor(rowIndex) !== rowIndex || !raw) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  if (token && rowTokenFromRaw_(raw) !== token) {
    snap.tokenMismatch = true;
    throw new Error('この行は、画面を開いた後に内容が変わったか、行の位置が移動しています（他の方の重複削除・取込や、スプレッドシートでの直接の並べ替えなど）。画面を読み込み直してから、もう一度保存してください。');
  }
  var office = normalizeCellValue_(ALL_COLUMNS[ALL_COLUMN_INDEX_BY_KEY.office], raw[ALL_COLUMN_INDEX_BY_KEY.office]);
  var area = normalizeCellValue_(ALL_COLUMNS[ALL_COLUMN_INDEX_BY_KEY.area], raw[ALL_COLUMN_INDEX_BY_KEY.area]);
  var inScope = isRowInRoleScope_(ctx, office, area, null);
  if (inScope && (ctx.role === ROLE_STAFF || ctx.role === ROLE_MANAGER)) {
    // 表記が完全一致でなく表記ルールで一致した場合だけ、取り違えの恐れが無いかを索引で確かめる。
    var exact = ctx.role === ROLE_STAFF ? affiliationText_(ctx.office) === affiliationText_(office)
      : affiliationText_(ctx.area) === affiliationText_(area);
    if (!exact) {
      if (!snap.affIndex) snap.affIndex = getAffiliationIndexFor_(snap.sheet, snap.lastRow);
      inScope = isRowInRoleScope_(ctx, office, area, snap.affIndex);
    }
  }
  if (!inScope) {
    throw new Error(ctx.role === ROLE_MANAGER ? '自エリア以外のデータは編集できません。' : '自店舗以外のデータは編集できません。');
  }
  return rowIndex;
}

/** メモリ上の1セルを書き換え、その行を「書き戻しが必要な行」として記録する。 */
function setCellInMemory_(snap, rowIndex, columnKey, normalizedValue) {
  var idx = ALL_COLUMN_INDEX_BY_KEY[columnKey];
  snap.rows[rowIndex][idx] = cellValueFor_(ALL_COLUMNS[idx], normalizedValue);
  snap.dirty[rowIndex] = true;
}

/** 項目の型に応じた表示形式（文字列は@、数値は#,##0、日付はyyyy/mm/dd）。 */
function numberFormatFor_(col) {
  return col.type === 'date' ? 'yyyy/mm/dd' : (col.type === 'number' ? '#,##0' : '@');
}

/**
 * 変更のあった行の現場入力項目（CHK日〜メモの14列。CSV由来19列には触れない）だけを書き戻す。
 * 書き込み前に表示形式も設定し直す（メモ「3/4」が日付に、先頭0の値が数値に化けるのを防ぐ）。
 * 読み込みを挟まず書き込みだけを続けるため、スプレッドシート側でまとめて処理される。
 * 1行でも書き戻した場合や、行の照合に失敗した行があった場合は、データの版番号を更新して
 * 保存済みの写しを使わないようにする。
 */
function flushEditedRows_(sheet, snap) {
  var startCol = COLUMNS.length + 1;
  var formats = [EDITABLE_COLUMNS.map(numberFormatFor_)];
  var dirtyRows = Object.keys(snap.dirty);
  // 続いている行（例：10〜60行目）はまとめて1回で書き込み、シートへの呼び出し回数を減らす。
  // 変更の無い行は書き込まない（その間に直接入力された内容を、読み込み時点の値で上書きしないため）。
  var sorted = dirtyRows.map(Number).sort(function (a, b) { return a - b; });
  for (var i = 0; i < sorted.length; ) {
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    var runRows = [], runFormats = [];
    for (var k = i; k <= j; k++) {
      runRows.push(snap.rows[sorted[k]].slice(COLUMNS.length));
      runFormats.push(formats[0]);
    }
    var range = sheet.getRange(sorted[i], startCol, runRows.length, EDITABLE_COLUMNS.length);
    range.setNumberFormats(runFormats);
    range.setValues(protectSheetRows_(runRows));
    i = j + 1;
  }
  if (dirtyRows.length > 0 || snap.tokenMismatch) {
    SpreadsheetApp.flush(); // 書き込みを確定させてから版番号を変える（逆順だと、古い値の写しが新しい版番号で作られうる）
    bumpDataVersion_();
  }
}

/** 保険/Wifi/TAViCA/キャンサポのステータス値を確認する（空欄は「-（NO ACT）」として扱う）。 */
function normalizeAncillaryStatusInput_(status) {
  var s = (status === null || status === undefined) ? '' : String(status).trim();
  if (s === '') return '-';
  var ok = ANCILLARY_STATUS_OPTIONS.some(function (o) { return o.value === s; });
  if (!ok) throw new Error('ステータスの指定が不正です。');
  return s;
}

var ANCILLARY_QTY_REQUIRED_MESSAGE_ = '「〇（NB付帯）」「☆（PUSH成約）」の場合は数量を入力してください。';

/**
 * 付帯商品1件分（ステータス・数量・理由）をメモリ上に反映する。値の検証（数量の数値チェック等）を
 * すべて済ませてから書き換えるため、途中でエラーになっても「ステータスだけ書き換わって数量は
 * 元のまま」のような中途半端な状態にはならない。
 * ・×（失注）：数量は0固定、理由を保存
 * ・〇（NB付帯）／☆（PUSH成約）：数量を保存（理由は空にする）
 * ・それ以外（－／△）：数量・理由とも空にする
 */
function applyAncillaryInMemory_(snap, rowIndex, item, statusRaw, qtyRaw, reasonRaw) {
  var status = normalizeAncillaryStatusInput_(statusRaw);
  var qty = null, reason = null;
  if (status === '×') {
    qty = 0;
    reason = String(reasonRaw || '').trim() || null;
  } else if (status === '〇' || status === '☆') {
    qty = parseAncillaryQty_(qtyRaw);
    // 画面側でも止めているが、件数と数量合計の集計が合わなくなるため、サーバー側でも必ず確かめる。
    if (qty === null) throw new Error(ANCILLARY_QTY_REQUIRED_MESSAGE_);
  }
  setCellInMemory_(snap, rowIndex, item.statusKey, status);
  setCellInMemory_(snap, rowIndex, item.qtyKey, qty);
  setCellInMemory_(snap, rowIndex, item.reasonKey, reason);
}

/**
 * 複数行まとめて選択して同じ値を入力する「一括登録」機能（CHK日・メモ用）。
 * 付帯商品（保険/Wifi/TAViCA/キャンサポ）のステータスは bulkSetAncillaryStatus を使うこと。
 * 1件でも編集できない行があってもエラーで全体を止めず、成功した行数とエラー内容を返す。
 */
function bulkUpdateCellValue(rowIndexes, columnKey, value, rowTokens) {
  if (columnKey !== 'chkDate' && columnKey !== 'memo') {
    throw new Error('この項目は一括登録できません。');
  }
  return withScriptLock_(function () {
    var ctx = getCurrentUserContext_();
    var sheet = getDataSheet_();
    var snap = loadSheetForEdit_(sheet, rowIndexes);
    var col = ALL_COLUMNS[ALL_COLUMN_INDEX_BY_KEY[columnKey]];
    var normalized = normalizeEditableInput_(col, value);

    var updated = 0, errors = [];
    (rowIndexes || []).forEach(function (rowIndexRaw, i) {
      try {
        var rowIndex = checkRowEditable_(ctx, snap, rowIndexRaw, rowTokens && rowTokens[i]);
        setCellInMemory_(snap, rowIndex, columnKey, normalized);
        updated++;
      } catch (e) {
        errors.push({ rowIndex: rowIndexRaw, message: e.message });
      }
    });
    flushEditedRows_(sheet, snap);
    return { ok: true, updated: updated, errors: errors };
  });
}

/**
 * 複数行まとめて、同じ付帯商品（保険/Wifi/TAViCA/キャンサポ）に同じステータス（・数量・理由）を
 * 一括登録する。ステータスによる数量・理由の扱いは applyAncillaryInMemory_ を参照。
 */
function bulkSetAncillaryStatus(rowIndexes, itemKey, status, bulkQty, reason, rowTokens) {
  var item = ANCILLARY_ITEM_BY_KEY[itemKey];
  if (!item) throw new Error('付帯商品の指定が不正です。');
  // 値そのものの誤り（不正な数量・ステータス）は、行ごとのエラーではなく全体のエラーとして先に返す。
  normalizeAncillaryStatusInput_(status);
  parseAncillaryQty_(bulkQty);
  var bulkStatus = normalizeAncillaryStatusInput_(status);
  if ((bulkStatus === '〇' || bulkStatus === '☆') && parseAncillaryQty_(bulkQty) === null) {
    throw new Error(ANCILLARY_QTY_REQUIRED_MESSAGE_);
  }
  return withScriptLock_(function () {
    var ctx = getCurrentUserContext_();
    var sheet = getDataSheet_();
    var snap = loadSheetForEdit_(sheet, rowIndexes);

    var updated = 0, errors = [];
    (rowIndexes || []).forEach(function (rowIndexRaw, i) {
      try {
        var rowIndex = checkRowEditable_(ctx, snap, rowIndexRaw, rowTokens && rowTokens[i]);
        applyAncillaryInMemory_(snap, rowIndex, item, status, bulkQty, reason);
        updated++;
      } catch (e) {
        errors.push({ rowIndex: rowIndexRaw, message: e.message });
      }
    });
    flushEditedRows_(sheet, snap);
    return { ok: true, updated: updated, errors: errors };
  });
}

/**
 * 「まとめて保存する」機能：予約データ一覧の画面上でまだサーバーへ送っていない複数のセル編集を、
 * 1回のサーバー呼び出しでまとめて反映する。
 * changes の各要素は次のいずれかの形：
 *   ・CHK日／メモ： { kind:'field', rowIndex, token, columnKey:'chkDate'|'memo', value }
 *   ・保険/Wifi/TAViCA/キャンサポ： { kind:'ancillary', rowIndex, token, itemKey, status, qty, reason }
 *   （token は画面に表示した時点の行トークン。保存時に今の行と照合する）
 * 1件でも保存できない変更（他店舗・他エリアの行、不正な数量など）があってもエラーで全体を止めず、
 * 成功件数とエラー内容を返す。エラーには、画面側でどの変更が失敗したかを特定できるよう
 * rowIndex・kind・columnKey/itemKey を含める（失敗した変更だけを「未保存」のまま残すため）。
 */
function batchUpdateCells(changes) {
  return withScriptLock_(function () {
    var ctx = getCurrentUserContext_();
    var sheet = getDataSheet_();
    var snap = loadSheetForEdit_(sheet, (changes || []).map(function (c) { return c && c.rowIndex; }));
    var updated = 0, errors = [];

    (changes || []).forEach(function (change) {
      try {
        var rowIndex = checkRowEditable_(ctx, snap, change.rowIndex, change.token);
        if (change.kind === 'field') {
          if (change.columnKey !== 'chkDate' && change.columnKey !== 'memo') {
            throw new Error('この項目はまとめて保存できません。');
          }
          var col = ALL_COLUMNS[ALL_COLUMN_INDEX_BY_KEY[change.columnKey]];
          setCellInMemory_(snap, rowIndex, change.columnKey, normalizeEditableInput_(col, change.value));
        } else if (change.kind === 'ancillary') {
          var item = ANCILLARY_ITEM_BY_KEY[change.itemKey];
          if (!item) throw new Error('付帯商品の指定が不正です。');
          applyAncillaryInMemory_(snap, rowIndex, item, change.status, change.qty, change.reason);
        } else {
          throw new Error('不正な変更内容です。');
        }
        updated++;
      } catch (e) {
        errors.push({
          rowIndex: change && change.rowIndex,
          kind: change && change.kind,
          columnKey: change && change.columnKey,
          itemKey: change && change.itemKey,
          message: e.message
        });
      }
    });

    flushEditedRows_(sheet, snap);
    return { ok: true, updated: updated, errors: errors };
  });
}

/**
 * 保険/Wifi/TAViCA/キャンサポの数量を検証・正規化する。空欄はnull（未入力）として許可するが、
 * 数値として解釈できない値・負の値は拒否する（HTML側のinput type="number"は目安に過ぎず、
 * ブラウザの種類や直接のAPI呼び出しによっては不正な値が送られてくる可能性があるため、
 * サーバー側でも必ず検証する）。0以上の整数に丸める。
 */
function parseAncillaryQty_(value) {
  if (value === '' || value === null || value === undefined) return null;
  var n = Number(value);
  if (!isFinite(n) || n < 0) {
    throw new Error('数量には0以上の数値を入力してください。');
  }
  return Math.floor(n);
}

/** 編集項目の入力値を正規形（readAllRows_と同じ形）に変換する。 */
function normalizeEditableInput_(col, value) {
  if (value === null || value === undefined) return null;
  var s = String(value).trim();
  if (!s) return null;
  if (col.type === 'number') {
    var n = Number(s);
    return isNaN(n) ? null : n;
  }
  if (col.type === 'date') {
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? s.slice(0, 10) : null;
  }
  return s;
}

// ============================================================================
// 一覧表の列の並び順（チームで自由に変更できるようにする）
// ============================================================================

/** 保存済みの列順を返す。未保存なら null（クライアント側の既定順を使わせる）。 */
function getColumnOrderPreference() {
  var raw = PropertiesService.getDocumentProperties().getProperty('dataListColumnOrder');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/** 予約データ一覧に表示する列（Javascript.html の DISPLAY_COLUMN_DEFS と同じ21項目。列順として保存できるのはこれだけ）。 */
var DISPLAY_COLUMN_KEYS_ = ['reservationNo', 'staff', 'departureDate', 'chkDate', 'memo', 'insurance', 'wifi', 'cansapo', 'tavica',
  'bookingDate', 'destination', 'travelDays', 'productCategory', 'tourBrand', 'tourCode', 'carrier', 'salesAmount', 'paymentAmount',
  'sts', 'productTitle', 'office'];

/** 列順（キーの配列）をスプレッドシート単位で保存し、全員に反映させる。 */
function saveColumnOrderPreference(orderKeys) {
  // 全員の表示に反映される設定のため、アプリを使える（スタッフ権限に正しく登録された）人だけが変更できる。
  var ctx = getCurrentUserContext_();
  if (!ctx.bootstrapMode && (!ctx.registered || ROLES.indexOf(ctx.role) === -1)) {
    throw new Error('この操作を行う権限がありません。');
  }
  if (!Array.isArray(orderKeys) || !orderKeys.length) {
    throw new Error('列の並び順が空です。');
  }
  var allowed = {};
  DISPLAY_COLUMN_KEYS_.forEach(function (k) { allowed[k] = true; });
  var seen = {};
  var keys = orderKeys.filter(function (k) {
    if (typeof k !== 'string' || !allowed[k] || seen[k]) return false;
    seen[k] = true;
    return true;
  });
  if (!keys.length) throw new Error('列の並び順の内容が正しくありません。');
  PropertiesService.getDocumentProperties().setProperty('dataListColumnOrder', JSON.stringify(keys));
  return { ok: true };
}

// ============================================================================
// データ管理（重複削除・全削除）※マスタ権限のみ
// ============================================================================

/**
 * 完全一致（CSV由来19項目が同じ）の重複行を1件に統合する。
 * 複数行が重複している場合は、現場入力項目（CHK日・保険など）がより多く
 * 埋まっている行を優先して残す（入力済みの記録を誤って消さないため）。
 */
function removeDuplicateRows() {
  assertMaster_();
  // シート全体を読んで詰め直すため、他のユーザーの保存処理と重なると行番号がずれて
  // 無関係の行を上書きする事故につながる。排他ロックで同時実行を防ぐ。
  return withScriptLock_(function () {
  var sheet = getDataSheet_();
  var rows = readAllRows_(sheet);
  var bestByKey = {};
  var order = [];

  rows.forEach(function (r) {
    var key = buildDedupeKey_(r);
    if (!(key in bestByKey)) {
      bestByKey[key] = r;
      order.push(key);
    } else if (countFilledEditableFields_(r) > countFilledEditableFields_(bestByKey[key])) {
      bestByKey[key] = r;
    }
  });

  var deduped = order.map(function (k) { return bestByKey[k]; });
  var removed = rows.length - deduped.length;
  if (removed === 0) {
    return { removed: 0, totalRows: rows.length };
  }

  rewriteDataRows_(sheet, deduped);
  markDataChanged_();

  return { removed: removed, totalRows: deduped.length };
  });
}

/** データ行をすべて削除する（見出し行は残す）。confirmText が「削除」と完全一致した場合のみ実行する。 */
function clearAllData(confirmText) {
  assertMaster_();
  if (confirmText !== '削除') {
    throw new Error('確認文字列が一致しません。「削除」と入力してから実行してください。');
  }
  return withScriptLock_(function () {
  var sheet = getDataSheet_();
  rewriteDataRows_(sheet, []);
  markDataChanged_();
  var props = PropertiesService.getDocumentProperties();
  props.deleteProperty('lastImportedAt');
  props.deleteProperty('lastImportedFile');
  return { ok: true };
  });
}

// ============================================================================
// データアーカイブ（容量対策）※マスタ権限のみ
// ----------------------------------------------------------------------------
// 予約データが増え続けてもこのスプレッドシートが重くならないよう、指定した基準日より
// 古い（出発予定日が基準日より前の）行を、別スプレッドシート（アーカイブ）へ移動する。
// ・出発予定日が空欄の行はアーカイブの対象にしない（判断できないデータを誤って
//   動かさないため、常に「予約データ」シート側に残す）。
// ・現場入力項目（CHK日・保険など）も含め、行のすべての値をそのままアーカイブへ移す。
// ・アーカイブ先スプレッドシートは初回実行時に自動作成し、以後はそのスプレッドシートを使い回す
//   （ドキュメントプロパティにスプレッドシートIDを保存する）。
// ・アーカイブ後のデータは、画面を開いたときの既定表示には含まれない（既定表示を軽いままにするため）。
// 　「表示期間」の「アーカイブ済みデータも含める」を選んだときだけ、アーカイブ先スプレッドシートも
// 　あわせて読み込んで表示する（getArchivePart_）。閲覧専用で、この画面からは編集できない。
// ============================================================================

var ARCHIVE_SPREADSHEET_ID_PROP_ = 'archiveSpreadsheetId';
var ARCHIVE_LAST_RUN_PROP_ = 'lastArchivedAt';
var ARCHIVE_MAX_CUTOFF_PROP_ = 'archiveMaxCutoff';
var ARCHIVE_SPREADSHEET_NAME_ = APP_TITLE + '（アーカイブ）';
// アーカイブ行をブラウザへ返すときのrowIndexに足すオフセット。予約データシートが現実的に
// 到達しない大きさにしてあり、本体シートの行番号と絶対に衝突しないようにする
// （衝突すると、編集対象の行取り違えにつながるため）。このオフセットを超えるrowIndexで
// 編集APIが呼ばれても、本体シートの行数を超えるため「対象の行が見つかりません」で安全に拒否される。
var ARCHIVE_ROW_INDEX_OFFSET_ = 10000000;

/**
 * アーカイブ先のスプレッドシートを、元のスプレッドシートの編集者にも共有する（編集者として追加）。
 * 作成者（デプロイした人）のドライブに作られるため、共有しないと他のマスタ権限の人がリンクを開けない。
 * 元のスプレッドシートの編集者は、もともと全データを見られる人なので、見られる範囲は広がらない。
 */
function shareArchiveWithMainEditors_(archiveSs) {
  try {
    var main = SpreadsheetApp.getActiveSpreadsheet();
    var me = deployerEmail_();
    var emails = main.getEditors().map(function (u) { return String(u.getEmail() || '').trim(); })
      .filter(function (e) { return e && e.toLowerCase() !== me; });
    if (emails.length) archiveSs.addEditors(emails);
  } catch (e) {
    console.warn('shareArchiveWithMainEditors_: ' + e);
  }
}

/**
 * アーカイブ先スプレッドシートを取得する。ドキュメントプロパティに保存済みのIDがあればそれを使い、
 * 無い（または削除済みで開けない）場合は新規作成し、「予約データ」シートを本体と同じ列構成で用意する。
 */
function getOrCreateArchiveSpreadsheet_() {
  var props = PropertiesService.getDocumentProperties();
  var id = props.getProperty(ARCHIVE_SPREADSHEET_ID_PROP_);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // 保存されていたIDのスプレッドシートが削除済み等で開けない場合は、新規に作り直す。
    }
  }
  var ss = SpreadsheetApp.create(ARCHIVE_SPREADSHEET_NAME_);
  try { ss.setSpreadsheetTimeZone(TIMEZONE); } catch (e) { console.warn('archive timezone: ' + e); }
  shareArchiveWithMainEditors_(ss);
  var defaultSheet = ss.getSheets()[0];
  buildDataSheet_(ss);
  if (ss.getSheets().length > 1) { ss.deleteSheet(defaultSheet); }
  props.setProperty(ARCHIVE_SPREADSHEET_ID_PROP_, ss.getId());
  return ss;
}

/** アーカイブ先スプレッドシートのURLと最終実行日時を返す（マスタ権限のみ。「データ管理」タブの表示用）。 */
function getArchiveInfo() {
  assertMaster_();
  var props = PropertiesService.getDocumentProperties();
  var id = props.getProperty(ARCHIVE_SPREADSHEET_ID_PROP_);
  var url = null;
  if (id) {
    try { url = SpreadsheetApp.openById(id).getUrl(); } catch (e) { url = null; }
  }
  return {
    archiveSpreadsheetUrl: url,
    lastArchivedAt: props.getProperty(ARCHIVE_LAST_RUN_PROP_) || null
  };
}

/** 基準日（'yyyy-MM-dd'）の形式を確認する。不正な場合はエラーを投げる。 */
function assertValidDateString_(dateStr, label) {
  var s = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(label + 'の形式が正しくありません（例：2025-11-01）。');
  }
  return s;
}

/**
 * 指定した基準日より前（出発予定日 < cutoffDate）の行が何件あるか、実際には動かさずに確認する
 * （マスタ権限のみ。アーカイブ実行前の確認表示用）。
 */
function previewArchiveCandidates(cutoffDate) {
  assertMaster_();
  var cutoff = assertValidDateString_(cutoffDate, '基準日');
  var sheet = getDataSheet_();
  var rows = readAllRows_(sheet);
  var archivable = rows.filter(function (r) { return r.departureDate && r.departureDate < cutoff; }).length;
  return { archivable: archivable, totalRows: rows.length };
}

/**
 * 指定した基準日より前（出発予定日 < cutoffDate）の行を、アーカイブ先スプレッドシートへ移動する
 * （マスタ権限のみ）。confirmTextが「アーカイブ」と完全一致した場合のみ実行する。
 * 出発予定日が空欄の行は対象にせず、常に「予約データ」シート側に残す。
 */
function archiveOldReservations(cutoffDate, confirmText) {
  assertMaster_();
  if (confirmText !== 'アーカイブ') {
    throw new Error('確認文字列が一致しません。「アーカイブ」と入力してから実行してください。');
  }
  var cutoff = assertValidDateString_(cutoffDate, '基準日');

  // シート全体を読んで詰め直すため、他のユーザーの保存処理と重なると行番号がずれて
  // 無関係の行を上書きする事故につながる。排他ロックで同時実行を防ぐ。
  return withScriptLock_(function () {
  var sheet = getDataSheet_();
  var rows = readAllRows_(sheet);
  var toArchive = [];
  var toKeep = [];
  rows.forEach(function (r) {
    if (r.departureDate && r.departureDate < cutoff) {
      toArchive.push(r);
    } else {
      toKeep.push(r);
    }
  });

  var props = PropertiesService.getDocumentProperties();
  if (toArchive.length === 0) {
    return {
      archived: 0,
      kept: toKeep.length,
      archiveSpreadsheetUrl: null,
      lastArchivedAt: props.getProperty(ARCHIVE_LAST_RUN_PROP_) || null
    };
  }

  var archiveSs = getOrCreateArchiveSpreadsheet_();
  var archiveSheet = archiveSs.getSheetByName(SHEET_NAME);
  appendRecords_(archiveSheet, toArchive);

  // アーカイブ先への追記が終わってから本体を詰め直す。本体の書き戻しが途中で失敗しても、
  // 移動対象の行はアーカイブ先と本体の両方に残るだけで、どちらからも消えることはない。
  SpreadsheetApp.flush();
  rewriteDataRows_(sheet, toKeep);
  markDataChanged_();

  var now = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm');
  props.setProperty(ARCHIVE_LAST_RUN_PROP_, now);
  // CSV再取込時に「アーカイブ済みの予約を本体へ再登録してしまう」のを防ぐ照合（importCsv）で使う、
  // これまでに使った基準日のうち最も新しいもの。
  var prevMaxCutoff = props.getProperty(ARCHIVE_MAX_CUTOFF_PROP_);
  if (!prevMaxCutoff || cutoff > prevMaxCutoff) props.setProperty(ARCHIVE_MAX_CUTOFF_PROP_, cutoff);

  return {
    archived: toArchive.length,
    kept: toKeep.length,
    archiveSpreadsheetUrl: archiveSs.getUrl(),
    lastArchivedAt: now
  };
  });
}

// ============================================================================
// スタッフ権限の管理（マスタ権限のみ）
// ============================================================================

function getOrCreateStaffSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STAFF_SHEET_NAME);
  if (!sheet) sheet = buildStaffSheet_(ss);
  return sheet;
}

/** スタッフ権限の一覧を返す（マスタ権限のみ）。 */
function getStaffAccessList() {
  assertMaster_();
  return listStaffAccess_();
}

/**
 * スタッフ権限の一覧（権限確認なしの内部用）。追加・更新・削除の直後の一覧の返却に使う。
 * 更新・削除で実行者が自分自身をマスタ権限から外した場合、getStaffAccessList()を呼ぶと
 * その時点で権限確認に失敗し、保存は済んでいるのに画面には「マスタ権限のユーザーのみ実行できます」
 * というエラーが表示されてしまうため、保存直後の一覧はこちらで返す。
 */
function listStaffAccess_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var list = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (v) { return v === '' || v === null; })) continue;
    // ログイン時の判定（getCurrentUserContext_）と同じく前後の空白を除いて扱う。除かないと、シート上で
    // 「マスタ権限 」のように空白が混ざった行が、人事データ取込で別人扱い・マスタ以外の扱いになる。
    list.push({
      rowIndex: i + 2,
      email: String(row[0] || '').trim(),
      name: String(row[1] || '').trim(),
      office: String(row[2] || '').trim(),
      area: String(row[3] || '').trim(),
      role: String(row[4] || '').trim()
    });
  }
  return list;
}

function validateStaffInput_(email, role) {
  var s = String(email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) {
    throw new Error('正しいGoogleアカウント（メールアドレス）を入力してください。');
  }
  if (ROLES.indexOf(role) === -1) {
    throw new Error('権限の指定が不正です。');
  }
}

/** スタッフ権限シートの全データ行を [email, name, office, area, role] の配列で返す（見出し行を除く）。 */
function readStaffRows_(sheet) {
  var lastRow = sheet.getLastRow();
  return lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 5).getValues() : [];
}

/**
 * 変更後のスタッフ権限シートの内容（rows）に、マスタ権限のアカウントが1件以上残るかを確認する。
 * 同じGoogleアカウントの行が複数ある場合は、ログイン時の判定（getCurrentUserContext_）と同じく
 * 一番下の行だけを有効として数える。0件になる操作は、誰も権限管理・データ管理を行えなくなる
 * （スプレッドシートを直接編集する以外に復旧手段が無い）ため拒否する。
 * また、シートが空の間は全員がマスタ権限扱いになる仕組み（初期セットアップ用）があるため、
 * 最初の1件目にマスタ権限以外を登録すると、登録した本人もその瞬間に権限を失う。これも同じ確認で防ぐ。
 */
function assertMasterRemains_(rows, message) {
  var latestRoleByEmail = {};
  rows.forEach(function (r) {
    var email = String(r[0] || '').trim().toLowerCase();
    if (email) latestRoleByEmail[email] = String(r[4] || '').trim();
  });
  var hasMaster = Object.keys(latestRoleByEmail).some(function (e) { return latestRoleByEmail[e] === ROLE_MASTER; });
  if (!hasMaster) {
    throw new Error(message || 'この操作を行うと、マスタ権限のアカウントが1件も無くなり、誰も権限管理・データ管理を行えなくなります。先に別のアカウント（または自分自身）をマスタ権限で登録してください。');
  }
}

/** スタッフ権限を1件追加する（マスタ権限のみ）。 */
function addStaffAccess(email, name, office, area, role) {
  assertMaster_();
  validateStaffInput_(email, role);
  return withScriptLock_(function () {
  var sheet = getOrCreateStaffSheet_();
  var newRow = [String(email).trim().toLowerCase(), name || '', office || '', area || '', role];
  assertMasterRemains_(readStaffRows_(sheet).concat([newRow]));
  var rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, 5).setValues(protectSheetRows_([newRow]));
  return listStaffAccess_();
  });
}

/** スタッフ権限を1件更新する（マスタ権限のみ）。 */
function updateStaffAccess(rowIndex, email, name, office, area, role, expectedEmail) {
  assertMaster_();
  validateStaffInput_(email, role);
  return withScriptLock_(function () {
  var sheet = getOrCreateStaffSheet_();
  rowIndex = Number(rowIndex);
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  assertRowStillMatches_(sheet, rowIndex, expectedEmail, true);
  var newRow = [String(email).trim().toLowerCase(), name || '', office || '', area || '', role];
  var rowsAfter = readStaffRows_(sheet);
  rowsAfter[rowIndex - 2] = newRow;
  assertMasterRemains_(rowsAfter);
  sheet.getRange(rowIndex, 1, 1, 5).setValues(protectSheetRows_([newRow]));
  return listStaffAccess_();
  });
}

/**
 * 画面で選んだ行が、今もその人（Googleアカウント／担当者コード）の行かを確かめる。
 * 画面を開いた後に、別の管理者が上の行を削除するなどして行の位置がずれていると、
 * 行番号だけで編集・削除すると無関係の別人の行を書き換えてしまうため。
 * expected が渡されない場合（更新前の古い画面からの呼び出し）は確認しない。
 */
function assertRowStillMatches_(sheet, rowIndex, expected, isEmail) {
  if (expected === undefined || expected === null) return;
  var actual = String(sheet.getRange(rowIndex, 1).getValue() || '').trim();
  var want = String(expected).trim();
  if (isEmail) { actual = actual.toLowerCase(); want = want.toLowerCase(); }
  if (actual !== want) {
    throw new Error('一覧が古くなっています（他の方の編集で行の位置が変わった可能性があります）。画面を読み込み直してから、もう一度操作してください。');
  }
}

/**
 * 1行を削除する。見出し行を固定しているシートでは「固定されていない行をすべて削除する」ことが
 * できない（エラーになる）ため、データ行が最後の1行しか無い場合は、行を消さずに中身だけを消す。
 */
function deleteSheetRowSafe_(sheet, rowIndex) {
  var frozen = 0;
  try { frozen = sheet.getFrozenRows() || 0; } catch (e) { frozen = 0; }
  if (sheet.getMaxRows() - Math.max(frozen, 1) <= 1) {
    sheet.getRange(rowIndex, 1, 1, sheet.getMaxColumns()).clearContent();
  } else {
    sheet.deleteRow(rowIndex);
  }
}

/** スタッフ権限を1件削除する（マスタ権限のみ）。 */
function deleteStaffAccess(rowIndex, expectedEmail) {
  assertMaster_();
  return withScriptLock_(function () {
  var sheet = getOrCreateStaffSheet_();
  rowIndex = Number(rowIndex);
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  assertRowStillMatches_(sheet, rowIndex, expectedEmail, true);
  var rowsAfter = readStaffRows_(sheet);
  rowsAfter.splice(rowIndex - 2, 1);
  assertMasterRemains_(rowsAfter);
  deleteSheetRowSafe_(sheet, rowIndex);
  return listStaffAccess_();
  });
}

// ============================================================================
// 担当者マスタ（CSVの「担当者」コードを氏名表示に変換するための対応表）※マスタ権限のみ編集可
// ============================================================================

function getOrCreateStaffNameSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STAFF_NAME_SHEET_NAME);
  if (!sheet) sheet = buildStaffNameSheet_(ss);
  return sheet;
}

/** 担当者コード→氏名の対応表を返す（一覧表示・個人別サマリーで担当者名に変換するのに使う）。 */
function getStaffNameMap_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_NAME_SHEET_NAME);
  var map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    var code = String(values[i][0] || '').trim();
    var name = String(values[i][1] || '').trim();
    if (code && name) map[code] = name;
  }
  return map;
}

/** 担当者マスタの一覧を返す（マスタ権限のみ）。 */
function getStaffNameList() {
  assertMaster_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_NAME_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  var list = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (v) { return v === '' || v === null; })) continue;
    list.push({ rowIndex: i + 2, code: String(row[0] || '').trim(), name: String(row[1] || '').trim() });
  }
  return list;
}

function validateStaffNameInput_(code, name) {
  if (!String(code || '').trim()) throw new Error('担当者コードを入力してください。');
  if (!String(name || '').trim()) throw new Error('氏名を入力してください。');
}

/** 担当者マスタを1件追加する（マスタ権限のみ）。 */
function addStaffName(code, name) {
  assertMaster_();
  validateStaffNameInput_(code, name);
  return withScriptLock_(function () {
  var sheet = getOrCreateStaffNameSheet_();
  var rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, 2).setNumberFormat('@').setValues(protectSheetRows_([[String(code).trim(), String(name).trim()]]));
  return getStaffNameList();
  });
}

/** 担当者マスタを1件更新する（マスタ権限のみ）。 */
function updateStaffName(rowIndex, code, name, expectedCode) {
  assertMaster_();
  validateStaffNameInput_(code, name);
  return withScriptLock_(function () {
  var sheet = getOrCreateStaffNameSheet_();
  rowIndex = Number(rowIndex);
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  assertRowStillMatches_(sheet, rowIndex, expectedCode, false);
  sheet.getRange(rowIndex, 1, 1, 2).setNumberFormat('@').setValues(protectSheetRows_([[String(code).trim(), String(name).trim()]]));
  return getStaffNameList();
  });
}

/** 担当者マスタを1件削除する（マスタ権限のみ）。 */
function deleteStaffName(rowIndex, expectedCode) {
  assertMaster_();
  return withScriptLock_(function () {
  var sheet = getOrCreateStaffNameSheet_();
  rowIndex = Number(rowIndex);
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
    throw new Error('対象の行が見つかりません。画面を再読込してください。');
  }
  assertRowStillMatches_(sheet, rowIndex, expectedCode, false);
  deleteSheetRowSafe_(sheet, rowIndex);
  return getStaffNameList();
  });
}

/** 人事データCSVの見出しラベルを正規化する（BOM除去・前後空白除去のみ。数字プレフィックスは付かない想定）。 */
function normalizeStaffCsvHeaderLabel_(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).replace(/^﻿/, '').replace(/[\r\n]+/g, '').trim();
}

/** 見出し行の中から、指定した条件に一致する最初の列番号を探す。見つからなければ-1。 */
function findStaffCsvColumnIndex_(headerRow, matchFn) {
  for (var c = 0; c < headerRow.length; c++) {
    if (matchFn(normalizeStaffCsvHeaderLabel_(headerRow[c]))) return c;
  }
  return -1;
}

// ---- 人事データCSVからGoogleアカウント（スタッフ権限）も一括登録するための、任意列の見出し候補 ----
// 列名はCSVの出力元によって異なりうるため、よくある表記を複数候補として扱う（大小文字・前後の記号は無視）。
// 権限欄（role）は、「役割等級I」のように末尾に等級・号数が付く表記にも findRoleColumnIndex_ で対応する。
var STAFF_CSV_OPTIONAL_COLUMN_CANDIDATES = {
  email: ['Googleアカウント', 'Google Workspaceアカウント', 'メールアドレス', 'メール', 'Eメール', 'E-mail', 'Email', 'mail', 'Gmailアドレス', 'Gmail アドレス', 'Gmail'],
  office: ['所属店舗', '配属店舗', '店舗', '駐在所属名称', '店舗名', '店舗名称', '営業所', '営業所名', '営業所名称'],
  area: ['所属エリア', 'エリア', 'エリア名', 'エリア名称', '所属エリア名称'],
  role: ['権限', '権限区分', '役職', '役職名', '役職名称', '役割等級', '役割等級名', '役割等級名称', '資格', '資格名', '資格名称', '資格等級',
    '職位', '職位名', '職位名称', '等級', '等級名', '等級名称', 'グレード', 'ポジション', '職階', 'Role', 'Grade', 'Position', 'Title']
};

/** 任意列の見出しラベルを、候補リストのいずれかと一致するか判定する（大文字小文字・前後の■等の記号は無視）。 */
function findOptionalStaffCsvColumn_(headerRow, candidates) {
  for (var c = 0; c < headerRow.length; c++) {
    var label = normalizeStaffCsvHeaderLabel_(headerRow[c]).replace(/^[■●◆□]+/, '').trim();
    var labelLower = label.toLowerCase();
    for (var i = 0; i < candidates.length; i++) {
      if (label === candidates[i] || labelLower === candidates[i].toLowerCase()) return c;
    }
  }
  return -1;
}

/**
 * 権限欄の見出し列を探す。まずSTAFF_CSV_OPTIONAL_COLUMN_CANDIDATES.roleとの完全一致を試し、
 * 見つからなければ「役割等級I」「グレードA」のように、候補の末尾に等級・号数
 * （ローマ数字・算用数字・アルファベット1〜3文字程度）が付いた表記にも対応する。
 */
function findRoleColumnIndex_(headerRow) {
  var exact = findOptionalStaffCsvColumn_(headerRow, STAFF_CSV_OPTIONAL_COLUMN_CANDIDATES.role);
  if (exact !== -1) return exact;
  var suffixPattern = /^[IVXivxⅠ-Ⅻ0-9A-Za-z]{0,3}$/;
  // 「役職CD」「資格NO」「役割等級ID」のようなコード（番号）の列は、名称ではなく番号が入っているため
  // 権限欄として扱わない（誤って検出すると、番号からは権限を判定できず全員が社員扱いになる）。
  var codeSuffixPattern = /^(cd|no|id|nr|code)$/i;
  for (var c = 0; c < headerRow.length; c++) {
    var label = normalizeStaffCsvHeaderLabel_(headerRow[c]).replace(/^[■●◆□]+/, '').trim();
    for (var i = 0; i < STAFF_CSV_OPTIONAL_COLUMN_CANDIDATES.role.length; i++) {
      var base = STAFF_CSV_OPTIONAL_COLUMN_CANDIDATES.role[i];
      if (label.indexOf(base) === 0) {
        var suffix = label.slice(base.length).trim();
        if (suffix && suffixPattern.test(suffix) && !codeSuffixPattern.test(suffix.normalize('NFKC'))) return c;
      }
    }
  }
  return -1;
}

/**
 * 人事データCSVの先頭数行の中から、「■担当者NO」「社員名称」の2列がそろっている見出し行を探す。
 * 「■担当者NO」は先頭の■の有無を問わず「担当者NO」部分の一致で判定する。
 * 同じ見出し行の中にGoogleアカウント・所属店舗・所属エリア・権限の列があれば、その列番号も合わせて返す
 * （無ければ-1。これらは任意列のため、無くても「■担当者NO」「社員名称」だけで取り込みを続行できる）。
 */
function detectStaffCsvHeaderRow_(matrix) {
  var scanLimit = Math.min(matrix.length, HEADER_SCAN_ROWS_);
  for (var r = 0; r < scanLimit; r++) {
    var codeIdx = findStaffCsvColumnIndex_(matrix[r], function (label) { return label.replace(/^■/, '').trim() === '担当者NO'; });
    var nameIdx = findStaffCsvColumnIndex_(matrix[r], function (label) { return label === '社員名称'; });
    if (codeIdx !== -1 && nameIdx !== -1) {
      var roleIdx = findRoleColumnIndex_(matrix[r]);
      return {
        rowIndex: r,
        codeIdx: codeIdx,
        nameIdx: nameIdx,
        emailIdx: findOptionalStaffCsvColumn_(matrix[r], STAFF_CSV_OPTIONAL_COLUMN_CANDIDATES.email),
        officeIdx: findOptionalStaffCsvColumn_(matrix[r], STAFF_CSV_OPTIONAL_COLUMN_CANDIDATES.office),
        areaIdx: findOptionalStaffCsvColumn_(matrix[r], STAFF_CSV_OPTIONAL_COLUMN_CANDIDATES.area),
        roleIdx: roleIdx,
        // 診断用：実際に検出した権限列の見出し文言そのもの（取込結果画面で確認できるようにする）。
        roleColumnHeader: roleIdx !== -1 ? normalizeStaffCsvHeaderLabel_(matrix[r][roleIdx]) : null
      };
    }
  }
  return null;
}

/**
 * 人事データCSVの「権限」欄の代表的な表記（完全一致）を、本アプリの権限へ対応付ける一覧。
 * ・M0／M1／M2／M3／契約社員／嘱託社員／アルバイト → 社員（自店舗のみ閲覧・入力）
 * ・エグゼクティブコンサルタント・チーフ／チーフ／所長／副所長／担当リーダー／大型店所長
 *   → 所長・チーフ（自エリアのみ閲覧・入力）
 * ・エリアリーダー → AL（全エリア閲覧・入力。マスタ権限のような管理機能は無いため、CSV取込で
 *   自動付与してよい権限として扱う）
 */
var STAFF_CSV_ROLE_MAP_ = {
  'M0': ROLE_STAFF, 'M1': ROLE_STAFF, 'M2': ROLE_STAFF, 'M3': ROLE_STAFF,
  '契約社員': ROLE_STAFF, '嘱託社員': ROLE_STAFF, 'アルバイト': ROLE_STAFF,
  'エグゼクティブコンサルタント・チーフ': ROLE_MANAGER, 'チーフ': ROLE_MANAGER,
  '所長': ROLE_MANAGER, '副所長': ROLE_MANAGER, '担当リーダー': ROLE_MANAGER, '大型店所長': ROLE_MANAGER,
  'エリアリーダー': ROLE_AL
};

/**
 * 役職表記の完全一致判定のための正規化。Unicode正規化（NFKC。半角カタカナ→全角カタカナ、
 * 全角英数字→半角英数字などの表記ゆれを吸収する）を行った上で、「・」「･」「、」「，」「/」「-」や
 * 前後の空白などの区切り記号を除去する。例えば「エリア・リーダー」や半角カタカナの「ｴﾘｱﾘｰﾀﾞｰ」も、
 * すべて「エリアリーダー」と同じキーとして扱えるようにする
 * （本アプリの対応表自体が「エグゼクティブコンサルタント・チーフ」のように中点区切りの表記を含むため、
 * 人事データ側の表記（区切り記号・文字の全角半角）が多少違っても判定がぶれないようにするための処理）。
 */
function normalizeRoleKey_(s) {
  return String(s || '').normalize('NFKC').replace(/[\s・･、，,\/\-]/g, '');
}
var STAFF_CSV_ROLE_MAP_NORMALIZED_ = (function () {
  var m = {};
  Object.keys(STAFF_CSV_ROLE_MAP_).forEach(function (k) {
    m[normalizeRoleKey_(k)] = STAFF_CSV_ROLE_MAP_[k];
  });
  return m;
})();

/**
 * 人事データCSVの「権限」欄の表記を、本アプリの権限（社員／所長・チーフ／AL／マスタ権限）へ変換する。
 * まずSTAFF_CSV_ROLE_MAP_との完全一致（区切り記号の違いを無視した正規化後の一致を含む）を試し、
 * 一致しなければ部分一致で推定する。
 * 安全のため、CSVの値が「マスタ」「管理者」等を含んでいても、ここでは絶対にマスタ権限へ昇格させない
 * （マスタ権限はWebアプリの権限管理から手動でのみ付与する）。該当する場合はdowngradedをtrueで返す。
 */
function mapCsvRoleToAppRole_(raw) {
  var original = String(raw || '').trim();
  if (!original) return { role: ROLE_STAFF, downgraded: false, original: '' };
  // 半角カタカナ・全角英数字などの表記ゆれを、Unicode正規化（NFKC）でまとめて吸収する。
  // 例：「ｴﾘｱﾘｰﾀﾞｰ」（半角カタカナ）は「エリアリーダー」（全角カタカナ）に、
  //     「Ｍ１」（全角英数字）は「M1」（半角英数字）に変換してから判定する。
  var s = original.normalize('NFKC');
  // 括弧の注記（例：「所長（関東エリア）」「Ｍ１（一般職）」）を取り除いた上で完全一致を試す。
  var cleaned = s.replace(/[（(][^）)]*[）)]/g, '').trim();
  var normalized = normalizeRoleKey_(cleaned || s);
  if (Object.prototype.hasOwnProperty.call(STAFF_CSV_ROLE_MAP_, s)) {
    return { role: STAFF_CSV_ROLE_MAP_[s], downgraded: false, original: original };
  }
  if (cleaned && cleaned !== s && Object.prototype.hasOwnProperty.call(STAFF_CSV_ROLE_MAP_, cleaned)) {
    return { role: STAFF_CSV_ROLE_MAP_[cleaned], downgraded: false, original: original };
  }
  if (normalized && Object.prototype.hasOwnProperty.call(STAFF_CSV_ROLE_MAP_NORMALIZED_, normalized)) {
    return { role: STAFF_CSV_ROLE_MAP_NORMALIZED_[normalized], downgraded: false, original: original };
  }
  if (s.indexOf('マスタ') !== -1 || s.indexOf('管理者') !== -1 || s.toLowerCase().indexOf('admin') !== -1) {
    return { role: ROLE_STAFF, downgraded: true, original: original };
  }
  // 「エリアリーダー」判定は、区切り記号違いにも対応した正規化後の文字列（normalized）で行う。
  // こうしないと「エリア・リーダー」のような中点区切りの表記が、下の「所長・チーフ」側の
  // 部分一致（「リーダー」を含む）に先に拾われてしまい、ALではなく所長・チーフに誤判定される。
  if (normalized.indexOf('エリアリーダー') !== -1) {
    return { role: ROLE_AL, downgraded: false, original: original };
  }
  if (s.indexOf('所長') !== -1 || s.indexOf('チーフ') !== -1 || s.indexOf('店長') !== -1 || s.indexOf('リーダー') !== -1) {
    return { role: ROLE_MANAGER, downgraded: false, original: original };
  }
  return { role: ROLE_STAFF, downgraded: false, original: original };
}

var EMAIL_PATTERN_ = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * 人事データ取込で、既存の所属表記と人事データの所属表記から、取込後の所属表記を決める。
 * ・人事データ側が空欄なら既存のまま
 * ・同じ所属（比較用表記が同じ）で人事データ側に店舗コードが無い場合は、既存のコード付き表記を残す
 *   （「717:イオン」を「イオン」で上書きすると、同名の別店舗と区別できなくなり照合できなくなるため）
 */
function nextAffiliationValue_(existingValue, csvValue) {
  if (!csvValue) return existingValue;
  if (existingValue && affiliationKey_(existingValue) === affiliationKey_(csvValue) &&
      affiliationCode_(existingValue) && !affiliationCode_(csvValue)) {
    return existingValue;
  }
  return csvValue;
}

/** 2つの所属表記が別の所属か（比較用表記が違う、または双方に店舗コードがあってコードが違う）。 */
function affiliationDiffers_(a, b) {
  if (affiliationKey_(a) !== affiliationKey_(b)) return true;
  var ca = affiliationCode_(a), cb = affiliationCode_(b);
  return !!(ca && cb && ca !== cb);
}

/**
 * 人事データCSVを取り込み、担当者マスタ（担当者コード→氏名）へ一括反映する（マスタ権限のみ）。
 * ・CSVの「■担当者NO」列と「社員名称」列だけを使う（他の人事項目は読み捨てる）。
 * ・担当者マスタに同じ担当者コードが既にあれば氏名を上書きし、無ければ新規追加する。
 * ・CSV内に同じ担当者コードが複数行ある場合は、CSV内の最後の行を採用する。
 *
 * CSVにGoogleアカウント（メールアドレス）の列も含まれている場合は、あわせて「スタッフ権限」への
 * 一括登録も行う（所属店舗・所属エリア・権限の列があれば、それも読み取って設定する）。
 * ・スタッフ権限に同じGoogleアカウントが既にあり、氏名だけが変わった場合はその行の氏名を更新する。
 * ・既存のGoogleアカウントで所属店舗・所属エリアが変わった場合は、既存の行は一切変更せずに残し、
 *   新しい行を追加する（過去の所属履歴を失わないため）。ログイン時の権限判定は、
 *   同じGoogleアカウントの行が複数あればシート上で一番下＝最後に追加された行を使う。
 * ・権限（社員／所長・チーフ／AL）は、既存アカウントについてもCSVの「権限」欄（役職名）に
 *   書かれている内容へ毎回同期する（詳しい対応はmapCsvRoleToAppRole_のSTAFF_CSV_ROLE_MAP_を参照）。
 *   ただし次の2つは例外として権限を変更しない。
 *   (1) 現在「マスタ権限」のアカウントは、人事データでは絶対に変更しない（手動付与した
 *       管理権限を保護するため。マスタ権限の変更は「権限管理（スタッフ権限）」画面から手動でのみ行う）。
 *   (2) CSVの権限欄がその行だけ空欄の場合は、データ欠落で意図せず社員に引き下げてしまうことを
 *       防ぐため、既存の権限をそのまま維持する。
 * ・新規のGoogleアカウントは、CSVの「権限」欄（役職名）から社員／所長・チーフ／ALを判定して登録する。
 *   「マスタ権限」に相当する表記があっても、安全のため自動ではマスタ権限を付与せず社員として登録する
 *   （マスタ権限は「権限管理（スタッフ権限）」画面から手動でのみ付与する）。
 */
function importStaffNameCsv(csvText, fileName) {
  assertMaster_();
  var matrix = parseImportInput_(csvText);
  if (!matrix || matrix.length < 2) {
    throw new Error('CSVにデータ行が見つかりません。');
  }

  var headerInfo = detectStaffCsvHeaderRow_(matrix);
  if (!headerInfo) {
    throw new Error('CSVのヘッダー行から「■担当者NO」「社員名称」の列を検出できませんでした。見出し行をご確認ください。');
  }
  var accountsDetected = headerInfo.emailIdx !== -1;

  // 既存データの読み取りから追記・更新までを排他ロックの中で行う（他のユーザーの同時書き込みとの
  // 競合を防ぐ）。
  return withScriptLock_(function () {

  var csvMap = {}; // 担当者コード → 社員名称（CSV内で重複があれば最後の行を採用）
  var csvAccounts = {}; // Googleアカウント（小文字）→ アカウント情報（CSV内で重複があれば最後の行を採用）
  var skipped = 0, accountsSkipped = 0;
  for (var r = headerInfo.rowIndex + 1; r < matrix.length; r++) {
    var row = matrix[r];
    var rowIsBlank = !row || row.every(function (v) { return v === undefined || String(v).trim() === ''; });
    if (rowIsBlank) { skipped++; continue; }
    var code = String(row[headerInfo.codeIdx] || '').trim();
    var name = String(row[headerInfo.nameIdx] || '').trim();
    if (!name) { skipped++; continue; }
    // 担当者NOが無い行（内勤・管理職など営業日報に担当者として出てこない人）は、担当者マスタには
    // 登録できないが、Googleアカウントの列があればスタッフ権限への登録は行う。
    if (code) csvMap[code] = name; else skipped++;

    if (accountsDetected) {
      var email = String(row[headerInfo.emailIdx] || '').trim().toLowerCase();
      if (!email) { continue; }
      if (!EMAIL_PATTERN_.test(email)) { accountsSkipped++; continue; }
      csvAccounts[email] = {
        email: email,
        name: name,
        office: headerInfo.officeIdx !== -1 ? String(row[headerInfo.officeIdx] || '').trim() : '',
        area: headerInfo.areaIdx !== -1 ? String(row[headerInfo.areaIdx] || '').trim() : '',
        roleRaw: headerInfo.roleIdx !== -1 ? String(row[headerInfo.roleIdx] || '').trim() : ''
      };
    }
  }

  // スタッフ権限シートが空（＝全員がマスタ権限扱いの初期状態）のまま取り込むと、取り込んだ全員が
  // 社員／所長・チーフ／ALで登録された時点で初期状態が終わり、マスタ権限が誰もいなくなる。
  if (accountsDetected && Object.keys(csvAccounts).length > 0) {
    assertMasterRemains_(readStaffRows_(getOrCreateStaffSheet_()),
      'マスタ権限のアカウントがまだ登録されていません。このまま人事データを取り込むと、取り込んだ全員が社員等の権限で登録され、' +
      'マスタ権限を持つ人が誰もいなくなります。先に「権限管理（スタッフ権限）」で自分自身をマスタ権限として登録してから取り込んでください。');
  }

  // ここからは「何をどう書き換えるか」を先にすべて決め、マスタ権限が残ることを確かめてから書き込む
  // （途中まで書いてから失敗して、担当者マスタだけ・一部のアカウントだけ反映される状態を作らないため）。
  var sheet = getOrCreateStaffNameSheet_();
  var existingByCode = {};
  getStaffNameList().forEach(function (s) { existingByCode[s.code] = s; });

  var added = 0, updated = 0;
  var rowsToAppend = [];
  var nameUpdates = [];
  Object.keys(csvMap).forEach(function (code) {
    var name = csvMap[code];
    var target = existingByCode[code];
    if (target) {
      if (target.name !== name) {
        nameUpdates.push({ rowIndex: target.rowIndex, name: name });
        updated++;
      }
    } else {
      rowsToAppend.push([code, name]);
      added++;
    }
  });

  var accountsAdded = 0, accountsUpdated = 0, accountsMasterDowngraded = 0, accountsAffiliationChanged = 0, accountsRoleSynced = 0;
  var roleRawTally = {}; // 診断用：CSVの権限欄に実際に書かれていた文言ごとの件数
  var staffSheet = null, accountRowsToAppend = [], accountCellUpdates = [];
  if (accountsDetected) {
    staffSheet = getOrCreateStaffSheet_();
    var existingByEmail = {};
    listStaffAccess_().forEach(function (s) { existingByEmail[s.email.toLowerCase()] = s; });

    Object.keys(csvAccounts).forEach(function (email) {
      var acc = csvAccounts[email];
      var tallyKey = acc.roleRaw || '（空欄）';
      roleRawTally[tallyKey] = (roleRawTally[tallyKey] || 0) + 1;

      var existing = existingByEmail[email];
      if (existing) {
        // 権限（社員／所長・チーフ／AL）は、CSVの権限欄（役職名）に書かれている内容へ同期する。
        // ・マスタ権限は人事データでは絶対に変更しない（手動付与した管理権限を保護するため）。
        // ・CSVの権限欄が空欄の行は、既存の権限を変更しない（データ欠落で意図せず社員に
        //   引き下げてしまうことを防ぐため）。
        var nextRole = existing.role;
        if (acc.roleRaw && existing.role !== ROLE_MASTER) {
          var mappedExisting = mapCsvRoleToAppRole_(acc.roleRaw);
          nextRole = mappedExisting.role;
        }
        var roleChanged = nextRole !== existing.role;
        // CSVに所属店舗・所属エリアの列が無い、またはその行だけ空欄の場合は、既存の所属をそのまま使う
        // （空欄で上書きすると「所属が空欄に異動した」扱いになり、本人が自店舗・自エリアのデータを
        // 1件も見られなくなるため。権限欄が空欄の場合に既存の権限を維持するのと同じ考え方）。
        var nextOffice = nextAffiliationValue_(existing.office, acc.office);
        var nextArea = nextAffiliationValue_(existing.area, acc.area);
        var affiliationChanged = affiliationDiffers_(existing.office, nextOffice) || affiliationDiffers_(existing.area, nextArea);

        if (affiliationChanged) {
          // 所属（所属店舗・所属エリア）が変わった場合は、既存の行は一切変更せずそのまま残し、
          // 新しい行を追加する（過去の所属履歴を失わないため）。権限は上記で同期した結果を引き継ぐ。
          // ログイン時の権限判定は、同じGoogleアカウントの行が複数あれば一番下（最新）の行を使う。
          accountRowsToAppend.push([acc.email, acc.name, nextOffice, nextArea, nextRole]);
          accountsAffiliationChanged++;
          if (roleChanged) accountsRoleSynced++;
        } else {
          if (existing.name !== acc.name) {
            accountCellUpdates.push({ rowIndex: existing.rowIndex, col: 2, value: acc.name });
            accountsUpdated++;
          }
          if (roleChanged) {
            accountCellUpdates.push({ rowIndex: existing.rowIndex, col: 5, value: nextRole });
            accountsRoleSynced++;
          }
        }
      } else {
        var mapped = mapCsvRoleToAppRole_(acc.roleRaw);
        if (mapped.downgraded) accountsMasterDowngraded++;
        accountRowsToAppend.push([acc.email, acc.name, acc.office, acc.area, mapped.role]);
        accountsAdded++;
      }
    });

    // 書き込んだ後の状態を組み立てて、マスタ権限のアカウントが1件以上残ることを最後にもう一度確かめる。
    var simulated = readStaffRows_(staffSheet).map(function (r) { return r.slice(); });
    accountCellUpdates.forEach(function (u) { simulated[u.rowIndex - 2][u.col - 1] = u.value; });
    assertMasterRemains_(simulated.concat(accountRowsToAppend),
      'この人事データを取り込むと、マスタ権限のアカウントが1件も無くなるため、取り込みを中止しました（何も書き込んでいません）。' +
      '「権限管理（スタッフ権限）」で、マスタ権限のアカウントの行（Googleアカウント・権限欄）をご確認ください。');
  }

  nameUpdates.forEach(function (u) { sheet.getRange(u.rowIndex, 2).setValue(protectSheetText_(u.name)); });
  if (rowsToAppend.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToAppend.length, 2).setNumberFormat('@').setValues(protectSheetRows_(rowsToAppend));
  }
  if (staffSheet) {
    accountCellUpdates.forEach(function (u) { staffSheet.getRange(u.rowIndex, u.col).setValue(protectSheetText_(u.value)); });
    if (accountRowsToAppend.length > 0) {
      var accountStartRow = staffSheet.getLastRow() + 1;
      staffSheet.getRange(accountStartRow, 1, accountRowsToAppend.length, 5).setValues(protectSheetRows_(accountRowsToAppend));
    }
  }

  return {
    fileName: fileName || '',
    csvDataRows: matrix.length - headerInfo.rowIndex - 1,
    added: added,
    updated: updated,
    skipped: skipped,
    list: getStaffNameList(),
    accountsDetected: accountsDetected,
    accountsAdded: accountsAdded,
    accountsUpdated: accountsUpdated,
    accountsSkipped: accountsSkipped,
    accountsMasterDowngraded: accountsMasterDowngraded,
    accountsAffiliationChanged: accountsAffiliationChanged,
    accountsRoleSynced: accountsRoleSynced,
    roleColumnDetected: accountsDetected ? (headerInfo.roleIdx !== -1) : null,
    roleColumnHeader: accountsDetected ? (headerInfo.roleColumnHeader || null) : null,
    roleRawTally: accountsDetected ? roleRawTally : null,
    staffAccessList: accountsDetected ? getStaffAccessList() : null
  };
  });
}
