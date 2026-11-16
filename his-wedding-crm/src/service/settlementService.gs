/**
 * settlementService.gs
 * 精算（施行が終わった後の売上・原価）の入力と集計。本部・手配課・管理者だけが見られる（controller側で必ず確認する）。
 *
 * いま運用している精算スプレッドシート（方面別シート＋【集計】FNL件数・【集計】売上・粗利）と同じ集計を出す。
 *  ・1案件に複数の精算行を持てる（本体と、衣裳の組み込み分など）。
 *  ・計上月（yyyy-MM）で月に振り分ける。期は11月始まり（Settings の FISCAL_START_MONTH）。
 *  ・AVA／一般は店舗マスタの区分で分ける（取り込んだ過去分は、元のシートの「アバンティ」「一般店舗」の欄で分ける）。
 *  ・売上・原価・粗利・原価率：すべての行（衣裳・CXLも含む）を合計する（元の【集計】売上・粗利と同じ）。
 *  ・FNL件数：衣裳の行を除き、CXLでない行の数（元の【集計】FNL件数＝AGT別件数（CXL含む）−CXL件数と同じ）。
 *  ・式場別・プラン別の件数：その式場名・プラン名の行をすべて数える（元の方面別シート上部の表と同じ）。
 *
 * 過去分（取り込んだ精算スプレッドシート）は、過去日報明細と同じ別スプレッドシートの Settlements_○期 シートにあり、
 * 同じチャレンジ番号の精算がCRMにある場合は、CRMの方を使う（移行期間に二重に数えないため）。
 */

const SETTLEMENT_KINDS_ = ['挙式', 'フォト'];
const SETTLEMENT_TYPES_ = ['本体', '衣裳'];
const SETTLEMENT_SEGMENTS_ = ['AVA', '一般'];

/* ---------- 入力 ---------- */

function settlementRepo_sheet_() {
  return getOrCreateSheet_(SHEET_NAMES.SETTLEMENTS, SETTLEMENT_HEADERS_);
}

function settlementRepo_getByCaseId(caseId) {
  return sheetToObjects_(settlementRepo_sheet_()).filter(function (r) { return r.CASE_ID === caseId; })
    .sort(function (a, b) { return String(pastNippo_normYm_(a.計上月)).localeCompare(String(pastNippo_normYm_(b.計上月))); });
}

/** 金額の入力値を数値にする（カンマ・円・空白を除く）。空欄は0。数字でなければエラー */
function settlement_amount_(v, label) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[,，円¥\s]/g, ''));
  if (isNaN(n)) throw new AppError('VALIDATION', label + 'は数字で入力してください。');
  return n;
}

function settlement_isCxl_(v) {
  return v === true || v === 'TRUE' || v === 'CXL' || v === 'cxl' || v === '○' || v === 1 || v === '1';
}

/** 精算行を追加・更新する。obj.SETTLEMENT_ID があれば更新 */
function settlementService_save(obj, ctx) {
  const caseRecord = caseRepo_getById(obj.CASE_ID);
  if (!caseRecord) throw new AppError('VALIDATION', '対象の案件が見つかりません。');
  const ym = pastNippo_normYm_(obj.計上月);
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new AppError('VALIDATION', '計上月を「2026-12」の形で入力してください。');
  if (SETTLEMENT_KINDS_.indexOf(obj.区分) === -1) throw new AppError('VALIDATION', '区分は「挙式」か「フォト」を選んでください。');
  const type = obj.種別 || '本体';
  if (SETTLEMENT_TYPES_.indexOf(type) === -1) throw new AppError('VALIDATION', '種別は「本体」か「衣裳」を選んでください。');
  const contract = caseRepo_getContractsByCaseId(obj.CASE_ID)[0];
  const record = {
    CASE_ID: obj.CASE_ID,
    チャレンジ番号: caseRecord.チャレンジ番号 || '',
    店舗ID: caseRecord.店舗ID || '',
    方面: obj.方面 || (contract ? contract.方面 : '') || '',
    計上月: ym, 区分: obj.区分, 種別: type,
    AGT: String(obj.AGT || '').trim(), 式場: String(obj.式場 || '').trim(), プラン: String(obj.プラン || '').trim(),
    売上: settlement_amount_(obj.売上, '売上'), 原価: settlement_amount_(obj.原価, '原価'),
    CXL: settlement_isCxl_(obj.CXL), メモ: String(obj.メモ || '').slice(0, 1000),
    更新者: ctx.name || ctx.email, 更新日時: new Date()
  };
  const sheet = settlementRepo_sheet_();
  let id = obj.SETTLEMENT_ID;
  if (id) {
    const rowIndex = findRowIndexByKey_(sheet, 'SETTLEMENT_ID', id);
    if (rowIndex === -1) throw new AppError('VALIDATION', '更新する精算行が見つかりません。');
    const current = getRowAsObject_(sheet, rowIndex);
    if (current.CASE_ID !== obj.CASE_ID) throw new AppError('VALIDATION', '別の案件の精算行は更新できません。');
    updateRowAtIndex_(sheet, rowIndex, record);
  } else {
    id = 'ST-' + Utilities.getUuid().slice(0, 8);
    appendRowFromObject_(sheet, Object.assign({ SETTLEMENT_ID: id, 登録者: ctx.name || ctx.email, 登録日時: new Date() }, record));
  }
  // 計上月は「2026-12」の文字列のまま保つ（日付に自動変換されないように）
  const rowIndex = findRowIndexByKey_(sheet, 'SETTLEMENT_ID', id);
  const headerMap = getHeaderMap_(sheet);
  sheet.getRange(rowIndex, headerMap['計上月'] + 1).setNumberFormat('@').setValue(ym);
  writeSystemLog_({ 実行者: ctx.email, 操作種別: 'SAVE_SETTLEMENT', 対象CASE_ID: obj.CASE_ID,
    変更前後の値の要約: id + ' 計上月=' + ym + ' 売上=' + record.売上 + ' 原価=' + record.原価 });
  return { settlementId: id };
}

function settlementService_delete(settlementId, ctx) {
  const sheet = settlementRepo_sheet_();
  const rowIndex = findRowIndexByKey_(sheet, 'SETTLEMENT_ID', settlementId);
  if (rowIndex === -1) throw new AppError('VALIDATION', '精算行が見つかりません。');
  const row = getRowAsObject_(sheet, rowIndex);
  caseMerge_backupRows_(SHEET_NAMES.SETTLEMENTS, [row], 'DELETE_SETTLEMENT', row.CASE_ID, '', ctx);
  sheet.deleteRow(rowIndex);
  writeSystemLog_({ 実行者: ctx.email, 操作種別: 'DELETE_SETTLEMENT', 対象CASE_ID: row.CASE_ID, 変更前後の値の要約: settlementId });
}

/** 案件詳細の精算タブ用：精算行と、新しく入力するときの初期値（成約・手配から） */
function settlementService_forCase(caseId) {
  const caseRecord = caseRepo_getById(caseId);
  const contract = caseRepo_getContractsByCaseId(caseId)[0] || {};
  const op = operationRepo_getByCaseId(caseId) || {};
  const wd = nippoService_isoDate_(op['挙式日（撮影日）']);
  return {
    rows: settlementRepo_getByCaseId(caseId).map(function (r) {
      const out = Object.assign({}, r);
      out.計上月 = pastNippo_normYm_(r.計上月);
      out.粗利 = (Number(r.売上) || 0) - (Number(r.原価) || 0);
      out.原価率 = Number(r.売上) ? Math.round((Number(r.原価) / Number(r.売上)) * 1000) / 10 : null;
      delete out.__row;
      return out;
    }),
    defaults: {
      区分: caseRecord && caseRecord.相談区分 === 'フォト' ? 'フォト' : '挙式',
      方面: contract.方面 || '', 式場: contract.式場 || '', プラン: contract.プラン || '', AGT: contract.現地会社 || '',
      // 計上月の初期値は挙式日（撮影日）の月。無ければ今月
      計上月: wd ? wd.slice(0, 7) : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM')
    }
  };
}

/* ---------- 集計の元になる行 ---------- */

/**
 * 期間（計上月 fromYm〜toYm）の精算行を、CRMの入力分・アーカイブ分・取り込んだ過去分からまとめて返す。
 * 各行：{ 計上月, 店舗ID, 店舗区分(AVA/一般), 地方, 方面(集計方面), 区分(挙式/フォト), 種別(本体/衣裳), AGT, 式場, プラン,
 *         売上, 原価, CXL, チャレンジ番号, CASE_ID, 出所 }
 * @param {Object} scope { storeId, region }
 */
function settlement_rows_(fromYm, toYm, scope) {
  scope = scope || {};
  const storeById = {};
  storeRepo_getAll().forEach(function (s) { storeById[s.STORE_ID] = s; });
  const out = [];
  const crmChallenges = {};

  function normChallenge(v) { return String(v === null || v === undefined ? '' : v).replace(/[\s\t]/g, ''); }
  function push(r, source, segmentOverride) {
    const ym = pastNippo_normYm_(r.計上月);
    if (!ym || ym < fromYm || ym > toYm) return;
    const store = storeById[r.店舗ID];
    const segment = segmentOverride || (store ? (store.区分 === 'AVA' ? 'AVA' : '一般') : '');
    const region = store ? store.地方 : (r.地方 || '');
    if (scope.storeId && r.店舗ID !== scope.storeId) return;
    if (scope.region && region !== scope.region) return;
    out.push({
      計上月: ym, 店舗ID: r.店舗ID || '', 店舗名: store ? store.店舗名 : '', 店舗区分: segment, 地方: region,
      方面: areaGroupOf_(r.方面) || '未設定', 区分: r.区分 === 'フォト' ? 'フォト' : '挙式', 種別: r.種別 === '衣裳' ? '衣裳' : '本体',
      AGT: String(r.AGT || '').trim() || '未設定', 式場: String(r.式場 || '').trim(), プラン: String(r.プラン || '').trim(),
      売上: Number(r.売上) || 0, 原価: Number(r.原価) || 0, CXL: settlement_isCxl_(r.CXL),
      チャレンジ番号: normChallenge(r.チャレンジ番号), CASE_ID: r.CASE_ID || '', 出所: source
    });
  }

  // 1. CRMの入力分（本体シート）
  sheetToObjects_(settlementRepo_sheet_()).forEach(function (r) {
    crmChallenges[normChallenge(r.チャレンジ番号)] = true;
    push(r, 'CRM');
  });
  // 2. アーカイブへ移した年の分
  const cutoffYear = new Date().getFullYear() - archiveService_keepYears_() + 1;
  const fromYear = Number(fromYm.slice(0, 4)), toYear = Number(toYm.slice(0, 4));
  for (let y = fromYear; y <= Math.min(toYear + 1, cutoffYear - 1); y++) {
    const ss = archiveService_openYear_(y);
    const sh = ss ? ss.getSheetByName(SHEET_NAMES.SETTLEMENTS) : null;
    if (!sh) continue;
    sheetToObjects_(sh).forEach(function (r) { crmChallenges[normChallenge(r.チャレンジ番号)] = true; push(r, 'CRM（アーカイブ）'); });
  }
  // 3. 取り込んだ過去の精算スプレッドシート（同じチャレンジ番号の精算がCRMにあれば使わない）
  const pastSs = pastDetail_spreadsheet_(false);
  if (pastSs) {
    const firstP = fiscalPeriodOf_(new Date(fromYm + '-01T00:00:00')).period;
    const lastP = fiscalPeriodOf_(new Date(toYm + '-01T00:00:00')).period;
    for (let p = firstP; p <= lastP; p++) {
      const sh = pastSs.getSheetByName('Settlements_' + p + '期');
      if (!sh) continue;
      sheetToObjects_(sh).forEach(function (r) {
        const ch = normChallenge(r.チャレンジ番号);
        if (ch && crmChallenges[ch]) return;
        push(r, '取込', r.店舗区分 === 'AVA' || r.店舗区分 === '一般' ? r.店舗区分 : '');
      });
    }
  }
  return out;
}

function settlement_periodMonths_(filter) {
  const cur = filter && filter.periodStartYear ? fiscalPeriodByStartYear_(Number(filter.periodStartYear)) : fiscalPeriodOf_(new Date());
  const prev = fiscalPeriodByStartYear_(cur.startYear - 1);
  return { cur: cur, prev: prev };
}

function settlement_areaOrder_(rows) {
  const list = areaGroupList_().slice();
  rows.forEach(function (r) { if (list.indexOf(r.方面) === -1) list.push(r.方面); });
  return list;
}

/* ---------- 売上・原価・粗利（【集計】売上・粗利） ---------- */

/**
 * 方面×（AVA／一般／合計）×（挙式／フォト）×月 の売上・原価。前期の同じ表も返す。
 * 粗利・原価率・上期・下期・通期は画面側で計算する。
 * @return {Object} { period, prevPeriod, months, areas:[{ area, cur:{AVA:{挙式:{売上:[12],原価:[12]},フォト:…},一般:…,合計:…}, prev:{…} }] }
 */
function settlementService_getSalesSummary(filter, scope) {
  const pm = settlement_periodMonths_(filter);
  const curRows = settlement_rows_(pm.cur.months[0], pm.cur.months[11], scope);
  const prevRows = settlement_rows_(pm.prev.months[0], pm.prev.months[11], scope);
  function emptyTable() {
    const t = {};
    SETTLEMENT_SEGMENTS_.concat(['合計']).forEach(function (seg) {
      t[seg] = {};
      SETTLEMENT_KINDS_.forEach(function (k) { t[seg][k] = { 売上: new Array(12).fill(0), 原価: new Array(12).fill(0) }; });
    });
    return t;
  }
  function fill(tables, rows, months) {
    rows.forEach(function (r) {
      const mi = months.indexOf(r.計上月);
      if (mi === -1) return;
      [r.方面, '全体'].forEach(function (area) {
        const t = tables[area] || (tables[area] = emptyTable());
        [r.店舗区分 || '一般', '合計'].forEach(function (seg) {
          if (!t[seg]) return;
          t[seg][r.区分].売上[mi] += r.売上;
          t[seg][r.区分].原価[mi] += r.原価;
        });
      });
    });
  }
  const cur = {}, prev = {};
  fill(cur, curRows, pm.cur.months);
  fill(prev, prevRows, pm.prev.months);
  const areas = settlement_areaOrder_(curRows.concat(prevRows)).filter(function (a) { return cur[a] || prev[a]; });
  areas.push('全体');
  return {
    period: pm.cur.period, prevPeriod: pm.prev.period,
    months: pm.cur.months.map(function (ym) { return Number(ym.slice(5, 7)) + '月'; }),
    areas: areas.map(function (a) { return { area: a, cur: cur[a] || emptyTable(), prev: prev[a] || emptyTable() }; })
  };
}

/* ---------- FNL件数（【集計】FNL件数） ---------- */

/**
 * AGT×月×（挙式／フォト）の件数を、AVA・一般・合計で返す（方面ごと＋全方面）。
 * 件数＝衣裳の行を除き、CXLでない行の数（元の集計：AGT別件数−CXL件数と同じ）。CXL件数・前期の通期計も返す。
 */
function settlementService_getFnlCounts(filter, scope) {
  const pm = settlement_periodMonths_(filter);
  const curRows = settlement_rows_(pm.cur.months[0], pm.cur.months[11], scope).filter(function (r) { return r.種別 === '本体'; });
  const prevRows = settlement_rows_(pm.prev.months[0], pm.prev.months[11], scope).filter(function (r) { return r.種別 === '本体'; });

  function emptyAgt() {
    const t = {};
    SETTLEMENT_SEGMENTS_.concat(['合計']).forEach(function (seg) {
      t[seg] = {};
      SETTLEMENT_KINDS_.forEach(function (k) { t[seg][k] = new Array(12).fill(0); });
    });
    t.CXL = { 挙式: 0, フォト: 0 };
    t.前期 = { 挙式: 0, フォト: 0 };
    return t;
  }
  const sections = {};
  function sec(area) { return sections[area] || (sections[area] = {}); }
  curRows.forEach(function (r) {
    const mi = pm.cur.months.indexOf(r.計上月);
    [r.方面, '全体'].forEach(function (area) {
      const s = sec(area);
      const t = s[r.AGT] || (s[r.AGT] = emptyAgt());
      // 元の集計は「AGT別の行数（CXLの行も含む）−CXLの行数」＝CXLでない行の数。CXLは別に数える
      if (r.CXL) { t.CXL[r.区分] += 1; return; }
      [r.店舗区分 || '一般', '合計'].forEach(function (seg) { if (t[seg]) t[seg][r.区分][mi] += 1; });
    });
  });
  prevRows.forEach(function (r) {
    [r.方面, '全体'].forEach(function (area) {
      const s = sec(area);
      const t = s[r.AGT] || (s[r.AGT] = emptyAgt());
      if (!r.CXL) t.前期[r.区分] += 1;
    });
  });
  const areas = settlement_areaOrder_(curRows.concat(prevRows)).filter(function (a) { return sections[a]; });
  areas.push('全体');
  return {
    period: pm.cur.period, prevPeriod: pm.prev.period,
    months: pm.cur.months.map(function (ym) { return Number(ym.slice(5, 7)) + '月'; }),
    areas: areas.filter(function (a) { return sections[a]; }).map(function (a) {
      const agts = Object.keys(sections[a]).sort();
      return { area: a, agts: agts.map(function (g) { return Object.assign({ agt: g }, sections[a][g]); }) };
    })
  };
}

/* ---------- 式場別・プラン別（方面別シート上部の表） ---------- */

/** 期間（計上月 fromYm〜toYm。省略時は今期）の式場別・プラン別の件数（AVA／一般）。filter.area で方面を絞る */
function settlementService_getBreakdown(filter, scope) {
  filter = filter || {};
  const pm = settlement_periodMonths_(filter);
  const fromYm = filter.fromYm || pm.cur.months[0];
  const toYm = filter.toYm || pm.cur.months[11];
  let rows = settlement_rows_(fromYm, toYm, scope);
  if (filter.area) rows = rows.filter(function (r) { return r.方面 === filter.area; });
  function count(field) {
    const m = {};
    rows.forEach(function (r) {
      const k = r[field] || '未設定';
      m[k] = m[k] || { label: k, AVA: 0, 一般: 0, 計: 0 };
      m[k][r.店舗区分 === 'AVA' ? 'AVA' : '一般'] += 1;
      m[k].計 += 1;
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.計 - a.計; });
  }
  return { fromYm: fromYm, toYm: toYm, area: filter.area || '', venues: count('式場'), plans: count('プラン') };
}

/* ---------- 明細一覧 ---------- */

function settlementService_getList(filter, scope) {
  filter = filter || {};
  const pm = settlement_periodMonths_(filter);
  const fromYm = filter.fromYm || pm.cur.months[0];
  const toYm = filter.toYm || pm.cur.months[11];
  let rows = settlement_rows_(fromYm, toYm, scope);
  if (filter.area) rows = rows.filter(function (r) { return r.方面 === filter.area; });
  if (filter.agt) rows = rows.filter(function (r) { return r.AGT === filter.agt; });
  if (filter.segment) rows = rows.filter(function (r) { return r.店舗区分 === filter.segment; });
  return {
    fromYm: fromYm, toYm: toYm,
    rows: rows.map(function (r) {
      r.粗利 = r.売上 - r.原価;
      r.原価率 = r.売上 ? Math.round((r.原価 / r.売上) * 1000) / 10 : null;
      return r;
    }).sort(function (a, b) { return a.計上月.localeCompare(b.計上月) || a.方面.localeCompare(b.方面); })
  };
}
