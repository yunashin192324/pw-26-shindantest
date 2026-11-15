/**
 * pastNippoImportService.gs
 * 過去の月次日報スプレッドシート（例：「47期AVA日報12月」）を読み、店舗×方面×月の集計値として
 * HistoricalActuals（前年実績）に反映する。CRMのダッシュボード・日報画面の前年比較に使われる。
 *
 * ■ 使い方（Apps Scriptエディタで関数を選んで実行する）
 *   1. pastNippo_setup()   … CRMのデータ用スプレッドシートに「PastNippoSources」「PastNippoStoreMap」シートを作る
 *   2. PastNippoSources のA列に、取り込みたい月次日報スプレッドシートのURLを1行に1つずつ貼る
 *   3. pastNippo_preview() … 読むだけ（書き込まない）。件数・注意点をメモ欄に出し、タブ名と店舗の対応表を作る
 *   4. PastNippoStoreMap の「店舗ID」列を確認・修正する（取り込まないタブは「対象外」と入れる）
 *   5. pastNippo_import()  … 取り込む。6分の実行時間制限に近づいたら、1分後に自動で続きから再開する
 *
 * ■ 明細はCRMに持ち込まない
 *   元の月次日報スプレッドシートはそのまま残し、CRMには「店舗×方面×月」の集計値だけを入れる
 *   （CRMのスプレッドシートを重くしないため）。集計値は、ファイルごとに PastNippoMonthly に保存してから
 *   HistoricalActuals（登録者＝日報取込）へまとめ直すので、同じファイルを何度取り込んでも二重にならない。
 *
 * ■ 数え方（月次日報の各店舗タブの集計式に合わせている）
 *   ・新規問合せ … 区分が「新規」の行の数（問合せNB日の月で数える）
 *   ・成約数     … 問合結果が「成約」の行の数（「既存」の行も含む。問合せNB日の月）
 *   ・NB_PAX     … CPL旅行＋列席旅行の人数の合計（全行。問合せNB日の月）
 *   ・CXL数      … キャンセル欄で、AGTが入っている行の数（CXL年月日の月）
 *   ・CXL_PAX    … キャンセル欄のPAXの合計（CXL年月日の月）
 *   ・挙式月成約数 … 成約の行を、挙式日の月で数えたもの（月別・方面別の積み上げの前年着地に使う）
 *   問合せNB日が空欄の行は、月次日報の集計式でも数えられていないため取り込まない（件数はメモ欄に出す）。
 *
 * ■ CRMの「来店数」との対応
 *   HistoricalActualsの「来店数」には新規問合せの数を入れる（日報の新規問合せ＝CRMの案件数として扱う）。
 */

const PAST_NIPPO_IMPORTER_ = '日報取込';
const PAST_NIPPO_TIME_LIMIT_MS_ = 4.5 * 60 * 1000;
const PAST_NIPPO_READ_COLS_ = 34; // A〜AH列（明細欄はこの範囲に収まっている）
const PAST_NIPPO_STATUS_ = { DONE: '取込済み', CHECKED: '確認済み', ERROR: 'エラー' };
const PAST_NIPPO_SKIP_STORE_ = '対象外';

// 見出しが見つからない列に使う既定の位置（0始まり）
const PAST_NIPPO_ENTRY_COLS_ = {
  type: 1, method: 2, media: 4, nbDate: 8, staff: 10, challenge: 11, cplTour: 13, guestTour: 14,
  weddingDate: 15, area: 17, result: 19, agt: 20, venue: 21, plan: 25, reason: 27
};
const PAST_NIPPO_CANCEL_COLS_ = { cxlDate: 1, staff: 3, challenge: 4, weddingDate: 6, pax: 8, area: 9, agt: 11, venue: 12, reason: 16 };

// ==========================================
// 実行用の関数（エディタから実行する）
// ==========================================

function pastNippo_setup() {
  const src = getOrCreateSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES, PAST_NIPPO_SOURCES_HEADERS_);
  getOrCreateSheet_(SHEET_NAMES.PAST_NIPPO_STORE_MAP, PAST_NIPPO_STORE_MAP_HEADERS_);
  getOrCreateSheet_(SHEET_NAMES.PAST_NIPPO_MONTHLY, PAST_NIPPO_MONTHLY_HEADERS_);
  ensureColumns_(getSheet_(SHEET_NAMES.HISTORICAL_ACTUALS), HISTORICAL_ACTUALS_EXTRA_HEADERS_);
  src.setColumnWidth(1, 420);
  src.setColumnWidth(6, 520);
  Logger.log('「' + SHEET_NAMES.PAST_NIPPO_SOURCES + '」シートのA列に、取り込みたい月次日報スプレッドシートのURLを1行に1つずつ貼り付けてから、' +
    'pastNippo_preview を実行してください。');
}

/** 読むだけ（書き込まない）。件数・注意点をメモ欄に書き、タブ名と店舗の対応表に新しいタブを追加する */
function pastNippo_preview() {
  return pastNippo_process_(false);
}

/** 取り込む。時間切れになったら1分後に自動で続きを実行する */
function pastNippo_import() {
  return pastNippo_process_(true);
}

/** 自動再開用（pastNippo_import が時間切れのときに設定するトリガーから呼ばれる） */
function pastNippo_continueImport() {
  pastNippo_deleteContinueTriggers_();
  return pastNippo_process_(true);
}

/** 取り込んだ集計値をすべて取り消す（HistoricalActualsの「日報取込」の行とPastNippoMonthlyを消す） */
function pastNippo_clearImported() {
  const monthly = getOrCreateSheet_(SHEET_NAMES.PAST_NIPPO_MONTHLY, PAST_NIPPO_MONTHLY_HEADERS_);
  if (monthly.getLastRow() > 1) monthly.getRange(2, 1, monthly.getLastRow() - 1, monthly.getLastColumn()).clearContent();
  const result = pastNippo_rebuildHistoricalActuals_();
  const src = getOrCreateSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES, PAST_NIPPO_SOURCES_HEADERS_);
  if (src.getLastRow() > 1) src.getRange(2, 2, src.getLastRow() - 1, 1).clearContent();
  pastDetail_clearAll_();
  Logger.log('取り込んだ集計値と明細を取り消しました（HistoricalActualsから ' + result.removed + '行を削除）。');
}

// ==========================================
// 本体
// ==========================================

function pastNippo_process_(write) {
  const started = Date.now();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const srcSheet = getOrCreateSheet_(SHEET_NAMES.PAST_NIPPO_SOURCES, PAST_NIPPO_SOURCES_HEADERS_);
    getOrCreateSheet_(SHEET_NAMES.PAST_NIPPO_STORE_MAP, PAST_NIPPO_STORE_MAP_HEADERS_);
    if (srcSheet.getLastRow() < 2) {
      Logger.log('「' + SHEET_NAMES.PAST_NIPPO_SOURCES + '」シートのA列にURLを貼り付けてください。');
      return { files: 0 };
    }
    if (write) {
      getOrCreateSheet_(SHEET_NAMES.PAST_NIPPO_MONTHLY, PAST_NIPPO_MONTHLY_HEADERS_);
      ensureColumns_(getSheet_(SHEET_NAMES.HISTORICAL_ACTUALS), HISTORICAL_ACTUALS_EXTRA_HEADERS_);
    }

    const sources = srcSheet.getRange(2, 1, srcSheet.getLastRow() - 1, 2).getValues();
    const stores = storeRepo_getAll();
    const areaNames = {};
    areaRepo_getAll().forEach(function (a) { areaNames[a.方面名] = true; });
    const summary = { files: 0, entries: 0, cancels: 0, skipped: 0, pending: 0 };
    let wroteAny = false;

    for (let i = 0; i < sources.length; i++) {
      const url = String(sources[i][0] || '').trim();
      const status = String(sources[i][1] || '').trim();
      if (!url) continue;
      if (write && status === PAST_NIPPO_STATUS_.DONE) continue;
      if (Date.now() - started > PAST_NIPPO_TIME_LIMIT_MS_) { summary.pending++; continue; }

      const rowNo = i + 2;
      try {
        const book = /^https?:/.test(url) ? SpreadsheetApp.openByUrl(url) : SpreadsheetApp.openById(url);
        const parsed = pastNippo_readBook_(book);

        pastNippo_addTabsToStoreMap_(parsed.tabs.map(function (t) { return t.tabName; }), stores);
        const storeMap = pastNippo_getStoreMap_();
        const unmapped = parsed.tabs
          .filter(function (t) { return (t.entries.length || t.cancels.length) && !storeMap[t.tabName]; })
          .map(function (t) { return t.tabName; });

        const agg = pastNippo_aggregate_(parsed, storeMap);
        const notes = pastNippo_buildNotes_(parsed, agg, unmapped, areaNames);

        if (!write) {
          pastNippo_writeStatus_(srcSheet, rowNo, PAST_NIPPO_STATUS_.CHECKED, agg.entryCount, agg.cancelCount, notes.join(' / '));
          summary.files++; summary.entries += agg.entryCount; summary.cancels += agg.cancelCount;
          continue;
        }
        if (unmapped.length) {
          pastNippo_writeStatus_(srcSheet, rowNo, PAST_NIPPO_STATUS_.ERROR, agg.entryCount, agg.cancelCount,
            '「' + SHEET_NAMES.PAST_NIPPO_STORE_MAP + '」で店舗IDが空欄のタブがあるため取り込んでいません: ' + unmapped.join('、'));
          summary.skipped++;
          continue;
        }

        pastNippo_replaceMonthlyRows_(book.getId(), book.getName(), agg.rows);
        pastDetail_replaceFileRows_(book.getId(), parsed, storeMap);
        wroteAny = true;
        pastNippo_writeStatus_(srcSheet, rowNo, PAST_NIPPO_STATUS_.DONE, agg.entryCount, agg.cancelCount, notes.join(' / '));
        summary.files++; summary.entries += agg.entryCount; summary.cancels += agg.cancelCount;
      } catch (e) {
        pastNippo_writeStatus_(srcSheet, rowNo, PAST_NIPPO_STATUS_.ERROR, '', '', String(e && e.message || e));
        summary.skipped++;
      }
    }

    if (write && wroteAny) {
      const r = pastNippo_rebuildHistoricalActuals_();
      summary.historicalRows = r.written;
      summary.keptManual = r.keptManual;
    }
    if (write && summary.pending) pastNippo_scheduleContinue_();

    let msg = (write ? '取り込み' : '確認') + 'が終わりました。ファイル: ' + summary.files + '件 / 問合せ: ' + summary.entries +
      '件 / キャンセル: ' + summary.cancels + '件';
    if (summary.skipped) msg += ' / エラーで処理できなかったファイル: ' + summary.skipped + '件（メモ欄を確認してください）';
    if (summary.pending) msg += ' / 時間切れで未処理のファイル: ' + summary.pending + '件' + (write ? '（1分後に自動で続きを実行します）' : '（もう一度実行すると続きを処理します）');
    if (summary.keptManual) msg += ' / 手入力の前年実績がある ' + summary.keptManual + '件の店舗×方面×月は、手入力の値を残しました';
    Logger.log(msg);
    summary.message = msg;
    return summary;
  } finally {
    lock.releaseLock();
  }
}

/** スプレッドシート1冊の全タブを読む（書き込みはしない） */
function pastNippo_readBook_(book) {
  const ctx = pastNippo_contextFromBookName_(book.getName());
  const tabs = [];
  const skippedTabs = [];
  book.getSheets().forEach(function (sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const width = Math.min(Math.max(sheet.getLastColumn(), 1), PAST_NIPPO_READ_COLS_);
    const values = sheet.getRange(1, 1, lastRow, width).getValues();
    const parsed = pastNippo_parseTab_(values, ctx);
    if (!parsed) { skippedTabs.push(sheet.getName()); return; }
    parsed.tabName = sheet.getName();
    tabs.push(parsed);
  });
  return { bookName: book.getName(), ctx: ctx, tabs: tabs, skippedTabs: skippedTabs };
}

/**
 * 読み取った明細を、店舗×方面×月の集計行にする。
 * @return {Object} { rows: [{年月,店舗ID,方面,新規問合せ,成約数,CXL数,NB_PAX,CXL_PAX,挙式月成約数}], entryCount, cancelCount, ... }
 */
function pastNippo_aggregate_(parsed, storeMap) {
  const buckets = {};
  function bucket(ym, storeId, area) {
    const key = ym + '|' + storeId + '|' + area;
    if (!buckets[key]) {
      buckets[key] = { 年月: ym, 店舗ID: storeId, 方面: area, 新規問合せ: 0, 成約数: 0, CXL数: 0, NB_PAX: 0, CXL_PAX: 0, 挙式月成約数: 0 };
    }
    return buckets[key];
  }
  const result = { entryCount: 0, cancelCount: 0, noDate: 0, outsideFileMonth: 0, cancelNoDate: 0, areas: {} };
  const fileYm = parsed.ctx && parsed.ctx.fileMonth ? pastNippo_ym_(parsed.ctx.fileMonth) : '';

  parsed.tabs.forEach(function (t) {
    const storeId = storeMap[t.tabName];
    const skip = !storeId || storeId === PAST_NIPPO_SKIP_STORE_;
    t.entries.forEach(function (e) {
      if (!e.nbDate) { result.noDate++; return; }
      result.entryCount++;
      if (skip) return;
      const ym = pastNippo_ym_(e.nbDate);
      if (fileYm && ym !== fileYm) result.outsideFileMonth++;
      const area = e.area || '';
      if (area) result.areas[area] = true;
      const b = bucket(ym, storeId, area);
      if (e.type === '新規') b.新規問合せ += 1;
      if (e.result === '成約') {
        b.成約数 += 1;
        if (Object.prototype.toString.call(e.weddingDate) === '[object Date]') bucket(pastNippo_ym_(e.weddingDate), storeId, area).挙式月成約数 += 1;
      }
      b.NB_PAX += (Number(e.cplTour) || 0) + (Number(e.guestTour) || 0);
    });
    t.cancels.forEach(function (c) {
      if (!c.cxlDate) { result.cancelNoDate++; return; }
      result.cancelCount++;
      if (skip) return;
      const area = c.area || '';
      if (area) result.areas[area] = true;
      const b = bucket(pastNippo_ym_(c.cxlDate), storeId, area);
      if (c.agt) b.CXL数 += 1;
      b.CXL_PAX += Number(c.pax) || 0;
    });
  });
  result.rows = Object.keys(buckets).map(function (k) { return buckets[k]; });
  return result;
}

function pastNippo_buildNotes_(parsed, agg, unmapped, areaNames) {
  const notes = ['明細のあるタブ ' + parsed.tabs.length + '枚'];
  if (agg.noDate) notes.push('問合せNB日が空欄・読めない行 ' + agg.noDate + '件（日報の集計式でも数えられていないため取り込みません）');
  if (agg.cancelNoDate) notes.push('CXL年月日が空欄・読めないキャンセル行 ' + agg.cancelNoDate + '件（取り込みません）');
  if (agg.outsideFileMonth) notes.push('ファイルの月以外のNB日の行 ' + agg.outsideFileMonth + '件（NB日の月に数えます）');
  if (!parsed.ctx || !parsed.ctx.startYear) notes.push('ファイル名から期が読めません（「12/5」のような年なしの日付は読めません）');
  const unknownAreas = Object.keys(agg.areas).filter(function (a) { return !areaNames[a]; });
  if (unknownAreas.length) notes.push('方面マスタに無い方面: ' + unknownAreas.join('、'));
  if (unmapped.length) notes.push('店舗IDが未設定のタブ: ' + unmapped.join('、'));
  const others = (parsed.skippedTabs || []);
  if (others.length) notes.push('明細の見出しが見つからず読み飛ばしたタブ（集計タブなら問題なし。店舗タブが含まれていれば様式違いの可能性）: ' +
    others.slice(0, 15).join('、') + (others.length > 15 ? ' ほか' + (others.length - 15) + '枚' : ''));
  return notes;
}

/** PastNippoMonthly の、このファイルの行を入れ替える（同じファイルを再取込しても二重にならない） */
function pastNippo_replaceMonthlyRows_(fileId, fileName, rows) {
  const sheet = getSheet_(SHEET_NAMES.PAST_NIPPO_MONTHLY);
  const existing = sheetToObjects_(sheet).filter(function (r) { return r.取込元ID === fileId; });
  deleteRows_(sheet, existing.map(function (r) { return r.__row; }));
  if (rows.length === 0) return;
  const headerMap = getHeaderMap_(sheet);
  const lastCol = sheet.getLastColumn();
  const now = new Date();
  const values = rows.map(function (r) {
    const obj = Object.assign({ 取込元ID: fileId, 取込元ファイル名: fileName, 取込日時: now }, r);
    const row = new Array(lastCol).fill('');
    Object.keys(obj).forEach(function (k) { if (k in headerMap) row[headerMap[k]] = obj[k]; });
    return row;
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, lastCol).setValues(values);
}

/**
 * PastNippoMonthly の全ファイル分を店舗×方面×月で合計し、HistoricalActuals の「日報取込」の行を作り直す。
 * 手入力の行（登録者が日報取込・システム集計以外）がある店舗×方面×月は、手入力の値を優先して残す。
 */
function pastNippo_rebuildHistoricalActuals_() {
  const histSheet = getSheet_(SHEET_NAMES.HISTORICAL_ACTUALS);
  ensureColumns_(histSheet, HISTORICAL_ACTUALS_EXTRA_HEADERS_);
  const monthlySheet = getOrCreateSheet_(SHEET_NAMES.PAST_NIPPO_MONTHLY, PAST_NIPPO_MONTHLY_HEADERS_);

  const sums = {};
  sheetToObjects_(monthlySheet).forEach(function (r) {
    const ym = pastNippo_normYm_(r.年月);
    if (!ym) return;
    const key = ym + '|' + r.店舗ID + '|' + (r.方面 || '');
    if (!sums[key]) sums[key] = { 年月: ym, 店舗ID: r.店舗ID, 方面: r.方面 || '', 来店数: 0, 成約数: 0, CXL数: 0, NB_PAX: 0, CXL_PAX: 0, 挙式月成約数: 0 };
    const s = sums[key];
    s.来店数 += Number(r.新規問合せ) || 0;
    s.成約数 += Number(r.成約数) || 0;
    s.CXL数 += Number(r.CXL数) || 0;
    s.NB_PAX += Number(r.NB_PAX) || 0;
    s.CXL_PAX += Number(r.CXL_PAX) || 0;
    s.挙式月成約数 += Number(r.挙式月成約数) || 0;
  });

  const existing = sheetToObjects_(histSheet);
  const kept = existing.filter(function (r) { return r.登録者 !== PAST_NIPPO_IMPORTER_; });
  const manualKeys = {};
  kept.forEach(function (r) { manualKeys[pastNippo_normYm_(r.年月) + '|' + r.店舗ID + '|' + (r.方面 || '')] = true; });

  const now = new Date();
  let keptManual = 0;
  const imported = [];
  Object.keys(sums).sort().forEach(function (key) {
    if (manualKeys[key]) { keptManual++; return; }
    imported.push(Object.assign({ 登録者: PAST_NIPPO_IMPORTER_, 登録日時: now }, sums[key]));
  });

  const headerMap = getHeaderMap_(histSheet);
  const lastCol = histSheet.getLastColumn();
  const values = kept.concat(imported).map(function (obj) {
    const row = new Array(lastCol).fill('');
    Object.keys(obj).forEach(function (k) { if (k in headerMap) row[headerMap[k]] = obj[k]; });
    return row;
  });
  const lastRow = histSheet.getLastRow();
  if (lastRow > 1) histSheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (values.length) histSheet.getRange(2, 1, values.length, lastCol).setValues(values);
  // 年月を「2025-12」のような文字列のまま保つ（自動で日付に変換されると前年比較で一致しなくなる）
  if (values.length && ('年月' in headerMap)) {
    histSheet.getRange(2, headerMap['年月'] + 1, values.length, 1).setNumberFormat('@')
      .setValues(values.map(function (v) { return [pastNippo_normYm_(v[headerMap['年月']])]; }));
  }
  return { written: imported.length, keptManual: keptManual, removed: existing.length - kept.length };
}

function pastNippo_writeStatus_(sheet, rowNo, status, entries, cancels, memo) {
  sheet.getRange(rowNo, 2, 1, 5).setValues([[status, new Date(), entries, cancels, memo]]);
}

function pastNippo_scheduleContinue_() {
  pastNippo_deleteContinueTriggers_();
  ScriptApp.newTrigger('pastNippo_continueImport').timeBased().after(60 * 1000).create();
}

function pastNippo_deleteContinueTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pastNippo_continueImport') ScriptApp.deleteTrigger(t);
  });
}

// ==========================================
// タブ名と店舗の対応表
// ==========================================

function pastNippo_storeKey_(s) {
  return String(s || '').replace(/[\s　]/g, '').replace(/＆/g, '&').toLowerCase();
}

/** タブ名に対応する店舗を推測する。{ storeId, storeName, note }（storeIdが空なら要確認） */
function pastNippo_guessStore_(tabName, stores) {
  const active = stores.filter(function (s) { return s.使用終了 !== true && s.使用終了 !== 'TRUE'; });
  const key = pastNippo_storeKey_(tabName);
  const exact = active.filter(function (s) { return pastNippo_storeKey_(s.店舗名) === key; });
  if (exact.length) return { storeId: exact[0].STORE_ID, storeName: exact[0].店舗名, note: '自動（完全一致）' };
  const cands = active.filter(function (s) { return pastNippo_storeKey_(s.店舗名).indexOf(key) >= 0; });
  if (cands.length === 1) return { storeId: cands[0].STORE_ID, storeName: cands[0].店舗名, note: '自動（候補1件）' };
  if (cands.length > 1) {
    const ava = cands.filter(function (s) { return s.区分 === 'AVA'; });
    if (ava.length === 1) {
      return { storeId: ava[0].STORE_ID, storeName: ava[0].店舗名, note: '自動（AVAを優先。他の候補: ' +
        cands.filter(function (s) { return s !== ava[0]; }).map(function (s) { return s.店舗名; }).join('／') + '）' };
    }
    return { storeId: '', storeName: '', note: '要確認：候補が複数あります（' + cands.map(function (s) { return s.店舗名; }).join('／') + '）' };
  }
  return { storeId: '', storeName: '', note: '要確認：店舗マスタに該当なし（店舗IDを入れるか、取り込まない場合は「対象外」）' };
}

function pastNippo_addTabsToStoreMap_(tabNames, stores) {
  const sheet = getSheet_(SHEET_NAMES.PAST_NIPPO_STORE_MAP);
  const existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { existing[String(r[0]).trim()] = true; });
  }
  const rows = [];
  tabNames.forEach(function (tab) {
    if (existing[tab]) return;
    existing[tab] = true;
    const g = pastNippo_guessStore_(tab, stores);
    rows.push([tab, g.storeId, g.storeName, g.note]);
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
}

function pastNippo_getStoreMap_() {
  const sheet = getSheet_(SHEET_NAMES.PAST_NIPPO_STORE_MAP);
  const map = {};
  if (sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
    const tab = String(r[0]).trim();
    const store = String(r[1]).trim();
    if (tab && store) map[tab] = store;
  });
  return map;
}

// ==========================================
// 読み取り（純粋関数。スプレッドシートに触らない）
// ==========================================

/**
 * 店舗タブ1枚分の値（getValuesの2次元配列）から、問合せ・NB明細とキャンセル明細を取り出す。
 * 明細の見出し（「新規/既存」と「問合せ方法」がある行）がないタブは null を返す（集計タブ等）。
 */
function pastNippo_parseTab_(values, ctx) {
  const entryHeader = pastNippo_findRow_(values, 0, function (row) {
    return pastNippo_norm_(row[1]).indexOf('新規/') === 0 && row.some(function (c) { return pastNippo_norm_(c).indexOf('問合せ方法') >= 0; });
  });
  if (entryHeader < 0) return null;

  const entryCols = pastNippo_mapColumns_(values[entryHeader], PAST_NIPPO_ENTRY_COLS_, function (label) {
    if (label.indexOf('新規/') === 0) return 'type';
    if (label.indexOf('問合せ方法') >= 0) return 'method';
    if (label.indexOf('媒体') === 0) return 'media';
    if (label.indexOf('NB日') >= 0) return 'nbDate';
    if (label === '担当者') return 'staff';
    if (label.indexOf('チャレンジ') === 0) return 'challenge';
    if (label.indexOf('CPL') === 0) return 'cplTour';
    if (label.indexOf('列席') === 0) return 'guestTour';
    if (label === '挙式日') return 'weddingDate';
    if (label === '方面') return 'area';
    if (label.indexOf('問合結果') >= 0) return 'result';
    if (label === 'AGT') return 'agt';
    if (label === '式場') return 'venue';
    if (label === 'プラン') return 'plan';
    if (label.indexOf('未成約理由') >= 0 || label.indexOf('備考') >= 0) return 'reason';
    return null;
  });
  // 媒体は1件目・2件目の2列（日報の媒体別集計はE〜G列の両方を数えている）
  entryCols.media2 = entryCols.media + 2;

  const entryEnd = pastNippo_findSectionEnd_(values, entryHeader + 1);
  const entries = [];
  for (let r = entryHeader + 1; r < entryEnd; r++) {
    const row = values[r];
    const pick = function (key) { return pastNippo_cell_(row, entryCols[key]); };
    const e = {
      type: pick('type'), method: pick('method'), media: pick('media'), media2: pick('media2'), staff: pick('staff'),
      challenge: pastNippo_challenge_(row[entryCols.challenge]),
      cplTour: pastNippo_number_(row[entryCols.cplTour]), guestTour: pastNippo_number_(row[entryCols.guestTour]),
      area: pick('area'), result: pick('result'), agt: pick('agt'), venue: pick('venue'), plan: pick('plan'),
      reason: pick('reason')
    };
    // 挙式月の列は空行でも数式で「1899/12」が入っているため、内容の有無の判定には使わない
    const hasContent = e.type || e.staff || e.challenge || e.area || e.venue || e.result || e.agt ||
      pastNippo_cell_(row, entryCols.nbDate) || pastNippo_cell_(row, entryCols.weddingDate);
    if (!hasContent) continue;
    e.nbDate = pastNippo_toDate_(row[entryCols.nbDate], ctx);
    e.weddingDate = pastNippo_toDate_(row[entryCols.weddingDate], ctx);
    entries.push(e);
  }

  const cancels = [];
  const cancelHeader = pastNippo_findRow_(values, entryEnd, function (row) {
    return row.some(function (c) { return pastNippo_norm_(c) === 'CXL年月日'; });
  });
  if (cancelHeader >= 0) {
    const cancelCols = pastNippo_mapColumns_(values[cancelHeader], PAST_NIPPO_CANCEL_COLS_, function (label) {
      if (label === 'CXL年月日') return 'cxlDate';
      if (label === '担当者') return 'staff';
      if (label.indexOf('チャレンジ') === 0) return 'challenge';
      if (label === '挙式日') return 'weddingDate';
      if (label === 'PAX') return 'pax';
      if (label === '方面') return 'area';
      if (label === 'AGT') return 'agt';
      if (label === '式場') return 'venue';
      if (label === '理由') return 'reason';
      return null;
    });
    const cancelEnd = pastNippo_findSectionEnd_(values, cancelHeader + 1);
    for (let r = cancelHeader + 1; r < cancelEnd; r++) {
      const row = values[r];
      const c = {
        cxlDate: pastNippo_toDate_(row[cancelCols.cxlDate], ctx),
        staff: pastNippo_cell_(row, cancelCols.staff),
        challenge: pastNippo_challenge_(row[cancelCols.challenge]),
        pax: pastNippo_number_(row[cancelCols.pax]),
        area: pastNippo_cell_(row, cancelCols.area),
        agt: pastNippo_cell_(row, cancelCols.agt),
        venue: pastNippo_cell_(row, cancelCols.venue),
        weddingDate: pastNippo_toDate_(row[cancelCols.weddingDate], ctx),
        reason: pastNippo_cell_(row, cancelCols.reason)
      };
      const hasContent = pastNippo_cell_(row, cancelCols.cxlDate) || c.challenge || c.staff || c.agt || c.pax;
      if (!hasContent) continue;
      cancels.push(c);
    }
  }
  return { entries: entries, cancels: cancels };
}

/** ファイル名（例：「47期AVA日報12月」）から期と月を読み取る（47期＝2026年11月〜2027年10月） */
function pastNippo_contextFromBookName_(name) {
  const p = String(name).match(/(\d+)\s*期/);
  // 期の初月・期の数え方はSettings（FISCAL_START_MONTH・FISCAL_PERIOD_OFFSET。既定は11月・47期＝2026年11月〜）
  const fiscalStartMonth = fiscalStartMonth_();
  const startYear = p ? Number(p[1]) + fiscalPeriodOffset_() : null;
  const m = String(name).replace(/(\d+)\s*期/, '').match(/(\d{1,2})\s*月/);
  let fileMonth = null;
  if (startYear && m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) fileMonth = new Date(month >= fiscalStartMonth ? startYear : startYear + 1, month - 1, 1);
  }
  return { startYear: startYear, fileMonth: fileMonth, fiscalStartMonth: fiscalStartMonth };
}

/**
 * セルの値を日付にする。Date・シリアル値・「2026/12/5」「2026-12-05」「2026年12月5日」・
 * 年なしの「12/5」「12月5日」（ファイル名の期から年を補う）に対応。読めなければ null。
 */
function pastNippo_toDate_(v, ctx) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) || v.getFullYear() < 1950 ? null : v;
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return new Date(1899, 11, 30 + Math.floor(v));
    return null;
  }
  const s = String(v).trim().replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
  let m = s.match(/^(\d{4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/);
  if (m) return pastNippo_validDate_(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?$/);
  if (m && ctx && ctx.startYear) {
    const month = Number(m[1]);
    return pastNippo_validDate_(month >= (ctx.fiscalStartMonth || 11) ? ctx.startYear : ctx.startYear + 1, month, Number(m[2]));
  }
  return null;
}

function pastNippo_validDate_(y, m, d) {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

function pastNippo_ym_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

/** 年月の値を「yyyy-MM」にそろえる（シートで日付に変換されていた場合も含む） */
function pastNippo_normYm_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : pastNippo_ym_(v);
  const m = String(v).trim().match(/^(\d{4})[\/\-年.](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + Number(m[2])).slice(-2) : String(v).trim();
}

function pastNippo_norm_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\s/g, '');
}

function pastNippo_cell_(row, idx) {
  if (idx === undefined || idx === null || idx >= row.length) return '';
  const v = row[idx];
  return v === null || v === undefined ? '' : String(v).trim();
}

function pastNippo_number_(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(String(v).replace(/[,，\s]/g, ''));
  return isNaN(n) ? '' : n;
}

/** チャレンジNOは数字だけのものがセルに数値で入っていることがあるので文字列にそろえる */
function pastNippo_challenge_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(Math.round(v));
  return String(v).trim();
}

function pastNippo_findRow_(values, from, test) {
  for (let r = from; r < values.length; r++) {
    if (test(values[r])) return r;
  }
  return -1;
}

/** 次の「▼」で始まる見出し行（▼キャンセル / ▼各種集計）の位置。なければ最終行の次 */
function pastNippo_findSectionEnd_(values, from) {
  for (let r = from; r < values.length; r++) {
    if (pastNippo_norm_(values[r][1]).indexOf('▼') === 0) return r;
  }
  return values.length;
}

function pastNippo_mapColumns_(headerRow, defaults, labelToKey) {
  const cols = {};
  Object.keys(defaults).forEach(function (k) { cols[k] = defaults[k]; });
  const found = {};
  headerRow.forEach(function (cell, idx) {
    const key = labelToKey(pastNippo_norm_(cell));
    if (key && !found[key]) { cols[key] = idx; found[key] = true; }
  });
  return cols;
}
