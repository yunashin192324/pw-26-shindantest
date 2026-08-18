/**
 * ============================================================
 * AI Photo Curator - Gemini API プロキシ（Google Apps Script）
 * ============================================================
 *
 * 目的:
 *   index.html（ブラウザで動くフロントエンド）から Gemini API を直接呼ぶと、
 *   APIキーがブラウザのソースコードに書かれてしまい、ページを見た人なら
 *   誰でも抜き取って使える状態になってしまいます。
 *   このスクリプトは会社のGoogleアカウントの下で動く「中継役」として、
 *   APIキーをサーバー側（スクリプトのプロパティ）にだけ保持し、
 *   フロントエンドからのリクエストをGemini APIへ代理送信します。
 *
 * セットアップ手順の詳細は ../README.md を参照してください。概要:
 *   1. script.google.com で新しいプロジェクトを作成し、このファイルの
 *      内容を貼り付ける。
 *   2. 「プロジェクトの設定」→「スクリプト プロパティ」で
 *      GEMINI_API_KEY を追加（値はGoogle AI Studioで発行したキー）。
 *      任意で SHARED_SECRET も追加すると、URLが漏れた場合の追加防御になる。
 *   3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」。
 *        - 実行するユーザー: 自分（Me）
 *        - アクセスできるユーザー: 「組織内のユーザー」を強く推奨
 *          （会社のGoogle Workspaceのアカウントでログインしている人だけが
 *          呼び出せるようになる。個人のGmailアカウントで組織のオプションが
 *          出ない場合は「全員」を選ぶことになるが、その場合は必ず
 *          SHARED_SECRET を設定すること）。
 *   4. 発行された「ウェブアプリのURL」（.../exec で終わるもの）を
 *      index.html の PROXY_URL に貼り付ける。
 *   5. Code.gs を後から編集した場合は、「デプロイを管理」→ 対象の
 *      デプロイの鉛筆アイコン →「新しいバージョン」を選んで再デプロイ
 *      しないと、公開中のURLには変更が反映されない点に注意。
 */

const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty("GEMINI_API_KEY");
    const requiredSecret = props.getProperty("SHARED_SECRET");

    if (!apiKey) {
      return jsonResponse({
        error: { message: "サーバー側にGEMINI_API_KEYが設定されていません。管理者にお問い合わせください。" }
      });
    }

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ error: { message: "リクエストの本文が空です。" } });
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ error: { message: "リクエストの形式が不正です（JSONとして解析できません）。" } });
    }

    // 任意の合言葉チェック（SHARED_SECRETを設定した場合のみ有効）
    if (requiredSecret && body.secret !== requiredSecret) {
      return jsonResponse({
        error: { message: "認証に失敗しました（secretが一致しません）。", code: 403 }
      });
    }

    const payload = body.payload;
    if (!payload || !payload.contents) {
      return jsonResponse({ error: { message: "リクエストにpayload.contentsがありません。" } });
    }

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      GEMINI_MODEL + ":generateContent?key=" + encodeURIComponent(apiKey);

    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    // Gemini側からの応答（成功時はcandidates、失敗時はerrorを含むJSON）を
    // そのままフロントエンドへ橋渡しする。Apps ScriptのWebアプリは
    // HTTPステータスコードを自由に設定できないため、ステータス情報が
    // 必要な場合はレスポンスJSON内のerror.codeで判定させる。
    const status = response.getResponseCode();
    let geminiBody;
    try {
      geminiBody = JSON.parse(response.getContentText());
    } catch (e2) {
      return jsonResponse({
        error: { message: "Gemini APIから予期しない応答がありました（HTTP " + status + "）。", code: status }
      });
    }

    if (status < 200 || status >= 300) {
      // Geminiのエラー形式 { error: { code, message, status } } はそのまま使う
      if (!geminiBody.error) {
        geminiBody = { error: { message: "Gemini APIエラー (HTTP " + status + ")", code: status } };
      } else if (!geminiBody.error.code) {
        geminiBody.error.code = status;
      }
    }

    return jsonResponse(geminiBody);
  } catch (err) {
    return jsonResponse({ error: { message: "プロキシ内部でエラーが発生しました: " + err.message } });
  }
}

// 動作確認用（ブラウザで直接ウェブアプリURLを開いたとき用）。
// 実際のAI呼び出しは doPost のみで受け付ける。
function doGet(e) {
  return ContentService
    .createTextOutput("AI Photo Curator proxy is running. POST only.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
