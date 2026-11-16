/**
 * caseMergeService.gs
 * 同じお客様の案件が2件できてしまった場合（例：スタッフが先に手動登録し、あとからカウンセリングシートの
 * 回答が届いた）に、1件にまとめる（結合）・片方を消す（削除）ための処理。
 *
 * 方針：
 *  ・結合は「残す案件」と「消す案件」を人が指定する。消す案件にひもづく記録（接客履歴・経過メモ・契約・
 *    未成約・手配・タスク等）は、すべて残す案件へ付け替えてから、消す案件の行を削除する。
 *    同じ項目が両方に入っている場合は残す案件の値を優先し、残す案件で空欄の項目だけ消す案件の値で埋める。
 *  ・削除は、案件と、それにひもづくすべての記録を消す。
 *  ・どちらも、消した行は必ず DeletedRecords シートに元の内容（JSON）を残す。誤操作でも手で戻せる。
 *  ・両方の案件に有効な成約がある、または両方に手配情報がある場合は、数字が二重になるのを避けるため
 *    結合しない（どちらかをキャンセル登録・確認してから結合してもらう）。
 */

/** 案件にひもづく（CASE_ID列を持つ）シート。1案件につき1行のものと、複数行のものに分けて扱う */
const CASE_MERGE_SINGLE_ROW_SHEETS_ = [
  SHEET_NAMES.CUSTOMERS, SHEET_NAMES.WEDDING_REQUESTS, SHEET_NAMES.PHOTO_REQUESTS, SHEET_NAMES.CASE_SUMMARY_MEMO
];
const CASE_MERGE_MULTI_ROW_SHEETS_ = [
  SHEET_NAMES.SALES_HISTORY, SHEET_NAMES.CASE_NOTES, SHEET_NAMES.CONTRACTS, SHEET_NAMES.LOST_CASES,
  SHEET_NAMES.OPERATIONS, SHEET_NAMES.OPERATION_HISTORY, SHEET_NAMES.OPERATION_MEMOS, SHEET_NAMES.TASKS,
  SHEET_NAMES.FORM_RESPONSES, SHEET_NAMES.SETTLEMENTS
];

/** 結合後の案件状態を決めるための進み具合（大きいほど先へ進んでいる） */
const CASE_STATUS_RANK_ = { 来店前: 0, 来店済: 1, 商談中: 2, 保留: 2, 未成約: 3, 成約: 4, キャンセル: 4, 完了: 5 };

/** 名前の比較用に、空白・全角半角の違いを無くす */
function caseMerge_normName_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[\s　]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
    .toLowerCase();
}

/**
 * 指定した案件と同じお客様と思われる、別の案件の一覧。
 * 判定：チャレンジ番号が同じ、または新郎・新婦の姓（漢字かカナ）の組み合わせが同じ。
 * @param {string} caseId
 * @param {Object} scope { storeId }：指定時はその店舗の案件だけを候補にする
 */
function caseMerge_findDuplicateCandidates(caseId, scope) {
  scope = scope || {};
  const cases = caseRepo_getAll();
  const target = cases.find(function (c) { return c.CASE_ID === caseId; });
  if (!target) return [];
  const customers = sheetToObjects_(getSheet_(SHEET_NAMES.CUSTOMERS));
  const customerByCaseId = {};
  customers.forEach(function (cu) { customerByCaseId[cu.CASE_ID] = cu; });

  function nameKeys(cu) {
    if (!cu) return [];
    const keys = [];
    const kanji = caseMerge_normName_(cu.新郎姓) + '|' + caseMerge_normName_(cu.新婦姓);
    if (caseMerge_normName_(cu.新郎姓) && caseMerge_normName_(cu.新婦姓)) keys.push(kanji);
    // カナは「姓 名」が1つの欄に入っているため、全体を比較する
    const kana = caseMerge_normName_(cu.新郎カナ) + '|' + caseMerge_normName_(cu.新婦カナ);
    if (caseMerge_normName_(cu.新郎カナ) && caseMerge_normName_(cu.新婦カナ)) keys.push('kana:' + kana);
    return keys;
  }

  const targetChallenge = String(target.チャレンジ番号 || '').trim();
  const targetKeys = nameKeys(customerByCaseId[caseId]);
  const storeById = {};
  storeRepo_getAll().forEach(function (s) { storeById[s.STORE_ID] = s; });

  const result = [];
  cases.forEach(function (c) {
    if (c.CASE_ID === caseId) return;
    if (scope.storeId && c.店舗ID !== scope.storeId) return;
    const reasons = [];
    if (targetChallenge && String(c.チャレンジ番号 || '').trim() === targetChallenge) reasons.push('チャレンジ番号が同じ');
    const keys = nameKeys(customerByCaseId[c.CASE_ID]);
    if (keys.some(function (k) { return targetKeys.indexOf(k) !== -1; })) reasons.push('新郎新婦の名前が同じ');
    if (reasons.length === 0) return;
    const cu = customerByCaseId[c.CASE_ID] || {};
    result.push({
      CASE_ID: c.CASE_ID,
      新郎姓名: [cu.新郎姓, cu.新郎名].filter(Boolean).join(' '),
      新婦姓名: [cu.新婦姓, cu.新婦名].filter(Boolean).join(' '),
      店舗名: storeById[c.店舗ID] ? storeById[c.店舗ID].店舗名 : c.店舗ID,
      登録経路: c.登録経路 || 'フォーム',
      受付日時: nippoService_isoDate_(c.受付日時),
      案件状態: c.案件状態,
      チャレンジ番号: c.チャレンジ番号,
      理由: reasons.join('・')
    });
  });
  return result;
}

/** 消す前の行を DeletedRecords に控える（1行＝元の1行） */
function caseMerge_backupRows_(sheetName, rows, op, caseId, keptCaseId, ctx) {
  if (!rows || rows.length === 0) return;
  const sheet = getOrCreateSheet_(SHEET_NAMES.DELETED_RECORDS, DELETED_RECORDS_HEADERS_);
  const now = new Date();
  const values = rows.map(function (r) {
    const copy = Object.assign({}, r);
    delete copy.__row;
    let json = JSON.stringify(copy);
    if (json.length > 45000) json = json.slice(0, 45000) + '…（長すぎるため省略）';
    return [now, ctx.email || '', op, caseId, keptCaseId || '', sheetName, json];
  });
  const headerMap = getHeaderMap_(sheet);
  const lastCol = sheet.getLastColumn();
  const ordered = values.map(function (v) {
    const row = new Array(lastCol).fill('');
    DELETED_RECORDS_HEADERS_.forEach(function (h, i) { if (h in headerMap) row[headerMap[h]] = v[i]; });
    return row;
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, ordered.length, lastCol).setValues(ordered);
}

function caseMerge_isBlank_(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** keepRowの空欄項目だけ、fromRowの値で埋めるための差分（キー列などexcludeKeysは除く） */
function caseMerge_fillBlanksPatch_(keepRow, fromRow, excludeKeys) {
  const patch = {};
  Object.keys(fromRow || {}).forEach(function (k) {
    if (k === '__row' || excludeKeys.indexOf(k) !== -1) return;
    if (caseMerge_isBlank_(keepRow[k]) && !caseMerge_isBlank_(fromRow[k])) patch[k] = fromRow[k];
  });
  return patch;
}

function caseMerge_isActiveContract_(ct) {
  return ct.有効フラグ === true || ct.有効フラグ === 'TRUE';
}

/** 2件の案件を結合する前の確認（結合できない理由があればエラーにする）。結合後の状態の元になる情報も返す */
function caseMerge_check_(keepId, removeId) {
  if (!keepId || !removeId) throw new AppError('VALIDATION', '残す案件と消す案件の両方を指定してください。');
  if (keepId === removeId) throw new AppError('VALIDATION', '同じ案件同士は結合できません。');
  const keep = caseRepo_getById(keepId);
  const remove = caseRepo_getById(removeId);
  if (!keep) throw new AppError('VALIDATION', '残す案件 ' + keepId + ' が見つかりません。');
  if (!remove) throw new AppError('VALIDATION', '消す案件 ' + removeId + ' が見つかりません。');

  const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS));
  const keepActive = contracts.filter(function (ct) { return ct.CASE_ID === keepId && caseMerge_isActiveContract_(ct); });
  const removeActive = contracts.filter(function (ct) { return ct.CASE_ID === removeId && caseMerge_isActiveContract_(ct); });
  if (keepActive.length > 0 && removeActive.length > 0) {
    throw new AppError('VALIDATION', '両方の案件に有効な成約があるため結合できません。成約が二重になっている場合は、' +
      'どちらかの案件で「キャンセル登録」をしてから結合するか、不要な方の案件を削除してください。');
  }
  const ops = operationRepo_getAll();
  const keepHasOp = ops.some(function (op) { return op.CASE_ID === keepId; });
  const removeHasOp = ops.some(function (op) { return op.CASE_ID === removeId; });
  if (keepHasOp && removeHasOp) {
    throw new AppError('VALIDATION', '両方の案件に手配情報があるため結合できません。手配課に確認のうえ、不要な方の案件を削除してください。');
  }
  return { keep: keep, remove: remove, keepHasActive: keepActive.length > 0, removeHasActive: removeActive.length > 0 };
}

/**
 * 2件の案件を1件に結合する。removeIdの記録をkeepIdへ付け替え、removeIdの案件行を削除する。
 * @return {Object} { keptCaseId, movedRows }
 */
function caseMerge_merge(keepId, removeId, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const info = caseMerge_check_(keepId, removeId);
    const keep = info.keep, remove = info.remove;
    let moved = 0;

    // 1. 1案件1行のシート（顧客・相談内容・案件メモ）：残す案件に行が無ければ付け替え、あれば空欄だけ埋めて消す
    CASE_MERGE_SINGLE_ROW_SHEETS_.forEach(function (sheetName) {
      const sheet = getSheet_(sheetName);
      const rows = sheetToObjects_(sheet);
      const keepRow = rows.find(function (r) { return r.CASE_ID === keepId; });
      const removeRows = rows.filter(function (r) { return r.CASE_ID === removeId; });
      if (removeRows.length === 0) return;
      if (!keepRow) {
        moved += repointCaseId_(sheet, removeId, keepId);
        return;
      }
      let patch;
      if (sheetName === SHEET_NAMES.CASE_SUMMARY_MEMO) {
        // 案件メモは人が書いた文章なので、両方に書かれていれば消さずに両方残す
        patch = {};
        CASE_SUMMARY_MEMO_FIELDS_FOR_MERGE_.forEach(function (f) {
          const a = keepRow[f], b = removeRows[0][f];
          if (caseMerge_isBlank_(b)) return;
          if (caseMerge_isBlank_(a)) patch[f] = b;
          else if (String(a) !== String(b)) patch[f] = String(a) + '\n---（結合した案件 ' + removeId + ' のメモ）---\n' + String(b);
        });
      } else {
        patch = caseMerge_fillBlanksPatch_(keepRow, removeRows[0], ['CASE_ID', 'CUSTOMER_ID']);
      }
      if (Object.keys(patch).length > 0) updateRowAtIndex_(sheet, keepRow.__row, patch);
      caseMerge_backupRows_(sheetName, removeRows, 'MERGE', removeId, keepId, ctx);
      deleteRows_(sheet, removeRows.map(function (r) { return r.__row; }));
    });

    // 2. 書類チェック（案件×項目で1行）：同じ項目は「どちらかでチェック済みならチェック済み」にまとめる
    (function () {
      const sheet = getSheet_(SHEET_NAMES.CASE_DOCUMENT_CHECKS);
      const rows = sheetToObjects_(sheet);
      const keepByItem = {};
      rows.filter(function (r) { return r.CASE_ID === keepId; }).forEach(function (r) { keepByItem[r.ITEM_ID] = r; });
      const toDelete = [];
      rows.filter(function (r) { return r.CASE_ID === removeId; }).forEach(function (r) {
        const k = keepByItem[r.ITEM_ID];
        if (!k) { updateRowAtIndex_(sheet, r.__row, { CASE_ID: keepId }); moved++; return; }
        const checked = (k.チェック済み === true || k.チェック済み === 'TRUE') || (r.チェック済み === true || r.チェック済み === 'TRUE');
        updateRowAtIndex_(sheet, k.__row, { チェック済み: checked });
        toDelete.push(r);
      });
      caseMerge_backupRows_(SHEET_NAMES.CASE_DOCUMENT_CHECKS, toDelete, 'MERGE', removeId, keepId, ctx);
      deleteRows_(sheet, toDelete.map(function (r) { return r.__row; }));
    })();

    // 3. 複数行のシート（接客履歴・経過メモ・契約・未成約・手配・タスク・フォーム受信ログ）はそのまま付け替える
    CASE_MERGE_MULTI_ROW_SHEETS_.forEach(function (sheetName) {
      const sheet = getDatabaseSpreadsheet_().getSheetByName(sheetName);
      if (sheet) moved += repointCaseId_(sheet, removeId, keepId);
    });

    // 4. 案件（Cases）の行：残す案件で空欄の項目を埋め、受付日時は早い方、案件状態は進んでいる方にそろえる
    const casePatch = caseMerge_fillBlanksPatch_(keep, remove,
      ['CASE_ID', 'CUSTOMER_ID', '登録経路', '案件状態', '現在担当部署', '受付日時', '作成日時', '更新日時']);
    const keepReceived = keep.受付日時 ? new Date(keep.受付日時) : null;
    const removeReceived = remove.受付日時 ? new Date(remove.受付日時) : null;
    if (removeReceived && !isNaN(removeReceived.getTime()) && (!keepReceived || isNaN(keepReceived.getTime()) || removeReceived < keepReceived)) {
      casePatch.受付日時 = remove.受付日時;
    }
    let statusSource = keep;
    if (info.removeHasActive && !info.keepHasActive) statusSource = remove;
    else if (!info.keepHasActive && (CASE_STATUS_RANK_[remove.案件状態] || 0) > (CASE_STATUS_RANK_[keep.案件状態] || 0)) statusSource = remove;
    if (statusSource === remove) {
      casePatch.案件状態 = remove.案件状態;
      casePatch.現在担当部署 = remove.現在担当部署;
    }
    if (caseMerge_isBlank_(keep.FORM_RESPONSE_ID) && !caseMerge_isBlank_(remove.FORM_RESPONSE_ID)) {
      casePatch.登録経路 = 'フォーム';
    }
    // 顧客行を付け替えた場合は、案件側のCUSTOMER_IDもそちらに合わせる
    const keepCustomer = customerRepo_getByCaseId(keepId);
    if (keepCustomer && keepCustomer.CUSTOMER_ID !== keep.CUSTOMER_ID) casePatch.CUSTOMER_ID = keepCustomer.CUSTOMER_ID;
    if (Object.keys(casePatch).length > 0) caseRepo_updateById(keepId, casePatch);

    // 5. 消す案件の行を控えてから削除
    const casesSheet = getSheet_(SHEET_NAMES.CASES);
    const removeRowIndex = findRowIndexByKey_(casesSheet, 'CASE_ID', removeId);
    caseMerge_backupRows_(SHEET_NAMES.CASES, [remove], 'MERGE', removeId, keepId, ctx);
    if (removeRowIndex !== -1) casesSheet.deleteRow(removeRowIndex);

    writeSystemLog_({
      実行者: ctx.email, 操作種別: 'MERGE_CASE', 対象CASE_ID: keepId,
      変更前後の値の要約: '案件 ' + removeId + ' を ' + keepId + ' に結合（付け替えた記録 ' + moved + '件。消した行の控えはDeletedRecords）'
    });
    return { keptCaseId: keepId, movedRows: moved };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 案件を削除する。案件と、それにひもづくすべての記録を消す（控えはDeletedRecordsに残す）。
 * @return {Object} { deletedRows }
 */
function caseMerge_deleteCase(caseId, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const caseRecord = caseRepo_getById(caseId);
    if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');
    let deleted = 0;
    const sheetNames = CASE_MERGE_SINGLE_ROW_SHEETS_.concat([SHEET_NAMES.CASE_DOCUMENT_CHECKS], CASE_MERGE_MULTI_ROW_SHEETS_);
    sheetNames.forEach(function (sheetName) {
      const sheet = getDatabaseSpreadsheet_().getSheetByName(sheetName);
      if (!sheet) return;
      const rows = sheetToObjects_(sheet).filter(function (r) { return r.CASE_ID === caseId; });
      if (rows.length === 0) return;
      caseMerge_backupRows_(sheetName, rows, 'DELETE', caseId, '', ctx);
      deleteRows_(sheet, rows.map(function (r) { return r.__row; }));
      deleted += rows.length;
    });
    const casesSheet = getSheet_(SHEET_NAMES.CASES);
    caseMerge_backupRows_(SHEET_NAMES.CASES, [caseRecord], 'DELETE', caseId, '', ctx);
    casesSheet.deleteRow(caseRecord.__row);
    deleted += 1;
    writeSystemLog_({
      実行者: ctx.email, 操作種別: 'DELETE_CASE', 対象CASE_ID: caseId,
      変更前後の値の要約: '案件と関連記録 計' + deleted + '行を削除（控えはDeletedRecords）'
    });
    return { deletedRows: deleted };
  } finally {
    lock.releaseLock();
  }
}

// 案件メモの見出し（setupDatabase.gsのCaseSummaryMemoの列と同じ）
const CASE_SUMMARY_MEMO_FIELDS_FOR_MERGE_ = ['CPLこんな方です', '時期', 'エリア', 'ゲスト・パーティー', '式場', '旅行',
  'お披露目・前撮り', 'TAVICA', '結果'];
