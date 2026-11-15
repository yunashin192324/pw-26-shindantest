/**
 * trigger_form.gs
 * フォーム送信トリガー（第7章3章：インストール型、フォーム本体に設置）。
 * 第8章1章「フォーム送信処理フロー」をそのまま実装する。
 *
 * 設置方法：
 *   installFormTrigger() を一度実行すると、Settingsシートの FORM_ID に対して
 *   onFormSubmitInstallable を呼ぶインストール型トリガーが登録される。
 *   （第3章2-2章：スプレッドシート側ではなくフォーム本体に設置するトリガー）
 */

function installFormTrigger() {
  const formId = getSetting_('FORM_ID', '');
  if (!formId) throw new AppError('SYSTEM', 'SettingsシートにFORM_IDが設定されていません。');
  const form = FormApp.openById(formId);

  // 既存の同名トリガーを削除してから作り直す（二重登録防止）
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitInstallable') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('onFormSubmitInstallable')
    .forForm(form)
    .onFormSubmit()
    .create();

  Logger.log('フォーム送信トリガーを設置しました。');
}

/**
 * 第8章1章：フォーム送信処理フロー
 * 1. e.response.getItemResponses() で回答を取得（第3章の質問ID方式）
 * 2. FormItemMasterと照合し内部項目名に変換。未登録IDは「未マッピング回答」として保存＋Gmail通知
 * 3. 正規化ルールを適用
 * 4. CASE_IDを新規採番
 * 5. Cases・Customersを作成。相談区分に応じてWeddingRequestsまたはPhotoRequestsを作成
 * 6. 案件状態を「来店前」で初期化、現在担当部署を「販売店」に設定
 * 7. お客様へ受付完了メール、該当店舗の担当窓口へ新規来店予約メールを送信
 * 8. SystemLogsに作成ログを記録
 */
function onFormSubmitInstallable(e) {
  try {
    const formResponse = e.response;
    const formResponseId = formResponse.getId ? formResponse.getId() : Utilities.getUuid();

    // 1〜3. 質問ID方式での取得＋正規化
    const mapped = mapFormResponseToRecords_(formResponse);

    // 原本監査ログ（第2章2章 FormResponses）
    appendRowFromObject_(getSheet_(SHEET_NAMES.FORM_RESPONSES), {
      受信日時: new Date(),
      FORM_RESPONSE_ID: formResponseId,
      CASE_ID: '',
      生データJSON: JSON.stringify(mapped.byTable)
    });

    // 未マッピング回答の保存＋通知（第3章5章）
    if (mapped.unmapped.length > 0) {
      mapped.unmapped.forEach(function (u) {
        unmappedResponseRepo_insert({
          受信日時: new Date(),
          FORM_RESPONSE_ID: formResponseId,
          ITEM_ID: u.itemId,
          質問文: u.title,
          回答値: JSON.stringify(u.value),
          処理済み: false
        });
      });
      notifyUnmappedFormResponse_(formResponseId, mapped.unmapped);
    }

    // 店舗名 → STORE_ID 変換（Casesの店舗ID列にはIDを持たせる。第1章6-1章No.4）
    const storeName = mapped.byTable.Cases.店舗ID; // 一時的に店舗名が入っている
    const store = storeRepo_getAll().find(function (s) { return s.店舗名 === storeName; });
    mapped.byTable.Cases.店舗ID = store ? store.STORE_ID : '';

    // 4. CASE_ID採番
    const caseId = generateCaseId();

    // 5. Cases・Customers作成
    const customerId = generateCustomerId();
    const nowTs = new Date();

    const caseRecord = Object.assign({
      CASE_ID: caseId,
      FORM_RESPONSE_ID: formResponseId,
      登録経路: 'フォーム', // 手動登録（caseService_createManualCase）と区別する
      受付日時: nowTs,
      CUSTOMER_ID: customerId,
      相談区分: mapped.consultationType || '',
      問合せ方法: 'Web', // フォーム経由の問い合わせは一律「Web」（Q&A一巡目G-19。電話・来店等は手動登録時に選択）
      案件状態: '来店前', // 6.
      現在担当部署: '販売店', // 6.
      作成日時: nowTs,
      更新日時: nowTs
    }, mapped.byTable.Cases);
    // 媒体はカウンセリングシート項目18（流入経路）の回答をそのまま流用する（Q&A一巡目G-18。再入力させない）
    caseRecord.媒体 = caseRecord.流入経路 || '';
    caseRepo_insertCase(caseRecord);

    const customerRecord = Object.assign({ CUSTOMER_ID: customerId, CASE_ID: caseId }, mapped.byTable.Customers);
    customerRepo_insert(customerRecord);

    if (mapped.consultationType === '挙式') {
      caseRepo_insertWeddingRequest(Object.assign({ CASE_ID: caseId }, mapped.byTable.WeddingRequests));
    } else if (mapped.consultationType === 'フォト') {
      caseRepo_insertPhotoRequest(Object.assign({ CASE_ID: caseId }, mapped.byTable.PhotoRequests));
    }

    // 7. Gmail通知（第1章2章の制約：通知はGmailAppのみ）
    notifyCounselingReceived_(caseId, customerRecord, store);
    notifyNewVisitToStore_(caseId, customerRecord, store);

    // 8. SystemLogs
    writeSystemLog_({
      日時: nowTs,
      実行者: 'system(onFormSubmit)',
      操作種別: 'CREATE_CASE',
      対象CASE_ID: caseId,
      変更前後の値の要約: 'フォーム送信により新規案件を作成（相談区分=' + mapped.consultationType + '）'
    });
  } catch (err) {
    // トリガー内の例外はUIに返せないため、SystemLogsに残し、可能ならGmailで通知する
    try {
      writeSystemLog_({
        日時: new Date(),
        実行者: 'system(onFormSubmit)',
        操作種別: 'ERROR',
        対象CASE_ID: '',
        変更前後の値の要約: String(err && err.message ? err.message : err)
      });
    } catch (ignore) { /* noop */ }
    throw err;
  }
}
