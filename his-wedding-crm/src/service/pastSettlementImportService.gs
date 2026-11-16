/**
 * pastSettlementImportService.gs
 * いま運用している精算スプレッドシート（例：「46期 精算（関東）」。方面別シート＋【集計】シート）を読み、
 * 1行＝1件の精算明細として、過去日報明細と同じ別スプレッドシートの Settlements_○期 シートに入れる。
 * 精算・売上集計の画面で、前期比較や取り込み期間の集計に使う（CRMのデータ用スプレッドシートには入れない）。
 *
 * ■ 使い方（Apps Scriptエディタで関数を選んで実行する）
 *   1. pastSettlement_setup()   … 「PastSettlementSources」「PastSettlementAreaMap」シートを作る
 *   2. PastSettlementSources のA列に、精算スプレッドシートのURLを1行に1つずつ貼る
 *   3. pastSettlement_preview() … 読むだけ。件数・売上合計・注意点をメモ欄に出し、シート名と方面の対応表を作る
 *   4. PastSettlementAreaMap の「方面（集計方面）」を確認する（取り込まないシートは「対象外」）
 *   5. pastSettlement_import()  … 取り込む（同じファイルを再度取り込んでも二重にならない）
 *   6. 店舗ごとに見たい場合は、店舗マスタの「店番」（チャレンジ番号の先頭3桁）を入れておく
 *
 * ■ 読み取りのルール（方面別シートの形に合わせている）
 *   ・「Challenge No」の見出しがある行を明細の見出しとし、その見出しの位置ごとに月のかたまり（11月〜10月）を読む
 *   ・「アバンティ」の欄＝AVA、「一般店舗」の欄＝一般。「TTL」「総計」の行は集計行として読み飛ばす
 *   ・挙式NET＝原価、挙式部分 総売上＝売上。CXL欄に何か入っていればCXL
 *   ・仕分けの先頭がP＝フォト、W＝挙式。末尾がinc（衣裳の組み込み）は種別「衣裳」（件数には数えず、売上・原価には含める）
 *   ・期はファイル名か【集計】シートの見出し（例：「46期FNL件数（関東）」）から読む
 *   ・読み取った売上・原価の合計を、各かたまりのTTL行と照合し、合わなければメモ欄に出す
 */

const PAST_SETTLEMENT_DETAIL_HEADERS_ = ['取込元ID', '元シート', '計上月', '方面', '店舗ID', '店番', '店舗区分', '区分', '種別', 'AGT', '式場', 'プラン',
  '売上', '原価', 'CXL', 'チャレンジ番号', '仕分け'];
const PAST_SETTLEMENT_STATUS_ = { DONE: '取込済み', CHECKED: '確認済み', ERROR: 'エラー' };

function pastSettlement_setup() {
  const src = getOrCreateSheet_(SHEET_NAMES.PAST_SETTLEMENT_SOURCES, PAST_SETTLEMENT_SOURCES_HEADERS_);
  getOrCreateSheet_(SHEET_NAMES.PAST_SETTLEMENT_AREA_MAP, PAST_SETTLEMENT_AREA_MAP_HEADERS_);
  ensureColumns_(getSheet_(SHEET_NAMES.STORES), ['店番']);
  src.setColumnWidth(1, 420);
  src.setColumnWidth(6, 520);
  Logger.log('「' + SHEET_NAMES.PAST_SETTLEMENT_SOURCES + '」シートのA列に精算スプレッドシートのURLを貼ってから、pastSettlement_preview を実行してください。');
}

function pastSettlement_preview() { return pastSettlement_process_(false); }
function pastSettlement_import() { return pastSettlement_process_(true); }

/** 取り込んだ精算明細をすべて消す（元のスプレッドシートは変わらない） */
function pastSettlement_clearImported() {
  const ss = pastDetail_spreadsheet_(false);
  if (ss) {
    ss.getSheets().forEach(function (sh) {
      if (/^Settlements_\d+期$/.test(sh.getName()) && sh.getLastRow() > 1) {
        sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
      }
    });
  }
  const src = getOrCreateSheet_(SHEET_NAMES.PAST_SETTLEMENT_SOURCES, PAST_SETTLEMENT_SOURCES_HEADERS_);
  if (src.getLastRow() > 1) src.getRange(2, 2, src.getLastRow() - 1, 1).clearContent();
  Logger.log('取り込んだ精算明細を取り消しました。');
}

function pastSettlement_process_(write) {
  const started = Date.now();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const srcSheet = getOrCreateSheet_(SHEET_NAMES.PAST_SETTLEMENT_SOURCES, PAST_SETTLEMENT_SOURCES_HEADERS_);
    getOrCreateSheet_(SHEET_NAMES.PAST_SETTLEMENT_AREA_MAP, PAST_SETTLEMENT_AREA_MAP_HEADERS_);
    if (srcSheet.getLastRow() < 2) { Logger.log('URLを貼り付けてください。'); return { files: 0 }; }
    const sources = srcSheet.getRange(2, 1, srcSheet.getLastRow() - 1, 2).getValues();
    const storeByNo = {};
    storeRepo_getAll().forEach(function (s) {
      const no = String(s.店番 === undefined ? '' : s.店番).trim();
      if (no) storeByNo[('000' + no).slice(-3)] = s.STORE_ID;
    });
    const summary = { files: 0, rows: 0, sales: 0, skipped: 0, pending: 0 };

    for (let i = 0; i < sources.length; i++) {
      const url = String(sources[i][0] || '').trim();
      const status = String(sources[i][1] || '').trim();
      if (!url) continue;
      if (write && status === PAST_SETTLEMENT_STATUS_.DONE) continue;
      if (Date.now() - started > PAST_NIPPO_TIME_LIMIT_MS_) { summary.pending++; continue; }
      const rowNo = i + 2;
      try {
        const book = /^https?:/.test(url) ? SpreadsheetApp.openByUrl(url) : SpreadsheetApp.openById(url);
        const parsed = pastSettlement_readBook_(book);
        if (!parsed.startYear) throw new Error('期が読めません。ファイル名か【集計】シートの見出しに「46期」のような期を入れてください。');
        pastSettlement_addSheetsToAreaMap_(parsed.sheets.map(function (s) { return s.sheetName; }));
        const areaMap = pastSettlement_getAreaMap_();
        const unmapped = parsed.sheets.filter(function (s) { return s.rows.length && !areaMap[s.sheetName]; }).map(function (s) { return s.sheetName; });

        const rows = [];
        let unknownStoreNos = {};
        parsed.sheets.forEach(function (s) {
          const area = areaMap[s.sheetName];
          if (!area || area === PAST_NIPPO_SKIP_STORE_) return;
          s.rows.forEach(function (r) {
            const storeId = storeByNo[r.店番] || '';
            if (!storeId && r.店番) unknownStoreNos[r.店番] = true;
            rows.push([book.getId(), s.sheetName, r.計上月, area, storeId, r.店番, r.店舗区分, r.区分, r.種別, r.AGT, r.式場, r.プラン,
              r.売上, r.原価, r.CXL, r.チャレンジ番号, r.仕分け]);
          });
        });
        const total = parsed.sheets.reduce(function (n, s) { return n + s.rows.length; }, 0);
        const sales = parsed.sheets.reduce(function (n, s) { return n + s.rows.reduce(function (m, r) { return m + r.売上; }, 0); }, 0);
        const notes = ['期: ' + parsed.period + '期', '方面シート ' + parsed.sheets.length + '枚'];
        parsed.sheets.forEach(function (s) { s.warnings.forEach(function (w) { notes.push(s.sheetName + '：' + w); }); });
        if (unmapped.length) notes.push('方面が未設定のシート: ' + unmapped.join('、'));
        const unknown = Object.keys(unknownStoreNos);
        if (unknown.length) notes.push('店舗マスタに無い店番（店舗別には出ません。地方・方面・AVA／一般の集計には入ります）: ' + unknown.slice(0, 20).join('、'));

        if (!write) {
          pastNippo_writeStatus_(srcSheet, rowNo, PAST_SETTLEMENT_STATUS_.CHECKED, total, sales, notes.join(' / '));
          summary.files++; summary.rows += total; summary.sales += sales;
          continue;
        }
        if (unmapped.length) {
          pastNippo_writeStatus_(srcSheet, rowNo, PAST_SETTLEMENT_STATUS_.ERROR, total, sales,
            '「' + SHEET_NAMES.PAST_SETTLEMENT_AREA_MAP + '」で方面が空欄のシートがあるため取り込んでいません: ' + unmapped.join('、'));
          summary.skipped++;
          continue;
        }
        pastSettlement_replaceFileRows_(book.getId(), parsed.period, rows);
        pastNippo_writeStatus_(srcSheet, rowNo, PAST_SETTLEMENT_STATUS_.DONE, rows.length, sales, notes.join(' / '));
        summary.files++; summary.rows += rows.length; summary.sales += sales;
      } catch (e) {
        pastNippo_writeStatus_(srcSheet, rowNo, PAST_SETTLEMENT_STATUS_.ERROR, '', '', String(e && e.message || e));
        summary.skipped++;
      }
    }
    summary.message = (write ? '取り込み' : '確認') + 'が終わりました。ファイル: ' + summary.files + '件 / 明細: ' + summary.rows +
      '件 / 売上合計: ' + summary.sales + (summary.skipped ? ' / エラー: ' + summary.skipped + '件' : '') +
      (summary.pending ? ' / 時間切れで未処理: ' + summary.pending + '件（もう一度実行してください）' : '');
    Logger.log(summary.message);
    return summary;
  } finally {
    lock.releaseLock();
  }
}

/** 精算スプレッドシート1冊を読む（書き込みはしない） */
function pastSettlement_readBook_(book) {
  let periodNo = null;
  const m = String(book.getName()).match(/(\d+)\s*期/);
  if (m) periodNo = Number(m[1]);
  const sheets = [];
  book.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 2) return;
    if (/^【/.test(name)) {
      if (!periodNo) {
        const t = String(sheet.getRange(1, 1).getValue() || '').match(/(\d+)\s*期/);
        if (t) periodNo = Number(t[1]);
      }
      return;
    }
    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const parsed = pastSettlement_parseSheet_(values);
    if (!parsed) return;
    parsed.sheetName = name;
    sheets.push(parsed);
  });
  const startYear = periodNo ? periodNo + fiscalPeriodOffset_() : null;
  const sm = fiscalStartMonth_();
  sheets.forEach(function (s) {
    s.rows.forEach(function (r) {
      const year = r.month >= sm ? startYear : startYear + 1;
      r.計上月 = year + '-' + ('0' + r.month).slice(-2);
    });
  });
  return { period: periodNo, startYear: startYear, sheets: sheets };
}

/**
 * 方面別シート1枚分の値から、月ごとのかたまりの明細を取り出す。「Challenge No」の見出しが無ければ null。
 * @return {Object} { rows:[{month,店舗区分,区分,種別,AGT,式場,プラン,売上,原価,CXL,チャレンジ番号,店番,仕分け}], warnings:[] }
 */
function pastSettlement_parseSheet_(values) {
  const norm = pastNippo_norm_;
  let headerRow = -1;
  for (let r = 0; r < values.length && headerRow < 0; r++) {
    if (values[r].some(function (c) { return norm(c) === 'ChallengeNo'; })) headerRow = r;
  }
  if (headerRow < 0) return null;
  const header = values[headerRow];
  const blocks = [];
  header.forEach(function (c, idx) { if (norm(c) === 'ChallengeNo') blocks.push(idx); });

  const rows = [];
  const warnings = [];
  blocks.forEach(function (ch, bi) {
    const end = bi + 1 < blocks.length ? blocks[bi + 1] - 1 : header.length;
    // 見出しが空欄の列があるかたまり（例：7月だけ「仕分け」の見出しが無い）もあるため、
    // まず標準の位置（Challenge No からの距離）を入れ、見出しが見つかればそちらを使う
    const col = { no: ch - 1, challenge: ch, agt: ch + 1, net: ch + 2, sales: ch + 3, cxl: ch + 5, venue: ch + 6, plan: ch + 7, storeNo: ch + 8, sort: ch + 10 };
    const found = {};
    for (let c = ch + 1; c < end; c++) {
      const l = norm(header[c]);
      if (!l) continue;
      const key = l === 'AGT' ? 'agt' : l.indexOf('NET') >= 0 ? 'net' : l.indexOf('売上') >= 0 ? 'sales' : l === 'CXL' ? 'cxl' :
        l === '式場' ? 'venue' : l === 'プラン' ? 'plan' : l === '店番' ? 'storeNo' : l === '仕分け' ? 'sort' : null;
      if (key && !found[key]) { col[key] = c; found[key] = true; }
    }
    // 月：見出しの2行上（例：「11月」）か、1行目（例：「ハワイ 11月」）
    let month = null;
    [values[Math.max(headerRow - 2, 0)][col.no], values[0][col.no]].some(function (v) {
      const mm = String(v || '').match(/(\d{1,2})\s*月/);
      if (mm) { month = Number(mm[1]); return true; }
      return false;
    });
    if (!month) { warnings.push((bi + 1) + '番目のかたまりの月が読めないため読み飛ばしました'); return; }

    let segment = 'AVA';
    let sumSales = 0, sumCost = 0, mismatchedSort = 0, blankSort = 0;
    for (let r = headerRow + 1; r < values.length; r++) {
      const row = values[r];
      const label = norm(row[col.no]);
      if (label.indexOf('アバンティ') >= 0) { segment = 'AVA'; continue; }
      if (label.indexOf('一般') >= 0) { segment = '一般'; continue; }
      if (label === 'TTL' || label === '総計') {
        if (label === 'TTL') {
          const ttlSales = Number(row[col.sales]) || 0, ttlCost = Number(row[col.net]) || 0;
          if (Math.round(ttlSales) !== Math.round(sumSales) || Math.round(ttlCost) !== Math.round(sumCost)) {
            warnings.push(month + '月 ' + segment + '：読み取った合計（売上' + sumSales + '・原価' + sumCost + '）がTTL行（売上' + ttlSales + '・原価' + ttlCost + '）と合いません');
          }
          sumSales = 0; sumCost = 0;
        }
        if (label === '総計') break;
        continue;
      }
      let challenge = row[col.challenge];
      if (typeof challenge === 'number') challenge = ('00000000000' + String(Math.round(challenge))).slice(-11);
      challenge = String(challenge === null || challenge === undefined ? '' : challenge).replace(/[\s\t]/g, '');
      const sales = Number(String(row[col.sales] === undefined ? '' : row[col.sales]).replace(/[,，]/g, '')) || 0;
      const cost = Number(String(row[col.net] === undefined ? '' : row[col.net]).replace(/[,，]/g, '')) || 0;
      const venue = pastNippo_cell_(row, col.venue);
      const agt = pastNippo_cell_(row, col.agt);
      if (!challenge && !sales && !cost && !venue && !agt) continue;
      const sort = pastNippo_cell_(row, col.sort);
      const plan = pastNippo_cell_(row, col.plan);
      let storeNo = pastNippo_cell_(row, col.storeNo).replace(/\D/g, '');
      if (!storeNo && challenge) storeNo = challenge.slice(0, 3);
      const kind = /^P/i.test(sort) ? 'フォト' : /^W/i.test(sort) ? '挙式' : (plan === 'フォトプラン' ? 'フォト' : '挙式');
      const type = /inc$/i.test(sort) || /衣裳/.test(agt) || /衣裳/.test(venue) ? '衣裳' : '本体';
      if (/^[WP]A/i.test(sort) && segment === '一般' || /^[WP]O/i.test(sort) && segment === 'AVA') mismatchedSort++;
      if (!sort) blankSort++;
      sumSales += sales; sumCost += cost;
      rows.push({
        month: month, 店舗区分: segment, 区分: kind, 種別: type, AGT: agt, 式場: venue.trim(), プラン: plan,
        売上: sales, 原価: cost, CXL: pastNippo_cell_(row, col.cxl) ? true : false, チャレンジ番号: challenge,
        店番: storeNo ? ('000' + storeNo).slice(-3) : '', 仕分け: sort
      });
    }
    if (blankSort) {
      warnings.push(month + '月：仕分けが空欄の行 ' + blankSort + '件（プランがフォトプランならフォト、それ以外は挙式として数えます。元の【集計】シートではこの行は数えられていません）');
    }
    if (mismatchedSort) {
      warnings.push(month + '月：仕分けのA／Oが欄（アバンティ／一般店舗）と合わない行 ' + mismatchedSort + '件（欄に合わせて数えます。元の【集計】売上・粗利ではこの行は数えられていません）');
    }
  });
  return { rows: rows, warnings: warnings };
}

function pastSettlement_replaceFileRows_(fileId, period, rows) {
  const ss = pastDetail_spreadsheet_(true);
  const name = 'Settlements_' + period + '期';
  let sheet = ss.getSheetByName(name);
  const headers = PAST_SETTLEMENT_DETAIL_HEADERS_;
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  const lastRow = sheet.getLastRow();
  const kept = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().filter(function (r) { return r[0] !== fileId; }) : [];
  const all = kept.concat(rows);
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (all.length) {
    sheet.getRange(2, 1, all.length, headers.length).setValues(all);
    // 計上月・店番・チャレンジ番号は文字列のまま保つ
    [3, 6, 16].forEach(function (c) {
      sheet.getRange(2, c, all.length, 1).setNumberFormat('@').setValues(all.map(function (r) { return [r[c - 1]]; }));
    });
  }
}

/* ---------- シート名と方面の対応表 ---------- */

/** 方面別シートの名前（例：「グアム」「南･モルディブ」「他海外➁」）から集計方面を推測する */
function pastSettlement_guessArea_(sheetName) {
  const groups = areaGroupList_();
  const strip = function (s) { return String(s || '').replace(/[\s　・･\/／（）()➀-➉①-⑩0-9０-９]/g, '').replace(/他/g, ''); };
  const key = strip(sheetName);
  const exact = groups.filter(function (g) { return strip(g) === key; });
  if (exact.length) return { area: exact[0], note: '自動（一致）' };
  const parts = String(sheetName).split(/[・･\/／（）()\s]/).map(strip).filter(function (p) { return p.length >= 2; });
  const cands = groups.filter(function (g) {
    const gk = strip(g);
    return (key && (gk.indexOf(key) >= 0 || key.indexOf(gk) >= 0)) || parts.some(function (p) { return gk.indexOf(p) >= 0; });
  });
  if (cands.length === 1) return { area: cands[0], note: '自動（候補1件）。合っているか確認してください' };
  if (cands.length > 1) return { area: '', note: '要確認：候補が複数あります（' + cands.join('／') + '）' };
  return { area: '', note: '要確認：方面マスタの日報方面に該当なし' };
}

function pastSettlement_addSheetsToAreaMap_(sheetNames) {
  const sheet = getSheet_(SHEET_NAMES.PAST_SETTLEMENT_AREA_MAP);
  const existing = {};
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { existing[String(r[0]).trim()] = true; });
  const rows = [];
  sheetNames.forEach(function (n) {
    if (existing[n]) return;
    existing[n] = true;
    const g = pastSettlement_guessArea_(n);
    rows.push([n, g.area, g.note]);
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
}

function pastSettlement_getAreaMap_() {
  const sheet = getSheet_(SHEET_NAMES.PAST_SETTLEMENT_AREA_MAP);
  const map = {};
  if (sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
    const n = String(r[0]).trim(), a = String(r[1]).trim();
    if (n && a) map[n] = a;
  });
  return map;
}
