/**
 * dashboardService.gs
 * ダッシュボードのKPI計算式・集計ロジックを担当する。
 * 集計は「案件」ではなく「出来事（イベント）」を基準に、それが起きた日付でカウントする
 * （来店＝Casesの受付日時、成約＝Contractsの契約日、未成約／キャンセル＝LostCasesの未成約日、
 * 保留＝Casesの更新日時）。
 *
 * v2（Q&A一巡目G-17）：AGTシェア・方面シェア・方面内ランキング（式場／プラン／AGT）・
 * 月別方面別の予約パイプライン（当年・前年・目標比較）・地方×区分（一般／AVA）マトリクスを追加。
 * 売上は登録しない方針のため、KPIとしては表示しない（Contracts.売上列自体は内部的に残置）。
 * 前年（本システム稼働前）の実績は HistoricalActuals（店長・本部が遡及入力）で補う。
 */

/**
 * ダッシュボード集計バッチ処理フロー（毎日深夜）。
 * 前日までのCases・Contracts・LostCasesを、店舗・地方・区分・方面・商品別に集計し、
 * AnalyticsCacheへ洗い替えで書き込む。
 */
function batchRebuildAnalyticsCache() {
  try {
    const cases = caseRepo_getAll();
    const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS));
    const lostCases = caseRepo_getAllLostCases();
    const storeById = {};
    storeRepo_getAll().forEach(function (s) { storeById[s.STORE_ID] = s; });
    const areaByName = {};
    areaRepo_getAll().forEach(function (a) { areaByName[a.方面名] = a.AREA_ID; });

    // 日付ごとの集計バケツを作る。キー = 集計日|店舗ID|地方|区分|方面ID|商品ID
    const buckets = {};
    function bucket(dateStr, storeId, product, areaName) {
      const store = storeId ? storeById[storeId] : null;
      const region = store ? store.地方 : '';
      const category = store ? store.区分 : '';
      const areaId = areaByName[areaName] || '';
      const key = [dateStr, storeId || '', region || '', category || '', areaId || '', product || ''].join('|');
      if (!buckets[key]) {
        buckets[key] = {
          集計日: dateStr, 店舗ID: storeId || '', 地方: region || '', 区分: category || '', 方面ID: areaId || '', 商品ID: product || '',
          来店数: 0, 成約数: 0, 未成約数: 0, キャンセル数: 0, 保留数: 0
        };
      }
      return buckets[key];
    }

    cases.forEach(function (c) {
      if (!c.受付日時) return;
      const d = formatDateISO_(c.受付日時);
      bucket(d, c.店舗ID, '', '').来店数 += 1;
      if (c.案件状態 === '保留') {
        const hd = formatDateISO_(c.更新日時 || c.受付日時);
        bucket(hd, c.店舗ID, '', '').保留数 += 1;
      }
    });

    const caseById = {};
    cases.forEach(function (c) { caseById[c.CASE_ID] = c; });

    contracts.forEach(function (ct) {
      if (!ct.契約日) return;
      const c = caseById[ct.CASE_ID];
      const storeId = c ? c.店舗ID : '';
      const d = formatDateISO_(ct.契約日);
      bucket(d, storeId, ct.商品, ct.方面).成約数 += 1;
    });

    lostCases.forEach(function (lc) {
      if (!lc.未成約日) return;
      const c = caseById[lc.CASE_ID];
      const storeId = c ? c.店舗ID : '';
      const d = formatDateISO_(lc.未成約日);
      const b = bucket(d, storeId, '', '');
      if (lc.種別 === 'キャンセル') b.キャンセル数 += 1; else b.未成約数 += 1;
    });

    const rows = Object.keys(buckets).map(function (k) {
      const b = buckets[k];
      b.最終更新日時 = new Date();
      return b;
    });
    analyticsCacheRepo_replaceAll(rows);
  } catch (e) {
    notifyBatchFailure_('ダッシュボード集計バッチ', String(e && e.message ? e.message : e));
  }
}

/** from〜to（'yyyy-MM-dd'）が含む年月（'yyyy-MM'）の一覧を返す */
function dashboardService_monthsBetween_(fromIso, toIso) {
  const months = [];
  const start = new Date(fromIso + 'T00:00:00');
  const end = new Date(toIso + 'T00:00:00');
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push(Utilities.formatDate(cur, 'Asia/Tokyo', 'yyyy-MM'));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

/**
 * フィルタ（期間・店舗・地方・区分・商品）を受け取り、サマリーKPIを計算して返す。
 * 来店数・成約数には前年同期間との比較（前年実数・前年比%）も添える（Q&A五巡目）。
 * 期間未指定時は「今年（1/1〜本日）」を既定期間とする（前年比較を成立させるため。方面内ランキング等と同じ既定ルール）。
 * @param {Object} filter { from, to, storeId, region, category, product }
 */
function dashboardService_getData(filter) {
  filter = filter || {};
  const now = new Date();
  const periodFrom = filter.from || formatDateISO_(new Date(now.getFullYear(), 0, 1));
  const periodTo = filter.to || formatDateISO_(now);
  const prevFrom = shiftYearIso_(periodFrom, -1);
  const prevTo = shiftYearIso_(periodTo, -1);

  const allRows = analyticsCacheRepo_getAll();
  function filterRows_(list, from, to) {
    return list.filter(function (r) {
      if (from && r.集計日 < from) return false;
      if (to && r.集計日 > to) return false;
      if (filter.storeId && r.店舗ID !== filter.storeId) return false;
      if (filter.region && r.地方 !== filter.region) return false;
      if (filter.category && r.区分 !== filter.category) return false;
      if (filter.product && r.商品ID !== filter.product) return false;
      return true;
    });
  }
  const rows = filterRows_(allRows, periodFrom, periodTo);
  const prevRows = filterRows_(allRows, prevFrom, prevTo);

  const summary = rows.reduce(function (acc, r) {
    acc.来店数 += Number(r.来店数) || 0;
    acc.成約数 += Number(r.成約数) || 0;
    acc.未成約数 += Number(r.未成約数) || 0;
    acc.キャンセル数 += Number(r.キャンセル数) || 0;
    acc.保留数 += Number(r.保留数) || 0;
    return acc;
  }, { 来店数: 0, 成約数: 0, 未成約数: 0, キャンセル数: 0, 保留数: 0 });

  // 成約率＝成約数 ÷（成約数＋未成約数）。保留・商談中は含めない
  const denom = summary.成約数 + summary.未成約数;
  summary.成約率 = denom > 0 ? Math.round((summary.成約数 / denom) * 1000) / 10 : null;

  // 前年同期間比較。AnalyticsCacheは本システム稼働後のみ蓄積されるため、稼働前の月はHistoricalActuals
  // （遡及入力された月次実績）で補う（月別・方面別 積み上げと同じ考え方。Q&A五巡目）。
  const prevMonths = dashboardService_monthsBetween_(prevFrom, prevTo);
  const analyticsMonthsWithData = {};
  prevRows.forEach(function (r) { analyticsMonthsWithData[String(r.集計日).slice(0, 7)] = true; });
  const historical = historicalActualsRepo_getAll().filter(function (h) {
    if (filter.storeId && h.店舗ID !== filter.storeId) return false;
    if (filter.region) { const s = storeRepo_getById(h.店舗ID); if (!s || s.地方 !== filter.region) return false; }
    return true;
  });
  let prevVisits = 0, prevContracts = 0, hasPrevData = false;
  prevMonths.forEach(function (ym) {
    if (analyticsMonthsWithData[ym]) {
      hasPrevData = true;
      prevRows.filter(function (r) { return String(r.集計日).slice(0, 7) === ym; }).forEach(function (r) {
        prevVisits += Number(r.来店数) || 0; prevContracts += Number(r.成約数) || 0;
      });
    } else {
      const monthHistorical = historical.filter(function (h) { return h.年月 === ym; });
      if (monthHistorical.length > 0) hasPrevData = true;
      monthHistorical.forEach(function (h) {
        prevVisits += Number(h.来店数) || 0; prevContracts += Number(h.成約数) || 0;
      });
    }
  });
  summary.来店数前年 = hasPrevData ? prevVisits : null;
  summary.来店数前年比 = hasPrevData && prevVisits > 0 ? Math.round((summary.来店数 / prevVisits) * 1000) / 10 : null;
  summary.成約数前年 = hasPrevData ? prevContracts : null;
  summary.成約数前年比 = hasPrevData && prevContracts > 0 ? Math.round((summary.成約数 / prevContracts) * 1000) / 10 : null;

  const trend = dashboardService_buildTrend_(rows);
  const byStore = dashboardService_groupBy_(rows, '店舗ID');
  const byRegion = dashboardService_groupBy_(rows, '地方');
  const byCategory = dashboardService_groupBy_(rows, '区分');
  const byProduct = dashboardService_groupBy_(rows, '商品ID');
  const lostReasonBreakdown = dashboardService_lostReasonBreakdown_(Object.assign({}, filter, { from: periodFrom, to: periodTo }));
  const lastUpdated = rows.reduce(function (max, r) { return (!max || r.最終更新日時 > max) ? r.最終更新日時 : max; }, null);

  return {
    summary: summary, trend: trend, byStore: byStore, byRegion: byRegion, byCategory: byCategory, byProduct: byProduct,
    lostReasonBreakdown: lostReasonBreakdown, lastUpdated: lastUpdated,
    periodFrom: periodFrom, periodTo: periodTo, prevPeriodFrom: prevFrom, prevPeriodTo: prevTo
  };
}

function dashboardService_buildTrend_(rows) {
  const byDate = {};
  rows.forEach(function (r) {
    if (!byDate[r.集計日]) byDate[r.集計日] = { date: r.集計日, 来店数: 0, 成約数: 0, 未成約数: 0 };
    byDate[r.集計日].来店数 += Number(r.来店数) || 0;
    byDate[r.集計日].成約数 += Number(r.成約数) || 0;
    byDate[r.集計日].未成約数 += Number(r.未成約数) || 0;
  });
  return Object.values(byDate).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

function dashboardService_groupBy_(rows, keyField) {
  const map = {};
  rows.forEach(function (r) {
    const key = r[keyField] || '未設定';
    if (!map[key]) map[key] = { key: key, 来店数: 0, 成約数: 0 };
    map[key].来店数 += Number(r.来店数) || 0;
    map[key].成約数 += Number(r.成約数) || 0;
  });
  return Object.values(map).sort(function (a, b) { return b.成約数 - a.成約数; });
}

/** 未成約理由の内訳（LostCasesを未成約理由カテゴリでグルーピング） */
function dashboardService_lostReasonBreakdown_(filter) {
  // バグ修正：以前はstoreId/regionでの絞り込みが抜けており、STAFF・MANAGERが自店舗ダッシュボードを
  // 見ていても全店舗合算の未成約理由が表示されていた。他のパネルと同じくスコープを効かせる。
  const caseById = {};
  caseRepo_getAll().forEach(function (c) { caseById[c.CASE_ID] = c; });
  const lostCases = caseRepo_getAllLostCases().filter(function (lc) { return lc.種別 === '未成約'; });
  const map = {};
  lostCases.forEach(function (lc) {
    if (filter.from && lc.未成約日 < filter.from) return;
    if (filter.to && lc.未成約日 > filter.to) return;
    const c = caseById[lc.CASE_ID];
    if (filter.storeId) { if (!c || c.店舗ID !== filter.storeId) return; }
    if (filter.region) { if (!c) return; const s = storeRepo_getById(c.店舗ID); if (!s || s.地方 !== filter.region) return; }
    const key = lc.未成約理由カテゴリ || '未設定';
    map[key] = (map[key] || 0) + 1;
  });
  return Object.keys(map).map(function (k) { return { category: k, count: map[k] }; });
}

/* ============================================================
 * 新規問合せの媒体別比率（Q&A一巡目G-18：Cases.媒体＝カウンセリングシート項目18の回答を流用）
 * ============================================================ */
function dashboardService_getMediaBreakdown(filter, scope) {
  let rows = caseRepo_getAll();
  if (scope.storeId) rows = rows.filter(function (r) { return r.店舗ID === scope.storeId; });
  // バグ修正：地方（region）スコープが未対応だったため追加（他の集計関数と同じ扱いに統一）
  if (scope.region) rows = rows.filter(function (r) { const s = storeRepo_getById(r.店舗ID); return s && s.地方 === scope.region; });
  const map = {};
  rows.forEach(function (r) {
    const d = formatDateISO_(r.受付日時);
    if (filter.from && d < filter.from) return;
    if (filter.to && d > filter.to) return;
    const key = r.媒体 || '未分類';
    map[key] = (map[key] || 0) + 1;
  });
  return Object.keys(map).map(function (k) { return { media: k, count: map[k] }; });
}

/* ============================================================
 * Contractsの共通スコープ絞り込み（店舗フィルタ・期間フィルタ）
 * ============================================================ */
function dashboardService_scopedContracts_(filter, scope) {
  let rows = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS)).filter(function (r) { return r.有効フラグ === true || r.有効フラグ === 'TRUE'; });
  const caseById = {};
  caseRepo_getAll().forEach(function (c) { caseById[c.CASE_ID] = c; });
  rows = rows.map(function (r) { r.__case = caseById[r.CASE_ID]; return r; }).filter(function (r) { return r.__case; });
  if (scope.storeId) rows = rows.filter(function (r) { return r.__case.店舗ID === scope.storeId; });
  if (scope.region) rows = rows.filter(function (r) { const s = storeRepo_getById(r.__case.店舗ID); return s && s.地方 === scope.region; });
  if (filter.from) rows = rows.filter(function (r) { return r.契約日 >= filter.from; });
  if (filter.to) rows = rows.filter(function (r) { return r.契約日 <= filter.to; });
  if (filter.area) rows = rows.filter(function (r) { return r.方面 === filter.area; });
  return rows;
}

/** AGTシェア（現地手配会社の成約シェア）。filter.area指定時はその方面内のシェアになる（Q&A一巡目G-17） */
function dashboardService_getAgtShare(filter, scope) {
  const rows = dashboardService_scopedContracts_(filter, scope);
  const map = {};
  rows.forEach(function (r) { const k = r.現地会社 || '未設定'; map[k] = (map[k] || 0) + 1; });
  return Object.keys(map).map(function (k) { return { label: k, count: map[k] }; }).sort(function (a, b) { return b.count - a.count; });
}

/** 方面別シェア（全体の成約のうち各方面が占める割合） */
function dashboardService_getAreaShare(filter, scope) {
  const rows = dashboardService_scopedContracts_(Object.assign({}, filter, { area: undefined }), scope);
  const map = {};
  rows.forEach(function (r) { const k = r.方面 || '未設定'; map[k] = (map[k] || 0) + 1; });
  return Object.keys(map).map(function (k) { return { label: k, count: map[k] }; }).sort(function (a, b) { return b.count - a.count; });
}

/**
 * 方面内ランキング（式場・フォトプラン・AGT）。前年の実数値・前年比%も添える（Q&A四巡目）。
 * 「前年」は前年の実データ（Contracts）から拾う。期間未指定の場合は「今年（1/1〜本日）」を既定期間とし、
 * その1年前の同じ期間（契約日ベース）と比較する。
 * フォトプランランキングは「プランランキング」ではなく、フォトウェディング（相談区分＝フォト）の
 * 契約のみに絞ったプラン別ランキングとする（Q&A五巡目）。式場・AGTランキングは挙式・フォト両方を含む。
 */
function dashboardService_getAreaRankings(area, filter, scope) {
  filter = filter || {};
  const now = new Date();
  const periodFrom = filter.from || formatDateISO_(new Date(now.getFullYear(), 0, 1));
  const periodTo = filter.to || formatDateISO_(now);
  const prevFrom = shiftYearIso_(periodFrom, -1);
  const prevTo = shiftYearIso_(periodTo, -1);

  const rows = dashboardService_scopedContracts_(Object.assign({}, filter, { area: area, from: periodFrom, to: periodTo }), scope);
  const prevRows = dashboardService_scopedContracts_(Object.assign({}, filter, { area: area, from: prevFrom, to: prevTo }), scope);
  const photoRows = rows.filter(function (r) { return r.__case && r.__case.相談区分 === 'フォト'; });
  const photoPrevRows = prevRows.filter(function (r) { return r.__case && r.__case.相談区分 === 'フォト'; });

  function rank(list, prevList, field) {
    const map = {};
    list.forEach(function (r) { const k = r[field] || '未設定'; map[k] = (map[k] || 0) + 1; });
    const prevMap = {};
    prevList.forEach(function (r) { const k = r[field] || '未設定'; prevMap[k] = (prevMap[k] || 0) + 1; });
    // 今期に実績が無く前年のみ実績がある項目も一覧できるよう、両方のキーを合わせて並べる
    const allKeys = Object.keys(Object.assign({}, map, prevMap));
    return allKeys.map(function (k) {
      const count = map[k] || 0;
      const prevCount = prevMap[k] || 0;
      return { label: k, count: count, prevCount: prevCount, yoy: prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : null };
    }).sort(function (a, b) { return b.count - a.count; });
  }
  return {
    venueRanking: rank(rows, prevRows, '式場'),
    photoPlanRanking: rank(photoRows, photoPrevRows, 'プラン'),
    agtRanking: rank(rows, prevRows, '現地会社'),
    periodFrom: periodFrom, periodTo: periodTo, prevPeriodFrom: prevFrom, prevPeriodTo: prevTo
  };
}

/**
 * 月別・方面別の予約パイプライン（Q&A一巡目G-17）。
 * 「何月に何件その方面が入っているか」を、当年（Contracts.挙式日基準）・前年着地（Contracts＋
 * HistoricalActuals）・前年同日時点（Contracts.契約日を1年前の同日までに絞った、着地待ちの
 * ペース比較）で並べる。目標はTargetsの合計（方面別の目標は現状ないため全体件数のみ）。
 * monthsAhead で先何ヶ月分を見るかを指定する（既定12ヶ月）。
 *
 * 前年同日時点比較（pace）は、契約日が記録されている本システム稼働後のContractsのみで算出できる。
 * 本システム稼働前のHistoricalActuals（月次の最終着地数のみを遡及入力したもの）には契約日の
 * 粒度がないため、pace比較には使えない。稼働からまだ1年経っていない方面・月はpaceAvailable=false
 * とし、画面側では「前年着地（最終値）」のみを表示する。
 */
function dashboardService_getBookingPipeline(filter, scope, monthsAhead) {
  monthsAhead = monthsAhead || 12;
  const contracts = dashboardService_scopedContracts_({}, scope); // 期間フィルタなし＝全件から挙式日で振り分け
  // 挙式日（撮影日）はContractsには持たせず、成約時に自動生成されるOperationsのみに保持している
  // 設計のため、CASE_IDでOperationsとjoinして取得する。
  const opByCaseId = {};
  operationRepo_getAll().forEach(function (op) { opByCaseId[op.CASE_ID] = op; });

  const now = new Date();
  const todayIso = formatDateISO_(now);
  const oneYearAgoIso = formatDateISO_(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));

  const months = [];
  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM'));
  }

  const byAreaMonth = {};       // area -> month -> count（当年・現時点の全件）
  const byAreaMonthPacedPrev = {}; // area -> month(前年同月) -> count（前年・同日時点までに契約されていた件数）
  let hasPacedContractData = false;

  contracts.forEach(function (r) {
    const op = opByCaseId[r.CASE_ID];
    const wd = op ? op['挙式日（撮影日）'] : '';
    if (!wd || !r.契約日) return;
    const ym = String(wd).slice(0, 7);
    const area = r.方面 || '未設定';

    byAreaMonth[area] = byAreaMonth[area] || {};
    byAreaMonth[area][ym] = (byAreaMonth[area][ym] || 0) + 1;

    // 前年同日時点ペース：契約日が「1年前の今日」以前だった契約のみを、前年分としてカウントする
    if (r.契約日 <= oneYearAgoIso) {
      hasPacedContractData = true;
      byAreaMonthPacedPrev[area] = byAreaMonthPacedPrev[area] || {};
      byAreaMonthPacedPrev[area][ym] = (byAreaMonthPacedPrev[area][ym] || 0) + 1;
    }
  });

  // 前年着地（最終値）：byAreaMonthには対象の12ヶ月以外（過去月含む）の集計も含まれているため、
  // まずそれをそのまま使い、本システム稼働前で記録がない月だけ手入力のHistoricalActualsで補う。
  const byAreaMonthFinalPrev = {};
  Object.keys(byAreaMonth).forEach(function (area) {
    byAreaMonthFinalPrev[area] = Object.assign({}, byAreaMonth[area]);
  });
  const historical = historicalActualsRepo_getAll();
  historical.forEach(function (h) {
    if (scope.storeId && h.店舗ID !== scope.storeId) return;
    const area = h.方面 || '未設定';
    byAreaMonthFinalPrev[area] = byAreaMonthFinalPrev[area] || {};
    if (!byAreaMonthFinalPrev[area][h.年月]) {
      byAreaMonthFinalPrev[area][h.年月] = Number(h.成約数) || 0;
    }
  });

  // 方面は実績が0件の方面も含め、方面マスタの全件を対象とする（Q&A二巡目：「積み上げは全方面記載してほしい。数字が0でも」）。
  // マスタに無い自由入力値（未設定等）が実績側にだけ存在する場合はそれも末尾に追加する。
  const areasFromMaster = areaRepo_getAll()
    .filter(function (a) { return a.使用終了 !== true && a.使用終了 !== 'TRUE'; })
    .sort(function (a, b) { return (a.表示順 || 0) - (b.表示順 || 0); })
    .map(function (a) { return a.方面名; });
  const areasFromData = Object.keys(byAreaMonth).filter(function (a) { return areasFromMaster.indexOf(a) === -1; });
  const areas = areasFromMaster.concat(areasFromData);

  const table = areas.map(function (area) {
    const row = { area: area, months: {} };
    months.forEach(function (ym) {
      const prevYm = String(Number(ym.slice(0, 4)) - 1) + ym.slice(4);
      const count = (byAreaMonth[area] && byAreaMonth[area][ym]) || 0;
      const pacedPrevCount = (byAreaMonthPacedPrev[area] && byAreaMonthPacedPrev[area][prevYm]) || 0;
      const finalPrevCount = (byAreaMonthFinalPrev[area] && byAreaMonthFinalPrev[area][prevYm]) || 0;
      // 「前年」として画面に出す1つの数字：稼働から1年経っていれば同日時点のペース値、
      // まだ経っていなければ前年の最終着地値（HistoricalActuals含む）を使う。
      const prevCount = hasPacedContractData ? pacedPrevCount : finalPrevCount;
      row.months[ym] = {
        count: count,
        prevCount: prevCount,
        yoy: prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : null,
        paceAvailable: hasPacedContractData
      };
    });
    return row;
  });

  // 縦計（各月ごとに全方面を合算した行）
  const totalRow = { area: '合計', months: {} };
  months.forEach(function (ym) {
    const count = table.reduce(function (s, r) { return s + r.months[ym].count; }, 0);
    const prevCount = table.reduce(function (s, r) { return s + r.months[ym].prevCount; }, 0);
    totalRow.months[ym] = { count: count, prevCount: prevCount, yoy: prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : null, paceAvailable: hasPacedContractData };
  });

  return { months: months, table: table, totalRow: totalRow, paceAvailable: hasPacedContractData };
}

/**
 * 地方×区分（一般／AVA）のマトリクス。全国／各地方の実績を俯瞰する（Q&A一巡目G-17）。
 * Q&A二巡目：方面（ハワイ・沖縄等）・AGTでも絞り込めるようにする。
 * 来店数は方面・AGTが確定する前の店舗来店実績のため、絞り込み時も店舗単位の実績（AnalyticsCache）を
 * そのまま使い、成約数のみ「絞り込んだ方面・AGTで成約したものだけ」をContractsから直接集計し直す。
 */
function dashboardService_getRegionCategoryMatrix(filter) {
  filter = filter || {};
  let rows = analyticsCacheRepo_getAll();
  if (filter.from) rows = rows.filter(function (r) { return r.集計日 >= filter.from; });
  if (filter.to) rows = rows.filter(function (r) { return r.集計日 <= filter.to; });

  const hasAreaOrAgtFilter = !!(filter.area || filter.agt);
  let contractedCountByRegionCat = null; // hasAreaOrAgtFilter時のみ使用
  if (hasAreaOrAgtFilter) {
    const stores = storeRepo_getAll();
    const storeById = {};
    stores.forEach(function (s) { storeById[s.STORE_ID] = s; });
    const cases = caseRepo_getAll();
    const caseById = {};
    cases.forEach(function (c) { caseById[c.CASE_ID] = c; });
    const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS)).filter(function (r) { return r.有効フラグ === true || r.有効フラグ === 'TRUE'; });
    contractedCountByRegionCat = {};
    contracts.forEach(function (r) {
      if (filter.area && r.方面 !== filter.area) return;
      if (filter.agt && r.現地会社 !== filter.agt) return;
      if (filter.from && r.契約日 < filter.from) return;
      if (filter.to && r.契約日 > filter.to) return;
      const c = caseById[r.CASE_ID];
      const store = c ? storeById[c.店舗ID] : null;
      if (!store) return;
      const key = store.地方 + '|' + store.区分;
      contractedCountByRegionCat[key] = (contractedCountByRegionCat[key] || 0) + 1;
    });
  }

  const regions = regionRepo_getAll().map(function (r) { return r.地方名; });
  const categories = ['一般', 'AVA'];
  const matrix = regions.map(function (region) {
    const cell = { region: region };
    let regionTotal = { 来店数: 0, 成約数: 0 };
    categories.forEach(function (cat) {
      const filtered = rows.filter(function (r) { return r.地方 === region && r.区分 === cat; });
      const 来店数 = filtered.reduce(function (s, r) { return s + (Number(r.来店数) || 0); }, 0);
      const 成約数 = hasAreaOrAgtFilter
        ? (contractedCountByRegionCat[region + '|' + cat] || 0)
        : filtered.reduce(function (s, r) { return s + (Number(r.成約数) || 0); }, 0);
      cell[cat] = { 来店数: 来店数, 成約数: 成約数 };
      regionTotal.来店数 += 来店数; regionTotal.成約数 += 成約数;
    });
    cell.オール = regionTotal;
    return cell;
  });

  // 縦計（全地方を合算した行。Q&A二巡目）
  const totalRow = { region: '全国合計' };
  categories.concat(['オール']).forEach(function (key) {
    totalRow[key] = {
      来店数: matrix.reduce(function (s, r) { return s + r[key].来店数; }, 0),
      成約数: matrix.reduce(function (s, r) { return s + r[key].成約数; }, 0)
    };
  });
  matrix.push(totalRow);
  return matrix;
}

/**
 * 指定した地方内の方面別実績（問い合わせ数・成約数・成約率）。個人単位・店舗単位でも見られるよう
 * groupByStaff / groupByStore の集計も添える（Q&A一巡目G-17）。
 */
function dashboardService_getRegionAreaStats(region, filter) {
  const stores = storeRepo_getAll().filter(function (s) { return s.地方 === region; });
  const storeIds = stores.map(function (s) { return s.STORE_ID; });
  const cases = caseRepo_getAll().filter(function (c) { return storeIds.indexOf(c.店舗ID) !== -1; });
  const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS)).filter(function (r) { return r.有効フラグ === true || r.有効フラグ === 'TRUE'; });
  const caseById = {};
  cases.forEach(function (c) { caseById[c.CASE_ID] = c; });
  const lostCases = caseRepo_getAllLostCases().filter(function (l) { return caseById[l.CASE_ID]; });

  function inRange(dateStr) {
    if (filter.from && dateStr < filter.from) return false;
    if (filter.to && dateStr > filter.to) return false;
    return true;
  }

  // 方面別（成約はContracts.方面、問い合わせは相談区分から挙式/フォトの希望エリアを見るのは複雑なため、
  // ここでは成約実績ベースの方面別集計とする）
  const byArea = {};
  contracts.forEach(function (r) {
    const c = caseById[r.CASE_ID];
    if (!c || !inRange(r.契約日)) return;
    const area = r.方面 || '未設定';
    byArea[area] = byArea[area] || { area: area, 成約数: 0 };
    byArea[area].成約数 += 1;
  });

  // 店舗単位・個人単位の成約率（問い合わせ数は来店数、成約可否はContracts/LostCasesの有無）
  const byStore = {};
  const byStaff = {};
  cases.forEach(function (c) {
    if (!inRange(formatDateISO_(c.受付日時))) return;
    byStore[c.店舗ID] = byStore[c.店舗ID] || { storeId: c.店舗ID, 来店数: 0, 成約数: 0, 未成約数: 0 };
    byStore[c.店舗ID].来店数 += 1;
    const staffKey = c.担当者ID || '未設定';
    byStaff[staffKey] = byStaff[staffKey] || { staffId: staffKey, 来店数: 0, 成約数: 0, 未成約数: 0 };
    byStaff[staffKey].来店数 += 1;
  });
  contracts.forEach(function (r) {
    const c = caseById[r.CASE_ID];
    if (!c) return;
    if (byStore[c.店舗ID]) byStore[c.店舗ID].成約数 += 1;
    // 担当者別成約数（バグ修正：以前はbyStoreのみ加算されbyStaffが常に0件になっていた）
    const staffKey = c.担当者ID || '未設定';
    if (byStaff[staffKey]) byStaff[staffKey].成約数 += 1;
  });
  lostCases.forEach(function (l) {
    const c = caseById[l.CASE_ID];
    if (!c || l.種別 !== '未成約') return;
    if (byStore[c.店舗ID]) byStore[c.店舗ID].未成約数 += 1;
    // 担当者別未成約数（同上のバグ修正）
    const staffKey = c.担当者ID || '未設定';
    if (byStaff[staffKey]) byStaff[staffKey].未成約数 += 1;
  });

  function withRate(obj) {
    const denom = obj.成約数 + obj.未成約数;
    obj.成約率 = denom > 0 ? Math.round((obj.成約数 / denom) * 1000) / 10 : null;
    return obj;
  }

  return {
    byArea: Object.values(byArea).sort(function (a, b) { return b.成約数 - a.成約数; }),
    byStore: Object.values(byStore).map(withRate),
    byStaff: Object.values(byStaff).map(withRate)
  };
}
