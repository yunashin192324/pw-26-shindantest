// =====================================================
// ★PhotoWED 統合ポータル：全支店横断WEBアプリ版 (Code.gs)
// ROW支店専用スクリプト(ROW_fixed.gs)を、世界中の支店（ウィーン／イスタンブール等）へ
// コード改修なしで横展開できるよう「1つのWebアプリ + 支店マスタ」構成に再設計したもの。
//
// 設計方針：
//  ・支店ごとにスクリプトをコピーしない。ロジックは1本のスクリプトに集約する。
//  ・支店固有の情報（支店名／ログインコード／通知先メール）はコードに書かず「支店マスタ」シートで管理する。
//    → 支店を増やす時はコード変更・再デプロイ不要。支店マスタに1行追加するだけでよい。
//  ・ログイン後、支店ユーザーは自分の支店のデータのみ閲覧・操作可能。
//    日本手配課(HQ)ユーザーは全支店を横断して閲覧・操作可能。
//  ・データは従来通りスプレッドシートに集約し、行に「支店コード」列を持たせて支店を判別する。
// =====================================================

// --- このWebアプリが使うスプレッドシートのID ---
// 支店専用スプレッドシートをコピーする必要はありません。全支店で1つのスプレッドシートを共有します。
// [スプレッドシートを開く]→URLの https://docs.google.com/spreadsheets/d/【ここ】/edit の部分を貼ってください。
const SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE';

// --- シート名 ---
const BRANCH_MASTER_SHEET_NAME = '支店マスタ';
const RESERVATION_SHEET_NAME = '予約一覧';
const HISTORY_SHEET_NAME = 'やり取り履歴';
const ARCHIVE_SHEET_NAME = '過去一覧';

// --- 日本手配課(HQ)側のチーム振り分け用メール（"管轄"列の値で振り分ける） ---
const HQ_TEAM_EMAILS = {
  '関東': 'tw-avanti@his-world.com',
  '関西': 'o-avanti@his-world.com',
  'DEFAULT': 'tw-avanti@his-world.com'
};

// --- システムエラー通知先 ---
const SYSTEM_ALERT_EMAIL = 'it-planning@his-world.com';

// --- HQロールを表す特別な支店コード ---
const HQ_ROLE = 'HQ';
const BRANCH_ROLE = 'BRANCH';

// --- セッション設定 ---
const SESSION_TTL_SEC = 21600; // 6時間（CacheServiceの上限）

// --- 予約一覧の列定義 ---
const COL_BRANCH_CODE = '支店コード';
const COL_KANRI_NO = '管理番号';
const COL_CHALLENGE_NO = 'CHG NO';
const COL_STATUS_HQ = 'STS HQ';
const COL_STATUS_BRANCH = 'STS 支店';
const COL_CONFIRMED_DATE = '撮影日FIX';
const COL_HOPE1 = '希望日①';
const COL_HOPE2 = '希望日②';
const COL_HOPE3 = '希望日③';
const COL_NAME01 = 'お名前01';
const COL_NAME02 = 'お名前02';
const COL_PLAN = 'プラン名';
const COL_LOCATION = '撮影希望場所';
const COL_PREP = '準備場所';
const COL_HOTEL = 'ホテル';
const COL_AREA = '管轄';
const COL_SHOP = '店舗／担当';
const COL_REMARKS = '備考';
const COL_LAST_UPDATED = '最終更新日';
const COL_MSG_HQ = 'MSG HQ';
const COL_MSG_BRANCH = 'MSG 支店';
const COL_DRIVE_URL = 'DriveフォルダURL';

const OPTION_COUNT = 5;
function opNameCol_(n) { return `OP${n}`; }
function opStsHqCol_(n) { return `OP${n} STS HQ`; }
function opStsBranchCol_(n) { return `OP${n} STS 支店`; }

const RESERVATION_HEADERS = (() => {
  const base = [
    COL_BRANCH_CODE, COL_KANRI_NO, COL_CHALLENGE_NO, COL_STATUS_HQ, COL_STATUS_BRANCH,
    COL_CONFIRMED_DATE, COL_HOPE1, COL_HOPE2, COL_HOPE3, COL_NAME01, COL_NAME02,
    COL_PLAN, COL_LOCATION, COL_PREP, COL_HOTEL, COL_AREA, COL_SHOP, COL_REMARKS,
    COL_LAST_UPDATED, COL_MSG_HQ, COL_MSG_BRANCH, COL_DRIVE_URL
  ];
  for (let n = 1; n <= OPTION_COUNT; n++) {
    base.push(opNameCol_(n), opStsHqCol_(n), opStsBranchCol_(n));
  }
  return base;
})();

// 支店・HQのどちらも編集してよい運用系フィールド（メッセージ列とシステム列は除く＝専用APIで扱う）
const EDITABLE_FIELDS = RESERVATION_HEADERS.filter(h => ![
  COL_BRANCH_CODE, COL_KANRI_NO, COL_MSG_HQ, COL_MSG_BRANCH, COL_LAST_UPDATED, COL_DRIVE_URL
].includes(h));

// 日付として保存すべきフィールド（checkAlerts/archivePastReservations/sortReservationSheet_ が
// Dateオブジェクトであることを前提にしているため、文字列のまま保存すると判定・ソートが壊れる）
const DATE_FIELDS = [COL_CONFIRMED_DATE, COL_HOPE1, COL_HOPE2, COL_HOPE3];

// --- 支店マスタの列定義 ---
const BM_COL_CODE = '支店コード';
const BM_COL_NAME = '支店名';
const BM_COL_ROLE = 'ロール';
const BM_COL_PASSCODE = 'ログインパスコード';
const BM_COL_EMAIL = '通知先メール';
const BM_COL_ACTIVE = '有効';
const BRANCH_MASTER_HEADERS = [BM_COL_CODE, BM_COL_NAME, BM_COL_ROLE, BM_COL_PASSCODE, BM_COL_EMAIL, BM_COL_ACTIVE];

// --- 履歴シートの列定義 ---
const H_COL_ID = '__id';
const H_COL_BRANCH_CODE = '支店コード';
const H_COL_KANRI = '管理番号';
const H_COL_CHALLENGE_NO = 'CHG NO';
const H_COL_CONFIRMED_DATE = '撮影日FIX';
const H_COL_NAME01 = 'お名前01';
const H_COL_NAME02 = 'お名前02';
const H_COL_DATETIME = '日時';
const H_COL_SENDER = '送信者';
const H_COL_BODY = '内容';
const H_COL_CHECK_HQ = 'CHECK HQ';
const H_COL_DATE_HQ = 'DATE HQ';
const H_COL_CHECK_BRANCH = 'CHECK 支店';
const H_COL_DATE_BRANCH = 'DATE 支店';
const HISTORY_HEADERS = [
  H_COL_ID, H_COL_BRANCH_CODE, H_COL_KANRI, H_COL_CHALLENGE_NO, H_COL_CONFIRMED_DATE,
  H_COL_NAME01, H_COL_NAME02, H_COL_DATETIME, H_COL_SENDER, H_COL_BODY,
  H_COL_CHECK_HQ, H_COL_DATE_HQ, H_COL_CHECK_BRANCH, H_COL_DATE_BRANCH
];

const ALERT_DAYS_BEFORE = 40;
const ALERT_COMPLETED_STATUS = 'FN';

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
// スプレッドシートに必要なシート・ヘッダー・サンプル支店（ROW/ウィーン/イスタンブール/HQ）を作成する。
// Apps Scriptエディタから setupPortal を一度だけ実行してください。
function setupPortal() {
  const ss = getSpreadsheet_();

  ensureSheetWithHeaders_(ss, BRANCH_MASTER_SHEET_NAME, BRANCH_MASTER_HEADERS);
  ensureSheetWithHeaders_(ss, RESERVATION_SHEET_NAME, RESERVATION_HEADERS);
  ensureSheetWithHeaders_(ss, HISTORY_SHEET_NAME, HISTORY_HEADERS);
  ensureSheetWithHeaders_(ss, ARCHIVE_SHEET_NAME, RESERVATION_HEADERS);

  const bm = ss.getSheetByName(BRANCH_MASTER_SHEET_NAME);
  if (bm.getLastRow() < 2) {
    bm.getRange(2, 1, 4, BRANCH_MASTER_HEADERS.length).setValues([
      ['HQ', '日本手配課', HQ_ROLE, 'CHANGE-ME-HQ', 'tw-avanti@his-world.com,o-avanti@his-world.com', true],
      ['ROW', 'ローマ支店', BRANCH_ROLE, 'CHANGE-ME-ROW', 'it-planning@his-world.com', true],
      ['VIE', 'ウィーン支店', BRANCH_ROLE, 'CHANGE-ME-VIE', 'vienna-branch@his-world.com', true],
      ['IST', 'イスタンブール支店', BRANCH_ROLE, 'CHANGE-ME-IST', 'istanbul-branch@his-world.com', true]
    ]);
  }
  formatHeaderRow_(bm);
  SpreadsheetApp.getUi().alert(
    'セットアップが完了しました。\n\n' +
    '「支店マスタ」シートでログインパスコード・通知先メールを実際の値に書き換えてから、\n' +
    'デプロイ（ウェブアプリとして導入）してください。\n' +
    '支店を追加したいときは「支店マスタ」シートに1行追加するだけでOKです（コード変更不要）。'
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
// ② 認証・セッション（google.script.run から呼ばれるAPI）
// =====================================================
// スプレッドシートのチェックボックス列は実体がboolean(true/false)のことも、
// プレーンテキストで"TRUE"/"FALSE"のこともあるため、両対応で真偽判定する
function isActiveFlag_(val) {
  return val === true || String(val).trim().toUpperCase() === 'TRUE';
}

function apiLogin(branchCode, passcode) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(BRANCH_MASTER_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet);

  const match = rows.find(r =>
    String(r[BM_COL_CODE]).trim().toUpperCase() === String(branchCode).trim().toUpperCase() &&
    String(r[BM_COL_PASSCODE]) === String(passcode) &&
    isActiveFlag_(r[BM_COL_ACTIVE])
  );

  if (!match) {
    return { ok: false, error: '支店コードまたはパスコードが違います。' };
  }

  const token = Utilities.getUuid();
  const session = {
    token,
    branchCode: String(match[BM_COL_CODE]).trim().toUpperCase(),
    branchName: match[BM_COL_NAME],
    role: String(match[BM_COL_ROLE]).trim().toUpperCase() === HQ_ROLE ? HQ_ROLE : BRANCH_ROLE
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
  // スライディング延長（操作するたびに有効期限を延ばす）
  cache.put('sess_' + token, raw, SESSION_TTL_SEC);
  return session;
}

// =====================================================
// ③ 支店マスタ管理（HQのみ）— これが「横展開」の実体
// =====================================================
function apiListBranches(token) {
  const session = requireSession_(token);
  assertHq_(session);
  const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
  return getRowsAsObjects_(sheet).map(r => ({
    code: r[BM_COL_CODE], name: r[BM_COL_NAME], role: r[BM_COL_ROLE],
    email: r[BM_COL_EMAIL], active: isActiveFlag_(r[BM_COL_ACTIVE])
    // ログインパスコードは一覧APIには返さない（画面表示上の漏洩防止）
  }));
}

function apiSaveBranch(token, branch) {
  const session = requireSession_(token);
  assertHq_(session);
  if (!branch.code || !branch.name || !branch.passcode) {
    throw new Error('支店コード・支店名・ログインパスコードは必須です。');
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow();
    const codeColIdx = headers.indexOf(BM_COL_CODE);
    let targetRow = -1;
    if (lastRow > 1) {
      const codes = sheet.getRange(2, codeColIdx + 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < codes.length; i++) {
        if (String(codes[i][0]).trim().toUpperCase() === String(branch.code).trim().toUpperCase()) {
          targetRow = i + 2;
          break;
        }
      }
    }
    const rowData = headers.map(h => {
      switch (h) {
        case BM_COL_CODE: return String(branch.code).trim().toUpperCase();
        case BM_COL_NAME: return branch.name;
        case BM_COL_ROLE: return branch.role === HQ_ROLE ? HQ_ROLE : BRANCH_ROLE;
        case BM_COL_PASSCODE: return branch.passcode;
        case BM_COL_EMAIL: return branch.email || '';
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

function assertHq_(session) {
  if (session.role !== HQ_ROLE) throw new Error('この操作は日本手配課(HQ)のみ実行できます。');
}

// =====================================================
// ④ ダッシュボード（予約一覧の取得：役割に応じてスコープを絞る）
// =====================================================
function apiGetDashboard(token, filterBranchCode) {
  const session = requireSession_(token);
  const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet);

  let scoped = rows;
  if (session.role === BRANCH_ROLE) {
    scoped = rows.filter(r => String(r[COL_BRANCH_CODE]).toUpperCase() === session.branchCode);
  } else if (filterBranchCode) {
    scoped = rows.filter(r => String(r[COL_BRANCH_CODE]).toUpperCase() === String(filterBranchCode).toUpperCase());
  }

  const list = scoped.map(r => ({
    branchCode: r[COL_BRANCH_CODE],
    kanriNo: r[COL_KANRI_NO],
    challengeNo: r[COL_CHALLENGE_NO],
    statusHq: r[COL_STATUS_HQ],
    statusBranch: r[COL_STATUS_BRANCH],
    confirmedDate: formatMaybeDate_(r[COL_CONFIRMED_DATE]),
    name01: r[COL_NAME01],
    name02: r[COL_NAME02],
    plan: r[COL_PLAN],
    lastUpdated: formatMaybeDate_(r[COL_LAST_UPDATED])
  }));

  const result = { ok: true, role: session.role, branchCode: session.branchCode, branchName: session.branchName, reservations: list };
  if (session.role === HQ_ROLE) {
    result.branches = apiListBranches(token);
  }
  return result;
}

// =====================================================
// ⑤ 予約詳細
// =====================================================
function apiGetReservationDetail(token, kanriNo) {
  const session = requireSession_(token);
  const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
  if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
  assertRowVisible_(session, headers, rowData);

  const getV = (name) => rowData[headers.indexOf(name)];
  const detail = {};
  headers.forEach((h, i) => {
    detail[h] = DATE_FIELDS.includes(h) ? formatDateForInput_(rowData[i]) : formatMaybeDate_(rowData[i]);
  });

  const options = [];
  for (let n = 1; n <= OPTION_COUNT; n++) {
    const name = getV(opNameCol_(n));
    if (name) {
      options.push({
        n, name,
        stsHq: getV(opStsHqCol_(n)),
        stsBranch: getV(opStsBranchCol_(n))
      });
    }
  }
  detail.options = options;

  const hSheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET_NAME);
  const hRows = getRowsAsObjects_(hSheet).filter(r => String(r[H_COL_KANRI]) === String(kanriNo));
  hRows.sort((a, b) => new Date(b[H_COL_DATETIME]) - new Date(a[H_COL_DATETIME]));
  detail.history = hRows.map(r => ({
    id: r[H_COL_ID],
    datetime: formatMaybeDate_(r[H_COL_DATETIME]),
    sender: r[H_COL_SENDER],
    body: r[H_COL_BODY],
    checkHq: !!r[H_COL_CHECK_HQ] && String(r[H_COL_CHECK_HQ]).toUpperCase() === 'TRUE',
    checkBranch: !!r[H_COL_CHECK_BRANCH] && String(r[H_COL_CHECK_BRANCH]).toUpperCase() === 'TRUE'
  }));

  return { ok: true, role: session.role, detail };
}

function assertRowVisible_(session, headers, rowData) {
  if (session.role === HQ_ROLE) return;
  const branchOfRow = String(rowData[headers.indexOf(COL_BRANCH_CODE)]).toUpperCase();
  if (branchOfRow !== session.branchCode) {
    throw new Error('この案件を閲覧・操作する権限がありません。');
  }
}

function findReservationRow_(kanriNo) {
  const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (lastRow < 2) return { sheet, headers, rowIndex: -1, rowData: null };
  const kanriColIdx = headers.indexOf(COL_KANRI_NO);
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][kanriColIdx]) === String(kanriNo)) {
      return { sheet, headers, rowIndex: i + 2, rowData: values[i] };
    }
  }
  return { sheet, headers, rowIndex: -1, rowData: null };
}

// =====================================================
// ⑥ フィールド更新（ステータス・撮影日・ホテル等の運用系項目）
// =====================================================
function apiUpdateField(token, kanriNo, fieldName, value) {
  const session = requireSession_(token);
  if (!EDITABLE_FIELDS.includes(fieldName)) {
    throw new Error(`「${fieldName}」は直接編集できない項目です。`);
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const { sheet, headers, rowIndex, rowData } = findReservationRow_(kanriNo);
    if (rowIndex === -1) throw new Error('対象の予約が見つかりません。');
    assertRowVisible_(session, headers, rowData);

    const colIdx = headers.indexOf(fieldName) + 1;
    const valueToStore = DATE_FIELDS.includes(fieldName) ? parseDateFromInput_(value) : value;
    sheet.getRange(rowIndex, colIdx).setValue(valueToStore);
    sheet.getRange(rowIndex, headers.indexOf(COL_LAST_UPDATED) + 1).setValue(new Date());

    if (fieldName === COL_CONFIRMED_DATE) {
      sortReservationSheet_(sheet);
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑦ メッセージ送信（HQ⇔支店・双方向）
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

    const direction = session.role === HQ_ROLE ? 'HQ_TO_BRANCH' : 'BRANCH_TO_HQ';
    const msgCol = session.role === HQ_ROLE ? COL_MSG_HQ : COL_MSG_BRANCH;

    sheet.getRange(rowIndex, headers.indexOf(msgCol) + 1).setValue(message);
    sheet.getRange(rowIndex, headers.indexOf(COL_LAST_UPDATED) + 1).setValue(new Date());

    const freshRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    sendDirectionalMail_(headers, freshRow, direction, session, message, 'メッセージ');
    appendHistory_(headers, freshRow, session.branchName + (session.role === HQ_ROLE ? '（HQ）' : '（支店）'), `[${direction === 'HQ_TO_BRANCH' ? 'HQ→支店' : '支店→HQ'}]\n${message}`);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑧ DriveフォルダURL通知
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
    sendDirectionalMail_(headers, freshRow, 'BOTH', session, trimmed, 'DriveフォルダURL');
    appendHistory_(headers, freshRow, session.branchName, `[DriveフォルダURL更新]\n${trimmed}`);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑨ 新規案件作成（貼り付けテキストからの自動解析、または手入力）
// =====================================================
function apiCreateReservation(token, branchCode, formOrRawText) {
  const session = requireSession_(token);
  const targetBranch = session.role === HQ_ROLE ? String(branchCode).toUpperCase() : session.branchCode;
  if (!targetBranch) throw new Error('支店コードを指定してください。');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('他の処理が実行中です。少し待って再試行してください。');
  try {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(RESERVATION_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    let max = 0;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const allNos = sheet.getRange(2, headers.indexOf(COL_KANRI_NO) + 1, lastRow - 1, 1).getValues();
      allNos.forEach(r => {
        const m = String(r[0]).match(/R-(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
    }
    const newNo = `R-${String(max + 1).padStart(3, '0')}`;
    const newRowIndex = lastRow + 1;

    const parsed = typeof formOrRawText === 'string'
      ? parseReservationText_(formOrRawText)
      : formOrRawText; // { challengeNo, name01, name02, hopeDates:[], remarks, area }

    const newRowData = new Array(headers.length).fill('');
    const setV = (name, val) => { const i = headers.indexOf(name); if (i !== -1 && val) newRowData[i] = val; };
    setV(COL_BRANCH_CODE, targetBranch);
    setV(COL_KANRI_NO, newNo);
    setV(COL_LAST_UPDATED, new Date());
    setV(COL_STATUS_HQ, 'RQ');
    setV(COL_STATUS_BRANCH, 'ST');
    setV(COL_CHALLENGE_NO, parsed.challengeNo);
    setV(COL_NAME01, parsed.name01);
    setV(COL_NAME02, parsed.name02);
    setV(COL_HOPE1, parsed.hopeDates && parsed.hopeDates[0]);
    setV(COL_HOPE2, parsed.hopeDates && parsed.hopeDates[1]);
    setV(COL_HOPE3, parsed.hopeDates && parsed.hopeDates[2]);
    setV(COL_AREA, parsed.area);
    setV(COL_MSG_BRANCH, parsed.remarks ? `新規手配依頼が追加されました。\n【備考】\n${parsed.remarks}` : '新規手配依頼が追加されました。');

    sheet.getRange(newRowIndex, 1, 1, headers.length).setValues([newRowData]);

    sendDirectionalMail_(headers, newRowData, 'BRANCH_TO_HQ', session, newRowData[headers.indexOf(COL_MSG_BRANCH)], '新規案件');
    appendHistory_(headers, newRowData, session.branchName, `[新規案件作成]\n${newRowData[headers.indexOf(COL_MSG_BRANCH)]}`);

    sortReservationSheet_(sheet);
    return { ok: true, kanriNo: newNo };
  } finally {
    lock.releaseLock();
  }
}

// 手配依頼テキストの解析（元ROWスクリプトのロジックを踏襲・全支店共通で利用）
function parseReservationText_(rawText) {
  let challengeNo = '', name01 = '', name02 = '', area = '';
  let hopeDates = [];

  const splitIndex = rawText.search(/^\s*(備考|ATTN:|＜NBINFO＞|お客様からの質問です|第1希望：)/m);
  const remarksText = splitIndex !== -1 ? rawText.substring(splitIndex).trim() : '';
  const mainText = splitIndex !== -1 ? rawText.substring(0, splitIndex) : rawText;

  const areaMatch = rawText.match(/担当者：\s*(.+)/);
  if (areaMatch) area = areaMatch[1].includes('アバンティ＆オアシス業務チーム') ? '関東' : '関西';

  const chMatch = rawText.match(/([A-Za-z0-9]{11})/);
  challengeNo = chMatch ? chMatch[1] : '';

  const groomMatch = mainText.match(/^\s*01\s+(.*?)(?:\(|$)/m);
  if (groomMatch) name01 = groomMatch[1].trim();
  const brideMatch = mainText.match(/^\s*02\s+(.*?)(?:\(|$)/m);
  if (brideMatch) name02 = brideMatch[1].trim();

  const rqLines = mainText.matchAll(/RQ\s+(\d{2,4}\/\d{1,2}\/\d{1,2})/g);
  for (const m of rqLines) hopeDates.push(m[1]);

  return { challengeNo, name01, name02, area, hopeDates, remarks: remarksText };
}

// =====================================================
// ⑩ 履歴の既読チェック
// =====================================================
function apiToggleHistoryCheck(token, historyId, checked) {
  const session = requireSession_(token);
  const side = session.role === HQ_ROLE ? 'HQ' : 'BRANCH';
  const checkCol = side === 'HQ' ? H_COL_CHECK_HQ : H_COL_CHECK_BRANCH;
  const dateCol = side === 'HQ' ? H_COL_DATE_HQ : H_COL_DATE_BRANCH;

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
    sortAndFormatHistorySheet_(sheet);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// =====================================================
// ⑪ 履歴追加・メール送信の共通処理
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
  set(H_COL_NAME01, getV(COL_NAME01));
  set(H_COL_NAME02, getV(COL_NAME02));
  set(H_COL_DATETIME, new Date());
  set(H_COL_SENDER, sender);
  set(H_COL_BODY, body);

  h.appendRow(row);
  sortAndFormatHistorySheet_(h);
}

function sendDirectionalMail_(headers, rowData, direction, session, message, kind) {
  const getV = (name) => rowData[headers.indexOf(name)] || '';
  const branchCode = getV(COL_BRANCH_CODE);
  const area = getV(COL_AREA);
  const kanri = getV(COL_KANRI_NO);
  const chgNo = getV(COL_CHALLENGE_NO) || 'No CH';
  const n1 = getV(COL_NAME01);
  const n2 = getV(COL_NAME02);

  const hqEmail = HQ_TEAM_EMAILS[area] || HQ_TEAM_EMAILS.DEFAULT;
  const branchEmail = getBranchEmail_(branchCode);

  let recipients;
  if (direction === 'HQ_TO_BRANCH') recipients = branchEmail;
  else if (direction === 'BRANCH_TO_HQ') recipients = hqEmail;
  else recipients = [hqEmail, branchEmail].filter(Boolean).join(',');

  if (!recipients) return;

  const subj = `[PhotoWED][${branchCode}] 【${kanri} ｜ ${chgNo}】${kind}のお知らせ`;
  const body = `${session.branchName}（${session.role === HQ_ROLE ? 'HQ' : '支店'}）から更新がありました。\n\n` +
               `管理番号: ${kanri}\nChallenge No: ${chgNo}\n新郎: ${n1}\n新婦: ${n2}\n\n` +
               `--- ${kind} ---\n${message}\n\n` +
               `ポータルで確認する: (Webアプリのデプロイ後のURLをここに記載してください)`;

  MailApp.sendEmail(recipients, subj, body);
}

function getBranchEmail_(branchCode) {
  const sheet = getSpreadsheet_().getSheetByName(BRANCH_MASTER_SHEET_NAME);
  const rows = getRowsAsObjects_(sheet);
  const found = rows.find(r => String(r[BM_COL_CODE]).toUpperCase() === String(branchCode).toUpperCase());
  return found ? found[BM_COL_EMAIL] : '';
}

// =====================================================
// ⑫ アラート・アーカイブ（全支店横断・支店マスタのメールへ自動振り分け）
// =====================================================
function checkAlerts() {
  const sheet = getSpreadsheet_().getSheetByName(RESERVATION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const targetDateStr = Utilities.formatDate(new Date(Date.now() + ALERT_DAYS_BEFORE * 86400000), 'Asia/Tokyo', 'yyyy/MM/dd');

  const statusCols = [COL_STATUS_HQ, COL_STATUS_BRANCH];
  for (let n = 1; n <= OPTION_COUNT; n++) statusCols.push(opStsHqCol_(n), opStsBranchCol_(n));

  data.forEach(row => {
    const dVal = row[headers.indexOf(COL_CONFIRMED_DATE)];
    if (dVal instanceof Date && Utilities.formatDate(dVal, 'Asia/Tokyo', 'yyyy/MM/dd') === targetDateStr) {
      const incomplete = statusCols.filter(c => {
        const v = row[headers.indexOf(c)];
        return v && v !== ALERT_COMPLETED_STATUS;
      });
      if (incomplete.length > 0) {
        const area = row[headers.indexOf(COL_AREA)];
        const recipient = HQ_TEAM_EMAILS[area] || HQ_TEAM_EMAILS.DEFAULT;
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

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const dVal = row[headers.indexOf(COL_CONFIRMED_DATE)];
    const dStr = dVal instanceof Date ? Utilities.formatDate(dVal, 'Asia/Tokyo', 'yyyy/MM/dd') : '';
    const stsHq = String(row[headers.indexOf(COL_STATUS_HQ)]).trim();
    const stsBranch = String(row[headers.indexOf(COL_STATUS_BRANCH)]).trim();
    const isCW = (stsHq === 'CW' || stsBranch === 'CW');
    const isFNAndPast = ((stsHq === 'FN' || stsBranch === 'FN') && dStr && dStr < todayStr);
    if (isCW || isFNAndPast) {
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

function sortAndFormatHistorySheet_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colHq = headers.indexOf(H_COL_CHECK_HQ);
  const colBranch = headers.indexOf(H_COL_CHECK_BRANCH);
  const colId = headers.indexOf(H_COL_KANRI);
  const colDate = headers.indexOf(H_COL_DATETIME);

  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const values = range.getValues();

  const isUnread = (row) => {
    const hq = String(row[colHq]).trim().toUpperCase();
    const br = String(row[colBranch]).trim().toUpperCase();
    return (hq === '' || hq === 'FALSE') && (br === '' || br === 'FALSE');
  };
  const parseDate = (val) => {
    if (val instanceof Date) return val.getTime();
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  values.sort((a, b) => {
    const au = isUnread(a) ? 0 : 1, bu = isUnread(b) ? 0 : 1;
    if (au !== bu) return au - bu;
    if (String(a[colId]) !== String(b[colId])) return String(a[colId]).localeCompare(String(b[colId]));
    return parseDate(b[colDate]) - parseDate(a[colDate]);
  });

  range.setValues(values);
}

// =====================================================
// ⑬ ユーティリティ
// =====================================================
function getRowsAsObjects_(sheet) {
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
  // 旧データ等で "2026/8/9" のような文字列が入っている場合もISOへ寄せる
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
// ⑭ トリガー設定
// =====================================================
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('archivePastReservations').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('checkAlerts').timeBased().everyDays(1).atHour(8).create();
  SpreadsheetApp.getUi().alert('日次トリガー（アーカイブ・アラート）を再設定しました。');
}
