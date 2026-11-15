/**
 * idGenerator.gs
 * 各種ID（CASE_ID・CONTRACT_ID・LOST_ID・HISTORY_ID・TASK_ID等）の採番を担当する。
 * 第8章1章: CASE_IDの形式は "CASE-YYYYMMDD-000001" とする。
 * 同時実行による採番衝突を防ぐため、LockServiceで排他制御を行う（第9章4章：同時書き込みの競合対策）。
 */

/**
 * CASE_IDを新規採番する（形式：CASE-YYYYMMDD-000001。第8章1章）。
 * 当日分の連番を、Casesシートの既存CASE_IDから走査して決定する。
 */
function generateCaseId() {
  return withIdLock_(function () {
    const today = formatDateYYYYMMDD_(new Date());
    const prefix = 'CASE-' + today + '-';
    const sheet = getSheet_(SHEET_NAMES.CASES);
    const existingIds = getColumnValues_(sheet, 'CASE_ID');
    let maxSeq = 0;
    existingIds.forEach(function (id) {
      if (typeof id === 'string' && id.indexOf(prefix) === 0) {
        const seq = parseInt(id.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
    const next = maxSeq + 1;
    return prefix + Utilities.formatString('%06d', next);
  });
}

/**
 * 汎用の連番付きID採番（CUSTOMER_ID・CONTRACT_ID・LOST_ID・HISTORY_ID・TASK_ID等）。
 * prefixIdの後ろに全体連番6桁を付与する（例：CONTRACT-000001）。
 */
function generateSequentialId_(sheetName, columnName, prefix) {
  return withIdLock_(function () {
    const sheet = getSheet_(sheetName);
    const existingIds = getColumnValues_(sheet, columnName);
    let maxSeq = 0;
    existingIds.forEach(function (id) {
      if (typeof id === 'string' && id.indexOf(prefix + '-') === 0) {
        const seq = parseInt(id.substring(prefix.length + 1), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
    const next = maxSeq + 1;
    return prefix + '-' + Utilities.formatString('%06d', next);
  });
}

function generateCustomerId() {
  return generateSequentialId_(SHEET_NAMES.CUSTOMERS, 'CUSTOMER_ID', 'CUST');
}

function generateHistoryId() {
  return generateSequentialId_(SHEET_NAMES.SALES_HISTORY, 'HISTORY_ID', 'SH');
}

function generateContractId() {
  return generateSequentialId_(SHEET_NAMES.CONTRACTS, 'CONTRACT_ID', 'CTR');
}

function generateLostId() {
  return generateSequentialId_(SHEET_NAMES.LOST_CASES, 'LOST_ID', 'LOST');
}

function generateOperationHistoryId() {
  return generateSequentialId_(SHEET_NAMES.OPERATION_HISTORY, 'HISTORY_ID', 'OH');
}

function generateTaskId() {
  return generateSequentialId_(SHEET_NAMES.TASKS, 'TASK_ID', 'TASK');
}

/**
 * ID採番処理をLockServiceで排他制御しながら実行する共通ラッパー。
 * 第9章4章：Operations・Casesなど複数人が同時に更新しうるシートは、更新直前にLockServiceでロックを取得する。
 */
function withIdLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
