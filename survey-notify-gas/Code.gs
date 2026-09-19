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

  // メール本文の作成
  let body = "卒花アンケートに新しい回答がありました。\n\n";
  body += "━━━━━━━━━━━━━━━━━━━━━\n";
  body += "【回答内容】\n\n";

  // e.range / e.values を使うと、スプレッドシートの列の並び順（＝質問の掲載順）
  // のまま取得できる。e.namedValues はオブジェクトのため順序が安定しない。
  if (e && e.range && e.values) {
    const sheet = e.range.getSheet();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const answers = e.values;

    headers.forEach((question, i) => {
      if (!question) return; // 見出しの無い列は表示しない
      const answer = answers[i] || "";
      body += "■ " + question + "\n" + answer + "\n\n";
    });
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
