/**
 * pastDetailService.gs
 * 過去の月次日報の「明細」（1行＝1件の問合せ・キャンセル）を、CRMとは別のスプレッドシート
 * （HIS WEDDING CRM 過去日報明細）に期ごとのシートで保存し、稼働前の期間の内訳（担当者別・式場別・
 * プラン別・AGT別・媒体別・週次）の前年比に使う。
 *
 * ・CRM本体のスプレッドシートには入れない（重くしないため）。明細の保存先のIDは Settings の
 *   PAST_NIPPO_DETAIL_SPREADSHEET_ID に入る（最初の取り込みで自動作成）。
 * ・シートは期ごと（Entries_46期／Cancels_46期 …）。集計時は必要な期のシートだけを読む。
 * ・本システム稼働開始月（SYSTEM_START_MONTH）より前の期間だけに使い、稼働後は実データを使う。
 *
 * 数え方は月次日報の店舗タブの集計式に合わせる。
 *  ・新規＝区分が「新規」の行、成約（NB）＝問合結果が「成約」の行（既存の行も含む）、PAX＝CPL旅行＋列席旅行
 *  ・CXL：週次・月計は「AGTが入っている行」の数、担当者別・方面別・AGT別・式場別はキャンセル欄の全行の数
 *    （日報の集計式自体がこのように分かれている）
 *  ・媒体別：媒体1件目・2件目の両方を数える（日報の運用では媒体は新規の行にだけ入る）
 */

const PAST_DETAIL_ENTRY_HEADERS_ = ['取込元ID', '店舗ID', '区分', '問合せ方法', '媒体', '媒体2', '問合せNB日', '担当者', 'チャレンジ',
  'CPL旅行', '列席旅行', '挙式日', '方面', '問合結果', 'AGT', '式場', 'プラン', '備考'];
const PAST_DETAIL_CANCEL_HEADERS_ = ['取込元ID', '店舗ID', 'CXL日', '担当者', 'チャレンジ', '挙式日', 'PAX', '方面', 'AGT', '式場', '理由'];
const PAST_DETAIL_SETTING_KEY_ = 'PAST_NIPPO_DETAIL_SPREADSHEET_ID';

/* ---------- 保存先 ---------- */

/** 明細の保存先スプレッドシート。create=trueなら無いときに作る。無ければnull */
function pastDetail_spreadsheet_(create) {
  const id = String(getSetting_(PAST_DETAIL_SETTING_KEY_, '') || '').trim();
  if (id) return SpreadsheetApp.openById(id);
  if (!create) return null;
  const ss = SpreadsheetApp.create('HIS WEDDING CRM 過去日報明細');
  saveSetting_(PAST_DETAIL_SETTING_KEY_, ss.getId(), '過去の月次日報の明細の保存先（自動作成。担当者別・式場別などの前年比に使う）');
  return ss;
}

function pastDetail_sheetName_(kind, period) { return kind + '_' + period + '期'; }

/** 1つのファイルから読んだ明細を、期ごとのシートに入れ直す（同じファイルの前回分は消してから入れる） */
function pastDetail_replaceFileRows_(fileId, parsed, storeMap) {
  const ss = pastDetail_spreadsheet_(true);
  const byKind = { Entries: {}, Cancels: {} };
  parsed.tabs.forEach(function (t) {
    const storeId = storeMap[t.tabName];
    if (!storeId || storeId === PAST_NIPPO_SKIP_STORE_) return;
    t.entries.forEach(function (e) {
      if (!e.nbDate) return;
      const period = fiscalPeriodOf_(e.nbDate).period;
      (byKind.Entries[period] = byKind.Entries[period] || []).push([fileId, storeId, e.type, e.method, e.media, e.media2 || '', e.nbDate,
        e.staff, e.challenge, e.cplTour, e.guestTour, e.weddingDate || '', e.area, e.result, e.agt, e.venue, e.plan, e.reason || '']);
    });
    t.cancels.forEach(function (c) {
      if (!c.cxlDate) return;
      const period = fiscalPeriodOf_(c.cxlDate).period;
      (byKind.Cancels[period] = byKind.Cancels[period] || []).push([fileId, storeId, c.cxlDate, c.staff, c.challenge, c.weddingDate || '',
        c.pax, c.area, c.agt, c.venue, c.reason || '']);
    });
  });
  ['Entries', 'Cancels'].forEach(function (kind) {
    const headers = kind === 'Entries' ? PAST_DETAIL_ENTRY_HEADERS_ : PAST_DETAIL_CANCEL_HEADERS_;
    const periods = {};
    Object.keys(byKind[kind]).forEach(function (p) { periods[p] = true; });
    ss.getSheets().forEach(function (sh) {
      const m = sh.getName().match(new RegExp('^' + kind + '_(\\d+)期$'));
      if (m) periods[m[1]] = true;
    });
    Object.keys(periods).forEach(function (period) {
      const name = pastDetail_sheetName_(kind, period);
      let sheet = ss.getSheetByName(name);
      const newRows = byKind[kind][period] || [];
      if (!sheet) {
        if (newRows.length === 0) return;
        sheet = ss.insertSheet(name);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
      }
      const lastRow = sheet.getLastRow();
      const kept = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().filter(function (r) { return r[0] !== fileId; }) : [];
      const all = kept.concat(newRows);
      if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
      if (all.length) sheet.getRange(2, 1, all.length, headers.length).setValues(all);
    });
  });
  pastDetail_cache_ = {};
}

/** 保存した明細をすべて消す（見出しは残す） */
function pastDetail_clearAll_() {
  const ss = pastDetail_spreadsheet_(false);
  if (!ss) return;
  ss.getSheets().forEach(function (sh) {
    if (!/^(Entries|Cancels)_\d+期$/.test(sh.getName())) return;
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  pastDetail_cache_ = {};
}

/* ---------- 読み出し ---------- */

let pastDetail_cache_ = {};

/** 期間（from〜to）にかかる期のシートを読み、日付で絞った明細を返す。保存先が無ければnull */
function pastDetail_load_(kind, fromIso, toIso) {
  const ss = pastDetail_spreadsheet_(false);
  if (!ss) return null;
  const dateCol = kind === 'Entries' ? '問合せNB日' : 'CXL日';
  const firstPeriod = fiscalPeriodOf_(new Date(fromIso + 'T00:00:00')).period;
  const lastPeriod = fiscalPeriodOf_(new Date(toIso + 'T00:00:00')).period;
  let rows = [];
  let anySheet = false;
  for (let p = firstPeriod; p <= lastPeriod; p++) {
    const name = pastDetail_sheetName_(kind, p);
    if (!pastDetail_cache_[name]) {
      const sheet = ss.getSheetByName(name);
      pastDetail_cache_[name] = sheet ? sheetToObjects_(sheet).map(function (r) { r.__date = nippoService_isoDate_(r[dateCol]); return r; }) : 'none';
    }
    if (pastDetail_cache_[name] === 'none') continue;
    anySheet = true;
    rows = rows.concat(pastDetail_cache_[name]);
  }
  if (!anySheet) return null;
  return rows.filter(function (r) { return r.__date && r.__date >= fromIso && r.__date <= toIso; });
}

/** スコープ（店舗・地方）で絞る */
function pastDetail_scope_(rows, scope) {
  if (!rows || !scope) return rows;
  if (scope.storeId) return rows.filter(function (r) { return r.店舗ID === scope.storeId; });
  if (scope.region) {
    const storeById = {};
    storeRepo_getAll().forEach(function (s) { storeById[s.STORE_ID] = s; });
    return rows.filter(function (r) { const s = storeById[r.店舗ID]; return s && s.地方 === scope.region; });
  }
  return rows;
}

function pastDetail_entries_(fromIso, toIso, scope) { return pastDetail_scope_(pastDetail_load_('Entries', fromIso, toIso), scope); }
function pastDetail_cancels_(fromIso, toIso, scope) { return pastDetail_scope_(pastDetail_load_('Cancels', fromIso, toIso), scope) || []; }

function pastDetail_pax_(r) { return (Number(r.CPL旅行) || 0) + (Number(r.列席旅行) || 0); }

/**
 * 期間のKPI（週次・月次と同じ形）。明細の保存先が無い（取り込んでいない）期間なら { hasData:false }。
 * CXLは週次・月計の集計式と同じく「AGTが入っているキャンセル行」の数。
 */
function pastDetail_kpis_(fromIso, toIso, scope) {
  const entries = pastDetail_entries_(fromIso, toIso, scope);
  if (entries === null) return { hasData: false };
  const cancels = pastDetail_cancels_(fromIso, toIso, scope);
  let 新規問合せ = 0, NB = 0, PAX_NB = 0, CXL = 0, PAX_CXL = 0;
  entries.forEach(function (e) {
    if (e.区分 === '新規') 新規問合せ += 1;
    if (e.問合結果 === '成約') NB += 1;
    PAX_NB += pastDetail_pax_(e);
  });
  cancels.forEach(function (c) {
    if (String(c.AGT || '').trim()) CXL += 1;
    PAX_CXL += Number(c.PAX) || 0;
  });
  return {
    hasData: true, fromPastDetail: true, 新規問合せ: 新規問合せ, NB: NB, CXL: CXL, 未成約: null, NET: NB - CXL,
    成約率: null, PAX_NB: PAX_NB, PAX_CXL: PAX_CXL, PAX_NET: PAX_NB - PAX_CXL
  };
}

/**
 * 成約の明細を、CRMのContractsと同じ形（ランキング・エリア進捗の集計にそのまま使える形）にして返す。
 * フォトかどうかは日報の「プラン」が「フォトプラン」かで判定する（日報の挙式／フォトの集計式と同じ）。
 */
function pastDetail_contractLikeRows_(fromIso, toIso, scope) {
  const entries = pastDetail_entries_(fromIso, toIso, scope);
  if (!entries) return [];
  return entries.filter(function (e) { return e.問合結果 === '成約'; }).map(function (e) {
    return {
      CASE_ID: '', 契約日: e.__date, 方面: e.方面, 式場: e.式場, プラン: e.プラン, 現地会社: e.AGT,
      CPL旅行人数: e.CPL旅行, 列席旅行人数: e.列席旅行, 契約担当: e.担当者, 有効フラグ: true, __past: true,
      __case: { 店舗ID: e.店舗ID, 相談区分: e.プラン === 'フォトプラン' ? 'フォト' : '挙式' }
    };
  });
}

/* ---------- 期間の分割（稼働前は明細、稼働後は実データ） ---------- */

/**
 * 期間を「稼働前の部分」と「稼働後の部分」に分ける。
 * @return {Object} { past: {from,to}|null, live: {from,to}|null }
 */
function pastDetail_splitRange_(fromIso, toIso) {
  const startYm = nippoService_systemStartMonth_();
  if (!startYm) return { past: null, live: { from: fromIso, to: toIso } };
  const startIso = startYm + '-01';
  if (toIso < startIso) return { past: { from: fromIso, to: toIso }, live: null };
  if (fromIso >= startIso) return { past: null, live: { from: fromIso, to: toIso } };
  const dayBefore = formatDateISO_(addDays_(new Date(startIso + 'T00:00:00'), -1));
  return { past: { from: fromIso, to: dayBefore }, live: { from: startIso, to: toIso } };
}

/* ---------- 方面のまとめ（集計方面） ---------- */

let areaGroup_cache_ = null;
function areaGroup_normKey_(s) { return String(s || '').replace(/[\s　・\/／･]/g, ''); }

/**
 * 方面名を「集計方面」（月次日報の方面の呼び方）にそろえる。
 * 方面マスタ（Areas）の「日報方面」列に入っている名前を使い、空欄ならその方面名のまま。
 * 過去の日報の方面（例：「バリ島・他アジア」「バリ島/他アジア」）は、区切り文字を無視して日報方面と照合する。
 * 前年比のある集計（積み上げ・方面内ランキング・エリア進捗）は、この集計方面の単位で比べる。
 */
function areaGroupOf_(name) {
  if (areaGroup_cache_ === null) {
    areaGroup_cache_ = { byName: {}, byKey: {} };
    areaRepo_getAll().forEach(function (a) {
      const group = String(a.日報方面 || '').trim() || String(a.方面名 || '').trim();
      areaGroup_cache_.byName[String(a.方面名 || '').trim()] = group;
      areaGroup_cache_.byKey[areaGroup_normKey_(group)] = group;
    });
  }
  const n = String(name || '').trim();
  if (!n) return '';
  if (areaGroup_cache_.byName[n]) return areaGroup_cache_.byName[n];
  return areaGroup_cache_.byKey[areaGroup_normKey_(n)] || n;
}

/** 集計方面の一覧（方面マスタの表示順。使用終了の方面は除く） */
function areaGroupList_() {
  const seen = {};
  const list = [];
  areaRepo_getAll()
    .filter(function (a) { return a.使用終了 !== true && a.使用終了 !== 'TRUE'; })
    .sort(function (a, b) { return (Number(a.表示順) || 0) - (Number(b.表示順) || 0); })
    .forEach(function (a) {
      const g = areaGroupOf_(a.方面名);
      if (g && !seen[g]) { seen[g] = true; list.push(g); }
    });
  return list;
}

/* ---------- 担当者名（日報の表記 → CRMの担当者） ---------- */

let staffAlias_cache_ = null;
/**
 * 日報の担当者名をCRMの担当者の氏名にそろえる。担当者マスタ（Staff）の「日報での表記」列に日報の書き方
 * （例：姓だけ）を入れておくと、その担当者の氏名に置き換える。無ければ日報の表記のまま。
 */
function staffNameFromNippo_(name) {
  if (staffAlias_cache_ === null) {
    staffAlias_cache_ = {};
    staffRepo_getAll().forEach(function (s) {
      String(s.日報での表記 || '').split(/[、,／\/]/).forEach(function (alias) {
        const k = alias.replace(/[\s　]/g, '');
        if (k) staffAlias_cache_[k] = s.氏名;
      });
    });
  }
  const k = String(name || '').replace(/[\s　]/g, '');
  return staffAlias_cache_[k] || String(name || '').trim();
}
