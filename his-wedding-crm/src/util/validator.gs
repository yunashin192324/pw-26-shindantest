/**
 * validator.gs
 * 第11章の項目レベル入力仕様（必須／文字数上限／入力チェック）をここに実装する。
 * 第11章8章：すべての保存操作は、画面側のチェックだけに頼らずサーバー側でも同じチェックを行う。
 */

function isBlank_(v) {
  return v === undefined || v === null || v === '';
}

function assertMaxLength_(value, max, fieldName) {
  if (!isBlank_(value) && String(value).length > max) {
    throw new AppError('VALIDATION', fieldName + ' は ' + max + ' 文字以内で入力してください。');
  }
}

function assertRequired_(value, fieldName) {
  if (isBlank_(value)) {
    throw new AppError('VALIDATION', fieldName + ' は必須です。');
  }
}

function assertKatakana_(value, fieldName) {
  if (!isBlank_(value) && !/^[ァ-ヶー　\s]*$/.test(value)) {
    throw new AppError('VALIDATION', fieldName + ' は全角カタカナのみ入力できます。');
  }
}

function assertPhone_(value, fieldName) {
  if (!isBlank_(value) && !/^[0-9\-]*$/.test(value)) {
    throw new AppError('VALIDATION', fieldName + ' は数字とハイフンのみ入力できます。');
  }
}

function assertEmail_(value, fieldName) {
  if (!isBlank_(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new AppError('VALIDATION', fieldName + ' の形式が正しくありません。');
  }
}

function assertUrl_(value, fieldName) {
  if (!isBlank_(value) && !/^https?:\/\//.test(value)) {
    throw new AppError('VALIDATION', fieldName + ' はURL形式で入力してください。');
  }
}

function assertNonNegativeNumber_(value, fieldName) {
  if (!isBlank_(value) && Number(value) < 0) {
    throw new AppError('VALIDATION', fieldName + ' はマイナスの値を入力できません。');
  }
}

/**
 * 第11章2章：Customers（顧客情報）編集時のバリデーション。
 * カウンセリングシート由来のフォーム初回登録時はチェックしない（フォーム側の必須設定に委ねる。第11章1章）。
 */
function validateCustomerOnEdit_(customer) {
  assertRequired_(customer.新郎姓, '新郎姓');
  assertMaxLength_(customer.新郎姓, 30, '新郎姓');
  assertRequired_(customer.新郎名, '新郎名');
  assertMaxLength_(customer.新郎名, 30, '新郎名');
  assertMaxLength_(customer.新郎カナ, 30, '新郎カナ');
  assertKatakana_(customer.新郎カナ, '新郎カナ');
  assertRequired_(customer.新郎電話, '新郎電話');
  assertMaxLength_(customer.新郎電話, 15, '新郎電話');
  assertPhone_(customer.新郎電話, '新郎電話');
  assertMaxLength_(customer.新郎住所, 100, '新郎住所');

  assertRequired_(customer.新婦姓, '新婦姓');
  assertMaxLength_(customer.新婦姓, 30, '新婦姓');
  assertRequired_(customer.新婦名, '新婦名');
  assertMaxLength_(customer.新婦名, 30, '新婦名');
  assertMaxLength_(customer.新婦カナ, 30, '新婦カナ');
  assertKatakana_(customer.新婦カナ, '新婦カナ');
  assertRequired_(customer.新婦電話, '新婦電話');
  assertMaxLength_(customer.新婦電話, 15, '新婦電話');
  assertPhone_(customer.新婦電話, '新婦電話');
  assertMaxLength_(customer.新婦住所, 100, '新婦住所');

  assertRequired_(customer.代表メール, '代表メール');
  assertMaxLength_(customer.代表メール, 100, '代表メール');
  assertEmail_(customer.代表メール, '代表メール');
}

/**
 * SalesHistory（接客履歴）。Q&A九巡目：実際に使っている接客履歴シートの項目
 * （日付・媒体・窓口・担当・備考）にそのまま合わせている。
 */
function validateSalesHistory_(rec) {
  assertRequired_(rec.日付, '日付');
  assertRequired_(rec.媒体, '媒体');
  if (SALES_HISTORY_MEDIA_OPTIONS.indexOf(rec.媒体) === -1) {
    throw new AppError('VALIDATION', '媒体の値が不正です。');
  }
  if (rec.窓口 && SALES_HISTORY_WINDOW_OPTIONS.indexOf(rec.窓口) === -1) {
    throw new AppError('VALIDATION', '窓口の値が不正です。');
  }
  assertRequired_(rec.担当, '担当');
  assertMaxLength_(rec.備考, 1000, '備考');
}

/** CaseSummaryMemo（案件メモ）。各見出しとも自由記述のため、長さの上限チェックのみ行う（Q&A九巡目） */
function validateSummaryMemo_(rec) {
  const fields = ['CPLこんな方です', '時期', 'エリア', 'ゲスト・パーティー', '式場', '旅行', 'お披露目・前撮り', 'TAVICA', '結果'];
  fields.forEach(function (f) { assertMaxLength_(rec[f], 2000, f); });
}

/** 案件（Cases）に持たせるチャレンジ番号・相談内容等の妥当性チェック（Q&A一巡目 B-6・C-8） */
function validateCaseCore_(rec) {
  assertChallengeNumberFormat_(rec.チャレンジ番号);
}

/**
 * 旧・日報システムのCHALLENGE_PATTERN（半角英数字11桁）を踏襲した形式チェック。
 * Settingsシートの CHALLENGE_NUMBER_PATTERN で変更可能。
 */
function assertChallengeNumberFormat_(value) {
  if (isBlank_(value)) return;
  const pattern = getSetting_('CHALLENGE_NUMBER_PATTERN', '^[a-zA-Z0-9]{11}$');
  if (!new RegExp(pattern).test(value)) {
    throw new AppError('VALIDATION', 'チャレンジ番号は半角英数字11桁で入力してください。');
  }
}

/**
 * Contracts（契約・成約時確定情報）。
 * Q&A一巡目 C-9・G-17 で確定：方面・CPL旅行人数・列席旅行人数はここで確定させる
 * （見積＝Quotesは撤去したため、成約時にはじめて金額・条件を確定する構成になる）。
 */
function validateContract_(rec) {
  assertRequired_(rec.契約日, '契約日');
  const today = new Date();
  if (new Date(rec.契約日) > today) {
    throw new AppError('VALIDATION', '契約日に未来日は指定できません。');
  }
  assertRequired_(rec.商品, '商品');
  assertRequired_(rec.プラン, 'プラン');
  assertRequired_(rec.方面, '方面');
  ['旅行代金', '挙式代金', '衣装代金', 'オプション'].forEach(function (f) {
    if (!isBlank_(rec[f])) assertNonNegativeNumber_(rec[f], f);
  });
  if (!isBlank_(rec.CPL旅行人数)) assertNonNegativeNumber_(rec.CPL旅行人数, 'CPL旅行人数');
  if (!isBlank_(rec.列席旅行人数)) assertNonNegativeNumber_(rec.列席旅行人数, '列席旅行人数');
}

/** Q&A一巡目 E-13 で確定した実際の未成約理由カテゴリ */
const LOST_REASON_CATEGORIES = ['価格', '日程', 'お預かり', '迷って決めきれず', '親や会社などに要確認', '競合', 'その他'];

/** 第11章6章：LostCases（未成約・キャンセル） */
function validateLostCase_(rec) {
  assertRequired_(rec.未成約日, '未成約日');
  assertRequired_(rec.未成約理由カテゴリ, '未成約理由カテゴリ');
  if (LOST_REASON_CATEGORIES.indexOf(rec.未成約理由カテゴリ) === -1) {
    throw new AppError('VALIDATION', '未成約理由カテゴリの値が不正です。');
  }
  if (rec.未成約理由カテゴリ === 'その他') {
    assertRequired_(rec.未成約理由その他, '未成約理由その他');
  }
  assertMaxLength_(rec.未成約理由その他, 200, '未成約理由その他');
  assertMaxLength_(rec['競合会社（自由記述）'], 50, '競合会社（自由記述）');
  assertMaxLength_(rec.詳細, 500, '詳細');
}

/** 経過メモ（CaseNotes）。後日の電話対応など、正式な接客記録ではない経過の追記（Q&A一巡目 A-1） */
function validateCaseNote_(content) {
  assertRequired_(content, '内容');
  assertMaxLength_(content, 1000, '内容');
}

/** 第11章7章：Operations（手配・画面08・09） */
function validateOperation_(rec) {
  assertRequired_(rec.手配状態, '手配状態');
  assertMaxLength_(rec.チャレンジ番号, 20, 'チャレンジ番号');
  assertMaxLength_(rec['名前①'], 30, '名前①');
  assertMaxLength_(rec['名前②'], 30, '名前②');
  assertMaxLength_(rec['備考（早期納品有無等）'], 500, '備考（早期納品有無等）');
  assertRequired_(rec.手配担当者, '手配担当者');
}
