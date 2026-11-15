/**
 * customerRepository.gs
 * Customers（顧客情報）シートへの読み書きを担当する。
 */

function customerRepo_insert(obj) {
  appendRowFromObject_(getSheet_(SHEET_NAMES.CUSTOMERS), obj);
  return obj.CUSTOMER_ID;
}

function customerRepo_getByCaseId(caseId) {
  const rows = sheetToObjects_(getSheet_(SHEET_NAMES.CUSTOMERS));
  return rows.find(function (r) { return r.CASE_ID === caseId; }) || null;
}

function customerRepo_getById(customerId) {
  const sheet = getSheet_(SHEET_NAMES.CUSTOMERS);
  const rowIndex = findRowIndexByKey_(sheet, 'CUSTOMER_ID', customerId);
  return rowIndex === -1 ? null : getRowAsObject_(sheet, rowIndex);
}

function customerRepo_updateById(customerId, patch) {
  updateRowByKey_(getSheet_(SHEET_NAMES.CUSTOMERS), 'CUSTOMER_ID', customerId, patch);
}

/**
 * 第1章6-1章・第3章4章N-02：新婦住所が「同上」等の場合、新郎住所を複写する正規化。
 * 「同上」「〃」「同じ」等の表記ゆれに対応する（第3章7章で確定した複数パターン対応）。
 */
function normalizeBrideAddress_(groomAddress, brideAddressRaw) {
  const sameAsAbovePatterns = ['同上', '〃', '同じ', 'おなじ', 'ドウジョウ'];
  const trimmed = (brideAddressRaw || '').toString().trim();
  if (sameAsAbovePatterns.indexOf(trimmed) !== -1) {
    return groomAddress || '';
  }
  return brideAddressRaw;
}
