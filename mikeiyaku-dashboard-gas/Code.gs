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
const HEADERS_MAIN = [
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

// 画面が読み取らない列。ダッシュボードへ送るデータから除いて通信量を抑える。
// （書き込みは従来どおり行うため、シート上の列構成は変わらない）
const PAYLOAD_SKIP_COLUMNS = {
  '備考': true,
  '記録番号': true,
  '対応状況': true,
  '予約番号': true,
  '相談予約No☆自動反映': true,
  '名前☆自動反映': true,
  '連絡先☆自動反映': true
};

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
/** 営業所コードの桁数（HISの営業所コードは「046」「B66」など3桁） */
const OFFICE_CODE_LENGTH = 3;

/**
 * 営業所コードを正規化する。
 * 「046」のような先頭0付きのコードは、スプレッドシートに書き込むと数値46として
 * 保存されてしまい、読み戻したときに「46」になる。そのままではCSVの「046」と
 * 一致せず、店舗の判定にも重複判定にも失敗するため、読み取り時に3桁へ戻す。
 * 英字を含むコード（B66など）や4桁以上のコードはそのまま返す。
 */
function normalizeOfficeCode_(value) {
  const s = String(value === null || value === undefined ? '' : value).trim();
  if (s === '') return '';
  if (/^\d+$/.test(s) && s.length < OFFICE_CODE_LENGTH) {
    return ('0000' + s).slice(-OFFICE_CODE_LENGTH);
  }
  return s;
}

/**
 * 社員番号の桁数。営業日報の社員番号は5桁で、「01234」のように0で始まる人がいる。
 * 桁数が変わった場合はここを直せば全体に反映される。
 */
const EMPLOYEE_NO_LENGTH = 5;

/**
 * 社員番号を正規化する。営業所コードと同じく、スプレッドシートに書き込むと
 * 「01234」が数値1234として保存され、先頭の0が失われる。
 * 同じ人が「01234」と「1234」に分かれてしまわないよう、読み取り時に5桁へ戻す。
 * 英字を含む番号や5桁以上の番号はそのまま返す。
 */
function normalizeEmployeeNo_(value) {
  const s = String(value === null || value === undefined ? '' : value).trim();
  if (s === '') return '';
  if (/^\d+$/.test(s) && s.length < EMPLOYEE_NO_LENGTH) {
    return (new Array(EMPLOYEE_NO_LENGTH + 1).join('0') + s).slice(-EMPLOYEE_NO_LENGTH);
  }
  return s;
}

/**
 * 重複判定に使う値を、表記の揺れを吸収した形にそろえる。
 * スプレッドシートは「046」を数値46として保存するため、CSV側の文字列と
 * そのまま比べると別物になってしまう。数字だけの値は先頭の0を落として比べる。
 * これにより「046」と「46」、「01234」と「1234」が同じものとして扱われる。
 */
/**
 * 対象年月日を比較・判定用の「YYYYMMDD」にそろえる。
 * 保存期間の判定・期の判定・重複判定は文字列の大小で行うため、スプレッドシート上で
 * 日付型になったセル（直接入力すると自動で日付になる）・「2026/8/1」「2026-08-01」形式・
 * 前後の空白などがそのままだと、最近の相談が「2年以上前」と誤判定されて一覧から消え、
 * アーカイブへ移されてしまう。読み取れない値はそのまま返す（消すより見えている方が安全なため）。
 */
function normalizeTargetDate_(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? '' : Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyyMMdd');
  }
  const s = String(value).trim();
  const m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(s);
  if (m) return m[1] + ('0' + m[2]).slice(-2) + ('0' + m[3]).slice(-2);
  return s;
}

function canonicalKeyPart_(value) {
  const s = String(value === null || value === undefined ? '' : value).trim();
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

/**
 * 社員を一意に識別するキー。社員番号の桁落ちがあっても同一人物とみなす。
 * これを使わないと、同じ人が個人別サマリで2人に分かれたり、
 * スタッフマスタへ重複して自動登録されたりする。
 */
function employeeKey_(empNo, empName) {
  return canonicalKeyPart_(empNo) + '_' + String(empName === null || empName === undefined ? '' : empName).trim();
}

/**
 * 「店舗マスタ」シートに4列目「エリア名」が無い旧環境向けに、列を補う。
 * 多店舗展開（60店舗規模）に伴い、店舗を束ねる「エリア」区分をCSVから取り込んで
 * 絞り込みに使えるようにするため、店舗単位の属性として店舗マスタに持たせている。
 * 既存の店番・店舗名・有効列はそのまま、4列目が空欄のときだけ見出しを補う。
 * 読み取り処理（全ユーザーの画面表示のたびに走る）からは呼ばない。エリア名を書き込む
 * 処理の直前にだけ呼ぶことで、閲覧のたびにシートへ書き込みが発生しないようにしている。
 */
function ensureShopMasterAreaColumn_(sheet) {
  if (sheet.getMaxColumns() < 4) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 4 - sheet.getMaxColumns());
  }
  const headerCell = sheet.getRange(1, 4);
  if (String(headerCell.getValue() || '').trim() === '') {
    headerCell.setValue('エリア名')
      .setFontWeight('bold').setBackground('#1c4587').setFontColor('#ffffff').setHorizontalAlignment('center');
    sheet.setColumnWidth(4, 140);
  }
}

function getAllShopMasterRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // エリア名（4列目）が無い旧環境でも読めるよう、実在する列数までだけ読む（ここでは書き込まない）
  const readCols = Math.min(4, sheet.getMaxColumns());
  const values = sheet.getRange(2, 1, lastRow - 1, readCols).getValues();
  const list = [];
  values.forEach(function (row, i) {
    const code = normalizeOfficeCode_(row[0]);
    const name = String(row[1] || '').trim();
    if (!code && !name) return;
    const area = readCols >= 4 ? String(row[3] === null || row[3] === undefined ? '' : row[3]).trim() : '';
    list.push({ rowIndex: i + 2, code: code, name: name, active: row[2] !== false, area: area });
  });
  return list;
}

/** 店舗マスタの指定行にエリア名を書き込む（4列目が無い旧環境では先に列を補う） */
function setShopMasterArea_(masterSheet, rowIndex, area) {
  ensureShopMasterAreaColumn_(masterSheet);
  masterSheet.getRange(rowIndex, 4).setValue(area);
}

/**
 * 現在有効な店舗一覧（{code, name}の配列）を返す。ダッシュボードデータ取得・
 * 新規登録・CSVインポート等、アプリ全体から店舗を横断参照する処理はすべてこれを使う。
 */
/**
 * CSVの「営業所名」を店舗名として使える形にそろえる。
 * 営業日報の営業所名は「イーアスつくば 営業所」「水戸コムボックス310営業所」のように
 * 末尾に「営業所」が付き、間の空白も揺れる。既存の店舗名と一致させるため、
 * 空白を詰めて末尾の「営業所」を取り除く。
 * @return {string} 店舗名（使えない場合は空文字）
 */
function shopNameFromCsv_(value) {
  let s = String(value === null || value === undefined ? '' : value).trim();
  if (s === '') return '';
  s = s.replace(/[\u3000\s]+/g, ' ').trim();   // 全角空白も半角1つに
  s = s.replace(/[\s]*営業所$/, '').trim();      // 末尾の「営業所」を除く
  s = s.replace(/[\s]+/g, '');                  // 店舗名の途中の空白は詰める
  return s;
}

/** 仮登録の店舗名（「未設定(046)」など）かどうか */
function isPlaceholderShopName_(name) {
  return /^未設定\(.*\)$/.test(String(name || '').trim());
}

function getShopList_() {
  const rows = getAllShopMasterRows_();
  if (rows === null) return DEFAULT_SHOP_LIST.slice(); // 「店舗マスタ」未作成の旧環境向けフォールバック

  // 同じ店番の行が複数ある場合は1件にまとめる。
  // 過去に店番の桁落ちで「未設定(046)」が重複登録された環境があり、
  // 後の行を採用すると正式名称の店舗が仮登録側に上書きされてしまうため、
  // 正式名称のほうを必ず優先する。
  const byCode = {};
  const order = [];
  rows.filter(function (s) { return s.active; }).forEach(function (s) {
    const current = byCode[s.code];
    if (!current) {
      byCode[s.code] = s;
      order.push(s.code);
      return;
    }
    if (isPlaceholderShopName_(current.name) && !isPlaceholderShopName_(s.name)) {
      byCode[s.code] = s; // 仮登録より正式名称を優先
    }
  });
  return order.map(function (code) {
    return { code: byCode[code].code, name: byCode[code].name, area: byCode[code].area || '' };
  });
}

// ---- 本部（店舗に属さないスタッフ）用の擬似所属 -----------------------------
// 本部の社員は営業日報のCSVに出てこないため、店舗マスタにも実績データにも現れない。
// 店舗マスタには登録せず（データシートも作られない）、スタッフマスタの
// 「営業所コード」にこの値を入れることで、どの店舗にも属さない扱いにする。
// 自店舗しか見られない「一般」権限では見るものが無くなるため、本部は
// 「管理者」「マスタ管理」のみ設定できる。
const HQ_OFFICE_CODE = 'HQ';
const HQ_OFFICE_NAME = '本部';

function isHqOfficeCode_(code) {
  return String(code === null || code === undefined ? '' : code).trim().toUpperCase() === HQ_OFFICE_CODE;
}

/** 営業所コードに対応する表示名を返す（本部・未登録コードも扱えるようにする） */
function officeNameForCode_(code, shopNameByCode) {
  if (isHqOfficeCode_(code)) return HQ_OFFICE_NAME;
  return (shopNameByCode && shopNameByCode[code]) || code;
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
    const officeCode = normalizeOfficeCode_(row[0]);
    const empNo = normalizeEmployeeNo_(row[1]);
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
 * ・メール取得不可、またはスタッフマスタに未登録（Googleアカウント欄が空欄・無効化済み）の場合：
 *   - 「マスタ管理」がGoogleアカウント付きで1人も登録されていない導入初期は、締め出しを
 *     避けるため従来どおりマスタ管理相当とする。
 *   - マスタ管理が1人でも登録された後は「管理者」相当（全店舗の閲覧・入力は可、全データ削除・
 *     CSV取込・店舗/スタッフ編集・アーカイブは不可）とする。全社展開後は大多数の社員が未登録の
 *     ため、誰か1人の誤操作で全社のデータが消える事態を防ぐ。
 */
function getCurrentUserContext_() {
  let email = '';
  try {
    email = Session.getActiveUser().getEmail() || '';
  } catch (e) {
    email = '';
  }

  const staff = getStaffMasterRows_();
  const resolved = resolveRoleForEmail_(email, staff, getSpreadsheetOwnerEmail_());
  const matched = resolved.matched;

  let role, officeCode, officeName, employeeName, identified;
  if (matched) {
    const shopList = getShopList_();
    const shop = shopList.find(function (s) { return s.code === matched.officeCode; });
    officeCode = matched.officeCode;
    officeName = isHqOfficeCode_(matched.officeCode)
      ? HQ_OFFICE_NAME
      : (shop ? shop.name : matched.officeCode);
    employeeName = matched.employeeName;
    identified = true;
    role = resolved.role; // 所有者の場合は、スタッフマスタの権限より所有者としてのマスタ管理を優先する
  } else {
    role = resolved.role;
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
    hasMaster: hasRegisteredMaster_(staff),
    isOwner: resolved.isOwner === true,
    canViewAllStores: role === ROLE_MANAGER || role === ROLE_MASTER,
    canImportCsv: role === ROLE_MASTER,
    canManageMaster: role === ROLE_MASTER
  };
}

// スタッフも行番号で指定して操作するため、画面を開いた後に一覧の並びが変わると
// 別の人を編集・削除してしまう。操作のたびに社員番号＋社員名が一致するか確かめる。
const STAFF_ROW_MOVED_MESSAGE =
  'スタッフ一覧を開いた後に、一覧の並びや内容が変わっています（他の方の追加・削除・重複整理など）。' +
  '別のスタッフを変更しないよう処理を中止しました。画面を再読み込みしてから、もう一度操作してください。';

function assertStaffRowIdentity_(staffRow, expected) {
  if (!staffRow || !expected || typeof expected !== 'object' ||
      employeeKey_(staffRow.employeeNo, staffRow.employeeName) !== employeeKey_(expected.employeeNo, expected.employeeName)) {
    throw new Error(STAFF_ROW_MOVED_MESSAGE);
  }
}

/**
 * メールアドレスとスタッフ一覧から権限を決める（ログイン時と、スタッフ編集時の
 * 「自分を締め出さないか」の確認で、必ず同じ規則を使うための唯一の判定関数）。
 * ・有効なスタッフのGoogleアカウントと一致 → その人の権限
 * ・一致しない（未登録・無効化・メール取得不可）→ マスタ管理が1人も登録されていない導入初期は
 *   締め出し防止のためマスタ管理、それ以降は管理者相当
 */
function resolveRoleForEmail_(email, staffRows, ownerEmail) {
  const emailLower = String(email || '').trim().toLowerCase();
  const matched = emailLower ? ((staffRows || []).find(function (s) {
    return s.active && s.googleAccount && String(s.googleAccount).trim().toLowerCase() === emailLower;
  }) || null) : null;
  // このスプレッドシートの所有者は、スタッフマスタの登録内容に関係なく常にマスタ管理。
  // 所有者はシートを直接編集できる立場なので新しい権限を与えることにはならず、登録アドレスの
  // 誤りなどで所有者自身が管理画面に入れなくなる事故（締め出し）を防ぐ。
  const isOwner = !!emailLower && !!ownerEmail && emailLower === String(ownerEmail).trim().toLowerCase();
  if (isOwner) return { matched: matched, role: ROLE_MASTER, isOwner: true };
  if (matched) return { matched: matched, role: matched.role, isOwner: false };
  return { matched: null, role: hasRegisteredMaster_(staffRows) ? ROLE_MANAGER : ROLE_MASTER, isOwner: false };
}

/** このスプレッドシートの所有者のメールアドレス（小文字）。共有ドライブ上などで取得できなければ空文字。 */
function getSpreadsheetOwnerEmail_() {
  try {
    const owner = SpreadsheetApp.getActiveSpreadsheet().getOwner();
    return owner ? String(owner.getEmail() || '').trim().toLowerCase() : '';
  } catch (e) {
    return '';
  }
}

/** Googleアカウント付きで有効な「マスタ管理」が1人以上登録されているか */
function hasRegisteredMaster_(staffRows) {
  return (staffRows || []).some(function (s) {
    return s.active && s.role === ROLE_MASTER && !!s.googleAccount;
  });
}

/**
 * スタッフマスタの変更によって、操作している本人がマスタ管理でなくなってしまう
 * （＝管理タブが開けなくなり、自分では元に戻せなくなる）操作を止める。
 * 判定はログイン時と同じ resolveRoleForEmail_ で「変更後の一覧」に対して行う。
 * @param {Array} afterRows 変更を反映した後のスタッフ一覧（getStaffMasterRows_と同じ形）
 */
function assertNotLockingSelfOut_(afterRows) {
  let email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { email = ''; }
  if (resolveRoleForEmail_(email, afterRows, getSpreadsheetOwnerEmail_()).role !== ROLE_MASTER) {
    throw new Error(
      'この変更を保存すると、操作しているあなた（' + (email || 'Googleアカウントを確認できません') + '）が' +
      '「マスタ管理」でなくなり、この管理画面を使えなくなります（ご自身では元に戻せません）。\n' +
      '先にご自身をGoogleアカウント付きの「マスタ管理」として登録してから、もう一度操作してください。');
  }
}

/**
 * フロントエンドから呼び出す、ログイン中ユーザーの権限コンテキスト取得API。
 */
function getCurrentUserContext() {
  try {
    return { success: true, context: getCurrentUserContext_() };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
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

      const values = sheet.getRange(2, 1, lastRow - 1, HEADERS_MAIN.length).getValues();
      values.forEach(function (row) {
        const empNo = row[6];  // 社員番号（7列目）
        const empName = row[7]; // 社員名（8列目）
        if ((empNo === '' || empNo === null) && (empName === '' || empName === null)) return;

        // 桁落ちした社員番号でも同一人物としてまとめる
        const key = employeeKey_(empNo, empName);
        if (!employeeMap[key]) {
          employeeMap[key] = {
            employeeNo: normalizeEmployeeNo_(empNo),
            employeeName: empName,
            officeCode: row[5] // 営業所コード（6列目）
          };
        }
      });
    });

    const areaList = shopList
      .map(function (s) { return s.area; })
      .filter(function (a, i, arr) { return a && arr.indexOf(a) === i; })
      .sort(function (a, b) { return String(a).localeCompare(String(b), 'ja'); });

    return {
      success: true,
      shopList: shopList.map(function (s) { return s.name; }),
      areaList: areaList,
      reasonMaster: REASON_MASTER.slice(),
      typeMaster: TYPE_MASTER.slice(),
      purposeMaster: PURPOSE_MASTER.slice(),
      contactMaster: CONTACT_MASTER.slice(),
      employeeList: Object.keys(employeeMap).map(function (k) { return employeeMap[k]; }),
      userContext: ctx
    };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
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
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 指定した期（上期／下期）の開始日を "YYYYMMDD" で返す。
 * ・上期は その期の開始暦年の11月1日（例：46期上期 → 2025-11-01）
 * ・下期は その翌暦年の5月1日   （例：46期下期 → 2026-05-01）
 */
function periodStartDate_(periodNumber, half) {
  const fiscalStartCalYear = FISCAL_BASE_START_CAL_YEAR + (periodNumber - FISCAL_BASE_PERIOD);
  return half === 'first_half'
    ? fiscalStartCalYear + '1101'
    : (fiscalStartCalYear + 1) + '0501';
}

/**
 * 保存対象期間（直近2年）の開始日を "YYYYMMDD" で返す。この日付より前の対象年月日は
 * リセールリスト・個人別サマリのいずれからも対象外とする。
 * 最古の期が下期の場合（今日が上期＝11月〜4月のとき）は、その下期の開始日である
 * 5月1日が境界になる。ここを常に11月1日にしてしまうと、期タブに存在しない半年分の
 * データがリセールリストにだけ残り、両画面の「直近2年」がずれてしまう。
 */
function getRetentionCutoffDate_() {
  const oldest = getRecentPeriods_()[0];
  return periodStartDate_(oldest.periodNumber, oldest.half);
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
    const lastCol = HEADERS_MAIN.length;
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
        const targetDate = normalizeTargetDate_(row[4]); // 対象年月日（5列目）
        if (targetDate && targetDate < cutoffDate) continue;

        const obj = {};
        for (let c = 0; c < lastCol; c++) {
          // 画面で使わない列は送らない（件数が増えるほど通信量に効く）
          if (PAYLOAD_SKIP_COLUMNS[HEADERS_MAIN[c]]) continue;
          obj[HEADERS_MAIN[c]] = serializeCellValue_(row[c]);
        }
        obj['対象年月日'] = targetDate; // 画面側の日付絞り込み・アラート判定もYYYYMMDD前提のため、そろえた値を渡す
        obj.__sheetName = shop.name;
        obj.__rowIndex = i + 2; // スプレッドシート上の物理行番号（2行目スタート）
        obj['エリア名'] = shop.area || ''; // 店舗マスタのエリア区分（店舗単位の属性のため行データ自体には持たない）

        result.push(obj);
      }
    });

    return { success: true, data: result, count: result.length, userContext: ctx };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
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
      // 社員番号が桁落ちしていても同一人物としてまとめる（01234 と 1234 を分けない）
      const key = employeeKey_(empNo, empName);
      if (!employeesByKey[key]) {
        employeesByKey[key] = {
          officeCode: normalizeOfficeCode_(officeCode),
          officeName: shopNameByCode[normalizeOfficeCode_(officeCode)] || officeCode,
          employeeNo: normalizeEmployeeNo_(empNo),
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

      const values = sheet.getRange(2, 1, lastRow - 1, HEADERS_MAIN.length).getValues();
      values.forEach(function (row) {
        const resale = row[0];
        const sts = row[1];
        const pax = row[2];
        const targetDate = normalizeTargetDate_(row[4]); // 対象年月日（実際の年を含む。会計期の判定に使用）
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
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 対象の店舗シートを、現在のユーザーが閲覧・編集してよいかを検証する。
 * 一般スタッフは自店舗のみ操作できる（管理者・マスタ管理は全店舗可）。
 * 画面上は他店舗の行がそもそも表示されないが、google.script.run は
 * ブラウザから直接呼び出せてしまうため、サーバー側でも必ず検証する。
 */
function assertShopInScope_(sheetName) {
  const shopList = getShopList_();
  const shop = shopList.filter(function (s) { return s.name === sheetName; })[0];
  if (!shop) {
    throw new Error('不正な店舗名です: ' + sheetName);
  }
  const ctx = getCurrentUserContext_();
  if (!ctx.canViewAllStores && ctx.officeCode && shop.code !== ctx.officeCode) {
    throw new Error('他店舗のデータは操作できません（自店舗のみ操作可能です）: ' + sheetName);
  }
}

/**
 * 「新規相談登録」で担当スタッフを検索・選択するための一覧を返す。
 * 表記ゆれ（社員番号・社員名の手入力ミス）を防ぐため、新規登録の担当者は
 * 自由入力ではなくこの一覧から選ばせる。閲覧できる範囲は権限に準じ、
 * 一般スタッフは自店舗のみ・管理者以上は全店舗が対象。
 * 本部（店舗を持たない）スタッフは実績データを持てないため対象外。
 */
function getActiveStaffForSelection() {
  try {
    const ctx = getCurrentUserContext_();
    const shopList = getShopList_();
    const shopNameByCode = {};
    shopList.forEach(function (s) { shopNameByCode[s.code] = s.name; });

    const staff = getStaffMasterRows_().filter(function (s) {
      if (!s.active) return false;
      if (isHqOfficeCode_(s.officeCode)) return false;
      if (!shopNameByCode[s.officeCode]) return false;
      if (!ctx.canViewAllStores && ctx.officeCode && s.officeCode !== ctx.officeCode) return false;
      return true;
    });

    return {
      success: true,
      staff: staff.map(function (s) {
        return {
          rowIndex: s.rowIndex,
          officeCode: s.officeCode,
          officeName: shopNameByCode[s.officeCode],
          employeeNo: s.employeeNo,
          employeeName: s.employeeName
        };
      })
    };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * ⑤ 新規相談登録フォームから送信されたデータを、対象店舗シートへ1行追記する。
 * 営業日報CSVに出てこない相談（飛び込み等）を手入力で登録するための窓口。
 * 表記ゆれを防ぐため、担当スタッフは自由入力ではなくスタッフマスタ上の行番号
 * （staffRowIndex、getActiveStaffForSelection()で取得した一覧から選ぶ）で指定する。
 * 営業所コード・社員番号・社員名はクライアントから受け取った文字列を一切使わず、
 * 必ずスタッフマスタの現在値をサーバー側で読み直して書き込む。
 * @param {Object} rowObject 27列ヘッダー名をキーとするオブジェクト（sheetName・
 *   営業所コード・社員番号・社員名は不要。staffRowIndexから解決するため無視される）
 * @param {number} staffRowIndex 担当スタッフの、スタッフマスタ上の行番号
 */
function addUncontractedData(rowObject, staffRowIndex, expectedStaff) {
  return lockedEndpoint_(function () { return addUncontractedDataImpl_(rowObject, staffRowIndex, expectedStaff); });
}

/** addUncontractedData の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function addUncontractedDataImpl_(rowObject, staffRowIndex, expectedStaff) {
  try {
    const rIdx = parseInt(staffRowIndex, 10);
    if (isNaN(rIdx) || rIdx < 2) {
      throw new Error('担当スタッフが指定されていません。');
    }
    const staff = getStaffMasterRows_().filter(function (s) { return s.rowIndex === rIdx; })[0];
    if (!staff || !staff.active) {
      throw new Error('指定された担当スタッフが見つかりません（マスタから削除・無効化された可能性があります）。');
    }
    assertStaffRowIdentity_(staff, expectedStaff);
    if (isHqOfficeCode_(staff.officeCode)) {
      throw new Error('本部所属のスタッフは実績データを持てないため、担当者に指定できません。');
    }
    const shop = getShopList_().filter(function (s) { return s.code === staff.officeCode; })[0];
    if (!shop) {
      throw new Error('担当スタッフの所属店舗が見つかりません: ' + staff.officeCode);
    }
    const sheetName = shop.name;
    assertShopInScope_(sheetName);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('シートが見つかりません: ' + sheetName);
    }

    // 27列の共通カラム順に、送信オブジェクトの値をマッピングして1次元配列を作成
    const newRow = HEADERS_MAIN.map(function (header) {
      const v = rowObject ? rowObject[header] : undefined;
      return (v === undefined || v === null) ? '' : v;
    });
    // 営業所コード・社員番号・社員名は自由入力を使わず、スタッフマスタの現在値で確定する
    // （表記ゆれ・入力ミスの再発を防ぐため、ここだけはrowObjectの値を無視して上書きする）
    newRow[HEADERS_MAIN.indexOf('営業所コード')] = staff.officeCode;
    newRow[HEADERS_MAIN.indexOf('社員番号')] = staff.employeeNo;
    newRow[HEADERS_MAIN.indexOf('社員名')] = staff.employeeName;

    // 「対象年月日」（YYYYMMDD）から月（2桁文字列）を自動抽出し、「月」列（4列目）へ反映
    const targetDate = normalizeTargetDate_(rowObject && rowObject['対象年月日']);
    if (!/^\d{8}$/.test(targetDate)) {
      throw new Error('対象年月日を正しい日付で入力してください（入力値: ' + (rowObject && rowObject['対象年月日']) + '）');
    }
    newRow[HEADERS_MAIN.indexOf('対象年月日')] = targetDate;
    newRow[3] = targetDate.substring(4, 6);

    const lastRow = sheet.getLastRow();
    const targetRowIndex = lastRow + 1;
    ensureRowCapacity_(sheet, targetRowIndex);
    sheet.getRange(targetRowIndex, 1, 1, HEADERS_MAIN.length).setValues([newRow]);
    // 営業所コード・社員番号は桁落ちしてはいけない列のため、念のためテキスト書式にしておく
    ['営業所コード', '社員番号'].forEach(function (col) {
      const c = HEADERS_MAIN.indexOf(col) + 1;
      sheet.getRange(targetRowIndex, c).setNumberFormat('@');
    });

    return {
      success: true,
      sheetName: sheetName,
      rowIndex: targetRowIndex,
      row: newRow
    };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

// ---- 取り込みファイルの形式判定・解析 ---------------------------------------

/**
 * ヘッダー名の表記ゆれを吸収する。営業日報のエクスポートは環境によって
 * 前後の空白・全角空白・BOM・引用符が混ざることがあるため、比較前に取り除く。
 */
function normalizeHeaderName_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/^\uFEFF/, '')       // 先頭のBOM
    .replace(/[　\s]+/g, '')  // 全角・半角の空白
    .replace(/^["']|["']$/g, '')  // 前後の引用符
    .trim();
}

/** 行のいずれかのセルが指定のヘッダー名と一致するか */
function rowContainsHeader_(row, headerName) {
  if (!row || !row.length) return false;
  for (let i = 0; i < row.length; i++) {
    if (normalizeHeaderName_(row[i]) === headerName) return true;
  }
  return false;
}

/** エラーメッセージ用に、実際に読み取れた行の先頭数セルを短く表示する */
function summarizeRowForError_(row) {
  if (!row || !row.length) return '（空）';
  const cells = row.slice(0, 6).map(function (c) {
    const s = String(c === null || c === undefined ? '' : c).trim();
    return s.length > 20 ? s.substring(0, 20) + '…' : (s || '（空）');
  });
  return cells.join(' / ') + (row.length > 6 ? ' …（全' + row.length + '列）' : '');
}

/**
 * Excelのブック形式（バイナリ）をテキストとして読み込んでしまった場合に、
 * 「ヘッダーが見つかりません」ではなく原因が分かるメッセージで止める。
 * .xls は OLE2 複合ドキュメント、.xlsx は ZIP なので、先頭のシグネチャで判別できる。
 */
function assertNotBinaryWorkbook_(text) {
  const str = String(text);
  const head = str.substring(0, 4);

  // .xlsx / .zip は先頭が "PK"。ASCII文字なのでどの文字コードで読んでもそのまま残る。
  const isZip = head.charCodeAt(0) === 0x50 && head.charCodeAt(1) === 0x4B &&
                (head.charCodeAt(2) === 0x03 || head.charCodeAt(2) === 0x05 || head.charCodeAt(2) === 0x07);

  // .xls（OLE2複合ドキュメント）は先頭バイトの化け方が文字コードによって変わるため、
  // より確実な特徴で判定する。バイナリには必ずNUL文字が含まれ、テキストのCSVには含まれない。
  const isBinary = str.substring(0, 4096).indexOf('\u0000') !== -1;

  if (isZip || isBinary) {
    throw new Error(
      'このファイルはExcelのブック形式（' + (isZip ? '.xlsx' : '.xls') + '）など、' +
      'テキストではないファイルのようです。そのままでは取り込めません。\n' +
      'Excelで開いたあと「ファイル」→「名前を付けて保存」と進み、\n' +
      'ファイルの種類で「CSV UTF-8（コンマ区切り）(*.csv)」を選んで保存し直してから、\n' +
      'その .csv ファイルを取り込んでください。'
    );
  }
}

/**
 * 取り込みファイルのテキストを行の配列に変換する。
 * 営業日報のエクスポートは環境によって次のいずれの形式にもなり得るため、中身を見て自動判別する。
 *   ・カンマ区切り（一般的なCSV）
 *   ・タブ区切り（「Excel出力」で拡張子が .xls のままタブ区切りテキストが出力される場合）
 *   ・セミコロン区切り
 *   ・HTMLの<table>（同じく拡張子が .xls のままHTMLが出力される場合）
 */
function parseImportTable_(text) {
  if (/<\s*table[\s>]/i.test(text)) {
    return parseHtmlTable_(text);
  }
  const delimiter = detectDelimiter_(text);
  return Utilities.parseCsv(text, delimiter);
}

/** ヘッダー行を手がかりに区切り文字（カンマ／タブ／セミコロン）を推定する */
function detectDelimiter_(text) {
  const lines = String(text).split(/\r\n|\r|\n/);
  let sample = '';
  for (let i = 0; i < lines.length && i < 100; i++) {
    if (lines[i].indexOf('対象年月日') !== -1) { sample = lines[i]; break; }
  }
  if (!sample) {
    // ヘッダーが見つからない場合は、内容のある先頭数行をまとめて判定材料にする
    sample = lines.filter(function (l) { return l.trim() !== ''; }).slice(0, 5).join('\n');
  }
  let best = ',';
  let bestCount = 0;
  [',', '\t', ';'].forEach(function (d) {
    const count = sample.split(d).length - 1;
    if (count > bestCount) { bestCount = count; best = d; }
  });
  return best;
}

/** HTML形式（<table>）のエクスポートを行の配列に変換する */
function parseHtmlTable_(html) {
  const rows = [];
  const trRe = /<\s*tr[^>]*>([\s\S]*?)<\s*\/\s*tr\s*>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe = /<\s*(td|th)[^>]*>([\s\S]*?)<\s*\/\s*(?:td|th)\s*>/gi;
    let tdMatch;
    while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
      cells.push(htmlCellToText_(tdMatch[2]));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/** HTMLのセル内容からタグと実体参照を取り除いてテキストにする */
function htmlCellToText_(cell) {
  return String(cell)
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&') // 実体参照の二重展開を避けるため最後に処理する
    .trim();
}

/**
 * 営業日報から抽出したCSVを一括投入する（マスタ管理者のみ実行可能）。
 * ・CSVはメタ情報の行が先頭に含まれていても構わない（先頭セルが「対象年月日」の行をヘッダー行として自動検出）。
 * ・実際の営業日報CSVは以下の33列を含むが、ヘッダー名で参照するため列の並び順やCSV側の
 *   追加列（未成約理由(小)・方面・国名・都市名・エージェント・出発日・キャリア・ホテル・
 *   媒体カテゴリ名・媒体名・旅行目的(大)・大学名・企業名・本部コード・本部名・エリアコード・
 *   営業所名・班コード・班名など）があっても影響を受けない。
 *   このシステムが実際に取り込むのは次の12列のみ：
 *     対象年月日・営業所コード・営業所名・社員番号・社員名・未成約理由(大)・都市コード・
 *     種別・出発年月・旅行目的(小)・接客方法・HIS利用歴・詳細
 *   （営業所名は店舗マスタの店舗名として使う。行データには保存しない）
 *   （「エリア名」も店舗単位の属性として店舗マスタ側に取り込む。多店舗展開時に店舗をエリアで
 *     束ねて絞り込めるようにするためで、こちらも1行ごとのデータには保存しない）
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
  return lockedEndpoint_(function () { return importUncontractedCsvImpl_(csvText); });
}

/** importUncontractedCsv の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function importUncontractedCsvImpl_(csvText) {
  try {
    assertCanImportCsv_();

    if (!csvText || typeof csvText !== 'string') {
      throw new Error('CSVデータが空です。');
    }

    assertNotBinaryWorkbook_(csvText);

    const rows = parseImportTable_(csvText);
    if (!rows || rows.length === 0) {
      throw new Error('ファイルの解析結果が空でした。');
    }
    return importParsedRows_(rows);
  } catch (err) {
    return { success: false, error: err.message, detail: err.stack };
  }
}

/**
 * 画面へ返すエラー文を作る。スタックトレース（内部のコード位置）は利用者に見せても
 * 対処の役に立たず分かりにくいだけなので、メッセージだけを返し、詳細は実行ログに残す。
 */
function errorForClient_(err) {
  try { console.error(String(err && err.stack ? err.stack : err)); } catch (e) { /* ログ出力の失敗は無視 */ }
  return String(err && err.message ? err.message : err);
}

// ============================================================================
// 同時実行の制御
// ----------------------------------------------------------------------------
// 全社（多店舗）で同時に保存・CSV取り込み・アーカイブなどが走っても、互いの書き込みを
// 上書きしたり、別の行へ書き込んだりしないよう、データを書き換える処理は1件ずつ順番に
// 実行する（Apps Scriptのスクリプトロック）。読み取りだけの処理はロックしない。
// ============================================================================
const DATA_LOCK_TIMEOUT_MS = 30000;
const DATA_LOCK_BUSY_MESSAGE =
  'ほかの方の保存・取り込み処理が実行中のため、今回は処理できませんでした。数十秒おいてから、もう一度お試しください。';
let dataLockDepth_ = 0; // 同じ実行の中で既にロックを持っているか（入れ子呼び出しで二重取得しないため）

/** データを書き換える処理を、スクリプトロックを取ったうえで実行する。取れなければ例外。 */
function withDataLock_(fn) {
  if (dataLockDepth_ > 0) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(DATA_LOCK_TIMEOUT_MS)) {
    throw new Error(DATA_LOCK_BUSY_MESSAGE);
  }
  dataLockDepth_++;
  try {
    return fn();
  } finally {
    dataLockDepth_--;
    // 書き込みは遅れて反映されることがあるため、次の処理が古い内容を読まないよう
    // ロックを放す前に確定させる（Google推奨の手順）
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

/** 画面から呼ばれる書き込みAPI用。ロックが取れなかった場合も画面へ分かるメッセージで返す。 */
function lockedEndpoint_(fn) {
  try {
    return withDataLock_(fn);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * サーバー側（このファイル）の版数。画面ファイルと対で更新する。
 * 画面だけ新しくしてCode.gsが古いままだと、新機能の呼び出しが
 * 「is not a function」という分かりにくいエラーになるため、
 * 画面側から版数を確認できるようにしている。
 */
const SERVER_VERSION = '2026-09-29-2';

/**
 * サーバー側の版数を返す。画面側は、自分が期待する版数と一致するかを起動時に確認する。
 * 権限に関係なく呼べる（更新漏れは誰の画面でも起こりうるため）。
 */
function getServerVersion() {
  return { success: true, version: SERVER_VERSION };
}

/** CSV取込の権限チェック（テキスト・Excelブックの両方から使う） */
function assertCanImportCsv_() {
  if (!getCurrentUserContext_().canImportCsv) {
    throw new Error(permissionDeniedMessage_('CSVインポート', getCurrentUserContext_()));
  }
}

/**
 * Excelのブック（.xls / .xlsx）をそのまま取り込む（マスタ管理者のみ）。
 * 営業日報の抽出ファイルがExcel形式で配布される場合があるため、
 * Googleドライブでスプレッドシートへ変換してから、CSVと同じ処理に流す。
 * @param {string} base64Data ファイルの中身（Base64）
 * @param {string} fileName ファイル名（変換後の一時ファイル名に使う）
 * @param {string} mimeType ファイルのMIMEタイプ
 */
function importUncontractedWorkbook(base64Data, fileName, mimeType) {
  return lockedEndpoint_(function () { return importUncontractedWorkbookImpl_(base64Data, fileName, mimeType); });
}

/** importUncontractedWorkbook の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function importUncontractedWorkbookImpl_(base64Data, fileName, mimeType) {
  try {
    assertCanImportCsv_();
    if (!base64Data) {
      throw new Error('ファイルの中身が空です。');
    }
    const rows = readWorkbookRows_(base64Data, fileName, mimeType);
    if (!rows || rows.length === 0) {
      throw new Error('Excelブックの中身が空でした。1枚目のシートにデータが入っているかご確認ください。');
    }
    return importParsedRows_(rows);
  } catch (err) {
    return { success: false, error: err.message, detail: err.stack };
  }
}

/**
 * Excelブックをドライブ経由でスプレッドシートに変換し、1枚目のシートを行配列として返す。
 * 変換に使った一時ファイルは必ず削除する。
 */
function readWorkbookRows_(base64Data, fileName, mimeType) {
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw new Error(
      'Excelブック（.xls / .xlsx）を取り込むには、Apps Scriptで「Drive API」を有効にする必要があります。\n' +
      '【一度だけの設定】Apps Scriptを開き、左側メニューの「サービス」の＋ を押し、\n' +
      '一覧から「Drive API」を選んで「追加」してください。追加後、この画面を開き直せば取り込めます。\n' +
      '（設定できない場合は、Excelで「名前を付けて保存」→「CSV UTF-8（コンマ区切り）」で保存し直したファイルをお使いください）'
    );
  }

  const safeName = '【一時】取込用_' + (fileName || 'workbook') + '_' + new Date().getTime();
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType || 'application/vnd.ms-excel',
    fileName || 'workbook.xls'
  );

  let tempFileId = null;
  try {
    tempFileId = convertToSpreadsheet_(blob, safeName);
    const converted = SpreadsheetApp.openById(tempFileId);
    const sheet = converted.getSheets()[0];
    if (!sheet) throw new Error('Excelブックにシートが見つかりませんでした。');
    const values = sheet.getDataRange().getValues();
    return values.map(function (row) { return row.map(workbookCellToText_); });
  } finally {
    // 変換用の一時ファイルはドライブに残さない
    if (tempFileId) {
      try { DriveApp.getFileById(tempFileId).setTrashed(true); } catch (e) { /* 消せなくても取り込みは続行 */ }
    }
  }
}

/** ブックをスプレッドシート形式へ変換する（Drive APIのv3・v2どちらでも動くようにする） */
function convertToSpreadsheet_(blob, name) {
  if (typeof Drive.Files.create === 'function') { // Drive API v3
    const file = Drive.Files.create({ name: name, mimeType: MimeType.GOOGLE_SHEETS }, blob);
    return file.id;
  }
  if (typeof Drive.Files.insert === 'function') { // Drive API v2
    const file = Drive.Files.insert({ title: name, mimeType: MimeType.GOOGLE_SHEETS }, blob, { convert: true });
    return file.id;
  }
  throw new Error('Drive APIの形式を判別できませんでした。Apps Scriptの「サービス」でDrive APIを追加し直してください。');
}

/**
 * 変換後のセルを、CSVで読んだときと同じ文字列にそろえる。
 * Excel側で「20260801」が数値に、日付列が日付型になっていることがあるため。
 */
function workbookCellToText_(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyyMMdd');
  }
  if (typeof value === 'number') {
    // 小数でない限り、指数表記にならない形の文字列にする
    return (value === Math.floor(value)) ? String(Math.floor(value)) : String(value);
  }
  return String(value).trim();
}

/**
 * 解析済みの行配列（1行目以降に見出し行を含む）を店舗シートへ投入する。
 * CSVからでもExcelブックからでも、ここから先の処理は共通。
 */
function importParsedRows_(rows) {
  try {

    // ヘッダー行（「対象年月日」というセルを含む行）を自動検出する。
    // 「理由別サマリ」等のメタ情報行が前段にあっても、また左端に空列や連番列が
    // 付いていても、正しく本体のヘッダーを見つけられるようにするため行全体を走査する。
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rowContainsHeader_(rows[i], '対象年月日')) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) {
      throw new Error(
        'ヘッダー行（「対象年月日」列）が見つかりません。\n' +
        '次のいずれかに当てはまっていないかご確認ください。\n' +
        '・Excel形式（.xls / .xlsx）のまま取り込もうとしている' +
        '（Excelで開き「名前を付けて保存」→「CSV UTF-8（コンマ区切り）」で保存し直してください）\n' +
        '・「対象年月日」の列がある表とは別のファイルを選んでいる\n' +
        '・ヘッダーの文字が「対象年月日」と異なる（全角／半角や空白の違いを含む）\n' +
        '実際に読み取れた1行目：' + summarizeRowForError_(rows[0])
      );
    }

    const headerRow = rows[headerRowIndex].map(function (h) { return normalizeHeaderName_(h); });
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
      staffMasterKeys[employeeKey_(s.employeeNo, s.employeeName)] = true;
    });
    const staffMasterSheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
    const newStaffRows = []; // スタッフマスタへ追記する行（[営業所コード, 社員番号, 社員名, '', '一般', true]）
    let autoRegisteredStaffCount = 0;

    const autoRegisteredShopCodes = [];
    const renamedShopNames = []; // CSVの営業所名で「未設定(店番)」から直した店舗
    const areaSyncedOfficeCodes = {}; // このバッチ内でエリア名を同期済みの営業所コード

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

      const targetDate = normalizeTargetDate_(getVal(row, '対象年月日'));
      // CSV側が「46」と桁落ちしていても「046」として扱えるようそろえる
      const officeCode = normalizeOfficeCode_(getVal(row, '営業所コード'));
      // CSVに営業所名があれば、それをそのまま店舗名として使う
      const csvShopName = shopNameFromCsv_(getVal(row, '営業所名'));
      // CSVのエリア名（多店舗展開時の店舗グルーピング用。店舗単位の属性として店舗マスタ側に持たせる）
      const csvAreaName = getVal(row, 'エリア名');

      if (!targetDate || !officeCode) {
        skippedBlankCount++;
        continue;
      }

      // 未登録の営業所コードは、仮の店舗名で店舗マスタへ自動登録する
      // （店舗・スタッフの登録は基本CSVインポートから読み取る運用のため）
      let sheetName = officeCodeToSheetName[officeCode];
      if (!sheetName) {
        sheetName = autoRegisterShop_(ss, officeCode, csvShopName, csvAreaName);
        officeCodeToSheetName[officeCode] = sheetName;
        // CSVから名前が分からず仮登録になった場合だけ「仮登録した」と報告する
        if (isPlaceholderShopName_(sheetName)) {
          autoRegisteredShopCodes.push(officeCode);
        }
      } else if (csvShopName && isPlaceholderShopName_(sheetName)) {
        // 以前「未設定(店番)」で登録された店舗は、CSVの営業所名で正しい名前に直す
        const renamed = renameShopIfPlaceholder_(ss, officeCode, sheetName, csvShopName);
        if (renamed) {
          officeCodeToSheetName[officeCode] = renamed;
          sheetName = renamed;
          renamedShopNames.push(sheetName);
        }
      }

      // 同じ営業所コードについては取り込みバッチ内で1回だけ店舗マスタのエリア名を同期する
      if (csvAreaName && !areaSyncedOfficeCodes[officeCode]) {
        areaSyncedOfficeCodes[officeCode] = true;
        updateShopAreaFromCsv_(ss, officeCode, csvAreaName);
      }

      const empNo = normalizeEmployeeNo_(getVal(row, '社員番号'));
      const empName = getVal(row, '社員名');
      if (empName || empNo) {
        const staffKey = employeeKey_(empNo, empName);
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
      const staffStartRow = staffMasterSheet.getLastRow() + 1;
      ensureRowCapacity_(staffMasterSheet, staffStartRow + newStaffRows.length - 1);
      staffMasterSheet.getRange(staffStartRow, 1, newStaffRows.length, 6).setValues(newStaffRows);
    }

    // 重複判定キー：対象年月日＋営業所コード＋社員番号＋都市コード＋出発年月
    // シート上では「046」が数値46として保存されるため、必ず正規化してから突き合わせる
    const buildKey = function (row) {
      return [normalizeTargetDate_(row[4]), row[5], row[6], row[9], row[11]].map(canonicalKeyPart_).join('｜');
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
        const existingValues = sheet.getRange(2, 1, lastRow - 1, HEADERS_MAIN.length).getValues();
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
      ensureRowCapacity_(sheet, startRow + newRows.length - 1);
      sheet.getRange(startRow, 1, newRows.length, HEADERS_MAIN.length).setValues(newRows);
      perSheetCounts[sheetName] = newRows.length;
      importedCount += newRows.length;
    });

    // 保存期間を過ぎたデータが溜まっていれば、この取り込みのついでに履歴アーカイブへ退避する。
    // （対象年月日の列だけを見て判定するため、退避対象が無い日はほぼ負荷がかからない）
    let archiveResult = null;
    try {
      archiveResult = archiveOldData_(ss);
    } catch (archiveErr) {
      // アーカイブに失敗してもCSV取り込み自体は成功として扱う（次回の取り込み時に再試行される）
      archiveResult = { success: false, error: archiveErr.message };
    }

    return {
      success: true,
      importedCount: importedCount,
      skippedDuplicateCount: skippedDuplicateCount,
      skippedBlankCount: skippedBlankCount,
      autoRegisteredShopCodes: autoRegisteredShopCodes,
      renamedShopNames: renamedShopNames,
      autoRegisteredStaffCount: autoRegisteredStaffCount,
      perSheetCounts: perSheetCounts,
      archivedCount: (archiveResult && archiveResult.success) ? archiveResult.archivedCount : 0,
      archivePeriods: (archiveResult && archiveResult.success) ? archiveResult.periods : []
    };
  } catch (err) {
    // 画面には原因と対処だけを出し、スタックトレースは「技術的な詳細」に畳んで表示する
    return { success: false, error: err.message, detail: err.stack };
  }
}

/**
 * 未登録の営業所コードを、仮の店舗名で店舗マスタへ自動登録する（CSVインポート専用の内部ヘルパー）。
 * 店番のみ分かって正式な店舗名が分からない状態のため、マスタ管理者が後から
 * 「店舗・スタッフ管理」画面で正式名称にリネームできるよう、識別しやすい仮名称を付与する。
 * @return {string} 作成された店舗のシート名（＝仮の店舗名）
 */
function autoRegisterShop_(ss, officeCode, csvShopName, csvAreaName) {
  const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);

  // 既に同じ店番の行がある場合は、行を増やさずにその店舗を使う。
  // （無効化されている店舗のコードでCSVが来た場合など。ここで新しい行を足すと
  //   同じ店番が二重に並び、以後の取り込みが仮登録側へ流れてしまう）
  const existing = (getAllShopMasterRows_() || []).filter(function (s) {
    return s.code === officeCode;
  });
  if (existing.length > 0) {
    // 正式名称の行があればそれを、無ければ先頭の行を使う
    const preferred = existing.filter(function (s) { return !isPlaceholderShopName_(s.name); })[0] || existing[0];
    if (masterSheet && !preferred.active) {
      masterSheet.getRange(preferred.rowIndex, 3).setValue(true); // 取り込み対象にするため有効へ戻す
    }
    if (masterSheet && csvAreaName && !preferred.area) {
      setShopMasterArea_(masterSheet, preferred.rowIndex, csvAreaName); // エリア名が未設定ならCSVの値で補う
    }
    const shop = { code: preferred.code, name: preferred.name };
    createShopSheets_(ss, [shop], HEADERS_MAIN); // シートが無ければ作る（既にあれば見出しの補修のみ）
    repairOfficeCodeFormatting_(ss, [shop]);
    return preferred.name;
  }

  // CSVに営業所名があればそれを店舗名にする。無いときだけ仮の名前を付ける。
  const existingNames = {};
  (getAllShopMasterRows_() || []).forEach(function (s) { existingNames[s.name] = true; });
  const placeholderName = (csvShopName && !existingNames[csvShopName])
    ? csvShopName
    : '未設定(' + officeCode + ')';
  if (masterSheet) {
    ensureShopMasterAreaColumn_(masterSheet);
    masterSheet.appendRow([officeCode, placeholderName, true, csvAreaName || '']);
  }
  const newShop = { code: officeCode, name: placeholderName };
  createShopSheets_(ss, [newShop], HEADERS_MAIN);
  // 新しく作ったシートにも、コード列を文字列として保持する書式を適用する
  // （これを忘れると「046」「08」などが数値化され、重複判定と集計がずれる）
  repairOfficeCodeFormatting_(ss, [newShop]);
  appendShopRowToSummary_(ss, newShop);
  return placeholderName;
}

/**
 * CSVの「エリア名」で店舗マスタのエリア区分を同期する。
 * エリア名は店舗単位の属性（多店舗展開時のグルーピング用）のため、行データではなく
 * 店舗マスタ側に持たせ、値が空欄／CSVと異なる場合だけ更新する（無駄な書き込みを避ける）。
 */
function updateShopAreaFromCsv_(ss, officeCode, csvAreaName) {
  if (!csvAreaName) return;
  const target = (getAllShopMasterRows_() || []).find(function (s) { return s.code === officeCode; });
  if (!target || target.area === csvAreaName) return;
  const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
  if (!masterSheet) return;
  setShopMasterArea_(masterSheet, target.rowIndex, csvAreaName);
}

/**
 * ⑥ SPAグリッド上でのインライン編集（STS／成約PAX）を対象セルへ即時反映する。
 * @param {string} sheetName 対象店舗シート名
 * @param {number} rowIndex シート上の物理行番号（整数）
 * @param {string} newStatus "失注" | "成約" | "リセール中"
 * @param {number|string} contractPax 成約PAX（newStatusが"成約"の場合のみ使用）
 */
function updateStatus(sheetName, rowIndex, newStatus, contractPax, expectedIdentity) {
  return lockedEndpoint_(function () { return updateStatusImpl_(sheetName, rowIndex, newStatus, contractPax, expectedIdentity); });
}

/** updateStatus の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function updateStatusImpl_(sheetName, rowIndex, newStatus, contractPax, expectedIdentity) {
  try {
    assertShopInScope_(sheetName);

    const rIdx = parseInt(rowIndex, 10);
    if (isNaN(rIdx) || rIdx < 2) {
      throw new Error('不正な行番号です: ' + rowIndex);
    }

    // 空文字は「未対応（－）に戻す」操作。選び間違いを取り消せるよう許可する。
    const status = String(newStatus === null || newStatus === undefined ? '' : newStatus).trim();
    const validStatuses = ['', '失注', '成約', 'リセール中'];
    if (validStatuses.indexOf(status) === -1) {
      throw new Error('不正なステータスです: ' + newStatus);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('シートが見つかりません: ' + sheetName);
    }
    assertRowIdentity_(sheet, rIdx, expectedIdentity);

    if (status === '') {
      sheet.getRange(rIdx, 2).clearContent(); // STSを未対応（空欄）に戻す
    } else {
      sheet.getRange(rIdx, 2).setValue(status); // STS（2列目）
    }

    if (status === '成約') {
      sheet.getRange(rIdx, 3).setValue(normalizeContractPax_(contractPax)); // 成約PAX（3列目）

      // ガードレール：成約になった際、リセール列（1列目）が空白なら自動で初期値を補完する
      const resaleCell = sheet.getRange(rIdx, 1);
      const resaleValue = resaleCell.getValue();
      if (resaleValue === '' || resaleValue === null) {
        resaleCell.setValue('✖');
      }
    } else {
      sheet.getRange(rIdx, 3).clearContent(); // 成約以外は成約PAXをクリア（未対応に戻した場合も含む）
    }

    // アラート判定の基準日として、ステータス変更のたびに「最終アクション日」（21列目）を今日の日付で更新する
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    setTextCell_(sheet, rIdx, 21, todayStr);

    const updatedValues = sheet.getRange(rIdx, 1, 1, HEADERS_MAIN.length).getValues()[0];
    const updatedObj = {};
    for (let c = 0; c < HEADERS_MAIN.length; c++) {
      updatedObj[HEADERS_MAIN[c]] = serializeCellValue_(updatedValues[c]);
    }
    updatedObj['対象年月日'] = normalizeTargetDate_(updatedValues[4]);
    updatedObj.__sheetName = sheetName;
    updatedObj.__rowIndex = rIdx;

    return { success: true, data: updatedObj };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

// ---- 行の取り違え防止 --------------------------------------------------------
// 画面は「シート名＋行番号」で行を指定して保存するが、画面を開いた後にアーカイブ・異動・
// 重複整理などで行の並びが変わると、同じ行番号に別の相談が入っていることがある。
// そのまま書き込むと別のお客様の行を上書きしてしまうため、保存のたびに
// 「画面を開いた時点でその行に入っていた相談」と一致するかを確かめてから書き込む。
// 照合に使う列はCSV取り込みの重複判定キーと同じ（1シート内で相談を一意に特定できる）。
const ROW_IDENTITY_COLUMNS = ['対象年月日', '営業所コード', '社員番号', '都市コード', '出発年月'];
const ROW_MOVED_MESSAGE =
  '画面を開いた後に、この行の並びや内容が変わっています（アーカイブ・異動・重複整理などによるもの）。' +
  '別の行への書き込みを防ぐため、保存を中止しました。画面を再読み込みしてから、もう一度入力してください。';

/**
 * 書き込み先の行が、画面が想定している相談と同じかを確かめる。違えば例外。
 * @param {Object} expected 画面側が持っている照合用の値（ROW_IDENTITY_COLUMNSの各列）
 */
function assertRowIdentity_(sheet, rowIndex, expected) {
  if (!expected || typeof expected !== 'object') {
    throw new Error(ROW_MOVED_MESSAGE); // 照合情報を送らない古い画面からの保存も、安全のため受け付けない
  }
  const values = sheet.getRange(rowIndex, 1, 1, HEADERS_MAIN.length).getValues()[0];
  const isBlankRow = values.every(function (v) { return v === '' || v === null; });
  const mismatch = isBlankRow || ROW_IDENTITY_COLUMNS.some(function (col) {
    const raw = values[HEADERS_MAIN.indexOf(col)];
    const actual = col === '対象年月日' ? normalizeTargetDate_(raw) : serializeCellValue_(raw);
    const want = col === '対象年月日' ? normalizeTargetDate_(expected[col]) : expected[col];
    return canonicalKeyPart_(actual) !== canonicalKeyPart_(want);
  });
  if (mismatch) throw new Error(ROW_MOVED_MESSAGE);
}

// ---- リセールリストでスタッフが編集できる列（それ以外はCSV由来の読み取り専用） ---
// 一般スタッフ（店舗スタッフ）も自店舗の行であればこれらを編集できる。
// 「STS」だけは成約PAXのクリアやリセール補完を伴うため専用API（updateStatus）で更新する。
// 「詳細」はCSV由来だが、相談時に書ききれなかった補足を後から足せるよう編集可としている。
// CSVの再取込では既存行を上書きしないため（重複キーが一致する行は取り込まずに読み飛ばす）、
// 手で書き足した内容が取込によって消えることはない。
const EDITABLE_COLUMNS = ['リセール', '成約PAX', 'ACT日', 'ACT内容', '次回ACT・進捗★手入力', '詳細'];

// 文字列として保存する列。スプレッドシートは「0120」「08」のように数値に見える
// 入力を数値へ変換してしまい、先頭の0が消える（「0」だけの入力も0として扱われる）。
// 書き込みの直前にセルの表示形式を「書式なしテキスト（@）」にして防ぐ。
// 成約PAXは集計に使う数値なのでここには入れない。
const TEXT_CELL_COLUMNS = {
  'リセール': true,
  'ACT日': true,
  'ACT内容': true,
  '次回ACT・進捗★手入力': true,
  '詳細': true,
  '最終アクション日': true
};

/**
 * セルを「書式なしテキスト」にしたうえで文字列として書き込む。
 * 初期セットアップをやり直していない既存シートでも桁落ちしないよう、
 * 書き込みのたびに表示形式を整える。
 */
function setTextCell_(sheet, rowIndex, colIndex, value) {
  const cell = sheet.getRange(rowIndex, colIndex);
  cell.setNumberFormat('@');
  const s = (value === null || value === undefined) ? '' : String(value);
  if (s === '') {
    cell.clearContent();
  } else {
    cell.setValue(s);
  }
}

// 「リセール」列に入れてよい値（〇＝フォロー対応中／✖＝対象外／空欄＝未選択）
const RESALE_VALUES = ['〇', '✖', ''];

/**
 * 成約PAXを検証して正規化する（空欄、または0以上の整数のみ許可）。
 * この列は店舗別サマリのSUMIFSで合計されるため、文字列が混ざると集計から
 * 黙って除外され、PAX数が過少に見えてしまう。入口で弾いて防ぐ。
 * @return {number|string} 数値、または空欄を表す空文字
 */
function normalizeContractPax_(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const s = String(value).trim();
  if (!/^[0-9]+$/.test(s)) {
    throw new Error('成約PAXは0以上の半角数字で入力してください（入力値: ' + value + '）');
  }
  const n = parseInt(s, 10);
  if (n > 999) {
    throw new Error('成約PAXの値が大きすぎます（入力値: ' + value + '）');
  }
  return n;
}

/**
 * データグリッドのテキストセル（成約PAX／ACT日／ACT内容／進捗メモ）の
 * ダブルクリック→インライン編集での即時同期保存に対応する汎用セル更新API。
 * 未成約理由・都市コード・詳細等、営業日報CSVから取り込む列はここでは更新できない
 * （EDITABLE_COLUMNS に無い列名を指定するとエラーになる）。
 * @param {string} sheetName 対象店舗シート名
 * @param {number} rowIndex シート上の物理行番号（整数）
 * @param {string} columnName HEADERS_MAIN に含まれる列名（EDITABLE_COLUMNSのいずれかのみ）
 * @param {*} value 更新後の値
 */
function updateCellValue(sheetName, rowIndex, columnName, value, expectedIdentity) {
  return lockedEndpoint_(function () { return updateCellValueImpl_(sheetName, rowIndex, columnName, value, expectedIdentity); });
}

/** updateCellValue の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function updateCellValueImpl_(sheetName, rowIndex, columnName, value, expectedIdentity) {
  try {
    assertShopInScope_(sheetName);

    const rIdx = parseInt(rowIndex, 10);
    if (isNaN(rIdx) || rIdx < 2) {
      throw new Error('不正な行番号です: ' + rowIndex);
    }

    if (EDITABLE_COLUMNS.indexOf(columnName) === -1) {
      throw new Error('この列はスタッフによる編集ができません（CSV由来の読み取り専用列です）: ' + columnName);
    }
    if (columnName === 'リセール' && RESALE_VALUES.indexOf(String(value === undefined || value === null ? '' : value)) === -1) {
      throw new Error('リセール列には「〇」「✖」または空欄のみ設定できます: ' + value);
    }
    if (columnName === '成約PAX') {
      value = normalizeContractPax_(value);
    }

    const colIdx = HEADERS_MAIN.indexOf(columnName);
    if (colIdx === -1) {
      throw new Error('不正な列名です: ' + columnName);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('シートが見つかりません: ' + sheetName);
    }
    assertRowIdentity_(sheet, rIdx, expectedIdentity);

    if (TEXT_CELL_COLUMNS[columnName]) {
      setTextCell_(sheet, rIdx, colIdx + 1, value);
    } else {
      sheet.getRange(rIdx, colIdx + 1).setValue(value);
    }

    // アラート判定の基準日として、セル編集のたびに「最終アクション日」（21列目）を今日の日付で更新する
    // （最終アクション日そのものを手動編集した場合は、その値を尊重してここでは上書きしない）
    if (colIdx + 1 !== 21) {
      const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      setTextCell_(sheet, rIdx, 21, todayStr);
    }

    const updatedValues = sheet.getRange(rIdx, 1, 1, HEADERS_MAIN.length).getValues()[0];
    const updatedObj = {};
    for (let c = 0; c < HEADERS_MAIN.length; c++) {
      updatedObj[HEADERS_MAIN[c]] = serializeCellValue_(updatedValues[c]);
    }
    updatedObj['対象年月日'] = normalizeTargetDate_(updatedValues[4]);
    updatedObj.__sheetName = sheetName;
    updatedObj.__rowIndex = rIdx;

    return { success: true, data: updatedObj };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 編集できる7列（リセール・STS・成約PAX・ACT日・ACT内容・次回ACT・進捗★手入力・詳細）の
 * 変更をまとめて保存する。1件ずつ通信すると1行あたり数秒の待ちが発生し、続けて
 * 入力できないため、画面側で変更をためておき、この関数で一度に書き込む。
 *
 * changes の各要素は次の形。変更した項目だけを持たせる（持っていない項目は触らない）。
 *   { sheetName, rowIndex, 'リセール'?, 'STS'?, '成約PAX'?, 'ACT日'?, 'ACT内容'?,
 *     '次回ACT・進捗★手入力'?, '詳細'? }
 *
 * リセール・STS・成約PAXは、1件ずつ更新する updateStatus と同じ業務ルールを適用する。
 *   ・STSを「成約」にした行は成約PAXを保存し、リセールが空欄なら「✖」を補う
 *   ・STSを「成約」以外（失注／リセール中／未対応）にした行は成約PAXを消す
 *   ・成約PAXだけを変えられるのは、STSが「成約」の行のみ
 *   ・リセールを「✖」にした行はACT日が空欄なら保存日を自動で入れ、「－」に戻すとACT日も空欄に戻す
 * ACT日・ACT内容・次回ACT・進捗★手入力・詳細は、他の列との業務ルールを持たない単純な書き込み。
 *
 * @param {Array} changes 変更の配列
 * @return {Object} 成功件数・失敗した行の内訳・更新後の行データ
 */
function saveRowChanges(changes) {
  return lockedEndpoint_(function () { return saveRowChangesImpl_(changes); });
}

/** saveRowChanges の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function saveRowChangesImpl_(changes) {
  try {
    if (!Array.isArray(changes) || changes.length === 0) {
      return { success: true, updatedCount: 0, updatedRows: [], failures: [] };
    }
    if (changes.length > 500) {
      throw new Error('一度に保存できるのは500件までです（指定: ' + changes.length + '件）。');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const COL_RESALE = HEADERS_MAIN.indexOf('リセール') + 1;
    const COL_STS = HEADERS_MAIN.indexOf('STS') + 1;
    const COL_PAX = HEADERS_MAIN.indexOf('成約PAX') + 1;
    const COL_ACT_DATE = HEADERS_MAIN.indexOf('ACT日') + 1;
    const COL_LAST_ACTION = HEADERS_MAIN.indexOf('最終アクション日') + 1;
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const VALID_STATUSES = ['', '失注', '成約', 'リセール中'];
    // ACT日・ACT内容・次回ACT・進捗★手入力・詳細は、他列との業務ルールを持たない
    // 単純な書き込みのみの列。まとめてループで処理する（ACT日は自動登録／自動クリアの
    // 対象でもあるため、明示的な指定があればそちらを優先させたい＝先に書き込む）。
    const SIMPLE_TEXT_COLUMNS = ['ACT日', 'ACT内容', '次回ACT・進捗★手入力', '詳細'];

    const updatedRows = [];
    const failures = [];

    // 権限確認は店舗マスタ・スタッフマスタを読み込むため、行ごとに行うと数百行の保存で
    // 数百回の読み込みになり非常に遅くなる。1回の保存の中では権限は変わらないので、店舗ごとに1回だけ確かめる。
    const scopeCheckedSheets = {};

    changes.forEach(function (change) {
      const sheetName = change && change.sheetName;
      const rowIndex = change && change.rowIndex;
      try {
        if (!scopeCheckedSheets[sheetName]) {
          assertShopInScope_(sheetName);
          scopeCheckedSheets[sheetName] = true;
        }

        const rIdx = parseInt(rowIndex, 10);
        if (isNaN(rIdx) || rIdx < 2) throw new Error('不正な行番号です: ' + rowIndex);

        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) throw new Error('シートが見つかりません: ' + sheetName);
        assertRowIdentity_(sheet, rIdx, change.__identity);

        const hasResale = Object.prototype.hasOwnProperty.call(change, 'リセール');
        const hasSts = Object.prototype.hasOwnProperty.call(change, 'STS');
        const hasPax = Object.prototype.hasOwnProperty.call(change, '成約PAX');
        const simpleColumnsPresent = SIMPLE_TEXT_COLUMNS.filter(function (c) {
          return Object.prototype.hasOwnProperty.call(change, c);
        });
        if (!hasResale && !hasSts && !hasPax && simpleColumnsPresent.length === 0) {
          throw new Error('変更内容がありません。');
        }

        // ---- 入力値の検証（1つでも不正ならこの行は何も書き込まない） ----
        let resaleValue = null;
        if (hasResale) {
          resaleValue = String(change['リセール'] === undefined || change['リセール'] === null ? '' : change['リセール']);
          if (RESALE_VALUES.indexOf(resaleValue) === -1) {
            throw new Error('リセール列には「〇」「✖」または空欄のみ設定できます: ' + change['リセール']);
          }
        }

        let stsValue = null;
        if (hasSts) {
          stsValue = String(change['STS'] === undefined || change['STS'] === null ? '' : change['STS']).trim();
          if (VALID_STATUSES.indexOf(stsValue) === -1) {
            throw new Error('不正なステータスです: ' + change['STS']);
          }
        }

        // 保存後のSTS（変更していなければ現在の値）
        const currentSts = String(sheet.getRange(rIdx, COL_STS).getValue() || '').trim();
        const nextSts = hasSts ? stsValue : currentSts;

        let paxValue = null;
        if (hasPax) {
          if (nextSts !== '成約') {
            throw new Error('成約PAXはSTSが「成約」の行のみ入力できます。');
          }
          paxValue = normalizeContractPax_(change['成約PAX']);
        }

        // ---- 書き込み ----
        if (hasResale) {
          setTextCell_(sheet, rIdx, COL_RESALE, resaleValue);
        }

        if (hasSts) {
          if (stsValue === '') {
            sheet.getRange(rIdx, COL_STS).clearContent();
          } else {
            sheet.getRange(rIdx, COL_STS).setValue(stsValue);
          }
        }

        if (nextSts === '成約') {
          // 成約PAXの指定があれば書き、無ければ既存の値を残す
          if (hasPax) sheet.getRange(rIdx, COL_PAX).setValue(paxValue);
          // ガードレール：成約になった際、リセールが空欄なら初期値を補う
          const resaleCell = sheet.getRange(rIdx, COL_RESALE);
          const resaleNow = resaleCell.getValue();
          if (resaleNow === '' || resaleNow === null) {
            setTextCell_(sheet, rIdx, COL_RESALE, '✖');
          }
        } else if (hasSts) {
          // 成約以外へ変えた行は成約PAXを消す（未対応に戻した場合も含む）
          sheet.getRange(rIdx, COL_PAX).clearContent();
        }

        // ACT日・ACT内容・メモ・詳細：単純な書き込み。このあとのリセール自動処理より
        // 先に反映しておくことで、同じ保存でACT日を明示的に指定した場合はそちらが
        // 優先される（自動登録・自動クリアが手入力の内容を上書きしない）。
        simpleColumnsPresent.forEach(function (colName) {
          const colIdx = HEADERS_MAIN.indexOf(colName) + 1;
          const v = change[colName];
          setTextCell_(sheet, rIdx, colIdx, v === undefined || v === null ? '' : v);
        });

        // リセールを「✖」（対象外）にした行は、以後アクションが発生しないため
        // ACT日が未入力ならこの保存日を自動で入れる（長期未対応アラートを止めるため）。
        // すでにACT日が入っている行は上書きしない。
        if (hasResale && resaleValue === '✖') {
          const actDateCell = sheet.getRange(rIdx, COL_ACT_DATE);
          const actDateNow = actDateCell.getValue();
          if (actDateNow === '' || actDateNow === null || actDateNow === undefined) {
            setTextCell_(sheet, rIdx, COL_ACT_DATE, todayStr);
          }
        } else if (hasResale && resaleValue === '') {
          // リセールを「－」（未対応）に選び直した＝入力を取り消したいということなので、
          // STSを「－」に戻すと成約PAXも消えるのと同様、ACT日も空欄に戻す。
          // （✖にした際の自動登録はもちろん、手入力したACT日もこの操作で一緒に取り消せる）
          setTextCell_(sheet, rIdx, COL_ACT_DATE, '');
        }

        setTextCell_(sheet, rIdx, COL_LAST_ACTION, todayStr);

        const values = sheet.getRange(rIdx, 1, 1, HEADERS_MAIN.length).getValues()[0];
        const obj = {};
        for (let c = 0; c < HEADERS_MAIN.length; c++) {
          obj[HEADERS_MAIN[c]] = serializeCellValue_(values[c]);
        }
        obj['対象年月日'] = normalizeTargetDate_(values[4]);
        obj.__sheetName = sheetName;
        obj.__rowIndex = rIdx;
        updatedRows.push(obj);
      } catch (rowErr) {
        // 1行の失敗で全体を止めない。どの行が失敗したかを画面へ返す。
        failures.push({ sheetName: sheetName, rowIndex: rowIndex, error: rowErr.message });
      }
    });

    return {
      success: true,
      updatedCount: updatedRows.length,
      updatedRows: updatedRows,
      failures: failures
    };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

// ============================================================================
// 店舗マスタ管理（「店舗・スタッフ管理」タブ）
// ============================================================================

/**
 * マスタ管理権限が無い場合はエラーを投げる（店舗・スタッフ管理系API共通のガード）。
 */
function assertCanManageMaster_() {
  const ctx = getCurrentUserContext_();
  if (!ctx.canManageMaster) {
    throw new Error(permissionDeniedMessage_('店舗・スタッフマスタの管理', ctx));
  }
}

/**
 * 権限がない操作を断るときの文言。「なぜ断られたか」と「どうすれば使えるか」が分からないと、
 * 利用者は原因を探せないため、システムが認識している今のアカウントと状態を必ず添える。
 */
function permissionDeniedMessage_(what, ctx) {
  const who = ctx.email ? 'ログイン中のアカウント「' + ctx.email + '」' : 'ログイン中のアカウント（メールアドレスを確認できません）';
  let reason;
  if (ctx.identified) {
    reason = 'スタッフマスタでの権限は「' + ctx.role + '」です。';
  } else {
    reason = 'スタッフマスタのGoogleアカウント欄に登録が見つからない（または無効化されている）ため、管理者と同じ扱いになっています。';
  }
  return what + 'は「マスタ管理」権限を持つ方のみ実行できます。\n' + who + '：' + reason + '\n' +
    'マスタ管理者に登録を依頼してください。スプレッドシートを編集できる方は、メニュー' +
    '「46期未成約ダッシュボード」→「自分をマスタ管理者として登録」から登録できます。';
}

/**
 * 書き込み先の行数が足りない場合に行を追加する。
 * シートの既定は1000行で自動では増えないため、これを怠ると行が埋まった時点で
 * 「範囲の座標がシートのサイズから外れています」というエラーになる。
 * 追加のたびに呼ばれるのを避けるため、必要数より少し多めに確保する。
 * @param {Sheet} sheet 対象シート
 * @param {number} needed 必要な行数（最終行の行番号）
 */
function ensureRowCapacity_(sheet, needed) {
  const current = sheet.getMaxRows();
  if (current < needed) {
    sheet.insertRowsAfter(current, (needed - current) + 200);
  }
}

/**
 * 取り込み済みデータの重複行を削除する（マスタ管理者のみ）。
 * 「046」が数値46として保存されていた影響で重複判定がすり抜け、同じCSVを
 * 取り込むたびに行が増えてしまった分を後から掃除するための処理。
 *
 * ・重複判定はCSV取込と同じキー（対象年月日＋営業所コード＋社員番号＋都市コード＋出発年月）
 * ・同じキーの行が複数ある場合、スタッフが入力した内容（リセール／STS／成約PAX／
 *   ACT日／ACT内容／メモ）が入っている行を優先して残す。どれも空なら最初の1行を残す。
 * @param {boolean} dryRun trueなら件数を数えるだけで削除しない
 */
function removeDuplicateRows(dryRun) {
  return lockedEndpoint_(function () { return removeDuplicateRowsImpl_(dryRun); });
}

/** removeDuplicateRows の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function removeDuplicateRowsImpl_(dryRun) {
  try {
    assertCanManageMaster_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shops = getShopList_();
    const perSheet = {};
    let totalRemoved = 0;
    let totalKept = 0;

    // スタッフの入力が入っている行を優先して残すための判定
    const editedColumns = [0, 1, 2, 16, 17, 23]; // リセール/STS/成約PAX/ACT日/ACT内容/メモ
    const hasStaffInput = function (row) {
      return editedColumns.some(function (i) {
        return String(row[i] === null || row[i] === undefined ? '' : row[i]).trim() !== '';
      });
    };
    const buildKey = function (row) {
      return [normalizeTargetDate_(row[4]), row[5], row[6], row[9], row[11]].map(canonicalKeyPart_).join('｜');
    };

    shops.forEach(function (shop) {
      const sheet = ss.getSheetByName(shop.name);
      if (!sheet) return;
      const lastRow = sheet.getLastRow();
      if (lastRow < 3) return; // 見出し＋1行以下なら重複しようがない

      const values = sheet.getRange(2, 1, lastRow - 1, HEADERS_MAIN.length).getValues();

      // キーごとに「残す1行」を決める
      const bestByKey = {};
      values.forEach(function (row, idx) {
        const key = buildKey(row);
        const current = bestByKey[key];
        if (current === undefined) {
          bestByKey[key] = idx;
          return;
        }
        // 既に選ばれている行に入力が無く、こちらに入力があるなら乗り換える
        if (!hasStaffInput(values[current]) && hasStaffInput(row)) {
          bestByKey[key] = idx;
        }
      });

      const keepIdx = {};
      Object.keys(bestByKey).forEach(function (k) { keepIdx[bestByKey[k]] = true; });

      const kept = values.filter(function (row, idx) { return keepIdx[idx]; });
      const removed = values.length - kept.length;
      if (removed <= 0) return;

      perSheet[shop.name] = removed;
      totalRemoved += removed;
      totalKept += kept.length;

      if (!dryRun) {
        // 残す行を先頭から詰めて書き直し、余った行は内容を消す
        sheet.getRange(2, 1, kept.length, HEADERS_MAIN.length).setValues(kept);
        const surplus = values.length - kept.length;
        if (surplus > 0) {
          sheet.getRange(2 + kept.length, 1, surplus, HEADERS_MAIN.length).clearContent();
        }
      }
    });

    // スタッフマスタ側の重複（社員番号の桁落ちで同じ人が二重登録された分）も掃除する
    const staffRemoved = removeDuplicateStaffRows_(ss, dryRun);

    return {
      success: true,
      dryRun: !!dryRun,
      removedCount: totalRemoved,
      keptCount: totalKept,
      perSheetCounts: perSheet,
      staffRemovedCount: staffRemoved
    };
  } catch (err) {
    return { success: false, error: err.message, detail: err.stack };
  }
}

/**
 * スタッフマスタの重複行（同一人物が二重登録されたもの）を削除する。
 * 社員番号の桁落ちで「01234」と「1234」が別人として登録されてしまった分を掃除する。
 * Googleアカウントや権限レベルが設定されている行を優先して残す。
 * @param {Spreadsheet} ss 対象のスプレッドシート
 * @param {boolean} dryRun trueなら件数を数えるだけ
 * @return {number} 削除した（または削除できる）行数
 */
function removeDuplicateStaffRows_(ss, dryRun) {
  const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  // 設定が入っている行ほど残す価値が高い
  const weight = function (row) {
    let w = 0;
    if (String(row[3] || '').trim() !== '') w += 2;              // Googleアカウント
    if (normalizeRole_(row[4]) !== ROLE_GENERAL) w += 1;         // 一般以外の権限
    return w;
  };

  const bestByKey = {};
  values.forEach(function (row, idx) {
    const key = employeeKey_(row[1], row[2]);
    if (key === '_') return; // 空行は対象外
    const current = bestByKey[key];
    if (current === undefined || weight(row) > weight(values[current])) {
      bestByKey[key] = idx;
    }
  });

  const keepIdx = {};
  Object.keys(bestByKey).forEach(function (k) { keepIdx[bestByKey[k]] = true; });
  // 空行はそのまま残す（判定対象外のため）
  values.forEach(function (row, idx) {
    if (employeeKey_(row[1], row[2]) === '_') keepIdx[idx] = true;
  });

  const kept = values.filter(function (row, idx) { return keepIdx[idx]; });
  const removed = values.length - kept.length;
  if (removed <= 0 || dryRun) return removed;

  sheet.getRange(2, 1, kept.length, 6).setValues(kept);
  sheet.getRange(2 + kept.length, 1, removed, 6).clearContent();
  return removed;
}

// ---- 古いデータのアーカイブ（多店舗展開時にダッシュボードが重くならないようにする） -------

// 期ごとのアーカイブ用スプレッドシートID一覧を保存しておくスクリプトプロパティのキー
// （{"46": {"id":"...", "url":"..."}, "47": {...}} というJSON文字列で保存する）
const ARCHIVE_SPREADSHEET_MAP_PROPERTY_KEY = 'ARCHIVE_SPREADSHEET_IDS_BY_PERIOD';
// 1回の実行にかける時間の上限（Apps Scriptの実行時間制限（6分）に対して余裕を持たせる）
const ARCHIVE_TIME_BUDGET_MS = 4.5 * 60 * 1000;

/**
 * 保存期間（直近2年）を過ぎたデータを、対象年月日が属する期（11月始まり・10月終わり）
 * ごとに分けて「未成約リスト履歴アーカイブ_◯◯期」という別のスプレッドシートへ退避し、
 * 各店舗のデータシートからは削除する（マスタ管理者のみ）。
 *
 * ダッシュボードは常に各店舗シートを先頭行から最終行まで丸ごと読んでから絞り込みを
 * かけているため、これをしないと店舗数・運用年数が増えるほど読み込みが際限なく
 * 重くなってしまう。削除の基準は getRetentionCutoffDate_()（＝ダッシュボードに
 * 表示されなくなる基準）と同じなので、実行してもダッシュボードの見え方は変わらない。
 *
 * ・アーカイブを1つのファイルにまとめず期ごとに分けているのは、このファイル自体が
 *   将来（60店舗規模で何年も運用した場合に）Googleスプレッドシート1ファイルあたりの
 *   セル数上限（1000万セル）に達してしまうのを防ぐため。期ごとに新しいファイルへ
 *   切り替わるので、1ファイルが際限なく大きくなることがない。
 * ・退避したデータは消えるわけではなく、アーカイブ側のスプレッドシートにそのまま残る。
 * ・処理に時間がかかりすぎる場合は途中で安全に打ち切り、残りの店舗は次回の実行
 *   （このボタンの再実行、または次回のCSVインポート時）に自動的に続きから処理される。
 *   何度実行しても同じ基準でスキャンし直すだけなので、重ねて実行しても安全（冪等）。
 */
function archiveOldData() {
  return lockedEndpoint_(function () { return archiveOldDataImpl_(); });
}

/** archiveOldData の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function archiveOldDataImpl_() {
  try {
    assertCanManageMaster_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return archiveOldData_(ss);
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 実行前に「今アーカイブを実行すると何件動くか」を期ごとの内訳つきで確認するための
 * 軽量プレビュー。対象年月日の列だけを読むため、実データ全体を読むより軽い。
 */
function getArchivePreview() {
  try {
    assertCanManageMaster_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cutoff = getRetentionCutoffDate_();
    const shops = getShopList_();
    let eligibleCount = 0;
    const countsByPeriod = {};
    shops.forEach(function (shop) {
      const sheet = ss.getSheetByName(shop.name);
      if (!sheet) return;
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;
      const dates = sheet.getRange(2, 5, lastRow - 1, 1).getValues(); // 対象年月日（5列目）だけ
      dates.forEach(function (r) {
        const d = normalizeTargetDate_(r[0]);
        if (d && d < cutoff) {
          eligibleCount++;
          addToPeriodCount_(countsByPeriod, d);
        }
      });
    });
    return {
      success: true,
      cutoffDate: cutoff,
      eligibleCount: eligibleCount,
      periods: buildPeriodBreakdown_(countsByPeriod)
    };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

// 対象年月日から期を特定できない行（想定外の日付形式など）をまとめておくための特別キー。
// 空扱いで永遠に退避されず取り残されることが無いよう、この行も必ずどこかのアーカイブへ入れる。
const ARCHIVE_UNKNOWN_PERIOD_KEY = 'unknown';

/** 対象年月日が属する期をキーにして件数を積み上げる（期を特定できない値は「期不明」に計上する） */
function addToPeriodCount_(countsByPeriod, targetDate) {
  const info = getFiscalPeriodInfo_(targetDate);
  const key = info ? String(info.periodNumber) : ARCHIVE_UNKNOWN_PERIOD_KEY;
  countsByPeriod[key] = (countsByPeriod[key] || 0) + 1;
}

/** 期ごとの件数マップを、画面表示用に「古い期→新しい期→期不明」の順の配列へ整形する */
function buildPeriodBreakdown_(countsByPeriod) {
  const archiveMap = getArchiveSpreadsheetMap_();
  const result = Object.keys(countsByPeriod)
    .filter(function (k) { return k !== ARCHIVE_UNKNOWN_PERIOD_KEY; })
    .map(Number)
    .sort(function (a, b) { return a - b; })
    .map(function (periodNumber) {
      const entry = archiveMap[String(periodNumber)];
      return {
        periodNumber: periodNumber,
        label: fiscalYearLabel_(periodNumber),
        count: countsByPeriod[String(periodNumber)],
        archiveUrl: entry ? entry.url : ''
      };
    });
  if (countsByPeriod[ARCHIVE_UNKNOWN_PERIOD_KEY]) {
    const entry = archiveMap[ARCHIVE_UNKNOWN_PERIOD_KEY];
    result.push({
      periodNumber: null,
      label: '期を判定できなかったデータ',
      count: countsByPeriod[ARCHIVE_UNKNOWN_PERIOD_KEY],
      archiveUrl: entry ? entry.url : ''
    });
  }
  return result;
}

/** 実際の退避処理。CSV取り込み完了時の自動実行と、手動ボタンの両方から呼ばれる。 */
function archiveOldData_(ss) {
  const cutoff = getRetentionCutoffDate_();
  const shops = getShopList_();
  const startTime = Date.now();
  const perShopCounts = {};
  const countsByPeriod = {};
  let totalArchived = 0;
  const processedShops = [];
  const remainingShops = [];
  // このアーカイブ実行1回の間だけ有効なキャッシュ。店舗×期の組み合わせごとに
  // スクリプトプロパティの再読込・スプレッドシートの再オープンをしないようにするため。
  const archiveRunCache = { map: null, spreadsheets: {} };

  for (let i = 0; i < shops.length; i++) {
    if (Date.now() - startTime > ARCHIVE_TIME_BUDGET_MS) {
      remainingShops.push(shops[i].name);
      continue;
    }
    const shop = shops[i];
    const sheet = ss.getSheetByName(shop.name);
    if (!sheet) continue;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) { processedShops.push(shop.name); continue; }

    const values = sheet.getRange(2, 1, lastRow - 1, HEADERS_MAIN.length).getValues();
    const toKeep = [];
    const toArchiveByPeriod = {}; // 期番号(文字列)または"unknown" -> 行の配列
    values.forEach(function (row) {
      const targetDate = normalizeTargetDate_(row[4]); // 対象年月日（5列目）
      if (!(targetDate && targetDate < cutoff)) {
        toKeep.push(row);
        return;
      }
      // 保存期間を過ぎている以上、対象年月日から期が判定できない場合でも「期不明」として
      // 必ずどこかへ退避する（判定できないからといって元のシートに残すと、原因が直らない限り
      // 毎回スキャン対象になり続け、永久に軽くならないため）。
      const info = getFiscalPeriodInfo_(targetDate);
      const key = info ? String(info.periodNumber) : ARCHIVE_UNKNOWN_PERIOD_KEY;
      if (!toArchiveByPeriod[key]) toArchiveByPeriod[key] = [];
      toArchiveByPeriod[key].push(row);
    });

    const periodKeys = Object.keys(toArchiveByPeriod);
    if (periodKeys.length === 0) {
      processedShops.push(shop.name);
      continue;
    }

    periodKeys.forEach(function (periodKey) {
      const rowsForPeriod = toArchiveByPeriod[periodKey];
      const archiveSs = getOrCreateArchiveSpreadsheetForPeriod_(periodKey, archiveRunCache);
      const archiveSheet = ensureArchiveShopSheet_(archiveSs, shop.name);
      const archiveStartRow = archiveSheet.getLastRow() + 1;
      ensureRowCapacity_(archiveSheet, archiveStartRow + rowsForPeriod.length - 1);
      archiveSheet.getRange(archiveStartRow, 1, rowsForPeriod.length, HEADERS_MAIN.length).setValues(rowsForPeriod);

      countsByPeriod[periodKey] = (countsByPeriod[periodKey] || 0) + rowsForPeriod.length;
      totalArchived += rowsForPeriod.length;
    });

    // 生き残る行を先頭から詰めて書き直し、余った行は消す（生存行が0件のこともあるためgetRangeを分岐）
    if (toKeep.length > 0) {
      sheet.getRange(2, 1, toKeep.length, HEADERS_MAIN.length).setValues(toKeep);
    }
    const surplus = values.length - toKeep.length;
    if (surplus > 0) {
      sheet.getRange(2 + toKeep.length, 1, surplus, HEADERS_MAIN.length).clearContent();
    }

    perShopCounts[shop.name] = values.length - toKeep.length;
    processedShops.push(shop.name);
  }

  return {
    success: true,
    cutoffDate: cutoff,
    archivedCount: totalArchived,
    perShopCounts: perShopCounts,
    periods: buildPeriodBreakdown_(countsByPeriod),
    processedShopCount: processedShops.length,
    remainingShopCount: remainingShops.length,
    remainingShops: remainingShops
  };
}

/** 期番号から「46期（2025年11月～2026年10月）」のような表示用ラベルを作る */
function fiscalYearLabel_(periodNumber) {
  const fiscalStartCalYear = FISCAL_BASE_START_CAL_YEAR + (periodNumber - FISCAL_BASE_PERIOD);
  return periodNumber + '期（' + fiscalStartCalYear + '年11月～' + (fiscalStartCalYear + 1) + '年10月）';
}

/** 期ごとのアーカイブ用スプレッドシートID一覧を読み込む（{"46":{"id","url"}, ...}） */
function getArchiveSpreadsheetMap_() {
  const raw = PropertiesService.getScriptProperties().getProperty(ARCHIVE_SPREADSHEET_MAP_PROPERTY_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

function saveArchiveSpreadsheetMap_(map) {
  PropertiesService.getScriptProperties().setProperty(ARCHIVE_SPREADSHEET_MAP_PROPERTY_KEY, JSON.stringify(map));
}

/**
 * 指定した期（または期不明バケット）のアーカイブ用スプレッドシートを取得する。
 * 無ければ新規作成してIDを記憶する。
 * @param {string} periodKey 期番号を文字列化したもの、または ARCHIVE_UNKNOWN_PERIOD_KEY
 * @param {{map: (Object|null), spreadsheets: Object}=} runCache 1回のarchiveOldData_実行内で
 *   プロパティの再読込・スプレッドシートの再オープンを避けるための使い回しキャッシュ（省略可）
 */
function getOrCreateArchiveSpreadsheetForPeriod_(periodKey, runCache) {
  const key = String(periodKey);
  if (runCache && runCache.spreadsheets[key]) return runCache.spreadsheets[key];

  const map = (runCache && runCache.map) ? runCache.map : getArchiveSpreadsheetMap_();
  if (runCache) runCache.map = map;

  let archiveSs = null;
  if (map[key]) {
    try {
      archiveSs = SpreadsheetApp.openById(map[key].id);
    } catch (e) {
      // 保存されていたIDのファイルが開けない（削除された等）場合は作り直す
    }
  }
  if (!archiveSs) {
    const fileName = key === ARCHIVE_UNKNOWN_PERIOD_KEY
      ? '未成約リスト履歴アーカイブ_期不明'
      : '未成約リスト履歴アーカイブ_' + fiscalYearLabel_(Number(key));
    archiveSs = SpreadsheetApp.create(fileName);
    map[key] = { id: archiveSs.getId(), url: archiveSs.getUrl() };
    saveArchiveSpreadsheetMap_(map); // 作成の都度保存する（実行が途中で打ち切られても作成済み分を見失わないように）
  }
  if (runCache) runCache.spreadsheets[key] = archiveSs;
  return archiveSs;
}

/** アーカイブ側に、店舗ごとの27列ヘッダー付きシートを用意する（無ければ作る） */
function ensureArchiveShopSheet_(archiveSs, shopName) {
  let sheet = archiveSs.getSheetByName(shopName);
  if (!sheet) {
    sheet = archiveSs.insertSheet(shopName);
    // 新規シートの既定列数（26列）はHEADERS_MAIN（27列）に満たないため、書き込み前に必ず広げる
    // （InitSheet.gsのcreateShopSheets_と同じ理由・同じ対処）
    ensureColumnCount_(sheet, HEADERS_MAIN.length);
    sheet.getRange(1, 1, 1, HEADERS_MAIN.length).setValues([HEADERS_MAIN]);
    sheet.getRange(1, 1, 1, HEADERS_MAIN.length)
      .setFontWeight('bold').setBackground('#1c4587').setFontColor('#ffffff').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);

    // 新規作成直後だけ存在する既定シート（「シート1」「Sheet1」）が空のまま残らないよう削除する
    const defaultSheet = archiveSs.getSheetByName('シート1') || archiveSs.getSheetByName('Sheet1');
    if (defaultSheet && archiveSs.getSheets().length > 1) {
      archiveSs.deleteSheet(defaultSheet);
    }
  }
  return sheet;
}

/**
 * 「未設定(店番)」として仮登録された店舗を、同じ店番の正式な店舗へ統合する（マスタ管理者のみ）。
 * 店番の桁落ち不具合により、正式な店舗があるのに仮登録が重複して作られてしまった
 * 環境を元に戻すための処理。
 * ・仮登録シートのデータを正式な店舗シートへ移す（重複する行は移さない）
 * ・スタッフが入力した内容はそのまま保持する
 * ・移し終えた仮登録シートは削除し、店舗マスタからも行を取り除く
 * ・同じ店番に正式な店舗が無い仮登録は、そのまま残す（消すと実績が失われるため）
 */
function mergePlaceholderShops() {
  return lockedEndpoint_(function () { return mergePlaceholderShopsImpl_(); });
}

/** mergePlaceholderShops の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function mergePlaceholderShopsImpl_() {
  try {
    assertCanManageMaster_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // まず、店番から正式名称が分かる仮登録は名前を戻す。
    // （初期の10店舗が登録される前にCSVを取り込むと、全店が「未設定(店番)」として
    //   仮登録されてしまい、統合先の正式な店舗が存在しない状態になる）
    const restored = restoreKnownShopNames_(ss);

    const rows = getAllShopMasterRows_();
    if (rows === null) throw new Error(setupRequiredMessage_('店舗マスタ'));

    // 店番ごとに「正式な店舗」と「仮登録」を仕分ける
    const realByCode = {};
    rows.forEach(function (s) {
      if (!isPlaceholderShopName_(s.name)) realByCode[s.code] = s;
    });
    const placeholders = rows.filter(function (s) {
      return isPlaceholderShopName_(s.name) && realByCode[s.code];
    });

    const buildKey = function (row) {
      return [normalizeTargetDate_(row[4]), row[5], row[6], row[9], row[11]].map(canonicalKeyPart_).join('｜');
    };

    let mergedCount = 0;
    let movedRowCount = 0;
    const details = [];
    const removeRowIndexes = [];

    placeholders.forEach(function (ph) {
      const target = realByCode[ph.code];
      const fromSheet = ss.getSheetByName(ph.name);
      const toSheet = ss.getSheetByName(target.name);
      if (!toSheet) return; // 移動先が無ければ触らない

      let moved = 0;
      if (fromSheet) {
        const lastRow = fromSheet.getLastRow();
        if (lastRow >= 2) {
          const values = fromSheet.getRange(2, 1, lastRow - 1, HEADERS_MAIN.length).getValues();

          // 移動先に既にある行は移さない（重複を増やさないため）
          const existingKeys = {};
          const toLastRow = toSheet.getLastRow();
          if (toLastRow >= 2) {
            toSheet.getRange(2, 1, toLastRow - 1, HEADERS_MAIN.length).getValues()
              .forEach(function (r) { existingKeys[buildKey(r)] = true; });
          }

          const toMove = values.filter(function (r) {
            const hasContent = r.some(function (c) { return String(c === null || c === undefined ? '' : c).trim() !== ''; });
            if (!hasContent) return false;
            const key = buildKey(r);
            if (existingKeys[key]) return false;
            existingKeys[key] = true;
            return true;
          });

          if (toMove.length > 0) {
            const startRow = toSheet.getLastRow() + 1;
            ensureRowCapacity_(toSheet, startRow + toMove.length - 1);
            toSheet.getRange(startRow, 1, toMove.length, HEADERS_MAIN.length).setValues(toMove);
            moved = toMove.length;
          }
        }
        ss.deleteSheet(fromSheet);
      }

      removeRowIndexes.push(ph.rowIndex);
      mergedCount++;
      movedRowCount += moved;
      details.push(ph.name + ' → ' + target.name + '（' + moved + '件）');
    });

    // 店舗マスタから仮登録の行を取り除く（行番号のずれを避けるため後ろから消す）
    if (removeRowIndexes.length > 0) {
      const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
      removeRowIndexes.sort(function (a, b) { return b - a; }).forEach(function (rowIndex) {
        masterSheet.deleteRow(rowIndex);
      });
    }

    return {
      success: true,
      mergedCount: mergedCount,
      movedRowCount: movedRowCount,
      details: details,
      renamedCount: restored.renamedCount,
      renamedDetails: restored.details
    };
  } catch (err) {
    return { success: false, error: err.message, detail: err.stack };
  }
}

/**
 * 店舗名が「未設定(店番)」のままなら、CSVの営業所名で正しい名前に直す。
 * 店舗マスタの行・データシート名・店舗別サマリの表記をまとめて更新する。
 * @return {string} 直した後の店舗名（直さなかった場合は空文字）
 */
function renameShopIfPlaceholder_(ss, officeCode, currentName, newName) {
  if (!newName || !isPlaceholderShopName_(currentName)) return '';

  const rows = getAllShopMasterRows_() || [];
  // 同じ名前が他の店舗で使われている場合は変えない（名前の重複を作らない）
  if (rows.some(function (s) { return s.code !== officeCode && s.name === newName; })) return '';
  if (ss.getSheetByName(newName)) return ''; // 同名シートがある場合も触らない

  const target = rows.filter(function (s) { return s.code === officeCode; })[0];
  if (!target) return '';

  const dataSheet = ss.getSheetByName(currentName);
  if (dataSheet) dataSheet.setName(newName); // 集計式の参照はGoogleシートが自動で追従する

  const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
  if (masterSheet) masterSheet.getRange(target.rowIndex, 2).setValue(newName);
  updateShopNameInSummary_(ss, officeCode, newName);

  return newName;
}

/**
 * 「未設定(店番)」のうち、店番から正式名称が分かるものを正しい店舗名へ戻す。
 * 初期10店舗が登録される前にCSVを取り込むと、全店舗が仮登録になってしまうため、
 * 既知の店番については名前を復元する。
 * ・同じ名前の店舗が既にある場合は触らない（統合の対象として扱う）
 * ・店番が既知の一覧に無い場合はそのまま（本当に新しい店舗の可能性があるため）
 * @return {{renamedCount:number, details:string[]}}
 */
function restoreKnownShopNames_(ss) {
  const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
  const rows = getAllShopMasterRows_();
  if (!masterSheet || rows === null) return { renamedCount: 0, details: [] };

  const knownNameByCode = {};
  DEFAULT_SHOP_LIST.forEach(function (s) { knownNameByCode[s.code] = s.name; });

  const usedNames = {};
  rows.forEach(function (r) { usedNames[r.name] = true; });

  let renamedCount = 0;
  const details = [];

  rows.forEach(function (r) {
    if (!isPlaceholderShopName_(r.name)) return;
    const properName = knownNameByCode[r.code];
    if (!properName || usedNames[properName]) return;

    const dataSheet = ss.getSheetByName(r.name);
    if (dataSheet) {
      dataSheet.setName(properName); // 集計式の参照はGoogleシートが自動で追従する
    }
    masterSheet.getRange(r.rowIndex, 2).setValue(properName);
    updateShopNameInSummary_(ss, r.code, properName);

    delete usedNames[r.name];
    usedNames[properName] = true;
    renamedCount++;
    details.push(r.name + ' → ' + properName);
  });

  return { renamedCount: renamedCount, details: details };
}

/**
 * 取り込み済みのデータ行をすべて削除する（マスタ管理者のみ／取り消せない）。
 * 見出し行と、店舗マスタ・スタッフマスタは残す。
 * 誤操作を防ぐため、確認文字列の一致を必須にしている。
 * @param {string} confirmText 利用者が入力した確認文字列
 */
function clearAllImportedData(confirmText) {
  return lockedEndpoint_(function () { return clearAllImportedDataImpl_(confirmText); });
}

/** clearAllImportedData の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function clearAllImportedDataImpl_(confirmText) {
  try {
    assertCanManageMaster_();
    if (String(confirmText || '').trim() !== '削除') {
      throw new Error('確認のため「削除」と入力してください。データは削除していません。');
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // 「無効」にした店舗のシートにもデータが残るため、有効な店舗だけを見る
    // getShopList_() ではなく店舗マスタの全行を対象にする。
    const rows = getAllShopMasterRows_();
    const shops = (rows === null) ? DEFAULT_SHOP_LIST.slice() : rows;
    let cleared = 0;
    const clearedSheets = {};
    shops.forEach(function (shop) {
      if (!shop.name || clearedSheets[shop.name]) return;
      const sheet = ss.getSheetByName(shop.name);
      if (!sheet) return;
      clearedSheets[shop.name] = true;
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;
      sheet.getRange(2, 1, lastRow - 1, HEADERS_MAIN.length).clearContent();
      cleared += lastRow - 1;
    });
    return { success: true, clearedCount: cleared };
  } catch (err) {
    return { success: false, error: err.message, detail: err.stack };
  }
}

/**
 * 初期セットアップがまだ済んでいないときの案内文。
 * 「setupAllSheets() を実行」では何をすればよいか伝わらないため、
 * 画面上のボタンとスプレッドシート側のメニュー、両方の手順を示す。
 */
function setupRequiredMessage_(sheetName) {
  return '「' + sheetName + '」シートがまだ作られていません（初期セットアップが未実行です）。\n' +
    'この画面の上部に出ている「初期セットアップを実行する」ボタンを押してください。\n' +
    'ボタンが出ていない場合は、元のスプレッドシートを開き、メニューバーの\n' +
    '「46期未成約ダッシュボード」→「① 全シートを初期化（InitSheet）」を実行してください。';
}

/**
 * 初期セットアップが済んでいるか（店舗マスタ・スタッフマスタが存在するか）を返す。
 * 画面側は、未完了ならセットアップ用のボタンを出す。
 */
function getSetupStatus() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const missing = [SHOP_MASTER_SHEET_NAME, STAFF_MASTER_SHEET_NAME].filter(function (name) {
      return !ss.getSheetByName(name);
    });
    return {
      success: true,
      ready: missing.length === 0,
      missingSheets: missing,
      canRunSetup: getCurrentUserContext_().canManageMaster
    };
  } catch (err) {
    return { success: false, error: err.message, detail: err.stack };
  }
}

/**
 * ウェブアプリ側から初期セットアップ（全シート構築）を実行する。
 * スプレッドシートのメニューを開かなくても導入を完了できるようにするためのもの。
 * 何度実行しても安全で、既存シートのデータは失われない。
 */
function runInitialSetup() {
  return lockedEndpoint_(function () { return runInitialSetupImpl_(); });
}

/** runInitialSetup の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function runInitialSetupImpl_() {
  try {
    assertCanManageMaster_();
    buildAllSheets_();
    const status = getSetupStatus();
    if (!status.ready) {
      throw new Error('セットアップを実行しましたが、次のシートが作成されていません: ' +
        status.missingSheets.join('、'));
    }
    return { success: true, shopCount: getShopList_().length };
  } catch (err) {
    return { success: false, error: err.message, detail: err.stack };
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
      throw new Error(setupRequiredMessage_('店舗マスタ'));
    }
    return { success: true, shops: rows };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 新しい店舗を追加する：①店舗マスタへ1行追加 ②27列ヘッダー付きのデータシートを新規作成
 * ③店舗別サマリの各集計ブロックへこの店舗の行（COUNTIFS/SUMIFS数式つき）を追加する。
 */
function addShopMaster(code, name, area) {
  return lockedEndpoint_(function () { return addShopMasterImpl_(code, name, area); });
}

/** addShopMaster の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function addShopMasterImpl_(code, name, area) {
  try {
    assertCanManageMaster_();
    code = String(code || '').trim();
    name = String(name || '').trim();
    area = String(area || '').trim();
    if (!code || !name) {
      throw new Error('店番と店舗名は必須です。');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);
    if (!masterSheet) {
      throw new Error(setupRequiredMessage_('店舗マスタ'));
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

    ensureShopMasterAreaColumn_(masterSheet);
    masterSheet.appendRow([code, name, true, area]);
    createShopSheets_(ss, [{ code: code, name: name }], HEADERS_MAIN);
    appendShopRowToSummary_(ss, { code: code, name: name });

    return { success: true, code: code, name: name, area: area };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 店舗名を変更する：データシート名を変更（店舗別サマリの数式は名前変更に自動追従する）し、
 * 店舗マスタと、店舗別サマリ上の店舗名テキストセル（数式ではない箇所）を更新する。
 */
function renameShopMaster(code, newName, area) {
  return lockedEndpoint_(function () { return renameShopMasterImpl_(code, newName, area); });
}

/** renameShopMaster の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function renameShopMasterImpl_(code, newName, area) {
  try {
    assertCanManageMaster_();
    code = String(code || '').trim();
    newName = String(newName || '').trim();
    const hasAreaArg = area !== undefined;
    area = String(area || '').trim();
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

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHOP_MASTER_SHEET_NAME);

    const oldName = target.name;
    if (oldName !== newName) {
      const dataSheet = ss.getSheetByName(oldName);
      if (dataSheet) {
        dataSheet.setName(newName); // 店舗別サマリの数式（'旧店舗名'!...）はGoogleシートが自動で追従する
      }
      masterSheet.getRange(target.rowIndex, 2).setValue(newName);
      updateShopNameInSummary_(ss, code, newName);
    }

    if (hasAreaArg && area !== target.area) {
      setShopMasterArea_(masterSheet, target.rowIndex, area);
    }

    return { success: true, code: code, name: newName, area: hasAreaArg ? area : target.area };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 店舗を有効化／無効化する（ソフトデリート）。無効化された店舗はダッシュボードやフィルタから
 * 除外されるが、データシート自体は削除されない。
 */
function setShopActive(code, active) {
  return lockedEndpoint_(function () { return setShopActiveImpl_(code, active); });
}

/** setShopActive の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function setShopActiveImpl_(code, active) {
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
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 店舗を完全に削除する。データ流出・誤削除防止のため、対象店舗のデータシートに
 * データ行が1件でも残っている場合はエラーとし、setShopActive() による無効化を促す。
 */
function deleteShopMaster(code) {
  return lockedEndpoint_(function () { return deleteShopMasterImpl_(code); });
}

/** deleteShopMaster の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function deleteShopMasterImpl_(code) {
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
    return { success: false, error: errorForClient_(err) };
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
  ensureRowCapacity_(sheet, rowNum);
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
    // 数式内のシート参照 '店舗名'! では、店舗名に含まれる ' を '' と二重にしないと数式が壊れる
    const sheetRef = String(shopName).replace(/'/g, "''");

    let f未成約, fリセールアクション, f成約, fPAX, fリセール中, f失注;

    if (blockIdx === 0) {
      f未成約 = "=COUNTA('" + sheetRef + "'!$E$2:$E)";
      fリセールアクション = "=COUNTIFS('" + sheetRef + "'!$A$2:$A,\"〇\")";
      f成約 = "=COUNTIFS('" + sheetRef + "'!$B$2:$B,\"成約\")";
      fPAX = "=SUMIFS('" + sheetRef + "'!$C$2:$C,'" + sheetRef + "'!$B$2:$B,\"成約\")";
      fリセール中 = "=COUNTIFS('" + sheetRef + "'!$B$2:$B,\"リセール中\")";
      f失注 = "=COUNTIFS('" + sheetRef + "'!$B$2:$B,\"失注\")";
    } else {
      f未成約 = "=COUNTIFS('" + sheetRef + "'!$D$2:$D,\"" + monthCode + "\")";
      fリセールアクション = "=COUNTIFS('" + sheetRef + "'!$D$2:$D,\"" + monthCode + "\",'" + sheetRef + "'!$A$2:$A,\"〇\")";
      f成約 = "=COUNTIFS('" + sheetRef + "'!$D$2:$D,\"" + monthCode + "\",'" + sheetRef + "'!$B$2:$B,\"成約\")";
      fPAX = "=SUMIFS('" + sheetRef + "'!$C$2:$C,'" + sheetRef + "'!$D$2:$D,\"" + monthCode + "\",'" + sheetRef + "'!$B$2:$B,\"成約\")";
      fリセール中 = "=COUNTIFS('" + sheetRef + "'!$D$2:$D,\"" + monthCode + "\",'" + sheetRef + "'!$B$2:$B,\"リセール中\")";
      f失注 = "=COUNTIFS('" + sheetRef + "'!$D$2:$D,\"" + monthCode + "\",'" + sheetRef + "'!$B$2:$B,\"失注\")";
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

    const masterKeys = {};       // 社員番号が無い人向けのフォールバック（社員番号＋社員名の組）
    const masterKeysByNo = {};   // 社員番号がある場合はこちらを優先して使う（社員番号だけで本人とみなす）
    master.forEach(function (s) {
      masterKeys[employeeKey_(s.employeeNo, s.employeeName)] = true;
      const no = canonicalKeyPart_(s.employeeNo);
      if (no) masterKeysByNo[no] = true;
    });

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
        const empName = String(row[1] === null || row[1] === undefined ? '' : row[1]).trim();
        if ((empNo === '' || empNo === null) && !empName) return;

        // 社員番号があれば、それだけを手がかりに1人としてまとめる。
        // 社員名の欄（H列）はCSVの取り込み状況によって空欄・表記ゆれのある行が
        // 混じることがあり、社員番号＋社員名の組をそのままキーにすると、
        // 同じ社員番号なのに「名前が空欄の行」「名前入りの行」が別人として
        // 二重に登録候補へ出てしまう。社員番号を優先することでこれを防ぐ。
        const canonicalNo = canonicalKeyPart_(empNo);
        if (canonicalNo && masterKeysByNo[canonicalNo]) return; // 社員番号で既に登録済み
        const key = canonicalNo || employeeKey_(empNo, empName);
        if (masterKeys[key]) return;

        if (!unregisteredMap[key] || (!unregisteredMap[key].employeeName && empName)) {
          unregisteredMap[key] = { officeCode: shop.code, officeName: shop.name, employeeNo: normalizeEmployeeNo_(empNo), employeeName: empName };
        }
      });
    });

    return {
      success: true,
      staff: master.map(function (s) {
        return {
          rowIndex: s.rowIndex,
          officeCode: s.officeCode,
          officeName: officeNameForCode_(s.officeCode, shopNameByCode),
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
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * スタッフマスタへ新しいスタッフを1件追加する（実績の有無に関わらず事前登録できる）。マスタ管理者のみ利用可能。
 * @param {string} googleAccount ログイン権限判定に使うGoogleアカウント（gmail等）。管理者・マスタ管理は必須。
 * @param {string} role 権限レベル（'一般' | '管理者' | 'マスタ管理'）。
 */
function addStaffMaster(officeCode, employeeNo, employeeName, googleAccount, role) {
  return lockedEndpoint_(function () { return addStaffMasterImpl_(officeCode, employeeNo, employeeName, googleAccount, role); });
}

/** addStaffMaster の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function addStaffMasterImpl_(officeCode, employeeNo, employeeName, googleAccount, role) {
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

    if (isHqOfficeCode_(officeCode)) {
      // 本部は店舗を持たないため、自店舗しか見られない「一般」では画面に何も出せない
      if (role === ROLE_GENERAL) {
        throw new Error('本部の所属で登録できるのは「管理者」「マスタ管理」のみです。' +
          '（本部は担当店舗を持たないため、自店舗のみ閲覧する「一般」権限では表示できるデータがありません）');
      }
      officeCode = HQ_OFFICE_CODE;
    } else {
      const shopList = getShopList_();
      if (!shopList.some(function (s) { return s.code === officeCode; })) {
        throw new Error('不正な店舗（営業所コード）です: ' + officeCode);
      }
    }

    const existing = getStaffMasterRows_();
    // 社員番号の桁落ちがあっても同一人物として検出する
    if (existing.some(function (s) { return employeeKey_(s.employeeNo, s.employeeName) === employeeKey_(employeeNo, employeeName); })) {
      throw new Error('同じ社員番号・社員名のスタッフが既に登録されています。');
    }
    if (googleAccount && existing.some(function (s) { return s.googleAccount && s.googleAccount.toLowerCase() === googleAccount.toLowerCase(); })) {
      throw new Error('同じGoogleアカウントが既に別のスタッフに登録されています。');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
    if (!sheet) {
      throw new Error(setupRequiredMessage_('スタッフマスタ'));
    }
    assertNotLockingSelfOut_(existing.concat([{ active: true, role: role, googleAccount: googleAccount }]));
    sheet.appendRow([officeCode, normalizeEmployeeNo_(employeeNo), employeeName, googleAccount, role, true]);

    return { success: true };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * スタッフマスタの既存行を更新する（rowIndexで対象行を特定）。マスタ管理者のみ利用可能。
 */
function updateStaffMaster(rowIndex, officeCode, employeeNo, employeeName, googleAccount, role, expectedStaff) {
  return lockedEndpoint_(function () { return updateStaffMasterImpl_(rowIndex, officeCode, employeeNo, employeeName, googleAccount, role, expectedStaff); });
}

/** updateStaffMaster の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function updateStaffMasterImpl_(rowIndex, officeCode, employeeNo, employeeName, googleAccount, role, expectedStaff) {
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

    if (isHqOfficeCode_(officeCode)) {
      // 本部は店舗を持たないため、自店舗しか見られない「一般」では画面に何も出せない
      if (role === ROLE_GENERAL) {
        throw new Error('本部の所属で登録できるのは「管理者」「マスタ管理」のみです。' +
          '（本部は担当店舗を持たないため、自店舗のみ閲覧する「一般」権限では表示できるデータがありません）');
      }
      officeCode = HQ_OFFICE_CODE;
    } else {
      const shopList = getShopList_();
      if (!shopList.some(function (s) { return s.code === officeCode; })) {
        throw new Error('不正な店舗（営業所コード）です: ' + officeCode);
      }
    }

    const existing = getStaffMasterRows_();
    if (googleAccount && existing.some(function (s) { return s.rowIndex !== rIdx && s.googleAccount && s.googleAccount.toLowerCase() === googleAccount.toLowerCase(); })) {
      throw new Error('同じGoogleアカウントが既に別のスタッフに登録されています。');
    }
    const before = existing.find(function (s) { return s.rowIndex === rIdx; });
    assertStaffRowIdentity_(before, expectedStaff);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
    if (!sheet) {
      throw new Error('「スタッフマスタ」シートが見つかりません。');
    }
    assertNotLockingSelfOut_(existing.map(function (s) {
      return s.rowIndex === rIdx ? { active: s.active, role: role, googleAccount: googleAccount } : s;
    }));
    sheet.getRange(rIdx, 1, 1, 5).setValues([[officeCode, employeeNo === undefined || employeeNo === null ? '' : employeeNo, employeeName, googleAccount, role]]);

    // 社員名・所属店舗（異動）が変わっていれば、過去に取り込み済みのリセールリストの
    // 該当行（各店舗シート）も合わせて修正する。スタッフマスタの編集だけでは
    // CSV取込時点の値が残ったままの過去データに反映されないため。
    let updatedRecordCount = 0;
    if (before && (before.employeeName !== employeeName || before.officeCode !== officeCode)) {
      updatedRecordCount = applyStaffRenameOrTransfer_(
        before.officeCode, before.employeeNo, before.employeeName,
        officeCode, employeeName
      );
    }

    return { success: true, updatedRecordCount: updatedRecordCount };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * スタッフマスタで社員名・所属店舗（異動）を変更したとき、過去に取り込み済みの
 * リセールリスト（各店舗シート）の該当行も合わせて修正する。
 * ・社員番号があれば、それを手がかりに全店舗シートを横断的に探す（本人が過去に
 *   別の店舗で登録されていた行も拾えるようにするため＝異動対応）。
 * ・社員番号が無い場合は、社員番号だけでは本人を特定できないため、変更前の
 *   「所属店舗＋社員名」が完全一致する行だけを対象にする（別人を巻き込まないため）。
 * 対象行は社員名を新しい名前に書き換え、所属店舗が変わっていれば、その行を
 * リセール・STS・ACT日・メモなど入力済みの内容ごと新しい店舗のシートへ転記する。
 * @param {string} [afterEmployeeNo] 指定した場合、対象行の社員番号もこの値に書き換える
 *   （表記ゆれ等で別の社員番号として登録されてしまった候補を、既存のスタッフへ
 *   統合するmergeUnregisteredStaff用）。省略時は社員番号には触れない（従来どおり）。
 * @return {number} 修正した過去データの件数
 */
function applyStaffRenameOrTransfer_(beforeOfficeCode, beforeEmployeeNo, beforeEmployeeName, afterOfficeCode, afterEmployeeName, afterEmployeeNo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shopList = getShopList_();
  const lastCol = HEADERS_MAIN.length;
  const IDX_EMPNO = HEADERS_MAIN.indexOf('社員番号');
  const IDX_EMPNAME = HEADERS_MAIN.indexOf('社員名');
  const IDX_OFFICE = HEADERS_MAIN.indexOf('営業所コード');
  const COL_EMPNO = IDX_EMPNO + 1;
  const COL_EMPNAME = IDX_EMPNAME + 1;
  const changeEmployeeNo = afterEmployeeNo !== undefined && afterEmployeeNo !== null;

  const afterShop = shopList.find(function (s) { return s.code === afterOfficeCode; });
  // 本部（店舗を持たない）へ異動した場合、実績データの転記先が無いため名前だけ直す
  const canMoveSheet = !!afterShop && afterOfficeCode !== beforeOfficeCode;

  let updatedCount = 0;
  const rowsToAppend = [];

  shopList.forEach(function (shop) {
    const sheet = ss.getSheetByName(shop.name);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const rowsToDelete = [];

    values.forEach(function (row, i) {
      const isBlank = row.every(function (c) { return c === '' || c === null; });
      if (isBlank) return;

      const empName = String(row[IDX_EMPNAME] || '').trim();
      const isMatch = beforeEmployeeNo
        ? canonicalKeyPart_(row[IDX_EMPNO]) === canonicalKeyPart_(beforeEmployeeNo)
        : (shop.code === beforeOfficeCode && empName === beforeEmployeeName);
      if (!isMatch) return;

      const rIdx = i + 2;
      const empNoNeedsUpdate = changeEmployeeNo && canonicalKeyPart_(row[IDX_EMPNO]) !== canonicalKeyPart_(afterEmployeeNo);

      if (canMoveSheet && shop.code !== afterOfficeCode) {
        // 転記（異動）：店舗をまたぐので必ず「変更あり」
        const moved = row.slice();
        moved[IDX_EMPNAME] = afterEmployeeName;
        moved[IDX_OFFICE] = afterOfficeCode;
        if (changeEmployeeNo) moved[IDX_EMPNO] = afterEmployeeNo;
        rowsToAppend.push(moved);
        rowsToDelete.push(rIdx);
        updatedCount++;
      } else if (empName !== afterEmployeeName || empNoNeedsUpdate) {
        // 同じ店舗のまま社員名（・社員番号の統合時はそれも）を修正
        setTextCell_(sheet, rIdx, COL_EMPNAME, afterEmployeeName);
        if (empNoNeedsUpdate) setTextCell_(sheet, rIdx, COL_EMPNO, afterEmployeeNo);
        updatedCount++;
      }
      // どちらでもない場合（本部異動で名前も変わっていない等）は、実際には何も
      // 書き換わっていないので件数に含めない。「N件修正しました」の表示が
      // 実態と食い違う（何もしていないのに件数だけ出る）ことを防ぐため。
    });

    // 転記・削除する行は後ろから消す（前から消すと残りの行番号がずれるため）
    rowsToDelete.sort(function (a, b) { return b - a; }).forEach(function (r) { sheet.deleteRow(r); });
  });

  if (rowsToAppend.length) {
    const destSheet = ss.getSheetByName(afterShop.name);
    if (!destSheet) {
      throw new Error('異動先の店舗シートが見つかりません: ' + afterShop.name);
    }
    const startRow = destSheet.getLastRow() + 1;
    ensureRowCapacity_(destSheet, startRow + rowsToAppend.length - 1);
    destSheet.getRange(startRow, 1, rowsToAppend.length, lastCol).setValues(rowsToAppend);
    // 転記先の列がテキスト書式のはずだが、念のため転記した行にも改めて適用しておく
    // （0落ち・日付化を防ぐため。TEXT_CELL_COLUMNSは列全体に書式済みなので通常は不要）
    Object.keys(TEXT_CELL_COLUMNS).forEach(function (colName) {
      const c = HEADERS_MAIN.indexOf(colName) + 1;
      if (c > 0) destSheet.getRange(startRow, c, rowsToAppend.length, 1).setNumberFormat('@');
    });
  }

  return updatedCount;
}

/**
 * 「実績はあるがマスタ未登録のスタッフ」一覧に出てくる候補（手入力の表記ゆれ等で
 * 社員番号・社員名が微妙に違う別人扱いになっているだけの、実際は同一人物）を、
 * 既にマスタ登録済みの特定のスタッフへ統合する。マスタ管理者のみ利用可能。
 *
 * 統合元（source）の候補に一致する過去データ（各店舗シート）を、統合先（target）の
 * 社員番号・社員名・所属店舗に書き換える。所属店舗が違えば、リセール・STS・ACT日・
 * メモなど入力済みの内容ごと統合先の店舗のシートへ転記する（applyStaffRenameOrTransfer_
 * を再利用）。
 *
 * @param {string} sourceOfficeCode 統合元候補の所属店舗コード（getStaffMasterList()の
 *   unregistered[].officeCode。社員番号があれば実際にはどの店舗の行も対象になり得る）
 * @param {string} sourceEmployeeNo 統合元候補の社員番号（無い場合は空文字）
 * @param {string} sourceEmployeeName 統合元候補の社員名
 * @param {number} targetRowIndex 統合先スタッフの、スタッフマスタ上の行番号
 */
function mergeUnregisteredStaff(sourceOfficeCode, sourceEmployeeNo, sourceEmployeeName, targetRowIndex, expectedTarget) {
  return lockedEndpoint_(function () { return mergeUnregisteredStaffImpl_(sourceOfficeCode, sourceEmployeeNo, sourceEmployeeName, targetRowIndex, expectedTarget); });
}

/** mergeUnregisteredStaff の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function mergeUnregisteredStaffImpl_(sourceOfficeCode, sourceEmployeeNo, sourceEmployeeName, targetRowIndex, expectedTarget) {
  try {
    assertCanManageMaster_();
    sourceOfficeCode = normalizeOfficeCode_(sourceOfficeCode);
    sourceEmployeeNo = normalizeEmployeeNo_(sourceEmployeeNo);
    sourceEmployeeName = String(sourceEmployeeName || '').trim();
    if (!sourceEmployeeNo && !sourceEmployeeName) {
      throw new Error('統合元の情報が指定されていません。');
    }

    const rIdx = parseInt(targetRowIndex, 10);
    if (isNaN(rIdx) || rIdx < 2) {
      throw new Error('統合先のスタッフが指定されていません。');
    }
    const target = getStaffMasterRows_().filter(function (s) { return s.rowIndex === rIdx; })[0];
    if (!target) {
      throw new Error('統合先のスタッフが見つかりません。');
    }
    assertStaffRowIdentity_(target, expectedTarget);
    if (canonicalKeyPart_(target.employeeNo) === canonicalKeyPart_(sourceEmployeeNo) &&
        target.employeeName === sourceEmployeeName && target.officeCode === sourceOfficeCode) {
      throw new Error('統合元と統合先が同じです。');
    }

    const updatedRecordCount = applyStaffRenameOrTransfer_(
      sourceOfficeCode, sourceEmployeeNo, sourceEmployeeName,
      target.officeCode, target.employeeName, target.employeeNo
    );

    return { success: true, updatedRecordCount: updatedRecordCount, target: target };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

// ============================================================================
// 非常口：スプレッドシートのメニューから、自分をマスタ管理者として登録する
// ----------------------------------------------------------------------------
// 画面（Webアプリ）の管理機能は「マスタ管理」だけが使えるため、登録したアドレスと実際に
// ログインしているアドレスが食い違う等でマスタ管理者が1人もいなくなると、画面からは直せない。
// スプレッドシートの編集権限がある人は、そもそもスタッフマスタのシートを直接書き換えられるため、
// このメニューはセキュリティ上の新しい抜け道にはならない（誤入力を防ぐ安全な手順を用意するだけ）。
// ============================================================================

/** 今ログインしているアカウントが、システムからどう見えているかを返す（診断用） */
function getAccessDiagnosis_() {
  let email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim(); } catch (e) { email = ''; }
  const staff = getStaffMasterRows_();
  const resolved = resolveRoleForEmail_(email, staff, getSpreadsheetOwnerEmail_());
  const masters = staff.filter(function (x) { return x.active && x.role === ROLE_MASTER && x.googleAccount; });
  const lowered = email.toLowerCase();
  const inactiveSame = !resolved.matched && !!lowered && staff.some(function (x) {
    return !x.active && String(x.googleAccount || '').trim().toLowerCase() === lowered;
  });
  return {
    email: email,
    identified: !!resolved.matched,
    role: resolved.role,
    canManageMaster: resolved.role === ROLE_MASTER,
    isOwner: resolved.isOwner === true,
    staffName: resolved.matched ? resolved.matched.employeeName : '',
    hasMaster: masters.length > 0,
    masterAccounts: masters.map(function (x) { return x.googleAccount; }),
    registeredButInactive: inactiveSame
  };
}

/**
 * 指定アカウントをマスタ管理者として登録する（ロックの内側で呼ぶこと）。
 * ・スタッフマスタに同じアドレスの行があれば、その行の権限を「マスタ管理」・有効にする
 * ・無ければ、本部所属の新しい行として追加する（氏名が必要）
 * @return {{ok:boolean, action:string, message:string}}
 */
function registerAccountAsMaster_(email, name) {
  email = String(email || '').trim();
  name = String(name || '').trim();
  if (!isValidEmail_(email)) {
    return { ok: false, action: 'none', message: 'ログイン中のメールアドレスを確認できないため登録できません。会社のGoogleアカウントでログインし直して、もう一度お試しください。' };
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(STAFF_MASTER_SHEET_NAME);
  if (!sheet) {
    return { ok: false, action: 'none', message: '「スタッフマスタ」シートがありません。先に「① 全シートを初期化」を実行してください。' };
  }
  const rows = getStaffMasterRows_();
  const lowered = email.toLowerCase();
  const same = rows.filter(function (x) { return String(x.googleAccount || '').trim().toLowerCase() === lowered; });
  if (same.length > 0) {
    const row = same[0];
    if (row.role === ROLE_MASTER && row.active) {
      return { ok: true, action: 'already', message: 'すでにマスタ管理者として登録されています（' + row.employeeName + '）。' };
    }
    sheet.getRange(row.rowIndex, 5).setValue(ROLE_MASTER);
    if (!row.active) sheet.getRange(row.rowIndex, 6).setValue(true);
    return { ok: true, action: 'updated', message: row.employeeName + ' さんの権限を「マスタ管理」にしました。' };
  }
  if (!name) {
    return { ok: false, action: 'needName', message: '氏名が必要です。' };
  }
  sheet.appendRow([HQ_OFFICE_CODE, '', name, email, ROLE_MASTER, true]);
  return { ok: true, action: 'added', message: name + ' さん（' + email + '）を本部所属のマスタ管理者として追加しました。' };
}

/** メニュー：現在のアカウントと権限の状態を表示する */
function showAccessDiagnosis() {
  const ui = SpreadsheetApp.getUi();
  const d = getAccessDiagnosis_();
  const lines = [
    'システムから見えているあなたのアカウント：' + (d.email || '（確認できません）'),
    '判定された権限：' + d.role + (d.identified ? '（スタッフマスタの「' + d.staffName + '」さんとして登録済み）' : '（スタッフマスタに登録が見つかりません）'),
    'Googleアカウント付きのマスタ管理者：' + (d.hasMaster ? d.masterAccounts.join('、') : 'まだ登録されていません（導入初期のため、全員がマスタ管理相当です）')
  ];
  if (d.isOwner) lines.push('※あなたはこのスプレッドシートの所有者のため、スタッフマスタの登録内容に関係なく常にマスタ管理として扱われます。');
  if (d.registeredButInactive) lines.push('※あなたのアドレスの行は「有効」がFALSEのため権限が使えません。スタッフマスタの「有効」をTRUEにしてください。');
  if (!d.canManageMaster) lines.push('\n管理画面が使えない場合は、メニュー「自分をマスタ管理者として登録」から登録できます。');
  ui.alert('アクセスの診断', lines.join('\n'), ui.ButtonSet.OK);
}

/** メニュー：自分（ログイン中のアカウント）をマスタ管理者として登録する */
function registerMyselfAsMaster() {
  const ui = SpreadsheetApp.getUi();
  const d = getAccessDiagnosis_();
  if (!d.email) {
    ui.alert('登録できません', 'ログイン中のメールアドレスを確認できません。会社のGoogleアカウントでログインし直してください。', ui.ButtonSet.OK);
    return;
  }
  const others = d.hasMaster ? '\n\n現在のマスタ管理者：' + d.masterAccounts.join('、') + '\n（追加しても、他の方の権限は変わりません）' : '';
  const ok = ui.alert('自分をマスタ管理者として登録',
    'あなた（' + d.email + '）を「マスタ管理」として登録します。\nマスタ管理は、全データ削除・CSV取込・店舗/スタッフ管理などができる最上位の権限です。よろしいですか？' + others,
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  let name = '';
  const existing = getStaffMasterRows_().some(function (x) { return String(x.googleAccount || '').trim().toLowerCase() === d.email.toLowerCase(); });
  if (!existing) {
    const r = ui.prompt('氏名の入力', 'スタッフマスタに新しく追加します。あなたの氏名を入力してください（例：山田 太郎）', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    name = r.getResponseText();
  }
  let result;
  try {
    result = withDataLock_(function () { return registerAccountAsMaster_(d.email, name); });
  } catch (err) {
    result = { ok: false, message: err.message };
  }
  ui.alert(result.ok ? '登録しました' : '登録できませんでした',
    result.message + (result.ok ? '\nWebアプリの画面を再読み込みすると、「店舗・スタッフ管理」タブが使えるようになります。' : ''), ui.ButtonSet.OK);
}

// ============================================================================
// 人事名簿からのメールアドレス一括登録
// ----------------------------------------------------------------------------
// 営業日報CSVにはメールアドレスが無いため、CSVから自動登録されたスタッフは
// Googleアカウント欄が空欄になる（＝本人を見分けられず、権限が正しく効かない）。
// 人事名簿（CSV / Excel）の「担当者NO」「社員番号」とスタッフマスタの社員番号を突き合わせ、
// Googleアカウント欄をまとめて埋める。誤って別人のアドレスを入れると、その人に
// 別の人の権限・閲覧範囲が付いてしまうため、少しでも怪しいものは登録せず一覧で知らせる。
// ============================================================================

/** 見出し・番号の比較用：全角→半角、大文字化、空白・記号の除去 */
function normalizeForMatch_(value) {
  let s = String(value === null || value === undefined ? '' : value);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  return s.replace(/[\s　]+/g, '').toUpperCase();
}

/** 社員番号の突き合わせ用キー（全角・先頭の0・空白の違いを吸収） */
function staffIdMatchKey_(value) {
  const s = normalizeForMatch_(value).replace(/[.\-‐－ー]/g, '');
  return s === '' ? '' : canonicalKeyPart_(s);
}

function rosterHeaderKind_(header) {
  const h = normalizeForMatch_(header).replace(/[.．・_\-（）()]/g, '');
  if (!h) return '';
  if (/^(担当者|社員|従業員|職員)(NO|NUMBER|番号|コード|CD|ID)$/.test(h)) return 'id';
  if (/(メール|MAIL|アドレス|GOOGLEアカウント|アカウント)/.test(h)) return 'email';
  if (/^(氏名|社員名|担当者名|従業員名|職員名|名前|氏名漢字|漢字氏名)$/.test(h)) return 'name';
  return '';
}

function isValidEmail_(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
}

/**
 * 人事名簿を読み込み、スタッフマスタのGoogleアカウント欄をまとめて登録する（マスタ管理者のみ）。
 * @param {Object} payload readImportFileの結果（{kind:'text', text} または {kind:'workbook', base64, fileName, mimeType}）
 * @param {boolean} dryRun trueなら登録せずに結果の見込みだけを返す（画面の「内容を確認する」）
 */
function importStaffEmails(payload, dryRun) {
  return lockedEndpoint_(function () { return importStaffEmailsImpl_(payload, dryRun); });
}

/** importStaffEmails の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function importStaffEmailsImpl_(payload, dryRun) {
  try {
    assertCanManageMaster_();
    if (!payload || (payload.kind !== 'text' && payload.kind !== 'workbook')) {
      throw new Error('名簿ファイルを選んでください。');
    }
    let rows;
    if (payload.kind === 'workbook') {
      rows = readWorkbookRows_(payload.base64, payload.fileName, payload.mimeType);
    } else {
      assertNotBinaryWorkbook_(payload.text);
      const text = String(payload.text || '');
      const lines = text.split(/\r\n|\r|\n/).filter(function (l) { return l.trim() !== ''; }).slice(0, 5).join('\n');
      let delimiter = ',', best = 0;
      [',', '\t', ';'].forEach(function (d) { const c = lines.split(d).length - 1; if (c > best) { best = c; delimiter = d; } });
      rows = Utilities.parseCsv(text, delimiter);
    }
    if (!rows || rows.length === 0) throw new Error('名簿の中身が空でした。');

    // 見出し行を探す（先頭30行のうち、番号列とメール列の両方がある最初の行）
    let headerIdx = -1, idCols = [], emailCol = -1, nameCol = -1;
    for (let i = 0; i < Math.min(rows.length, 30) && headerIdx === -1; i++) {
      const ids = [], emails = [], names = [];
      (rows[i] || []).forEach(function (cell, c) {
        const k = rosterHeaderKind_(cell);
        if (k === 'id') ids.push(c); else if (k === 'email') emails.push(c); else if (k === 'name') names.push(c);
      });
      if (ids.length > 0 && emails.length > 0) {
        headerIdx = i; idCols = ids; nameCol = names.length ? names[0] : -1;
        // メールらしい列が複数ある場合（「メールアドレス」「メール配信可否」など）は、
        // 実際にアドレスの形をした値が最も多い列を使う
        let bestCount = -1;
        emails.forEach(function (c) {
          let n = 0;
          for (let r = i + 1; r < Math.min(rows.length, i + 201); r++) {
            if (isValidEmail_(String((rows[r] || [])[c] || '').trim())) n++;
          }
          if (n > bestCount) { bestCount = n; emailCol = c; }
        });
      }
    }
    if (headerIdx === -1) {
      throw new Error('名簿の見出し行が見つかりません。「担当者NO」または「社員番号」の列と、「メールアドレス」の列が' +
        '必要です（1行目付近に見出しがあるかご確認ください）。\n実際に読み取れた1行目：' + summarizeRowForError_(rows[0]));
    }
    const header = rows[headerIdx];

    // 名簿を番号で引けるようにする（担当者NO・社員番号の両方で引けるよう、1人を複数の番号で登録）
    const rosterByKey = {};
    let rosterCount = 0;
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const email = String(row[emailCol] === undefined || row[emailCol] === null ? '' : row[emailCol]).trim();
      const name = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
      const keys = [];
      idCols.forEach(function (c) {
        const k = staffIdMatchKey_(row[c]);
        if (k && keys.indexOf(k) === -1) keys.push(k);
      });
      if (!keys.length || !email) continue;
      rosterCount++;
      const entry = { email: email, name: name, rosterRow: r + 1 };
      keys.forEach(function (k) { (rosterByKey[k] = rosterByKey[k] || []).push(entry); });
    }

    const staffRows = getStaffMasterRows_();
    const shopNameByCode = {};
    getShopList_().forEach(function (sh) { shopNameByCode[sh.code] = sh.name; });
    const label = function (s) {
      return { rowIndex: s.rowIndex, officeName: officeNameForCode_(s.officeCode, shopNameByCode),
        employeeNo: s.employeeNo, employeeName: s.employeeName };
    };
    // 同じ社員番号のスタッフ行が複数あると、どちらの人か決められないため対象外にする
    const staffCountByKey = {};
    staffRows.forEach(function (s) {
      if (!s.active) return;
      const k = staffIdMatchKey_(s.employeeNo);
      if (k) staffCountByKey[k] = (staffCountByKey[k] || 0) + 1;
    });
    // 既に使われているアドレス（重複登録を防ぐ）
    const usedEmail = {};
    staffRows.forEach(function (s) { if (s.googleAccount) usedEmail[s.googleAccount.toLowerCase()] = s.rowIndex; });

    const result = { apply: [], alreadySame: [], keepExisting: [], nameMismatch: [], conflict: [], invalidEmail: [], notInRoster: [] };
    const proposals = []; // 登録候補（アドレスの重複を確かめてから確定する）
    staffRows.forEach(function (s) {
      if (!s.active) return;
      const k = staffIdMatchKey_(s.employeeNo);
      if (!k) return;
      const hits = rosterByKey[k] || [];
      const distinct = [];
      hits.forEach(function (h) { if (!distinct.some(function (d) { return d.email.toLowerCase() === h.email.toLowerCase(); })) distinct.push(h); });
      if (distinct.length === 0) { result.notInRoster.push(label(s)); return; }
      if (distinct.length > 1) {
        result.conflict.push(Object.assign(label(s), { reason: '名簿に同じ番号の人が複数います（' + distinct.map(function (d) { return d.email; }).join('、') + '）' }));
        return;
      }
      if (staffCountByKey[k] > 1) {
        result.conflict.push(Object.assign(label(s), { reason: 'スタッフマスタに同じ社員番号の人が複数登録されています' }));
        return;
      }
      const entry = distinct[0];
      if (!isValidEmail_(entry.email)) {
        result.invalidEmail.push(Object.assign(label(s), { email: entry.email, rosterRow: entry.rosterRow }));
        return;
      }
      if (entry.name && normalizeForMatch_(entry.name) !== normalizeForMatch_(s.employeeName)) {
        result.nameMismatch.push(Object.assign(label(s), { email: entry.email, rosterName: entry.name }));
        return;
      }
      if (s.googleAccount) {
        if (s.googleAccount.toLowerCase() === entry.email.toLowerCase()) result.alreadySame.push(label(s));
        else result.keepExisting.push(Object.assign(label(s), { current: s.googleAccount, roster: entry.email }));
        return;
      }
      proposals.push({ staff: s, email: entry.email });
    });

    // 同じアドレスが複数の人に割り当てられそうな場合（名簿の誤りなど）は、先に並んでいる人が
    // 取ってしまわないよう、該当する全員を登録しない（どちらが本人か決められないため）
    const proposedCount = {};
    proposals.forEach(function (p) { const e = p.email.toLowerCase(); proposedCount[e] = (proposedCount[e] || 0) + 1; });
    proposals.forEach(function (p) {
      const e = p.email.toLowerCase();
      const owner = usedEmail[e];
      if (proposedCount[e] > 1 || (owner !== undefined && owner !== p.staff.rowIndex)) {
        result.conflict.push(Object.assign(label(p.staff), {
          reason: 'このアドレス（' + p.email + '）が' + (proposedCount[e] > 1 ? '名簿で複数の人に付いています' : '別のスタッフに登録済みです')
        }));
        return;
      }
      result.apply.push(Object.assign(label(p.staff), { email: p.email }));
    });

    let appliedCount = 0;
    if (!dryRun && result.apply.length > 0) {
      const byRow = {};
      result.apply.forEach(function (a) { byRow[a.rowIndex] = a.email; });
      // 登録した結果、操作している本人がマスタ管理でなくならないか（自分を締め出さないか）を先に確かめる
      assertNotLockingSelfOut_(staffRows.map(function (s) {
        return byRow[s.rowIndex] ? Object.assign({}, s, { googleAccount: byRow[s.rowIndex] }) : s;
      }));
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_MASTER_SHEET_NAME);
      const lastRow = sheet.getLastRow();
      const col = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
      Object.keys(byRow).forEach(function (r) { col[Number(r) - 2][0] = byRow[r]; });
      sheet.getRange(2, 4, lastRow - 1, 1).setValues(col);
      appliedCount = result.apply.length;
    }

    return {
      success: true,
      dryRun: !!dryRun,
      appliedCount: appliedCount,
      rosterCount: rosterCount,
      columns: {
        id: idCols.map(function (c) { return String(header[c]); }),
        email: String(header[emailCol]),
        name: nameCol >= 0 ? String(header[nameCol]) : ''
      },
      counts: Object.keys(result).reduce(function (o, k) { o[k] = result[k].length; return o; }, {}),
      items: result
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * スタッフマスタの行を削除する（過去の実績データ自体は削除されない）。マスタ管理者のみ利用可能。
 */
function deleteStaffMaster(rowIndex, expectedStaff) {
  return lockedEndpoint_(function () { return deleteStaffMasterImpl_(rowIndex, expectedStaff); });
}

/** deleteStaffMaster の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function deleteStaffMasterImpl_(rowIndex, expectedStaff) {
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
    const staffRows = getStaffMasterRows_();
    assertStaffRowIdentity_(staffRows.filter(function (s) { return s.rowIndex === rIdx; })[0], expectedStaff);
    assertNotLockingSelfOut_(staffRows.filter(function (s) { return s.rowIndex !== rIdx; }));
    sheet.deleteRow(rIdx);

    return { success: true };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
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

// ============================================================================
// Gemini（Workspace版）でスプレッドシート上から傾向分析するための集計シート
// ----------------------------------------------------------------------------
// 外部APIは使わない。店舗別データは10シートに分かれていて生データのままでは
// Geminiが読み取りにくいため、集計済みの縦持ちテーブルを1枚にまとめて出力する。
// このシートを開いた状態でサイドパネルのGeminiに質問すると傾向分析ができる。
// 個人が特定される情報（詳細・お客様名等）は出力しない。
// ============================================================================
const AI_SUMMARY_SHEET_NAME = 'AI分析用サマリ';

/**
 * 「AI分析用サマリ」シートを最新のデータで作り直す。スプレッドシートのメニューから実行する。
 */
// 末尾に_を付けて非公開にしている（画面のブラウザから直接呼び出されないようにするため。メニュー専用）
function buildAiAnalysisSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shopList = getShopList_();
  const cutoff = getRetentionCutoffDate_();
  const periods = getRecentPeriods_();
  const periodKeys = {};
  periods.forEach(function (p) { periodKeys[p.key] = p.label; });

  // ---- 生データを読み込む（保存期間内のみ） ----
  const rows = [];
  shopList.forEach(function (shop) {
    const sheet = ss.getSheetByName(shop.name);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const values = sheet.getRange(2, 1, lastRow - 1, HEADERS_MAIN.length).getValues();
    values.forEach(function (r) {
      const targetDate = normalizeTargetDate_(r[4]);
      if (!targetDate || targetDate < cutoff) return;
      const info = getFiscalPeriodInfo_(targetDate);
      rows.push({
        shopName: shop.name,
        resale: r[0],
        sts: r[1],
        pax: Number(r[2]) || 0,
        month: String(r[3] || ''),
        reason: String(r[8] || '') || '(未設定)',
        city: String(r[9] || '') || '(未設定)',
        contact: String(r[13] || '') || '(未設定)',
        purpose: String(r[12] || '') || '(未設定)',
        periodLabel: info ? periodLabel_(info.periodNumber, info.half) : '(期不明)'
      });
    });
  });

  // ---- 集計ヘルパー（区分ごとに未成約数・リセール数・継続率などを積む） ----
  const buckets = {};
  const push = function (category, name, row) {
    const key = category + '｜' + name;
    if (!buckets[key]) {
      buckets[key] = { category: category, name: name, total: 0, resale: 0, progress: 0, lost: 0, contract: 0, pax: 0 };
    }
    const b = buckets[key];
    b.total += 1;
    if (row.resale === '〇') b.resale += 1;
    if (row.sts === 'リセール中') b.progress += 1;
    if (row.sts === '失注') b.lost += 1;
    if (row.sts === '成約') { b.contract += 1; b.pax += row.pax; }
  };

  rows.forEach(function (r) {
    push('全体', '全体', r);
    push('店舗別', r.shopName, r);
    push('未成約理由(大)別', r.reason, r);
    push('都市コード別', r.city, r);
    push('接客方法別', r.contact, r);
    push('旅行目的(小)別', r.purpose, r);
    push('期別', r.periodLabel, r);
    push('月別', (r.month.indexOf('0') === 0 ? r.month.substring(1) : r.month) + '月', r);
    push('店舗×期別', r.shopName + ' / ' + r.periodLabel, r);
  });

  // ---- シートへ書き出し ----
  let sheet = ss.getSheetByName(AI_SUMMARY_SHEET_NAME);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(AI_SUMMARY_SHEET_NAME);
  }

  const note = [
    ['このシートは「AI分析用サマリ」です（メニューから再作成できます）'],
    ['集計対象: 直近2年（' + periods.map(function (p) { return p.label; }).join('・') + '） / 基準日 ' + cutoff + ' 以降'],
    ['用語: 未成約=その場で成約に至らなかった相談 / リセール=再提案・フォローの実施'],
    ['リセール継続率 = リセール数 ÷ 未成約数（最重要指標） / リセール成約率 = 成約数 ÷ リセール数'],
    ['お客様個人が特定される情報は含めていません'],
    ['']
  ];
  sheet.getRange(1, 1, note.length, 1).setValues(note);
  sheet.getRange(1, 1).setFontWeight('bold');

  const header = ['区分', '名称', '未成約数', 'リセール数', 'リセール継続率%', 'リセール中', '失注', '成約数', 'PAX数', 'リセール成約率%'];
  const headerRow = note.length + 1;
  sheet.getRange(headerRow, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#1d4ed8').setFontColor('#ffffff');

  const categoryOrder = ['全体', '期別', '店舗別', '店舗×期別', '未成約理由(大)別', '都市コード別', '接客方法別', '旅行目的(小)別', '月別'];
  const body = Object.keys(buckets).map(function (k) { return buckets[k]; });
  body.sort(function (a, b) {
    const ca = categoryOrder.indexOf(a.category), cb = categoryOrder.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return b.total - a.total;
  });

  const values = body.map(function (b) {
    return [
      b.category, b.name, b.total, b.resale,
      b.total > 0 ? Math.round((b.resale / b.total) * 1000) / 10 : 0,
      b.progress, b.lost, b.contract, b.pax,
      b.resale > 0 ? Math.round((b.contract / b.resale) * 1000) / 10 : 0
    ];
  });

  if (values.length > 0) {
    sheet.getRange(headerRow + 1, 1, values.length, header.length).setValues(values);
  }
  sheet.setFrozenRows(headerRow);
  sheet.autoResizeColumns(1, header.length);

  return { success: true, rowCount: values.length, sourceRowCount: rows.length };
}

/**
 * メニューから実行したときに、完了メッセージをダイアログで知らせる。
 */
function buildAiAnalysisSheetFromMenu() {
  try {
    const res = withDataLock_(buildAiAnalysisSheet_);
    SpreadsheetApp.getUi().alert(
      '「' + AI_SUMMARY_SHEET_NAME + '」シートを更新しました。\n\n' +
      '元データ ' + res.sourceRowCount + ' 件から ' + res.rowCount + ' 行の集計を作成しました。\n' +
      'このシートを開いた状態で、サイドパネルのGeminiに質問すると傾向分析ができます。\n\n' +
      '質問例：\n' +
      '・リセール継続率が低い店舗はどこ？全体平均と比べてどれくらい差がある？\n' +
      '・継続率が低い店舗で多い未成約理由は？\n' +
      '・期をまたいで継続率が落ちている店舗はある？'
    );
  } catch (err) {
    SpreadsheetApp.getUi().alert('AI分析用サマリの作成に失敗しました:\n' + err.message);
  }
}

// ============================================================================
// AI分析レポート（Geminiの回答をダッシュボード上に保存・共有する）
// ----------------------------------------------------------------------------
// 外部APIを使わないため分析文の生成そのものはGemini側で行うが、その回答を
// この画面に貼り戻して保存しておくことで、全員が同じ所見をダッシュボード上で
// 見られるようにする。誰がいつ・どの範囲で分析したかも一緒に残す。
// ============================================================================
const AI_REPORT_SHEET_NAME = 'AI分析レポート';

/**
 * 「AI分析レポート」シートを取得する。無ければ作成する（初期化の再実行は不要）。
 */
function ensureAiReportSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(AI_REPORT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AI_REPORT_SHEET_NAME);
    const headers = ['保存日時', '作成者', '対象範囲', '本文'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#5b21b6').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 3, 140);
    sheet.setColumnWidth(4, 700);
  }
  return sheet;
}

/**
 * Geminiの分析結果をダッシュボードへ保存する（マスタ管理権限のみ）。
 * 保存した内容は全員のダッシュボードに出る全社共有の掲示物にあたるため、
 * 閲覧範囲（canViewAllStores）ではなく管理権限（canManageMaster）で判定する。
 * @param {string} scopeLabel この分析がどの範囲を対象にしたか（例: 「全店舗 / 46期下期」）
 * @param {string} body Geminiが出力した分析文
 */
function saveAiReport(scopeLabel, body) {
  return lockedEndpoint_(function () { return saveAiReportImpl_(scopeLabel, body); });
}

/** saveAiReport の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function saveAiReportImpl_(scopeLabel, body) {
  try {
    const ctx = getCurrentUserContext_();
    if (!ctx.canManageMaster) {
      throw new Error(permissionDeniedMessage_('分析レポートの保存', ctx));
    }
    body = String(body || '').trim();
    if (!body) {
      throw new Error('分析結果が空です。Geminiの回答を貼り付けてください。');
    }
    if (body.length > 20000) {
      throw new Error('分析結果が長すぎます（20,000文字以内にしてください）。');
    }

    const sheet = ensureAiReportSheet_();
    const savedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    const author = ctx.employeeName || ctx.email || '（未登録ユーザー）';
    // 新しいものが上に来るよう、ヘッダーの直下へ挿入する
    sheet.insertRowAfter(1);
    sheet.getRange(2, 1, 1, 4).setValues([[savedAt, author, String(scopeLabel || ''), body]]);
    sheet.getRange(2, 4).setWrap(true);

    return { success: true, report: { savedAt: savedAt, author: author, scope: String(scopeLabel || ''), body: body } };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 分析レポートの対象範囲（「水戸コムボックス310 / 全期間」形式）が、
 * 指定した店舗ただ1店舗だけを対象にしているかを判定する。
 * 一般スタッフに他店舗の数字を含む文章を見せないための絞り込みに使う。
 */
function isReportLimitedToShop_(scope, officeName) {
  if (!officeName) return false;
  const shopPart = String(scope || '').split('/')[0].trim();
  if (!shopPart || shopPart === '全店舗') return false;
  const shops = shopPart.split('・').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  return shops.length === 1 && shops[0] === officeName;
}

/**
 * 保存済みの分析レポートを新しい順に返す。
 * 一般スタッフには「自店舗のみを対象に作成されたレポート」だけを返す。
 * （全店舗を対象にしたレポートは本文に他店舗の数字が含まれるため、
 *   閲覧範囲＝自店舗のみという権限設定に合わせて除外する）
 * @param {number} limit 取得件数（既定5件）
 */
function getAiReports(limit) {
  try {
    const ctx = getCurrentUserContext_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(AI_REPORT_SHEET_NAME);
    if (!sheet) return { success: true, reports: [], canSave: ctx.canManageMaster };

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, reports: [], canSave: ctx.canManageMaster };

    const want = Math.max(1, parseInt(limit, 10) || 5);
    const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    const reports = values
      .filter(function (r) { return String(r[3] || '').trim() !== ''; })
      .filter(function (r) {
        if (ctx.canViewAllStores) return true;
        return isReportLimitedToShop_(String(r[2] || ''), ctx.officeName);
      })
      .slice(0, want)
      .map(function (r) {
        return {
          savedAt: serializeCellValue_(r[0]),
          author: String(r[1] || ''),
          scope: String(r[2] || ''),
          body: String(r[3] || '')
        };
      });
    return { success: true, reports: reports, canSave: ctx.canManageMaster };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}

/**
 * 保存済みの分析レポートを消す（マスタ管理権限のみ）。
 * 見出し行と「AI分析レポート」シート自体は残し、中身だけを空にする。
 * @param {boolean} latestOnly trueなら最新の1件だけ、falseなら全件を消す
 */
function clearAiReports(latestOnly) {
  return lockedEndpoint_(function () { return clearAiReportsImpl_(latestOnly); });
}

/** clearAiReports の本体（同時実行制御は上の公開関数で行う。直接呼ばないこと） */
function clearAiReportsImpl_(latestOnly) {
  try {
    const ctx = getCurrentUserContext_();
    if (!ctx.canManageMaster) {
      throw new Error(permissionDeniedMessage_('分析レポートの削除', ctx));
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(AI_REPORT_SHEET_NAME);
    if (!sheet) return { success: true, clearedCount: 0 };

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, clearedCount: 0 };

    if (latestOnly) {
      // 最新＝ヘッダーの直下（保存時に上へ挿入しているため）
      sheet.deleteRow(2);
      return { success: true, clearedCount: 1 };
    }

    const count = lastRow - 1;
    sheet.getRange(2, 1, count, 4).clearContent();
    return { success: true, clearedCount: count };
  } catch (err) {
    return { success: false, error: errorForClient_(err) };
  }
}
