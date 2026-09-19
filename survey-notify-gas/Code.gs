/**
 * 卒花アンケート回答の通知メール送信
 */
function notifyNewSurveyResponse(e) {
  // 宛先のメールアドレス
  const recipient = 't-avantikikaku02@his-world.com';

  // メールの件名
  const subject = '卒花アンケート回答がありました。';

  // 送信元と送信者名の設定
  const options = {
    from: 'his-wedding@his-world.com',
    name: 'HIS WEDDING送信専用メール' // ※ご希望があれば変更可能です
  };

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

  // メール本文の作成
  let body = "卒花アンケートに新しい回答がありました。\n\n";
  body += "━━━━━━━━━━━━━━━━━━━━━\n";
  body += "【回答内容】\n\n";

  // e.namedValues には「スプレッドシートの列名（質問）」と「回答」がセットで入っています
  if (e && e.namedValues) {
    const namedValues = e.namedValues;
    const printed = new Set();

    // 未記入（空欄）の質問はメールに書かない
    const appendIfAnswered = function (question, answer) {
      const trimmed = (answer === undefined || answer === null) ? "" : String(answer).trim();
      if (!trimmed) return;
      body += "■ " + question + "\n" + trimmed + "\n\n";
    };

    // 1. QUESTION_ORDER で決めた順番どおりに出力
    QUESTION_ORDER.forEach(function (question) {
      if (Object.prototype.hasOwnProperty.call(namedValues, question)) {
        printed.add(question);
        appendIfAnswered(question, namedValues[question][0]);
      }
    });

    // 2. QUESTION_ORDER に書き漏れている質問があれば、末尾にまとめて追加（表示漏れ防止）
    for (let question in namedValues) {
      if (!printed.has(question)) {
        appendIfAnswered(question, namedValues[question][0]);
      }
    }
  } else {
    body += "※エラー：フォームからのデータが正しく取得できませんでした。\n\n";
  }

  body += "━━━━━━━━━━━━━━━━━━━━━\n";
  body += "▼ スプレッドシートを確認する ▼\n";
  body += "https://docs.google.com/spreadsheets/d/18Gi1mhU3UjSQ-oQaD10XIy4moJYnPn7cH_FCgBkPQxM/edit\n";

  try {
    // メール送信を実行
    GmailApp.sendEmail(recipient, subject, body, options);
  } catch (error) {
    console.log("通知メールの送信に失敗しました: " + error.message);
  }
}
