/**
 * notificationService.gs
 * Gmail通知の組み立て・送信を担当する。
 * 第1章2章の制約：GASによるチャット通知は使わない。通知手段はGmail送信（GmailApp）のみ。
 */

function sendMail_(to, subject, body) {
  if (!to) return;
  GmailApp.sendEmail(to, subject, body);
}

/** 第1章10章／第8章1章-7：カウンセリングシート回答受付時、お客様へ受付完了メール */
function notifyCounselingReceived_(caseId, customer, store) {
  if (!customer || !customer.代表メール) return;
  const subject = '【HIS】ご相談受付のご案内（受付番号：' + caseId + '）';
  const body = customer.新郎姓 + ' ' + customer.新婦姓 + ' 様\n\n' +
    'この度はご相談いただき誠にありがとうございます。\n' +
    (store ? '担当店舗：' + store.店舗名 + '\n' : '') +
    '担当者より追ってご連絡いたします。\n\n' +
    '※本メールはシステムからの自動送信です。';
  sendMail_(customer.代表メール, subject, body);
}

/** 第1章10章／第8章1章-7：該当店舗の担当窓口へ新規来店予約メール */
function notifyNewVisitToStore_(caseId, customer, store) {
  if (!store || !store.メール) return;
  const subject = '【新規来店予約】' + (customer.新郎姓 || '') + '・' + (customer.新婦姓 || '') + '様（' + caseId + '）';
  const body = '新規のカウンセリングシート回答がありました。\n\n' +
    '案件ID：' + caseId + '\n' +
    '新郎：' + customer.新郎姓 + ' ' + customer.新郎名 + '\n' +
    '新婦：' + customer.新婦姓 + ' ' + customer.新婦名 + '\n' +
    'システムから詳細をご確認ください。';
  sendMail_(store.メール, subject, body);
}

/** 第1章10章／第8章2章：成約時、手配課へ引き継ぎメール */
function notifyHandoffToArrangement_(caseId, caseRecord, customer) {
  const to = getSetting_('NOTIFY_EMAIL', 't-avantikikaku@his-world.com');
  if (!to) return;
  const subject = '【成約・手配引き継ぎ】' + caseId;
  const body = '以下の案件が成約し、手配課へ引き継がれました。\n\n' +
    '案件ID：' + caseId + '\n' +
    '新郎新婦：' + (customer ? (customer.新郎姓 + ' ' + customer.新郎名 + ' / ' + customer.新婦姓 + ' ' + customer.新婦名) : '') + '\n' +
    'システムの手配管理画面よりご確認ください。';
  sendMail_(to, subject, body);
}

/**
 * 第8章7章：期限アラート通知。案件ごとに乱発せず、手配担当者ごとに1人1通へまとめて送る。
 * @param {string} staffEmail
 * @param {Array} fnlAlerts FNL日到達の案件一覧
 * @param {Array} deliveryAlerts 納品予定日が近い／超過の案件一覧
 */
function notifyDeadlineAlerts_(staffEmail, fnlAlerts, deliveryAlerts) {
  if (!staffEmail || (fnlAlerts.length === 0 && deliveryAlerts.length === 0)) return;
  const lines = [];
  if (fnlAlerts.length > 0) {
    lines.push('■ FNL日（現地依頼期限）到達案件');
    fnlAlerts.forEach(function (op) {
      lines.push('  ・' + op.CASE_ID + '　FNL日：' + formatDateISO_(op.FNL日));
    });
  }
  if (deliveryAlerts.length > 0) {
    lines.push('');
    lines.push('■ 納品予定日が近い／超過している案件');
    deliveryAlerts.forEach(function (op) {
      lines.push('  ・' + op.CASE_ID + '　納品予定日：' + formatDateISO_(op.納品予定日) + '（' + op.__alertLevel + '）');
    });
  }
  const subject = '【手配期限アラート】要対応案件のお知らせ';
  sendMail_(staffEmail, subject, lines.join('\n'));
}

/** 第3章5章：未登録の質問IDを検知した場合の通知先（t-avantikikaku02@his-world.com） */
function notifyUnmappedFormResponse_(formResponseId, unmappedList) {
  const to = getSetting_('NOTIFY_EMAIL', 't-avantikikaku@his-world.com');
  const subject = '【要対応】未マッピングのフォーム回答を検知しました';
  const lines = ['フォーム回答ID：' + formResponseId, '', '以下の質問IDがFormItemMasterに未登録です。'];
  unmappedList.forEach(function (u) {
    lines.push('・ITEM_ID=' + u.itemId + '　質問文=' + u.title);
  });
  lines.push('', 'FormItemMasterに追記後、該当回答の再取込を行ってください。');
  sendMail_(to, subject, lines.join('\n'));
}

/** 第7章6章：深夜バッチ（集計等）失敗時の異常通知 */
function notifyBatchFailure_(batchName, errorMessage) {
  const to = getSetting_('NOTIFY_EMAIL', 't-avantikikaku@his-world.com');
  sendMail_(to, '【要対応】バッチ処理エラー：' + batchName, 'エラー内容：\n' + errorMessage);
}

/** 第7章6章：AnalyticsCacheの最終更新日時が2日以上古い場合の異常通知 */
function notifyStaleAnalyticsCache_(lastUpdated) {
  const to = getSetting_('NOTIFY_EMAIL', 't-avantikikaku@his-world.com');
  sendMail_(to, '【要対応】ダッシュボード集計が更新されていません',
    '最終更新日時：' + formatDateTimeISO_(lastUpdated) + '\n深夜バッチの実行状況を確認してください。');
}
