/**
 * operationService.gs
 * 期限自動算出（FNL日・納品予定日、第2章11-1章）と、手配情報（Operations）に関する業務ロジックを担当する。
 */

const OPERATION_STATUS_FLOW = [
  '未着手', '営業引継', '現地依頼', '返信待ち', '予約完了', '撮影済', 'RAW受領',
  'AI加工', '納品準備', '納品済', '完了'
];

/**
 * 成約時のOperations自動生成（詳細）。
 * 未成約後の再成約時は、新規行を作らず既存行の手配状態を「未着手」に戻し、CXL日をクリアして再利用する。
 * チャレンジ番号はCases側の値をそのまま転記する（Q&A一巡目 C-8：案件に1つだけ持つ）。
 */
function operationService_createOrReuseOnContract(caseId, contract, ctx) {
  const existing = operationRepo_getByCaseId(caseId);
  const weddingOrShootDate = contract.挙式日 || contract.撮影日 || '';
  const fnlDate = weddingOrShootDate ? calcFnlDate_(weddingOrShootDate) : null;
  const caseRecord = caseRepo_getById(caseId);
  const challengeNo = caseRecord ? caseRecord.チャレンジ番号 : '';

  if (existing) {
    // 既存行を再利用：手配状態を「未着手」に戻し、CXL日をクリアする
    operationRepo_updateByCaseId(caseId, {
      手配状態: '未着手',
      CXL日: '',
      'キャンセル☑': false,
      チャレンジ番号: challengeNo || existing.チャレンジ番号,
      プラン: contract.プラン || existing.プラン,
      手配担当者: existing.手配担当者 || ctx.name || ctx.email
    });
    operationHistoryRepo_insert({
      HISTORY_ID: generateOperationHistoryId(), CASE_ID: caseId, 更新日時: new Date(),
      担当: ctx.email, ステータス: '未着手', 内容: '成約により手配レコードを再利用（未成約→再成約）', メモ: ''
    });
    return;
  }

  // 60日は式場／フォトプランマスタの「標準納品日数」で個別上書き（未設定時は既定30日。Q&A一巡目 F-15）。
  // 早期納品フラグという独立項目は持たない（Q&A七巡目：実際の手配課シートに該当項目が無く、
  // 早期納品等のイレギュラー対応は備考欄に書き添える運用のため）。早期納品の場合は、成約時点では
  // ひとまず標準日数で算出しておき、必要に応じて手配担当者が納品予定日を直接修正し、
  // 備考にその旨を書き添える。
  const standardDays = venueStandardDeliveryDays_(contract.式場) || photoPlanStandardDeliveryDays_(contract.プラン);
  const deliveryDue = weddingOrShootDate ? calcDeliveryDueDate_(weddingOrShootDate, standardDays) : null;

  operationRepo_insert({
    CASE_ID: caseId,
    チャレンジ番号: challengeNo,
    プラン: contract.プラン || '',
    '挙式日（撮影日）': weddingOrShootDate,
    AGT: contract.現地会社 || '',
    FNL日: fnlDate ? formatDateISO_(fnlDate) : '',
    納品予定日: deliveryDue ? formatDateISO_(deliveryDue) : '',
    'キャンセル☑': false,
    手配状態: '未着手',
    手配担当者: ctx.name || ctx.email,
    更新日時: new Date()
  });

  operationHistoryRepo_insert({
    HISTORY_ID: generateOperationHistoryId(), CASE_ID: caseId, 更新日時: new Date(),
    担当: ctx.email, ステータス: '未着手', 内容: '成約により手配レコードを自動作成', メモ: ''
  });
}

/**
 * 第8章2章・3章：未成約登録に伴い、既存Operationsがあれば手配状態を「キャンセル」に更新しCXL日を設定する。
 */
function operationService_markCancelled(caseId, cancelDate, ctx) {
  operationRepo_updateByCaseId(caseId, { 手配状態: 'キャンセル', CXL日: cancelDate, 'キャンセル☑': true });
  operationHistoryRepo_insert({
    HISTORY_ID: generateOperationHistoryId(), CASE_ID: caseId, 更新日時: new Date(),
    担当: ctx.email, ステータス: 'キャンセル', 内容: '未成約／キャンセル登録に伴い手配状態を更新', メモ: ''
  });
}

/**
 * 第8章6章：手配情報更新処理フロー（画面08・09）。
 * 1. 更新対象の項目を検証
 * 2. Operationsの該当行を更新
 * 3. 変更内容をOperationHistoryに追記
 * 4. 手配状態が「完了」に変わったタイミングでのみCasesの案件状態も「完了」に連動更新
 */
function operationService_saveOperation(input, ctx) {
  const before = operationRepo_getByCaseId(input.CASE_ID);
  if (!before) throw new AppError('VALIDATION', '対象の手配情報が見つかりません。');

  validateOperation_(input);

  // 「標準日数で再計算する」を選んだ場合のみ、式場／フォトプランの標準納品日数（未設定時は既定30日）から
  // 納品予定日を上書きする。早期納品などのイレギュラー対応はこの再計算を使わず、納品予定日欄へ
  // 直接正しい日付を入力し、備考にその旨を書き添える運用とする（Q&A七巡目：手配課シートに
  // 早期納品専用の項目は無く、備考（早期納品有無等）に集約されているため）。
  const patch = Object.assign({}, input);
  delete patch.CASE_ID;
  if (input.再計算納品日 && before['挙式日（撮影日）']) {
    const standardDays = venueStandardDeliveryDays_(before.プラン) || photoPlanStandardDeliveryDays_(before.プラン);
    const due = calcDeliveryDueDate_(before['挙式日（撮影日）'], standardDays);
    patch.納品予定日 = formatDateISO_(due);
  }
  delete patch.再計算納品日;

  operationRepo_updateByCaseId(input.CASE_ID, patch);

  const changedSummary = Object.keys(patch).map(function (k) {
    return k + ': ' + before[k] + ' → ' + patch[k];
  }).join(', ');

  operationHistoryRepo_insert({
    HISTORY_ID: generateOperationHistoryId(), CASE_ID: input.CASE_ID, 更新日時: new Date(),
    担当: ctx.email, ステータス: patch.手配状態 || before.手配状態, 内容: '手配情報更新', メモ: changedSummary
  });

  // 4. 完了への自動連動
  if (patch.手配状態 === '完了') {
    caseRepo_updateById(input.CASE_ID, { 案件状態: '完了' });
  }

  writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_OPERATION', 対象CASE_ID: input.CASE_ID, 変更前後の値の要約: changedSummary });

  return { ok: true };
}

function operationService_addMemo(caseId, content, ctx) {
  operationMemoRepo_insert({
    MEMO_ID: 'MEMO-' + Utilities.getUuid().slice(0, 8),
    CASE_ID: caseId,
    投稿者: ctx.name || ctx.email,
    投稿日時: new Date(),
    内容: content
  });
}

/**
 * 第9章7章：手配管理一覧（画面08）の期限アラート表示用に、各行へアラート区分を付加する。
 * Q&A二巡目：手配管理一覧は表形式でパッとみてわかるようにしたいという要望に対応し、
 * 新郎新婦氏名（Customers）・地方（Cases→Stores）・方面（Contracts）を結合して返す。
 * この一覧は「カウンセリングシートから発生し、販売店スタッフが成約にした案件」のみが
 * Operationsに行を持つため、Operations全件＝成約済み案件一覧としてそのまま利用できる。
 */
function operationService_listWithAlerts() {
  const cases = caseRepo_getAll();
  const caseById = {};
  cases.forEach(function (c) { caseById[c.CASE_ID] = c; });

  const stores = storeRepo_getAll();
  const storeById = {};
  stores.forEach(function (s) { storeById[s.STORE_ID] = s; });

  const customers = sheetToObjects_(getSheet_(SHEET_NAMES.CUSTOMERS));
  const customerByCaseId = {};
  customers.forEach(function (cu) { customerByCaseId[cu.CASE_ID] = cu; });

  const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS));
  const contractByCaseId = {};
  contracts.forEach(function (ct) {
    if (ct.有効フラグ === false || ct.有効フラグ === 'FALSE') return;
    contractByCaseId[ct.CASE_ID] = ct;
  });

  return operationRepo_getAll().map(function (op) {
    const fnlReached = isFnlReached_(op.FNL日) && ['完了', 'キャンセル'].indexOf(op.手配状態) === -1 &&
      OPERATION_STATUS_FLOW.indexOf(op.手配状態) < OPERATION_STATUS_FLOW.indexOf('現地依頼');
    const deliveryLevel = ['完了', 'キャンセル'].indexOf(op.手配状態) === -1 ? deliveryAlertLevel_(op.納品予定日) : null;
    op.__fnlAlert = fnlReached;
    op.__deliveryAlert = deliveryLevel;

    const caseRecord = caseById[op.CASE_ID];
    const store = caseRecord ? storeById[caseRecord.店舗ID] : null;
    const customer = customerByCaseId[op.CASE_ID];
    const contract = contractByCaseId[op.CASE_ID];

    op.__storeId = caseRecord ? caseRecord.店舗ID : '';
    op.__storeName = store ? store.店舗名 : '';
    op.__region = store ? store.地方 : '';
    op.__customerName = customer ? [customer.新郎姓, customer.新郎名, '・', customer.新婦姓, customer.新婦名].join('') : '';
    op.__area = contract ? contract.方面 : '';
    return op;
  });
}

/**
 * 第8章7章：期限アラート通知処理フロー（毎日早朝バッチ）。
 */
function batchSendDeadlineAlerts() {
  try {
    const ops = operationService_listWithAlerts();
    const active = ops.filter(function (op) { return ['完了', 'キャンセル'].indexOf(op.手配状態) === -1; });

    const byStaff = {};
    active.forEach(function (op) {
      const fnlReached = op.__fnlAlert;
      const deliveryLevel = op.__deliveryAlert;
      if (!fnlReached && !deliveryLevel) return;
      const staff = staffRepo_getByEmail_or_name_(op.手配担当者);
      const email = staff ? staff.メール : null;
      if (!email) return;
      byStaff[email] = byStaff[email] || { fnl: [], delivery: [] };
      if (fnlReached) byStaff[email].fnl.push(op);
      if (deliveryLevel) {
        op.__alertLevel = deliveryLevel === 'OVERDUE' ? '超過' : '7日以内';
        byStaff[email].delivery.push(op);
      }
    });

    Object.keys(byStaff).forEach(function (email) {
      notifyDeadlineAlerts_(email, byStaff[email].fnl, byStaff[email].delivery);
    });
  } catch (e) {
    notifyBatchFailure_('期限アラートバッチ', String(e && e.message ? e.message : e));
  }
}

function staffRepo_getByEmail_or_name_(nameOrEmail) {
  if (!nameOrEmail) return null;
  const all = staffRepo_getAll();
  return all.find(function (s) { return s.メール === nameOrEmail; }) ||
    all.find(function (s) { return s.氏名 === nameOrEmail; }) || null;
}
