/**
 * dateUtil.gs
 * 日付計算ユーティリティ。第2章11-1章・第8章4章・7章の期限算出ルールをここに集約する。
 */

function addDays_(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween_(from, to) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const a = new Date(Utilities.formatDate(from, 'Asia/Tokyo', 'yyyy/MM/dd'));
  const b = new Date(Utilities.formatDate(to, 'Asia/Tokyo', 'yyyy/MM/dd'));
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * 'yyyy-MM-dd'形式の日付文字列をdeltaYears年分ずらす（前年同期間比較などに使う）。
 * 例：shiftYearIso_('2026-08-06', -1) => '2025-08-06'
 */
function shiftYearIso_(isoDateStr, deltaYears) {
  const d = new Date(isoDateStr + 'T00:00:00');
  d.setFullYear(d.getFullYear() + deltaYears);
  return formatDateISO_(d);
}

/**
 * 第2章11-1章：FNL日の目安＝挙式日（撮影日）の45日前。
 * 第13章（設定）で基準日数を変更可能にするため、Settingsシートの値があればそれを優先する。
 */
function calcFnlDate_(weddingOrShootDate) {
  if (!weddingOrShootDate) return null;
  const days = getSettingNumber_('FNL_DAYS_BEFORE', 45);
  return addDays_(new Date(weddingOrShootDate), -days);
}

/**
 * 納品予定日＝撮影日＋標準納品日数。
 * Q&A一巡目F-15で確定した実際のルール：
 *   ・通常は30日（既定値。プラン側で明示的に上書きしていない場合）
 *   ・60日は一部のプラン（式場・フォトプランのマスタ側で個別に設定）のみ
 * Q&A七巡目：手配課シートには「早期納品フラグ」という独立した項目は無く、早期納品などの
 * イレギュラー対応は備考欄（備考（早期納品有無等））に書き添える運用のため、本システムでも
 * 早期納品を専用フラグとして持たない。早期納品の場合は、算出された標準日ではなく、
 * 手配担当者が納品予定日欄へ直接正しい日付を入力し、備考にその旨を書き添える（第9章6章参照）。
 * @param {Date|string} weddingOrShootDate
 * @param {number=} planStandardDays 式場／フォトプランマスタの「標準納品日数」（未設定なら既定値を使う）
 */
function calcDeliveryDueDate_(weddingOrShootDate, planStandardDays) {
  if (!weddingOrShootDate) return null;
  const days = (planStandardDays !== undefined && planStandardDays !== null && planStandardDays !== '')
    ? Number(planStandardDays)
    : getSettingNumber_('DELIVERY_DAYS_NORMAL', 30);
  return addDays_(new Date(weddingOrShootDate), days);
}

/**
 * 第8章7章：本日がFNL日以降か（＝挙式日の45日前に到達／超過したか）を判定する。
 * FNL日自体が既に「挙式日-45日」として算出されているため、ここでは日数を足し引きしない。
 */
function isFnlReached_(fnlDate) {
  if (!fnlDate) return false;
  const today = new Date();
  return daysBetween_(new Date(fnlDate), today) >= 0;
}

/**
 * 第8章7章：納品予定日が「本日以降7日以内」または「超過」か。
 * 戻り値: 'OVERDUE' | 'WARNING' | null
 */
function deliveryAlertLevel_(deliveryDueDate) {
  if (!deliveryDueDate) return null;
  const days = daysBetween_(new Date(), new Date(deliveryDueDate)); // 今日から納品予定日までの日数
  if (days < 0) return 'OVERDUE';
  const warnDays = getSettingNumber_('DELIVERY_WARN_DAYS', 7);
  if (days <= warnDays) return 'WARNING';
  return null;
}

/* ============================================================
 * 期（会計期間）。期は11月始まりで、47期＝2026年11月〜2027年10月（期＝期の初月の年−1979）。
 * Settingsの FISCAL_START_MONTH・FISCAL_PERIOD_OFFSET で変えられる（既定 11・1979）。
 * ============================================================ */

function fiscalStartMonth_() {
  const m = Number(getSetting_('FISCAL_START_MONTH', 11));
  return m >= 1 && m <= 12 ? m : 11;
}

function fiscalPeriodOffset_() {
  const n = Number(getSetting_('FISCAL_PERIOD_OFFSET', 1979));
  return isNaN(n) ? 1979 : n;
}

/**
 * 日付が属する期の情報。
 * @return {Object} { period: 47, startYear: 2026, fromIso: '2026-11-01', toIso: '2027-10-31', months: ['2026-11', … '2027-10'] }
 */
function fiscalPeriodOf_(date) {
  const d = date ? new Date(date) : new Date();
  const sm = fiscalStartMonth_();
  const startYear = d.getMonth() + 1 >= sm ? d.getFullYear() : d.getFullYear() - 1;
  return fiscalPeriodByStartYear_(startYear);
}

function fiscalPeriodByStartYear_(startYear) {
  const sm = fiscalStartMonth_();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(startYear, sm - 1 + i, 1);
    months.push(d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2));
  }
  return {
    period: startYear - fiscalPeriodOffset_(),
    startYear: startYear,
    fromIso: months[0] + '-01',
    toIso: formatDateISO_(new Date(startYear + 1, sm - 1, 0)),
    months: months
  };
}

/** 今期の初日（'yyyy-MM-dd'）。期間を指定しない集計の既定の開始日に使う */
function fiscalPeriodStartIso_(date) {
  return fiscalPeriodOf_(date).fromIso;
}
