/**
 * caseService.gs
 * 案件登録・更新のビジネスロジックを集約する。
 * 成約登録・未成約登録・保留・キャンセル登録などの業務ルールはすべてここに書く。Controller層には書かない。
 *
 * v2（Q&A一巡目の確定内容）：
 *   ・案件はカウンセリングシート経由に加え、電話・飛び込み来店等の手動登録にも対応する（A-1・B-6）
 *   ・チャレンジ番号・相談内容・問合せ方法・媒体は「案件」に1つだけ持つ（C-8・G-18・G-19）
 *   ・見積（Quotes）は撤去。契約（成約）時にはじめて条件を確定する（D-11・D-12）
 *   ・CPL旅行・列席旅行人数、方面は契約（Contracts）側で確定する（C-9・G-17）
 *   ・経過メモ（CaseNotes）：後日の電話対応等をいつでも追記できるログを新設（A-1）
 *
 * v3（Q&A九巡目：実際の接客履歴シートに合わせた見直し）：
 *   ・接客履歴（SalesHistory）は日付・媒体・窓口・担当・備考のみのシンプルな記録簿に変更。
 *     以前あった「区分（新規／既存の自動判定）」「結果欄による成約/未成約/保留への自動遷移」は、
 *     実シートに存在しない独自仕様だったため廃止した。
 *   ・成約登録（caseService_registerContract）・未成約登録（caseService_registerLostCase）・
 *     保留（caseService_markOnHold）は、接客履歴の保存とは独立した操作に分離した。
 *   ・案件メモ（CaseSummaryMemo）・書類チェックリスト（DocumentChecklistItems／CaseDocumentChecks）を新設。
 */

const CASE_STATUS = {
  BEFORE_VISIT: '来店前',
  VISITED: '来店済',
  NEGOTIATING: '商談中',
  ON_HOLD: '保留',
  CONTRACTED: '成約',
  COMPLETED: '完了',
  LOST: '未成約',
  CANCELLED: 'キャンセル'
};

const CASE_SOURCE = { FORM: 'フォーム', MANUAL: '手動' };

/**
 * 接客履歴（SalesHistory）の「媒体」＝お客様とのやり取りに使ったツール（Q&A九巡目：実際の履歴シートに
 * 合わせた）。着信・発信、受領・送付など方向を区別する。Cases.媒体（集客経路。Instagram等）や
 * Cases.問合せ方法（来店/電話/メール等、初回問い合わせの手段）とは別概念で、こちらは接客記録1件ごとの
 * やり取り手段を表す。
 */
const SALES_HISTORY_MEDIA_OPTIONS = [
  '電話（着信）', '電話（発信）', 'メール（受信）', 'メール（送信）', '郵送（受領）', '郵送（送付）', '来店', 'オンライン(PC)'
];
/** 窓口＝やり取りの相手方（Q&A九巡目） */
const SALES_HISTORY_WINDOW_OPTIONS = ['新郎', '新婦', 'その他'];

/* ---------- 案件一覧・詳細取得（スコープはcontroller側で決定し、ここに渡す） ---------- */

/**
 * @param {Object} scope { type: 'OWN_STORE'|'ALL'|'CONTRACTED_ONLY', storeId }
 */
function caseService_listCases(scope) {
  let cases = caseRepo_getAll();
  if (scope.type === 'OWN_STORE') {
    cases = cases.filter(function (c) { return c.店舗ID === scope.storeId; });
  }
  if (scope.contractedOnly) {
    const contractedStatuses = [CASE_STATUS.CONTRACTED, CASE_STATUS.COMPLETED, CASE_STATUS.CANCELLED];
    cases = cases.filter(function (c) { return contractedStatuses.indexOf(c.案件状態) !== -1; });
  }
  // 一覧表示用に顧客名・最新の手配状態・絞り込み用項目（地方／方面／AGT／挙式月）を付加する
  // （Q&A二巡目：案件一覧のカテゴリは成約／未成約のみでよく、代わりに地方・方面（国）・AGT・月で
  //   絞り込みたいという要望に対応。フィルタ自体は一覧を返した後クライアント側で行う）。
  const operations = operationRepo_getAll();
  const opByCaseId = {};
  operations.forEach(function (op) { opByCaseId[op.CASE_ID] = op; });

  const stores = storeRepo_getAll();
  const storeById = {};
  stores.forEach(function (s) { storeById[s.STORE_ID] = s; });

  const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS));
  const contractByCaseId = {};
  contracts.forEach(function (ct) {
    if (ct.有効フラグ === false || ct.有効フラグ === 'FALSE') return;
    contractByCaseId[ct.CASE_ID] = ct;
  });

  return cases.map(function (c) {
    const customer = customerRepo_getByCaseId(c.CASE_ID);
    const op = opByCaseId[c.CASE_ID];
    const store = storeById[c.店舗ID];
    const contract = contractByCaseId[c.CASE_ID];
    // 成約／未成約の2択に集約した簡易ステータス（フィルタUI簡素化用）。完了は成約に、
    // キャンセルは未成約に含める。来店前～保留の進行中案件はどちらにも属さない（フィルタ対象外）。
    const simpleStatus =
      [CASE_STATUS.CONTRACTED, CASE_STATUS.COMPLETED].indexOf(c.案件状態) !== -1 ? '成約' :
      [CASE_STATUS.LOST, CASE_STATUS.CANCELLED].indexOf(c.案件状態) !== -1 ? '未成約' : '';
    return {
      CASE_ID: c.CASE_ID,
      新郎姓名: customer ? (customer.新郎姓 + ' ' + customer.新郎名) : '',
      新婦姓名: customer ? (customer.新婦姓 + ' ' + customer.新婦名) : '',
      店舗ID: c.店舗ID,
      店舗名: store ? store.店舗名 : '',
      地方: store ? store.地方 : '',
      担当者ID: c.担当者ID,
      相談区分: c.相談区分,
      チャレンジ番号: c.チャレンジ番号,
      登録経路: c.登録経路,
      案件状態: c.案件状態,
      簡易状態: simpleStatus,
      相談予定日: c.相談予定日,
      更新日時: c.更新日時,
      手配状態: op ? op.手配状態 : '',
      方面: contract ? contract.方面 : '',
      AGT: contract ? contract.現地会社 : '',
      挙式月: op && op['挙式日（撮影日）'] ? String(op['挙式日（撮影日）']).slice(0, 7) : ''
    };
  });
}

/**
 * 案件詳細（タブ構成）に必要な情報を一括で組み立てる。
 * どのタブを見せるかはController/フロント側で権限に応じて出し分ける。
 */
function caseService_getCaseDetail(caseId) {
  const caseRecord = caseRepo_getById(caseId);
  if (!caseRecord) return null;
  const customer = caseRepo_getCustomerByCaseId(caseId);
  const weddingRequest = caseRecord.相談区分 === '挙式' ? caseRepo_getWeddingRequestByCaseId(caseId) : null;
  const photoRequest = caseRecord.相談区分 === 'フォト' ? caseRepo_getPhotoRequestByCaseId(caseId) : null;
  return {
    caseRecord: caseRecord,
    customer: customer,
    weddingRequest: weddingRequest,
    photoRequest: photoRequest,
    salesHistory: caseRepo_getSalesHistoryByCaseId(caseId),
    caseNotes: caseRepo_getCaseNotesByCaseId(caseId),
    summaryMemo: caseRepo_getSummaryMemoByCaseId(caseId),
    documentChecklist: caseService_getDocumentChecklistStatus_(caseId),
    contracts: caseRepo_getContractsByCaseId(caseId),
    lostCases: caseRepo_getLostCasesByCaseId(caseId),
    tasks: taskRepo_getByCaseId(caseId)
  };
}

/** 書類チェックリストのマスタ項目に、案件ごとのチェック状態を重ねて返す（Q&A九巡目） */
function caseService_getDocumentChecklistStatus_(caseId) {
  const items = documentChecklistRepo_getAll();
  const checks = caseRepo_getDocumentChecksByCaseId(caseId);
  const checkByItemId = {};
  checks.forEach(function (c) { checkByItemId[c.ITEM_ID] = c; });
  return items.map(function (item) {
    const check = checkByItemId[item.ITEM_ID];
    return Object.assign({}, item, { チェック済み: check ? (check.チェック済み === true || check.チェック済み === 'TRUE') : false });
  });
}

/**
 * 電話・飛び込み来店などフォームを介さない新規問い合わせを、案件として手動登録する。
 * Q&A一巡目 B-6：店舗・氏名・相談区分に加え、チャレンジ番号・相談内容・担当者を必須とする。
 * すでに成約が決まっている場合（バックログ登録等）は、挙式日・方面・式場orプラン名・プランを
 * 併せて渡すと、登録と同時に契約（Contracts）・手配（Operations）まで作成する。
 * @param {Object} input { 新郎姓,新郎名,新郎カナ,新郎電話,新婦姓,新婦名,新婦カナ,新婦電話,代表メール,
 *   店舗ID,相談区分,相談予定日,チャレンジ番号,相談内容,担当者,問合せ方法,媒体,
 *   既に成約済みか,挙式日,方面,式場またはプラン名,プラン,商品 }
 */
function caseService_createManualCase(input, ctx) {
  assertRequired_(input.新郎姓, '新郎姓');
  assertRequired_(input.新婦姓, '新婦姓');
  assertRequired_(input.店舗ID, '店舗ID');
  assertRequired_(input.相談区分, '相談区分');
  if (['挙式', 'フォト'].indexOf(input.相談区分) === -1) {
    throw new AppError('VALIDATION', '相談区分は「挙式」または「フォト」を指定してください。');
  }
  assertRequired_(input.チャレンジ番号, 'チャレンジ番号');
  assertRequired_(input.相談内容, '相談内容');
  assertRequired_(input.担当者, '担当者');
  validateCaseCore_(input);
  if (caseRepo_isChallengeNumberDuplicate(input.チャレンジ番号, null)) {
    throw new AppError('VALIDATION', 'チャレンジ番号「' + input.チャレンジ番号 + '」はすでに登録されています。');
  }

  const caseId = generateCaseId();
  const customerId = generateCustomerId();
  const now = new Date();

  customerRepo_insert({
    CUSTOMER_ID: customerId, CASE_ID: caseId,
    新郎姓: input.新郎姓 || '', 新郎名: input.新郎名 || '', 新郎カナ: input.新郎カナ || '', 新郎電話: input.新郎電話 || '',
    新婦姓: input.新婦姓 || '', 新婦名: input.新婦名 || '', 新婦カナ: input.新婦カナ || '', 新婦電話: input.新婦電話 || '',
    代表メール: input.代表メール || '', 優先連絡先: input.優先連絡先 || ''
  });

  caseRepo_insertCase({
    CASE_ID: caseId,
    FORM_RESPONSE_ID: '',
    登録経路: CASE_SOURCE.MANUAL,
    受付日時: now,
    相談予定日: input.相談予定日 || '',
    店舗ID: input.店舗ID,
    担当者ID: ctx.staffId || '',
    CUSTOMER_ID: customerId,
    相談区分: input.相談区分,
    相談内容: input.相談内容,
    チャレンジ番号: input.チャレンジ番号,
    問合せ方法: input.問合せ方法 || '',
    媒体: input.媒体 || '',
    案件状態: CASE_STATUS.BEFORE_VISIT,
    現在担当部署: '販売店',
    作成日時: now,
    更新日時: now
  });

  writeSystemLog_({
    実行者: ctx.email, 操作種別: 'CREATE_CASE_MANUAL', 対象CASE_ID: caseId,
    変更前後の値の要約: 'フォームを介さない手動登録（' + input.相談区分 + '）'
  });

  const result = { caseId: caseId };

  // 登録と同時に成約が決まっている場合（バックログ登録等。Q&A一巡目 B-6）
  if (input.既に成約済みか) {
    const contractId = caseService_registerContract_(caseId, {
      契約日: formatDateISO_(now),
      商品: input.商品 || '',
      プラン: input.プラン || '',
      方面: input.方面 || '',
      式場: input['式場またはプラン名'] || '',
      挙式日: input.挙式日 || ''
    }, ctx);
    result.contractId = contractId;
  }

  return result;
}

/** 案件の基本情報（チャレンジ番号等）を後から編集する場合に使う */
function caseService_updateCaseCore(caseId, patch, ctx) {
  const caseRecord = caseRepo_getById(caseId);
  if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');
  validateCaseCore_(patch);
  if (patch.チャレンジ番号 && caseRepo_isChallengeNumberDuplicate(patch.チャレンジ番号, caseId)) {
    throw new AppError('VALIDATION', 'チャレンジ番号「' + patch.チャレンジ番号 + '」はすでに登録されています。');
  }
  caseRepo_updateById(caseId, patch);
  writeSystemLog_({ 実行者: ctx.email, 操作種別: 'UPDATE_CASE_CORE', 対象CASE_ID: caseId, 変更前後の値の要約: JSON.stringify(patch) });
}

/* ---------- 経過メモ（CaseNotes）。後日の電話対応等をいつでも追記できるログ ---------- */

function caseService_addCaseNote(caseId, content, ctx) {
  validateCaseNote_(content);
  caseRepo_insertCaseNote({
    MEMO_ID: 'CN-' + Utilities.getUuid().slice(0, 8),
    CASE_ID: caseId,
    投稿者: ctx.name || ctx.email,
    投稿日時: new Date(),
    内容: content
  });
}

/* ---------- 接客記録保存（画面04） ---------- */

/**
 * 接客履歴（SalesHistory）。実際に使っている履歴シートの項目（日付・媒体・窓口・担当・備考）に
 * 合わせている（Q&A九巡目）。以前ここにあった「結果」欄による成約／未成約／保留への自動遷移は、
 * 実シートに存在しない仕組みだったため廃止し、案件のステータス変更（成約登録・未成約登録・保留）は
 * それぞれ独立した操作（caseService_registerContract／caseService_registerLostCase／
 * caseService_markOnHold）に分離した。接客履歴はあくまで「いつ・何で・誰と・誰が話したか」の記録簿。
 * @param {Object} input { CASE_ID, 日付, 媒体, 窓口, 担当, 備考 }
 * @param {Object} ctx 現在ログインユーザーコンテキスト
 */
function caseService_saveSalesHistory(input, ctx) {
  const caseRecord = caseRepo_getById(input.CASE_ID);
  if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');

  validateSalesHistory_(input);

  const historyId = generateHistoryId();
  caseRepo_insertSalesHistory({
    HISTORY_ID: historyId,
    CASE_ID: input.CASE_ID,
    日付: input.日付,
    媒体: input.媒体,
    窓口: input.窓口 || '',
    担当: input.担当,
    備考: input.備考 || '',
    登録日時: new Date()
  });

  writeSystemLog_({
    実行者: ctx.email, 操作種別: 'SAVE_SALES_HISTORY', 対象CASE_ID: input.CASE_ID,
    変更前後の値の要約: '媒体=' + input.媒体 + '／窓口=' + (input.窓口 || '')
  });

  return { historyId: historyId };
}

/** 案件を保留にする（以前は接客記録の「結果」欄から自動遷移していたが、独立した操作に分離） */
function caseService_markOnHold(caseId, ctx) {
  const caseRecord = caseRepo_getById(caseId);
  if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');
  caseRepo_updateById(caseId, { 案件状態: CASE_STATUS.ON_HOLD });
  writeSystemLog_({ 実行者: ctx.email, 操作種別: 'MARK_ON_HOLD', 対象CASE_ID: caseId, 変更前後の値の要約: '案件状態=保留' });
}

/**
 * 成約登録（接客記録から切り離した独立操作。Q&A九巡目）。実処理は既存のcaseService_registerContract_を
 * そのまま使う。
 */
function caseService_registerContract(caseId, contractInput, ctx) {
  const caseRecord = caseRepo_getById(caseId);
  if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');
  return caseService_registerContract_(caseId, contractInput || {}, ctx);
}

/**
 * 未成約登録（接客記録から切り離した独立操作。Q&A九巡目）。キャンセル登録（既存契約の取り消し）は
 * 別途caseService_cancelContractで扱う。
 */
function caseService_registerLostCase(caseId, lostInput, ctx) {
  const caseRecord = caseRepo_getById(caseId);
  if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');
  return caseService_registerLostCase_(caseId, lostInput || {}, 'LOST', ctx);
}

/* ---------- 案件メモ（CaseSummaryMemo。構造化・1案件1行。Q&A九巡目） ---------- */

function caseService_saveSummaryMemo(input, ctx) {
  const caseRecord = caseRepo_getById(input.CASE_ID);
  if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');
  validateSummaryMemo_(input);
  const patch = Object.assign({}, input);
  delete patch.CASE_ID;
  patch.更新日時 = new Date();
  patch.更新者 = ctx.name || ctx.email;
  caseRepo_saveSummaryMemo(input.CASE_ID, patch);
  writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_CASE_SUMMARY_MEMO', 対象CASE_ID: input.CASE_ID, 変更前後の値の要約: '' });
}

/* ---------- 書類チェックリスト（Q&A九巡目） ---------- */

function caseService_toggleDocumentCheck(caseId, itemId, checked, ctx) {
  const caseRecord = caseRepo_getById(caseId);
  if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');
  caseRepo_setDocumentCheck(caseId, itemId, checked, ctx.name || ctx.email);
}

/**
 * 成約登録。ContractsへCONTRACT_ID新規採番で追加、既存Contractsは有効フラグOFF、
 * Casesを「成約」・現在担当部署「手配課」に更新、Operationsを自動生成（新規 or 再利用）、手配課へ引き継ぎメール。
 * Q&A一巡目 C-9・G-17：方面・CPL旅行人数・列席旅行人数はここ（成約時）で確定させる。
 * 見積（Quotes）は撤去したため、商品・プラン・金額もここで初めて確定する。
 */
function caseService_registerContract_(caseId, contractInput, ctx) {
  contractInput.契約日 = contractInput.契約日 || formatDateISO_(new Date());
  validateContract_(contractInput);

  caseRepo_deactivateContractsByCaseId(caseId); // 既存Contractsの有効フラグをOFF
  const contractId = generateContractId();
  const contract = Object.assign({
    CONTRACT_ID: contractId,
    CASE_ID: caseId,
    契約担当: ctx.name || ctx.email,
    有効フラグ: true,
    売上: contractInput.売上 || caseService_calcContractRevenue_(contractInput)
  }, contractInput);
  caseRepo_insertContract(contract);

  caseRepo_updateById(caseId, { 案件状態: CASE_STATUS.CONTRACTED, 現在担当部署: '手配課' });

  // Operations自動生成／再利用
  operationService_createOrReuseOnContract(caseId, contract, ctx);

  const customer = customerRepo_getByCaseId(caseId);
  notifyHandoffToArrangement_(caseId, contract, customer);

  return contractId;
}

function caseService_calcContractRevenue_(c) {
  return (Number(c.旅行代金) || 0) + (Number(c.挙式代金) || 0) + (Number(c.衣装代金) || 0) + (Number(c.オプション) || 0);
}

/**
 * 未成約登録。LostCasesへLOST_ID新規採番で追加、Casesを「未成約」に更新、
 * 既存Operationsがあれば手配状態を「キャンセル」に更新しCXL日に未成約日を設定。
 * キャンセル登録（種別='キャンセル'）でも共通の構造を使う。
 */
function caseService_registerLostCase_(caseId, lostInput, kind, ctx) {
  const dateField = lostInput.未成約日 || formatDateISO_(new Date());
  const record = Object.assign({}, lostInput, { 未成約日: dateField });
  validateLostCase_(record);

  const lostId = generateLostId();
  caseRepo_insertLostCase(Object.assign({
    LOST_ID: lostId,
    CASE_ID: caseId,
    種別: kind === 'CANCEL' ? 'キャンセル' : '未成約',
    担当者: ctx.name || ctx.email
  }, record));

  if (kind === 'CANCEL') {
    caseRepo_updateById(caseId, { 案件状態: CASE_STATUS.CANCELLED });
  } else {
    caseRepo_updateById(caseId, { 案件状態: CASE_STATUS.LOST });
  }

  const existingOp = operationRepo_getByCaseId(caseId);
  if (existingOp) {
    operationService_markCancelled(caseId, dateField, ctx);
  }

  return lostId;
}

/* ---------- キャンセル登録（案件詳細の契約タブから） ---------- */

function caseService_cancelContract(input, ctx) {
  const caseRecord = caseRepo_getById(input.CASE_ID);
  if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');
  if (caseRecord.案件状態 !== CASE_STATUS.CONTRACTED && caseRecord.案件状態 !== CASE_STATUS.COMPLETED) {
    throw new AppError('VALIDATION', '成約済みの案件のみキャンセル登録できます。');
  }

  caseRepo_deactivateContractsByCaseId(input.CASE_ID);

  // LostCasesと同じ構造（カテゴリ＋自由記述）を流用して記録
  const lostId = caseService_registerLostCase_(input.CASE_ID, {
    未成約日: input.キャンセル日 || formatDateISO_(new Date()),
    未成約理由カテゴリ: input.未成約理由カテゴリ,
    未成約理由その他: input.未成約理由その他,
    競合会社ID: input.競合会社ID,
    '競合会社（自由記述）': input['競合会社（自由記述）'],
    詳細: input.詳細
  }, 'CANCEL', ctx);

  writeSystemLog_({ 実行者: ctx.email, 操作種別: 'CANCEL_CONTRACT', 対象CASE_ID: input.CASE_ID, 変更前後の値の要約: 'lostId=' + lostId });

  return { lostId: lostId };
}
