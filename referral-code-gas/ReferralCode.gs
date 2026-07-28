/**
 * ============================================================================
 * HIS WEDDING BATON 紹介コード自動発行システム
 * ============================================================================
 * このファイルは、既存のアンケート送付GAS（sendSurveyEmails() など）に
 * 追加で組み込む「紹介コード自動発行」処理です。
 *
 * ●このファイルが行うこと
 *   1. Googleフォームの回答が送信されたときに自動で動く（onFormSubmit）
 *   2. 回答者のメールアドレスから、既に紹介コードを発行済みか調べる
 *   3. 未発行なら「BATON-000001」のような連番コードを新規発行する
 *   4. 「紹介コード管理」シートに保存する
 *   5. 回答内容の控え＋紹介コードの案内をメールで送信する
 *
 * ●このファイルが行わないこと（既存の仕組みは一切変更しません）
 *   - sendSurveyEmails() など、アンケート依頼メールを送る既存処理
 *   - 既存のフォーム／スプレッドシートの構成
 *
 * ●導入手順は同じフォルダの README.md を参照してください。
 * ============================================================================
 */

// ============================================================================
// ■設定項目（自分の環境に合わせてここだけ書き換えればOKです）
// ============================================================================
const REFERRAL_CONFIG = {
  // 紹介コードを保存するシート名（存在しなければ自動で作成されます）
  SHEET_NAME: '紹介コード管理',

  // 紹介コードの接頭辞と番号の桁数（例: BATON- + 6桁 → BATON-000001）
  CODE_PREFIX: 'BATON-',
  CODE_DIGITS: 6,

  // フォームの回答が書き込まれるスプレッドシートの「列の見出し名」。
  // e.namedValues のキーと完全に一致している必要があります。
  //  ・メールアドレスは「メールアドレスを収集する」設定をオンにすると
  //    Googleが自動でこの見出しの列を追加してくれます。名前が違う場合は
  //    実際の回答シートを確認して書き換えてください。
  EMAIL_COLUMN_TITLE: 'メールアドレス',
  // お名前を尋ねる質問文そのまま（フォームの質問タイトルと完全一致させてください）
  NAME_COLUMN_TITLE: 'お名前',

  // 「紹介コード管理」シートの列番号（1始まり）
  COL_CODE: 1,             // A列: 紹介コード
  COL_EMAIL: 2,            // B列: メールアドレス
  COL_NAME: 3,             // C列: 氏名
  COL_ISSUED_AT: 4,        // D列: 発行日
  COL_USE_COUNT: 5,        // E列: 紹介利用回数
  COL_SUCCESS_COUNT: 6,    // F列: 紹介成立件数
  COL_REFERRER_REWARD: 7,  // G列: 紹介特典送付
  COL_USER_REWARD: 8,      // H列: 利用者特典付与
  COL_NOTE: 9,             // I列: 備考

  // メールの差出人表示名（空文字にすると差出人はGmailアカウント名になります）
  MAIL_SENDER_NAME: 'HIS WEDDING',

  // 連番採番の排他ロック待機時間（ミリ秒）。同時回答による番号の重複を防ぎます。
  LOCK_TIMEOUT_MS: 30000,

  // タイムゾーン（発行日の表示に使用）
  TIME_ZONE: 'Asia/Tokyo'
};

// ============================================================================
// ■メイン処理：フォーム送信時トリガー
// ============================================================================
/**
 * Googleフォームの回答が送信されたときに実行される関数。
 * トリガーの設定方法はREADME.mdを参照してください。
 *
 * @param {Object} e フォーム送信イベントオブジェクト
 */
function onFormSubmit(e) {
  try {
    if (!e || !e.namedValues) {
      Logger.log('[紹介コード] イベントオブジェクトが取得できませんでした。トリガーの設定（イベントの種類）を確認してください。');
      return;
    }

    // ①回答内容からメールアドレス・氏名を取得
    const email = getAnswerByTitle_(e, REFERRAL_CONFIG.EMAIL_COLUMN_TITLE);
    const name = getAnswerByTitle_(e, REFERRAL_CONFIG.NAME_COLUMN_TITLE);

    // メールアドレスが取得できない場合は処理を終了する
    if (!email) {
      Logger.log('[紹介コード] メールアドレスが取得できなかったため処理を終了します。');
      return;
    }

    // ②③紹介コードを取得（既存があれば再利用／なければ新規発行）
    const couponCode = getOrCreateCouponCode(email, name);
    if (!couponCode) {
      Logger.log('[紹介コード] コード発行に失敗したため、メール送信をスキップします。email=' + email);
      return;
    }

    // ④回答内容の控え＋紹介コード案内メールを送信
    const answerSummary = buildAnswerSummary_(e);
    sendCouponMail(email, name, couponCode, answerSummary);

  } catch (err) {
    // 想定外のエラーはログに残し、処理全体を止めない
    Logger.log('[紹介コード] onFormSubmitで予期しないエラーが発生しました: ' + err);
  }
}

// ============================================================================
// ■紹介コードの取得・発行
// ============================================================================
/**
 * 指定したメールアドレスの紹介コードを取得する。
 * 既に発行済みならそのコードを返し、未発行なら新規発行する。
 *
 * @param {string} email メールアドレス
 * @param {string} name 氏名（新規発行時にシートへ記録）
 * @return {string|null} 紹介コード。発行に失敗した場合はnull
 */
function getOrCreateCouponCode(email, name) {
  try {
    const existing = findCouponByEmail(email);
    if (existing) {
      // 再回答時：既存コードをそのまま返す（再発行しない）
      return existing.code;
    }
    return issueNewCouponCode_(email, name);
  } catch (err) {
    Logger.log('[紹介コード] getOrCreateCouponCodeでエラーが発生しました: ' + err + ' email=' + email);
    return null;
  }
}

/**
 * メールアドレスから既存の紹介コードを検索する。
 *
 * @param {string} email メールアドレス
 * @return {{code:string,row:number}|null} 見つかった場合はコードと行番号、無ければnull
 */
function findCouponByEmail(email) {
  const sheet = getOrCreateReferralSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null; // ヘッダーのみ＝データなし

  const emailCol = REFERRAL_CONFIG.COL_EMAIL;
  const codeCol = REFERRAL_CONFIG.COL_CODE;
  const targetEmail = normalizeEmail_(email);

  const emails = sheet.getRange(2, emailCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < emails.length; i++) {
    if (normalizeEmail_(emails[i][0]) === targetEmail) {
      const row = i + 2;
      const code = sheet.getRange(row, codeCol).getValue();
      return { code: String(code), row: row };
    }
  }
  return null;
}

/**
 * 新規に紹介コードを発行し、「紹介コード管理」シートへ1行追加する。
 * 同時アクセスによる番号重複を防ぐため LockService でロックする。
 *
 * @param {string} email メールアドレス
 * @param {string} name 氏名
 * @return {string|null} 発行した紹介コード。失敗時はnull
 */
function issueNewCouponCode_(email, name) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(REFERRAL_CONFIG.LOCK_TIMEOUT_MS);
  } catch (err) {
    Logger.log('[紹介コード] ロック取得に失敗しました（タイムアウト）。email=' + email + ' / ' + err);
    return null;
  }

  try {
    // ロック取得後にもう一度検索する（ロック待ちの間に他の実行で発行済みの可能性があるため）
    const existing = findCouponByEmail(email);
    if (existing) {
      return existing.code;
    }

    const sheet = getOrCreateReferralSheet_();
    const newCode = generateNextCouponCode_(sheet);
    if (!newCode) {
      Logger.log('[紹介コード] 新規コードの採番に失敗しました。email=' + email);
      return null;
    }

    const row = [];
    row[REFERRAL_CONFIG.COL_CODE - 1] = newCode;
    row[REFERRAL_CONFIG.COL_EMAIL - 1] = email;
    row[REFERRAL_CONFIG.COL_NAME - 1] = name || '';
    row[REFERRAL_CONFIG.COL_ISSUED_AT - 1] = formatDateJst_(new Date());
    row[REFERRAL_CONFIG.COL_USE_COUNT - 1] = 0;      // 紹介利用回数：初期値0
    row[REFERRAL_CONFIG.COL_SUCCESS_COUNT - 1] = 0;  // 紹介成立件数：初期値0
    row[REFERRAL_CONFIG.COL_REFERRER_REWARD - 1] = '未'; // 紹介特典送付：初期値「未」
    row[REFERRAL_CONFIG.COL_USER_REWARD - 1] = '未';     // 利用者特典付与：初期値「未」
    row[REFERRAL_CONFIG.COL_NOTE - 1] = '';

    sheet.appendRow(row);
    return newCode;

  } catch (err) {
    Logger.log('[紹介コード] issueNewCouponCode_でエラーが発生しました: ' + err + ' email=' + email);
    return null;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 「紹介コード管理」シートの最終行の番号から、次の連番コードを生成する。
 * ※ 呼び出し元（issueNewCouponCode_）でロックを取得済みであることが前提。
 *
 * @param {Sheet} sheet 紹介コード管理シート
 * @return {string|null} 例: "BATON-000157"。生成失敗時はnull
 */
function generateNextCouponCode_(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    let maxNumber = 0;

    if (lastRow >= 2) {
      const codes = sheet.getRange(2, REFERRAL_CONFIG.COL_CODE, lastRow - 1, 1).getValues();
      for (let i = 0; i < codes.length; i++) {
        const code = String(codes[i][0] || '');
        if (code.indexOf(REFERRAL_CONFIG.CODE_PREFIX) !== 0) continue;
        const numPart = code.substring(REFERRAL_CONFIG.CODE_PREFIX.length);
        const num = parseInt(numPart, 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    const nextNumber = maxNumber + 1;
    const paddedNumber = String(nextNumber).padStart(REFERRAL_CONFIG.CODE_DIGITS, '0');
    return REFERRAL_CONFIG.CODE_PREFIX + paddedNumber;

  } catch (err) {
    Logger.log('[紹介コード] generateNextCouponCode_でエラーが発生しました: ' + err);
    return null;
  }
}

// ============================================================================
// ■メール送信
// ============================================================================
/**
 * 回答内容の控え＋紹介コード案内メールを送信する。
 *
 * @param {string} email 送信先メールアドレス
 * @param {string} name 氏名（宛名に使用。未取得なら「お客様」）
 * @param {string} couponCode 紹介コード
 * @param {string} answerSummary 回答内容の控え（buildAnswerSummary_で生成）
 */
function sendCouponMail(email, name, couponCode, answerSummary) {
  try {
    const subject = '【HIS WEDDING】アンケートのご回答ありがとうございました';
    const displayName = name ? (name + '様') : 'お客様';

    const referralBlock =
      '━━━━━━━━━━━━━━━━━━\n' +
      'この度はアンケートへご回答いただき、\n' +
      '誠にありがとうございました。\n' +
      'あなた専用の紹介コードを発行いたしました。\n\n' +
      '【紹介コード】\n' +
      couponCode + '\n\n' +
      'ご友人・ご家族へ\n' +
      'Instagram・LINEなどで自由にご紹介ください。\n\n' +
      '紹介コードをご利用いただき\n' +
      'ご来店・ご成約いただくと\n' +
      'ご紹介者様・ご利用者様双方へ\n' +
      'キャンペーン特典をプレゼントいたします。\n\n' +
      '紹介コードは大切に保管してください。\n' +
      '━━━━━━━━━━━━━━━━━━';

    const body =
      displayName + '\n\n' +
      'アンケートへのご回答内容は以下の通りです。\n\n' +
      answerSummary + '\n\n' +
      referralBlock;

    const options = {};
    if (REFERRAL_CONFIG.MAIL_SENDER_NAME) {
      options.name = REFERRAL_CONFIG.MAIL_SENDER_NAME;
    }

    GmailApp.sendEmail(email, subject, body, options);

  } catch (err) {
    // メール送信に失敗しても、紹介コード自体はシートに保存済みのため処理は止めない
    Logger.log('[紹介コード] メール送信に失敗しました: ' + err + ' email=' + email + ' code=' + couponCode);
  }
}

// ============================================================================
// ■内部ヘルパー関数
// ============================================================================
/**
 * フォームの質問タイトルから、送信された回答（1件目）を取得する。
 *
 * @param {Object} e フォーム送信イベントオブジェクト
 * @param {string} title 質問タイトル（見出し名）
 * @return {string} 回答文字列。取得できなければ空文字
 */
function getAnswerByTitle_(e, title) {
  if (!e.namedValues || !e.namedValues[title]) return '';
  const values = e.namedValues[title];
  return values && values[0] ? String(values[0]).trim() : '';
}

/**
 * イベントオブジェクトから、タイムスタンプ以外の質問と回答を
 * 「質問：回答」の形式で一覧テキストにする（回答内容の控え用）。
 *
 * @param {Object} e フォーム送信イベントオブジェクト
 * @return {string} 回答内容の一覧テキスト
 */
function buildAnswerSummary_(e) {
  const lines = [];
  const namedValues = e.namedValues || {};
  Object.keys(namedValues).forEach(function (title) {
    if (title === 'タイムスタンプ') return; // タイムスタンプは控えから除外
    const answer = namedValues[title] && namedValues[title][0] ? namedValues[title][0] : '';
    lines.push('■' + title + '\n' + answer);
  });
  return lines.join('\n\n');
}

/**
 * メールアドレスを比較用に正規化する（前後の空白除去・小文字化）。
 *
 * @param {string} email メールアドレス
 * @return {string} 正規化後のメールアドレス
 */
function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * 日付を「yyyy/MM/dd HH:mm」形式の文字列にする（発行日列用）。
 *
 * @param {Date} date 日付
 * @return {string} フォーマット済み日付文字列
 */
function formatDateJst_(date) {
  return Utilities.formatDate(date, REFERRAL_CONFIG.TIME_ZONE, 'yyyy/MM/dd HH:mm');
}

/**
 * 「紹介コード管理」シートを取得する。存在しない場合は見出し付きで新規作成する。
 *
 * @return {Sheet} 紹介コード管理シート
 */
function getOrCreateReferralSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REFERRAL_CONFIG.SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(REFERRAL_CONFIG.SHEET_NAME);
  const headers = [];
  headers[REFERRAL_CONFIG.COL_CODE - 1] = '紹介コード';
  headers[REFERRAL_CONFIG.COL_EMAIL - 1] = 'メールアドレス';
  headers[REFERRAL_CONFIG.COL_NAME - 1] = '氏名';
  headers[REFERRAL_CONFIG.COL_ISSUED_AT - 1] = '発行日';
  headers[REFERRAL_CONFIG.COL_USE_COUNT - 1] = '紹介利用回数';
  headers[REFERRAL_CONFIG.COL_SUCCESS_COUNT - 1] = '紹介成立件数';
  headers[REFERRAL_CONFIG.COL_REFERRER_REWARD - 1] = '紹介特典送付';
  headers[REFERRAL_CONFIG.COL_USER_REWARD - 1] = '利用者特典付与';
  headers[REFERRAL_CONFIG.COL_NOTE - 1] = '備考';

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

// ============================================================================
// ■動作確認用（手動実行して使う関数。トリガーには設定不要）
// ============================================================================
/**
 * 「紹介コード管理」シートの存在確認・初期作成のみを行う。
 * スクリプトエディタでこの関数を選択して実行すれば、
 * シートが未作成でも事前に用意できる。
 */
function setupReferralSheet() {
  const sheet = getOrCreateReferralSheet_();
  Logger.log('[紹介コード] シート「' + sheet.getName() + '」の準備ができました。');
}

/**
 * トリガー動作確認用のダミーテスト関数。
 * 実際のフォーム回答を模したイベントオブジェクトでonFormSubmitを試せる。
 * ※ EMAIL_COLUMN_TITLE / NAME_COLUMN_TITLE は実際のフォームに合わせて
 *   書き換えてから実行してください。
 */
function testOnFormSubmit_() {
  const dummyEvent = {
    namedValues: {
      'タイムスタンプ': ['2026/07/28 10:00:00'],
      [REFERRAL_CONFIG.EMAIL_COLUMN_TITLE]: ['test@example.com'],
      [REFERRAL_CONFIG.NAME_COLUMN_TITLE]: ['テスト太郎'],
      '体験談': ['とても満足しています。']
    }
  };
  onFormSubmit(dummyEvent);
}
