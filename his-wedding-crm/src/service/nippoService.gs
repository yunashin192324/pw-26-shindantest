/**
 * nippoService.gs
 * 実際に使われている店舗日報・エリア進捗・全国集計・通期進捗（Q&A八巡目：NotebookLMで実物の
 * 日報スプレッドシートの構造を読み取ってもらったものを仕様として受領）を、本システムの
 * ダッシュボード上に再現する集計ロジック。
 *
 * 元データ（新規/既存・問合せ方法・媒体・方面・プラン・担当者・問合せ結果等）は、既存の
 * カウンセリングシート項目＝Cases/Customers/WeddingRequests/PhotoRequests/Contracts/LostCasesと
 * 完全に同じ構造なので、新しいマスタや入力項目は追加せず、集計の切り口だけを増やしている
 * （ユーザー確認：「今の日報の数字のもとは、質問項目としてダッシュボード側に既にある」）。
 *
 * 対象外にしたもの（Q&A八巡目で確認済み）：
 *  ・時間帯集計（来店予約枠ごとの目標・実績）… カウンセリングシート・接客記録に「時間帯」の
 *    項目が無いため、今回は見送り。将来的に接客記録へ来店時間帯を追加すれば対応できる設計にはしてある。
 *
 * 通期進捗の前年比・前々年比について：
 *  ・今年・前年は本体シート（ライブデータ）またはアーカイブ済みシートから実データで算出する。
 *  ・前々年より古い期間で、まだ本システムにデジタル記録が無い（稼働前の）月は、HistoricalActuals
 *    （店長・本部が遡及入力した月次実績）で補うが、そちらは来店数・成約数のみの粒度のため、
 *    CXL・NET・PAX数はnull（データなし）として画面側で「—」表示にする。
 */

/** ケース（Cases）一覧を店舗／地方スコープで絞り込む共通ヘルパー */
function nippoService_scopeCases_(cases, scope) {
  if (!scope) return cases;
  if (scope.storeId) return cases.filter(function (c) { return c.店舗ID === scope.storeId; });
  if (scope.region) {
    const storeById = {};
    storeRepo_getAll().forEach(function (s) { storeById[s.STORE_ID] = s; });
    return cases.filter(function (c) { const s = storeById[c.店舗ID]; return s && s.地方 === scope.region; });
  }
  return cases;
}

/**
 * 指定した年（西暦）のCases／Contracts（全件、有効フラグ問わず）／LostCasesを取得する。
 * 本体（現在＋ARCHIVE_KEEP_YEARS年分）はライブシートから、それより古い年はアーカイブ済みの
 * 年別スプレッドシートから読む。アーカイブも無い場合（本システム稼働前の年）はnullを返す。
 */
function nippoService_yearlyCaseFamily_(year, scope) {
  const keepYears = archiveService_keepYears_();
  const cutoffYear = new Date().getFullYear() - keepYears + 1;

  let cases, contracts, lostCases;
  if (year >= cutoffYear) {
    cases = caseRepo_getAll();
    contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS));
    lostCases = caseRepo_getAllLostCases();
  } else {
    const ss = archiveService_openYear_(year);
    if (!ss) return null;
    cases = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.CASES));
    contracts = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.CONTRACTS));
    lostCases = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.LOST_CASES));
  }

  cases = nippoService_scopeCases_(cases, scope);
  const caseIds = {};
  cases.forEach(function (c) { caseIds[c.CASE_ID] = true; });
  contracts = contracts.filter(function (r) { return caseIds[r.CASE_ID]; });
  lostCases = lostCases.filter(function (r) { return caseIds[r.CASE_ID]; });
  return { cases: cases, contracts: contracts, lostCases: lostCases };
}

/**
 * 期間（from〜to、年をまたがない前提）のKPIを、案件一式の生データから直接集計する。
 * NB＝有効な成約（Contracts.有効フラグ）、CXL＝LostCases.種別='キャンセル'、未成約＝それ以外の
 * LostCases、NET＝NB−CXL、PAXはContracts.CPL旅行人数＋列席旅行人数（キャンセル時は該当案件の
 * 直近の契約行からPAXを引き当てる。有効フラグOFFで検索から外れないよう、リポジトリではなく
 * 全件のcontractsから拾う）。
 */
function nippoService_kpisForRange_(fromIso, toIso, scope) {
  const fromYear = Number(fromIso.slice(0, 4));
  const fam = nippoService_yearlyCaseFamily_(fromYear, scope);
  if (!fam) return { hasData: false };

  let 新規問合せ = 0, NB = 0, CXL = 0, 未成約 = 0, PAX_NB = 0, PAX_CXL = 0;

  fam.cases.forEach(function (c) {
    if (!c.受付日時) return;
    const d = formatDateISO_(c.受付日時);
    if (d >= fromIso && d <= toIso) 新規問合せ += 1;
  });

  // 案件ごとの最新契約行（キャンセル時のPAX引き当て用。有効フラグの状態は問わない）
  const contractByCaseId = {};
  fam.contracts.forEach(function (r) {
    if (!r.契約日) return;
    if (!contractByCaseId[r.CASE_ID] || r.契約日 > contractByCaseId[r.CASE_ID].契約日) contractByCaseId[r.CASE_ID] = r;
  });

  fam.contracts.forEach(function (r) {
    if (r.有効フラグ !== true && r.有効フラグ !== 'TRUE') return;
    if (!r.契約日 || r.契約日 < fromIso || r.契約日 > toIso) return;
    NB += 1;
    PAX_NB += (Number(r.CPL旅行人数) || 0) + (Number(r.列席旅行人数) || 0);
  });

  fam.lostCases.forEach(function (l) {
    if (!l.未成約日 || l.未成約日 < fromIso || l.未成約日 > toIso) return;
    if (l.種別 === 'キャンセル') {
      CXL += 1;
      const ct = contractByCaseId[l.CASE_ID];
      if (ct) PAX_CXL += (Number(ct.CPL旅行人数) || 0) + (Number(ct.列席旅行人数) || 0);
    } else {
      未成約 += 1;
    }
  });

  const denom = NB + 未成約;
  return {
    hasData: true, 新規問合せ: 新規問合せ, NB: NB, CXL: CXL, 未成約: 未成約, NET: NB - CXL,
    成約率: denom > 0 ? Math.round((NB / denom) * 1000) / 10 : null,
    PAX_NB: PAX_NB, PAX_CXL: PAX_CXL, PAX_NET: PAX_NB - PAX_CXL
  };
}

/**
 * 指定した年月を「週」に分割する（実物の日報の「1日〜4日」「5日〜11日」…に合わせ、月初から最初の
 * 週区切り曜日までを第1週とし、以降は7日区切り、最終週は月末で打ち切る）。
 * 週開始曜日は既定で月曜（weekStartsOn=1）。
 */
function nippoService_weekRangesForMonth_(yearMonth, weekStartsOn) {
  weekStartsOn = weekStartsOn == null ? 1 : weekStartsOn;
  const y = Number(yearMonth.slice(0, 4)), m = Number(yearMonth.slice(5, 7));
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const ranges = [];
  let cur = new Date(first.getTime());
  while (cur <= last) {
    const dow = cur.getDay();
    const daysUntilWeekEnd = 7 - ((dow - weekStartsOn + 7) % 7) - 1;
    let end = new Date(cur.getTime());
    end.setDate(end.getDate() + daysUntilWeekEnd);
    if (end > last) end = new Date(last.getTime());
    ranges.push({ from: formatDateISO_(cur), to: formatDateISO_(end) });
    cur = new Date(end.getTime());
    cur.setDate(cur.getDate() + 1);
  }
  return ranges;
}

/**
 * 店舗日報の「週次推移テーブル」を再現する。月・週ごとに新規問合せ／NB／CXL／NET／成約率／PAX数を、
 * 前年同期間（週の日付範囲をそのまま1年ずらした期間）と対比して返す。
 * 週単位の「目標」は現行のTargetsマスタ（月次・店舗単位のみ）には存在しないため含めない
 * （月間の目標自体は既存のダッシュボードKPIサマリーで確認できる）。
 */
function nippoService_getWeeklySummary(filter, scope) {
  filter = filter || {};
  const yearMonth = filter.yearMonth || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
  const ranges = nippoService_weekRangesForMonth_(yearMonth);

  const rows = ranges.map(function (r) {
    const current = nippoService_kpisForRange_(r.from, r.to, scope);
    const prevFrom = shiftYearIso_(r.from, -1), prevTo = shiftYearIso_(r.to, -1);
    const previous = nippoService_kpisForRange_(prevFrom, prevTo, scope);
    const yoy = (current.hasData && previous.hasData && previous.NB > 0) ? Math.round((current.NB / previous.NB) * 1000) / 10 : null;
    return {
      label: Number(r.from.slice(8, 10)) + '日〜' + Number(r.to.slice(8, 10)) + '日',
      from: r.from, to: r.to, current: current, previous: previous, 前年比: yoy
    };
  });

  // 月計（合計行）
  function sumField(field) {
    let sum = 0, any = false;
    rows.forEach(function (r) { if (r.current.hasData && r.current[field] != null) { sum += r.current[field]; any = true; } });
    return any ? sum : null;
  }
  const totalNB = sumField('NB'), total未成約 = sumField('未成約');
  const total = {
    label: '月計', 新規問合せ: sumField('新規問合せ'), NB: totalNB, CXL: sumField('CXL'), NET: sumField('NET'),
    成約率: (totalNB != null && total未成約 != null && (totalNB + total未成約) > 0) ? Math.round((totalNB / (totalNB + total未成約)) * 1000) / 10 : null,
    PAX_NB: sumField('PAX_NB'), PAX_NET: sumField('PAX_NET')
  };

  return { yearMonth: yearMonth, rows: rows, total: total };
}

/**
 * 担当者別集計（新規問合せ・成約(NB)・成約率・CXL・NET・PAX数）。
 * 新規問合せはCases.担当者ID（受付担当）、成約・CXLはContracts.契約担当／LostCases.担当者
 * （いずれも氏名の自由記述で、案件のライフサイクルの中で受付担当と成約担当が異なるケースがあるため、
 * 日報の実運用に合わせて別々の軸で集計し、氏名をキーに合算する）。
 */
function nippoService_getStaffReport(filter, scope) {
  filter = filter || {};
  const now = new Date();
  const periodFrom = filter.from || formatDateISO_(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodTo = filter.to || formatDateISO_(now);

  const cases = nippoService_scopeCases_(caseRepo_getAll(), scope);
  const caseIds = {};
  cases.forEach(function (c) { caseIds[c.CASE_ID] = true; });

  const staffById = {};
  staffRepo_getAll().forEach(function (s) { staffById[s.STAFF_ID] = s; });

  const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS)).filter(function (r) { return caseIds[r.CASE_ID]; });
  const lostCases = caseRepo_getAllLostCases().filter(function (r) { return caseIds[r.CASE_ID]; });

  const byStaff = {};
  function ensure(name) {
    const key = name || '未設定';
    byStaff[key] = byStaff[key] || { staff: key, 新規問合せ: 0, NB: 0, CXL: 0, 未成約: 0, PAX_NB: 0, PAX_CXL: 0 };
    return byStaff[key];
  }

  cases.forEach(function (c) {
    if (!c.受付日時) return;
    const d = formatDateISO_(c.受付日時);
    if (d < periodFrom || d > periodTo) return;
    const staffName = (staffById[c.担当者ID] && staffById[c.担当者ID].氏名) || c.担当者ID;
    ensure(staffName).新規問合せ += 1;
  });

  const contractByCaseId = {};
  contracts.forEach(function (r) {
    if (!r.契約日) return;
    if (!contractByCaseId[r.CASE_ID] || r.契約日 > contractByCaseId[r.CASE_ID].契約日) contractByCaseId[r.CASE_ID] = r;
  });
  contracts.forEach(function (r) {
    if (r.有効フラグ !== true && r.有効フラグ !== 'TRUE') return;
    if (!r.契約日 || r.契約日 < periodFrom || r.契約日 > periodTo) return;
    const row = ensure(r.契約担当);
    row.NB += 1;
    row.PAX_NB += (Number(r.CPL旅行人数) || 0) + (Number(r.列席旅行人数) || 0);
  });
  lostCases.forEach(function (l) {
    if (!l.未成約日 || l.未成約日 < periodFrom || l.未成約日 > periodTo) return;
    const row = ensure(l.担当者);
    if (l.種別 === 'キャンセル') {
      row.CXL += 1;
      const ct = contractByCaseId[l.CASE_ID];
      if (ct) row.PAX_CXL += (Number(ct.CPL旅行人数) || 0) + (Number(ct.列席旅行人数) || 0);
    } else {
      row.未成約 += 1;
    }
  });

  return Object.values(byStaff).map(function (r) {
    const denom = r.NB + r.未成約;
    r.NET = r.NB - r.CXL;
    r.PAX_NET = r.PAX_NB - r.PAX_CXL;
    r.成約率 = denom > 0 ? Math.round((r.NB / denom) * 1000) / 10 : null;
    return r;
  }).sort(function (a, b) { return b.NB - a.NB; });
}

/**
 * エリア進捗管理（縦軸＝式場／フォトプラン、横軸＝店舗＋前年実績＋前年比）。
 * NIPPO原本の「目標」列は、現行のTargetsマスタが店舗×年月の来店数／成約数のみでプラン単位の
 * 目標を持っていないため、実績と前年実績のみを表示する（noteとして画面側にも明示する）。
 */
function nippoService_getAreaProgressByStore(area, filter, scope) {
  filter = filter || {};
  const now = new Date();
  const periodFrom = filter.from || formatDateISO_(new Date(now.getFullYear(), 0, 1));
  const periodTo = filter.to || formatDateISO_(now);
  const prevFrom = shiftYearIso_(periodFrom, -1), prevTo = shiftYearIso_(periodTo, -1);

  const rows = dashboardService_scopedContracts_(Object.assign({}, filter, { area: area, from: periodFrom, to: periodTo }), scope || {});
  const prevRows = dashboardService_scopedContracts_(Object.assign({}, filter, { area: area, from: prevFrom, to: prevTo }), scope || {});

  const stores = storeRepo_getAll().filter(function (s) { return !scope || !scope.region || s.地方 === scope.region; });
  const storeIds = stores.map(function (s) { return s.STORE_ID; });

  function planKeyOf(r) { return r.式場 || r.プラン || '未設定'; }
  const planNames = Array.from(new Set(rows.concat(prevRows).map(planKeyOf)));

  const table = planNames.map(function (plan) {
    const row = { plan: plan, byStore: {} };
    let rowTotalCur = 0, rowTotalPrev = 0;
    storeIds.forEach(function (sid) {
      const cur = rows.filter(function (r) { return planKeyOf(r) === plan && r.__case && r.__case.店舗ID === sid; }).length;
      const prev = prevRows.filter(function (r) { return planKeyOf(r) === plan && r.__case && r.__case.店舗ID === sid; }).length;
      row.byStore[sid] = { current: cur, prev: prev, yoy: prev > 0 ? Math.round((cur / prev) * 1000) / 10 : null };
      rowTotalCur += cur; rowTotalPrev += prev;
    });
    row.total = { current: rowTotalCur, prev: rowTotalPrev, yoy: rowTotalPrev > 0 ? Math.round((rowTotalCur / rowTotalPrev) * 1000) / 10 : null };
    return row;
  }).sort(function (a, b) { return b.total.current - a.total.current; });

  return {
    stores: stores.map(function (s) { return { id: s.STORE_ID, name: s.店舗名 }; }),
    table: table, periodFrom: periodFrom, periodTo: periodTo,
    note: 'プラン単位の目標は現行の目標マスタでは未設定のため、実績と前年実績のみ表示しています。'
  };
}

/**
 * 全国店舗成約・地区別集計（縦軸＝店舗、横軸＝方面＋成約数、来店数は店舗単位のみ）。
 * 来店数は方面が確定する前の店舗来店実績のため、地方×区分マトリクスと同様に方面別には分解しない。
 */
function nippoService_getStoreAreaMatrix(filter) {
  filter = filter || {};
  const now = new Date();
  const periodFrom = filter.from || formatDateISO_(new Date(now.getFullYear(), 0, 1));
  const periodTo = filter.to || formatDateISO_(now);

  const stores = storeRepo_getAll();
  const cases = caseRepo_getAll();
  const caseById = {};
  cases.forEach(function (c) { caseById[c.CASE_ID] = c; });
  const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS))
    .filter(function (r) { return (r.有効フラグ === true || r.有効フラグ === 'TRUE') && r.契約日 >= periodFrom && r.契約日 <= periodTo; });

  const areasFromMaster = areaRepo_getAll().filter(function (a) { return a.使用終了 !== true && a.使用終了 !== 'TRUE'; })
    .sort(function (a, b) { return (a.表示順 || 0) - (b.表示順 || 0); }).map(function (a) { return a.方面名; });

  const visitsByStore = {};
  cases.forEach(function (c) {
    if (!c.受付日時) return;
    const d = formatDateISO_(c.受付日時);
    if (d < periodFrom || d > periodTo) return;
    visitsByStore[c.店舗ID] = (visitsByStore[c.店舗ID] || 0) + 1;
  });

  const table = stores.map(function (s) {
    const row = { storeId: s.STORE_ID, storeName: s.店舗名, 来店数: visitsByStore[s.STORE_ID] || 0, byArea: {} };
    let total = 0;
    areasFromMaster.forEach(function (area) {
      const count = contracts.filter(function (r) { const c = caseById[r.CASE_ID]; return c && c.店舗ID === s.STORE_ID && r.方面 === area; }).length;
      row.byArea[area] = count;
      total += count;
    });
    row.成約数 = total;
    return row;
  });

  const totalRow = { storeId: '', storeName: '全国合計', 来店数: table.reduce(function (s, r) { return s + r.来店数; }, 0), byArea: {} };
  let grandTotal = 0;
  areasFromMaster.forEach(function (area) {
    const sum = table.reduce(function (s, r) { return s + (r.byArea[area] || 0); }, 0);
    totalRow.byArea[area] = sum; grandTotal += sum;
  });
  totalRow.成約数 = grandTotal;

  return { areas: areasFromMaster, stores: table, total: totalRow, periodFrom: periodFrom, periodTo: periodTo };
}

/** 年（1〜12月）ぶんのKPIを、生データ（ライブ／アーカイブ）から月次に集計する */
function nippoService_monthlyKpisForYear_(year, scope) {
  const fam = nippoService_yearlyCaseFamily_(year, scope);
  const months = {};
  for (let m = 1; m <= 12; m++) {
    const ym = year + '-' + (m < 10 ? '0' + m : String(m));
    const from = ym + '-01';
    const to = formatDateISO_(new Date(year, m, 0));
    months[ym] = fam ? nippoService_kpisForRange_(from, to, scope) : { hasData: false };
  }
  return { months: months, source: fam ? 'data' : 'none' };
}

/**
 * 年（1〜12月）ぶんのKPIを、生データが無い場合はHistoricalActuals（来店数・成約数のみ、遡及入力）で
 * 補って返す。稼働前の期間はCXL・NET・PAX数がnull（データなし）になる。
 */
function nippoService_monthlyKpisForYearWithFallback_(year, scope) {
  const result = nippoService_monthlyKpisForYear_(year, scope);
  if (result.source !== 'none') return result;

  const historical = historicalActualsRepo_getAll().filter(function (h) {
    if (scope && scope.storeId) return h.店舗ID === scope.storeId;
    if (scope && scope.region) { const s = storeRepo_getById(h.店舗ID); return s && s.地方 === scope.region; }
    return true;
  });
  const months = {};
  for (let m = 1; m <= 12; m++) {
    const ym = year + '-' + (m < 10 ? '0' + m : String(m));
    const matched = historical.filter(function (h) { return h.年月 === ym; });
    if (matched.length === 0) {
      months[ym] = { hasData: false };
    } else {
      months[ym] = {
        hasData: true,
        新規問合せ: matched.reduce(function (s, h) { return s + (Number(h.来店数) || 0); }, 0),
        NB: matched.reduce(function (s, h) { return s + (Number(h.成約数) || 0); }, 0),
        CXL: null, NET: null, 未成約: null, 成約率: null, PAX_NB: null, PAX_CXL: null, PAX_NET: null,
        fromHistorical: true
      };
    }
  }
  return { months: months, source: 'historical' };
}

/**
 * 通期進捗管理（複数年の月次推移。「46期」のような期の呼び方は本システムでは扱わず、西暦年で表示する）。
 * 今年・前年は必ず算出し、yearsBack>=3なら前々年もできる範囲で算出する（Q&A八巡目：
 * 「前年比のみで良いが可能なら前々年比もできたらなおよし」）。
 */
function nippoService_getMultiYearTrend(filter, scope, yearsBack) {
  yearsBack = yearsBack || 3;
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < yearsBack; i++) years.push(currentYear - i);

  const perYear = years.map(function (y) {
    const r = nippoService_monthlyKpisForYearWithFallback_(y, scope);
    return { year: y, months: r.months, source: r.source };
  });

  const table = [];
  for (let m = 1; m <= 12; m++) {
    const mm = m < 10 ? '0' + m : String(m);
    const row = { month: mm + '月' };
    perYear.forEach(function (py, idx) { row['y' + idx] = py.months[py.year + '-' + mm]; });
    const cur = row.y0;
    row.前年比 = (cur && cur.hasData && row.y1 && row.y1.hasData && row.y1.NB > 0) ? Math.round((cur.NB / row.y1.NB) * 1000) / 10 : null;
    row.前々年比 = (yearsBack >= 3 && cur && cur.hasData && row.y2 && row.y2.hasData && row.y2.NB > 0) ? Math.round((cur.NB / row.y2.NB) * 1000) / 10 : null;
    table.push(row);
  }

  function sumField(key, field) {
    let sum = 0, any = false;
    table.forEach(function (r) { const cell = r[key]; if (cell && cell.hasData && cell[field] != null) { sum += cell[field]; any = true; } });
    return any ? sum : null;
  }
  const totalsByYear = perYear.map(function (py, idx) {
    const key = 'y' + idx;
    return {
      year: py.year, source: py.source,
      新規問合せ: sumField(key, '新規問合せ'), NB: sumField(key, 'NB'), CXL: sumField(key, 'CXL'),
      NET: sumField(key, 'NET'), PAX_NB: sumField(key, 'PAX_NB'), PAX_NET: sumField(key, 'PAX_NET')
    };
  });

  return { years: years, table: table, totalsByYear: totalsByYear };
}
