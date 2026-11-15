/**
 * main.gs
 * doGet/doPost、Webアプリのエントリーポイント（第7章2章）。
 *
 * 画面（HTML Service）からの呼び出しは google.script.run.xxx() を使い、
 * doGet が返すこのSPA自身のコンテキスト内で各Controller関数（例：getCaseList, saveOperation）を
 * 直接呼び出す構成とする。第6章4章の「API（関数）」は、実体としてはこれらgoogle.script.run経由で
 * 呼ばれるController層の公開関数を指す。doPostは外部連携用の予備エンドポイントとして残す。
 */

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  const html = template.evaluate()
    .setTitle('HIS WEDDING CRM & Operation System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

/** 外部Webhook等からの利用を見込んだ予備エンドポイント（通常のSPA操作はgoogle.script.runを使う） */
function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, message: 'Not implemented' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** HTML側で <?!= include('ファイル名') ?> として部品ファイルを読み込むためのヘルパー */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ログイン中ユーザーの表示用コンテキスト（氏名・ロール・店舗・メニュー可視性）を返す。
 * 画面初期表示時にフロントから呼ばれる（第5章1章：ロールに応じたメニュー出し分け）。
 */
function getCurrentUserInfo() {
  try {
    const ctx = getCurrentUserContext();
    return {
      ok: true,
      data: {
        email: ctx.email,
        name: ctx.name,
        role: ctx.role,
        storeId: ctx.storeId,
        menu: getMenuVisibility_(ctx.role)
      }
    };
  } catch (e) {
    return handleControllerError_(e, 'getCurrentUserInfo');
  }
}

/**
 * 日次バッチトリガー（第7章3章）をまとめて設置する。
 * ・毎日早朝：期限アラート通知（第8章7章）
 * ・毎日深夜：AnalyticsCache再計算（第8章8章）
 * ・AnalyticsCache再計算の直後：過去データアーカイブ（Q&A六巡目）。ダッシュボードの集計値は
 *   AnalyticsCacheに既に反映済みのため、その後で本体シートから退避しても集計は変わらない。
 */
function installDailyTriggers() {
  ['batchSendDeadlineAlerts', 'batchRebuildAnalyticsCache', 'batchArchiveOldRecords'].forEach(function (fn) {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t);
    });
  });
  ScriptApp.newTrigger('batchSendDeadlineAlerts').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('batchRebuildAnalyticsCache').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('batchArchiveOldRecords').timeBased().everyDays(1).atHour(3).create();
  Logger.log('日次バッチトリガーを設置しました。');
}
