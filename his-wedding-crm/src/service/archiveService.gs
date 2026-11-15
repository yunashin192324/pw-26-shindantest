/**
 * archiveService.gs
 * 過去データの自動アーカイブ（Q&A六巡目）。
 *
 * 狙い：
 *  1. 手配一覧・案件一覧を「今やるべきこと」だけの一覧に保つ（完了済みの過去案件は過去一覧へ）
 *  2. 本体スプレッドシート（Cases/Operations等）を軽く保ち、読み込み速度を落とさない
 *  3. スプレッドシート1ファイルあたりのセル数上限にいずれ達してしまう不安に備え、
 *     年ごとに"別ファイルの"アーカイブ用スプレッドシートを自動生成して退避先を分散する
 *     （同じファイルにタブを増やし続けるだけでは、いずれ同じ上限にぶつかるため）
 *
 * アーカイブ対象の判定ルール（あえて「今日より前なら即アーカイブ」にはしていない）：
 *  ・案件が終了状態（完了／未成約／キャンセル）であること。現在進行中の案件は絶対に動かさない
 *  ・かつ、関連日付（挙式日・撮影日。無ければ更新日時／受付日時）の年が「今年－(ARCHIVE_KEEP_YEARS-1)」
 *    より前であること。既定のARCHIVE_KEEP_YEARS=2により、今年＋前年の2年分は必ず本体シートに残る。
 *    → ダッシュボードの前年比較（来店数・成約数・方面内ランキング・積み上げ等）は今年・前年のデータを
 *      本体シートから直接参照しているため、この2年分を退避してしまうと前年比較が壊れる。それを防ぐための
 *      安全マージンとして「今日より前なら即アーカイブ」ではなく年単位の据え置き期間を設けている。
 *  ・手配一覧・案件一覧の画面側では、この物理アーカイブとは別に「今日より前の挙式日」を
 *    ワンタップで「過去」タブへ絞り込める（第9章参照）。表示上のフィルタなので本体データの移動は伴わず、
 *    直近の過去（まだ本体シートにある）もこのタブでそのまま編集を続けられる。
 */

// 案件（CASE_ID）に紐づき、まとめて退避する「案件一式」のシート一覧
// CaseSummaryMemo・CaseDocumentChecksもCASE_ID列を持つため、他の案件系シートと同じ仕組みで退避できる（Q&A九巡目）。
const ARCHIVE_CASE_FAMILY_SHEETS_ = [
  SHEET_NAMES.CASES, SHEET_NAMES.CUSTOMERS, SHEET_NAMES.WEDDING_REQUESTS, SHEET_NAMES.PHOTO_REQUESTS,
  SHEET_NAMES.SALES_HISTORY, SHEET_NAMES.CASE_NOTES, SHEET_NAMES.CASE_SUMMARY_MEMO, SHEET_NAMES.CONTRACTS,
  SHEET_NAMES.LOST_CASES, SHEET_NAMES.OPERATIONS, SHEET_NAMES.OPERATION_HISTORY, SHEET_NAMES.OPERATION_MEMOS,
  SHEET_NAMES.TASKS, SHEET_NAMES.CASE_DOCUMENT_CHECKS
];

const ARCHIVE_TERMINAL_STATUSES_ = ['完了', '未成約', 'キャンセル'];

/**
 * 案件に紐づかない全社共通のログ系シート（操作ログ・フォーム受信ログ・未マッピング回答）。
 * CASE_IDを持たないため案件一式とは別ロジックで、日付列だけを見て年ごとに退避する（Q&A八巡目：
 * 「容量的に大丈夫か」への回答の中で、案件一式のアーカイブ対象に入っていない唯一の増え続ける
 * シート群として洗い出したもの。同じ年ファイル・同じArchiveIndexの仕組みをそのまま流用する）。
 */
const ARCHIVE_LOG_SHEETS_ = [
  { name: SHEET_NAMES.SYSTEM_LOGS, dateCol: '日時' },
  { name: SHEET_NAMES.FORM_RESPONSES, dateCol: '受信日時' },
  { name: SHEET_NAMES.UNMAPPED_RESPONSES, dateCol: '受信日時' }
];

/** 本体シートに残す年数（今年を含む）。Settingsで運用中に調整できる */
function archiveService_keepYears_() {
  return getSettingNumber_('ARCHIVE_KEEP_YEARS', 2);
}

/**
 * アーカイブ対象の案件（CASE_ID＋退避先の年）一覧を判定する。
 * 終了状態（完了／未成約／キャンセル）かつ、関連日付がkeepYears年より前のものだけを対象とする。
 */
function archiveService_findCasesToArchive_() {
  const keepYears = archiveService_keepYears_();
  const cutoffYear = new Date().getFullYear() - keepYears + 1; // 例：今年2026・keepYears=2 → 2025年以降は残す

  const cases = caseRepo_getAll().filter(function (c) { return ARCHIVE_TERMINAL_STATUSES_.indexOf(c.案件状態) !== -1; });
  const opByCaseId = {};
  operationRepo_getAll().forEach(function (op) { opByCaseId[op.CASE_ID] = op; });

  const targets = [];
  cases.forEach(function (c) {
    const op = opByCaseId[c.CASE_ID];
    const anchorDate = (op && op['挙式日（撮影日）']) || c.更新日時 || c.受付日時;
    if (!anchorDate) return;
    const d = new Date(anchorDate);
    if (isNaN(d.getTime())) return;
    const year = d.getFullYear();
    if (year < cutoffYear) targets.push({ caseId: c.CASE_ID, year: year });
  });
  return targets;
}

/**
 * 年ごとのアーカイブ用スプレッドシートを取得する。無ければ新規作成し、案件一式＋ログ系シートを
 * 本体と同じヘッダー構成で用意する（SHEET_DEFINITIONS_を流用し、定義の二重管理を避ける）。
 */
function archiveService_getOrCreateArchiveSpreadsheet_(year) {
  const indexSheet = getSheet_(SHEET_NAMES.ARCHIVE_INDEX);
  const rows = sheetToObjects_(indexSheet);
  const existing = rows.find(function (r) { return Number(r.年) === Number(year); });
  if (existing && existing.スプレッドシートID) {
    const ss = SpreadsheetApp.openById(existing.スプレッドシートID);
    archiveService_ensureLogSheetsExist_(ss); // 本機能追加前に作られた年ファイルにも後付けで用意する
    return ss;
  }

  const ss = SpreadsheetApp.create('HIS WEDDING CRM 過去データアーカイブ ' + year + '年');
  const defaultSheet = ss.getSheets()[0];
  const allSheetNames = ARCHIVE_CASE_FAMILY_SHEETS_.concat(ARCHIVE_LOG_SHEETS_.map(function (d) { return d.name; }));
  allSheetNames.forEach(function (sheetName, i) {
    const def = SHEET_DEFINITIONS_.find(function (d) { return d.name === sheetName; });
    const targetSheet = i === 0 ? defaultSheet.setName(sheetName) : ss.insertSheet(sheetName);
    targetSheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    targetSheet.setFrozenRows(1);
    targetSheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
  });

  appendRowFromObject_(indexSheet, { 年: year, スプレッドシートID: ss.getId(), 作成日時: new Date() });
  return ss;
}

/** 既存の年アーカイブファイルに、ログ系シートがまだ無ければ後付けで作成する（後方互換のため） */
function archiveService_ensureLogSheetsExist_(ss) {
  ARCHIVE_LOG_SHEETS_.forEach(function (logDef) {
    if (ss.getSheetByName(logDef.name)) return;
    const def = SHEET_DEFINITIONS_.find(function (d) { return d.name === logDef.name; });
    const sheet = ss.insertSheet(logDef.name);
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
  });
}

/** 指定した案件（CASE_ID）の関連行をすべて、指定年のアーカイブへ移動する（コピー後に本体から削除） */
function archiveService_archiveCase_(caseId, year) {
  const archiveSs = archiveService_getOrCreateArchiveSpreadsheet_(year);
  ARCHIVE_CASE_FAMILY_SHEETS_.forEach(function (sheetName) {
    const liveSheet = getSheet_(sheetName);
    const rows = getRowsAsObjectsByKey_(liveSheet, 'CASE_ID', caseId);
    if (rows.length === 0) return;
    const archiveSheet = archiveSs.getSheetByName(sheetName);
    rows.forEach(function (r) {
      const obj = Object.assign({}, r);
      delete obj.__row;
      appendRowFromObject_(archiveSheet, obj);
    });
    deleteRows_(liveSheet, rows.map(function (r) { return r.__row; }));
  });
}

/**
 * ログ系シート（SystemLogs・FormResponses・UnmappedResponses）のうち、日付列がkeepYears年より
 * 古い行を年ごとにグルーピングして退避対象を洗い出す。案件に紐づかないため、案件一式とは別に
 * シート単位・行番号単位で扱う。
 */
function archiveService_findLogRowsToArchive_() {
  const keepYears = archiveService_keepYears_();
  const cutoffYear = new Date().getFullYear() - keepYears + 1;

  // { シート名: { year: [__row, __row, ...] } }
  const byCaseSheetYear = {};
  ARCHIVE_LOG_SHEETS_.forEach(function (def) {
    const sheet = getSheet_(def.name);
    const rows = sheetToObjects_(sheet);
    rows.forEach(function (r) {
      const raw = r[def.dateCol];
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return;
      const year = d.getFullYear();
      if (year >= cutoffYear) return;
      byCaseSheetYear[def.name] = byCaseSheetYear[def.name] || {};
      byCaseSheetYear[def.name][year] = byCaseSheetYear[def.name][year] || [];
      byCaseSheetYear[def.name][year].push(r.__row);
    });
  });
  return byCaseSheetYear;
}

/**
 * ログ系シートの退避を実行する（年ファイル単位でコピーしてから本体を削除。案件一式と同じ流れ）。
 */
function archiveService_archiveLogRows_() {
  const byCaseSheetYear = archiveService_findLogRowsToArchive_();
  let movedTotal = 0;

  Object.keys(byCaseSheetYear).forEach(function (sheetName) {
    const liveSheet = getSheet_(sheetName);
    const byYear = byCaseSheetYear[sheetName];
    Object.keys(byYear).forEach(function (yearStr) {
      const year = Number(yearStr);
      const rowIndexes = byYear[yearStr];
      const archiveSs = archiveService_getOrCreateArchiveSpreadsheet_(year);
      const archiveSheet = archiveSs.getSheetByName(sheetName);
      // 退避対象行をオブジェクト化してからコピー（削除で行番号がズレる前に読み切る）
      const objs = rowIndexes.map(function (rowIndex) { return getRowAsObject_(liveSheet, rowIndex); });
      objs.forEach(function (obj) {
        const copy = Object.assign({}, obj);
        delete copy.__row;
        appendRowFromObject_(archiveSheet, copy);
      });
      deleteRows_(liveSheet, rowIndexes);
      movedTotal += rowIndexes.length;
    });
  });
  return movedTotal;
}

/**
 * 過去データアーカイブ処理フロー（毎日深夜。AnalyticsCache再計算の後に実行すること。
 * ダッシュボードの集計値はAnalyticsCacheが既に持っているため、その後で本体シートから
 * 行を退避してもダッシュボードの数字自体は変わらない）。
 */
function batchArchiveOldRecords() {
  try {
    const targets = archiveService_findCasesToArchive_();
    targets.forEach(function (t) { archiveService_archiveCase_(t.caseId, t.year); });
    if (targets.length > 0) {
      writeSystemLog_({ 実行者: 'batch', 操作種別: 'ARCHIVE_OLD_RECORDS', 対象CASE_ID: '', 変更前後の値の要約: targets.length + '件の案件を過去アーカイブへ退避しました。' });
    }

    // ログ系シート（SystemLogs等）の退避。writeSystemLog_自体がこの後にログを書くため、
    // 「退避しました」のログはここでは案件分とまとめて上のログ1件に含める形にはせず、
    // 退避件数が0件の場合は何も書かない（ログ肥大化を、ログの退避処理自体が招かないようにするため）。
    const movedLogRows = archiveService_archiveLogRows_();
    if (movedLogRows > 0) {
      writeSystemLog_({ 実行者: 'batch', 操作種別: 'ARCHIVE_OLD_LOGS', 対象CASE_ID: '', 変更前後の値の要約: movedLogRows + '行のログ系データを過去アーカイブへ退避しました。' });
    }
  } catch (e) {
    notifyBatchFailure_('過去データアーカイブバッチ', String(e && e.message ? e.message : e));
  }
}

/** アーカイブが存在する年の一覧（新しい順） */
function archiveService_listArchiveYears() {
  const rows = sheetToObjects_(getSheet_(SHEET_NAMES.ARCHIVE_INDEX));
  return rows.map(function (r) { return Number(r.年); }).sort(function (a, b) { return b - a; });
}

/** 指定年のアーカイブスプレッドシートを開く。無ければnull */
function archiveService_openYear_(year) {
  const rows = sheetToObjects_(getSheet_(SHEET_NAMES.ARCHIVE_INDEX));
  const idxRow = rows.find(function (r) { return Number(r.年) === Number(year); });
  if (!idxRow || !idxRow.スプレッドシートID) return null;
  return SpreadsheetApp.openById(idxRow.スプレッドシートID);
}

/** 過去一覧（案件）：指定年のアーカイブから、案件一覧と同じ形の行を組み立てて返す（storeId/regionでスコープ） */
function archiveService_getCaseArchiveList(year, scope) {
  const ss = archiveService_openYear_(year);
  if (!ss) return [];

  const cases = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.CASES));
  const customers = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.CUSTOMERS));
  const operations = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.OPERATIONS));
  const contracts = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.CONTRACTS))
    .filter(function (c) { return c.有効フラグ === true || c.有効フラグ === 'TRUE'; });
  const customerByCase = {}; customers.forEach(function (c) { customerByCase[c.CASE_ID] = c; });
  const opByCase = {}; operations.forEach(function (o) { opByCase[o.CASE_ID] = o; });
  const contractByCase = {}; contracts.forEach(function (c) { contractByCase[c.CASE_ID] = c; });
  const storeById = {}; storeRepo_getAll().forEach(function (s) { storeById[s.STORE_ID] = s; });

  let filtered = cases;
  if (scope && scope.storeId) filtered = filtered.filter(function (c) { return c.店舗ID === scope.storeId; });
  else if (scope && scope.region) filtered = filtered.filter(function (c) { const s = storeById[c.店舗ID]; return s && s.地方 === scope.region; });

  return filtered.map(function (c) {
    const customer = customerByCase[c.CASE_ID];
    const op = opByCase[c.CASE_ID];
    const contract = contractByCase[c.CASE_ID];
    const store = storeById[c.店舗ID];
    const simpleStatus = ['完了'].indexOf(c.案件状態) !== -1 ? '成約' : (['未成約', 'キャンセル'].indexOf(c.案件状態) !== -1 ? '未成約' : '');
    return {
      CASE_ID: c.CASE_ID,
      新郎姓名: customer ? (customer.新郎姓 + ' ' + customer.新郎名) : '',
      新婦姓名: customer ? (customer.新婦姓 + ' ' + customer.新婦名) : '',
      店舗ID: c.店舗ID, 店舗名: store ? store.店舗名 : '', 地方: store ? store.地方 : '',
      登録経路: c.登録経路, 相談区分: c.相談区分, チャレンジ番号: c.チャレンジ番号, 案件状態: c.案件状態, 簡易状態: simpleStatus, 更新日時: c.更新日時,
      手配状態: op ? op.手配状態 : '', 方面: contract ? contract.方面 : '', AGT: contract ? contract.現地会社 : '',
      挙式日: op ? op['挙式日（撮影日）'] : '',
      挙式月: op && op['挙式日（撮影日）'] ? String(op['挙式日（撮影日）']).slice(0, 7) : ''
    };
  });
}

/** 過去一覧（手配）：指定年のアーカイブから、手配一覧と同じ形の行を組み立てて返す（storeId/regionでスコープ） */
function archiveService_getOperationArchiveList(year, scope) {
  const ss = archiveService_openYear_(year);
  if (!ss) return [];

  const operations = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.OPERATIONS));
  const cases = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.CASES));
  const customers = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.CUSTOMERS));
  const contracts = sheetToObjects_(ss.getSheetByName(SHEET_NAMES.CONTRACTS))
    .filter(function (c) { return c.有効フラグ === true || c.有効フラグ === 'TRUE'; });
  const caseById = {}; cases.forEach(function (c) { caseById[c.CASE_ID] = c; });
  const customerByCase = {}; customers.forEach(function (c) { customerByCase[c.CASE_ID] = c; });
  const contractByCase = {}; contracts.forEach(function (c) { contractByCase[c.CASE_ID] = c; });
  const storeById = {}; storeRepo_getAll().forEach(function (s) { storeById[s.STORE_ID] = s; });

  return operations.map(function (op) {
    const c = caseById[op.CASE_ID];
    const store = c ? storeById[c.店舗ID] : null;
    if (scope && scope.storeId && (!c || c.店舗ID !== scope.storeId)) return null;
    if (scope && scope.region && (!store || store.地方 !== scope.region)) return null;
    const customer = customerByCase[op.CASE_ID];
    const contract = contractByCase[op.CASE_ID];
    return Object.assign({}, op, {
      __storeId: c ? c.店舗ID : '', __storeName: store ? store.店舗名 : '', __region: store ? store.地方 : '',
      __customerName: customer ? [customer.新郎姓, customer.新郎名, '・', customer.新婦姓, customer.新婦名].join('') : '',
      __area: contract ? contract.方面 : ''
    });
  }).filter(function (r) { return r; });
}
