/**
 * ▼▼▼ これは「シートA」（リスト管理用シート）に貼るコードです ▼▼▼
 *
 * シートA = スタッフ用フォーム（お客様メアド・担当店舗を入力するフォーム）の回答が溜まる方
 * https://docs.google.com/spreadsheets/d/1EVSi4_wzORHt1PCLZjMkrdhh9zVkxp7BzCJa3Twk9fc/edit
 *
 * 【貼り方】
 * 1. 上のURLでシートAを開く
 * 2. メニュー「拡張機能」→「Apps Script」でエディタを開く
 * 3. このファイルの内容をまるごと貼り付けて保存
 * 4. シートAに「店舗マスタ」というタブを作り、A列に店舗名を1行ずつ入力する
 * 5. エディタで syncStoreChoicesToStaffForm を一度手動実行し、権限を許可する
 * 6. 自動化する場合は「トリガー」を追加する
 *    イベントのソース：スプレッドシートから／イベントの種類：編集時／関数：onEditSyncStoreChoices
 */

/**
 * 店舗マスタの内容を、フォーム1（スタッフがお客様メアド・担当店舗を入力するフォーム）の
 * 「担当店舗」の選択肢にそのまま反映する。
 *
 * 【事前準備】
 * ・フォーム1の「担当店舗」を尋ねる質問は、プルダウン（リスト）かラジオボタン（選択式）にしておく
 * ・QUESTION_TITLE は、フォーム1に実際に書かれている質問文と一字一句同じにする
 */
function syncStoreChoicesToStaffForm() {
  const STAFF_FORM_ID = '1Tc6OxnuGNWcPk0RoS0-7U74Mragj5e4PmzVGS-7aKdI';
  const QUESTION_TITLE = '担当店舗';

  // シートA（このスプレッドシート）の中の「店舗マスタ」タブを正として同期する
  const STORE_MASTER_SHEET = '店舗マスタ';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName(STORE_MASTER_SHEET);
  if (!master) throw new Error('「' + STORE_MASTER_SHEET + '」タブが見つかりません。');

  const lastRow = master.getLastRow();
  if (lastRow < 2) throw new Error('店舗マスタに店舗が登録されていません。');

  const storeNames = master.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function (row) { return String(row[0]).trim(); })
    .filter(Boolean);

  if (storeNames.length === 0) throw new Error('店舗マスタに有効な店舗名がありません。');

  const form = FormApp.openById(STAFF_FORM_ID);
  const target = form.getItems().filter(function (item) { return item.getTitle() === QUESTION_TITLE; })[0];
  if (!target) throw new Error('「' + QUESTION_TITLE + '」という質問がフォームに見つかりません。');

  const type = target.getType();
  if (type === FormApp.ItemType.LIST) {
    target.asListItem().setChoiceValues(storeNames);
  } else if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
    target.asMultipleChoiceItem().setChoiceValues(storeNames);
  } else {
    throw new Error('「' + QUESTION_TITLE + '」はプルダウンまたはラジオボタン形式にしてください（現在: ' + type + '）。');
  }
}

/**
 * 店舗マスタタブが編集されたら、自動でフォーム1の選択肢を同期する。
 * ※ トリガー設定で実行する関数として指定してください。
 */
function onEditSyncStoreChoices(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== '店舗マスタ') return;
    syncStoreChoicesToStaffForm();
  } catch (error) {
    console.log('店舗選択肢の同期に失敗しました: ' + error.message);
  }
}
