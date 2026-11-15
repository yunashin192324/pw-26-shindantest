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
let nippoService_familyCache_ = {};
function nippoService_yearlyCaseFamily_(year, scope) {
  // 1回の実行の中で同じ年・同じスコープを何度も読まないようにする（月×週×前年で何十回も呼ばれるため）
  const cacheKey = year + '|' + JSON.stringify(scope || {});
  if (cacheKey in nippoService_familyCache_) return nippoService_familyCache_[cacheKey];
  const result = nippoService_yearlyCaseFamilyUncached_(year, scope);
  nippoService_familyCache_[cacheKey] = result;
  return result;
}

function nippoService_yearlyCaseFamilyUncached_(year, scope) {
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
  // 稼働開始月より前の部分は、取り込んだ過去の月次日報の明細から数える（明細が無ければ「データなし」。
  // 0件として扱うと前年比が0%と誤って出るため）。稼働後の部分は実データから数える。
  const parts = pastDetail_splitRange_(fromIso, toIso);
  const past = parts.past ? pastDetail_kpis_(parts.past.from, parts.past.to, scope) : null;
  const live = parts.live ? nippoService_liveKpisForRange_(parts.live.from, parts.live.to, scope) : null;
  if (!past) return live;
  if (!live || !live.hasData) return past;
  if (!past.hasData) return live;
  const sum = { hasData: true, fromPastDetail: true };
  ['新規問合せ', 'NB', 'CXL', 'PAX_NB', 'PAX_CXL'].forEach(function (f) { sum[f] = (past[f] || 0) + (live[f] || 0); });
  sum.NET = sum.NB - sum.CXL;
  sum.PAX_NET = sum.PAX_NB - sum.PAX_CXL;
  sum.未成約 = null; sum.成約率 = null;
  return sum;
}

/** 実データ（本体シート／アーカイブ）からの期間KPI */
function nippoService_liveKpisForRange_(fromIso, toIso, scope) {
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
    // NBは「成約した件数」。あとでキャンセルされた成約（有効フラグOFF）も含めて数え、キャンセルはCXLで別に数える
    // （月次日報と同じ考え方：成約の行はそのまま残し、キャンセル欄に別途記入してNET＝成約−CXL）。
    // 以前は有効な成約だけを数えていたため、キャンセルが成約とCXLの両方から引かれ、NETが実際より少なく出ていた。
    const d = nippoService_isoDate_(r.契約日);
    if (!d || d < fromIso || d > toIso) return;
    NB += 1;
    PAX_NB += (Number(r.CPL旅行人数) || 0) + (Number(r.列席旅行人数) || 0);
  });

  fam.lostCases.forEach(function (l) {
    const ld = nippoService_isoDate_(l.未成約日);
    if (!ld || ld < fromIso || ld > toIso) return;
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
 * 担当者別集計（新規問合せ・成約(NB)・成約率・CXL・NET・PAX数）と、前年同期間の値・前年比。
 * 新規問合せはCases.担当者ID（受付担当）、成約・CXLはContracts.契約担当／LostCases.担当者
 * （いずれも氏名の自由記述で、案件のライフサイクルの中で受付担当と成約担当が異なるケースがあるため、
 * 日報の実運用に合わせて別々の軸で集計し、氏名をキーに合算する）。
 * 稼働開始月より前の期間（主に前年）は、取り込んだ過去の月次日報の明細から数える。日報の担当者名は
 * 担当者マスタの「日報での表記」でCRMの氏名にそろえる（日報の担当者別集計と同じく、CXLはキャンセル欄の全行）。
 */
function nippoService_getStaffReport(filter, scope) {
  filter = filter || {};
  const now = new Date();
  const periodFrom = filter.from || formatDateISO_(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodTo = filter.to || formatDateISO_(now);
  const prevFrom = shiftYearIso_(periodFrom, -1), prevTo = shiftYearIso_(periodTo, -1);

  const current = nippoService_staffStats_(periodFrom, periodTo, scope);
  const previous = nippoService_staffStats_(prevFrom, prevTo, scope);
  const names = {};
  Object.keys(current.byStaff).forEach(function (k) { names[k] = true; });
  Object.keys(previous.byStaff).forEach(function (k) { names[k] = true; });

  function finish(r) {
    if (!r) return null;
    const denom = r.NB + r.未成約;
    r.NET = r.NB - r.CXL;
    r.PAX_NET = r.PAX_NB - r.PAX_CXL;
    r.成約率 = (r.未成約 !== null && denom > 0) ? Math.round((r.NB / denom) * 1000) / 10 : null;
    return r;
  }
  return Object.keys(names).map(function (name) {
    const cur = finish(current.byStaff[name] || nippoService_emptyStaffRow_(name));
    const prev = previous.hasData ? finish(previous.byStaff[name] || nippoService_emptyStaffRow_(name)) : null;
    cur.前年 = prev;
    cur.NB前年比 = prev && prev.NB > 0 ? Math.round((cur.NB / prev.NB) * 1000) / 10 : null;
    cur.新規前年比 = prev && prev.新規問合せ > 0 ? Math.round((cur.新規問合せ / prev.新規問合せ) * 1000) / 10 : null;
    return cur;
  }).filter(function (r) {
    // 今期も前年も0件の担当者は出さない
    return r.新規問合せ || r.NB || r.CXL || r.未成約 || (r.前年 && (r.前年.新規問合せ || r.前年.NB || r.前年.CXL));
  }).sort(function (a, b) { return b.NB - a.NB; });
}

function nippoService_emptyStaffRow_(name) {
  return { staff: name, 新規問合せ: 0, NB: 0, CXL: 0, 未成約: 0, PAX_NB: 0, PAX_CXL: 0 };
}

/** 期間の担当者別の数字（稼働前の部分は過去の日報の明細、稼働後は実データ）。{ hasData, byStaff } */
function nippoService_staffStats_(fromIso, toIso, scope) {
  const byStaff = {};
  function ensure(name) {
    const key = name || '未設定';
    byStaff[key] = byStaff[key] || nippoService_emptyStaffRow_(key);
    return byStaff[key];
  }
  const parts = pastDetail_splitRange_(fromIso, toIso);
  let hasData = false;

  if (parts.past) {
    const entries = pastDetail_entries_(parts.past.from, parts.past.to, scope);
    if (entries !== null) {
      hasData = true;
      entries.forEach(function (e) {
        const row = ensure(staffNameFromNippo_(e.担当者));
        if (e.区分 === '新規') row.新規問合せ += 1;
        if (e.問合結果 === '成約') row.NB += 1;
        row.PAX_NB += pastDetail_pax_(e);
      });
      pastDetail_cancels_(parts.past.from, parts.past.to, scope).forEach(function (c) {
        const row = ensure(staffNameFromNippo_(c.担当者));
        row.CXL += 1;
        row.PAX_CXL += Number(c.PAX) || 0;
      });
    }
  }
  const includesPast = hasData;

  if (parts.live) {
    hasData = true;
    const pFrom = parts.live.from, pTo = parts.live.to;
    const cases = nippoService_scopeCases_(caseRepo_getAll(), scope);
    const caseIds = {};
    cases.forEach(function (c) { caseIds[c.CASE_ID] = true; });
    const staffById = {};
    staffRepo_getAll().forEach(function (s) { staffById[s.STAFF_ID] = s; });
    const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS)).filter(function (r) { return caseIds[r.CASE_ID]; });
    const lostCases = caseRepo_getAllLostCases().filter(function (r) { return caseIds[r.CASE_ID]; });

    cases.forEach(function (c) {
      const d = nippoService_isoDate_(c.受付日時);
      if (!d || d < pFrom || d > pTo) return;
      const staffName = (staffById[c.担当者ID] && staffById[c.担当者ID].氏名) || c.担当者ID;
      ensure(staffName).新規問合せ += 1;
    });
    const contractByCaseId = {};
    contracts.forEach(function (r) {
      const d = nippoService_isoDate_(r.契約日);
      if (!d) return;
      if (!contractByCaseId[r.CASE_ID] || d > nippoService_isoDate_(contractByCaseId[r.CASE_ID].契約日)) contractByCaseId[r.CASE_ID] = r;
    });
    contracts.forEach(function (r) {
      // あとでキャンセルされた成約も含めて数える（CXLは別に数え、NET＝NB−CXL。kpisForRange_と同じ考え方）
      const d = nippoService_isoDate_(r.契約日);
      if (!d || d < pFrom || d > pTo) return;
      const row = ensure(r.契約担当);
      row.NB += 1;
      row.PAX_NB += (Number(r.CPL旅行人数) || 0) + (Number(r.列席旅行人数) || 0);
    });
    lostCases.forEach(function (l) {
      const ld = nippoService_isoDate_(l.未成約日);
      if (!ld || ld < pFrom || ld > pTo) return;
      const row = ensure(l.担当者);
      if (l.種別 === 'キャンセル') {
        row.CXL += 1;
        const ct = contractByCaseId[l.CASE_ID];
        if (ct) row.PAX_CXL += (Number(ct.CPL旅行人数) || 0) + (Number(ct.列席旅行人数) || 0);
      } else {
        row.未成約 += 1;
      }
    });
  }
  // 日報には「未成約」の件数が無いため、稼働前の部分を含む期間は成約率を出さない
  if (includesPast) Object.keys(byStaff).forEach(function (k) { byStaff[k].未成約 = null; });
  return { hasData: hasData, byStaff: byStaff };
}

/**
 * エリア進捗管理（縦軸＝式場／フォトプラン、横軸＝店舗＋前年実績＋前年比）。
 * NIPPO原本の「目標」列は、現行のTargetsマスタが店舗×年月の来店数／成約数のみでプラン単位の
 * 目標を持っていないため、実績と前年実績のみを表示する（noteとして画面側にも明示する）。
 */
function nippoService_getAreaProgressByStore(area, filter, scope) {
  filter = filter || {};
  const now = new Date();
  const periodFrom = filter.from || fiscalPeriodStartIso_(now);
  const periodTo = filter.to || formatDateISO_(now);
  const prevFrom = shiftYearIso_(periodFrom, -1), prevTo = shiftYearIso_(periodTo, -1);

  // 稼働前の期間は取り込んだ過去の日報の明細から数える。方面は集計方面（日報の方面）でそろえる。
  const rows = dashboardService_comparableContracts_({ area: area, from: periodFrom, to: periodTo }, scope || {});
  const prevRows = dashboardService_comparableContracts_({ area: area, from: prevFrom, to: prevTo }, scope || {});

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
  const periodFrom = filter.from || fiscalPeriodStartIso_(now);
  const periodTo = filter.to || formatDateISO_(now);

  const stores = storeRepo_getAll();
  const cases = caseRepo_getAll();
  const caseById = {};
  cases.forEach(function (c) { caseById[c.CASE_ID] = c; });
  // 成約数は、あとでキャンセルされた成約も含めた「成約した件数」（月次日報の全国店舗成約と同じ数え方）
  const contracts = sheetToObjects_(getSheet_(SHEET_NAMES.CONTRACTS))
    .filter(function (r) { const d = nippoService_isoDate_(r.契約日); return d && d >= periodFrom && d <= periodTo; });

  // 列は集計方面（方面マスタの日報方面。月次日報の全国店舗成約と同じ方面の単位）
  const areasFromMaster = areaGroupList_();

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
      const count = contracts.filter(function (r) { const c = caseById[r.CASE_ID]; return c && c.店舗ID === s.STORE_ID && areaGroupOf_(r.方面) === area; }).length;
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


/**
 * 指定した月（'yyyy-MM'の配列）のKPIを、月ごとに「実データ」と「HistoricalActuals（前年実績）」のどちらかから返す。
 *  ・本システム稼働前の月 … HistoricalActuals（過去の月次日報の取り込み、または手入力）
 *  ・本体シートに残っている年（今年・前年） … 実データ
 *  ・過去データアーカイブへ移した年 … アーカイブ時に保存した月次集計（登録者＝システム集計）があればそれを使い、
 *    無ければ（この仕組みより前に移した年）アーカイブ用スプレッドシートの実データから数える
 * HistoricalActualsにCXL数・PAXの列が入っている行（取り込み・システム集計）は、CXL・NET・PAX数も出す。
 * 手入力の行（来店数・成約数のみ）の月は、CXL・NET・PAX数がnull（画面では「—」）になる。
 */
function nippoService_monthlyKpisForMonths_(months, scope) {
  const startYm = nippoService_systemStartMonth_();
  const cutoffYear = new Date().getFullYear() - archiveService_keepYears_() + 1;
  const histByYm = nippoService_historicalByMonth_(scope);
  const result = {};
  let usedData = false, usedHist = false;
  months.forEach(function (ym) {
    const year = Number(ym.slice(0, 4));
    const hist = histByYm[ym];
    const preferHist = (startYm && ym < startYm) || year < cutoffYear;
    if (preferHist && hist) { result[ym] = hist; usedHist = true; return; }
    if (startYm && ym < startYm) { result[ym] = { hasData: false }; return; }
    const from = ym + '-01';
    const to = formatDateISO_(new Date(year, Number(ym.slice(5, 7)), 0));
    const live = nippoService_liveKpisForRange_(from, to, scope);
    if (live && live.hasData) { result[ym] = live; usedData = true; }
    else if (hist) { result[ym] = hist; usedHist = true; }
    else result[ym] = { hasData: false };
  });
  const source = usedData && usedHist ? 'mixed' : usedHist ? 'historical' : usedData ? 'data' : 'none';
  return { months: result, source: source };
}

/**
 * HistoricalActuals を（スコープで絞った上で）年月ごとに合計し、KPIの形にして返す。
 * { 'yyyy-MM': { hasData, 新規問合せ, NB, CXL, NET, PAX_NB, PAX_CXL, PAX_NET, fromHistorical } }
 */
function nippoService_historicalByMonth_(scope) {
  const storeById = {};
  storeRepo_getAll().forEach(function (s) { storeById[s.STORE_ID] = s; });
  const byYm = {};
  historicalActualsRepo_getAll().forEach(function (h) {
    if (scope && scope.storeId && h.店舗ID !== scope.storeId) return;
    if (scope && scope.region) { const s = storeById[h.店舗ID]; if (!s || s.地方 !== scope.region) return; }
    const ym = pastNippo_normYm_(h.年月);
    if (!ym) return;
    const cur = byYm[ym] || (byYm[ym] = { 新規問合せ: 0, NB: 0, CXL: 0, PAX_NB: 0, PAX_CXL: 0, hasDetail: false, rows: 0 });
    cur.rows += 1;
    cur.新規問合せ += Number(h.来店数) || 0;
    cur.NB += Number(h.成約数) || 0;
    if (h.CXL数 !== '' && h.CXL数 !== null && h.CXL数 !== undefined) {
      cur.hasDetail = true;
      cur.CXL += Number(h.CXL数) || 0;
      cur.PAX_NB += Number(h.NB_PAX) || 0;
      cur.PAX_CXL += Number(h.CXL_PAX) || 0;
    }
  });
  const result = {};
  Object.keys(byYm).forEach(function (ym) {
    const c = byYm[ym];
    result[ym] = {
      hasData: true, fromHistorical: true,
      新規問合せ: c.新規問合せ, NB: c.NB,
      CXL: c.hasDetail ? c.CXL : null, NET: c.hasDetail ? c.NB - c.CXL : null,
      未成約: null, 成約率: null,
      PAX_NB: c.hasDetail ? c.PAX_NB : null, PAX_CXL: c.hasDetail ? c.PAX_CXL : null,
      PAX_NET: c.hasDetail ? c.PAX_NB - c.PAX_CXL : null
    };
  });
  return result;
}

/**
 * 本システムの稼働開始月（'yyyy-MM'）。これより前の月は「実データなし」として HistoricalActuals を使う。
 * Settings の SYSTEM_START_MONTH があればそれを使い、無ければ本体シートで一番古い案件の受付月とする。
 */
let nippoService_startMonthCache_ = null;
function nippoService_systemStartMonth_() {
  if (nippoService_startMonthCache_ !== null) return nippoService_startMonthCache_;
  let ym = pastNippo_normYm_(getSetting_('SYSTEM_START_MONTH', ''));
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    ym = '';
    getColumnValues_(getSheet_(SHEET_NAMES.CASES), '受付日時').forEach(function (v) {
      const d = nippoService_isoDate_(v);
      if (d && (!ym || d.slice(0, 7) < ym)) ym = d.slice(0, 7);
    });
  }
  nippoService_startMonthCache_ = ym;
  return ym;
}

/** 日付の値（Date／'yyyy-MM-dd'文字列）を'yyyy-MM-dd'にそろえる。読めなければ'' */
function nippoService_isoDate_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : formatDateISO_(v);
  const m = String(v).trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + Number(m[2])).slice(-2) + '-' + ('0' + Number(m[3])).slice(-2) : '';
}

/**
 * 通期進捗管理（期ごとの月次推移）。期は11月始まり（Settings の FISCAL_START_MONTH）で、
 * 47期＝2026年11月〜2027年10月。今期・前期・前々期を並べ、月計のほか上期（前半6か月）・下期・通期の合計を出す
 * （月次日報の「通期」タブと同じ区切り）。
 * @param {number} periodsBack 何期分を並べるか（既定3＝今期・前期・前々期）
 */
function nippoService_getMultiYearTrend(filter, scope, periodsBack) {
  periodsBack = periodsBack || 3;
  const current = fiscalPeriodOf_(new Date());
  const periods = [];
  for (let i = 0; i < periodsBack; i++) periods.push(fiscalPeriodByStartYear_(current.startYear - i));

  const perPeriod = periods.map(function (p) {
    const r = nippoService_monthlyKpisForMonths_(p.months, scope);
    return { period: p, months: r.months, source: r.source };
  });

  function ratio(a, b) { return (a && a.hasData && b && b.hasData && b.NB > 0) ? Math.round((a.NB / b.NB) * 1000) / 10 : null; }
  const table = [];
  for (let i = 0; i < 12; i++) {
    const ym0 = periods[0].months[i];
    const row = { month: Number(ym0.slice(5, 7)) + '月', monthIndex: i };
    perPeriod.forEach(function (pp, idx) { row['y' + idx] = pp.months[pp.period.months[i]]; });
    row.前年比 = ratio(row.y0, row.y1);
    row.前々年比 = periodsBack >= 3 ? ratio(row.y0, row.y2) : null;
    table.push(row);
  }

  const FIELDS = ['新規問合せ', 'NB', 'CXL', 'NET', 'PAX_NB', 'PAX_NET'];
  function sumCells(cells) {
    const out = { hasData: false };
    FIELDS.forEach(function (f) {
      let sum = 0, any = false;
      cells.forEach(function (c) { if (c && c.hasData && c[f] !== null && c[f] !== undefined) { sum += c[f]; any = true; } });
      out[f] = any ? sum : null;
      if (any) out.hasData = true;
    });
    return out;
  }
  // 上期（期の前半6か月）・下期・通期の合計行
  const subtotals = [['上期', 0, 6], ['下期', 6, 12], ['通期', 0, 12]].map(function (d) {
    const row = { month: d[0] };
    perPeriod.forEach(function (pp, idx) { row['y' + idx] = sumCells(table.slice(d[1], d[2]).map(function (r) { return r['y' + idx]; })); });
    row.前年比 = ratio(row.y0, row.y1);
    row.前々年比 = periodsBack >= 3 ? ratio(row.y0, row.y2) : null;
    return row;
  });

  const totalsByPeriod = perPeriod.map(function (pp, idx) {
    const t = subtotals[2]['y' + idx];
    return Object.assign({ period: pp.period.period, label: pp.period.period + '期', startYear: pp.period.startYear, source: pp.source }, t);
  });

  return {
    periods: periods.map(function (p) { return { period: p.period, label: p.period + '期', fromIso: p.fromIso, toIso: p.toIso }; }),
    table: table, subtotals: subtotals, totalsByPeriod: totalsByPeriod
  };
}
