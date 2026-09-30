/**
 * ▼▼▼ これは「シートA」（リスト管理用シート）に貼るコードです ▼▼▼
 *
 * シートA = スタッフ用フォーム（お客様メアド・担当店舗を入力するフォーム）の回答が溜まる方
 * https://docs.google.com/spreadsheets/d/1EVSi4_wzORHt1PCLZjMkrdhh9zVkxp7BzCJa3Twk9fc/edit
 *
 * 【貼り方】
 * 1. 上のURLでシートAを開く
 * 2. メニュー「拡張機能」→「Apps Script」でエディタを開く
 * 3. このファイルの内容をまるごと貼り付けて保存（既に別のコードが入っていれば全て消して置き換える）
 * 4. シートAの「一番左のタブ」がフォーム回答のタブであることを確認する
 *    （「店舗マスタ」タブは、必ずそれより右側に置く）
 * 5. 「店舗マスタ」タブを作り、A列に店舗名（1行目は見出し、2行目から）、B列に店舗のメールアドレスを入力
 * 6. エディタで syncStoreChoicesToStaffForm を一度手動実行し、権限を許可する
 * 7. 「トリガー」に、次の3つを追加する
 *    ・sendSurveyEmails       ：時間主導型／日付ベースのタイマー／毎日 午前9時〜10時 など
 *    ・notifyNewEntry         ：スプレッドシートから／フォーム送信時
 *    ・onEditSyncStoreChoices ：スプレッドシートから／編集時
 */

// ========================================================================
// 列の位置（一番左のタブの列。A列=0, B列=1, C列=2 ...）
// 実際のシートの列と違う場合は、ここの数字だけ直してください。
// ========================================================================
const COL_DATE   = 1; // B列: 挙式日または撮影日
const COL_EMAIL  = 2; // C列: お客様のメールアドレス
const COL_STORE  = 4; // E列: 担当店舗名
const COL_STATUS = 5; // F列: 送信状況（送信したら「送信済み」と書き込む）

// ========================================================================
// 機能1: アンケート依頼メールの自動送信（毎日定期実行）
//   挙式日／撮影日のちょうど7日後に、お客様へ送信する
// ========================================================================
function sendSurveyEmails() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const data = sheet.getDataRange().getValues();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const subject = '【HIS WEDDING】アンケートへのご協力のお願い';
  const options = {
    from: 'his-wedding@his-world.com',
    name: 'HIS WEDDING送信専用メール'
  };

  for (let i = 1; i < data.length; i++) {
    const dateValue = data[i][COL_DATE];
    const recipient = String(data[i][COL_EMAIL] || '').trim();
    const staffName = String(data[i][COL_STORE] || '').trim();
    const status    = data[i][COL_STATUS];

    if (!dateValue || !recipient || status === '送信済み') continue;

    const targetDate = new Date(dateValue);
    targetDate.setDate(targetDate.getDate() + 7);
    targetDate.setHours(0, 0, 0, 0);

    if (today.getTime() !== targetDate.getTime()) continue;

    const signature = staffName ? 'HIS ' + staffName : 'HIS';

    // フォームURLの末尾にお客様のメールアドレスを付け、事前入力された状態にする
    const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfOy76iHRlOgL_DrzHv_FE9KVGRbk-UIqMLBPs_64UDq-caCA/viewform?usp=pp_url&entry.1413048220='
      + encodeURIComponent(recipient);

    const body =
      'この度は当社をご利用いただきありがとうございました。\n\n' +
      '今後のサービス向上のため、また先輩カップルの体験談としてご紹介させていただくため、\n' +
      'アンケートへのご協力をお願いいたします。\n\n' +
      '是非ご協力をお願い致します。\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n' +
      '【所要時間：約3分】\n' +
      '▼ アンケートはこちらから ▼\n' +
      formUrl + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '■ 体験談の主な掲載先 ■\n' +
      '・卒花コレクション（HIS WEDDINGウェブサイト）\n' +
      'https://www.his-wedding.com/special/sotsuhana/\n\n' +
      '・結婚式（インスタグラム）\n' +
      'https://www.instagram.com/his_wedding/\n\n' +
      '・フォトウェディング（インスタグラム）\n' +
      'https://www.instagram.com/his_wedding_photo/\n\n' +
      '※このメールアドレスは送信専用のため、ご返信いただけません。\n\n' +
      signature;

    try {
      GmailApp.sendEmail(recipient, subject, body, options);
      sheet.getRange(i + 1, COL_STATUS + 1).setValue('送信済み');
    } catch (e) {
      console.log(recipient + ' への送信に失敗しました: ' + e.message);
    }
  }
}

// ========================================================================
// 機能2: 新規データ追加時の管理者通知（フォーム送信時に自動実行）
// ========================================================================
function notifyNewEntry(e) {
  const adminEmail = 't-avantikikaku02@his-world.com';
  const subject = '【通知】アンケート自動送信リストに新しいデータが追加されました';

  let newDataInfo = '';
  if (e && e.values) {
    const date = e.values[COL_DATE] || '不明';
    const email = e.values[COL_EMAIL] || '不明';
    const store = e.values[COL_STORE] || '不明';
    newDataInfo = '■ 追加されたデータ\n' +
                  '・挙式日/撮影日: ' + date + '\n' +
                  '・メールアドレス: ' + email + '\n' +
                  '・担当店舗: ' + store + '\n\n';
  }

  const body =
    'スプレッドシートに新しいお客様データが追加されました。\n' +
    '挙式日/撮影日の7日後に、自動でアンケートが送信されます。\n\n' +
    newDataInfo;

  try {
    GmailApp.sendEmail(adminEmail, subject, body);
  } catch (error) {
    console.log('管理者への通知に失敗しました: ' + error.message);
  }
}

// ========================================================================
// 機能3: 店舗マスタの内容を、スタッフ用フォームの「担当店舗」選択肢に反映
// ========================================================================
/**
 * 【事前準備】
 * ・スタッフ用フォームの「担当店舗」を尋ねる質問は、プルダウン（リスト）かラジオボタン（選択式）にしておく
 * ・QUESTION_TITLE は、フォームに実際に書かれている質問文と一字一句同じにする
 */
function syncStoreChoicesToStaffForm() {
  const STAFF_FORM_ID = '1Tc6OxnuGNWcPk0RoS0-7U74Mragj5e4PmzVGS-7aKdI';
  const QUESTION_TITLE = '担当店舗';
  const STORE_MASTER_SHEET = '店舗マスタ';

  const master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STORE_MASTER_SHEET);
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
 * 店舗マスタタブが編集されたら、自動でフォームの選択肢を同期する。
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

/**
 * スプレッドシートを開いたときに、メニュー「店舗マスタ」を追加する（トリガー設定は不要）。
 * 自動反映がうまくいかない時は、このメニューから手動で更新できる。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('店舗マスタ')
    .addItem('フォームの担当店舗を今すぐ更新', 'syncStoreChoicesFromMenu')
    .addToUi();
}

function syncStoreChoicesFromMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    syncStoreChoicesToStaffForm();
    ui.alert('フォームの「担当店舗」の選択肢を更新しました。');
  } catch (error) {
    ui.alert('更新に失敗しました: ' + error.message);
  }
}
