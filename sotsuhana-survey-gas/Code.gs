/**
 * ==========================================================
 * 卒花アンケート回答通知 + 申し込み店舗への自動送信
 * ==========================================================
 *
 * 【できること】
 * 1. アンケート回答（フォーム送信）があったら通知メールを送る
 *    - 「ご新郎様氏名(カタカナ)」「ご新婦様氏名(カタカナ)」を本文の一番上に表示
 *    - 同じ質問が重複して出てくる場合は1回だけ表示
 *    - 回答が空欄の質問は本文に載せない
 * 2. 回答内の「申し込み店舗」の値をもとに、店舗マスタからその店舗のメール
 *    アドレスを検索し、固定宛先に加えてそのメールアドレスにも自動送信する
 * 3. 店舗マスタ（裏のスプレッドシート）と、アンケートフォームの「申し込み店舗」
 *    の選択肢を同期する（syncStoreChoicesToForm）
 *
 * 【事前準備】
 * (1) 「拡張機能 > Apps Script」の「プロジェクトの設定」→「スクリプト プロパティ」に
 *     以下の2つを登録してください。
 *       MASTER_SS_ID … 店舗マスタを管理する「裏」のスプレッドシートのID
 *                       （スプレッドシートのURLの
 *                        https://docs.google.com/spreadsheets/d/【ここ】/edit ）
 *       FORM_ID       … アンケートフォームのID（店舗選択肢の自動同期を使う場合のみ必須）
 *                       （フォームの編集画面URLの
 *                        https://docs.google.com/forms/d/【ここ】/edit ）
 *
 * (2) 「裏」のスプレッドシート（MASTER_SS_ID で指定したもの）に
 *     「店舗マスタ」という名前のシートを作成し、以下のようにデータを入力してください。
 *       1行目：見出し行（店舗名 / メールアドレス）
 *       2行目以降：
 *         A列: 店舗名（フォームの選択肢に出す文言と同じにしてください）
 *         B列: その店舗の通知先メールアドレス
 *
 * (3) アンケートフォームに「申し込み店舗」という質問を追加してください（プルダウン
 *     /ラジオボタン/チェックボックスのいずれか）。質問文はCONFIG.STORE_QUESTION_TITLE
 *     と一致させてください（全角/半角・空白の違いは自動で吸収されます）。
 *
 * (4) このスクリプトを回答用スプレッドシートに紐づけたら、一度だけ
 *     setupFormSubmitTrigger() を実行し、フォーム送信時に notifyNewSurveyResponse
 *     が呼ばれるようにしてください（実行 > setupFormSubmitTrigger を選択）。
 *
 * (5) 店舗マスタを更新したら手動で syncStoreChoicesToForm() を実行するか、
 *     setupStoreSyncTrigger() を一度実行して自動同期（1時間おき）を有効にしてください。
 *     スプレッドシートを開いた際は「管理メニュー」からも同期できます。
 */

const CONFIG = {
  // 常に通知する固定の宛先
  FIXED_RECIPIENT: 't-avantikikaku02@his-world.com',

  // メールの件名 / 送信元
  MAIL_SUBJECT: '卒花アンケート回答がありました。',
  MAIL_FROM: 'his-wedding@his-world.com',
  MAIL_FROM_NAME: 'HIS WEDDING送信専用メール', // ※ご希望があれば変更可能です

  // 確認用スプレッドシートのURL（本文末尾に記載）
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/18Gi1mhU3UjSQ-oQaD10XIy4moJYnPn7cH_FCgBkPQxM/edit',

  // 本文の先頭に、この順番で表示する質問
  PRIORITY_QUESTIONS: ['ご新郎様氏名(カタカナ)', 'ご新婦様氏名(カタカナ)'],

  // 「申し込み店舗」を尋ねる質問のタイトル（フォームの質問文と合わせてください）
  STORE_QUESTION_TITLE: '申し込み店舗',

  // 店舗マスタ（裏のスプレッドシート）関連の設定
  MASTER_SHEET_NAME: '店舗マスタ',
  MASTER_HEADER_ROW: 1, // 1行目が見出し行
};

/**
 * フォーム送信をトリガーに呼ばれるメイン処理
 */
function notifyNewSurveyResponse(e) {
  const options = { from: CONFIG.MAIL_FROM, name: CONFIG.MAIL_FROM_NAME };

  try {
    if (!e || !e.namedValues) {
      GmailApp.sendEmail(
        CONFIG.FIXED_RECIPIENT,
        CONFIG.MAIL_SUBJECT,
        '※エラー：フォームからのデータが正しく取得できませんでした。',
        options
      );
      return;
    }

    const body = buildMailBody_(e.namedValues);
    const storeName = findAnswer_(e.namedValues, CONFIG.STORE_QUESTION_TITLE);
    const recipients = buildRecipientList_(storeName);

    GmailApp.sendEmail(recipients.join(','), CONFIG.MAIL_SUBJECT, body, options);
  } catch (error) {
    console.log('通知メールの送信に失敗しました: ' + error.message);
  }
}

/**
 * メール本文を組み立てる
 * - PRIORITY_QUESTIONS を先頭に表示
 * - 同じ質問が重複していたら1回だけ表示
 * - 回答が空欄の質問は載せない
 */
function buildMailBody_(namedValues) {
  const seenQuestions = {};
  const lines = [];

  const appendQuestion = function (question, rawValues) {
    const key = normalize_(question);
    if (seenQuestions[key]) return; // 重複する質問は載せない
    seenQuestions[key] = true;

    const values = (rawValues || [])
      .map(function (v) { return String(v || '').trim(); })
      .filter(function (v) { return v !== ''; });

    if (values.length === 0) return; // 回答が空欄のものは載せない

    // 同じ質問内で重複する回答値は1つにまとめる
    const uniqueValues = values.filter(function (v, i) { return values.indexOf(v) === i; });

    lines.push('■ ' + question + '\n' + uniqueValues.join('\n') + '\n');
  };

  // 1. 優先して先頭に出す質問（ご新郎様氏名・ご新婦様氏名 など）
  CONFIG.PRIORITY_QUESTIONS.forEach(function (priorityQuestion) {
    for (const key in namedValues) {
      if (normalize_(key) === normalize_(priorityQuestion)) {
        appendQuestion(key, namedValues[key]);
        break;
      }
    }
  });

  // 2. 残りの質問（フォームに入っている順のまま）
  for (const question in namedValues) {
    appendQuestion(question, namedValues[question]);
  }

  let body = '卒花アンケートに新しい回答がありました。\n\n';
  body += '━━━━━━━━━━━━━━━━━━━━━\n';
  body += '【回答内容】\n\n';
  body += lines.length > 0 ? lines.join('\n') : '※表示できる回答がありませんでした。\n\n';
  body += '━━━━━━━━━━━━━━━━━━━━━\n';
  body += '▼ スプレッドシートを確認する ▼\n';
  body += CONFIG.SPREADSHEET_URL + '\n';

  return body;
}

/**
 * namedValues から指定した質問の回答（空欄でない最初の値）を取得する
 */
function findAnswer_(namedValues, questionTitle) {
  const targetKey = normalize_(questionTitle);
  for (const key in namedValues) {
    if (normalize_(key) === targetKey) {
      const values = (namedValues[key] || []).filter(function (v) { return String(v || '').trim() !== ''; });
      if (values.length > 0) return String(values[0]).trim();
    }
  }
  return '';
}

/**
 * 固定宛先 + 申し込み店舗のメールアドレス（あれば）で宛先リストを作る
 */
function buildRecipientList_(storeName) {
  const recipients = [CONFIG.FIXED_RECIPIENT];

  if (storeName) {
    const storeEmail = getStoreEmail_(storeName);
    if (storeEmail) {
      // 固定宛先と同じアドレスなど、重複はまとめる
      if (recipients.indexOf(storeEmail) === -1) recipients.push(storeEmail);
    } else {
      console.log('店舗マスタに一致するメールアドレスが見つかりませんでした: 「' + storeName + '」');
    }
  }

  return recipients;
}

/**
 * 文字列の表記ゆれ（全角/半角括弧・スペースの有無など）を吸収するための正規化
 */
function normalize_(str) {
  return String(str || '')
    .replace(/[\s　]/g, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')');
}

// ==========================================================
// 店舗マスタ（裏のスプレッドシート）関連
// ==========================================================

/**
 * 裏のスプレッドシートの「店舗マスタ」シートから [{name, email}, ...] を取得する
 */
function getStoreMasterRows_() {
  const masterSsId = PropertiesService.getScriptProperties().getProperty('MASTER_SS_ID');
  if (!masterSsId) {
    console.log('スクリプトプロパティ MASTER_SS_ID が設定されていません。');
    return [];
  }

  const ss = SpreadsheetApp.openById(masterSsId);
  const sheet = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= CONFIG.MASTER_HEADER_ROW) return [];

  const numRows = sheet.getLastRow() - CONFIG.MASTER_HEADER_ROW;
  const values = sheet.getRange(CONFIG.MASTER_HEADER_ROW + 1, 1, numRows, 2).getValues();

  return values
    .map(function (row) {
      return { name: String(row[0] || '').trim(), email: String(row[1] || '').trim() };
    })
    .filter(function (r) { return r.name && r.email; });
}

/**
 * 店舗名(正規化済み) => メールアドレス のマップを作る
 */
function getStoreMasterMap_() {
  const map = {};
  getStoreMasterRows_().forEach(function (r) {
    map[normalize_(r.name)] = r.email;
  });
  return map;
}

/**
 * 店舗名からメールアドレスを引く
 */
function getStoreEmail_(storeName) {
  return getStoreMasterMap_()[normalize_(storeName)] || '';
}

/**
 * 店舗マスタの店舗名一覧を、アンケートフォームの「申し込み店舗」の選択肢に反映する。
 * 店舗マスタを更新したら実行してください（手動実行 or 時間主導型トリガーで自動化）。
 */
function syncStoreChoicesToForm() {
  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) throw new Error('スクリプトプロパティ FORM_ID が設定されていません。');

  const storeNames = getStoreMasterRows_().map(function (r) { return r.name; });
  if (storeNames.length === 0) {
    throw new Error('店舗マスタに有効なデータがありません。「' + CONFIG.MASTER_SHEET_NAME + '」シートを確認してください。');
  }

  const form = FormApp.openById(formId);
  const targetItem = form.getItems().filter(function (item) {
    return normalize_(item.getTitle()) === normalize_(CONFIG.STORE_QUESTION_TITLE);
  })[0];

  if (!targetItem) {
    throw new Error('フォームに「' + CONFIG.STORE_QUESTION_TITLE + '」という質問が見つかりませんでした。質問文を確認してください。');
  }

  const type = targetItem.getType();
  if (type === FormApp.ItemType.LIST) {
    targetItem.asListItem().setChoiceValues(storeNames);
  } else if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
    targetItem.asMultipleChoiceItem().setChoiceValues(storeNames);
  } else if (type === FormApp.ItemType.CHECKBOX) {
    targetItem.asCheckboxItem().setChoiceValues(storeNames);
  } else {
    throw new Error('「' + CONFIG.STORE_QUESTION_TITLE + '」はプルダウン/ラジオボタン/チェックボックス形式で作成してください。');
  }

  console.log('店舗の選択肢を同期しました: ' + storeNames.join(', '));
}

// ==========================================================
// セットアップ用ヘルパー（初回に1回ずつ実行してください）
// ==========================================================

/**
 * フォーム送信時に notifyNewSurveyResponse が呼ばれるようにする（インストール型トリガー）。
 * 二重登録を避けるため、既存の同名トリガーは一度削除してから登録し直します。
 */
function setupFormSubmitTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'notifyNewSurveyResponse') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('notifyNewSurveyResponse').forSpreadsheet(ss).onFormSubmit().create();
  console.log('フォーム送信時トリガーを登録しました。');
}

/**
 * 店舗マスタ⇔フォームの選択肢を1時間おきに自動同期する時間主導型トリガーを登録する。
 */
function setupStoreSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncStoreChoicesToForm') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncStoreChoicesToForm').timeBased().everyHours(1).create();
  console.log('店舗選択肢の自動同期トリガー（1時間おき）を登録しました。');
}

/**
 * 回答用スプレッドシートを開いたときに、手動同期用のメニューを追加する。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('管理メニュー')
    .addItem('店舗選択肢をフォームに同期', 'syncStoreChoicesToForm_withAlert')
    .addToUi();
}

function syncStoreChoicesToForm_withAlert() {
  const ui = SpreadsheetApp.getUi();
  try {
    syncStoreChoicesToForm();
    ui.alert('店舗の選択肢をフォームに同期しました。');
  } catch (e) {
    ui.alert('同期に失敗しました: ' + e.message);
  }
}
