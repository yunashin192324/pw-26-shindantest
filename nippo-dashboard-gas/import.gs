/**
 * 過去の月次日報スプレッドシート（例:「47期AVA日報12月」）の取り込み
 *
 * スプレッドシートを開くと上部に「日報取込」メニューが出る。
 *   ① 取込元シートを用意する … 「取込元」「取込店舗対応」シートを作る
 *   ② 確認だけする           … 取込元のファイルを読んで件数・注意点を表示（書き込まない）
 *   ③ 過去データを取り込む   … DATA_○期 と CANCEL に書き込む
 *
 * 読み取りのルール（月次日報の店舗タブの形に合わせている）:
 *   ・「新規/既存」「問合せ方法」の見出し行の下を「問合せ・NB」の明細として読む
 *   ・「CXL年月日」の見出し行の下を「キャンセル」の明細として読む
 *   ・各明細は次の「▼」で始まる見出し（▼キャンセル / ▼各種集計）の手前で終わる
 *   ・上記の見出しがないタブ（地区別・通期などの集計タブ）は読み飛ばす
 *   ・店舗名の列はないので、タブ名を「取込店舗対応」シートでMASTERの店舗名に変換する
 *   ・登録日時の列はないので、問合せNB日を登録日時として使う（月別集計がずれないように）
 *   ・同じ内容の行が既にあれば追加しない（同じファイルを2回取り込んでも二重にならない）
 */

const IMPORT_SOURCES_SHEET = '取込元';
const IMPORT_STORE_MAP_SHEET = '取込店舗対応';
const CANCEL_SHEET = 'CANCEL';
const CANCEL_HEADERS = ['cxlDate', 'staff', 'challenge', 'weddingDate', 'pax', 'area', 'agt', 'venue', 'reason', 'store', 'sourceFile', 'importedAt'];
const IMPORT_TIME_LIMIT_MS = 4.5 * 60 * 1000; // GASの実行上限(6分)より手前で止めて、続きは再実行で処理する
const IMPORT_READ_COLS = 34; // A〜AH列（明細欄はこの範囲に収まっている）

const SRC_STATUS = { DONE: '取込済み', CHECKED: '確認済み', ERROR: 'エラー' };

// 見出しが見つからない列に使う既定の位置（0始まり）。店舗タブの多くは「未成約理由」「履歴リンク」の
// 見出しが空欄なので、その2列はこの位置で読む。
const ENTRY_DEFAULT_COLS = {
  type: 1, method: 2, media: 4, media2: 6, nbDate: 8, staff: 10, challenge: 11, cplTour: 13, guestTour: 14,
  weddingDate: 15, area: 17, result: 19, agt: 20, venue: 21, plan: 25, reason: 27, historyLink: 31
};
const CANCEL_DEFAULT_COLS = {
  cxlDate: 1, staff: 3, challenge: 4, weddingDate: 6, pax: 8, area: 9, agt: 11, venue: 12, reason: 16
};

// ==========================================
// メニュー
// ==========================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('日報取込')
    .addItem('① 取込元シートを用意する', 'setupImportSheets')
    .addItem('② 確認だけする（書き込まない）', 'previewImport')
    .addItem('③ 過去データを取り込む', 'runImport')
    .addSeparator()
    .addItem('暦年シート（DATA_2026 等）を期シートへコピー', 'migrateCalendarSheets')
    .addToUi();
}

function setupImportSheets() {
  let src = SS.getSheetByName(IMPORT_SOURCES_SHEET);
  if (!src) {
    src = SS.insertSheet(IMPORT_SOURCES_SHEET);
    src.getRange(1, 1, 1, 6).setValues([['スプレッドシートのURL（A列に1行1ファイル）', '状態', '処理日時', '問合せ件数', 'キャンセル件数', 'メモ']]);
    src.setFrozenRows(1);
    src.setColumnWidth(1, 420);
    src.setColumnWidth(6, 520);
  }
  let map = SS.getSheetByName(IMPORT_STORE_MAP_SHEET);
  if (!map) {
    map = SS.insertSheet(IMPORT_STORE_MAP_SHEET);
    map.getRange(1, 1, 1, 3).setValues([['タブ名', '登録する店舗名（MASTERの店舗名）', '判定']]);
    map.setFrozenRows(1);
    map.setColumnWidth(1, 260);
    map.setColumnWidth(2, 300);
    map.setColumnWidth(3, 360);
  }
  notify_('「' + IMPORT_SOURCES_SHEET + '」シートのA列に、取り込みたい月次日報スプレッドシートのURLを1行に1つずつ貼り付けてから、' +
    '「② 確認だけする」を実行してください。');
}

// ==========================================
// ② 確認（書き込まない）
// ==========================================

function previewImport() {
  processSources_(false);
}

// ==========================================
// ③ 取り込み
// ==========================================

function runImport() {
  processSources_(true);
}

function processSources_(write) {
  const started = Date.now();
  const srcSheet = SS.getSheetByName(IMPORT_SOURCES_SHEET);
  if (!srcSheet || srcSheet.getLastRow() < 2) {
    notify_('先に「① 取込元シートを用意する」を実行し、「' + IMPORT_SOURCES_SHEET + '」シートのA列にURLを貼り付けてください。');
    return;
  }

  const sources = srcSheet.getRange(2, 1, srcSheet.getLastRow() - 1, 2).getValues();
  const masterStores = getMasterStores_();
  const dedup = write ? createDedupIndex_() : null;
  const challengeSeen = {};
  const summary = { files: 0, entries: 0, cancels: 0, skipped: 0, pending: 0 };

  for (let i = 0; i < sources.length; i++) {
    const url = String(sources[i][0] || '').trim();
    const status = String(sources[i][1] || '').trim();
    if (!url || status === SRC_STATUS.DONE) continue;

    if (Date.now() - started > IMPORT_TIME_LIMIT_MS) {
      summary.pending++;
      continue;
    }

    const rowNo = i + 2;
    try {
      const book = /^https?:/.test(url) ? SpreadsheetApp.openByUrl(url) : SpreadsheetApp.openById(url);
      const parsed = readReportBook_(book);

      // 新しく見つかったタブ名を「取込店舗対応」に追加（MASTERの店舗名を推測して入れる）
      addTabsToStoreMap_(parsed.tabs.map(function(t) { return t.tabName; }), masterStores);
      const storeMap = getStoreMap_();

      const unmapped = parsed.tabs
        .filter(function(t) { return (t.entries.length || t.cancels.length) && !storeMap[t.tabName]; })
        .map(function(t) { return t.tabName; });

      const notes = buildNotes_(parsed, unmapped, challengeSeen);
      const entryCount = parsed.tabs.reduce(function(n, t) { return n + t.entries.length; }, 0);
      const cancelCount = parsed.tabs.reduce(function(n, t) { return n + t.cancels.length; }, 0);

      if (!write) {
        writeSourceStatus_(srcSheet, rowNo, SRC_STATUS.CHECKED, entryCount, cancelCount, notes.join(' / '));
        summary.files++;
        summary.entries += entryCount;
        summary.cancels += cancelCount;
        continue;
      }

      if (unmapped.length) {
        writeSourceStatus_(srcSheet, rowNo, SRC_STATUS.ERROR, entryCount, cancelCount,
          '「' + IMPORT_STORE_MAP_SHEET + '」で店舗名が空欄のタブがあるため取り込んでいません: ' + unmapped.join('、'));
        summary.skipped++;
        continue;
      }

      const result = writeParsedBook_(parsed, storeMap, book.getName(), dedup);
      writeSourceStatus_(srcSheet, rowNo, SRC_STATUS.DONE, result.entries, result.cancels,
        notes.concat(result.duplicates ? ['取込済みと同じ行 ' + result.duplicates + '件はスキップ'] : []).join(' / '));
      summary.files++;
      summary.entries += result.entries;
      summary.cancels += result.cancels;
    } catch (e) {
      writeSourceStatus_(srcSheet, rowNo, SRC_STATUS.ERROR, '', '', String(e && e.message || e));
      summary.skipped++;
    }
  }

  if (write) CacheService.getScriptCache().remove(CACHE_KEY_DASHBOARD);

  let msg = (write ? '取り込み' : '確認') + 'が終わりました。\n' +
    'ファイル: ' + summary.files + '件 / 問合せ: ' + summary.entries + '件 / キャンセル: ' + summary.cancels + '件';
  if (summary.skipped) msg += '\nエラーで処理できなかったファイル: ' + summary.skipped + '件（「' + IMPORT_SOURCES_SHEET + '」のメモ欄を確認してください）';
  if (summary.pending) msg += '\n時間切れのため未処理のファイルが ' + summary.pending + '件あります。もう一度同じメニューを実行すると続きから処理します。';
  if (!write) msg += '\n\n「' + IMPORT_STORE_MAP_SHEET + '」シートの店舗名を確認してから「③ 過去データを取り込む」を実行してください。';
  notify_(msg);
}

/** スプレッドシート1冊の全タブを読む（書き込みはしない）。 */
function readReportBook_(book) {
  const ctx = contextFromBookName_(book.getName());
  const tabs = [];
  book.getSheets().forEach(function(sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const width = Math.min(Math.max(sheet.getLastColumn(), 1), IMPORT_READ_COLS);
    const values = sheet.getRange(1, 1, lastRow, width).getValues();
    const parsed = parseReportTab_(values, ctx);
    if (!parsed) return; // 集計タブなど明細のないタブ
    parsed.tabName = sheet.getName();
    tabs.push(parsed);
  });
  return { bookName: book.getName(), ctx: ctx, tabs: tabs };
}

function buildNotes_(parsed, unmapped, challengeSeen) {
  const notes = ['店舗タブ ' + parsed.tabs.length + '枚'];
  let noDate = 0, guessedDate = 0, dupChallenge = 0;
  parsed.tabs.forEach(function(t) {
    noDate += t.warnings.noDate;
    guessedDate += t.warnings.dateFromFile;
    t.entries.forEach(function(e) {
      if (e.type !== '新規' || !e.challenge) return;
      if (challengeSeen[e.challenge]) dupChallenge++;
      challengeSeen[e.challenge] = true;
    });
  });
  if (noDate) notes.push('NB日が読めず取り込めない行 ' + noDate + '件');
  if (guessedDate) notes.push('NB日が空欄のためファイルの月の1日として扱う行 ' + guessedDate + '件');
  if (dupChallenge) notes.push('「新規」でチャレンジNOが重複 ' + dupChallenge + '件（そのまま取り込みます）');
  if (unmapped.length) notes.push('店舗名が未設定のタブ: ' + unmapped.join('、'));
  return notes;
}

/** 読み取った明細を DATA_○期 と CANCEL に書き込む。同じ内容の行は追加しない。 */
function writeParsedBook_(parsed, storeMap, bookName, dedup) {
  const byPeriod = {};
  const cancelRows = [];
  let duplicates = 0;
  const now = new Date();

  parsed.tabs.forEach(function(t) {
    const store = storeMap[t.tabName];
    t.entries.forEach(function(e) {
      const row = entryToDataRow_(e, store);
      if (isAlreadyStored_(dedup, 'data', dataFingerprint_(row))) { duplicates++; return; }
      const period = getFiscalPeriod(row[0]).period;
      (byPeriod[period] = byPeriod[period] || []).push(row);
    });
    t.cancels.forEach(function(c) {
      const row = [c.cxlDate || '', c.staff, c.challenge, c.weddingDate || '', c.pax, c.area, c.agt, c.venue, c.reason, store, bookName, now];
      if (isAlreadyStored_(dedup, 'cancel', cancelFingerprint_(row))) { duplicates++; return; }
      cancelRows.push(row);
    });
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let entries = 0;
  try {
    Object.keys(byPeriod).forEach(function(period) {
      const rows = byPeriod[period].sort(function(a, b) { return a[0] - b[0]; });
      const sheet = getPeriodSheet(Number(period));
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, DATA_HEADERS.length).setValues(rows);
      entries += rows.length;
    });
    if (cancelRows.length) {
      const sheet = getCancelSheet_();
      sheet.getRange(sheet.getLastRow() + 1, 1, cancelRows.length, CANCEL_HEADERS.length).setValues(cancelRows);
    }
  } finally {
    lock.releaseLock();
  }
  return { entries: entries, cancels: cancelRows.length, duplicates: duplicates };
}

// ==========================================
// 暦年シート → 期シート
// ==========================================

/**
 * 以前の DATA_2026 のような暦年シートの行を、日付に応じた DATA_○期 シートへコピーする。
 * 元のシートは消さないので、確認後に不要なら手動で削除してください。
 */
function migrateCalendarSheets() {
  const dedup = createDedupIndex_();
  const counts = {};
  let duplicates = 0;
  SS.getSheets().forEach(function(sheet) {
    if (!/^DATA_\d{4}$/.test(sheet.getName()) || sheet.getLastRow() < 2) return;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, DATA_HEADERS.length).getValues();
    const byPeriod = {};
    rows.forEach(function(row) {
      const d = toDate_(row[0], null);
      if (!d) return;
      row[0] = d;
      if (isAlreadyStored_(dedup, 'data', dataFingerprint_(row))) { duplicates++; return; }
      const period = getFiscalPeriod(d).period;
      (byPeriod[period] = byPeriod[period] || []).push(row);
    });
    Object.keys(byPeriod).forEach(function(period) {
      const target = getPeriodSheet(Number(period));
      const list = byPeriod[period];
      target.getRange(target.getLastRow() + 1, 1, list.length, DATA_HEADERS.length).setValues(list);
      counts[target.getName()] = (counts[target.getName()] || 0) + list.length;
    });
  });
  CacheService.getScriptCache().remove(CACHE_KEY_DASHBOARD);
  const lines = Object.keys(counts).map(function(k) { return k + ': ' + counts[k] + '件'; });
  notify_(lines.length
    ? 'コピーしました。\n' + lines.join('\n') + (duplicates ? '\n（既にある行 ' + duplicates + '件はスキップ）' : '') +
      '\n\n元の暦年シートはそのまま残しています。内容を確認したら削除してください。'
    : 'コピーする行はありませんでした。');
}

// ==========================================
// 読み取り（純粋関数。スプレッドシートに触らない）
// ==========================================

/**
 * 店舗タブ1枚分の値（getValues の2次元配列）から、問合せ・NB明細とキャンセル明細を取り出す。
 * 明細の見出しがないタブは null を返す。
 */
function parseReportTab_(values, ctx) {
  const entryHeader = findRow_(values, 0, function(row) {
    return norm_(row[1]).indexOf('新規/') === 0 && row.some(function(c) { return norm_(c).indexOf('問合せ方法') >= 0; });
  });
  if (entryHeader < 0) return null;

  const entryCols = mapColumns_(values[entryHeader], ENTRY_DEFAULT_COLS, function(label) {
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
    if (label.indexOf('履歴') >= 0) return 'historyLink';
    return null;
  });
  if (entryCols.media !== ENTRY_DEFAULT_COLS.media) entryCols.media2 = entryCols.media + 2;

  const entryEnd = findSectionEnd_(values, entryHeader + 1);
  const warnings = { noDate: 0, dateFromFile: 0 };
  const entries = [];
  for (let r = entryHeader + 1; r < entryEnd; r++) {
    const row = values[r];
    const pick = function(key) { return cell_(row, entryCols[key]); };
    const e = {
      type: pick('type'), method: pick('method'), media: pick('media'), media2: pick('media2'),
      staff: pick('staff'), challenge: challenge_(row[entryCols.challenge]),
      cplTour: number_(row[entryCols.cplTour]), guestTour: number_(row[entryCols.guestTour]),
      area: pick('area'), result: pick('result'), agt: pick('agt'), venue: pick('venue'), plan: pick('plan'),
      reason: pick('reason'), historyLink: pick('historyLink')
    };
    const hasContent = e.type || e.staff || e.challenge || e.area || e.venue || e.result || e.agt ||
      cell_(row, entryCols.nbDate) || cell_(row, entryCols.weddingDate);
    if (!hasContent) continue;

    e.nbDate = toDate_(row[entryCols.nbDate], ctx);
    if (!e.nbDate) {
      if (ctx && ctx.fileMonth && !cell_(row, entryCols.nbDate)) {
        e.nbDate = new Date(ctx.fileMonth.getTime());
        warnings.dateFromFile++;
      } else {
        warnings.noDate++;
        continue;
      }
    }
    e.weddingDate = toDate_(row[entryCols.weddingDate], ctx) || cell_(row, entryCols.weddingDate);
    entries.push(e);
  }

  const cancels = [];
  const cancelHeader = findRow_(values, entryEnd, function(row) {
    return row.some(function(c) { return norm_(c) === 'CXL年月日'; });
  });
  if (cancelHeader >= 0) {
    const cancelCols = mapColumns_(values[cancelHeader], CANCEL_DEFAULT_COLS, function(label) {
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
    const cancelEnd = findSectionEnd_(values, cancelHeader + 1);
    for (let r = cancelHeader + 1; r < cancelEnd; r++) {
      const row = values[r];
      const c = {
        cxlDate: toDate_(row[cancelCols.cxlDate], ctx),
        staff: cell_(row, cancelCols.staff),
        challenge: challenge_(row[cancelCols.challenge]),
        weddingDate: toDate_(row[cancelCols.weddingDate], ctx) || cell_(row, cancelCols.weddingDate),
        pax: number_(row[cancelCols.pax]),
        area: cell_(row, cancelCols.area), agt: cell_(row, cancelCols.agt), venue: cell_(row, cancelCols.venue),
        reason: cell_(row, cancelCols.reason)
      };
      if (!c.cxlDate && !c.challenge && !c.staff) continue;
      cancels.push(c);
    }
  }

  return { entries: entries, cancels: cancels, warnings: warnings };
}

/** 明細1件を DATA シートの1行（DATA_HEADERS の順）に変換する。 */
function entryToDataRow_(e, store) {
  let reason = e.reason || '';
  if (e.media2) reason = (reason ? reason + ' / ' : '') + '媒体2件目: ' + e.media2;
  return [
    e.nbDate, e.type, e.method, e.media, e.nbDate, e.staff, e.challenge, e.cplTour, e.guestTour,
    e.weddingDate || '', e.area, e.result, e.agt, e.venue, e.plan, reason, e.historyLink, store
  ];
}

/** 同じ内容の行かどうかの判定に使うキー。編集されやすい備考・リンク・旅行人数は含めない。 */
function dataFingerprint_(row) {
  return [row[17], row[1], ymd_(row[4] || row[0]), row[5], row[6], row[2], row[3], ymd_(row[9]), row[10], row[11], row[12], row[13], row[14]]
    .map(function(v) { return String(v === null || v === undefined ? '' : v).trim(); })
    .join('|');
}

function cancelFingerprint_(row) {
  return [row[9], ymd_(row[0]), row[1], row[2], ymd_(row[3]), row[4], row[5], row[6], row[7]]
    .map(function(v) { return String(v === null || v === undefined ? '' : v).trim(); })
    .join('|');
}

/** ファイル名（例:「47期AVA日報12月」）から期と月を読み取る。読めなければ null の項目になる。 */
function contextFromBookName_(name) {
  const p = String(name).match(/(\d+)\s*期/);
  const startYear = p ? Number(p[1]) + FISCAL_PERIOD_OFFSET : null;
  const m = String(name).replace(/(\d+)\s*期/, '').match(/(\d{1,2})\s*月/);
  let fileMonth = null;
  if (startYear && m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) {
      fileMonth = new Date(month >= FISCAL_START_MONTH ? startYear : startYear + 1, month - 1, 1);
    }
  }
  return { startYear: startYear, fileMonth: fileMonth };
}

/**
 * セルの値を日付にする。Date・シリアル値・「2026/12/5」「2026-12-05」「2026年12月5日」・
 * 年なしの「12/5」「12月5日」（ファイルの期から年を補う）に対応。読めなければ null。
 */
function toDate_(v, ctx) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) || v.getFullYear() < 1950 ? null : v;
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return new Date(1899, 11, 30 + Math.floor(v));
    return null;
  }
  const s = String(v).trim().replace(/[０-９]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
  let m = s.match(/^(\d{4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/);
  if (m) return validDate_(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?$/);
  if (m && ctx && ctx.startYear) {
    const month = Number(m[1]);
    return validDate_(month >= FISCAL_START_MONTH ? ctx.startYear : ctx.startYear + 1, month, Number(m[2]));
  }
  return null;
}

function validDate_(y, m, d) {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

function ymd_(v) {
  const d = toDate_(v, null);
  if (!d) return v === null || v === undefined ? '' : String(v);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function norm_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\s/g, '');
}

function cell_(row, idx) {
  if (idx === undefined || idx === null || idx >= row.length) return '';
  const v = row[idx];
  return v === null || v === undefined ? '' : String(v).trim();
}

function number_(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(String(v).replace(/[,，\s]/g, ''));
  return isNaN(n) ? String(v).trim() : n;
}

/** チャレンジNOは数字だけのものがセルに数値で入っていることがあるので文字列にそろえる。 */
function challenge_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(Math.round(v));
  return String(v).trim();
}

function findRow_(values, from, test) {
  for (let r = from; r < values.length; r++) {
    if (test(values[r])) return r;
  }
  return -1;
}

/** 次の「▼」で始まる見出し行（▼キャンセル / ▼各種集計）の位置。なければ最終行の次。 */
function findSectionEnd_(values, from) {
  for (let r = from; r < values.length; r++) {
    if (norm_(values[r][1]).indexOf('▼') === 0) return r;
  }
  return values.length;
}

function mapColumns_(headerRow, defaults, labelToKey) {
  const cols = {};
  Object.keys(defaults).forEach(function(k) { cols[k] = defaults[k]; });
  const found = {};
  headerRow.forEach(function(cell, idx) {
    const key = labelToKey(norm_(cell));
    if (key && !found[key]) { cols[key] = idx; found[key] = true; }
  });
  return cols;
}

// ==========================================
// 店舗名の対応表
// ==========================================

function getMasterStores_() {
  const sheet = SS.getSheetByName('MASTER');
  if (!sheet) return [];
  const list = [];
  const seen = {};
  sheet.getDataRange().getValues().forEach(function(row) {
    if (String(row[0]).trim() !== '店舗') return;
    const name = String(row[1] || '').trim();
    if (!name || seen[name]) return;
    seen[name] = true;
    list.push({ name: name, category: String(row[4] || '').trim() });
  });
  return list;
}

/** タブ名に対応する MASTER の店舗名を推測する。{ name, note } を返す（name が空なら要確認）。 */
function guessStoreName_(tabName, masterStores) {
  const key = storeKey_(tabName);
  const exact = masterStores.filter(function(s) { return storeKey_(s.name) === key; });
  if (exact.length) return { name: exact[0].name, note: '自動（完全一致）' };
  const cands = masterStores.filter(function(s) { return storeKey_(s.name).indexOf(key) >= 0; });
  if (cands.length === 1) return { name: cands[0].name, note: '自動（候補1件）' };
  if (cands.length > 1) {
    const ava = cands.filter(function(s) { return s.category === 'AVA'; });
    if (ava.length === 1) return { name: ava[0].name, note: '自動（AVAを優先。他の候補: ' + cands.filter(function(s) { return s !== ava[0]; }).map(function(s) { return s.name; }).join('／') + '）' };
    return { name: '', note: '要確認：候補が複数あります（' + cands.map(function(s) { return s.name; }).join('／') + '）' };
  }
  return { name: tabName, note: 'MASTERに該当なし（タブ名のまま登録）' };
}

function storeKey_(s) {
  return String(s).replace(/[\s　]/g, '').replace(/＆/g, '&').toLowerCase();
}

function addTabsToStoreMap_(tabNames, masterStores) {
  const sheet = SS.getSheetByName(IMPORT_STORE_MAP_SHEET);
  if (!sheet) return;
  const existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function(r) {
      existing[String(r[0]).trim()] = true;
    });
  }
  const rows = [];
  tabNames.forEach(function(tab) {
    if (existing[tab]) return;
    existing[tab] = true;
    const g = guessStoreName_(tab, masterStores);
    rows.push([tab, g.name, g.note]);
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
}

function getStoreMap_() {
  const sheet = SS.getSheetByName(IMPORT_STORE_MAP_SHEET);
  const map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function(r) {
    const tab = String(r[0]).trim();
    const store = String(r[1]).trim();
    if (tab && store) map[tab] = store;
  });
  return map;
}

// ==========================================
// シート操作の補助
// ==========================================

/**
 * 既存の DATA_○期・CANCEL シートの行のキーを件数つきで集める（再取り込み時の二重登録防止）。
 * 同じ日に同じ内容の問合せが本当に2件あるケースもあるので、「あるかないか」ではなく件数で比べる。
 */
function createDedupIndex_() {
  const index = { data: {}, cancel: {}, seen: { data: {}, cancel: {} } };
  SS.getSheets().forEach(function(sheet) {
    const name = sheet.getName();
    if (/^DATA_\d+期$/.test(name) && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, DATA_HEADERS.length).getValues().forEach(function(row) {
        const key = dataFingerprint_(row);
        index.data[key] = (index.data[key] || 0) + 1;
      });
    }
    if (name === CANCEL_SHEET && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, CANCEL_HEADERS.length).getValues().forEach(function(row) {
        const key = cancelFingerprint_(row);
        index.cancel[key] = (index.cancel[key] || 0) + 1;
      });
    }
  });
  return index;
}

/** 取り込もうとしている行と同じ内容の行が、シートに既にその件数分あるか。 */
function isAlreadyStored_(dedup, kind, key) {
  dedup.seen[kind][key] = (dedup.seen[kind][key] || 0) + 1;
  return dedup.seen[kind][key] <= (dedup[kind][key] || 0);
}

function getCancelSheet_() {
  let sheet = SS.getSheetByName(CANCEL_SHEET);
  if (!sheet) {
    sheet = SS.insertSheet(CANCEL_SHEET);
    sheet.getRange(1, 1, 1, CANCEL_HEADERS.length).setValues([CANCEL_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function writeSourceStatus_(sheet, rowNo, status, entries, cancels, memo) {
  sheet.getRange(rowNo, 2, 1, 5).setValues([[status, new Date(), entries, cancels, memo]]);
}

function notify_(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg); // スクリプトエディタから実行した場合はログに出す
  }
}
