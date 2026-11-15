/**
 * taskController.gs
 * タスク系API。第6章4章：全ロールが呼べるが、スコープはロールごとに異なる
 * （STAFF・MANAGER＝OWN_STORE／ARRANGE＝OWN_TASK／HQ・ADMIN＝ALL）。
 */

function getTaskList() {
  try {
    const ctx = getCurrentUserContext();
    let rows = taskRepo_getAll();

    if (ctx.role === ROLES.STAFF || ctx.role === ROLES.MANAGER) {
      const caseByStore = caseRepo_getAll().filter(function (c) { return c.店舗ID === ctx.storeId; })
        .reduce(function (set, c) { set[c.CASE_ID] = true; return set; }, {});
      rows = rows.filter(function (t) { return caseByStore[t.CASE_ID]; });
    } else if (ctx.role === ROLES.ARRANGE) {
      rows = rows.filter(function (t) { return t.担当者 === ctx.name || t.担当者 === ctx.email; });
    }
    // HQ・ADMIN＝ALL
    return { ok: true, data: rows };
  } catch (e) {
    return handleControllerError_(e, 'getTaskList');
  }
}

function saveTask(input) {
  try {
    const ctx = getCurrentUserContext();
    requireRole_(ctx, [ROLES.STAFF, ROLES.MANAGER, ROLES.HQ, ROLES.ARRANGE, ROLES.ADMIN]);

    if (ctx.role === ROLES.ARRANGE && input.TASK_ID) {
      const sheet = getSheet_(SHEET_NAMES.TASKS);
      const rowIndex = findRowIndexByKey_(sheet, 'TASK_ID', input.TASK_ID);
      if (rowIndex !== -1) {
        const existing = getRowAsObject_(sheet, rowIndex);
        if (existing.担当者 !== ctx.name && existing.担当者 !== ctx.email) throw permissionDeniedError_();
      }
    }
    if ((ctx.role === ROLES.STAFF || ctx.role === ROLES.MANAGER) && input.CASE_ID) {
      const c = caseRepo_getById(input.CASE_ID);
      if (c && c.店舗ID !== ctx.storeId) throw permissionDeniedError_();
    }

    if (input.TASK_ID) {
      // 状態が「完了」に変わったタイミングで完了日を自動セットする（未設定のままにしないためのバグ修正）
      if (input.状態 === '完了' && !input.完了日) input.完了日 = formatDateISO_(new Date());
      taskRepo_updateById(input.TASK_ID, input);
    } else {
      input.TASK_ID = generateTaskId();
      input.担当部署 = input.担当部署 || (ctx.role === ROLES.ARRANGE ? '手配課' : (ctx.role === ROLES.HQ ? '本部' : '販売店'));
      input.状態 = input.状態 || '未着手';
      taskRepo_insert(input);
    }
    writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_TASK', 対象CASE_ID: input.CASE_ID || '', 変更前後の値の要約: input.TASK_ID });
    return { ok: true, data: { taskId: input.TASK_ID } };
  } catch (e) {
    return handleControllerError_(e, 'saveTask');
  }
}
