/**
 * 卒花アンケート回答時の自動通知
 * ・管理者＋担当店舗へ回答内容を通知
 * ・お客様へ回答の控えを送信
 */
function notifyNewSurveyResponse(e) {
  // 送信元と送信者名の設定
  const options = {
    from: 'his-wedding@his-world.com',
    name: 'HIS WEDDING送信専用メール'
  };

  // 管理者の宛先
  const adminEmail = 't-avantikikaku02@his-world.com';

  // リスト管理用シート（シートA）。C列：お客様メールアドレス／E列：担当店舗名
  const listSsUrl = 'https://docs.google.com/spreadsheets/d/1EVSi4_wzORHt1PCLZjMkrdhh9zVkxp7BzCJa3Twk9fc/edit';

  // シートA内に作る店舗アドレス帳のタブ名（A列：店舗名／B列：店舗メールアドレス）
  const STORE_MASTER_SHEET = '店舗マスタ';

  // ここに書いた順番でメールに掲載されます。
  // スプレッドシートの列見出し（質問文）と一字一句同じにしてください。
  // ここに無い質問は自動的に一番下にまとめて表示されます。
  const QUESTION_ORDER = [
    'タイムスタンプ',
    'メールアドレス',
    '今回実施されたのはどちらですか？',
    'ご新婦様氏名 （カタカナ）',
    'ご新郎様氏名（カタカナ）',
    'ご新郎様氏名 （カタカナ）',
    '挙式日を教えてください',
    '撮影日を教えてください',
    '式場名を教えてください',
    '撮影地 を教えてください',
    '式場を選ばれた理由や お気に入りポイントがあれば教えてください (複数選択可）',
    '撮影された「方面・国」を選ばれた理由 (複数選択可）',
    '方面・国を選ばれた理由 (複数選択可）',
    'HISを選んだ理由を教えてください (複数選択可）',
    '結婚式ではなくて、フォトウェディングを選ばれた理由(複数選択可）',
    '衣裳についてこだわったことがあれば教えてください',
    'こだわったことや、思い入れのあることがあれば教えてください',
    '当日、撮影で持参していってよかったもの、持っていけばよかったものがあれば教えてください',
    '当日の感想やエピソード・失敗談 があれば教えてください',
    '担当スタッフへのメッセージや、その他感想があれば教えてください',
    '現在、検討中の花嫁様へのアドバイスがあれば教えてください',
    '掲載を許可いただける媒体をすべて選んでください',
    '提供可能なデータを教えてください',
    '今後、後輩花嫁に向けて、今回の 体験者画像・動画 、 ご予算、衣裳代金、型番、アンケート内容などを掲載させていただいてもよろしいでしょうか（※お名前は掲載いたしません）',
    '【個人情報について】弊社はご記入いただいた個人情報を、お客様との連絡のために利用させていただくほか、お問い合わせに必要な範囲内で利用し、それ以外の目的で利用することはございません。「個人情報保護方針・個人情報の取扱いについて」をご確認の上、ご回答お願いします。https://www.his.co.jp/privacy/',
    '必ずお読みください'
  ];

  const namedValues = (e && e.namedValues) ? e.namedValues : null;

  // ---- 回答内容をテキスト化（決めた順番で並べ、未記入の質問は書かない） ----
  let answerText = '';
  if (namedValues) {
    const printed = new Set();
    const append = function (question) {
      printed.add(question);
      const values = namedValues[question];
      const answer = values ? String(values[0] || '').trim() : '';
      if (answer) answerText += '■ ' + question + '\n' + answer + '\n\n';
    };
    QUESTION_ORDER.forEach(function (question) {
      if (Object.prototype.hasOwnProperty.call(namedValues, question)) append(question);
    });
    Object.keys(namedValues).forEach(function (question) {
      if (!printed.has(question)) append(question);
    });
  }

  // ---- お客様のメールアドレスをキーにシートAを検索し、担当店舗を特定 ----
  const customerEmail = (namedValues && namedValues['メールアドレス'])
    ? String(namedValues['メールアドレス'][0] || '').trim()
    : '';

  let foundInList = false;
  let storeName = '';
  let storeEmail = '';

  if (customerEmail) {
    try {
      const listSs = SpreadsheetApp.openByUrl(listSsUrl);
      const listData = listSs.getActiveSheet().getDataRange().getValues();
      const key = customerEmail.toLowerCase();

      // 同じお客様が複数行ある場合は、一番下（最新）の行を採用
      for (let i = listData.length - 1; i >= 1; i--) {
        if (String(listData[i][2]).trim().toLowerCase() === key) {
          foundInList = true;
          storeName = String(listData[i][4]).trim();
          break;
        }
      }

      const master = listSs.getSheetByName(STORE_MASTER_SHEET);
      if (storeName && master) {
        const masterData = master.getDataRange().getValues();
        for (let i = 1; i < masterData.length; i++) {
          if (String(masterData[i][0]).trim() === storeName) {
            storeEmail = String(masterData[i][1]).trim();
            break;
          }
        }
      }
    } catch (error) {
      console.log('担当店舗の検索に失敗しました: ' + error.message);
    }
  }

  // ---- ① 社内（管理者＋担当店舗）への通知 ----
  const storeLabel = storeName || '店舗不明';
  let internalTo = adminEmail;
  if (storeEmail) internalTo += ',' + storeEmail;

  const internalSubject = '卒花アンケート回答がありました（' + storeLabel + '）';
  let internalBody = '卒花アンケートに新しい回答がありました。\n\n';
  internalBody += '担当店舗：' + storeLabel + '\n';
  if (!storeEmail) {
    internalBody += '※担当店舗のメールアドレスが特定できなかったため、管理者のみに送信しています。\n';
  }
  internalBody += '\n━━━━━━━━━━━━━━━━━━━━━\n';
  internalBody += '【回答内容】\n\n';
  internalBody += namedValues ? answerText : '※エラー：フォームからのデータが正しく取得できませんでした。\n\n';
  internalBody += '━━━━━━━━━━━━━━━━━━━━━\n';

  try {
    GmailApp.sendEmail(internalTo, internalSubject, internalBody, options);
  } catch (error) {
    console.log('社内向け通知メールの送信に失敗しました: ' + error.message);
  }

  // ---- ② お客様への回答控え ----
  // シートAに登録済みのアドレスにだけ送る（フォームに他人のアドレスを入れて悪用されるのを防ぐ）
  if (foundInList && answerText) {
    const customerSubject = '【HIS WEDDING】アンケートへのご回答ありがとうございました';
    let customerBody = 'この度は、アンケートにご協力いただき誠にありがとうございました。\n';
    customerBody += '以下の内容で回答を受け付けいたしました。\n\n';
    customerBody += '━━━━━━━━━━━━━━━━━━━━━\n';
    customerBody += '【ご回答内容】\n\n';
    customerBody += answerText;
    customerBody += '━━━━━━━━━━━━━━━━━━━━━\n\n';
    customerBody += '※このメールは送信専用アドレスから自動送信されています。ご返信いただけません。\n';

    try {
      GmailApp.sendEmail(customerEmail, customerSubject, customerBody, options);
    } catch (error) {
      console.log('お客様向けメールの送信に失敗しました: ' + error.message);
    }
  }
}

/**
 * 店舗マスタの内容を、フォーム1（スタッフがお客様メアド・担当店舗を入力するフォーム）の
 * 「担当店舗」の選択肢にそのまま反映する。
 *
 * 【事前準備】
 * ・フォーム1の「担当店舗」を尋ねる質問は、プルダウン（リスト）かラジオボタン（選択式）にしておく
 * ・下の STAFF_FORM_ID に、フォーム1の編集画面URLの
 *   https://docs.google.com/forms/d/【ここ】/edit の部分を入れる
 * ・QUESTION_TITLE は、フォーム1に実際に書かれている質問文と一字一句同じにする
 */
function syncStoreChoicesToStaffForm() {
  const STAFF_FORM_ID = '1Tc6OxnuGNWcPk0RoS0-7U74Mragj5e4PmzVGS-7aKdI';
  const QUESTION_TITLE = '担当店舗';

  // シートA（リスト管理用シート）の中の「店舗マスタ」タブを正として同期する
  const listSsUrl = 'https://docs.google.com/spreadsheets/d/1EVSi4_wzORHt1PCLZjMkrdhh9zVkxp7BzCJa3Twk9fc/edit';
  const STORE_MASTER_SHEET = '店舗マスタ';

  const ss = SpreadsheetApp.openByUrl(listSsUrl);
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
 * ※ このプロジェクトに「スプレッドシートから／編集時」のインストール型トリガーとして登録し、
 *    対象スプレッドシートはシートA（店舗マスタタブを含むファイル）を指定してください。
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
