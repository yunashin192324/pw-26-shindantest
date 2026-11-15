/**
 * caseController.gs
 * 案件系APIの受け口。第6章4章の権限ルールをここで判定し、通ればserviceを呼ぶだけに留める
 * （業務ロジックは書かない。第7章2章）。
 * クライアント（HTML Service側）からは google.script.run.getCaseList() のように直接呼び出す。
 */

/** 第6章4章：getCaseList */
function getCaseList() {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);

    let scope;
    if (ctx.role === ROLES.STAFF || ctx.role === ROLES.MANAGER) {
      scope = { type: SCOPES.OWN_STORE, storeId: ctx.storeId };
    } else if (ctx.role === ROLES.ARRANGE) {
      scope = { type: SCOPES.ALL, contractedOnly: true };
    } else {
      scope = { type: SCOPES.ALL };
    }
    const list = caseService_listCases(scope);
    return { ok: true, data: list };
  } catch (e) {
    return handleControllerError_(e, 'getCaseList');
  }
}

/** 第6章4章：getCaseDetail（実装上の注意：一覧に出てこないから安全、ではなく必ず再チェックする） */
function getCaseDetail(caseId) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);

    const detail = caseService_getCaseDetail(caseId);
    if (!detail) throw new AppError('VALIDATION', '案件が見つかりません。');

    if (ctx.role === ROLES.STAFF || ctx.role === ROLES.MANAGER) {
      if (detail.caseRecord.店舗ID !== ctx.storeId) throw permissionDeniedError_();
    } else if (ctx.role === ROLES.ARRANGE) {
      const contractedStatuses = ['成約', '完了', 'キャンセル'];
      if (contractedStatuses.indexOf(detail.caseRecord.案件状態) === -1) throw permissionDeniedError_();
    }
    // HQ・ADMIN = ALL

    detail.menuVisibility = getMenuVisibility_(ctx.role);
    detail.currentRole = ctx.role;
    return { ok: true, data: detail };
  } catch (e) {
    return handleControllerError_(e, 'getCaseDetail');
  }
}

/** 第6章4章：saveSalesHistory（STAFF・MANAGER・HQ・ADMIN、OWN_STORE） */
function saveSalesHistory(input) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, input.CASE_ID);

    input.担当 = input.担当 || ctx.name || ctx.email;
    const result = caseService_saveSalesHistory(input, ctx);
    return { ok: true, data: result };
  } catch (e) {
    return handleControllerError_(e, 'saveSalesHistory');
  }
}

/**
 * 成約登録・未成約登録・保留は、以前は接客記録の「結果」欄から自動的に行われていたが、
 * 実際の接客履歴シートにその仕組みが無いため、独立した操作に分離した（Q&A九巡目）。
 */
function registerContract(caseId, contractInput) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, caseId);
    const result = caseService_registerContract(caseId, contractInput, ctx);
    return { ok: true, data: result };
  } catch (e) {
    return handleControllerError_(e, 'registerContract');
  }
}

function registerLostCase(caseId, lostInput) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, caseId);
    const result = caseService_registerLostCase(caseId, lostInput, ctx);
    return { ok: true, data: result };
  } catch (e) {
    return handleControllerError_(e, 'registerLostCase');
  }
}

function markCaseOnHold(caseId) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, caseId);
    caseService_markOnHold(caseId, ctx);
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'markCaseOnHold');
  }
}

/** 案件メモ（CaseSummaryMemo。構造化・1案件1行。Q&A九巡目） */
function saveCaseSummaryMemo(input) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, input.CASE_ID);
    caseService_saveSummaryMemo(input, ctx);
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'saveCaseSummaryMemo');
  }
}

/** 書類チェックリストのチェック状態をトグルする（Q&A九巡目） */
function toggleDocumentCheck(caseId, itemId, checked) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, caseId);
    caseService_toggleDocumentCheck(caseId, itemId, checked, ctx);
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'toggleDocumentCheck');
  }
}

/**
 * createCase：フォームを介さない新規問い合わせ（電話・飛び込み来店等）の手動登録。
 * Q&A一巡目 A-1・B-6で確定。STAFF・MANAGER・HQ・ADMIN、OWN_STORE
 * （ARRANGEは成約案件のみ扱うため対象外）。
 */
function createCase(input) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    if ((ctx.role === ROLES.STAFF || ctx.role === ROLES.MANAGER) && input.店舗ID !== ctx.storeId) {
      throw permissionDeniedError_();
    }
    const result = caseService_createManualCase(input, ctx);
    return { ok: true, data: result };
  } catch (e) {
    return handleControllerError_(e, 'createCase');
  }
}

/** 案件の基本情報（チャレンジ番号等）の後からの編集。作成時と同じ権限モデル */
function updateCaseCore(caseId, patch) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, caseId);
    caseService_updateCaseCore(caseId, patch, ctx);
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'updateCaseCore');
  }
}

/**
 * 同じお客様と思われる案件の候補一覧（重複した案件の結合用）。
 * STAFF・MANAGERは自店舗の案件のみ、HQ・ADMINは全店舗から探す。
 */
function findDuplicateCases(caseId) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, caseId);
    const scope = (ctx.role === ROLES.STAFF || ctx.role === ROLES.MANAGER) ? { storeId: ctx.storeId } : {};
    return { ok: true, data: caseMerge_findDuplicateCandidates(caseId, scope) };
  } catch (e) {
    return handleControllerError_(e, 'findDuplicateCases');
  }
}

/**
 * 重複した案件の結合（removeCaseIdの記録をkeepCaseIdへ移し、removeCaseIdを消す）。
 * データを消す操作のため、店長（MANAGER・自店舗の案件同士のみ）と本部・管理者（HQ・ADMIN）に限る。
 */
function mergeCases(keepCaseId, removeCaseId) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, keepCaseId);
    assertOwnStoreForCase_(ctx, removeCaseId);
    return { ok: true, data: caseMerge_merge(keepCaseId, removeCaseId, ctx) };
  } catch (e) {
    return handleControllerError_(e, 'mergeCases');
  }
}

/** 案件の削除（関連する記録もすべて消す。控えはDeletedRecordsに残る）。MANAGER（自店舗）・HQ・ADMINのみ */
function deleteCase(caseId) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, caseId);
    return { ok: true, data: caseMerge_deleteCase(caseId, ctx) };
  } catch (e) {
    return handleControllerError_(e, 'deleteCase');
  }
}

/**
 * 経過メモ（CaseNotes）：後日の電話対応など、正式な接客記録ではない経過をいつでも追記できる。
 * 当該店舗のスタッフ（STAFF・MANAGER）・本部（HQ・ADMIN）が閲覧・追記できる（Q&A一巡目A-1）。
 */
function getCaseNotes(caseId) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, caseId);
    return { ok: true, data: caseRepo_getCaseNotesByCaseId(caseId) };
  } catch (e) {
    return handleControllerError_(e, 'getCaseNotes');
  }
}

function addCaseNote(caseId, content) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, caseId);
    caseService_addCaseNote(caseId, content, ctx);
    return { ok: true };
  } catch (e) {
    return handleControllerError_(e, 'addCaseNote');
  }
}

/** 第6章4章：cancelContract（STAFF・MANAGER・HQ・ADMIN、OWN_STORE） */
function cancelContract(input) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ADMIN]);
    assertOwnStoreForCase_(ctx, input.CASE_ID);

    const result = caseService_cancelContract(input, ctx);
    return { ok: true, data: result };
  } catch (e) {
    return handleControllerError_(e, 'cancelContract');
  }
}

/**
 * 過去アーカイブが存在する年の一覧（Q&A六巡目：案件一覧「過去」タブの年セレクタ用）。
 * 全ロールが呼べるが、案件一覧そのものと同様、返る中身はgetCaseArchiveList側でスコープする。
 */
function getCaseArchiveYears() {
  try {
    getCurrentUserContext();
    return { ok: true, data: archiveService_listArchiveYears() };
  } catch (e) {
    return handleControllerError_(e, 'getCaseArchiveYears');
  }
}

/**
 * 指定年の案件過去一覧（アーカイブ済み。参照専用）。
 * STAFF・MANAGER＝自店舗のみ（店舗用の過去一覧）／HQ・ARRANGE・ADMIN＝全国。
 */
function getCaseArchiveList(year) {
  try {
    const ctx = getCurrentUserContext();
    let scope = {};
    if (ctx.role === ROLES.STAFF || ctx.role === ROLES.MANAGER) scope = { storeId: ctx.storeId };
    return { ok: true, data: archiveService_getCaseArchiveList(year, scope) };
  } catch (e) {
    return handleControllerError_(e, 'getCaseArchiveList');
  }
}

/**
 * OWN_STORE共通チェック：対象CASE_IDが自店舗のものかをサーバー側で都度再確認する（第6章4章の実装上の注意）。
 * HQ・ADMINはALLのため店舗チェックをスキップする。
 */
function assertOwnStoreForCase_(ctx, caseId) {
  if (ctx.role === ROLES.HQ || ctx.role === ROLES.ADMIN) return;
  const caseRecord = caseRepo_getById(caseId);
  if (!caseRecord) throw new AppError('VALIDATION', '案件が見つかりません。');
  if (caseRecord.店舗ID !== ctx.storeId) throw permissionDeniedError_();
}
