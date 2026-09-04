const { makeContext } = require('./gas_harness');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '\n        → ' + extra : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

// 日付は必ず vm 内の Date で作る（instanceof Date を通すため）
let CTX = null;
function daysAgo(n) { return CTX.__daysFromToday(-n); }
function daysAhead(n) { return CTX.__daysFromToday(n); }

// ---------------------------------------------------------------
section('1. 既存シートへの列追加（マイグレーション）');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  // 旧スキーマのやり取り履歴シート（送信者ロール・氏名列がない）を作る
  const h = ss.insertSheet('やり取り履歴');
  const OLD = ['__id','支店コード','管理番号','CHG NO','撮影日FIX','新郎名（ローマ字）','新婦名（ローマ字）',
               '日時','送信者','内容','CHECK JP','DATE JP','CHECK 支店','DATE 支店'];
  h.getRange(1,1,1,OLD.length).setValues([OLD]);
  h.appendRow(['old-1','VIE','VIE-001','','','','','2026/01/01','旧データ','既存の本文','','','','']);

  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  const after = h.getRange(1,1,1,h.getLastColumn()).getValues()[0];

  check('旧列の並びが保持されている', OLD.every((c,i) => after[i] === c));
  check('新列（送信者ロール）が追加された', after.includes('送信者ロール'));
  check('新列（CHECK JP 氏名）が追加された', after.includes('CHECK JP 氏名'));
  check('新列（CHECK 支店 氏名）が追加された', after.includes('CHECK 支店 氏名'));
  check('既存データが壊れていない', h.getRange(2,10,1,1).getValues()[0][0] === '既存の本文');
  check('列がすべて揃った', ctx.HISTORY_HEADERS.every(c => after.includes(c)),
        '不足: ' + ctx.HISTORY_HEADERS.filter(c => !after.includes(c)).join(','));

  // 2回実行しても重複しない
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  const after2 = h.getRange(1,1,1,h.getLastColumn()).getValues()[0];
  check('再実行しても列が重複しない', after2.length === after.length, `${after.length} → ${after2.length}`);
}

// ---------------------------------------------------------------
section('2. 履歴の書き込みが「列名基準」で正しい位置に入る');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  const h = ss.insertSheet('やり取り履歴');
  // わざとコード側の定数と違う並び順にする
  const SHUFFLED = ['内容','__id','送信者ロール','送信者','日時','管理番号','支店コード','CHG NO',
                    '撮影日FIX','新郎名（ローマ字）','新婦名（ローマ字）','CHECK JP','DATE JP',
                    'CHECK JP 氏名','CHECK 支店','DATE 支店','CHECK 支店 氏名'];
  h.getRange(1,1,1,SHUFFLED.length).setValues([SHUFFLED]);

  const resHeaders = ctx.RESERVATION_HEADERS;
  const rowData = new Array(resHeaders.length).fill('');
  rowData[resHeaders.indexOf('支店コード')] = 'VIE';
  rowData[resHeaders.indexOf('管理番号')] = 'VIE-014';
  rowData[resHeaders.indexOf('新郎名（ローマ字）')] = 'Yuma Tanaka';

  ctx.appendHistory_(resHeaders, rowData, 'Tanaka（関東手配課）', 'テスト本文', 'JP');

  const written = h.getRange(2,1,1,SHUFFLED.length).getValues()[0];
  const at = (name) => written[SHUFFLED.indexOf(name)];
  check('内容が「内容」列に入る', at('内容') === 'テスト本文', `実際: ${at('内容')}`);
  check('送信者ロールが正しい列に入る', at('送信者ロール') === 'JP', `実際: ${at('送信者ロール')}`);
  check('管理番号が正しい列に入る', at('管理番号') === 'VIE-014', `実際: ${at('管理番号')}`);
  check('新郎名が正しい列に入る', at('新郎名（ローマ字）') === 'Yuma Tanaka', `実際: ${at('新郎名（ローマ字）')}`);
}

// ---------------------------------------------------------------
section('3. 納品期限アラート（過去一覧も走査されるか）');
function deliveryScenario(opts) {
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','p','kanto@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','p','vie@his-world.com','VIE','', opts.deliveryDays === undefined ? '' : opts.deliveryDays, '', '', true]);

  ctx.ensureSheetWithHeaders_(ss, '予約一覧', ctx.RESERVATION_HEADERS);
  const target = ctx.ensureSheetWithHeaders_(ss, opts.sheet, ctx.RESERVATION_HEADERS);
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  row[H.indexOf('支店コード')] = 'VIE';
  row[H.indexOf('管理番号')] = 'VIE-014';
  row[H.indexOf('管轄')] = '関東';
  row[H.indexOf('撮影日FIX')] = daysAgo(opts.daysPast);
  row[H.indexOf('DriveフォルダURL')] = opts.drive || '';
  if (opts.stsJp) row[H.indexOf('STS JP')] = opts.stsJp;
  target.appendRow(row);

  ctx.checkDeliveryAlerts();
  return ctx.__mail;
}
{
  check('過去一覧の案件・撮影30日後・未納品 → アラートが飛ぶ',
        deliveryScenario({ sheet: '過去一覧', daysPast: 30 }).length === 1);
  check('予約一覧の案件でも飛ぶ',
        deliveryScenario({ sheet: '予約一覧', daysPast: 30 }).length === 1);
  check('29日後（期限前）は飛ばない',
        deliveryScenario({ sheet: '過去一覧', daysPast: 29 }).length === 0);
  check('納品済み（Drive URLあり）は飛ばない',
        deliveryScenario({ sheet: '過去一覧', daysPast: 30, drive: 'https://drive.google.com/x' }).length === 0);
  check('キャンセル(CW)案件は飛ばない',
        deliveryScenario({ sheet: '過去一覧', daysPast: 30, stsJp: 'CW' }).length === 0);
  check('期限日から7日後にも再通知される（実行漏れ対策）',
        deliveryScenario({ sheet: '過去一覧', daysPast: 37 }).length === 1);
  check('期限日から8日後には送らない（毎日送信しない）',
        deliveryScenario({ sheet: '過去一覧', daysPast: 38 }).length === 0);
  check('期限日から29日以上経ったら打ち切る（無限送信しない）',
        deliveryScenario({ sheet: '過去一覧', daysPast: 30 + 35 }).length === 0);
  check('支店ごとの納品期限日数（21日）が効く',
        deliveryScenario({ sheet: '過去一覧', daysPast: 21, deliveryDays: 21 }).length === 1);
  check('納品期限日数21日設定時、30日はデフォルトで誤爆しない',
        deliveryScenario({ sheet: '過去一覧', daysPast: 30, deliveryDays: 21 }).length === 0,
        '21+7=28, 21+14=35 のため30日は対象外が正しい');
  const m0 = deliveryScenario({ sheet: '過去一覧', daysPast: 1, deliveryDays: 0 });
  check('納品期限日数0（翌日から即アラート）が設定できる', m0.length === 1);
  const m1 = deliveryScenario({ sheet: '過去一覧', daysPast: 30 });
  check('アラート宛先に管轄チーム（関東）が含まれる', m1[0].to.includes('kanto@his-world.com'), m1[0].to);
  // ★要件変更：以前は日本側（手配課）だけへの通知だったが、現地支店にも同じメールを送るようにした
  check('アラート宛先に現地支店（ウィーン）も含まれる（従来は手配課のみだった）',
        m1[0].to.includes('vie@his-world.com'), m1[0].to);
}

// ---------------------------------------------------------------
section('4. 過去一覧への移動で列がずれないか');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '予約一覧', ctx.RESERVATION_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  // 過去一覧はわざと列順を変えて作る
  const arch = ss.insertSheet('過去一覧');
  const REV = ctx.RESERVATION_HEADERS.slice().reverse();
  arch.getRange(1,1,1,REV.length).setValues([REV]);

  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  row[H.indexOf('支店コード')] = 'VIE';
  row[H.indexOf('管理番号')] = 'VIE-099';
  row[H.indexOf('新郎名（ローマ字）')] = 'Past Groom';
  row[H.indexOf('撮影日FIX')] = daysAgo(3);
  res.appendRow(row);

  ctx.archivePastReservations();

  check('予約一覧から消えた', res.getLastRow() === 1);
  const aHead = arch.getRange(1,1,1,arch.getLastColumn()).getValues()[0];
  const aRow = arch.getRange(2,1,1,aHead.length).getValues()[0];
  check('管理番号が過去一覧の正しい列に入る', aRow[aHead.indexOf('管理番号')] === 'VIE-099',
        `実際: ${aRow[aHead.indexOf('管理番号')]}`);
  check('新郎名が過去一覧の正しい列に入る', aRow[aHead.indexOf('新郎名（ローマ字）')] === 'Past Groom',
        `実際: ${aRow[aHead.indexOf('新郎名（ローマ字）')]}`);
}

// ---------------------------------------------------------------
section('5. 統計：内訳の合計が件数と一致するか');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  ss.getSheetByName('支店マスタ').appendRow(['KANTO','関東手配課','','','JP','関東','pw','k@his-world.com','','','','', '', true]);
  ss.getSheetByName('支店マスタ').appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','pw','v@his-world.com','VIE','','','', '', true]);
  ctx.ensureSheetWithHeaders_(ss, '予約一覧', ctx.RESERVATION_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, '過去一覧', ctx.RESERVATION_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const add = (kanri, stsJp, stsBranch, when) => {
    const row = new Array(H.length).fill('');
    row[H.indexOf('支店コード')] = 'VIE';
    row[H.indexOf('管理番号')] = kanri;
    row[H.indexOf('管轄')] = '関東';
    row[H.indexOf('日本支店名')] = '新宿西口店';
    row[H.indexOf('STS JP')] = stsJp;
    row[H.indexOf('STS 支店')] = stsBranch;
    if (when) row[H.indexOf('撮影日FIX')] = when;
    res.appendRow(row);
  };
  add('VIE-001','RQ','NC', daysAhead(10));
  add('VIE-002','OK','OK', daysAhead(40));
  add('VIE-003','FN','FN', daysAhead(70));
  add('VIE-004','CW','CW', daysAhead(20));   // キャンセル → 除外
  add('VIE-005','RQ','NC', null);            // 撮影日未定
  add('VIE-006','CHK','NC', daysAgo(400));   // 対象期間外

  const login = ctx.apiLogin('KANTO','pw');
  const stats = ctx.apiGetStats(login.session.token, { showAll: true });

  check('現在進行中の件数がCWを除いた5件', stats.total === 5, `実際: ${stats.total}`);
  const sum = stats.months.reduce((a,m) => a + m.total, 0) + stats.undated.total;
  check('月別＋未定の合計＝現在進行中の件数', sum === stats.total, `合計 ${sum} vs total ${stats.total}`);
  const breakdownSum = stats.months.concat([stats.undated])
    .reduce((a,m) => a + m.needsAction + m.rq + m.ok + m.fn, 0);
  check('未対応/RQ/OK/FN の内訳合計＝件数', breakdownSum === stats.total, `内訳合計 ${breakdownSum} vs ${stats.total}`);
  check('月カードが12ヶ月分ある', stats.months.length === 12, `実際: ${stats.months.length}`);
  check('先頭が当月', stats.months[0].label === `${new Date().getMonth()+1}月`, `実際: ${stats.months[0].label}`);
  check('撮影日未定・期間外が undated に入る', stats.undated.total === 2, `実際: ${stats.undated.total}`);
  check('国別集計が出る', stats.byCountry.length === 1 && stats.byCountry[0].key === 'オーストリア');
  check('日本側店舗別集計が出る', stats.byJpShop.length === 1 && stats.byJpShop[0].key === '新宿西口店');
}

// ---------------------------------------------------------------
section('6. 要対応（未読）判定');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','k@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','v@his-world.com','VIE','','','', '', true]);
  ctx.ensureSheetWithHeaders_(ss, '予約一覧', ctx.RESERVATION_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, '過去一覧', ctx.RESERVATION_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  ['VIE-001','VIE-002'].forEach((k, i) => {
    const row = new Array(H.length).fill('');
    row[H.indexOf('支店コード')] = 'VIE';
    row[H.indexOf('管理番号')] = k;
    row[H.indexOf('管轄')] = '関東';
    row[H.indexOf('STS JP')] = 'RQ';
    row[H.indexOf('撮影日FIX')] = daysAhead(i === 0 ? 60 : 5); // VIE-002 の方が近い
    res.appendRow(row);
  });
  // VIE-001 に支店からの未読メッセージを作る
  const hs = ss.getSheetByName('やり取り履歴');
  const HH = ctx.HISTORY_HEADERS;
  const hrow = new Array(HH.length).fill('');
  hrow[HH.indexOf('__id')] = 'h1';
  hrow[HH.indexOf('管理番号')] = 'VIE-001';
  hrow[HH.indexOf('送信者ロール')] = 'BRANCH';
  hrow[HH.indexOf('日時')] = new Date();
  hrow[HH.indexOf('内容')] = '空き確認できました';
  hs.appendRow(hrow);

  // 履歴を直接書き込んだ（＝既存データの移行と同じ状況）ため、未読フラグを一括再計算する
  const rebuilt = ctx.rebuildUnreadFlags();
  check('未読フラグの一括再計算が実行される', rebuilt.ok === true && rebuilt.rows === 2, `実際: ${JSON.stringify(rebuilt)}`);

  const jp = ctx.apiLogin('KANTO','pw');
  let dash = ctx.apiGetDashboard(jp.session.token, { showAll: true });
  check('JP側：支店からの未読がある案件が要対応になる',
        dash.reservations.find(r => r.kanriNo === 'VIE-001').needsAction === true);
  check('JP側：未読のない案件は要対応にならない',
        dash.reservations.find(r => r.kanriNo === 'VIE-002').needsAction === false);
  check('要対応の案件が撮影日が近い案件より上に来る',
        dash.reservations[0].kanriNo === 'VIE-001', `先頭: ${dash.reservations[0].kanriNo}`);

  const br = ctx.apiLogin('VIE','vp');
  const bdash = ctx.apiGetDashboard(br.session.token, { showAll: true });
  check('支店側：自分が送ったメッセージは要対応にならない',
        bdash.reservations.every(r => r.needsAction === false));

  // JPが既読にすると要対応が解除され、元の並び順に戻る
  ctx.apiToggleHistoryCheck(jp.session.token, 'h1', true);
  dash = ctx.apiGetDashboard(jp.session.token, { showAll: true });
  check('既読にすると要対応が解除される',
        dash.reservations.find(r => r.kanriNo === 'VIE-001').needsAction === false);
  check('解除後は撮影日が近い順（VIE-002が上）に戻る',
        dash.reservations[0].kanriNo === 'VIE-002', `先頭: ${dash.reservations[0].kanriNo}`);
  const checkedRow = hs.getRange(2,1,1,HH.length).getValues()[0];
  check('既読者の氏名が記録される', checkedRow[HH.indexOf('CHECK JP 氏名')] === 'tanaka（関東手配課）',
        `実際: ${checkedRow[HH.indexOf('CHECK JP 氏名')]}`);
  check('既読日時が記録される', String(checkedRow[HH.indexOf('DATE JP')]).length > 0);
}

// ---------------------------------------------------------------
section('7. ステータス権限ゲート');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','k@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','v@his-world.com','VIE','','','', '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'ステータス変更履歴', ctx.STATUS_LOG_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  row[H.indexOf('支店コード')] = 'VIE';
  row[H.indexOf('管理番号')] = 'VIE-001';
  row[H.indexOf('管轄')] = '関東';
  row[H.indexOf('STS JP')] = 'RQ';
  res.appendRow(row);

  const jp = ctx.apiLogin('KANTO','pw');
  const br = ctx.apiLogin('VIE','vp');
  const tryIt = (token, changes) => {
    try { ctx.apiCommitChanges(token, 'VIE-001', changes, ''); return null; }
    catch (e) { return e.message; }
  };

  check('日本側はSTS 支店を変更できない', tryIt(jp.session.token, {'STS 支店':'OK'}) !== null);
  check('支店側はSTS JPを変更できない', tryIt(br.session.token, {'STS JP':'OK'}) !== null);
  check('STS JP=RQ のとき支店はUCで回答できる', tryIt(br.session.token, {'STS 支店':'UC'}) === null);
  // STS JP を CR にする
  tryIt(jp.session.token, {'STS JP':'CR'});
  check('STS JP=CR のとき支店はCFで回答できる', tryIt(br.session.token, {'STS 支店':'CF'}) === null);
  check('STS JP=CR のとき支店はOKにできない', tryIt(br.session.token, {'STS 支店':'OK'}) !== null);
  // STS JP を FN にする → 支店はロック
  tryIt(jp.session.token, {'STS JP':'FN'});
  check('STS JP=FN のとき支店側はロックされる', tryIt(br.session.token, {'STS 支店':'OK'}) !== null);
  check('不正なSTSコードは弾かれる', tryIt(jp.session.token, {'STS JP':'ZZ'}) !== null);
  check('不正な請求先は弾かれる', tryIt(jp.session.token, {'請求先':'近畿'}) !== null);
  check('正しい請求先は通る', tryIt(jp.session.token, {'請求先':'関西'}) === null);

  const log = ss.getSheetByName('ステータス変更履歴');
  check('ステータス変更履歴に記録される', log.getLastRow() > 1);
  const SL = ctx.STATUS_LOG_HEADERS;
  const first = log.getRange(2,1,1,SL.length).getValues()[0];
  check('変更者に個人名が記録される', String(first[SL.indexOf('変更者')]).includes('tanaka'),
        `実際: ${first[SL.indexOf('変更者')]}`);
}

// ---------------------------------------------------------------
section('8. 支店のデータ分離');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','v@his-world.com','VIE','','','', '', true]);
  bm.appendRow(['IST','イスタンブール支店','トルコ','イスタンブール','BRANCH','','ip','i@his-world.com','IST','','','', '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  [['VIE','VIE-001'],['IST','IST-001']].forEach(([b,k]) => {
    const row = new Array(H.length).fill('');
    row[H.indexOf('支店コード')] = b; row[H.indexOf('管理番号')] = k;
    res.appendRow(row);
  });
  const vie = ctx.apiLogin('VIE','vp');
  const dash = ctx.apiGetDashboard(vie.session.token, {});
  check('支店は自分の案件しか見えない',
        dash.reservations.length === 1 && dash.reservations[0].kanriNo === 'VIE-001');
  let err = null;
  try { ctx.apiGetReservationDetail(vie.session.token, 'IST-001'); } catch (e) { err = e.message; }
  check('他支店の案件詳細は開けない', err !== null);
  let statsErr = null;
  try { ctx.apiGetStats(vie.session.token, {}); } catch (e) { statsErr = e.message; }
  check('支店は統計ダッシュボードを使えない（JP専用）', statsErr !== null);
  check('パスコードが違うとログインできない', ctx.apiLogin('VIE','wrong').ok === false);
  check('無効なトークンは拒否される', (() => {
    try { ctx.apiGetDashboard('bogus', {}); return false; } catch (e) { return true; }
  })());
}

// ---------------------------------------------------------------
section('9. 新規案件の採番と通知先');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','','', '', true]);
  bm.appendRow(['ROW','ローマ支店','イタリア','ローマ','BRANCH','','rp','roma@his-world.com','R','','','', '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);

  // 過去一覧に R-005 がある状態で採番が衝突しないか
  const arch = ss.getSheetByName('過去一覧');
  const H = ctx.RESERVATION_HEADERS;
  const old = new Array(H.length).fill('');
  old[H.indexOf('支店コード')] = 'ROW'; old[H.indexOf('管理番号')] = 'R-005';
  arch.appendRow(old);

  const jp = ctx.apiLogin('KANTO','pw');
  const created = ctx.apiCreateReservation(jp.session.token, 'ROW',
    '01 Taro Tanaka\n02 Hanako Tanaka\nRQ 2026/12/03\n担当者：アバンティ＆オアシス業務チーム');
  check('アーカイブ済み番号と衝突せず R-006 が採番される', created.kanriNo === 'R-006', `実際: ${created.kanriNo}`);
  check('ローマ支店のプレフィックス R が維持される', created.kanriNo.startsWith('R-'));
  check('日本側が作成した新規案件は「支店」へ通知される',
        ctx.__mail.length === 1 && ctx.__mail[0].to === 'roma@his-world.com',
        `実際の宛先: ${ctx.__mail.map(m => m.to).join(',')}`);

  const detail = ctx.apiGetReservationDetail(jp.session.token, 'R-006').detail;
  check('新郎名が解析されている', detail['新郎名（ローマ字）'] === 'Taro Tanaka', `実際: ${detail['新郎名（ローマ字）']}`);
  check('管轄が解析されている', detail['管轄'] === '関東', `実際: ${detail['管轄']}`);
  check('請求番号欄の名称が返る', detail.invoiceLabel === '請求番号', `実際: ${detail.invoiceLabel}`);

  // 支店側が作成した場合は日本側へ
  ctx.__mail.length = 0;
  const rome = ctx.apiLogin('ROW','rp');
  ctx.apiCreateReservation(rome.session.token, 'ROW', '01 A B\n02 C D');
  check('支店が作成した新規案件は「日本側」へ通知される',
        ctx.__mail.length === 1 && ctx.__mail[0].to === 'kanto@his-world.com',
        `実際の宛先: ${ctx.__mail.map(m => m.to).join(',')}`);
}

// ---------------------------------------------------------------
section('10. 現地記入欄・請求番号のカスタム名称');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  ss.getSheetByName('支店マスタ').appendRow(
    ['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','v@his-world.com','VIE','Rechnungsnummer','21','','',true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'ステータス変更履歴', ctx.STATUS_LOG_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  row[H.indexOf('支店コード')] = 'VIE'; row[H.indexOf('管理番号')] = 'VIE-001';
  res.appendRow(row);

  const br = ctx.apiLogin('VIE','vp');
  ctx.apiSaveFieldsQuiet(br.session.token, 'VIE-001', {
    '請求番号':'AT-2026-0142','当日の担当':'M.Gruber','ヘアメイク':'L.Hofer',
    'カメラマン':'M.Gruber','アシスタント':'J.Brandt','配車時間':'9:00','メモ（現地用）':'雨天時は屋内'
  });
  const d = ctx.apiGetReservationDetail(br.session.token, 'VIE-001').detail;
  check('請求番号が保存される', d['請求番号'] === 'AT-2026-0142');
  check('現地記入欄6項目が保存される',
        d['当日の担当']==='M.Gruber' && d['ヘアメイク']==='L.Hofer' && d['カメラマン']==='M.Gruber' &&
        d['アシスタント']==='J.Brandt' && d['配車時間']==='9:00' && d['メモ（現地用）']==='雨天時は屋内');
  check('請求番号欄の名称が支店ごとに変わる', d.invoiceLabel === 'Rechnungsnummer', `実際: ${d.invoiceLabel}`);
  check('保存のみでは通知メールが飛ばない', ctx.__mail.length === 0);
  check('保存のみでは履歴が増えない', ss.getSheetByName('やり取り履歴').getLastRow() === 1);
}

// ---------------------------------------------------------------
section('11. 3択（保存のみ／メッセージのみ／変更＋メッセージ）の挙動');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','vie@his-world.com','VIE','','','', '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'ステータス変更履歴', ctx.STATUS_LOG_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  row[H.indexOf('支店コード')] = 'VIE'; row[H.indexOf('管理番号')] = 'VIE-001';
  row[H.indexOf('管轄')] = '関東'; row[H.indexOf('STS JP')] = 'NC';
  res.appendRow(row);
  const jp = ctx.apiLogin('KANTO','pw');
  const hs = ss.getSheetByName('やり取り履歴');

  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, 'メッセージだけ送ります');
  check('メッセージのみ：履歴1件・メール1通', hs.getLastRow() === 2 && ctx.__mail.length === 1);
  check('メッセージのみ：宛先は支店', ctx.__mail[0].to === 'vie@his-world.com');

  ctx.__mail.length = 0;
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {'STS JP':'RQ','ホテル':'Hotel Sacher'}, 'よろしくお願いします');
  check('変更＋メッセージ：まとめて履歴1件・メール1通', hs.getLastRow() === 3 && ctx.__mail.length === 1);
  const body = hs.getRange(3, ctx.HISTORY_HEADERS.indexOf('内容')+1, 1, 1).getValues()[0][0];
  check('本文に変更内容が含まれる', body.includes('STS JP') && body.includes('ホテル'), body);
  check('本文にメッセージが含まれる', body.includes('よろしくお願いします'));
  check('送信者に個人名が入る',
        String(hs.getRange(3, ctx.HISTORY_HEADERS.indexOf('送信者')+1,1,1).getValues()[0][0]).includes('tanaka'));
  check('送信者ロールが記録される',
        hs.getRange(3, ctx.HISTORY_HEADERS.indexOf('送信者ロール')+1,1,1).getValues()[0][0] === 'JP');

  ctx.__mail.length = 0;
  ctx.apiSaveFieldsQuiet(jp.session.token, 'VIE-001', {'共有メモ':'社内メモ'});
  check('保存のみ：履歴もメールも増えない', hs.getLastRow() === 3 && ctx.__mail.length === 0);
  check('保存のみでも値は保存される',
        ctx.apiGetReservationDetail(jp.session.token,'VIE-001').detail['共有メモ'] === '社内メモ');

  let noChange = ctx.apiCommitChanges(jp.session.token, 'VIE-001', {'ホテル':'Hotel Sacher'}, '');
  check('変更がない場合は noChange を返す', noChange.noChange === true);
}

// ---------------------------------------------------------------
section('12. 45日前アラート');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  ss.getSheetByName('支店マスタ').appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','','', '', true]);
  ctx.ensureSheetWithHeaders_(ss, '予約一覧', ctx.RESERVATION_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const mk = (kanri, days, sts) => {
    const row = new Array(H.length).fill('');
    row[H.indexOf('支店コード')] = 'VIE'; row[H.indexOf('管理番号')] = kanri;
    row[H.indexOf('管轄')] = '関東'; row[H.indexOf('STS JP')] = sts;
    row[H.indexOf('撮影日FIX')] = daysAhead(days);
    res.appendRow(row);
  };
  mk('VIE-A', 45, 'RQ');  // 45日前・未完了 → アラート
  mk('VIE-B', 45, 'FN');  // 45日前・完了 → 飛ばない
  mk('VIE-C', 44, 'RQ');  // 対象日でない → 飛ばない
  ctx.checkAlerts();
  check('撮影45日前・未完了の案件にだけアラートが飛ぶ',
        ctx.__mail.length === 1 && ctx.__mail[0].subj.includes('VIE-A'),
        `件数=${ctx.__mail.length} 件名=${ctx.__mail.map(m=>m.subj).join(' / ')}`);
  check('アラート件名が45日前になっている', ctx.__mail[0].subj.includes('45日前'), ctx.__mail[0].subj);
}

// ---------------------------------------------------------------
section('13. 支店マスタの表記ゆれ耐性');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  // ロールが小文字＋空白、支店コードが小文字
  bm.appendRow(['kanto ','関東手配課','','',' jp ','関東','pw','kanto@his-world.com','','','','', '', true]);
  bm.appendRow([' vie','ウィーン支店','オーストリア','ウィーン',' branch ','','vp','vie@his-world.com','VIE','','','', '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);

  const branches = ctx.listBranchesRaw_();
  check('ロールの表記ゆれが正規化される', branches[0].role === 'JP' && branches[1].role === 'BRANCH',
        JSON.stringify(branches.map(b => b.role)));
  check('支店コードの表記ゆれが正規化される', branches[0].code === 'KANTO' && branches[1].code === 'VIE');
  check('JP側メール振り分けが表記ゆれでも動く', ctx.getJpTeamEmail_('関東') === 'kanto@his-world.com');
  const jp = ctx.apiLogin('kanto','pw');
  check('小文字コードでログインできる', jp.ok === true && jp.session.role === 'JP');
  const dash = ctx.apiGetDashboard(jp.session.token, { showAll: true });
  check('JP側の支店選択肢に表記ゆれ支店が出る',
        dash.branches.length === 1 && dash.branches[0].code === 'VIE');
}

// ---------------------------------------------------------------
section('14. apiSaveBranch が他の列を消さない');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','k@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','v@his-world.com','VIE','Rechnungsnummer','21','', '', true]);
  const jp = ctx.apiLogin('KANTO','pw');
  ctx.apiSaveBranch(jp.session.token, { code:'VIE', name:'ウィーン支店(改)', role:'BRANCH',
    country:'オーストリア', city:'ウィーン', email:'v2@his-world.com', prefix:'VIE', active:true });
  const after = ctx.listBranchesRaw_().find(b => b.code === 'VIE');
  check('支店名が更新される', after.name === 'ウィーン支店(改)');
  check('請求番号欄名称が消えない', after.invoiceLabel === 'Rechnungsnummer', `実際: ${after.invoiceLabel}`);
  check('納品期限日数が消えない', after.deliveryDays === 21, `実際: ${after.deliveryDays}`);
  const BM = ctx.BRANCH_MASTER_HEADERS;
  const raw = bm.getRange(3,1,1,BM.length).getValues()[0];
  check('パスコードが維持される（未入力時）', raw[BM.indexOf('ログインパスコード')] === 'vp');
}

// ---------------------------------------------------------------
section('15. 列が無い場合のエラーメッセージ');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  ss.getSheetByName('支店マスタ').appendRow(['VIE','ウィーン支店','','','BRANCH','','vp','v@his-world.com','VIE','','','', '', true]);
  // 旧スキーマ（請求番号などが無い）予約一覧
  const res = ss.insertSheet('予約一覧');
  const OLD = ['支店コード','管理番号','CHG NO','STS JP','STS 支店','撮影日FIX','最終更新日'];
  res.getRange(1,1,1,OLD.length).setValues([OLD]);
  res.appendRow(['VIE','VIE-001','','NC','','','']);
  ctx.ensureSheetWithHeaders_(ss, '過去一覧', ctx.RESERVATION_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);

  const br = ctx.apiLogin('VIE','vp');
  let msg = null;
  try { ctx.apiSaveFieldsQuiet(br.session.token, 'VIE-001', {'請求番号':'X-1'}); }
  catch (e) { msg = e.message; }
  check('列が無いとき分かりやすいエラーになる', msg !== null && msg.includes('setupPortal'), `実際: ${msg}`);
}


// ---------------------------------------------------------------
section('16. 撮影日変更時に履歴・メールが正しい案件に紐づくか');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','vie@his-world.com','VIE','','','', '', true]);
  bm.appendRow(['IST','イスタンブール支店','トルコ','イスタンブール','BRANCH','','ip','ist@his-world.com','IST','','','', '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'ステータス変更履歴', ctx.STATUS_LOG_HEADERS);

  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const mk = (branch, kanri, groom, days) => {
    const row = new Array(H.length).fill('');
    row[H.indexOf('支店コード')] = branch;
    row[H.indexOf('管理番号')] = kanri;
    row[H.indexOf('新郎名（ローマ字）')] = groom;
    row[H.indexOf('管轄')] = '関東';
    row[H.indexOf('STS JP')] = 'RQ';
    row[H.indexOf('撮影日FIX')] = daysAhead(days);
    res.appendRow(row);
  };
  // 撮影日が早い順に VIE-001(10日後) / IST-500(20日後)
  mk('VIE','VIE-001','Vienna Groom', 10);
  mk('IST','IST-500','Istanbul Groom', 20);

  const jp = ctx.apiLogin('KANTO','pw');
  // VIE-001 の撮影日を 90日後へ変更 → 並べ替えで VIE-001 が下、IST-500 が上になる
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  ctx.apiCommitChanges(jp.session.token, 'VIE-001',
    { '撮影日FIX': iso(daysAhead(90)) }, '撮影日を変更しました');

  const hs = ss.getSheetByName('やり取り履歴');
  const HH = ctx.HISTORY_HEADERS;
  const hRow = hs.getRange(2,1,1,HH.length).getValues()[0];
  check('履歴が正しい管理番号（VIE-001）に紐づく',
        hRow[HH.indexOf('管理番号')] === 'VIE-001', `実際: ${hRow[HH.indexOf('管理番号')]}`);
  check('履歴の支店コードが正しい（VIE）',
        hRow[HH.indexOf('支店コード')] === 'VIE', `実際: ${hRow[HH.indexOf('支店コード')]}`);
  check('履歴の新郎名が正しい',
        hRow[HH.indexOf('新郎名（ローマ字）')] === 'Vienna Groom', `実際: ${hRow[HH.indexOf('新郎名（ローマ字）')]}`);
  check('メールがウィーン支店へ送られる（他支店に情報が漏れない）',
        ctx.__mail.length === 1 && ctx.__mail[0].to === 'vie@his-world.com',
        `実際の宛先: ${ctx.__mail.map(m => m.to).join(',')}`);
  check('メール件名の管理番号が正しい',
        ctx.__mail[0] && ctx.__mail[0].subj.includes('VIE-001'),
        `実際: ${ctx.__mail[0] && ctx.__mail[0].subj}`);
}


// ---------------------------------------------------------------
section('17. 既読チェックの認可・新規作成時の支店コード検証');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','vie@his-world.com','VIE','','','', '', true]);
  bm.appendRow(['IST','イスタンブール支店','トルコ','イスタンブール','BRANCH','','ip','ist@his-world.com','IST','','','', '', true]);
  bm.appendRow(['OLD','閉鎖済み支店','','','BRANCH','','op','old@his-world.com','OLD','','','', '', false]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);

  // IST の案件に対する JP からのメッセージ履歴を作る
  const hs = ss.getSheetByName('やり取り履歴');
  const HH = ctx.HISTORY_HEADERS;
  const hrow = new Array(HH.length).fill('');
  hrow[HH.indexOf('__id')] = 'hist-ist';
  hrow[HH.indexOf('支店コード')] = 'IST';
  hrow[HH.indexOf('管理番号')] = 'IST-500';
  hrow[HH.indexOf('送信者ロール')] = 'JP';
  hrow[HH.indexOf('日時')] = new Date();
  hrow[HH.indexOf('内容')] = 'イスタンブール宛のメッセージ';
  hs.appendRow(hrow);

  const vie = ctx.apiLogin('VIE','vp');
  let err = null;
  try { ctx.apiToggleHistoryCheck(vie.session.token, 'hist-ist', true); } catch (e) { err = e.message; }
  check('他支店の履歴に既読チェックを付けられない', err !== null, `実際: ${err}`);
  check('他支店の既読フラグが書き換わっていない',
        hs.getRange(2, HH.indexOf('CHECK 支店')+1, 1, 1).getValues()[0][0] !== true);

  const ist = ctx.apiLogin('IST','ip');
  let err2 = null;
  try { ctx.apiToggleHistoryCheck(ist.session.token, 'hist-ist', true); } catch (e) { err2 = e.message; }
  check('自支店の履歴には既読チェックを付けられる', err2 === null, `実際: ${err2}`);

  const jp = ctx.apiLogin('KANTO','pw');
  let err3 = null;
  try { ctx.apiToggleHistoryCheck(jp.session.token, 'hist-ist', true); } catch (e) { err3 = e.message; }
  check('日本側は全支店の履歴を既読にできる', err3 === null, `実際: ${err3}`);

  // 新規作成時の支店コード検証
  const bad = (code) => { try { ctx.apiCreateReservation(jp.session.token, code, '01 A\n02 B'); return null; } catch (e) { return e.message; } };
  check('存在しない支店コードでは案件を作れない', bad('ZZZ') !== null, `実際: ${bad('ZZZ')}`);
  check('無効化された支店では案件を作れない', bad('OLD') !== null, `実際: ${bad('OLD')}`);
  check('日本側チーム(KANTO)を支店として指定できない', bad('KANTO') !== null, `実際: ${bad('KANTO')}`);
  check('有効な支店なら作成できる', bad('VIE') === null);
}


// ---------------------------------------------------------------
section('18. 未読フラグ方式（履歴の全件走査をやめた新方式）');
function unreadFixture() {
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','vie@his-world.com','VIE','','','', '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'ステータス変更履歴', ctx.STATUS_LOG_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  row[H.indexOf('支店コード')] = 'VIE';
  row[H.indexOf('管理番号')] = 'VIE-001';
  row[H.indexOf('管轄')] = '関東';
  row[H.indexOf('STS JP')] = 'NC';
  res.appendRow(row);
  return ctx;
}
{
  const ctx = unreadFixture();
  const ss = ctx.__ss;
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const flag = (name) => res.getRange(2, H.indexOf(name)+1, 1, 1).getValues()[0][0];

  const jp = ctx.apiLogin('KANTO','pw');
  const vie = ctx.apiLogin('VIE','vp');

  check('初期状態はどちらも未読なし', flag('未読 JP') === '' && flag('未読 支店') === '');

  // JP → 支店 へメッセージ
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, '空き確認をお願いします');
  check('JPが送ると「未読 支店」が立つ', flag('未読 支店') === true, `実際: ${flag('未読 支店')}`);
  check('JPが送っても「未読 JP」は立たない', flag('未読 JP') !== true);

  let bDash = ctx.apiGetDashboard(vie.session.token, {});
  check('支店側の一覧で要対応になる', bDash.reservations[0].needsAction === true);
  let jDash = ctx.apiGetDashboard(jp.session.token, { showAll: true });
  check('JP側の一覧では要対応にならない', jDash.reservations[0].needsAction === false);

  // 支店が既読にする
  const hs = ss.getSheetByName('やり取り履歴');
  const HH = ctx.HISTORY_HEADERS;
  const hid = hs.getRange(2, HH.indexOf('__id')+1, 1, 1).getValues()[0][0];
  ctx.apiToggleHistoryCheck(vie.session.token, hid, true);
  check('支店が既読にすると「未読 支店」が下りる', flag('未読 支店') === false, `実際: ${flag('未読 支店')}`);
  bDash = ctx.apiGetDashboard(vie.session.token, {});
  check('既読後は支店側の一覧で要対応が解除される', bDash.reservations[0].needsAction === false);

  // 未読に戻せる
  ctx.apiToggleHistoryCheck(vie.session.token, hid, false);
  check('チェックを外すと再び未読になる', flag('未読 支店') === true);
}
{
  // 複数メッセージのうち1件だけ既読にしてもフラグは下りない
  const ctx = unreadFixture();
  const ss = ctx.__ss;
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const flag = (name) => res.getRange(2, H.indexOf(name)+1, 1, 1).getValues()[0][0];
  const jp = ctx.apiLogin('KANTO','pw');
  const vie = ctx.apiLogin('VIE','vp');

  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, '1通目');
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, '2通目');
  const hs = ss.getSheetByName('やり取り履歴');
  const HH = ctx.HISTORY_HEADERS;
  const id1 = hs.getRange(2, HH.indexOf('__id')+1, 1, 1).getValues()[0][0];
  const id2 = hs.getRange(3, HH.indexOf('__id')+1, 1, 1).getValues()[0][0];

  ctx.apiToggleHistoryCheck(vie.session.token, id1, true);
  check('2通中1通だけ既読では未読フラグは残る', flag('未読 支店') === true, `実際: ${flag('未読 支店')}`);
  ctx.apiToggleHistoryCheck(vie.session.token, id2, true);
  check('全て既読にすると未読フラグが下りる', flag('未読 支店') === false);

  // 支店→JP の方向も独立して動く
  ctx.apiCommitChanges(vie.session.token, 'VIE-001', {}, '確認しました');
  check('支店が送ると「未読 JP」が立つ', flag('未読 JP') === true);
  check('支店が送っても「未読 支店」は立たない', flag('未読 支店') === false);
}
{
  // ダッシュボードが履歴を読まずフラグ列を見ていることの確認
  const ctx = unreadFixture();
  const ss = ctx.__ss;
  const jp = ctx.apiLogin('KANTO','pw');
  const vie = ctx.apiLogin('VIE','vp');
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, 'テスト');
  // 履歴シートの中身を空にしてもフラグ列が残っていれば要対応のまま
  const hs = ss.getSheetByName('やり取り履歴');
  hs.deleteRow(2);
  const bDash = ctx.apiGetDashboard(vie.session.token, {});
  check('履歴を全件走査せずフラグ列で判定している', bDash.reservations[0].needsAction === true);
}

// ---------------------------------------------------------------
section('19. 定期処理の例外処理とシステム通知');
function triggerFixture() {
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','vie@his-world.com','VIE','','','', '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  return ctx;
}
{
  const ctx = triggerFixture();
  const ss = ctx.__ss;
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const mk = (kanri, days) => {
    const row = new Array(H.length).fill('');
    row[H.indexOf('支店コード')] = 'VIE'; row[H.indexOf('管理番号')] = kanri;
    row[H.indexOf('管轄')] = '関東'; row[H.indexOf('STS JP')] = 'RQ';
    row[H.indexOf('撮影日FIX')] = daysAhead(days);
    res.appendRow(row);
  };
  mk('VIE-A', 45); mk('VIE-B', 45); mk('VIE-C', 45);

  // 2件目の送信だけ失敗させる（1件の異常で以降が止まらないことの確認）
  let n = 0;
  const realSend = ctx.MailApp.sendEmail;
  ctx.MailApp.sendEmail = function (to, subj, body) {
    n++;
    if (n === 2) throw new Error('意図的な送信エラー');
    return realSend(to, subj, body);
  };
  const result = ctx.checkAlerts();
  ctx.MailApp.sendEmail = realSend;

  check('1件失敗しても処理は継続する', result.errors === 1, `実際のエラー数: ${result.errors}`);
  const caseMails = ctx.__mail.filter(m => m.subj.indexOf('撮影45日前') === 0 || m.subj.indexOf('[要確認]') === 0);
  check('失敗した1件を除く2件は通知される', caseMails.length === 2, `実際: ${caseMails.length}`);
  const sysMails = ctx.__mail.filter(m => m.to === 'it-planning@his-world.com');
  check('システム管理者へ障害通知が届く', sysMails.length === 1, `実際: ${sysMails.length}`);
  check('通知にエラー件数が含まれる', sysMails[0] && sysMails[0].subj.includes('1件'), sysMails[0] && sysMails[0].subj);
  check('通知に失敗した案件の管理番号が含まれる',
        sysMails[0] && sysMails[0].body.includes('VIE-B'), sysMails[0] && sysMails[0].body);
  check('通知に原因のメッセージが含まれる',
        sysMails[0] && sysMails[0].body.includes('意図的な送信エラー'));
}
{
  // 正常時はシステム通知を送らない
  const ctx = triggerFixture();
  const result = ctx.checkAlerts();
  check('正常終了時はエラー0件', result.ok === true && result.errors === 0);
  check('正常時はシステム通知を送らない',
        ctx.__mail.filter(m => m.to === 'it-planning@his-world.com').length === 0);
}
{
  // 行単位ではなく「処理全体」が落ちるケースでも、握りつぶさず通知されること
  const ctx = triggerFixture();
  const realMeta = ctx.branchMetaMap_;
  ctx.branchMetaMap_ = function () { throw new Error('支店マスタの読み込みに失敗'); };
  const result = ctx.checkDeliveryAlerts();
  ctx.branchMetaMap_ = realMeta;

  const sys = ctx.__mail.filter(m => m.to === 'it-planning@his-world.com');
  check('処理全体の例外も捕捉して通知する', result.ok === false && sys.length === 1,
        `errors=${result.errors} sysMail=${sys.length}`);
  check('通知に「処理全体」と原因が含まれる',
        sys[0] && sys[0].body.includes('処理全体') && sys[0].body.includes('支店マスタの読み込みに失敗'),
        sys[0] && sys[0].body.slice(0, 200));
}
{
  // シートがまだ無い状態でも例外にせず正常終了すること（防御的な既定動作）
  const ctx = makeContext(); CTX = ctx;
  const result = ctx.checkDeliveryAlerts();
  check('シート未作成でも落ちずに正常終了する', result.ok === true && result.errors === 0);
}


// ---------------------------------------------------------------
section('20. 追加機能：未返信リマインド');
function remindFixture(remindDays) {
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','', remindDays === undefined ? '' : remindDays, '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','vie@his-world.com','VIE','','', remindDays === undefined ? '' : remindDays, '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'ステータス変更履歴', ctx.STATUS_LOG_HEADERS);
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  row[H.indexOf('支店コード')] = 'VIE'; row[H.indexOf('管理番号')] = 'VIE-001';
  row[H.indexOf('管轄')] = '関東'; row[H.indexOf('STS JP')] = 'NC';
  row[H.indexOf('新郎名（ローマ字）')] = 'Taro'; row[H.indexOf('新婦名（ローマ字）')] = 'Hanako';
  res.appendRow(row);
  return ctx;
}
// 履歴の日時を過去にずらして「N日未読」を作る
function ageHistory(ctx, days) {
  const hs = ctx.__ss.getSheetByName('やり取り履歴');
  const HH = ctx.HISTORY_HEADERS;
  hs.getRange(2, HH.indexOf('日時')+1, 1, 1).setValue(CTX.__daysFromToday(-days));
}
{
  const ctx = remindFixture();
  const jp = ctx.apiLogin('KANTO','pw');
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, '空き確認をお願いします');
  ctx.__mail.length = 0;
  ageHistory(ctx, 3);                        // 既定は3日
  const r = ctx.checkUnansweredAlerts();
  const mails = ctx.__mail.filter(m => m.subj.indexOf('未返信') !== -1);
  check('3日未読で督促が飛ぶ', mails.length === 1, `実際: ${mails.length} / errors=${r.errors}`);
  check('督促の宛先は未読側（支店）', mails[0] && mails[0].to === 'vie@his-world.com', mails[0] && mails[0].to);
  check('督促本文に案件番号が入る', mails[0] && mails[0].body.includes('VIE-001'));
  check('督促本文に未読日数が入る', mails[0] && mails[0].body.includes('3日 未確認'), mails[0] && mails[0].body);
}
{
  const ctx = remindFixture();
  const jp = ctx.apiLogin('KANTO','pw');
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, 'テスト');
  ctx.__mail.length = 0;
  ageHistory(ctx, 2);
  ctx.checkUnansweredAlerts();
  check('2日（既定3日未満）では督促しない',
        ctx.__mail.filter(m => m.subj.indexOf('未返信') !== -1).length === 0);
}
{
  const ctx = remindFixture(7);              // 支店マスタで督促日数7日を設定
  const jp = ctx.apiLogin('KANTO','pw');
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, 'テスト');
  ctx.__mail.length = 0;
  ageHistory(ctx, 5);
  ctx.checkUnansweredAlerts();
  check('支店ごとの督促日数（7日）が効く：5日ではまだ送らない',
        ctx.__mail.filter(m => m.subj.indexOf('未返信') !== -1).length === 0);
  ageHistory(ctx, 7);
  ctx.__mail.length = 0;
  ctx.checkUnansweredAlerts();
  check('支店ごとの督促日数（7日）に達すると送る',
        ctx.__mail.filter(m => m.subj.indexOf('未返信') !== -1).length === 1);
}
{
  const ctx = remindFixture();
  const jp = ctx.apiLogin('KANTO','pw');
  const vie = ctx.apiLogin('VIE','vp');
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, 'テスト');
  ageHistory(ctx, 5);
  const hs = ctx.__ss.getSheetByName('やり取り履歴');
  const hid = hs.getRange(2, ctx.HISTORY_HEADERS.indexOf('__id')+1, 1, 1).getValues()[0][0];
  ctx.apiToggleHistoryCheck(vie.session.token, hid, true);   // 既読にする
  ctx.__mail.length = 0;
  ctx.checkUnansweredAlerts();
  check('既読にすると督促されなくなる',
        ctx.__mail.filter(m => m.subj.indexOf('未返信') !== -1).length === 0);
}
{
  // 複数案件は1通のダイジェストにまとまる
  const ctx = remindFixture();
  const ss = ctx.__ss;
  const res = ss.getSheetByName('予約一覧');
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  row[H.indexOf('支店コード')] = 'VIE'; row[H.indexOf('管理番号')] = 'VIE-002';
  row[H.indexOf('管轄')] = '関東'; row[H.indexOf('STS JP')] = 'NC';
  res.appendRow(row);
  const jp = ctx.apiLogin('KANTO','pw');
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, 'A');
  ctx.apiCommitChanges(jp.session.token, 'VIE-002', {}, 'B');
  const hs = ss.getSheetByName('やり取り履歴');
  const HH = ctx.HISTORY_HEADERS;
  hs.getRange(2, HH.indexOf('日時')+1, 2, 1).setValues([[CTX.__daysFromToday(-5)],[CTX.__daysFromToday(-5)]]);
  ctx.__mail.length = 0;
  ctx.checkUnansweredAlerts();
  const mails = ctx.__mail.filter(m => m.subj.indexOf('未返信') !== -1);
  check('複数案件でも支店あたり1通にまとまる', mails.length === 1, `実際: ${mails.length}`);
  check('ダイジェストに2件とも含まれる',
        mails[0] && mails[0].body.includes('VIE-001') && mails[0].body.includes('VIE-002'));
  check('件名に件数が入る', mails[0] && mails[0].subj.includes('2件'), mails[0] && mails[0].subj);
}

// ---------------------------------------------------------------
section('21. 追加機能：納品待ち一覧・当日表・タイムライン');
function featureFixture() {
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','','', '', true]);
  bm.appendRow(['VIE','ウィーン支店','オーストリア','ウィーン','BRANCH','','vp','vie@his-world.com','VIE','','','', '', true]);
  bm.appendRow(['IST','イスタンブール支店','トルコ','イスタンブール','BRANCH','','ip','ist@his-world.com','IST','','','', '', true]);
  ['予約一覧','過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'ステータス変更履歴', ctx.STATUS_LOG_HEADERS);
  ['撮影場所マスタ','スタッフマスタ','セールマスタ'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.MASTER_ITEM_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, '定型文マスタ', ctx.PHRASE_MASTER_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, 'メモ履歴', ctx.MEMO_LOG_HEADERS);
  ctx.ensureSheetWithHeaders_(ss, '手配履歴', ctx.ARRANGEMENT_LOG_HEADERS);
  return ctx;
}
function addCase(ctx, sheetName, o) {
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  Object.keys(o).forEach(k => { const i = H.indexOf(k); if (i !== -1) row[i] = o[k]; });
  ctx.__ss.getSheetByName(sheetName).appendRow(row);
}
// 支店マスタへ列名基準で1行追加する（列位置がずれても壊れない）
function addBranchRow(ctx, o) {
  const bm = ctx.__ss.getSheetByName('支店マスタ');
  const head = bm.getRange(1, 1, 1, bm.getLastColumn()).getValues()[0];
  const rowIdx = bm.getLastRow() + 1;
  Object.keys(o).forEach(k => {
    const i = head.indexOf(k);
    if (i !== -1) bm.getRange(rowIdx, i + 1).setValue(o[k]);
  });
}
// 既存の支店マスタ行の1列だけ値を書き換える（列名基準）
function setBranchField(ctx, branchCode, field, value) {
  const bm = ctx.__ss.getSheetByName('支店マスタ');
  const head = bm.getRange(1, 1, 1, bm.getLastColumn()).getValues()[0];
  const codeCol = head.indexOf('支店コード');
  const fieldCol = head.indexOf(field);
  const rows = bm.getRange(2, 1, bm.getLastRow() - 1, bm.getLastColumn()).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][codeCol]) === branchCode) { bm.getRange(i + 2, fieldCol + 1).setValue(value); return; }
  }
}
{
  const ctx = featureFixture();
  // 過去一覧に未納品（35日経過）、予約一覧に納品済み、キャンセル済みを置く
  addCase(ctx, '過去一覧', { '支店コード':'VIE','管理番号':'VIE-001','管轄':'関東',
    '撮影日FIX': daysAgo(35), '新郎名（ローマ字）':'A' });
  addCase(ctx, '過去一覧', { '支店コード':'VIE','管理番号':'VIE-002','管轄':'関東',
    '撮影日FIX': daysAgo(40), 'DriveフォルダURL':'https://drive.google.com/x' });
  addCase(ctx, '過去一覧', { '支店コード':'VIE','管理番号':'VIE-003','管轄':'関東',
    '撮影日FIX': daysAgo(40), 'STS JP':'CW' });
  addCase(ctx, '過去一覧', { '支店コード':'IST','管理番号':'IST-001','管轄':'関西',
    '撮影日FIX': daysAgo(50) });

  const jp = ctx.apiLogin('KANTO','pw');
  const all = ctx.apiGetPendingDeliveries(jp.session.token, { showAll: true });
  check('納品待ちに未納品案件だけが出る', all.results.length === 2,
        `実際: ${all.results.map(r=>r.kanriNo).join(',')}`);
  check('納品済みは除外される', !all.results.some(r => r.kanriNo === 'VIE-002'));
  check('キャンセルは除外される', !all.results.some(r => r.kanriNo === 'VIE-003'));
  check('遅れが大きい順に並ぶ', all.results[0].kanriNo === 'IST-001', all.results[0].kanriNo);
  check('経過日数が返る', all.results[0].daysPast === 50, String(all.results[0].daysPast));

  const vie = ctx.apiLogin('VIE','vp');
  const mine = ctx.apiGetPendingDeliveries(vie.session.token, {});
  check('支店は自分の納品待ちだけ見える',
        mine.results.length === 1 && mine.results[0].kanriNo === 'VIE-001');
}
{
  const ctx = featureFixture();
  const d = daysAhead(10);
  const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-010','撮影日FIX': d,
    '新郎名（ローマ字）':'Groom A', '配車時間':'13:00', 'カメラマン':'M.Gruber' });
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-011','撮影日FIX': d,
    '新郎名（ローマ字）':'Groom B', '配車時間':'09:00', 'ヘアメイク':'L.Hofer' });
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-012','撮影日FIX': daysAhead(11) });
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-013','撮影日FIX': d, 'STS JP':'CW' });

  const vie = ctx.apiLogin('VIE','vp');
  const day = ctx.apiGetDaySchedule(vie.session.token, iso, {});
  check('当日表に指定日の案件だけ出る', day.results.length === 2,
        `実際: ${day.results.map(r=>r.kanriNo).join(',')}`);
  check('当日表は配車時間の昇順', day.results[0].kanriNo === 'VIE-011', day.results[0].kanriNo);
  check('当日表にキャンセルは出ない', !day.results.some(r => r.kanriNo === 'VIE-013'));
  check('現地記入欄の項目が返る', day.results[1].photographer === 'M.Gruber');
}
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-020','管轄':'関東','STS JP':'NC' });
  const jp = ctx.apiLogin('KANTO','pw');
  ctx.apiCommitChanges(jp.session.token, 'VIE-020', { 'STS JP':'RQ' }, '空き確認をお願いします');
  const tl = ctx.apiGetCaseTimeline(jp.session.token, 'VIE-020');
  check('タイムラインにメッセージとステータス変更が両方出る',
        tl.items.some(i => i.type === 'message') && tl.items.some(i => i.type === 'status'),
        JSON.stringify(tl.items.map(i => i.type)));
  const sts = tl.items.find(i => i.type === 'status');
  check('ステータス変更の前後の値が入る', sts.field === 'STS JP' && sts.newValue === 'RQ');
  check('変更者が入る', String(sts.who).includes('tanaka'));

  const ist = ctx.apiLogin('IST','ip');
  let err = null;
  try { ctx.apiGetCaseTimeline(ist.session.token, 'VIE-020'); } catch (e) { err = e.message; }
  check('他支店のタイムラインは見られない', err !== null);
}

// ---------------------------------------------------------------
section('22. 追加機能：ダブルブッキング検知・請求不備チェック・書き出し・定型文');
{
  const ctx = featureFixture();
  const d = daysAhead(20);
  const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-030','撮影日FIX': d,
    'カメラマン':'M. Gruber', '新郎名（ローマ字）':'Existing' });
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-031','撮影日FIX': d });
  addCase(ctx, '予約一覧', { '支店コード':'IST','管理番号':'IST-030','撮影日FIX': d, 'カメラマン':'M.Gruber' });
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-032','撮影日FIX': daysAhead(21), 'カメラマン':'M.Gruber' });

  const vie = ctx.apiLogin('VIE','vp');
  const hit = ctx.apiCheckStaffConflict(vie.session.token, 'VIE-031', iso, { 'カメラマン':'M.Gruber' });
  check('同一支店・同一日の重複を検知する', hit.conflicts.length === 1, JSON.stringify(hit.conflicts));
  check('表記ゆれ（M. Gruber と M.Gruber）を吸収する',
        hit.conflicts[0] && hit.conflicts[0].kanriNo === 'VIE-030');
  const none = ctx.apiCheckStaffConflict(vie.session.token, 'VIE-031', iso, { 'カメラマン':'別の人' });
  check('別のスタッフなら検知しない', none.conflicts.length === 0);
  const other = ctx.apiCheckStaffConflict(vie.session.token, 'VIE-031',
    `${daysAhead(21).getFullYear()}-${String(daysAhead(21).getMonth()+1).padStart(2,'0')}-${String(daysAhead(21).getDate()).padStart(2,'0')}`,
    { 'カメラマン':'M.Gruber' });
  check('別の日なら自案件以外の同日のみ検知（VIE-032）', other.conflicts.length === 1 && other.conflicts[0].kanriNo === 'VIE-032');
  check('他支店の同名スタッフは検知しない（支店をまたがない）',
        !hit.conflicts.some(c => c.kanriNo === 'IST-030'));
}
{
  const ctx = featureFixture();
  const past = daysAgo(20);
  const m = `${past.getFullYear()}-${String(past.getMonth()+1).padStart(2,'0')}`;
  addCase(ctx, '過去一覧', { '支店コード':'VIE','管理番号':'VIE-040','管轄':'関東','撮影日FIX': past,
    '請求先':'関東','日本支店名':'新宿西口店','請求番号':'A-1','DriveフォルダURL':'https://x' });
  addCase(ctx, '過去一覧', { '支店コード':'VIE','管理番号':'VIE-041','管轄':'関東','撮影日FIX': past,
    '請求先':'','日本支店名':'新宿西口店','請求番号':'A-2','DriveフォルダURL':'https://x' });
  addCase(ctx, '過去一覧', { '支店コード':'VIE','管理番号':'VIE-042','管轄':'関東','撮影日FIX': past, 'STS JP':'CW' });
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-043','管轄':'関東','撮影日FIX': daysAhead(5) });

  const jp = ctx.apiLogin('KANTO','pw');
  const gaps = ctx.apiGetBillingGaps(jp.session.token, m);
  check('不備のある案件だけ出る', gaps.results.length === 1 && gaps.results[0].kanriNo === 'VIE-041',
        gaps.results.map(r=>r.kanriNo).join(','));
  check('不足項目名が返る', gaps.results[0].missing.indexOf('請求先') !== -1,
        JSON.stringify(gaps.results[0].missing));
  check('キャンセル案件は対象外', !gaps.results.some(r => r.kanriNo === 'VIE-042'));
  check('未来の撮影は対象外', !gaps.results.some(r => r.kanriNo === 'VIE-043'));
  let err = null;
  try { ctx.apiGetBillingGaps(jp.session.token, '2026/13'); } catch (e) { err = e.message; }
  check('不正な月指定はエラー', err !== null);
  const vie = ctx.apiLogin('VIE','vp');
  let err2 = null;
  try { ctx.apiGetBillingGaps(vie.session.token, m); } catch (e) { err2 = e.message; }
  check('支店は請求不備チェックを使えない（JP専用）', err2 !== null);
}
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-050','管轄':'関東','新郎名（ローマ字）':'Taro' });
  addCase(ctx, '予約一覧', { '支店コード':'IST','管理番号':'IST-050','管轄':'関西','新郎名（ローマ字）':'Jiro' });
  const jp = ctx.apiLogin('KANTO','pw');
  const out = ctx.apiExportReservations(jp.session.token, { scope: { showAll: true } });
  check('書き出しシートが作られる', out.ok === true && out.count === 2, JSON.stringify(out));
  const sheet = ctx.__ss.getSheetByName(out.sheetName);
  check('書き出しシートが実在する', !!sheet);
  const head = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  check('ヘッダーに区分・支店名・国が付く', head[0]==='区分' && head[1]==='支店名' && head[2]==='国');
  check('明細行が2件ある', sheet.getLastRow() === 3, String(sheet.getLastRow()));
  let err = null;
  try { ctx.apiExportReservations(jp.session.token, { kanriNo: 'NOTFOUND', scope: { showAll: true } }); }
  catch (e) { err = e.message; }
  check('該当0件ならエラーで知らせる', err !== null && err.includes('一致する案件がありません'), err);
  const vie = ctx.apiLogin('VIE','vp');
  let err2 = null;
  try { ctx.apiExportReservations(vie.session.token, {}); } catch (e) { err2 = e.message; }
  check('支店は書き出しを使えない（JP専用）', err2 !== null);
}
{
  const ctx = featureFixture();
  const ph = ctx.__ss.getSheetByName('定型文マスタ');
  ph.appendRow(['ALL','空き確認','空き状況のご確認をお願いします。',true]);
  ph.appendRow(['VIE','ウィーン用','ウィーン支店専用の文面です。',true]);
  ph.appendRow(['IST','イスタンブール用','他支店の文面',true]);
  ph.appendRow(['ALL','無効な文','使わない',false]);
  const vie = ctx.apiLogin('VIE','vp');
  const list = ctx.apiListPhrases(vie.session.token, 'VIE');
  check('共通（ALL）と自支店の定型文が取れる', list.length === 2,
        JSON.stringify(list.map(p=>p.name)));
  check('他支店の定型文は取れない', !list.some(p => p.name === 'イスタンブール用'));
  check('無効な定型文は除外される', !list.some(p => p.name === '無効な文'));
  check('本文が返る', list.find(p=>p.name==='空き確認').body === '空き状況のご確認をお願いします。');
  check('共通フラグが返る', list.find(p=>p.name==='空き確認').shared === true);

  const st = ctx.__ss.getSheetByName('スタッフマスタ');
  st.appendRow(['VIE','M.Gruber',true]);
  st.appendRow(['VIE','L.Hofer',false]);
  const staff = ctx.apiListStaff(vie.session.token, 'VIE');
  check('スタッフマスタが取れる', staff.length === 2 && staff[0].name === 'M.Gruber');
  check('無効なスタッフは active=false で返る', staff.find(s=>s.name==='L.Hofer').active === false);
}

// ---------------------------------------------------------------
section('23. 同意書（機能④）・セール名（機能⑤）');
{
  const ctx = featureFixture();
  const bm = ctx.__ss.getSheetByName('支店マスタ');
  // ローマ支店は同意書必須（支店マスタ「同意書必須」列にTRUE）
  bm.appendRow(['ROW','ローマ支店','イタリア','ローマ','BRANCH','','rp','roma@his-world.com','ROW','','','',true,true]);

  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-101','管轄':'関東', '新郎名（ローマ字）':'A' });
  addCase(ctx, '予約一覧', { '支店コード':'ROW','管理番号':'ROW-101','管轄':'関東', '新郎名（ローマ字）':'B' });

  const jp = ctx.apiLogin('KANTO','pw');
  const vieDetail = ctx.apiGetReservationDetail(jp.session.token, 'VIE-101').detail;
  check('通常支店は同意書必須=false', vieDetail.consentRequired === false);
  const rowDetail = ctx.apiGetReservationDetail(jp.session.token, 'ROW-101').detail;
  check('ローマ支店は同意書必須=true', rowDetail.consentRequired === true);
  check('初期状態は同意書が未回収', !rowDetail['同意書']);

  // 通常の3択保存フロー（変更＋メッセージ）で同意書欄を更新できる（手動でのマークも可能）
  ctx.apiCommitChanges(jp.session.token, 'ROW-101', { '同意書': '済' }, '同意書を確認しました。');
  const afterManual = ctx.apiGetReservationDetail(jp.session.token, 'ROW-101').detail;
  check('通常フローで同意書を更新できる', afterManual['同意書'] === '済');

  // Googleフォーム連携（onConsentFormSubmitCore_）：フォーム回答から自動で反映される
  const errors1 = [];
  ctx.onConsentFormSubmitCore_({ namedValues: { '管理番号': ['VIE-101'] } }, errors1);
  const afterForm = ctx.apiGetReservationDetail(jp.session.token, 'VIE-101').detail;
  check('フォーム回答で同意書が自動的に「済」になる', afterForm['同意書'] === '済');
  check('フォーム連携はエラーなしで終わる', errors1.length === 0);

  const errors2 = [];
  ctx.onConsentFormSubmitCore_({ namedValues: { '管理番号': ['NOTFOUND'] } }, errors2);
  check('存在しない管理番号はエラーとして記録される（処理全体は止まらない）', errors2.length === 1);

  const errors3 = [];
  ctx.onConsentFormSubmitCore_({ namedValues: { '別の質問': ['x'] } }, errors3);
  check('管理番号の質問が見つからない場合もエラーとして記録される', errors3.length === 1);

  // セール名マスタ：事前登録した候補＋自由入力の両方が使える（プランマスタと同じ運用）
  ctx.apiSaveSaleItem(jp.session.token, 'VIE', '夏のセール2026', null, true);
  const sales = ctx.apiListSales(jp.session.token, 'VIE');
  check('セールマスタに登録できる', sales.length === 1 && sales[0].name === '夏のセール2026');

  ctx.apiCommitChanges(jp.session.token, 'VIE-101', { 'セール名': '夏のセール2026（自由入力の特典付き）' }, '');
  const afterSale = ctx.apiGetReservationDetail(jp.session.token, 'VIE-101').detail;
  check('セール名は自由入力でも保存できる', afterSale['セール名'] === '夏のセール2026（自由入力の特典付き）');

  const vie2 = ctx.apiLogin('VIE','vp');
  let err = null;
  try { ctx.apiSaveSaleItem(vie2.session.token, 'IST', 'こっそり割引', null, true); } catch (e) { err = e.message; }
  check('他支店のセールマスタは編集できない', err !== null, err);
}
{
  // 同意書フォーム連携の細かい挙動（二重送信・タイムライン記録・別案件への誤爆防止）
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-201','管轄':'関東','撮影日FIX': daysAhead(10) });
  addCase(ctx, '予約一覧', { '支店コード':'IST','管理番号':'IST-201','管轄':'関西','撮影日FIX': daysAhead(3) });
  const jp = ctx.apiLogin('KANTO','pw');

  const e1 = [];
  ctx.onConsentFormSubmitCore_({ namedValues: { '管理番号': ['VIE-201'] } }, e1);
  const log = ctx.__ss.getSheetByName('ステータス変更履歴');
  check('フォーム反映がステータス変更履歴に残る', log.getLastRow() === 2, `行数: ${log.getLastRow()}`);
  const logRow = log.getRange(2,1,1,6).getValues()[0];
  check('履歴の管理番号が正しい', logRow[0] === 'VIE-201', String(logRow[0]));
  check('履歴の変更者がお客様（Googleフォーム）', String(logRow[4]).includes('Googleフォーム'), String(logRow[4]));

  // 二重送信しても履歴が増えない（お客様が同じフォームを2回出すのはよくある）
  const e2 = [];
  ctx.onConsentFormSubmitCore_({ namedValues: { '管理番号': ['VIE-201'] } }, e2);
  check('同じ案件へ2回送信しても履歴が二重にならない', log.getLastRow() === 2, `行数: ${log.getLastRow()}`);
  check('二重送信はエラー扱いにしない', e2.length === 0);

  // ★案件取り違えが起きていないこと（撮影日順の並べ替えで行位置が動く構造のため）
  const other = ctx.apiGetReservationDetail(jp.session.token, 'IST-201').detail;
  check('無関係な案件に同意書が付いていない', !other['同意書'], String(other['同意書']));

  // タイムラインからも同意書の取得タイミングが追える
  const tl = ctx.apiGetCaseTimeline(jp.session.token, 'VIE-201');
  check('案件タイムラインに同意書の記録が出る',
        tl.items.some(it => it.field === '同意書' && it.newValue === '済'),
        JSON.stringify(tl.items.map(i => i.field)));
}
{
  // 当日表（現地が撮影当日に見る画面）に同意書・セール名が出ること
  const ctx = featureFixture();
  const bm = ctx.__ss.getSheetByName('支店マスタ');
  bm.appendRow(['ROW','ローマ支店','イタリア','ローマ','BRANCH','','rp','roma@his-world.com','ROW','','','',true,true]);
  const shoot = daysAhead(2);
  addCase(ctx, '予約一覧', { '支店コード':'ROW','管理番号':'R-301','管轄':'関東',
    '撮影日FIX': shoot, '配車時間':'09:00', 'セール名':'春の特典' });
  addCase(ctx, '予約一覧', { '支店コード':'ROW','管理番号':'R-302','管轄':'関東',
    '撮影日FIX': shoot, '配車時間':'11:00', '同意書':'済' });
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-301','管轄':'関東',
    '撮影日FIX': shoot, '配車時間':'13:00' });

  const jp = ctx.apiLogin('KANTO','pw');
  const iso = `${shoot.getFullYear()}-${String(shoot.getMonth()+1).padStart(2,'0')}-${String(shoot.getDate()).padStart(2,'0')}`;
  const day = ctx.apiGetDaySchedule(jp.session.token, iso, { showAll: true });
  const byNo = {}; day.results.forEach(r => { byNo[r.kanriNo] = r; });

  check('当日表にセール名が出る', byNo['R-301'].saleName === '春の特典', String(byNo['R-301'].saleName));
  check('当日表に同意書必須フラグが出る（ローマ）', byNo['R-301'].consentRequired === true);
  check('必須支店の未回収が判別できる', !byNo['R-301'].consent);
  check('取得済みの案件は同意書に値が入る', byNo['R-302'].consent === '済');
  check('必須でない支店は同意書必須=false', byNo['VIE-301'].consentRequired === false);
}

// ---------------------------------------------------------------
section('24. setupPortal を実際に通す（初回セットアップ・再実行）');
{
  // ★これまでのテストは ensureSheetWithHeaders_ を個別に呼ぶだけで、setupPortal 自体を
  // 一度も実行していなかった。列を1つ増やすたびにシード行との不整合が起きうるため、
  // 「まっさらな状態から setupPortal が最後まで通ること」を必ず確認する。
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  let err = null;
  try { ctx.setupPortal(); } catch (e) { err = e.message; }
  check('まっさらな状態から setupPortal が完走する', err === null, err);

  const SHEETS = ['支店マスタ','プランマスタ','オプションマスタ','撮影場所マスタ','スタッフマスタ',
                  '定型文マスタ','セールマスタ','衣装会社マスタ','予約一覧','やり取り履歴','過去一覧','ステータス変更履歴'];
  SHEETS.forEach(n => check(`シート「${n}」が作られる`, !!ss.getSheetByName(n)));

  // ★要件：衣装会社（お客様情報タブ）の候補をあらかじめ登録しておく
  const costumeSheet = ss.getSheetByName('衣装会社マスタ');
  check('衣装会社マスタに5件シードされる', costumeSheet.getLastRow() === 6, `実際: ${costumeSheet.getLastRow()}`);
  const costumeNamesSeeded = ctx.getRowsAsObjects_(costumeSheet).map(r => r['名称']);
  ['ブライダルハウスTUTU', 'フォーシスアンドカンパニー', 'クチュールナオコ', 'ワタベウェディング', 'デスティニーライン']
    .forEach(name => check(`衣装会社マスタのシードに「${name}」が含まれる`, costumeNamesSeeded.includes(name), costumeNamesSeeded.join(',')));
  check('衣装会社マスタのシード行は全社共通（ALL）で登録される',
        ctx.getRowsAsObjects_(costumeSheet).every(r => r['支店コード'] === 'ALL'));

  const bm = ss.getSheetByName('支店マスタ');
  const bmHead = bm.getRange(1,1,1,bm.getLastColumn()).getValues()[0];
  check('支店マスタのヘッダーが定義どおり',
        ctx.BRANCH_MASTER_HEADERS.every((h,i) => bmHead[i] === h),
        `実際: ${bmHead.join(',')}`);
  check('シード行が24支店＋関東関西の26行入る', bm.getLastRow() === 27, `実際: ${bm.getLastRow()}`);

  // ★シード行が列とズレていると「有効」がFALSE扱いになり、全支店がログインできなくなる
  const branches = ctx.listBranchesRaw_();
  check('シード支店が全て有効（列ズレしていない）', branches.every(b => b.active === true),
        '無効判定: ' + branches.filter(b => !b.active).map(b => b.code).join(','));
  check('ローマ支店のプレフィックスが R のまま',
        (branches.find(b => b.code === 'ROW') || {}).prefix === 'R');
  check('関東手配課がJPロールで読める',
        (branches.find(b => b.code === 'KANTO') || {}).role === 'JP');
  check('シード直後は同意書必須がどの支店もfalse', branches.every(b => b.consentRequired === false));

  // 実際にログインできる＝パスコード列もズレていない
  // ★apiLogin は例外ではなく {ok:false} を返す仕様なので、必ず ok を見る
  const seedLogin = ctx.apiLogin('ROW', 'CHANGE-ME-ROW');
  check('シードのパスコードでログインできる（列ズレしていない）', seedLogin.ok === true, JSON.stringify(seedLogin));
  check('シードログインで支店名・ロールが取れる',
        seedLogin.ok && seedLogin.session.branchName === 'ローマ支店' && seedLogin.session.role === 'BRANCH');
  check('誤ったパスコードは拒否される', ctx.apiLogin('ROW', 'WRONG').ok === false);
  check('存在しない支店コードは拒否される', ctx.apiLogin('NOPE', 'CHANGE-ME-ROW').ok === false);

  // 再実行しても壊れない（列も行も増えない）
  const colsBefore = bm.getLastColumn(), rowsBefore = bm.getLastRow();
  let err2 = null;
  try { ctx.setupPortal(); } catch (e) { err2 = e.message; }
  check('setupPortal を再実行しても完走する', err2 === null, err2);
  check('再実行で列が増えない', bm.getLastColumn() === colsBefore, `${colsBefore} → ${bm.getLastColumn()}`);
  check('再実行でシード行が重複しない', bm.getLastRow() === rowsBefore, `${rowsBefore} → ${bm.getLastRow()}`);
  check('衣装会社マスタも再実行でシード行が重複しない', costumeSheet.getLastRow() === 6, `実際: ${costumeSheet.getLastRow()}`);
}

// ---------------------------------------------------------------
section('25. 旧バージョンからのマイグレーション（同意書・セール名の列追加）');
{
  // 本番スプレッドシートは既に稼働中なので、「列が無い状態のシートへ新版コードを載せる」
  // 経路が壊れていないかを確認する（実運用でいちばん危ないのはここ）
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;

  // 旧スキーマ（同意書・セール名・同意書必須が無い）の支店マスタと予約一覧を用意する
  const OLD_BM = ctx.BRANCH_MASTER_HEADERS.filter(h => h !== '同意書必須');
  const bm = ss.insertSheet('支店マスタ');
  bm.getRange(1,1,1,OLD_BM.length).setValues([OLD_BM]);
  bm.appendRow(['KANTO','関東手配課','','','JP','関東','pw','kanto@his-world.com','','','','',true]);
  bm.appendRow(['ROW','ローマ支店','イタリア','ローマ','BRANCH','','rp','roma@his-world.com','R','','','',true]);

  const OLD_RES = ctx.RESERVATION_HEADERS.filter(h => h !== '同意書' && h !== 'セール名');
  const res = ss.insertSheet('予約一覧');
  res.getRange(1,1,1,OLD_RES.length).setValues([OLD_RES]);
  const oldRow = new Array(OLD_RES.length).fill('');
  oldRow[OLD_RES.indexOf('支店コード')] = 'ROW';
  oldRow[OLD_RES.indexOf('管理番号')] = 'R-001';
  oldRow[OLD_RES.indexOf('新郎名（ローマ字）')] = 'Existing Groom';
  oldRow[OLD_RES.indexOf('ホテル')] = 'Hotel Roma';
  res.appendRow(oldRow);

  let err = null;
  try { ctx.setupPortal(); } catch (e) { err = e.message; }
  check('旧スキーマの上で setupPortal が完走する', err === null, err);

  const bmHead = bm.getRange(1,1,1,bm.getLastColumn()).getValues()[0];
  check('支店マスタに「同意書必須」列が追加される', bmHead.includes('同意書必須'));
  const resHead = res.getRange(1,1,1,res.getLastColumn()).getValues()[0];
  check('予約一覧に「同意書」列が追加される', resHead.includes('同意書'));
  check('予約一覧に「セール名」列が追加される', resHead.includes('セール名'));

  // 既存データが壊れていないこと（列追加はあくまで右端への追記）
  const branches = ctx.listBranchesRaw_();
  check('マイグレーション後も既存支店が有効のまま', branches.every(b => b.active === true),
        '無効判定: ' + branches.filter(b => !b.active).map(b => b.code).join(','));
  check('マイグレーション後もログインできる', ctx.apiLogin('ROW','rp').ok === true);

  const jp = ctx.apiLogin('KANTO','pw');
  const d = ctx.apiGetReservationDetail(jp.session.token, 'R-001').detail;
  check('既存案件のデータが保持されている', d['新郎名（ローマ字）'] === 'Existing Groom' && d['ホテル'] === 'Hotel Roma',
        JSON.stringify({ groom: d['新郎名（ローマ字）'], hotel: d['ホテル'] }));
  check('新設の同意書欄は空で読める', !d['同意書']);
  check('新設のセール名欄は空で読める', !d['セール名']);

  // 追加された列にそのまま書き込める（列追加が中途半端だとここで落ちる）
  let saveErr = null;
  try { ctx.apiCommitChanges(jp.session.token, 'R-001', { '同意書':'済', 'セール名':'夏セール' }, ''); }
  catch (e) { saveErr = e.message; }
  check('マイグレーション後に同意書・セール名を保存できる', saveErr === null, saveErr);
  const d2 = ctx.apiGetReservationDetail(jp.session.token, 'R-001').detail;
  check('保存した同意書が読み戻せる', d2['同意書'] === '済');
  check('保存したセール名が読み戻せる', d2['セール名'] === '夏セール');
}

// ---------------------------------------------------------------
section('26. 画面から保存した日付が「日付」として後続処理で使えるか');
{
  // ★これまでハーネスの Utilities.parseDate が別realmのDateを返していたため、
  // 「画面(<input type=date>)から保存した撮影日が、アーカイブ・アラート・当日表で
  // 日付として認識されるか」という最重要経路が実質ノーチェックだった。
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-401','管轄':'関東','STS JP':'RQ' });
  const jp = ctx.apiLogin('KANTO','pw');

  const past = daysAgo(3);
  const pastIso = `${past.getFullYear()}-${String(past.getMonth()+1).padStart(2,'0')}-${String(past.getDate()).padStart(2,'0')}`;
  ctx.apiCommitChanges(jp.session.token, 'VIE-401', { '撮影日FIX': pastIso }, '');

  // シートに「文字列」ではなく実際の Date で入っていること
  const sheet = ctx.__ss.getSheetByName('予約一覧');
  const head = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const stored = sheet.getRange(2, head.indexOf('撮影日FIX')+1).getValue();
  check('画面から保存した撮影日がDate型で保存される',
        Object.prototype.toString.call(stored) === '[object Date]',
        `型: ${Object.prototype.toString.call(stored)} 値: ${stored}`);

  // 撮影日を過ぎた案件が過去一覧へ移動すること（Date型でないと移動しない）
  ctx.archivePastReservations();
  const arch = ctx.__ss.getSheetByName('過去一覧');
  check('画面から保存した撮影日でも過去一覧へ移動する', arch.getLastRow() === 2, `過去一覧の行数: ${arch.getLastRow()}`);
  check('移動後は予約一覧から消える', sheet.getLastRow() === 1, `予約一覧の行数: ${sheet.getLastRow()}`);
}
{
  // 撮影45日前アラートも、画面から保存した日付で発火すること
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-402','管轄':'関東','STS JP':'RQ' });
  const jp = ctx.apiLogin('KANTO','pw');
  const ahead = daysAhead(ctx.ALERT_DAYS_BEFORE);
  const iso = `${ahead.getFullYear()}-${String(ahead.getMonth()+1).padStart(2,'0')}-${String(ahead.getDate()).padStart(2,'0')}`;
  ctx.apiCommitChanges(jp.session.token, 'VIE-402', { '撮影日FIX': iso }, '');
  ctx.__mail.length = 0;
  ctx.checkAlerts();
  check('画面から保存した撮影日でも45日前アラートが飛ぶ',
        ctx.__mail.some(m => m.subj.includes('VIE-402')),
        JSON.stringify(ctx.__mail.map(m => m.subj)));

  // 当日表でも同じ日付で引ける
  const day = ctx.apiGetDaySchedule(jp.session.token, iso, { showAll: true });
  check('画面から保存した撮影日で当日表に出る',
        day.results.some(r => r.kanriNo === 'VIE-402'),
        JSON.stringify(day.results.map(r => r.kanriNo)));
}

// ---------------------------------------------------------------
section('27. 日本記入欄（管轄・フォトブリッジ登録・AI加工・データアップロード・納品先メールアドレス・早期納品）');
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-501','管轄':'関東','新郎名（ローマ字）':'A' });
  const jp = ctx.apiLogin('KANTO','pw');
  const t = jp.session.token;

  const before = ctx.apiGetReservationDetail(t, 'VIE-501').detail;
  check('ベースは未チェック（フォトブリッジ登録）', !before['フォトブリッジ登録']);
  check('ベースは未チェック（データアップロード）', !before['データアップロード']);
  check('ベースは未設定（AI加工）', !before['AI加工']);
  check('ベースは未チェック（早期納品）', !before['早期納品']);
  check('ベースは空欄（納品先メールアドレス）', !before['納品先メールアドレス']);

  ctx.apiSetInternalFlag(t, 'VIE-501', 'フォトブリッジ登録', true);
  ctx.apiSetInternalValue(t, 'VIE-501', 'AI加工', ctx.AI_EDIT_OPTIONS[0]);
  ctx.apiSetInternalFlag(t, 'VIE-501', 'データアップロード', true);
  ctx.apiSetInternalValue(t, 'VIE-501', '納品先メールアドレス', 'delivery@example.com');
  ctx.apiSetInternalFlag(t, 'VIE-501', '早期納品', true);
  const after = ctx.apiGetReservationDetail(t, 'VIE-501').detail;
  check('フォトブリッジ登録がチェックできる', after['フォトブリッジ登録'] === '済');
  check('入力者が自動反映される（フォトブリッジ登録者）', after['フォトブリッジ登録者'].includes('tanaka'),
        String(after['フォトブリッジ登録者']));
  check('チェック日時も自動反映される（フォトブリッジ登録日時）',
        /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(after['フォトブリッジ登録日時']),
        String(after['フォトブリッジ登録日時']));
  check('データアップロードがチェックできる', after['データアップロード'] === '済');
  check('入力者が自動反映される（データアップロード者）', after['データアップロード者'].includes('tanaka'),
        String(after['データアップロード者']));
  check('チェック日時も自動反映される（データアップロード日時）',
        /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(after['データアップロード日時']),
        String(after['データアップロード日時']));
  check('AI加工は加工内容を選択式で記録する', after['AI加工'] === ctx.AI_EDIT_OPTIONS[0], String(after['AI加工']));
  check('AI加工には入力者・日時欄が無い（仕様どおり）', !('AI加工者' in after) && !('AI加工日時' in after));
  check('早期納品がチェックできる', after['早期納品'] === '有');
  check('納品先メールアドレスが保存できる', after['納品先メールアドレス'] === 'delivery@example.com');

  // AI加工は選択肢以外を拒否する
  let badOption = null;
  try { ctx.apiSetInternalValue(t, 'VIE-501', 'AI加工', '侵入テスト'); } catch (e) { badOption = e.message; }
  check('AI加工は選択肢以外を拒否する', badOption !== null, String(badOption));

  // チェックを外すと入力者欄・日時欄もクリアされる
  ctx.apiSetInternalFlag(t, 'VIE-501', 'フォトブリッジ登録', false);
  const after2 = ctx.apiGetReservationDetail(t, 'VIE-501').detail;
  check('チェックを外すと未に戻る', !after2['フォトブリッジ登録']);
  check('チェックを外すと入力者欄もクリアされる', !after2['フォトブリッジ登録者']);
  check('チェックを外すと日時欄もクリアされる', !after2['フォトブリッジ登録日時']);

  // 管轄は日本記入欄に移り、通常の3択（保存のみ）で日本側だけが変更できる
  ctx.apiSaveFieldsQuiet(t, 'VIE-501', { '管轄': '関西' });
  check('管轄は通常の保存フローで変更できる（日本側）', ctx.apiGetReservationDetail(t, 'VIE-501').detail['管轄'] === '関西');

  // 支店側からは存在しない扱い（値が返らない・操作もできない）
  const vie = ctx.apiLogin('VIE','vp');
  const branchDetail = ctx.apiGetReservationDetail(vie.session.token, 'VIE-501').detail;
  check('支店側のレスポンスにフォトブリッジ登録が含まれない', !('フォトブリッジ登録' in branchDetail));
  check('支店側のレスポンスにAI加工が含まれない', !('AI加工' in branchDetail));
  check('支店側のレスポンスにデータアップロードが含まれない', !('データアップロード' in branchDetail));
  check('支店側のレスポンスに納品先メールアドレスが含まれない', !('納品先メールアドレス' in branchDetail));
  check('支店側のレスポンスに早期納品が含まれない', !('早期納品' in branchDetail));
  check('支店側のレスポンスにフォトブリッジ登録日時も含まれない', !('フォトブリッジ登録日時' in branchDetail));
  check('支店側のレスポンスにデータアップロード日時も含まれない', !('データアップロード日時' in branchDetail));
  check('支店側にも管轄は見える（担当表示用）', branchDetail['管轄'] === '関西');
  let branchErr = null;
  try { ctx.apiSetInternalValue(vie.session.token, 'VIE-501', 'AI加工', ctx.AI_EDIT_OPTIONS[0]); } catch (e) { branchErr = e.message; }
  check('支店側は日本記入欄を操作できない（AI加工）', branchErr !== null, String(branchErr));
  let branchFlagErr = null;
  try { ctx.apiSetInternalFlag(vie.session.token, 'VIE-501', 'フォトブリッジ登録', true); } catch (e) { branchFlagErr = e.message; }
  check('支店側は日本記入欄を操作できない（チェックボックス）', branchFlagErr !== null, String(branchFlagErr));
  let branchAreaErr = null;
  try { ctx.apiSaveFieldsQuiet(vie.session.token, 'VIE-501', { '管轄': '関東' }); } catch (e) { branchAreaErr = e.message; }
  check('支店側は管轄を変更できない', branchAreaErr !== null, String(branchAreaErr));

  // 参考：既存の「変更履歴」（STS等のステータス変更履歴）も日時（時刻まで）が入る
  ctx.apiCommitChanges(t, 'VIE-501', { 'STS JP': 'OK' }, '');
  const fieldHist = ctx.apiGetFieldHistory(t, 'VIE-501', 'STS JP');
  check('ステータス変更履歴には日時（時刻まで）が入る',
        fieldHist.length > 0 && /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(fieldHist[0].datetime),
        JSON.stringify(fieldHist[0]));
  const tlAfterSts = ctx.apiGetCaseTimeline(t, 'VIE-501');
  check('案件タイムラインのステータス変更にも日時が入る',
        tlAfterSts.items.some(it => it.type === 'status' && /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(it.datetime)),
        JSON.stringify(tlAfterSts.items.slice(0, 2)));

  // 通常の3択（メッセージ・変更通知）には一切乗らない＝支店に見える履歴・メールに混ざらない
  ctx.apiSetInternalFlag(t, 'VIE-501', 'データアップロード', true);
  let leakErr = null;
  try { ctx.apiCommitChanges(t, 'VIE-501', { 'データアップロード': '済' }, ''); } catch (e) { leakErr = e.message; }
  check('通常の3択フローでは日本記入欄を変更できない（履歴・メールへの混入防止）',
        leakErr !== null, String(leakErr));
  check('日本記入欄のチェックは共有の履歴に出ない',
        !ctx.apiGetCaseTimeline(t, 'VIE-501').items.some(it => String(it.field || '').includes('フォトブリッジ')));
  check('日本記入欄のチェックはメールを送らない（直前の操作でメールが増えていない）',
        !ctx.__mail.some(m => /フォトブリッジ|データアップロード/.test(m.subj + m.body)));

  // 未知のフィールド名は拒否する
  let badField = null;
  try { ctx.apiSetInternalFlag(t, 'VIE-501', 'STS JP', true); } catch (e) { badField = e.message; }
  check('日本記入欄以外は apiSetInternalFlag で変更できない', badField !== null, String(badField));
  let badValueField = null;
  try { ctx.apiSetInternalValue(t, 'VIE-501', 'STS JP', 'RQ'); } catch (e) { badValueField = e.message; }
  check('日本記入欄以外は apiSetInternalValue で変更できない', badValueField !== null, String(badValueField));
}

// ---------------------------------------------------------------
section('28. メモ履歴（共有メモを現地支店・日本支店（店舗）・手配課で分離、メモ（現地用）は積み上げ記録）');
{
  const ctx = shopFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-601','管轄':'関東' });
  const jp = ctx.apiLogin('KANTO','pw');
  const vie = ctx.apiLogin('VIE','vp');
  const shop = ctx.apiLogin('SHOP1','sp');

  // --- 現地支店の共有メモ：追加すると即座に反映され、日付・記入者は自動で入る（3択保留の対象外） ---
  ctx.apiAddMemo(vie.session.token, 'VIE-601', '共有メモ（現地支店）', '請求書は月末締めで発行予定');
  const afterFirst = ctx.apiGetReservationDetail(vie.session.token, 'VIE-601').detail;
  check('追加した内容が入る', afterFirst.memoLog[0].body === '請求書は月末締めで発行予定');
  check('種別が共有メモ（現地支店）になっている', afterFirst.memoLog[0].type === '共有メモ（現地支店）');
  check('記入者が自動で入る（Googleアカウントの氏名）', !!afterFirst.memoLog[0].who, afterFirst.memoLog[0].who);
  check('日時が自動で入る', /^\d{4}\/\d{2}\/\d{2}/.test(afterFirst.memoLog[0].datetime), afterFirst.memoLog[0].datetime);

  // 積み上げ式：追加するたびに増え、新しい順で返る
  ctx.apiAddMemo(vie.session.token, 'VIE-601', '共有メモ（現地支店）', '請求書は届いています');
  ctx.apiAddMemo(vie.session.token, 'VIE-601', 'メモ（現地用）', '雨天時は屋内スタジオへ変更');
  const afterThree = ctx.apiGetReservationDetail(vie.session.token, 'VIE-601').detail;
  const sharedOnly = afterThree.memoLog.filter(m => m.type === '共有メモ（現地支店）');
  const localOnly = afterThree.memoLog.filter(m => m.type === 'メモ（現地用）');
  check('共有メモ（現地支店）が2件積み上がっている', sharedOnly.length === 2, JSON.stringify(sharedOnly));
  check('新しい順（最新が先頭）', sharedOnly[0].body === '請求書は届いています', JSON.stringify(sharedOnly));
  check('古い方も消えずに残っている', sharedOnly[1].body === '請求書は月末締めで発行予定');
  check('メモ（現地用）は種別で分かれて1件だけ', localOnly.length === 1 && localOnly[0].body === '雨天時は屋内スタジオへ変更');

  // --- 空欄・不正な種別は拒否する ---
  let emptyErr = null;
  try { ctx.apiAddMemo(vie.session.token, 'VIE-601', '共有メモ（現地支店）', '   '); } catch (e) { emptyErr = e.message; }
  check('空欄のメモは追加できない', emptyErr !== null, String(emptyErr));
  let typeErr = null;
  try { ctx.apiAddMemo(jp.session.token, 'VIE-601', 'アンケート回答', '手入力で紛れ込ませようとする内容'); } catch (e) { typeErr = e.message; }
  check('種別「アンケート回答」は手入力では追加できない（Googleフォーム専用）', typeErr !== null, String(typeErr));
  let legacyErr = null;
  try { ctx.apiAddMemo(jp.session.token, 'VIE-601', '共有メモ', '旧方式の書き込みはもう使えない'); } catch (e) { legacyErr = e.message; }
  check('旧方式の種別「共有メモ」はもう追加できない（3分割後は使わない）', legacyErr !== null, String(legacyErr));

  // --- 他支店の案件へは追加できない ---
  const ist = ctx.apiLogin('IST','ip');
  let crossErr = null;
  try { ctx.apiAddMemo(ist.session.token, 'VIE-601', '共有メモ（現地支店）', '侵入'); } catch (e) { crossErr = e.message; }
  check('他支店の案件へメモを追加できない', crossErr !== null, String(crossErr));

  // ★要件：共有メモは現地支店・日本支店（店舗）・手配課それぞれ専用で、担当ロール以外は追加できない
  let jpToBranchErr = null;
  try { ctx.apiAddMemo(jp.session.token, 'VIE-601', '共有メモ（現地支店）', '手配課からの侵入'); } catch (e) { jpToBranchErr = e.message; }
  check('手配課は共有メモ（現地支店）を追加できない', jpToBranchErr !== null, String(jpToBranchErr));
  let branchToJpErr = null;
  try { ctx.apiAddMemo(vie.session.token, 'VIE-601', '共有メモ（手配課）', '現地支店からの侵入'); } catch (e) { branchToJpErr = e.message; }
  check('現地支店は共有メモ（手配課）を追加できない', branchToJpErr !== null, String(branchToJpErr));
  let branchToShopErr = null;
  try { ctx.apiAddMemo(vie.session.token, 'VIE-601', '共有メモ（日本支店）', '現地支店からの侵入'); } catch (e) { branchToShopErr = e.message; }
  check('現地支店は共有メモ（日本支店）を追加できない', branchToShopErr !== null, String(branchToShopErr));

  // ★要件：手配課は「共有メモ（手配課）」に書き込め、あわせて「共有メモ（日本支店）」も閲覧できる
  // （現地支店の共有メモは見えない）
  ctx.apiAddMemo(jp.session.token, 'VIE-601', '共有メモ（手配課）', '手配課内の連絡事項');
  const jpView = ctx.apiGetReservationDetail(jp.session.token, 'VIE-601').detail;
  check('手配課の画面には共有メモ（手配課）が見える', jpView.memoLog.some(m => m.type === '共有メモ（手配課）' && m.body === '手配課内の連絡事項'));
  check('手配課の画面には共有メモ（現地支店）は見えない（他ロール専用のため）',
        !jpView.memoLog.some(m => m.type === '共有メモ（現地支店）'));

  // ★要件：現地支店の画面には自分の共有メモ（現地支店）だけが見える（手配課の共有メモは見えない）
  const branchView = ctx.apiGetReservationDetail(vie.session.token, 'VIE-601').detail;
  check('現地支店の画面には共有メモ（現地支店）が見える', branchView.memoLog.some(m => m.type === '共有メモ（現地支店）'));
  check('現地支店の画面には共有メモ（手配課）は見えない', !branchView.memoLog.some(m => m.type === '共有メモ（手配課）'));

  // --- 日本支店（店舗）の共有メモ：店舗が起票した案件で確認する ---
  const shopCase = ctx.apiShopCreateRequest(shop.session.token, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Test', groomName: 'Taro', brideLastName: 'Test', brideName: 'Hanako',
    challengeNo: 'DUMMYCHG028', hope1: '2026-09-10'
  });
  const shopKanri = shopCase.kanriNo;

  // 店舗は共有メモ（日本支店）以外は追加できない（メモ（現地用）も不可）
  let shopLocalErr = null;
  try { ctx.apiAddMemo(shop.session.token, shopKanri, 'メモ（現地用）', '店舗からの侵入'); } catch (e) { shopLocalErr = e.message; }
  check('店舗が追加できるのは共有メモ（日本支店）だけです', shopLocalErr !== null, String(shopLocalErr));
  let shopBranchErr = null;
  try { ctx.apiAddMemo(shop.session.token, shopKanri, '共有メモ（現地支店）', '店舗からの侵入'); } catch (e) { shopBranchErr = e.message; }
  check('店舗は共有メモ（現地支店）を追加できない', shopBranchErr !== null, String(shopBranchErr));

  ctx.apiAddMemo(shop.session.token, shopKanri, '共有メモ（日本支店）', '店舗内の連絡事項');
  const shopView = ctx.apiGetReservationDetail(shop.session.token, shopKanri).detail;
  check('店舗の画面には自分の共有メモ（日本支店）が見える', shopView.memoLog.some(m => m.type === '共有メモ（日本支店）' && m.body === '店舗内の連絡事項'));

  // ★要件：手配課は「共有メモ（日本支店）」も見える（ただし追記はできない＝閲覧のみ）
  const jpViewShop = ctx.apiGetReservationDetail(jp.session.token, shopKanri).detail;
  check('手配課の画面には共有メモ（日本支店）も見える', jpViewShop.memoLog.some(m => m.type === '共有メモ（日本支店）' && m.body === '店舗内の連絡事項'));
  let jpToShopErr = null;
  try { ctx.apiAddMemo(jp.session.token, shopKanri, '共有メモ（日本支店）', '手配課からの書き込み'); } catch (e) { jpToShopErr = e.message; }
  check('手配課は共有メモ（日本支店）には追記できない（閲覧のみ）', jpToShopErr !== null, String(jpToShopErr));

  // 店舗の画面には共有メモ（現地支店）・共有メモ（手配課）は見えない
  ctx.apiAddMemo(vie.session.token, shopKanri, '共有メモ（現地支店）', '現地支店内の連絡事項');
  const shopViewAfterBranchMemo = ctx.apiGetReservationDetail(shop.session.token, shopKanri).detail;
  check('店舗の画面には共有メモ（現地支店）は見えない',
        !shopViewAfterBranchMemo.memoLog.some(m => m.type === '共有メモ（現地支店）'));
}

// ---------------------------------------------------------------
section('29. 現地スタッフ手配メール');
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-701','管轄':'関東',
    '新郎名（ローマ字）':'Yuma Tanaka','新婦名（ローマ字）':'Sophie Bauer',
    '撮影日FIX': daysAhead(30), '撮影希望場所':'シェーンブルン宮殿', 'ホテル':'Hotel Sacher', 'プラン名':'定番プラン' });
  const jp = ctx.apiLogin('KANTO','pw');
  const vie = ctx.apiLogin('VIE','vp');

  // 未設定のうちは「機能が無効」で弾かれる
  let disabledErr = null;
  try { ctx.apiBuildArrangementDraft(vie.session.token, 'VIE-701', 'photographer'); } catch (e) { disabledErr = e.message; }
  check('機能を有効にするまでは下書きも作れない', disabledErr !== null && disabledErr.includes('無効'), String(disabledErr));

  // 設定画面から有効化＋カメラマンとヘアメイクを同じ宛先にする（1件の委託先へまとめて依頼できることの確認）
  const saved = ctx.apiSaveArrangementSettings(vie.session.token, 'VIE', {
    enabled: true,
    categories: {
      photographer: { name: 'M.Gruber', email: 'gruber@example.com' },
      hairMakeup: { name: 'M.Gruber', email: 'gruber@example.com' },
      florist: { name: '', email: '' }
    }
  });
  check('設定の保存が成功する', saved.ok === true);

  const settings = ctx.apiGetArrangementSettings(jp.session.token, 'VIE');
  check('保存した設定が読み返せる（JP側からも）', settings.enabled === true);
  const photoCat = settings.categories.find(c => c.key === 'photographer');
  const hmCat = settings.categories.find(c => c.key === 'hairMakeup');
  const floristCat = settings.categories.find(c => c.key === 'florist');
  check('カメラマンの宛先が保存されている', photoCat.email === 'gruber@example.com');
  check('ヘアメイクも同じ宛先＝1件にまとめて依頼できる設定になっている', hmCat.email === 'gruber@example.com');
  check('未設定の花屋さんは空のまま', floristCat.email === '');

  // 下書き作成：宛先はサーバー側で確定し、案件情報が本文に入る
  const draft = ctx.apiBuildArrangementDraft(vie.session.token, 'VIE-701', 'photographer');
  check('下書きの宛先が設定どおり', draft.recipientEmail === 'gruber@example.com');
  check('下書きにお客様名が入る', draft.body.includes('Yuma Tanaka') && draft.body.includes('Sophie Bauer'));
  check('下書きに管理番号が入る', draft.body.includes('VIE-701'));
  check('下書きに撮影希望場所が入る', draft.body.includes('シェーンブルン宮殿'));
  check('下書きの件名にカテゴリ名が入る', draft.subject.includes('カメラマン'));

  // 未設定カテゴリはエラーになる
  let missingErr = null;
  try { ctx.apiBuildArrangementDraft(vie.session.token, 'VIE-701', 'florist'); } catch (e) { missingErr = e.message; }
  check('宛先未設定のカテゴリは下書きも作れない', missingErr !== null, String(missingErr));

  // 送信：実際にメールが飛び、履歴に残る（宛先はクライアントから指定できない＝改ざん不可）
  const beforeMailCount = ctx.__mail.length;
  const sendRes = ctx.apiSendArrangementRequest(vie.session.token, 'VIE-701', 'photographer', draft.subject, '編集後の本文です。よろしくお願いします。');
  check('送信が成功する', sendRes.ok === true);
  check('メールが1通送られる', ctx.__mail.length === beforeMailCount + 1);
  const sentMail = ctx.__mail[ctx.__mail.length - 1];
  check('宛先が設定どおり（クライアントの指定を無視してサーバー側の設定で決まる）', sentMail.to === 'gruber@example.com');
  check('編集した本文がそのまま送られる', sentMail.body === '編集後の本文です。よろしくお願いします。');
  check('支店の通知先メールへ返信が届くようreplyToが設定される', sentMail.replyTo === 'vie@his-world.com');

  const afterSend = ctx.apiGetReservationDetail(jp.session.token, 'VIE-701').detail;
  check('手配履歴が1件残る', afterSend.arrangementLog.length === 1);
  check('手配履歴にカテゴリが残る', afterSend.arrangementLog[0].category === 'カメラマン');
  check('手配履歴に宛先が残る', afterSend.arrangementLog[0].toEmail === 'gruber@example.com');

  // 画面側はボタンの有効／無効判定にだけ使う想定なので、宛先メール自体は案件詳細に含めない
  check('案件詳細のレスポンスに手配先メールが直接は含まれない（送信時にサーバー側で解決する設計）',
        !JSON.stringify(afterSend.arrangementCategories).includes('gruber@example.com'));
  const photoAvail = afterSend.arrangementCategories.find(c => c.key === 'photographer');
  const floristAvail = afterSend.arrangementCategories.find(c => c.key === 'florist');
  check('設定済みカテゴリは available=true', photoAvail.available === true);
  check('未設定カテゴリは available=false', floristAvail.available === false);

  // 支店ロールは自支店以外の設定を操作できない
  const ist = ctx.apiLogin('IST','ip');
  let crossSaveErr = null;
  try { ctx.apiSaveArrangementSettings(ist.session.token, 'VIE', { enabled: true, categories: {} }); } catch (e) { crossSaveErr = e.message; }
  check('他支店の手配設定は保存できない', crossSaveErr !== null, String(crossSaveErr));
  let crossSendErr = null;
  try { ctx.apiSendArrangementRequest(ist.session.token, 'VIE-701', 'photographer', '件名', '本文'); } catch (e) { crossSendErr = e.message; }
  check('他支店の案件へは手配メールを送れない', crossSendErr !== null, String(crossSendErr));
}

// ---------------------------------------------------------------
section('30. アンケートフォーム連携（お客様の回答をメモ履歴へ反映）');
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-801','管轄':'関東' });
  addCase(ctx, '予約一覧', { '支店コード':'IST','管理番号':'IST-801','管轄':'関西' });
  const jp = ctx.apiLogin('KANTO','pw');

  const e1 = [];
  ctx.onSurveyFormSubmitCore_({ namedValues: {
    '管理番号': ['VIE-801'],
    '当日の髪型のご希望': ['ゆるふわ巻き'],
    '参考写真': ['https://drive.google.com/file/d/xxxx']
  } }, e1);
  check('アンケート連携はエラーなしで終わる', e1.length === 0, JSON.stringify(e1));

  const detail = ctx.apiGetReservationDetail(jp.session.token, 'VIE-801').detail;
  const survey = detail.memoLog.filter(m => m.type === 'アンケート回答');
  check('アンケート回答がメモ履歴に1件反映される', survey.length === 1, JSON.stringify(survey));
  check('質問と回答がそのまま記録される（質問文をコード側で決め打ちしない）',
        survey[0].body.includes('当日の髪型のご希望: ゆるふわ巻き') && survey[0].body.includes('参考写真: https://drive.google.com/file/d/xxxx'),
        survey[0].body);
  check('管理番号の質問自体は回答内容に含めない', !survey[0].body.includes('管理番号:'));
  check('記入者はお客様（Googleフォーム）', survey[0].who.includes('Googleフォーム'), survey[0].who);

  // 無関係な案件（IST-801）には反映されない
  const other = ctx.apiGetReservationDetail(jp.session.token, 'IST-801').detail;
  check('無関係な案件にはアンケート回答が付かない', other.memoLog.filter(m => m.type === 'アンケート回答').length === 0);

  // 管理番号の質問が無い・空欄・存在しない番号はエラーとして記録される（処理は止まらない）
  const e2 = [];
  ctx.onSurveyFormSubmitCore_({ namedValues: { '別の質問': ['x'] } }, e2);
  check('管理番号の質問が無いとエラーになる', e2.length === 1);
  const e3 = [];
  ctx.onSurveyFormSubmitCore_({ namedValues: { '管理番号': ['NOTFOUND'] } }, e3);
  check('存在しない管理番号はエラーになる', e3.length === 1);
  const e4 = [];
  ctx.onSurveyFormSubmitCore_({ namedValues: { '管理番号': ['VIE-801'] } }, e4);
  check('管理番号だけで他の回答が無い場合もエラーになる', e4.length === 1);

  // 複数回回答すれば積み上がる（お客様が途中で回答をやり直すケースなど）
  ctx.onSurveyFormSubmitCore_({ namedValues: { '管理番号': ['VIE-801'], 'メイクのご希望': ['ナチュラル'] } }, []);
  const detail2 = ctx.apiGetReservationDetail(jp.session.token, 'VIE-801').detail;
  const survey2 = detail2.memoLog.filter(m => m.type === 'アンケート回答');
  check('2回目の回答は積み上げで残る（上書きしない）', survey2.length === 2, JSON.stringify(survey2));
}

// ---------------------------------------------------------------
section('31. お客様情報タブの新項目（パスポート番号欄・準備場所・同意書の表示制御）');
{
  const ctx = featureFixture();
  const ss = ctx.__ss;
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['ROW', 'ローマ支店', 'イタリア', 'ローマ', 'BRANCH', '', 'rp', 'row@his-world.com', 'R', '', '', '', '', true]);
  // イスタンブール支店だけ「パスポート番号欄」をON（ローマはイタリアだが対象外のまま）
  const head = bm.getRange(1, 1, 1, bm.getLastColumn()).getValues()[0];
  const codeCol = head.indexOf('支店コード');
  const passCol = head.indexOf('パスポート番号欄') + 1;
  const bmRows = bm.getRange(2, 1, bm.getLastRow() - 1, bm.getLastColumn()).getValues();
  bmRows.forEach((r, i) => { if (r[codeCol] === 'IST') bm.getRange(i + 2, passCol).setValue(true); });

  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-601', '管轄': '関東', '新郎名（ローマ字）': 'A' });
  addCase(ctx, '予約一覧', { '支店コード': 'IST', '管理番号': 'IST-601', '管轄': '関西', '新郎名（ローマ字）': 'B' });
  addCase(ctx, '予約一覧', { '支店コード': 'ROW', '管理番号': 'R-601', '管轄': '関東', '新郎名（ローマ字）': 'C' });

  const jp = ctx.apiLogin('KANTO', 'pw');
  const t = jp.session.token;

  const vieDetail = ctx.apiGetReservationDetail(t, 'VIE-601').detail;
  check('ウィーン支店はパスポート番号欄が非表示扱い', vieDetail.passportRequired === false);
  check('ウィーン支店はisItalyもfalse', vieDetail.isItaly === false);
  const istDetail = ctx.apiGetReservationDetail(t, 'IST-601').detail;
  check('イスタンブール支店はパスポート番号欄が表示扱い', istDetail.passportRequired === true);
  check('イスタンブール支店はイタリアではないのでisItalyはfalse', istDetail.isItaly === false);
  const rowDetail = ctx.apiGetReservationDetail(t, 'R-601').detail;
  check('ローマ支店はパスポート番号欄フラグは別物なので非表示のまま', rowDetail.passportRequired === false);
  check('ローマ支店は国がイタリアなのでisItaly=true', rowDetail.isItaly === true);

  // パスポート番号は表示フラグに関わらず、日本側・現地（支店）側どちらからも保存できる通常項目
  ctx.apiSaveFieldsQuiet(t, 'IST-601', { 'パスポート番号': 'AB1234567' });
  check('日本側からパスポート番号を保存できる', ctx.apiGetReservationDetail(t, 'IST-601').detail['パスポート番号'] === 'AB1234567');
  const ist = ctx.apiLogin('IST', 'ip');
  ctx.apiSaveFieldsQuiet(ist.session.token, 'IST-601', { 'パスポート番号': 'CD7654321' });
  check('現地（支店）側からもパスポート番号を保存できる', ctx.apiGetReservationDetail(t, 'IST-601').detail['パスポート番号'] === 'CD7654321');

  // 準備場所（イタリアのみ画面に出す想定だが、データはどの支店でも保存できる＝表示制御は画面側の責務）
  ctx.apiSaveFieldsQuiet(t, 'R-601', { '準備場所': ctx.PREP_CHOICES[1] });
  check('準備場所（サロン）が保存できる', ctx.apiGetReservationDetail(t, 'R-601').detail['準備場所'] === ctx.PREP_CHOICES[1]);

  // 希望日①～⑤（第一～第五希望）
  ctx.apiSaveFieldsQuiet(t, 'VIE-601', {
    '希望日①': '2026-09-01', '希望日②': '2026-09-02', '希望日③': '2026-09-03',
    '希望日④': '2026-09-04', '希望日⑤': '2026-09-05'
  });
  const hopeAfter = ctx.apiGetReservationDetail(t, 'VIE-601').detail;
  check('希望日①～⑤が5件とも保存・読み出しできる',
        ['①','②','③','④','⑤'].every((m, idx) => hopeAfter[`希望日${m}`] === `2026-09-0${idx + 1}`),
        JSON.stringify(['①','②','③','④','⑤'].map(m => hopeAfter[`希望日${m}`])));
}

// ---------------------------------------------------------------
section('32. 「空きだけ確認」チェックでSTS JPが自動でCHKになる連動');
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-701', '管轄': '関東', '新郎名（ローマ字）': 'A' });
  const jp = ctx.apiLogin('KANTO', 'pw');
  const t = jp.session.token;

  ctx.apiSaveFieldsQuiet(t, 'VIE-701', { '空き確認のみ': '済' });
  const after = ctx.apiGetReservationDetail(t, 'VIE-701').detail;
  check('空き確認のみにチェックすると自動でSTS JPがCHKになる', after['STS JP'] === 'CHK', String(after['STS JP']));
  check('空き確認のみ自体も保存される', after['空き確認のみ'] === '済');

  // 明示的にSTS JPも同時指定した場合は、そちらを優先して自動上書きしない
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-702', '管轄': '関東', '新郎名（ローマ字）': 'B' });
  ctx.apiSaveFieldsQuiet(t, 'VIE-702', { '空き確認のみ': '済', 'STS JP': 'RQ' });
  check('STS JPを同時に明示していれば自動連動しない',
        ctx.apiGetReservationDetail(t, 'VIE-702').detail['STS JP'] === 'RQ');

  // 既にチェック済みの案件へ同じ内容を再送しても、STS JPを巻き戻さない
  ctx.apiSaveFieldsQuiet(t, 'VIE-701', { 'STS JP': 'OK' }); // 一旦別の値に手動で変える
  ctx.apiSaveFieldsQuiet(t, 'VIE-701', { '空き確認のみ': '済' }); // 再送（既にチェック済みなので変化なし）
  check('チェック済みの再送では自動連動が再発火しない',
        ctx.apiGetReservationDetail(t, 'VIE-701').detail['STS JP'] === 'OK');

  // 支店側の操作では連動しない（空き確認のみ自体は書けても、STS JPの自動更新はJP側の操作限定）
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-703', '管轄': '関東', '新郎名（ローマ字）': 'C' });
  const vie = ctx.apiLogin('VIE', 'vp');
  ctx.apiSaveFieldsQuiet(vie.session.token, 'VIE-703', { '空き確認のみ': '済' });
  check('支店側の操作ではSTS JPが自動連動しない',
        !ctx.apiGetReservationDetail(t, 'VIE-703').detail['STS JP']);
}

// ---------------------------------------------------------------
section('33. STSの自動連動（日本CR＋支店CW→日本もCW／日本RQ＋支店UC→日本もUC）');
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-711', '管轄': '関東', '新郎名（ローマ字）': 'A' });
  const jp = ctx.apiLogin('KANTO', 'pw');
  const t = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vt = vie.session.token;

  // 日本側がCR（キャンセル依頼中）、現地がCWで回答 → 日本側も自動でCWになる
  ctx.apiSaveFieldsQuiet(t, 'VIE-711', { 'STS JP': 'CR' });
  ctx.apiSaveFieldsQuiet(vt, 'VIE-711', { 'STS 支店': 'CW' });
  const after1 = ctx.apiGetReservationDetail(t, 'VIE-711').detail;
  check('現地がCWに回答すると日本側も自動でCWになる', after1['STS JP'] === 'CW', String(after1['STS JP']));
  check('支店側の表示もCWのまま（自分で入れた値）', after1['STS 支店'] === 'CW');
  const cascadeLog1 = ctx.apiGetFieldHistory(t, 'VIE-711', 'STS JP');
  check('自動連動もSTS JPの変更履歴に残る（自動反映（ステータス連動）が担当者名）',
        cascadeLog1.some(h => h.who === '自動反映（ステータス連動）'), JSON.stringify(cascadeLog1));

  // 日本側がRQ（依頼中）、現地がUC（空きなし）で回答 → 日本側も自動でUCになる
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-712', '管轄': '関東', '新郎名（ローマ字）': 'B' });
  ctx.apiSaveFieldsQuiet(t, 'VIE-712', { 'STS JP': 'RQ' });
  ctx.apiSaveFieldsQuiet(vt, 'VIE-712', { 'STS 支店': 'UC' });
  const after2 = ctx.apiGetReservationDetail(t, 'VIE-712').detail;
  check('現地がUCに回答すると日本側も自動でUCになる', after2['STS JP'] === 'UC', String(after2['STS JP']));

  // ルールに当てはまらない組み合わせでは連動しない（例：日本側がCHKのまま支店だけCWにする）
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-713', '管轄': '関東', '新郎名（ローマ字）': 'C' });
  ctx.apiSaveFieldsQuiet(t, 'VIE-713', { 'STS JP': 'CHK' });
  ctx.apiSaveFieldsQuiet(vt, 'VIE-713', { 'STS 支店': 'CW' });
  check('対象外の組み合わせでは日本側のSTSは変わらない（CHKのまま）',
        ctx.apiGetReservationDetail(t, 'VIE-713').detail['STS JP'] === 'CHK');

  // 通知メール：STSの自動連動そのものはメッセージ通知には乗らない（監査ログのみ）。
  // ただしVIE-711は支店がCW（キャンセル成立）で回答しているため、別の要件（現地支店がCWにしたら
  // 自動で注意書きを送る＝appendCwAutoNoticeIfApplicable_）によりメールが1通だけ飛ぶ
  // （自動連動そのものが飛ばしているのではないことを、UCの回答＝VIE-712の側で確認する）。
  check('自動連動そのものはメールを増やさない（UCの回答＝VIE-712分にはメールが無い）',
        !ctx.__mail.some(m => /VIE-712/.test(m.subj + m.body)));
  check('支店がCWにした分だけ、自動注意書きのメールが1通飛ぶ（VIE-711）',
        ctx.__mail.some(m => /VIE-711/.test(m.subj + m.body) && m.body.includes('チャージの確認はしていない')));
}

// ---------------------------------------------------------------
section('34. 店舗発の新規依頼（起票・通知・メッセージのやり取り）');
function shopFixture() {
  const ctx = featureFixture();
  addBranchRow(ctx, { '支店コード': 'SHOP1', '支店名': '新宿店', 'ロール': 'SHOP', 'ログインパスコード': 'sp', '通知先メール': 'shop1@example.com', '有効': true });
  addBranchRow(ctx, { '支店コード': 'SHOP2', '支店名': '渋谷店', 'ロール': 'SHOP', 'ログインパスコード': 'sp2', '通知先メール': 'shop2@example.com', '有効': true });
  return ctx;
}
{
  const ctx = shopFixture();
  const shop = ctx.apiLogin('SHOP1', 'sp');
  check('店舗ロールでログインできる', shop.ok === true && shop.session.role === 'SHOP', JSON.stringify(shop));
  const shopToken = shop.session.token;
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieToken = vie.session.token;

  // --- 入力チェック ---
  let err;
  err = null; try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', customerName: '', challengeNo: 'DUMMYCHG016' }); } catch (e) { err = e.message; }
  check('お客様名が無いと作成できない', err !== null, String(err));
  err = null; try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', customerName: 'A' }); } catch (e) { err = e.message; }
  check('チャレンジ番号が無いと作成できない（任意ではなく必須）', err !== null, String(err));
  err = null; try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', customerName: 'A', challengeNo: 'CH-9001' }); } catch (e) { err = e.message; }
  check('チャレンジ番号の形式が不正（ハイフンあり・10桁）だと作成できない', err !== null, String(err));
  err = null; try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', customerName: 'A', challengeNo: '123456789012' }); } catch (e) { err = e.message; }
  check('チャレンジ番号が12桁だと作成できない', err !== null, String(err));
  err = null; try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '北海道', customerName: 'A' }); } catch (e) { err = e.message; }
  check('該当の手配課が不正だと作成できない', err !== null, String(err));
  err = null; try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'NOPE', team: '関東', customerName: 'A' }); } catch (e) { err = e.message; }
  check('存在しない支店コードだと作成できない', err !== null, String(err));
  err = null; try { ctx.apiShopCreateRequest(jpToken, { branchCode: 'VIE', team: '関東', customerName: 'A' }); } catch (e) { err = e.message; }
  check('店舗ロール以外は起票できない（JP）', err !== null, String(err));
  err = null; try { ctx.apiShopCreateRequest(vieToken, { branchCode: 'VIE', team: '関東', customerName: 'A' }); } catch (e) { err = e.message; }
  check('店舗ロール以外は起票できない（支店）', err !== null, String(err));

  // --- 起票 ---
  const created = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Yilmaz', groomName: 'Ahmet',
    brideLastName: 'Kaya', brideName: 'Elif', hopeDate: '2026-09-10', plan: 'プランA',
    challengeNo: 'DUMMYCHG000'
  });
  check('起票が成功する', created.ok === true && !!created.kanriNo, JSON.stringify(created));
  check('採番は対象支店（VIE）のプレフィックスになる', String(created.kanriNo).startsWith('VIE-'), created.kanriNo);
  const kanri = created.kanriNo;

  const jpDetail = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('STS JPはRQで作成される', jpDetail['STS JP'] === 'RQ');
  // ★不具合修正：以前はSTS(支店側)の初期値に「NC」を流用していたが、NCは今後ネームチェンジ専用の
  // コードのため、名前を変える予定の無い新規案件で最初から「NC」と出るのは紛らわしい。今は空欄になる。
  check('STS 支店は空欄で作成される（NCの誤用をやめた）', jpDetail['STS 支店'] === '');
  check('管轄は指定した手配課になる', jpDetail['管轄'] === '関東');
  check('お客様名が入る（大文字で保存される）', jpDetail['新郎姓（ローマ字）'] === 'YILMAZ' && jpDetail['新郎名（ローマ字）'] === 'AHMET');
  check('希望日①が入る', jpDetail['希望日①'] === '2026-09-10');
  check('プランが入る', jpDetail['プラン名'] === 'プランA');
  check('起票元店舗が記録される', jpDetail.originShop === 'SHOP1');
  check('起票元店舗名も返る', jpDetail.originShopName === '新宿店');

  check('日本の該当手配課へ通知メールが飛ぶ', ctx.__mail.some(m => m.to.includes('kanto@his-world.com') && m.body.includes('YILMAZ AHMET')));
  check('現地支店へも通知メールが飛ぶ', ctx.__mail.some(m => m.to.includes('vie@his-world.com') && m.body.includes('YILMAZ AHMET')));

  check('日本側は要対応（未読）になる', ctx.apiGetDashboard(jpToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri).needsAction === true);
  check('支店側も要対応（未読）になる', ctx.apiGetDashboard(vieToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri).needsAction === true);

  // --- 店舗自身から見える案件詳細（項目は最小限） ---
  const shopDetail = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('店舗自身は自分の起票した案件を見られる', shopDetail['管理番号'] === kanri);
  check('店舗向けの詳細にはSTSが入る', shopDetail['STS JP'] === 'RQ' && shopDetail['STS 支店'] === '');
  check('店舗向けの詳細には請求先など内部項目は含まれない', !('請求先' in shopDetail));
  // ★要件：お客様情報タブに、現地連絡先・滞在ホテル・フライト情報も店舗から入力できるようにする
  check('店舗向けの詳細には現地連絡先・滞在ホテル・フライト情報の項目が入る',
        'ホテル' in shopDetail && '現地連絡先メール' in shopDetail && 'フライト情報' in shopDetail);
  check('店舗の一覧にも自分の起票した案件が出る（自分の依頼状況確認）',
        ctx.apiGetDashboard(shopToken, { showAll: true }).reservations.some(r => r.kanriNo === kanri));

  // --- 他の店舗・他の案件は見えない ---
  const shop2 = ctx.apiLogin('SHOP2', 'sp2');
  err = null; try { ctx.apiGetReservationDetail(shop2.session.token, kanri); } catch (e) { err = e.message; }
  check('他の店舗が起票した案件は見られない', err !== null, String(err));
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-901', '管轄': '関東', '新郎名（ローマ字）': 'X' });
  err = null; try { ctx.apiGetReservationDetail(shopToken, 'VIE-901'); } catch (e) { err = e.message; }
  check('店舗が起票していない通常の案件は見られない', err !== null, String(err));

  // --- 店舗編集できる項目・できない項目の境界（詳細は別セクションで検証） ---
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'プラン名': 'プランB' });
  check('店舗はプラン名など許可された項目は変更できる（拡張要望2章・3-1）',
        ctx.apiGetReservationDetail(jpToken, kanri).detail['プラン名'] === 'プランB');
  err = null; try { ctx.apiSaveFieldsQuiet(shopToken, kanri, { '請求先': '関東' }); } catch (e) { err = e.message; }
  check('店舗は許可されていない項目（請求先）は変更できない', err !== null, String(err));
  err = null; try { ctx.apiCommitChanges(shopToken, kanri, { 'STS 支店': 'OK' }, ''); } catch (e) { err = e.message; }
  check('店舗はSTS 支店を変更できない', err !== null, String(err));

  // --- 通常モード（店舗直接やり取り許可＝OFF）でのメッセージのやり取り ---
  ctx.apiCommitChanges(shopToken, kanri, {}, '内装の希望を伝えたいです');
  check('店舗からのメッセージは日本側を未読にする（既定は手配課経由）',
        ctx.apiGetDashboard(jpToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri).needsAction === true);
  const afterShopMsg_branch = ctx.apiGetReservationDetail(vieToken, kanri).detail;
  check('支店側には店舗↔JPのやり取りが見えない（既定モード）',
        !afterShopMsg_branch.history.some(h => h.body.includes('内装の希望')));
  const afterShopMsg_jp = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('日本側には店舗からのメッセージが見える', afterShopMsg_jp.history.some(h => h.body.includes('内装の希望')));
  const afterShopMsg_shop = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('店舗自身にも自分の送ったメッセージが見える', afterShopMsg_shop.history.some(h => h.body.includes('内装の希望')));

  // 手配課が支店へ通常どおり確認（recipient省略＝従来どおり支店へ）
  ctx.apiCommitChanges(jpToken, kanri, {}, '空き状況を確認します');
  const toBranch = ctx.apiGetReservationDetail(vieToken, kanri).detail;
  check('recipient省略時のJPメッセージは支店に届く（従来どおり）',
        toBranch.history.some(h => h.body.includes('空き状況を確認します')));
  const toBranchFromShop = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('支店宛のJPメッセージは店舗には見えない',
        !toBranchFromShop.history.some(h => h.body.includes('空き状況を確認します')));

  // 支店の回答（既定モードではJPへ届く。店舗には届かない）
  ctx.apiCommitChanges(vieToken, kanri, {}, '9/10は空いています');
  check('支店の回答は日本側を未読にする',
        ctx.apiGetDashboard(jpToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri).needsAction === true);
  const branchReplySeenByShop = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('既定モードでは支店の回答が店舗には見えない（手配課の中継が必要）',
        !branchReplySeenByShop.history.some(h => h.body.includes('9/10は空いています')));

  // 手配課が店舗へ中継（recipient='SHOP'を明示）
  ctx.apiCommitChanges(jpToken, kanri, {}, '9/10で空きが確認できました', 'SHOP');
  check('recipient="SHOP"を指定すると店舗が未読になる',
        ctx.apiGetDashboard(shopToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri).needsAction === true);
  const relayed = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('中継したメッセージが店舗に届く', relayed.history.some(h => h.body.includes('9/10で空きが確認できました')));
  const relayedSeenByBranch = ctx.apiGetReservationDetail(vieToken, kanri).detail;
  check('店舗への中継は支店には見えない（別チャネル）',
        !relayedSeenByBranch.history.some(h => h.body.includes('9/10で空きが確認できました')));

  const jpSeesAll = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('日本側は店舗↔JP・JP↔支店どちらの履歴も全て見える（横断的な監督役）',
        jpSeesAll.history.some(h => h.body.includes('内装の希望')) &&
        jpSeesAll.history.some(h => h.body.includes('9/10は空いています')) &&
        jpSeesAll.history.some(h => h.body.includes('9/10で空きが確認できました')));

  // --- 直結モード（店舗直接やり取り許可＝ON）---
  setBranchField(ctx, 'VIE', '店舗直接やり取り許可', true);
  ctx.apiCommitChanges(shopToken, kanri, {}, '直結モードでの質問です');
  check('直結モードでは店舗のメッセージが支店を未読にする',
        ctx.apiGetDashboard(vieToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri).needsAction === true);
  const directToBranch = ctx.apiGetReservationDetail(vieToken, kanri).detail;
  check('直結モードでは支店に店舗のメッセージが直接届く',
        directToBranch.history.some(h => h.body.includes('直結モードでの質問です')));

  ctx.apiCommitChanges(vieToken, kanri, {}, '直結モードでの回答です');
  check('直結モードでは支店の回答が店舗を未読にする',
        ctx.apiGetDashboard(shopToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri).needsAction === true);
  const directToShop = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('直結モードでは店舗に支店の回答が直接届く',
        directToShop.history.some(h => h.body.includes('直結モードでの回答です')));

  const jpDuringDirect = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('直結モードでも日本側は履歴を監督用に閲覧できる',
        jpDuringDirect.history.some(h => h.body.includes('直結モードでの質問です')) &&
        jpDuringDirect.history.some(h => h.body.includes('直結モードでの回答です')));

  // ★要件変更：直結モードでも、現地とやり取りした具体的な料金を店舗へ伝えたい等の理由で
  // JPがrecipient='SHOP'を明示すれば店舗へ届くようにした（普段は店舗と支店が直接やり取りしていても
  // 手配課が必要と判断すれば店舗に連絡できるようにしたい、との要望による）。
  ctx.apiCommitChanges(jpToken, kanri, {}, '直結モード中でも手配課から店舗へ料金をご案内します', 'SHOP');
  const relayedDuringDirect = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('直結モードでもrecipient="SHOP"を明示すればJPのメッセージが店舗へ届く',
        relayedDuringDirect.history.some(h => h.body.includes('直結モード中でも手配課から店舗へ料金をご案内します')));
  const notSeenByBranch1 = ctx.apiGetReservationDetail(vieToken, kanri).detail;
  check('店舗への中継は支店には見えない（直結モードでも別チャネル）',
        !notSeenByBranch1.history.some(h => h.body.includes('直結モード中でも手配課から店舗へ料金をご案内します')));

  // JPがrecipientを指定しなければ、直結モードでも従来どおり支店へ届く
  ctx.apiCommitChanges(jpToken, kanri, {}, '直結モード中のJPからの確認');
  const stillToBranch = ctx.apiGetReservationDetail(vieToken, kanri).detail;
  check('直結モードでもrecipient未指定のJPのメッセージは支店へ届く（従来どおり）',
        stillToBranch.history.some(h => h.body.includes('直結モード中のJPからの確認')));

  // ★機能追加：直結モードでも、現地支店から手配課へ料金相談などの専用チャネルで連絡できる
  // （recipient='JP'を明示。このメッセージは店舗には見えない）
  ctx.apiCommitChanges(vieToken, kanri, {}, '直結モード中ですが料金について手配課に相談します', 'JP');
  const branchToJpDuringDirect = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('直結モードでも支店がrecipient="JP"を明示すればJPへ届く（料金相談用の専用チャネル）',
        branchToJpDuringDirect.history.some(h => h.body.includes('直結モード中ですが料金について手配課に相談します')));
  const notSeenByShop2 = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('支店から手配課への相談は店舗には見えない',
        !notSeenByShop2.history.some(h => h.body.includes('直結モード中ですが料金について手配課に相談します')));
  const dashboardJpAfterBranchAlert = ctx.apiGetDashboard(jpToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri);
  check('支店から手配課への相談はJP側を未読にする', dashboardJpAfterBranchAlert.needsAction === true);

  // --- 既読チェック（店舗ロール分） ---
  const shopHistId = ctx.apiGetReservationDetail(shopToken, kanri).detail.history.find(h => h.body.includes('直結モードでの回答です')).id;
  ctx.apiToggleHistoryCheck(shopToken, shopHistId, true);
  check('店舗が自分の案件の既読チェックを付けられる', true); // 例外なく終わればOK
  err = null;
  const branchOnlyHist = ctx.apiGetReservationDetail(vieToken, kanri).detail.history[0].id;
  try { ctx.apiToggleHistoryCheck(shop2.session.token, branchOnlyHist, true); } catch (e) { err = e.message; }
  check('他の店舗は他の案件の履歴を既読にできない', err !== null, String(err));

  // --- 支店マスタの安全確認：SHOPロールは自支店以外の管理系APIを操作できない ---
  err = null; try { ctx.apiGetArrangementSettings(shopToken, 'VIE'); } catch (e) { err = e.message; }
  check('店舗ロールは他支店の手配設定を閲覧できない（assertBranchAccess_の安全確認）', err !== null, String(err));
}

// ---------------------------------------------------------------
section('35. 検索：STSでの絞り込み・一覧表（表示形式が表）に返るSTS');
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-801', '管轄': '関東', '新郎名（ローマ字）': 'A', 'STS JP': 'RQ', 'STS 支店': 'NC', 'プラン名': 'スタンダードプラン' });
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-802', '管轄': '関東', '新郎名（ローマ字）': 'B', 'STS JP': 'OK', 'STS 支店': 'OK', 'プラン名': 'プレミアムプラン' });
  addCase(ctx, '予約一覧', { '支店コード': 'IST', '管理番号': 'IST-801', '管轄': '関西', '新郎名（ローマ字）': 'C', 'STS JP': 'OK', 'STS 支店': 'NC', 'プラン名': 'プレミアムプラン（ブーケ付き）' });
  const jp = ctx.apiLogin('KANTO', 'pw');
  const t = jp.session.token;

  const byStsJp = ctx.apiSearchReservations(t, { scope: { showAll: true }, statusJp: 'OK' }).results;
  check('STS JPで絞り込める', byStsJp.map(r => r.kanriNo).sort().join(',') === 'IST-801,VIE-802',
        JSON.stringify(byStsJp.map(r => r.kanriNo)));

  const byStsBranch = ctx.apiSearchReservations(t, { scope: { showAll: true }, statusBranch: 'NC' }).results;
  check('STS 支店で絞り込める', byStsBranch.map(r => r.kanriNo).sort().join(',') === 'IST-801,VIE-801',
        JSON.stringify(byStsBranch.map(r => r.kanriNo)));

  const byBoth = ctx.apiSearchReservations(t, { scope: { showAll: true }, statusJp: 'OK', statusBranch: 'OK' }).results;
  check('STS JP・STS 支店を両方指定するとAND条件になる', byBoth.map(r => r.kanriNo).join(',') === 'VIE-802',
        JSON.stringify(byBoth.map(r => r.kanriNo)));

  const all = ctx.apiSearchReservations(t, { scope: { showAll: true } }).results;
  check('STS未指定なら絞り込まれない', all.length === 3, String(all.length));

  // ★要件：一覧を日付範囲・ステータスに加えてプラン名でも絞り込める（部分一致）
  const byPlan = ctx.apiSearchReservations(t, { scope: { showAll: true }, plan: 'プレミアム' }).results;
  check('プラン名で絞り込める（部分一致）', byPlan.map(r => r.kanriNo).sort().join(',') === 'IST-801,VIE-802',
        JSON.stringify(byPlan.map(r => r.kanriNo)));
  const byPlanAndSts = ctx.apiSearchReservations(t, { scope: { showAll: true }, plan: 'プレミアム', statusBranch: 'OK' }).results;
  check('プラン名とSTSを組み合わせるとAND条件になる（1月1日～4月1日OKのみ抽出、のような複合条件を想定）',
        byPlanAndSts.map(r => r.kanriNo).join(',') === 'VIE-802', JSON.stringify(byPlanAndSts.map(r => r.kanriNo)));

  // 一覧（表示形式が表）でもSTSの値が取れるようになっているか（apiGetDashboardの返却値）
  const dash = ctx.apiGetDashboard(t, { showAll: true }).reservations.find(r => r.kanriNo === 'VIE-801');
  check('一覧のレスポンスにSTS JPが入る（表表示のSTS列用）', dash.statusJp === 'RQ');
  check('一覧のレスポンスにSTS 支店が入る（表表示のSTS列用）', dash.statusBranch === 'NC');
}

// ---------------------------------------------------------------
section('36. DriveフォルダURL登録（不具合修正の回帰テスト）');
{
  // ★不具合修正：markUnreadForCounterpart_ 廃止時にこの呼び出し箇所だけ更新漏れしていて、
  // 成功パス（正しいURL・正しい管理番号で最後まで到達する）を通す既存テストが無かったため
  // 気づけなかった。実際に最後まで成功させて確認する。
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-901', '管轄': '関東', '新郎名（ローマ字）': 'A' });
  const jp = ctx.apiLogin('KANTO', 'pw');
  const t = jp.session.token;

  let err = null;
  try { ctx.apiSetDriveUrl(t, 'VIE-901', 'https://drive.google.com/drive/folders/abc'); } catch (e) { err = e; }
  check('正しいURLで例外なく成功する', err === null, err ? (err.stack || err.message) : '');
  const after = ctx.apiGetReservationDetail(t, 'VIE-901').detail;
  check('DriveフォルダURLが保存される', after['DriveフォルダURL'] === 'https://drive.google.com/drive/folders/abc');
  const vie = ctx.apiLogin('VIE', 'vp');
  check('支店側も未読になる（通知が届く）',
        ctx.apiGetDashboard(vie.session.token, { showAll: true }).reservations.find(r => r.kanriNo === 'VIE-901').needsAction === true);
}

// ---------------------------------------------------------------
section('37. 店舗発の新規依頼フォーム拡張（拡張要望2章）');
{
  const ctx = shopFixture();
  setBranchField(ctx, 'IST', 'パスポート番号欄', true);
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;

  // --- 希望日（第一希望）が必須 ---
  let err = null;
  try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB' }); } catch (e) { err = e.message; }
  check('希望日（第一希望）が無いと作成できない', err !== null, String(err));

  // --- 新規作成時のSTS(JP側)選択（RQ／CHK） ---
  err = null;
  try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB', hope1: '2026-09-10', initialStatus: 'OK' }); } catch (e) { err = e.message; }
  check('初期STS(JP側)にRQ/CHK以外を指定すると作成できない', err !== null, String(err));

  // --- フル項目での作成（イスタンブール＝パスポート必須） ---
  const created = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'IST', team: '関西', groomLastName: 'Sato', groomName: 'Kenji', brideLastName: 'Sato', brideName: 'Yui',
    plan: 'プランA', saleName: '春の特別セール', location: '旧市街の教会', prep: 'サロン',
    hope1: '2026-09-10', hope2: '2026-09-11', hope3: '2026-09-12', hope4: '2026-09-13', hope5: '2026-09-14',
    option1: '追加アルバム', option2: 'アクセサリーレンタル',
    passportNumber: 'TR1234567', initialStatus: 'CHK', challengeNo: 'DUMMYCHG011'
  });
  check('拡張項目つきで起票が成功する', created.ok === true && !!created.kanriNo, JSON.stringify(created));
  const kanri = created.kanriNo;
  const detail = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('新郎名が大文字で入る', detail['新郎名（ローマ字）'] === 'KENJI');
  check('新婦名が大文字で入る', detail['新婦名（ローマ字）'] === 'YUI');
  check('セール名が入る', detail['セール名'] === '春の特別セール');
  check('撮影希望場所が入る', detail['撮影希望場所'] === '旧市街の教会');
  check('準備場所が入る', detail['準備場所'] === 'サロン');
  check('希望日が第五希望まで入る', ['希望日①','希望日②','希望日③','希望日④','希望日⑤'].map((k,i) => detail[k] === `2026-09-1${i}`).every(Boolean),
        JSON.stringify(['希望日①','希望日②','希望日③','希望日④','希望日⑤'].map(k => detail[k])));
  check('オプション名が入る', detail.options[0].name === '追加アルバム' && detail.options[1].name === 'アクセサリーレンタル');
  check('パスポート必須支店ではパスポート番号が保存される', detail['パスポート番号'] === 'TR1234567');
  check('選択した初期STS(JP側)（CHK）で作成される', detail['STS JP'] === 'CHK');

  // --- ★要件変更：パスポート番号欄は支店の必須設定に関わらず常に入力・保存できる
  //     （日本の店舗画面では「※ISWのみ必要」の注記付きで常時表示する運用にしたため） ---
  const created2 = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'BL', groomName: 'B', brideLastName: 'BBL', brideName: 'BB', hope1: '2026-10-01', passportNumber: 'NOT-IGNORED',
    groomAge: '28', brideAge: '26',
    challengeNo: 'DUMMYCHG012'
  });
  const detail2 = ctx.apiGetReservationDetail(jpToken, created2.kanriNo).detail;
  check('パスポート非必須支店でもパスポート番号は保存される（常に入力可能）', detail2['パスポート番号'] === 'NOT-IGNORED');
  check('新郎年齢・新婦年齢が保存される', detail2['新郎年齢'] === '28' && detail2['新婦年齢'] === '26');
  check('initialStatus省略時は既定のRQで作成される', detail2['STS JP'] === 'RQ');
}

// ---------------------------------------------------------------
section('38. 案件作成後の店舗による変更：DC/PC/NC（拡張要望3章）');
{
  const ctx = shopFixture();
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieToken = vie.session.token;

  const created = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB', hope1: '2026-09-10', challengeNo: 'DUMMYCHG001' });
  const kanri = created.kanriNo;
  // OKまで進める（前提条件：FNはOKからのみ）
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'STS JP': 'OK' });

  // --- 日付変更依頼（DC） ---
  ctx.apiCommitChanges(shopToken, kanri, { 'STS JP': 'DC' }, '日程を変更したいです。チャージ規定は確認済みです。');
  check('店舗がSTS(JP側)をDCに変更できる', ctx.apiGetReservationDetail(jpToken, kanri).detail['STS JP'] === 'DC');
  // 支店がOKで応答 → JP側・支店側の両方に反映される（3-2の特例）
  ctx.apiSaveFieldsQuiet(vieToken, kanri, { 'STS 支店': 'OK' });
  const afterDcOk = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('支店のOK応答でSTS(支店側)がOKになる', afterDcOk['STS 支店'] === 'OK');
  check('支店のOK応答でSTS(JP側)もOKになる（DC/PCだけの特例）', afterDcOk['STS JP'] === 'OK');

  // --- プラン・式場変更依頼（PC）→ 支店がUC（対応不可）で応答 ---
  ctx.apiCommitChanges(shopToken, kanri, { 'STS JP': 'PC' }, 'プランを変更したいです。チャージ規定は確認済みです。');
  ctx.apiSaveFieldsQuiet(vieToken, kanri, { 'STS 支店': 'UC' });
  const afterPcUc = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('支店のUC応答でSTS(支店側)がUCになる', afterPcUc['STS 支店'] === 'UC');
  check('支店のUC応答でSTS(JP側)もUCになる（対応不可＝店舗が直接リブッキング）', afterPcUc['STS JP'] === 'UC');

  // --- ★要件：専用の「ステータス変更」欄を廃止し、各オプション・プランの隣のSTS(JP側)バッジ
  //     から店舗自身が直接RQ→CR等へ変更できるようにする。案件全体のSTS JPだけでなく、
  //     各オプションのSTS JPも同じ対象値（FN/CR/DC/PC）へ店舗が直接変更できる ---
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'CR', 'キャンセル理由': 'お客様都合によるキャンセル' });
  check('店舗はオプション①のSTS(JP側)も直接CRへ変更できる',
        ctx.apiGetReservationDetail(jpToken, kanri).detail['OP1 STS JP'] === 'CR');
  check('CRにする際に入力したキャンセル理由が保存される',
        ctx.apiGetReservationDetail(jpToken, kanri).detail['キャンセル理由'] === 'お客様都合によるキャンセル');
  let err = null;
  try { ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'OK' }); } catch (e) { err = e.message; }
  check('店舗が設定できるのはFN/CR/DC/PCのみ（OK等は不可）', err !== null, String(err));
  err = null;
  try { ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'FN' }); } catch (e) { err = e.message; }
  check('オプション①をFNにできるのはそのオプション自身がOKの時だけ（今はCRなので不可）', err !== null, String(err));
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'OP1 STS JP': 'OK' }); // JP側は従来どおり自由に値を設定できる
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'FN' });
  check('オプション①がOKの状態からなら店舗はFNへ変更できる',
        ctx.apiGetReservationDetail(jpToken, kanri).detail['OP1 STS JP'] === 'FN');

  // ★要件：RQ（予約依頼）へ戻す操作も店舗自身で選べるようにする
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'RQ' });
  check('店舗はSTS(JP側)をRQ（予約依頼）へ戻すこともできる',
        ctx.apiGetReservationDetail(jpToken, kanri).detail['OP1 STS JP'] === 'RQ');

  // ★要件：一度OK（現地確定）になったオプションは、店舗側からRQ・DC・PCへは戻せない
  // （選べるのはCR・FNのみ）。RQ以外の状態からRQ等へ戻す操作自体は引き続きできる（上のテスト）。
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'OP1 STS JP': 'OK' });
  err = null;
  try { ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'RQ' }); } catch (e) { err = e.message; }
  check('OKのオプションを店舗はRQへ戻せない', err !== null, String(err));
  err = null;
  try { ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'DC' }); } catch (e) { err = e.message; }
  check('OKのオプションを店舗はDC（日付変更依頼）にもできない', err !== null, String(err));
  err = null;
  try { ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'PC' }); } catch (e) { err = e.message; }
  check('OKのオプションを店舗はPC（プラン変更依頼）にもできない', err !== null, String(err));
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'CR' });
  check('OKのオプションから店舗はCR（キャンセル依頼）にはできる',
        ctx.apiGetReservationDetail(jpToken, kanri).detail['OP1 STS JP'] === 'CR');
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'OP1 STS JP': 'OK' }); // 再度OKに戻してFNのテスト
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'FN' });
  check('OKのオプションから店舗はFN（最終確定）にはできる',
        ctx.apiGetReservationDetail(jpToken, kanri).detail['OP1 STS JP'] === 'FN');
  // ★要件：案件全体のSTS(JP側)も、一度OK（現地確定）になった後はRQ（依頼前の状態）へは
  // 戻せない（RQは選択肢自体に出ない）。ただしDC/PC（拡張要望3-2）はオプションと違い、
  // OKになった後も店舗から引き続き出せる仕様のまま変わらない。
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'STS JP': 'OK' });
  err = null;
  try { ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'STS JP': 'RQ' }); } catch (e) { err = e.message; }
  check('OKの案件全体を店舗はRQへ戻せない', err !== null, String(err));
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'STS JP': 'DC' });
  check('案件全体のSTS(JP側)はOKの後もDC（日付変更依頼）にできる（オプションとは別扱い）',
        ctx.apiGetReservationDetail(jpToken, kanri).detail['STS JP'] === 'DC');
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'STS JP': 'OK' });
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'STS JP': 'PC' });
  check('案件全体のSTS(JP側)はOKの後もPC（プラン・式場変更依頼）にできる',
        ctx.apiGetReservationDetail(jpToken, kanri).detail['STS JP'] === 'PC');

  // --- ネームチェンジ機能は廃止：専用のステータスコードは持たない。新郎名・新婦名欄を
  //     直接編集して送信するだけで「ネームチェンジのお知らせ」として現地に伝わる ---
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'STS JP': 'OK' });
  err = null;
  try { ctx.apiCommitChanges(shopToken, kanri, { 'STS JP': 'NC' }, ''); } catch (e) { err = e.message; }
  check('NC（廃止済み）はもう設定できない', err !== null, String(err));
  ctx.__mail.length = 0;
  ctx.apiCommitChanges(shopToken, kanri, { '新郎名（ローマ字）': 'Renamed Groom' }, 'お客様のお名前が変わりました。');
  check('新郎名を変更して送信すると「ネームチェンジ」の通知になる（専用ステータス不要）',
        ctx.__mail.some(m => m.subj.includes('ネームチェンジ')), JSON.stringify(ctx.__mail.map(m => m.subj)));

  // --- FNの前提条件：OKの状態からのみ ---
  const created2 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'BL', groomName: 'B', brideLastName: 'BBL', brideName: 'BB', hope1: '2026-11-01', challengeNo: 'DUMMYCHG002' });
  err = null;
  try { ctx.apiCommitChanges(shopToken, created2.kanriNo, { 'STS JP': 'FN' }, ''); } catch (e) { err = e.message; }
  check('STS(JP側)がRQのままではFN（最終確定）にできない', err !== null, String(err));
  ctx.apiSaveFieldsQuiet(jpToken, created2.kanriNo, { 'STS JP': 'OK' });
  ctx.apiCommitChanges(shopToken, created2.kanriNo, { 'STS JP': 'FN' }, '');
  check('OKの状態からはFN（最終確定）にできる', ctx.apiGetReservationDetail(jpToken, created2.kanriNo).detail['STS JP'] === 'FN');

  // --- 店舗が設定できるSTS(JP側)以外の値は拒否される ---
  err = null;
  try { ctx.apiSaveFieldsQuiet(shopToken, created2.kanriNo, { 'STS JP': 'CW' }); } catch (e) { err = e.message; }
  check('店舗はCW等、許可されていないSTS(JP側)には変更できない', err !== null, String(err));
}

// ---------------------------------------------------------------
section('39. 手配課通知トグル・請求先マスタ（拡張要望5章・6章）');
{
  const ctx = shopFixture();
  setBranchField(ctx, 'SHOP1', '請求先', '関東営業本部');
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieToken = vie.session.token;

  // --- 既定（未設定）は従来どおり手配課・支店の両方に通知 ---
  const created1 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB', hope1: '2026-09-10', challengeNo: 'DUMMYCHG003' });
  check('通知トグル未設定なら手配課にも通知メールが飛ぶ（既定＝ON）', ctx.__mail.some(m => m.to.includes('kanto@his-world.com')));

  // --- 通知トグルをOFFにした支店は手配課宛メールだけ止まる（可視性は変わらない） ---
  setBranchField(ctx, 'VIE', '店舗依頼の手配課通知', false);
  ctx.__mail.length = 0;
  const created2 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'BL', groomName: 'B', brideLastName: 'BBL', brideName: 'BB', hope1: '2026-09-11', challengeNo: 'DUMMYCHG004' });
  check('通知OFFの支店では手配課宛メールが飛ばない', !ctx.__mail.some(m => m.to.includes('kanto@his-world.com')));
  check('通知OFFでも現地支店へのメールは飛ぶ', ctx.__mail.some(m => m.to.includes('vie@his-world.com')));
  check('通知OFFでも手配課側の一覧には表示され、未読（要対応）になる（閲覧権限自体は変えない）',
        ctx.apiGetDashboard(jpToken, { showAll: true }).reservations.find(r => r.kanriNo === created2.kanriNo).needsAction === true);

  // --- 請求先（店舗自身の営業本部）が店舗発の案件の詳細に反映される ---
  const jpDetail = ctx.apiGetReservationDetail(jpToken, created1.kanriNo).detail;
  check('JP側の詳細に、起票した店舗の請求先が表示される', jpDetail.shopBilling === '関東営業本部');
  const shopDetail = ctx.apiGetReservationDetail(shopToken, created1.kanriNo).detail;
  check('店舗自身の詳細にも自分の請求先が表示される', shopDetail.shopBilling === '関東営業本部');

  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-950', '管轄': '関東', '新郎名（ローマ字）': 'X' });
  const nonShopDetail = ctx.apiGetReservationDetail(jpToken, 'VIE-950').detail;
  check('店舗発でない案件は請求先が空欄', nonShopDetail.shopBilling === '');
}

// ---------------------------------------------------------------
section('40. 必要書類チェックリスト（拡張要望9章：双方向）');
{
  const ctx = shopFixture();
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieToken = vie.session.token;

  const created = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB', hope1: '2026-09-10', challengeNo: 'DUMMYCHG005' });
  const kanri = created.kanriNo;

  const initial = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('作成直後はチェックリストが全て未チェック', initial.checklist.every(c => c.checked === false), JSON.stringify(initial.checklist));

  // 店舗がチェック
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { '必要書類チェック:ヘアメイク画像': 'TRUE' });
  check('店舗がチェックを入れられる',
        ctx.apiGetReservationDetail(jpToken, kanri).detail.checklist.find(c => c.item === 'ヘアメイク画像').checked === true);
  const shopSideView = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('店舗自身の画面にも自分が入れたチェックが反映される',
        shopSideView.checklist.find(c => c.item === 'ヘアメイク画像').checked === true);

  // 現地(支店)がチェック（双方向）
  ctx.apiSaveFieldsQuiet(vieToken, kanri, { '必要書類チェック:衣裳画像': 'TRUE' });
  const afterBranchCheck = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('現地(支店)が入れたチェックが店舗側にも反映される（双方向）',
        afterBranchCheck.checklist.find(c => c.item === '衣裳画像').checked === true);

  // チェックを外す
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { '必要書類チェック:ヘアメイク画像': '' });
  check('チェックを外すこともできる',
        ctx.apiGetReservationDetail(jpToken, kanri).detail.checklist.find(c => c.item === 'ヘアメイク画像').checked === false);
}

// ---------------------------------------------------------------
section('41. ドライブ連携：お客様提供画像・指示書のアップロード（拡張要望8章）');
{
  const ctx = shopFixture();
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const shop2 = ctx.apiLogin('SHOP2', 'sp2');
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieToken = vie.session.token;

  const created = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB', hope1: '2026-09-10', challengeNo: 'DUMMYCHG006' });
  const kanri = created.kanriNo;
  const b64 = Buffer.from('dummy-image-bytes').toString('base64');

  let err = null;
  try { ctx.apiShopUploadDocument(shopToken, kanri, '存在しない種別', 'a.jpg', 'image/jpeg', b64); } catch (e) { err = e.message; }
  check('未定義の書類種別は拒否される', err !== null, String(err));

  const up1 = ctx.apiShopUploadDocument(shopToken, kanri, 'ヘアメイク画像', 'hair1.jpg', 'image/jpeg', b64);
  check('アップロードが成功する', up1.ok === true && !!up1.fileUrl, JSON.stringify(up1));
  const detailAfterUpload = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('案件にフォルダURLが自動で紐づく（8-1）', !!detailAfterUpload.shopUploadFolderUrl);
  check('DriveフォルダURL（最終納品先）欄にも同じフォルダが反映される（8-2：同じ親フォルダを使い回す）',
        detailAfterUpload['DriveフォルダURL'] === detailAfterUpload.shopUploadFolderUrl);
  const folderId = detailAfterUpload.shopUploadFolderUrl.split('/').pop();
  const folderName = ctx.__driveFolders[folderId] && ctx.__driveFolders[folderId].name;
  check('フォルダ名にチャレンジ番号と管理番号の両方が含まれる（8-1）',
        folderName === `DUMMYCHG006_${kanri}`, folderName);
  check('やり取り履歴にアップロードが記録される',
        detailAfterUpload.history.some(h => h.body.includes('ヘアメイク画像') && h.body.includes('hair1.jpg')));

  // 2件目（同じ書類種別のフォルダへの追加）
  const up2 = ctx.apiShopUploadDocument(shopToken, kanri, 'ヘアメイク画像', 'hair2.jpg', 'image/jpeg', b64);
  check('同じ書類種別へ複数アップロードできる', up2.ok === true);
  const up3 = ctx.apiShopUploadDocument(shopToken, kanri, '衣裳画像', 'dress1.jpg', 'image/jpeg', b64);
  check('別の書類種別にもアップロードできる', up3.ok === true);

  // --- 閲覧（8-3：既定は手配課のみ、支店マスタのトグルで現地にも公開） ---
  const jpList = ctx.apiListShopUploadedDocuments(jpToken, kanri);
  check('手配課は既定で一覧を閲覧できる', jpList.visible === true);
  check('ヘアメイク画像フォルダに2件入っている',
        jpList.folders.find(f => f.docType === 'ヘアメイク画像').files.length === 2);
  check('衣裳画像フォルダに1件入っている',
        jpList.folders.find(f => f.docType === '衣裳画像').files.length === 1);

  const branchListBefore = ctx.apiListShopUploadedDocuments(vieToken, kanri);
  check('現地(支店)は既定では閲覧できない（8-3）', branchListBefore.visible === false);

  setBranchField(ctx, 'VIE', '店舗アップロードの現地公開', true);
  const branchListAfter = ctx.apiListShopUploadedDocuments(vieToken, kanri);
  check('支店マスタのトグルをONにすると現地(支店)も閲覧できる', branchListAfter.visible === true);
  check('公開後は現地からも同じ内容が見える',
        branchListAfter.folders.find(f => f.docType === 'ヘアメイク画像').files.length === 2);

  const shopOwnList = ctx.apiListShopUploadedDocuments(shopToken, kanri);
  check('店舗自身は常に自分の案件のアップロード一覧を見られる', shopOwnList.visible === true);

  err = null;
  try { ctx.apiShopUploadDocument(shop2.session.token, kanri, 'ヘアメイク画像', 'x.jpg', 'image/jpeg', b64); } catch (e) { err = e.message; }
  check('他の店舗は他の案件へアップロードできない', err !== null, String(err));
  err = null;
  try { ctx.apiListShopUploadedDocuments(shop2.session.token, kanri); } catch (e) { err = e.message; }
  check('他の店舗は他の案件の一覧を見られない', err !== null, String(err));
}

// ---------------------------------------------------------------
section('42. 同意書・アンケートフォームの事前入力済みURL（拡張要望10章）');
{
  const ctx = shopFixture();
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;

  const created = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB', hope1: '2026-09-10', challengeNo: 'DUMMYCHG007' });
  const kanri = created.kanriNo;

  // ★要件：entry ID（管理番号を事前入力するための質問ID）が未設定でも、フォームのURL自体は
  // 案内できるようにする（管理番号は自動入力されないが、案内が一切出ないよりよい）。
  const urls = ctx.apiGetPrefilledFormUrls(shopToken, kanri);
  check('同意書フォームはentry ID未設定でも素のURLを返す（管理番号は自動入力されない）',
        urls.consentFormUrl === ctx.CONSENT_FORM_URL, urls.consentFormUrl);
  check('アンケートフォームはURL自体が未設定なので空文字のまま', urls.surveyFormUrl === '');

  // URL生成ロジック単体テスト（実際にentry IDが設定されている想定）
  const built = ctx.buildPrefilledFormUrl_('https://docs.google.com/forms/d/e/abc/viewform', 'entry.123456789', kanri);
  check('管理番号を埋め込んだURLが生成される', built === `https://docs.google.com/forms/d/e/abc/viewform?entry.123456789=${encodeURIComponent(kanri)}`, built);
  const builtWithQuery = ctx.buildPrefilledFormUrl_('https://example.com/form?usp=pp_url', 'entry.1', kanri);
  check('既に?が含まれるURLには&で連結する', builtWithQuery.includes('&entry.1='), builtWithQuery);
  check('baseUrlが空なら空文字を返す', ctx.buildPrefilledFormUrl_('', 'entry.1', kanri) === '');
  check('entry IDが空でもbaseUrlがあればそのまま返す（事前入力なしの素のURL）',
        ctx.buildPrefilledFormUrl_('https://example.com/form', '', kanri) === 'https://example.com/form');

  // ★ご提供いただいた実際の同意書フォームURLが設定されていること（entry IDは
  // ネットワーク制限のためこの環境では自動取得できず、別途設定が必要）
  check('同意書フォームURL（通常）が設定されている', ctx.CONSENT_FORM_URL === 'https://forms.gle/D45veRz2svQVSnc16');
  check('同意書フォームURL（イタリア専用）が設定されている',
        ctx.ITALY_CONSENT_FORM_URL === 'https://docs.google.com/forms/d/e/1FAIpQLSfWEeaiQmvt3ffV1giA3Cc2b5rPmcSxazZP2fZdveDQhGPT0A/viewform');

  // ★要件：イタリアの支店の案件だけ、同意書はイタリア専用フォームを使う（entry ID設定済みと仮定して検証）
  const italyUrl = ctx.buildPrefilledFormUrl_(ctx.ITALY_CONSENT_FORM_URL, 'entry.999', kanri);
  const normalUrl = ctx.buildPrefilledFormUrl_(ctx.CONSENT_FORM_URL, 'entry.999', kanri);
  check('通常フォームとイタリア専用フォームで異なるURLが生成される', italyUrl !== normalUrl);

  // イタリアの支店（国名で判定）では、entry ID未設定でもイタリア専用フォームの素のURLが返る
  addBranchRow(ctx, { '支店コード': 'ROW', '支店名': 'ローマ支店', '国': 'イタリア', '都市': 'ローマ', 'ロール': 'BRANCH', 'ログインパスコード': 'rp', '有効': true });
  addCase(ctx, '予約一覧', { '支店コード': 'ROW', '管理番号': 'ROW-901', '管轄': '関東', '新郎名（ローマ字）': 'X' });
  const jpToken42 = ctx.apiLogin('KANTO', 'pw').session.token;
  const urlsItaly = ctx.apiGetPrefilledFormUrls(jpToken42, 'ROW-901');
  check('イタリアの支店の案件ではイタリア専用フォームの素のURLを返す',
        urlsItaly.ok === true && urlsItaly.consentFormUrl === ctx.ITALY_CONSENT_FORM_URL, urlsItaly.consentFormUrl);
}

// ---------------------------------------------------------------
section('43. 希望日ごとの空き確認ステータス（第一〜第五希望それぞれにSTS JP/STS 支店）');
{
  const ctx = shopFixture();
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieToken = vie.session.token;

  const created = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB',
    hope1: '2026-08-01', hope2: '2026-08-05', hope3: '2026-08-06',
    // 希望日④・⑤は未入力のまま
    challengeNo: 'DUMMYCHG013'
  });
  const kanri = created.kanriNo;

  let d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('入力済みの希望日はSTS(JP側)がRQで初期化される',
        d['希望日① STS JP'] === 'RQ' && d['希望日② STS JP'] === 'RQ' && d['希望日③ STS JP'] === 'RQ');
  check('入力済みの希望日はSTS(支店側)がST（現地未確認）で初期化される',
        d['希望日① STS 支店'] === 'ST' && d['希望日② STS 支店'] === 'ST' && d['希望日③ STS 支店'] === 'ST');
  check('未入力の希望日（第四・第五希望）はSTSも空欄のまま',
        !d['希望日④ STS JP'] && !d['希望日④ STS 支店'] && !d['希望日⑤ STS JP'] && !d['希望日⑤ STS 支店']);
  check('案件全体のSTS JPは従来どおりRQで作成される', d['STS JP'] === 'RQ');

  // 現地が希望日②を確認してベンダーへ連絡（ST→RQ、まだ結果は出ていない）
  ctx.apiSaveFieldsQuiet(vieToken, kanri, { '希望日② STS 支店': 'RQ' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('ST→RQへの変更はそれ単体で完結する（他への連動なし）',
        d['希望日② STS 支店'] === 'RQ' && d['希望日② STS JP'] === 'RQ' &&
        d['希望日① STS 支店'] === 'ST' && d['希望日③ STS 支店'] === 'ST');

  // 希望日②が取れた
  ctx.apiSaveFieldsQuiet(vieToken, kanri, { '希望日② STS 支店': 'OK' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('希望日②のSTS(支店側)がOKになる', d['希望日② STS 支店'] === 'OK');
  check('希望日②のSTS(JP側)にも自動で反映される（DC/PCと同じ例外パターン）', d['希望日② STS JP'] === 'OK');
  // 撮影日FIXはDATE_FIELDSのためISO形式（yyyy-MM-dd）で返る（他の日付欄と同じ）
  check('撮影日FIXに希望日②の日付が反映される', d['撮影日FIX'] === '2026-08-05', d['撮影日FIX']);
  check('他の入力済み希望日（第一・第三）は自動でUC/UCになる',
        d['希望日① STS 支店'] === 'UC' && d['希望日① STS JP'] === 'UC' &&
        d['希望日③ STS 支店'] === 'UC' && d['希望日③ STS JP'] === 'UC');
  check('未入力だった希望日④・⑤は引き続き空欄のまま', !d['希望日④ STS 支店'] && !d['希望日⑤ STS 支店']);
  check('案件全体のSTS(JP側)が初期値RQのままだったので、希望日確定に伴いOKへ進む', d['STS JP'] === 'OK');
  check('案件全体のSTS(支店側)も同様にOKになる', d['STS 支店'] === 'OK');

  // 変更履歴（誰が・いつ）が残っていること
  const hist = ctx.apiGetFieldHistory(jpToken, kanri, '希望日② STS JP');
  check('希望日のSTS(JP側)自動反映も変更履歴に残る', hist.length === 1 && hist[0].newValue === 'OK', JSON.stringify(hist));
  const histOthers = ctx.apiGetFieldHistory(jpToken, kanri, '希望日① STS JP');
  check('他の希望日への自動UC反映も履歴に残る', histOthers.length === 1 && histOthers[0].newValue === 'UC');

  // 希望日ごとのSTS(JP側)は直接編集できない（自動連動専用のシステム項目）
  let err = null;
  try { ctx.apiSaveFieldsQuiet(jpToken, kanri, { '希望日① STS JP': 'OK' }); } catch (e) { err = e.message; }
  check('希望日のSTS(JP側)は誰も直接編集できない', err !== null, String(err));

  // 一度OK/ロックされた希望日は、支店側もこれ以上編集できない（BRANCH_EDIT_GATEにOKキーが無い）
  err = null;
  try { ctx.apiSaveFieldsQuiet(vieToken, kanri, { '希望日② STS 支店': 'UC' }); } catch (e) { err = e.message; }
  check('OKで確定した希望日はこれ以上支店側も変更できない', err !== null, String(err));

  // --- CHK（空き確認のみ）で作成した場合は、希望日が取れても案件全体を自動でOKへ進めない ---
  const created2 = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'BL', groomName: 'B', brideLastName: 'BBL', brideName: 'BB', hope1: '2026-09-01', initialStatus: 'CHK',
    challengeNo: 'DUMMYCHG014'
  });
  ctx.apiSaveFieldsQuiet(vieToken, created2.kanriNo, { '希望日① STS 支店': 'OK' });
  const d2 = ctx.apiGetReservationDetail(jpToken, created2.kanriNo).detail;
  check('希望日①のSTS(支店側)はOKになる（CHKでも希望日単位の連動自体は動く）', d2['希望日① STS 支店'] === 'OK');
  check('CHK（空き確認のみ）で作成した案件は、希望日が取れても全体を自動でOKにはしない', d2['STS JP'] === 'CHK');

  // --- 既にDC/PC/CR/NC等へ手動で進めている案件は、希望日の自動連動で巻き戻さない ---
  const created3 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'CL', groomName: 'C', brideLastName: 'CBL', brideName: 'CB', hope1: '2026-09-05', hope2: '2026-09-06', challengeNo: 'DUMMYCHG008' });
  ctx.apiSaveFieldsQuiet(jpToken, created3.kanriNo, { 'STS JP': 'DC' }); // 案件全体を手動でDCへ
  ctx.apiSaveFieldsQuiet(vieToken, created3.kanriNo, { '希望日① STS 支店': 'OK' });
  const d3 = ctx.apiGetReservationDetail(jpToken, created3.kanriNo).detail;
  check('案件全体のSTSが既にRQ以外（DC）に進んでいる場合は、希望日確定で巻き戻さない', d3['STS JP'] === 'DC');

  // --- 現地・日本共に一括でステータスをセットできるように（画面のチェックボックス＋まとめて設定）。
  //     サーバー側は単に「複数の希望日STS(支店側)を1回のwritesに含める」だけでよく、
  //     applyHopeStatusCascade_が各行ごとに正しくJP側へも連動させる ---
  const created4 = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'DL', groomName: 'D', brideLastName: 'DBL', brideName: 'DB',
    hope1: '2026-10-01', hope2: '2026-10-02', hope3: '2026-10-03',
    challengeNo: 'DUMMYCHG015'
  });
  ctx.apiSaveFieldsQuiet(vieToken, created4.kanriNo, {
    '希望日① STS 支店': 'UC', '希望日② STS 支店': 'UC'
  });
  const d4 = ctx.apiGetReservationDetail(jpToken, created4.kanriNo).detail;
  check('一括設定：チェックした複数の希望日STS(支店側)が1回の送信でまとめて反映される',
        d4['希望日① STS 支店'] === 'UC' && d4['希望日② STS 支店'] === 'UC');
  check('一括設定：それぞれのSTS(JP側)にも自動で反映される（1回の送信で両方連動）',
        d4['希望日① STS JP'] === 'UC' && d4['希望日② STS JP'] === 'UC');
  check('一括設定：選ばなかった希望日③はSTのまま影響を受けない', d4['希望日③ STS 支店'] === 'ST');
}

// ---------------------------------------------------------------
section('44. ステータス連動の不具合修正（CR→CF・FNの支店側編集）とチャレンジ番号入力欄');
{
  const ctx = shopFixture();
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieToken = vie.session.token;

  // --- チャレンジ番号を店舗発の新規依頼に入力できる（英数字11桁固定） ---
  const created = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB', hope1: '2026-09-10', challengeNo: '0A2B3C4D5E6'
  });
  const kanri = created.kanriNo;
  check('店舗が入力したチャレンジ番号が保存される', ctx.apiGetReservationDetail(jpToken, kanri).detail['CHG NO'] === '0A2B3C4D5E6');

  // --- CR→CF（キャンセルチャージあり）でもJP側に反映される（従来はCWだけ反映されていた不具合） ---
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'STS JP': 'OK' });
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'STS JP': 'CR' });
  ctx.apiSaveFieldsQuiet(vieToken, kanri, { 'STS 支店': 'CF' });
  const afterCf = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('支店がCFで応答するとSTS(支店側)がCFになる', afterCf['STS 支店'] === 'CF');
  check('不具合修正：CFの応答もSTS(JP側)へ反映される（従来はCWだけ反映されていた）', afterCf['STS JP'] === 'CF');

  // --- FN確定後、現地側も自分のSTS(支店側)をFNにできる（従来はロックされて変更不可だった不具合） ---
  const created2 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'BL', groomName: 'B', brideLastName: 'BBL', brideName: 'BB', hope1: '2026-10-01', challengeNo: 'DUMMYCHG009' });
  // STS(JP側)がRQの間に支店がOKで回答（このAPI設計ではRQ→OKの自動連動は無いため、JP側も別途OKにする）
  ctx.apiSaveFieldsQuiet(vieToken, created2.kanriNo, { 'STS 支店': 'OK' });
  ctx.apiSaveFieldsQuiet(jpToken, created2.kanriNo, { 'STS JP': 'OK' });
  ctx.apiSaveFieldsQuiet(jpToken, created2.kanriNo, { 'STS JP': 'FN' });
  let err = null;
  try { ctx.apiSaveFieldsQuiet(vieToken, created2.kanriNo, { 'STS 支店': 'OK' }); } catch (e) { err = e.message; }
  check('STS(JP側)がFNのとき、支店側はFN以外には変更できない', err !== null, String(err));
  ctx.apiSaveFieldsQuiet(vieToken, created2.kanriNo, { 'STS 支店': 'FN' });
  check('不具合修正：STS(JP側)がFNのとき、現地側も自分のSTS(支店側)をFNにできる',
        ctx.apiGetReservationDetail(jpToken, created2.kanriNo).detail['STS 支店'] === 'FN');

  // --- ネームチェンジ機能廃止：専用ステータスは無く、日本側が新婦名欄を直接編集して送信するだけで
  //     「ネームチェンジ」の通知として現地に伝わる（店舗発ではない通常の案件でも同じ） ---
  const created3 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'CL', groomName: 'C', brideLastName: 'CBL', brideName: 'CB', hope1: '2026-11-01', challengeNo: 'DUMMYCHG010' });
  ctx.__mail.length = 0;
  ctx.apiCommitChanges(jpToken, created3.kanriNo, { '新婦名（ローマ字）': 'Renamed Bride' }, '');
  check('日本側が新婦名を変更して送信してもネームチェンジ通知になる',
        ctx.__mail.some(m => m.subj.includes('ネームチェンジ')));
  const afterNameChange = ctx.apiGetReservationDetail(jpToken, created3.kanriNo).detail;
  check('新婦名の変更自体は大文字化されて保存される', afterNameChange['新婦名（ローマ字）'] === 'RENAMED BRIDE');
}

// ---------------------------------------------------------------
section('45. 新郎名・新婦名を姓・名に分けて入力できる（全4項目必須・常に大文字で保存）');
{
  const ctx = shopFixture();
  const shopToken = ctx.apiLogin('SHOP1', 'sp').session.token;
  const jpToken = ctx.apiLogin('KANTO', 'pw').session.token;

  // --- 店舗発の新規依頼：姓・名を別々に受け取り、別の列に保存される（常に大文字化） ---
  const created = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', hope1: '2026-09-10', challengeNo: 'NAMESPLIT01',
    groomLastName: 'Yilmaz', groomName: 'Ahmet', brideLastName: 'Kaya', brideName: 'Elif'
  });
  const kanri = created.kanriNo;
  const detail = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('新郎姓が専用の列に大文字で保存される', detail['新郎姓（ローマ字）'] === 'YILMAZ');
  check('新郎名（=名のみ）が大文字で保存される', detail['新郎名（ローマ字）'] === 'AHMET');
  check('新婦姓が専用の列に大文字で保存される', detail['新婦姓（ローマ字）'] === 'KAYA');
  check('新婦名（=名のみ）が大文字で保存される', detail['新婦名（ローマ字）'] === 'ELIF');

  // --- 一覧・検索ではフルネーム（姓 名）として表示される ---
  const dash = ctx.apiGetDashboard(jpToken, { showAll: true });
  const row = dash.reservations.find(r => r.kanriNo === kanri);
  check('案件一覧にはフルネーム（姓 名）で表示される', row.groomName === 'YILMAZ AHMET' && row.brideName === 'KAYA ELIF', JSON.stringify(row));

  // --- 姓だけで検索してもヒットする（小文字で検索してもヒットする＝表記ゆれを吸収） ---
  const bySurname = ctx.apiSearchReservations(jpToken, { name: 'yilmaz' });
  check('姓（yilmaz）だけで検索してもヒットする', bySurname.results.some(r => r.kanriNo === kanri));
  const byGivenName = ctx.apiSearchReservations(jpToken, { name: 'ahmet' });
  check('名（ahmet）だけで検索してもヒットする', byGivenName.results.some(r => r.kanriNo === kanri));

  // --- 姓だけ変更しても「ネームチェンジ」の通知になる（変更後も大文字化される） ---
  ctx.__mail.length = 0;
  ctx.apiCommitChanges(jpToken, kanri, { '新郎姓（ローマ字）': 'Demir' }, '');
  check('姓だけの変更でも「ネームチェンジ」通知になる', ctx.__mail.some(m => m.subj.includes('ネームチェンジ')));
  check('姓の変更自体は大文字化されて保存される', ctx.apiGetReservationDetail(jpToken, kanri).detail['新郎姓（ローマ字）'] === 'DEMIR');

  // --- ★要件変更：新規予約の姓・名は全4項目とも必須（以前は姓が任意だったが必須化された） ---
  let err = null;
  try {
    ctx.apiShopCreateRequest(shopToken, {
      branchCode: 'VIE', team: '関東', hope1: '2026-09-11', challengeNo: 'NAMESPLIT02', groomName: 'NoSurname'
    });
  } catch (e) { err = e.message; }
  check('新郎姓が無いと作成できない（必須化）', err !== null, String(err));
  err = null;
  try {
    ctx.apiShopCreateRequest(shopToken, {
      branchCode: 'VIE', team: '関東', hope1: '2026-09-11', challengeNo: 'NAMESPLIT03',
      groomLastName: 'Suzuki', groomName: 'Ichiro'
    });
  } catch (e) { err = e.message; }
  check('新婦姓・新婦名が無いと作成できない（必須化）', err !== null, String(err));
}

// ---------------------------------------------------------------
section('46. プランごとの撮影場所方式・セールのプラン/支店紐付け');
{
  const ctx = featureFixture();
  // ★featureFixtureはプランマスタを作らない（従来ほとんどのテストがプランを自由文字列として
  // 扱っていたため）。この章の対象なので、実際の運用でsetupPortalが列を追加する動きと同じく、
  // ここでプランマスタの作成／セールマスタへの列追加をそれぞれ行う。
  ctx.ensureSheetWithHeaders_(ctx.__ss, 'プランマスタ', ctx.PLAN_MASTER_HEADERS);
  ctx.ensureSheetWithHeaders_(ctx.__ss, 'セールマスタ', ctx.SALE_MASTER_HEADERS);
  const jpToken = ctx.apiLogin('KANTO', 'pw').session.token;
  const vieToken = ctx.apiLogin('VIE', 'vp').session.token;
  const istToken = ctx.apiLogin('IST', 'ip').session.token;

  // --- プランごとの撮影場所方式（既定は自由入力） ---
  ctx.apiSavePlanItem(jpToken, 'VIE', 'ローマ3時間フォト', null, true, 'checkbox', 'コロッセオ、トレビの泉、スペイン広場');
  ctx.apiSavePlanItem(jpToken, 'VIE', 'フィレンツェフォト', null, true, 'select', 'ドゥオモ\nヴェッキオ橋');
  ctx.apiSavePlanItem(jpToken, 'VIE', 'シンプルプラン', null, true); // 方式省略＝自由入力のまま
  const plans = ctx.apiListPlans(vieToken, 'VIE');
  const p1 = plans.find(p => p.name === 'ローマ3時間フォト');
  const p2 = plans.find(p => p.name === 'フィレンツェフォト');
  const p3 = plans.find(p => p.name === 'シンプルプラン');
  check('チェックボックス方式・候補が保存される', p1.locationMode === 'checkbox' && JSON.stringify(p1.locationCandidates) === JSON.stringify(['コロッセオ', 'トレビの泉', 'スペイン広場']), JSON.stringify(p1));
  check('プルダウン方式・候補（改行区切り）が保存される', p2.locationMode === 'select' && JSON.stringify(p2.locationCandidates) === JSON.stringify(['ドゥオモ', 'ヴェッキオ橋']), JSON.stringify(p2));
  check('方式を指定しなければ自由入力（free）のまま', p3.locationMode === 'free' && p3.locationCandidates.length === 0, JSON.stringify(p3));

  // 更新（同じ名称で再保存すると上書きされる。行が増えない）
  ctx.apiSavePlanItem(jpToken, 'VIE', 'ローマ3時間フォト', null, true, 'select', 'コロッセオ');
  const plansAfterUpdate = ctx.apiListPlans(vieToken, 'VIE');
  check('同名で再保存すると内容が更新される（行が増えない）',
        plansAfterUpdate.filter(p => p.name === 'ローマ3時間フォト').length === 1 &&
        plansAfterUpdate.find(p => p.name === 'ローマ3時間フォト').locationMode === 'select');

  // --- セールのプラン/支店紐付け ---
  ctx.apiSaveSaleItem(jpToken, 'VIE', '春の全プラン共通セール', null, true); // 対象プラン省略＝全プラン共通
  ctx.apiSaveSaleItem(jpToken, 'VIE', 'ローマ限定セール', null, true, 'ローマ3時間フォト');
  ctx.apiSaveSaleItem(jpToken, 'ALL', '全社共通セール', null, true);

  const salesForRoma = ctx.apiListSales(vieToken, 'VIE', 'ローマ3時間フォト');
  check('対象プラン一致＋全プラン共通＋全社共通の3件が出る（ローマ3時間フォト選択時）',
        salesForRoma.some(s => s.name === '春の全プラン共通セール') &&
        salesForRoma.some(s => s.name === 'ローマ限定セール') &&
        salesForRoma.some(s => s.name === '全社共通セール'), JSON.stringify(salesForRoma));

  const salesForOther = ctx.apiListSales(vieToken, 'VIE', 'フィレンツェフォト');
  check('対象プラン不一致のセールは出ない（フィレンツェフォト選択時はローマ限定セールが出ない）',
        !salesForOther.some(s => s.name === 'ローマ限定セール') &&
        salesForOther.some(s => s.name === '春の全プラン共通セール') &&
        salesForOther.some(s => s.name === '全社共通セール'), JSON.stringify(salesForOther));

  const salesNoPlan = ctx.apiListSales(vieToken, 'VIE');
  check('プラン未指定で呼ぶと従来どおり支店内の全件が返る（新規依頼フォームの支店切替直後用）',
        salesNoPlan.length === 3);

  const salesForIst = ctx.apiListSales(istToken, 'IST', 'ローマ3時間フォト');
  check('他支店ではALL共通セールだけが見える（支店限定のセールは見えない）',
        !salesForIst.some(s => s.name === 'ローマ限定セール') &&
        !salesForIst.some(s => s.name === '春の全プラン共通セール') &&
        salesForIst.some(s => s.name === '全社共通セール'), JSON.stringify(salesForIst));

  let err = null;
  try { ctx.apiSaveSaleItem(vieToken, 'ALL', '支店から全社共通は登録できないはず', null, true); } catch (e) { err = e.message; }
  check('全支店共通（ALL）のセール登録は支店ロールではできない（JPのみ）', err !== null, String(err));
}

// ---------------------------------------------------------------
section('47. 撮影データ納品（現地支店がURL登録・ファイルアップロード・削除できる）');
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-960', '管轄': '関東', '新郎名（ローマ字）': 'Delivery' });
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpTok = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieTok = vie.session.token;

  // --- URLでの登録 ---
  let err = null;
  try { ctx.apiSetDeliveryDataUrl(jpTok, 'VIE-960', 'https://drive.google.com/x'); } catch (e) { err = e.message; }
  check('日本側（JP）は撮影データ納品URLを登録できない（現地支店ロール専用）', err !== null, String(err));

  ctx.apiSetDeliveryDataUrl(vieTok, 'VIE-960', 'https://drive.google.com/final-data');
  const afterUrl = ctx.apiGetReservationDetail(jpTok, 'VIE-960').detail;
  check('現地支店が撮影データ納品URLを登録できる', afterUrl['撮影データ納品URL'] === 'https://drive.google.com/final-data');
  check('登録すると既定の手配課へ自動で通知される（メール）',
        ctx.__mail.some(m => m.to.includes('kanto@his-world.com') && m.body.includes('final-data')));
  check('登録すると履歴にも残る',
        afterUrl.history.some(h => h.body.includes('撮影データ納品URLを登録') && h.body.includes('final-data')));

  err = null;
  try { ctx.apiSetDeliveryDataUrl(vieTok, 'VIE-960', 'ftp://not-http'); } catch (e) { err = e.message; }
  check('httpで始まらないURLは登録できない', err !== null, String(err));

  // --- 取消（空文字で登録するとクリアされる） ---
  ctx.apiSetDeliveryDataUrl(vieTok, 'VIE-960', '');
  const afterClear = ctx.apiGetReservationDetail(jpTok, 'VIE-960').detail;
  check('URLを取消すると空になる', afterClear['撮影データ納品URL'] === '');
  check('取消も履歴に残る（自動通知）',
        afterClear.history.some(h => h.body.includes('撮影データ納品URLを取消しました')));

  // --- ファイルアップロード ---
  const up = ctx.apiBranchUploadDeliveryData(vieTok, 'VIE-960', 'final.zip', 'application/zip', Buffer.from('data').toString('base64'));
  check('現地支店がファイルをアップロードできる', !!up.fileUrl);
  err = null;
  try { ctx.apiBranchUploadDeliveryData(jpTok, 'VIE-960', 'x.zip', 'application/zip', Buffer.from('x').toString('base64')); } catch (e) { err = e.message; }
  check('日本側（JP）はファイルアップロードできない（現地支店ロール専用）', err !== null, String(err));

  const listed = ctx.apiListDeliveryData(jpTok, 'VIE-960');
  check('アップロードしたファイルが一覧で見える（日本側からも）',
        listed.files.some(f => f.name === 'final.zip'), JSON.stringify(listed.files));
  const listedByShop = ctx.apiListDeliveryData(vieTok, 'VIE-960');
  check('現地支店側からも一覧が見える', listedByShop.files.some(f => f.name === 'final.zip'));

  // --- 削除（取消） ---
  err = null;
  try { ctx.apiBranchDeleteDeliveryData(jpTok, 'VIE-960', listed.files[0].url); } catch (e) { err = e.message; }
  check('日本側（JP）はファイルを削除できない（現地支店ロール専用）', err !== null, String(err));

  ctx.apiBranchDeleteDeliveryData(vieTok, 'VIE-960', listed.files[0].url);
  const afterDelete = ctx.apiListDeliveryData(jpTok, 'VIE-960');
  check('現地支店はアップロード済みのファイルを削除（取消）できる',
        !afterDelete.files.some(f => f.name === 'final.zip'), JSON.stringify(afterDelete.files));

  // --- 他支店からは操作できない ---
  const other = ctx.apiLogin('IST', 'ip');
  err = null;
  try { ctx.apiSetDeliveryDataUrl(other.session.token, 'VIE-960', 'https://drive.google.com/侵入'); } catch (e) { err = e.message; }
  check('他の現地支店はよその案件の撮影データ納品URLを登録できない', err !== null, String(err));
}

// ---------------------------------------------------------------
section('48. オプション枠を5件から10件に拡張（自由入力・OP6〜OP10も通常どおり操作できる）');
{
  const ctx = featureFixture();
  addBranchRow(ctx, { '支店コード': 'SHOP1', '支店名': '新宿店', 'ロール': 'SHOP', 'ログインパスコード': 'sp', '通知先メール': 'shop1@example.com', '有効': true });
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpTok = jp.session.token;
  const shopTok = ctx.apiLogin('SHOP1', 'sp').session.token;

  // --- 新規依頼フォームで10件目（option10）まで指定できる ---
  const payload = { branchCode: 'VIE', team: '関東', groomLastName: 'Ten', groomName: 'Options', brideLastName: 'Ten', brideName: 'OptionsB',
    hope1: '2026-09-01', challengeNo: 'TENOPTION01' };
  for (let n = 1; n <= 10; n++) payload['option' + n] = `オプション${n}番`;
  const created = ctx.apiShopCreateRequest(shopTok, payload);
  const detail = ctx.apiGetReservationDetail(jpTok, created.kanriNo).detail;
  check('1件目のオプションが保存される', detail['OP1'] === 'オプション1番');
  check('10件目（OP10）のオプションも保存される（従来は5件までだった）', detail['OP10'] === 'オプション10番');

  // --- 既存案件でもOP6〜OP10のSTS(JP側)を通常どおり操作できる ---
  check('OP6のSTS(JP側)は未設定から始まる', !detail['OP6 STS JP']);
  ctx.apiSaveFieldsQuiet(jpTok, created.kanriNo, { 'OP6 STS JP': 'OK' });
  const afterOp6 = ctx.apiGetReservationDetail(jpTok, created.kanriNo).detail;
  check('日本側はOP6のSTS(JP側)を通常どおり設定できる', afterOp6['OP6 STS JP'] === 'OK');

  let err = null;
  try { ctx.apiSaveFieldsQuiet(shopTok, created.kanriNo, { 'OP10 STS JP': 'CR', 'キャンセル理由': 'テスト理由' }); } catch (e) { err = e.message; }
  check('店舗もOP10のSTS(JP側)を通常どおり変更できる（CRの制限も同じロジックが働く）', err === null, String(err));
  const afterOp10 = ctx.apiGetReservationDetail(jpTok, created.kanriNo).detail;
  check('OP10のSTS(JP側)がCRになる', afterOp10['OP10 STS JP'] === 'CR');

  // --- オプション名は自由入力（マスタに無い名前も保存できる） ---
  check('オプション名はマスタに無い名称も保存できる（フリー入力）', afterOp10['OP1'] === 'オプション1番');
}

// ---------------------------------------------------------------
section('49. お客様提供画像・指示書の一括アップロード（複数個別・ZIPまとめ）');
{
  const ctx = shopFixture();
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const shop2 = ctx.apiLogin('SHOP2', 'sp2');
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;

  const created = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomLastName: 'AL', groomName: 'A', brideLastName: 'ABL', brideName: 'AB', hope1: '2026-09-10', challengeNo: 'DUMMYCHG008' });
  const kanri = created.kanriNo;
  const b64 = Buffer.from('dummy-image-bytes').toString('base64');

  // --- 複数を個別ファイルとしてまとめてアップロード（apiShopUploadDocumentsBatch） ---
  let err = null;
  try { ctx.apiShopUploadDocumentsBatch(shopToken, kanri, []); } catch (e) { err = e.message; }
  check('空の配列では一括アップロードできない', err !== null, String(err));

  err = null;
  try {
    ctx.apiShopUploadDocumentsBatch(shopToken, kanri, [
      { docType: '存在しない種別', filename: 'a.jpg', mimeType: 'image/jpeg', base64Data: b64 }
    ]);
  } catch (e) { err = e.message; }
  check('一括アップロードでも未定義の書類種別は拒否される', err !== null, String(err));

  const batch1 = ctx.apiShopUploadDocumentsBatch(shopToken, kanri, [
    { docType: 'ヘアメイク画像', filename: 'hairB.jpg', mimeType: 'image/jpeg', base64Data: b64 },
    { docType: '衣裳画像', filename: 'dressB.jpg', mimeType: 'image/jpeg', base64Data: b64 },
    { docType: '撮影指示書', filename: 'shootB.pdf', mimeType: 'application/pdf', base64Data: b64 }
  ]);
  check('複数の書類種別を1回の呼び出しでまとめてアップロードできる',
        batch1.ok === true && batch1.files.length === 3, JSON.stringify(batch1));

  const afterBatch = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('やり取り履歴は1件にまとまる（種別ごとに別々の履歴にはならない）',
        afterBatch.history.filter(h => h.body.includes('まとめて')).length === 1);
  check('まとめた履歴の中に3件それぞれの種別・ファイル名が含まれる',
        afterBatch.history.some(h => h.body.includes('ヘアメイク画像: hairB.jpg') && h.body.includes('衣裳画像: dressB.jpg') && h.body.includes('撮影指示書: shootB.pdf')));

  const listAfterBatch = ctx.apiListShopUploadedDocuments(jpToken, kanri);
  check('一括アップロードした分もそれぞれの書類種別フォルダに入る',
        listAfterBatch.folders.find(f => f.docType === 'ヘアメイク画像').files.some(f => f.name === 'hairB.jpg') &&
        listAfterBatch.folders.find(f => f.docType === '衣裳画像').files.some(f => f.name === 'dressB.jpg') &&
        listAfterBatch.folders.find(f => f.docType === '撮影指示書').files.some(f => f.name === 'shootB.pdf'));

  err = null;
  try { ctx.apiShopUploadDocumentsBatch(shop2.session.token, kanri, [{ docType: 'ヘアメイク画像', filename: 'x.jpg', mimeType: 'image/jpeg', base64Data: b64 }]); } catch (e) { err = e.message; }
  check('他の店舗は他の案件へ一括アップロードできない', err !== null, String(err));

  // --- 複数種別をチェックしてZIP1ファイルでまとめてアップロード（apiShopUploadDocumentZip） ---
  err = null;
  try { ctx.apiShopUploadDocumentZip(shopToken, kanri, [], 'all.zip', 'application/zip', b64); } catch (e) { err = e.message; }
  check('対象の書類種別が1つも無いとZIPアップロードできない', err !== null, String(err));

  err = null;
  try { ctx.apiShopUploadDocumentZip(shopToken, kanri, ['存在しない種別'], 'all.zip', 'application/zip', b64); } catch (e) { err = e.message; }
  check('ZIPアップロードでも未定義の書類種別は拒否される', err !== null, String(err));

  const zip1 = ctx.apiShopUploadDocumentZip(shopToken, kanri, ['ヘアメイク画像', '衣裳画像'], 'まとめ1.zip', 'application/zip', b64);
  check('ZIPで複数種別をまとめてアップロードできる', zip1.ok === true && !!zip1.fileUrl, JSON.stringify(zip1));

  const afterZip = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('ZIPアップロードも履歴に対象の種別・ファイル名付きで1件記録される',
        afterZip.history.some(h => h.body.includes('まとめてZIP') && h.body.includes('ヘアメイク画像、衣裳画像') && h.body.includes('まとめ1.zip')));

  const listAfterZip = ctx.apiListShopUploadedDocuments(jpToken, kanri);
  const zipFolder = listAfterZip.folders.find(f => f.docType === 'まとめてアップロード（ZIP）');
  check('一覧にZIP専用のフォルダが追加される', !!zipFolder, JSON.stringify(listAfterZip.folders.map(f => f.docType)));
  check('ZIPファイルが1件入っている', zipFolder && zipFolder.files.length === 1);
  check('ZIPファイルの対象種別（coveredTypes）が読み戻せる',
        zipFolder && zipFolder.files[0].coveredTypes === 'ヘアメイク画像、衣裳画像', zipFolder && JSON.stringify(zipFolder.files[0]));
  check('個別種別フォルダ（ヘアメイク画像・衣裳画像）にはZIPファイルは入らない',
        !listAfterZip.folders.find(f => f.docType === 'ヘアメイク画像').files.some(f => f.name === 'まとめ1.zip'));

  // --- ZIPファイルも既存の削除APIでゴミ箱行きにできる ---
  const delZip = ctx.apiShopDeleteUploadedDocument(shopToken, kanri, zipFolder.files[0].url);
  check('ZIPファイルも既存の削除APIで削除（ゴミ箱行き）できる', delZip.ok === true);
  const listAfterZipDelete = ctx.apiListShopUploadedDocuments(jpToken, kanri);
  check('削除後は一覧のZIPフォルダが空になる',
        listAfterZipDelete.folders.find(f => f.docType === 'まとめてアップロード（ZIP）').files.length === 0);

  err = null;
  try { ctx.apiShopUploadDocumentZip(shop2.session.token, kanri, ['ヘアメイク画像'], 'x.zip', 'application/zip', b64); } catch (e) { err = e.message; }
  check('他の店舗は他の案件へZIPアップロードできない', err !== null, String(err));
}

// ---------------------------------------------------------------
section('50. 希望日の時間帯(AM/PM)・複数プラン希望・お客様情報の追加項目・チェックリスト追加');
{
  const ctx = shopFixture();
  // ★featureFixtureは衣装会社マスタを作らない（33章参照の考え方と同じ）。setupPortal自身の
  // シード内容の検証は24章で別途行っているため、ここでは機能テスト用に自前で用意する。
  ctx.ensureSheetWithHeaders_(ctx.__ss, '衣装会社マスタ', ctx.COSTUME_MASTER_HEADERS);
  const costumeSheetForTest = ctx.__ss.getSheetByName('衣装会社マスタ');
  ['ブライダルハウスTUTU', 'フォーシスアンドカンパニー', 'クチュールナオコ', 'ワタベウェディング', 'デスティニーライン']
    .forEach(name => costumeSheetForTest.appendRow(['ALL', name, true]));

  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieToken = vie.session.token;

  // --- 希望日の時間帯（AM/PM）：支店マスタの「希望日時間帯表示」で表示を制御 ---
  const created = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'EL', groomName: 'E', brideLastName: 'EBL', brideName: 'EB',
    hope1: '2026-11-01', hope2: '2026-11-02', hope3: '2026-11-03', challengeNo: 'DUMMYCHG050'
  });
  const kanri = created.kanriNo;

  let d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('既定では希望日時間帯表示フラグはOFF', d.showHopeTime === false);
  setBranchField(ctx, 'VIE', '希望日時間帯表示', true);
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('支店マスタでONにすると希望日時間帯表示フラグがtrueで返る', d.showHopeTime === true);
  const dShop = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('店舗向けの詳細でも同じフラグが返る', dShop.showHopeTime === true);

  ctx.apiSaveFieldsQuiet(jpToken, kanri, { '希望日①時間帯': 'AM' });
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { '希望日②時間帯': 'PM' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('日本側が設定した時間帯が保存される', d['希望日①時間帯'] === 'AM');
  check('店舗が設定した時間帯も保存される', d['希望日②時間帯'] === 'PM');

  // --- プランを複数希望できる（希望日ごとにプラン欄）。確定した希望日のプランが
  //     案件全体のプラン名欄へ自動反映される（撮影日FIXと同じ考え方） ---
  ctx.apiSaveFieldsQuiet(jpToken, kanri, {
    '希望日①プラン': 'ローマ3時間フォト', '希望日②プラン': 'フィレンツェフォト'
    // 希望日③プランは空欄のまま（従来どおりの使い方も引き続きできることの確認用）
  });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('希望日①のプランが保存される', d['希望日①プラン'] === 'ローマ3時間フォト');
  check('希望日②のプランも保存される', d['希望日②プラン'] === 'フィレンツェフォト');
  check('プラン未指定の希望日③はプラン欄が空欄のまま', !d['希望日③プラン']);
  check('この時点では案件全体のプラン名はまだ変わらない', !d['プラン名']);

  // 希望日②が現地で取れた（第一希望ではなく第二希望が確定するケース）
  ctx.apiSaveFieldsQuiet(vieToken, kanri, { '希望日② STS 支店': 'OK' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('希望日②のSTS(支店側)がOKになる', d['希望日② STS 支店'] === 'OK');
  check('撮影日FIXには希望日②の日付が反映される（従来どおり）', d['撮影日FIX'] === '2026-11-02', d['撮影日FIX']);
  check('確定した希望日②のプランが、案件全体のプラン名欄へ自動反映される',
        d['プラン名'] === 'フィレンツェフォト', d['プラン名']);
  check('確定しなかった希望日①のプラン欄はそのまま残る（上書きされない）',
        d['希望日①プラン'] === 'ローマ3時間フォト');

  // プラン未指定の希望日が確定しても、案件全体のプラン名は上書きされない（空欄で潰さない）
  const created2 = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'FL', groomName: 'F', brideLastName: 'FBL', brideName: 'FB',
    hope1: '2026-11-10', challengeNo: 'DUMMYCHG051'
  });
  ctx.apiSaveFieldsQuiet(jpToken, created2.kanriNo, { 'プラン名': '既存プラン' });
  ctx.apiSaveFieldsQuiet(vieToken, created2.kanriNo, { '希望日① STS 支店': 'OK' });
  const d2 = ctx.apiGetReservationDetail(jpToken, created2.kanriNo).detail;
  check('希望日にプラン指定が無ければ、確定してもプラン名は上書きされない（既存の値のまま）',
        d2['プラン名'] === '既存プラン', d2['プラン名']);

  // --- 衣装会社（マスタから選択） ---
  const costumeList = ctx.apiListCostumeCompanies(jpToken);
  ['ブライダルハウスTUTU', 'フォーシスアンドカンパニー', 'クチュールナオコ', 'ワタベウェディング', 'デスティニーライン']
    .forEach(name => check(`衣装会社マスタに「${name}」があらかじめ登録されている`,
          costumeList.some(c => c.name === name), JSON.stringify(costumeList.map(c => c.name))));

  let err = null;
  try { ctx.apiSaveCostumeCompanyItem(shopToken, '侵入会社', null, true); } catch (e) { err = e.message; }
  check('衣装会社マスタの登録は店舗ロールではできない（全社共通のためJPのみ）', err !== null, String(err));
  err = null;
  try { ctx.apiSaveCostumeCompanyItem(vieToken, '侵入会社', null, true); } catch (e) { err = e.message; }
  check('衣装会社マスタの登録は支店ロールでもできない（JPのみ）', err !== null, String(err));

  ctx.apiSaveCostumeCompanyItem(jpToken, 'テスト衣装会社', null, true);
  const costumeListAfter = ctx.apiListCostumeCompanies(shopToken);
  check('JPが追加した衣装会社が一覧に反映される（店舗からも見える）',
        costumeListAfter.some(c => c.name === 'テスト衣装会社'));

  ctx.apiSaveFieldsQuiet(jpToken, kanri, { '衣装会社': 'ワタベウェディング' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('案件へ衣装会社を保存できる', d['衣装会社'] === 'ワタベウェディング');
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { '衣装会社': 'クチュールナオコ' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('店舗からも衣装会社を変更できる', d['衣装会社'] === 'クチュールナオコ');

  // --- 同行者の有無 ---
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { '同行者の有無': '有' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('同行者の有無を保存できる（日本側）', d['同行者の有無'] === '有');
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { '同行者の有無': '無' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('同行者の有無を保存できる（店舗）', d['同行者の有無'] === '無');

  // --- チェックイン日・チェックアウト日 ---
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'チェックイン日': '2026-11-01', 'チェックアウト日': '2026-11-04' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('チェックイン日が保存される（日付として読み戻せる）', d['チェックイン日'] === '2026-11-01', d['チェックイン日']);
  check('チェックアウト日が保存される', d['チェックアウト日'] === '2026-11-04', d['チェックアウト日']);
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'チェックイン日': '2026-11-02' });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('店舗からもチェックイン日を変更できる', d['チェックイン日'] === '2026-11-02');

  // --- 必要書類チェックリストに「ヘアメイクアンケート」を追加 ---
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('必要書類チェックリストに「ヘアメイクアンケート」が含まれる',
        d.checklist.some(c => c.item === 'ヘアメイクアンケート' && c.checked === false),
        JSON.stringify(d.checklist));
  ctx.apiSaveFieldsQuiet(shopToken, kanri, { '必要書類チェック:ヘアメイクアンケート': true });
  d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('ヘアメイクアンケートにチェックを入れて保存できる',
        d.checklist.find(c => c.item === 'ヘアメイクアンケート').checked === true);
}

// ---------------------------------------------------------------
section('51. 新規依頼フォームの拡張：AM/PM・複数プラン希望・備考欄を作成時から保存、パスポート番号は不要');
{
  const ctx = shopFixture();
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopToken = shop.session.token;
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;

  // --- パスポート番号を渡さずに作成できる（新規依頼フォームからは廃止。既存案件では引き続き編集可） ---
  const created = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Gl', groomName: 'G', brideLastName: 'Gbl', brideName: 'Gb',
    hope1: '2026-12-01', hopeTime1: 'AM', hopePlan1: 'プランA',
    hope2: '2026-12-02', hopeTime2: 'PM', hopePlan2: 'プランB',
    remarks: '雨天時は屋内スタジオへ変更希望', challengeNo: 'DUMMYCHG052'
  });
  const kanri = created.kanriNo;
  const d = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('パスポート番号を渡さなくても作成できる', created.ok === true && !!kanri);
  check('パスポート番号は空欄のまま', !d['パスポート番号']);
  check('備考が保存される', d['備考'] === '雨天時は屋内スタジオへ変更希望');
  check('初回メッセージに備考の内容が含まれる',
        d.history.some(h => h.body.includes('【備考】') && h.body.includes('雨天時は屋内スタジオへ変更希望')));
  check('希望日①の時間帯が保存される', d['希望日①時間帯'] === 'AM');
  check('希望日①のプランが保存される', d['希望日①プラン'] === 'プランA');
  check('希望日②の時間帯が保存される', d['希望日②時間帯'] === 'PM');
  check('希望日②のプランが保存される', d['希望日②プラン'] === 'プランB');

  // --- 不正な時間帯は無視される（AM/PM以外は保存しない） ---
  const created2 = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Hl', groomName: 'H', brideLastName: 'Hbl', brideName: 'Hb',
    hope1: '2026-12-10', hopeTime1: '侵入値', challengeNo: 'DUMMYCHG053'
  });
  const d2 = ctx.apiGetReservationDetail(jpToken, created2.kanriNo).detail;
  check('AM/PM以外の時間帯は保存されない（空欄になる）', !d2['希望日①時間帯']);

  // --- 備考・希望日プランを省略しても従来どおり作成できる（後方互換） ---
  const created3 = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Il', groomName: 'I', brideLastName: 'Ibl', brideName: 'Ib',
    hope1: '2026-12-15', challengeNo: 'DUMMYCHG054'
  });
  check('備考・希望日プランを省略しても作成できる', created3.ok === true);
}

// ---------------------------------------------------------------
section('52. お客様情報の追加項目（同行者人数・フライトOUT）・撮影日(挙式日)FIXの自動ミラー');
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-970', '管轄': '関東' });
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const shop = jp; // 同行者人数はJP/BRANCH/SHOPいずれからも編集できる項目のためJPで代表確認する

  // --- 同行者（大人・子供・幼児）の人数 ---
  ctx.apiSaveFieldsQuiet(jpToken, 'VIE-970', {
    '同行者の有無': '有', '同行者（大人）': 2, '同行者（子供）': 1, '同行者（幼児）': 1
  });
  let d = ctx.apiGetReservationDetail(jpToken, 'VIE-970').detail;
  check('同行者（大人）の人数が保存される', String(d['同行者（大人）']) === '2', d['同行者（大人）']);
  check('同行者（子供）の人数が保存される', String(d['同行者（子供）']) === '1', d['同行者（子供）']);
  check('同行者（幼児）の人数が保存される', String(d['同行者（幼児）']) === '1', d['同行者（幼児）']);

  // --- フライト情報（IN／OUT） ---
  ctx.apiSaveFieldsQuiet(jpToken, 'VIE-970', {
    'フライト情報': 'JL123 12/1 10:00羽田発', 'フライト情報（OUT）': 'JL124 12/5 16:00現地発'
  });
  d = ctx.apiGetReservationDetail(jpToken, 'VIE-970').detail;
  check('フライト情報（IN）が保存される', d['フライト情報'] === 'JL123 12/1 10:00羽田発');
  check('フライト情報（OUT）が保存される', d['フライト情報（OUT）'] === 'JL124 12/5 16:00現地発');

  // --- 撮影日FIXを設定すると挙式日FIXへ自動でミラーされる ---
  ctx.apiSaveFieldsQuiet(jpToken, 'VIE-970', { '撮影日FIX': '2026-12-20' });
  d = ctx.apiGetReservationDetail(jpToken, 'VIE-970').detail;
  check('撮影日FIXを設定すると挙式日FIXにも同じ日付が入る',
        d['撮影日FIX'] === '2026-12-20' && d['挙式日FIX'] === '2026-12-20',
        JSON.stringify({ c: d['撮影日FIX'], w: d['挙式日FIX'] }));

  // 挙式日FIXが同じ変更セットで明示的に指定された場合は、そちらを優先する（上書きしない）
  ctx.apiSaveFieldsQuiet(jpToken, 'VIE-970', { '撮影日FIX': '2026-12-25', '挙式日FIX': '2026-12-24' });
  d = ctx.apiGetReservationDetail(jpToken, 'VIE-970').detail;
  check('挙式日FIXが明示的に指定されていればミラーで上書きしない',
        d['撮影日FIX'] === '2026-12-25' && d['挙式日FIX'] === '2026-12-24',
        JSON.stringify({ c: d['撮影日FIX'], w: d['挙式日FIX'] }));

  // apiCommitChangesでも同様にミラーされる
  ctx.apiCommitChanges(jpToken, 'VIE-970', { '撮影日FIX': '2027-01-10' }, '');
  d = ctx.apiGetReservationDetail(jpToken, 'VIE-970').detail;
  check('apiCommitChangesでも撮影日FIXの変更が挙式日FIXへミラーされる',
        d['撮影日FIX'] === '2027-01-10' && d['挙式日FIX'] === '2027-01-10');
}

// ---------------------------------------------------------------
section('53. メッセージは、相手がまだ見ていない間だけ送信者が削除できる（apiDeleteHistoryMessage）');
{
  const ctx = shopFixture();
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-980', '管轄': '関東' });
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;
  const vie = ctx.apiLogin('VIE', 'vp');
  const vieToken = vie.session.token;

  // --- 送信直後・相手が未読の間は送信者本人が削除できる ---
  ctx.apiCommitChanges(jpToken, 'VIE-980', {}, '削除できるはずの未読メッセージ');
  let hist = ctx.apiGetReservationDetail(jpToken, 'VIE-980').detail.history;
  let target = hist.find(h => h.body.includes('削除できるはずの未読メッセージ'));
  check('送信直後は自分が送ったメッセージにdeletable=trueが付く', target.deletable === true, JSON.stringify(target));
  check('相手（支店）から見ても未読の間はdeletable情報が別に持てる（自分が送ったものではないのでfalse）',
        ctx.apiGetReservationDetail(vieToken, 'VIE-980').detail.history
          .find(h => h.body.includes('削除できるはずの未読メッセージ')).deletable === false);

  ctx.apiDeleteHistoryMessage(jpToken, target.id);
  hist = ctx.apiGetReservationDetail(jpToken, 'VIE-980').detail.history;
  check('削除すると履歴から消える', !hist.some(h => h.body.includes('削除できるはずの未読メッセージ')));

  // --- 相手が既読にした後は削除できない ---
  ctx.apiCommitChanges(jpToken, 'VIE-980', {}, '既読後は削除できないメッセージ');
  hist = ctx.apiGetReservationDetail(jpToken, 'VIE-980').detail.history;
  target = hist.find(h => h.body.includes('既読後は削除できないメッセージ'));
  ctx.apiToggleHistoryCheck(vieToken, target.id, true);
  let err = null;
  try { ctx.apiDeleteHistoryMessage(jpToken, target.id); } catch (e) { err = e.message; }
  check('相手が既読にした後は削除できない', err !== null, String(err));
  hist = ctx.apiGetReservationDetail(jpToken, 'VIE-980').detail.history;
  check('削除に失敗したメッセージは履歴に残っている', hist.some(h => h.body.includes('既読後は削除できないメッセージ')));

  // --- 自分が送信したメッセージ以外は削除できない ---
  ctx.apiCommitChanges(vieToken, 'VIE-980', {}, '支店が送ったメッセージ');
  hist = ctx.apiGetReservationDetail(jpToken, 'VIE-980').detail.history;
  target = hist.find(h => h.body.includes('支店が送ったメッセージ'));
  err = null;
  try { ctx.apiDeleteHistoryMessage(jpToken, target.id); } catch (e) { err = e.message; }
  check('自分が送信したメッセージ以外は削除できない（送信者が別ロール）', err !== null, String(err));

  // --- 他支店の職員は操作できない ---
  const ist = ctx.apiLogin('IST', 'ip');
  ctx.apiCommitChanges(vieToken, 'VIE-980', {}, '支店発・他支店からの削除試験用');
  hist = ctx.apiGetReservationDetail(jpToken, 'VIE-980').detail.history;
  target = hist.find(h => h.body.includes('支店発・他支店からの削除試験用'));
  err = null;
  try { ctx.apiDeleteHistoryMessage(ist.session.token, target.id); } catch (e) { err = e.message; }
  check('他支店はよその案件のメッセージを削除できない', err !== null, String(err));

  // --- 存在しない履歴IDはエラーになる ---
  err = null;
  try { ctx.apiDeleteHistoryMessage(jpToken, 'no-such-id'); } catch (e) { err = e.message; }
  check('存在しない履歴IDはエラーになる', err !== null, String(err));

  // --- 店舗が起票した案件でも、店舗自身が送ったメッセージは未読の間だけ削除できる ---
  const shop = ctx.apiLogin('SHOP1', 'sp');
  const shopCase = ctx.apiShopCreateRequest(shop.session.token, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Jl', groomName: 'J', brideLastName: 'Jbl', brideName: 'Jb',
    challengeNo: 'DUMMYCHG055', hope1: '2026-12-01'
  });
  ctx.apiCommitChanges(shop.session.token, shopCase.kanriNo, {}, '店舗からの未読メッセージ');
  hist = ctx.apiGetReservationDetail(shop.session.token, shopCase.kanriNo).detail.history;
  target = hist.find(h => h.body.includes('店舗からの未読メッセージ'));
  check('店舗が送ったメッセージにもdeletable=trueが付く（起票元店舗の案件）', target.deletable === true);
  ctx.apiDeleteHistoryMessage(shop.session.token, target.id);
  hist = ctx.apiGetReservationDetail(shop.session.token, shopCase.kanriNo).detail.history;
  check('店舗も自分が送った未読メッセージを削除できる', !hist.some(h => h.body.includes('店舗からの未読メッセージ')));
}

// ---------------------------------------------------------------
section('54. 希望日ごとの場所・国をまたいだプラン希望（apiListAllActivePlans）');
{
  const ctx = featureFixture();
  ctx.ensureSheetWithHeaders_(ctx.__ss, 'プランマスタ', ctx.PLAN_MASTER_HEADERS);
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-990', '管轄': '関東' });
  const jp = ctx.apiLogin('KANTO', 'pw');
  const jpToken = jp.session.token;

  // プランマスタに複数支店（複数国）のプランを用意する
  const pm = ctx.__ss.getSheetByName('プランマスタ');
  pm.appendRow(['VIE', 'ウィーン半日プラン', true]);
  pm.appendRow(['IST', 'カッパドキアサンライズ', true]);
  pm.appendRow(['IST', '無効プラン', false]); // 無効なプランは候補に出ない

  // --- 希望日ごとの「場所」を自由入力で保存できる ---
  ctx.apiSaveFieldsQuiet(jpToken, 'VIE-990', {
    '希望日①場所': 'ウィーン', '希望日②場所': 'カッパドキア'
  });
  let d = ctx.apiGetReservationDetail(jpToken, 'VIE-990').detail;
  check('希望日①の場所が保存される', d['希望日①場所'] === 'ウィーン');
  check('希望日②の場所が保存される', d['希望日②場所'] === 'カッパドキア');

  // --- 希望日ごとのプランは、案件自体の支店（VIE）以外のプランも保存できる
  //     （第一希望はウィーンのプラン、第二希望はイスタンブールのプラン、といった国をまたいだ希望） ---
  ctx.apiSaveFieldsQuiet(jpToken, 'VIE-990', {
    '希望日①プラン': 'ウィーン半日プラン', '希望日②プラン': 'カッパドキアサンライズ'
  });
  d = ctx.apiGetReservationDetail(jpToken, 'VIE-990').detail;
  check('希望日①のプラン（自支店＝ウィーン）が保存される', d['希望日①プラン'] === 'ウィーン半日プラン');
  check('希望日②のプラン（他支店＝イスタンブール）も保存できる（国をまたいだプラン希望）',
        d['希望日②プラン'] === 'カッパドキアサンライズ');

  // --- apiListAllActivePlans は全支店の有効なプランを横断して返す ---
  const allPlans = ctx.apiListAllActivePlans(jpToken);
  check('全支店横断でプランを取得できる', Array.isArray(allPlans) && allPlans.length > 0);
  check('ウィーン支店のプランが含まれる（都市名つき）',
        allPlans.some(p => p.branchCode === 'VIE' && p.name === 'ウィーン半日プラン' && !!p.city),
        JSON.stringify(allPlans));
  check('イスタンブール支店のプランも含まれる（他支店のプランも横断して見える）',
        allPlans.some(p => p.branchCode === 'IST' && p.name === 'カッパドキアサンライズ'));
  check('無効化されたプランは含まれない', !allPlans.some(p => p.name === '無効プラン'));
}

// ---------------------------------------------------------------
section('55. setup系の完了メッセージはUIコンテキストが無くても例外にならない（alertOrLog_）');
{
  // ★不具合修正：setupPortal・setupTriggers・setupConsentFormTrigger・setupSurveyFormTrigger は
  // いずれもApps Scriptエディタから直接手動実行する運用（スプレッドシートのカスタムメニュー経由
  // ではない）のため、実際の本番環境では SpreadsheetApp.getUi() が
  // 「Cannot call SpreadsheetApp.getUi() from this context.」を投げる。これまでのテストハーネスは
  // getUi() を常に成功するようモックしていたため、この失敗を一度も検出できていなかった
  // （setupPortal自体は完走していたが、最後のgetUi().alert(...)だけが例外になっていた）。
  // ここではgetUi()が実際の本番同様に例外を投げるようモックし直し、それでも4つのsetup系関数が
  // 最後まで完走することを確認する。
  const ctx = makeContext(); CTX = ctx;
  ctx.SpreadsheetApp.getUi = () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); };

  let err = null;
  try { ctx.setupPortal(); } catch (e) { err = e.message; }
  check('UIコンテキストが無くても setupPortal が完走する', err === null, err);

  let err2 = null;
  try { ctx.setupTriggers(); } catch (e) { err2 = e.message; }
  check('UIコンテキストが無くても setupTriggers が完走する', err2 === null, err2);

  let err3 = null;
  try { ctx.setupConsentFormTrigger(); } catch (e) { err3 = e.message; }
  check('UIコンテキストが無くても setupConsentFormTrigger が完走する', err3 === null, err3);

  let err4 = null;
  try { ctx.setupSurveyFormTrigger(); } catch (e) { err4 = e.message; }
  check('UIコンテキストが無くても setupSurveyFormTrigger が完走する', err4 === null, err4);
}

// ---------------------------------------------------------------
section('56. ログイン画面を支店選択プルダウンから支店コード直接入力に変更・「有効」オフ時の専用エラー');
{
  // ★要件：店舗が増えるとプルダウンの選択肢が長すぎて選びにくいため、ログイン画面を
  // プルダウン選択から「支店コード＋パスコードを直接入力」に変更した（Index.html/JavaScript.html）。
  // apiLogin自体は元々コードの文字列を受け取る仕様だったため、サーバー側の挙動は変わらない。
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['018','新宿西口店','','','SHOP','','sp','shop018@his-world.com','','','','', '', true]);
  // ★不具合の再現：支店マスタに行を追加したのに「有効」列をオンにし忘れているケース
  // （実際にユーザーから報告された「018を登録したのにログインできない」の原因）
  bm.appendRow(['019','未有効化店舗','','','SHOP','','sp2','shop019@his-world.com','','','','', '', false]);

  const shopLogin = ctx.apiLogin('018', 'sp');
  check('直接入力でも支店コード・パスコードでログインできる（プルダウン廃止後も同じapiLoginのまま）',
        shopLogin.ok === true && shopLogin.session.role === 'SHOP', JSON.stringify(shopLogin));
  // 支店コードは大文字小文字を問わない・前後の空白は無視される（既存仕様の再確認）
  const shopLoginLower = ctx.apiLogin(' 018 ', 'sp');
  check('支店コードの前後空白は無視される', shopLoginLower.ok === true);

  const inactiveLogin = ctx.apiLogin('019', 'sp2');
  check('「有効」列がオフの支店は、コード・パスコードが合っていてもログインできない',
        inactiveLogin.ok === false, JSON.stringify(inactiveLogin));
  check('「有効」列がオフの場合は「支店コードまたはパスコードが違います」ではなく専用のメッセージになる',
        inactiveLogin.error.includes('有効'), inactiveLogin.error);

  // 存在しない支店コード・パスコード違いは、これまでどおり汎用メッセージのまま
  // （「有効な支店コードかどうか」を外部から探索されないようにするため）
  const wrongCode = ctx.apiLogin('NOPE', 'sp');
  check('存在しない支店コードは汎用メッセージのまま', wrongCode.error === '支店コードまたはパスコードが違います。');
  const wrongPass = ctx.apiLogin('018', 'wrong');
  check('パスコード違いは汎用メッセージのまま', wrongPass.error === '支店コードまたはパスコードが違います。');
}

// ---------------------------------------------------------------
section('57. 撮影データ納品先メールアドレス欄の追加・apiListAllActivePlansのlocationMode・新規依頼のプラン自動反映');
{
  const ctx = featureFixture();
  ctx.ensureSheetWithHeaders_(ctx.__ss, 'プランマスタ', ctx.PLAN_MASTER_HEADERS);
  addBranchRow(ctx, { '支店コード': 'SHOP1', '支店名': '新宿店', 'ロール': 'SHOP', 'ログインパスコード': 'sp', '通知先メール': 'shop1@example.com', '有効': true });
  const pm = ctx.__ss.getSheetByName('プランマスタ');
  pm.appendRow(['VIE', 'ウィーン半日プラン', true, 'checkbox', 'シェーンブルン宮殿、ベルヴェデーレ宮殿']);
  pm.appendRow(['IST', 'カッパドキアサンライズ', true]);

  const jpToken = ctx.apiLogin('KANTO', 'pw').session.token;
  const shopToken = ctx.apiLogin('SHOP1', 'sp').session.token;

  // --- ①撮影データ納品先メールアドレス：現地連絡先メールとは別の自由入力欄として追加された ---
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-970', '管轄': '関東' });
  ctx.apiSaveFieldsQuiet(jpToken, 'VIE-970', { '撮影データ納品先メールアドレス': 'delivery@example.com' });
  check('撮影データ納品先メールアドレスが保存できる（日本側・現地支店側どちらの画面でも扱う項目）',
        ctx.apiGetReservationDetail(jpToken, 'VIE-970').detail['撮影データ納品先メールアドレス'] === 'delivery@example.com');

  const vieToken2 = ctx.apiLogin('VIE', 'vp').session.token;
  ctx.apiSaveFieldsQuiet(vieToken2, 'VIE-970', { '撮影データ納品先メールアドレス': 'branch-delivery@example.com' });
  check('現地支店からも撮影データ納品先メールアドレスを更新できる',
        ctx.apiGetReservationDetail(jpToken, 'VIE-970').detail['撮影データ納品先メールアドレス'] === 'branch-delivery@example.com');

  // 店舗が起票した案件でも同じ欄を扱える（SHOP_EDITABLE_FIELDSに追加した）
  const shopCase57 = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Test', groomName: 'Taro',
    brideLastName: 'Test', brideName: 'Hanako', challengeNo: 'DUMMYCHG057', hope1: '2026-09-10'
  });
  ctx.apiSaveFieldsQuiet(shopToken, shopCase57.kanriNo, { '撮影データ納品先メールアドレス': 'shop-delivery@example.com' });
  check('店舗が起票した案件でも撮影データ納品先メールアドレスを保存できる',
        ctx.apiGetReservationDetail(shopToken, shopCase57.kanriNo).detail['撮影データ納品先メールアドレス'] === 'shop-delivery@example.com');

  // --- ②apiListAllActivePlansはlocationMode／locationCandidatesも返す（apiListPlansと同じ形） ---
  const allPlans = ctx.apiListAllActivePlans(jpToken);
  const vieAllPlan = allPlans.find(p => p.branchCode === 'VIE' && p.name === 'ウィーン半日プラン');
  check('apiListAllActivePlansはlocationModeを含む', !!vieAllPlan && vieAllPlan.locationMode === 'checkbox', JSON.stringify(vieAllPlan));
  check('apiListAllActivePlansはlocationCandidatesを含む',
        !!vieAllPlan && vieAllPlan.locationCandidates.includes('シェーンブルン宮殿'), JSON.stringify(vieAllPlan));
  const istAllPlan = allPlans.find(p => p.branchCode === 'IST' && p.name === 'カッパドキアサンライズ');
  check('撮影場所方式が未設定のプランはlocationMode=free（自由入力）になる', !!istAllPlan && istAllPlan.locationMode === 'free');

  // --- ③新規依頼フォームの案件全体「プラン」単独欄を廃止したため、第一希望のプランが
  //     案件全体のプラン名の初期値として自動反映される（payload.plan省略時） ---
  const createdA = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Auto', groomName: 'Plan',
    brideLastName: 'Auto', brideName: 'Plan', challengeNo: 'AUTOPLAN001',
    hope1: '2026-09-10', hopePlan1: 'ウィーン半日プラン'
  });
  check('新規依頼でplan省略時は第一希望のプランが案件全体のプラン名になる',
        ctx.apiGetReservationDetail(jpToken, createdA.kanriNo).detail['プラン名'] === 'ウィーン半日プラン');

  // 明示的にplanを指定した場合はそちらを優先する（従来どおりの上書き優先度）
  const createdB = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Explicit', groomName: 'Plan',
    brideLastName: 'Explicit', brideName: 'Plan', challengeNo: 'AUTOPLAN002',
    plan: '明示的に指定したプラン', hope1: '2026-09-10', hopePlan1: 'ウィーン半日プラン'
  });
  check('新規依頼でplanを明示指定した場合はそちらが優先される（第一希望のプランでは上書きしない）',
        ctx.apiGetReservationDetail(jpToken, createdB.kanriNo).detail['プラン名'] === '明示的に指定したプラン');

  // 希望日を何も入力しない場合（第一希望の日付は必須のため常に何かは入るが、プランは省略可）は空欄のまま
  const createdC = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'No', groomName: 'Plan',
    brideLastName: 'No', brideName: 'Plan', challengeNo: 'AUTOPLAN003', hope1: '2026-09-10'
  });
  check('希望日にプランを何も指定しなければ案件全体のプラン名も空欄のまま',
        ctx.apiGetReservationDetail(jpToken, createdC.kanriNo).detail['プラン名'] === '');
}

// ---------------------------------------------------------------
section('58. 店舗発新規依頼を支店ごとに自動分割・新規依頼の支店通知トグル');
{
  const ctx = featureFixture();
  ctx.ensureSheetWithHeaders_(ctx.__ss, 'プランマスタ', ctx.PLAN_MASTER_HEADERS);
  addBranchRow(ctx, { '支店コード': 'SHOP1', '支店名': '新宿店', 'ロール': 'SHOP', 'ログインパスコード': 'sp', '通知先メール': 'shop1@example.com', '有効': true });
  const pm = ctx.__ss.getSheetByName('プランマスタ');
  pm.appendRow(['VIE', 'ウィーン半日プラン', true]);
  pm.appendRow(['IST', 'カッパドキアサンライズ', true]);

  const jpToken = ctx.apiLogin('KANTO', 'pw').session.token;
  const shopToken = ctx.apiLogin('SHOP1', 'sp').session.token;

  // --- 希望日が全て同じ支店のプランなら、従来どおり1件だけ作られる（大多数のケース） ---
  const single = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Single', groomName: 'Case',
    brideLastName: 'Single', brideName: 'Case', challengeNo: 'SPLIT000001',
    hope1: '2026-10-01', hopePlan1: 'ウィーン半日プラン',
    hope2: '2026-10-02', hopePlan2: 'ウィーン半日プラン'
  });
  check('希望日が全て同じ支店なら1件だけ作られる', single.kanriNos.length === 1, JSON.stringify(single));
  check('kanriNoはkanriNos[0]と一致する', single.kanriNo === single.kanriNos[0]);

  // --- 希望日①＝ウィーン支店のプラン、希望日②＝イスタンブール支店のプラン、
  //     希望日③＝再びウィーン支店のプラン、という国をまたいだ複数プラン希望は、
  //     支店ごとに案件を自動分割して作成する（元の希望順位はそれぞれの案件内で保持する） ---
  ctx.__mail.length = 0;
  const multi = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'Multi', groomName: 'Branch',
    brideLastName: 'Multi', brideName: 'Branch', challengeNo: 'SPLIT000002',
    hope1: '2026-10-10', hopePlan1: 'ウィーン半日プラン',
    hope2: '2026-10-11', hopePlan2: 'カッパドキアサンライズ',
    hope3: '2026-10-12', hopePlan3: 'ウィーン半日プラン'
  });
  check('支店をまたぐ希望日があると案件が支店ごとに分割される（2件）',
        multi.kanriNos.length === 2, JSON.stringify(multi));

  const vieCase = multi.kanriNos.map(k => ctx.apiGetReservationDetail(jpToken, k).detail).find(d => d['支店コード'] === 'VIE');
  const istCase = multi.kanriNos.map(k => ctx.apiGetReservationDetail(jpToken, k).detail).find(d => d['支店コード'] === 'IST');
  check('ウィーン支店分の案件ができている', !!vieCase);
  check('イスタンブール支店分の案件ができている', !!istCase);

  check('ウィーン支店分には希望日①・③が入り、他支店分の希望日②は空欄のまま',
        vieCase['希望日①'] === '2026-10-10' && vieCase['希望日③'] === '2026-10-12' && !vieCase['希望日②'],
        JSON.stringify(vieCase));
  check('イスタンブール支店分には希望日②だけが入り、希望日①・③は空欄のまま',
        istCase['希望日②'] === '2026-10-11' && !istCase['希望日①'] && !istCase['希望日③'],
        JSON.stringify(istCase));
  check('ウィーン支店分のプラン名は自分の希望日のプランから決まる（希望日①のプラン）',
        vieCase['プラン名'] === 'ウィーン半日プラン');
  check('イスタンブール支店分のプラン名も自分の希望日のプランから決まる',
        istCase['プラン名'] === 'カッパドキアサンライズ');

  // 新郎新婦名・チャレンジ番号など、案件全体で共通の項目はどちらの案件にも同じ内容がコピーされる
  check('新郎新婦名は両方の案件に同じ内容が入る（依頼内容は同じ結婚式のため）',
        vieCase['新郎名（ローマ字）'] === 'BRANCH' && istCase['新郎名（ローマ字）'] === 'BRANCH',
        JSON.stringify({ vie: vieCase['新郎名（ローマ字）'], ist: istCase['新郎名（ローマ字）'] }));
  check('チャレンジ番号も両方の案件に同じ内容が入る',
        vieCase['CHG NO'] === 'SPLIT000002' && istCase['CHG NO'] === 'SPLIT000002',
        JSON.stringify({ vie: vieCase['CHG NO'], ist: istCase['CHG NO'] }));

  // それぞれのメッセージ履歴に、もう一方の支店の管理番号が案内される
  const vieHist = ctx.apiGetReservationDetail(jpToken, vieCase['管理番号']).detail.history;
  check('ウィーン支店分のメッセージに、イスタンブール支店分の管理番号が案内される',
        vieHist.some(h => h.body.includes('関連の他支店案件') && h.body.includes(istCase['管理番号'])),
        JSON.stringify(vieHist));
  const istHist = ctx.apiGetReservationDetail(jpToken, istCase['管理番号']).detail.history;
  check('イスタンブール支店分のメッセージにも、ウィーン支店分の管理番号が案内される',
        istHist.some(h => h.body.includes('関連の他支店案件') && h.body.includes(vieCase['管理番号'])));

  // 両支店とも既定（未設定）のため、手配課・両支店すべてにメールが届く
  check('分割時も既定では手配課・両支店すべてに通知メールが届く',
        ctx.__mail.some(m => m.to.includes('kanto@his-world.com')) &&
        ctx.__mail.some(m => m.to.includes('vie@his-world.com')) &&
        ctx.__mail.some(m => m.to.includes('ist@his-world.com')),
        JSON.stringify(ctx.__mail.map(m => m.to)));

  // --- 希望日にプランを指定しない場合は、フォーム上部で選んだ支店（都市）の案件に含める ---
  const noPlanHope = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomLastName: 'NoPlan', groomName: 'Hope',
    brideLastName: 'NoPlan', brideName: 'Hope', challengeNo: 'SPLIT000003',
    hope1: '2026-10-20', hope2: '2026-10-21', hopePlan2: 'カッパドキアサンライズ'
  });
  check('プラン未選択の希望日と他支店のプランを選んだ希望日が混在しても、選んだ支店（都市）の案件に未選択分がまとまる',
        noPlanHope.kanriNos.length === 2, JSON.stringify(noPlanHope));
  const noPlanVie = noPlanHope.kanriNos.map(k => ctx.apiGetReservationDetail(jpToken, k).detail).find(d => d['支店コード'] === 'VIE');
  check('プラン未選択の希望日①は、フォームで選んだウィーン支店の案件に入る', noPlanVie['希望日①'] === '2026-10-20');

  // --- 新規依頼の支店通知トグル：OFFの支店へは作成時点のメールが飛ばない（可視性は変わらない） ---
  setBranchField(ctx, 'IST', '新規依頼の支店通知', false);
  ctx.__mail.length = 0;
  const toggled = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'IST', team: '関東', groomLastName: 'Toggle', groomName: 'Off',
    brideLastName: 'Toggle', brideName: 'Off', challengeNo: 'SPLIT000004', hope1: '2026-10-25'
  });
  check('支店通知OFFでも手配課へのメールは飛ぶ', ctx.__mail.some(m => m.to.includes('kanto@his-world.com')));
  check('支店通知OFFの支店へはメールが飛ばない', !ctx.__mail.some(m => m.to.includes('ist@his-world.com')));
  const istToken = ctx.apiLogin('IST', 'ip').session.token;
  check('支店通知OFFでも案件自体は現地支店から閲覧できる（可視性は変えない）',
        ctx.apiGetReservationDetail(istToken, toggled.kanriNo).detail['管理番号'] === toggled.kanriNo);
  check('支店通知OFFでも支店側の一覧では未読（要対応）として表示される（メールだけを止める設定のため）',
        ctx.apiGetDashboard(istToken, { showAll: true }).reservations.find(r => r.kanriNo === toggled.kanriNo).needsAction === true);

  // 手配課側の通知もOFF、支店側の通知もOFFなら、メールは1通も飛ばない
  setBranchField(ctx, 'IST', '店舗依頼の手配課通知', false);
  ctx.__mail.length = 0;
  ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'IST', team: '関東', groomLastName: 'Both', groomName: 'Off',
    brideLastName: 'Both', brideName: 'Off', challengeNo: 'SPLIT000005', hope1: '2026-10-26'
  });
  check('手配課・支店の両方の通知がOFFならメールは1通も飛ばない', ctx.__mail.length === 0, JSON.stringify(ctx.__mail));
}

// ---------------------------------------------------------------
section('59. 撮影40日前・STS(JP側)未FNアラート（店舗発案件専用・checkShopAlerts）');
function shopAlertFixture() {
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO', '関東手配課', '', '', 'JP', '関東', 'pw', 'kanto@his-world.com', '', '', '', '', '', true]);
  bm.appendRow(['VIE', 'ウィーン支店', 'オーストリア', 'ウィーン', 'BRANCH', '', 'vp', 'vie@his-world.com', 'VIE', '', '', '', '', true]);
  bm.appendRow(['SHOP1', '新宿店', '', '', 'SHOP', '', 'sp', 'shop1@his-world.com', '', '', '', '', '', true]);
  ['予約一覧', '過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  ctx.ensureSheetWithHeaders_(ss, 'やり取り履歴', ctx.HISTORY_HEADERS);
  return ctx;
}
{
  const ctx = shopAlertFixture();
  const H = ctx.RESERVATION_HEADERS;
  const mk = (sheetName, kanri, shootDate, stsJp, originShop) => {
    const sheet = ctx.__ss.getSheetByName(sheetName);
    const row = new Array(H.length).fill('');
    row[H.indexOf('支店コード')] = 'VIE'; row[H.indexOf('管理番号')] = kanri;
    row[H.indexOf('管轄')] = '関東'; row[H.indexOf('STS JP')] = stsJp;
    row[H.indexOf('撮影日FIX')] = shootDate; row[H.indexOf('起票元店舗')] = originShop;
    sheet.appendRow(row);
  };

  // 40日前ちょうど（daysSinceThreshold=0）・店舗発・未FN → 通知される
  mk('予約一覧', 'SHOP-A', daysAhead(40), 'RQ', 'SHOP1');
  // まだ40日前になっていない（daysSinceThreshold=-1） → 対象外
  mk('予約一覧', 'SHOP-B', daysAhead(41), 'RQ', 'SHOP1');
  // 40日前を過ぎているがFN（最終確定）済み → 対象外
  mk('予約一覧', 'SHOP-C', daysAhead(40), 'FN', 'SHOP1');
  // 40日前を過ぎているが起票元店舗が無い（従来のJP/BRANCH起票の案件） → 対象外
  mk('予約一覧', 'SHOP-D', daysAhead(40), 'RQ', '');
  // 40日前を1日過ぎただけ（daysSinceThreshold=1、7の倍数でない） → まだ再通知のタイミングではない
  mk('予約一覧', 'SHOP-E', daysAhead(39), 'RQ', 'SHOP1');
  // 撮影日が既に過ぎ、過去一覧に移動済みでも対象になる（daysSinceThreshold=42＝7の倍数）
  mk('過去一覧', 'SHOP-F', daysAgo(2), 'RQ', 'SHOP1');
  // 再通知の上限（120日）を超えた古い案件は対象外（daysSinceThreshold=126）
  mk('過去一覧', 'SHOP-G', daysAgo(86), 'RQ', 'SHOP1');
  // キャンセル成立（CW）は対象外
  mk('予約一覧', 'SHOP-H', daysAhead(40), 'CW', 'SHOP1');

  const result = ctx.checkShopAlerts();
  check('エラー無く完走する', result.ok === true && result.errors === 0, JSON.stringify(result));

  const alerted = ctx.__mail.filter(m => m.subj.includes('撮影40日前超過'));
  const alertedKanri = alerted.map(m => m.subj.match(/：([\w-]+)（/)[1]);
  check('40日前ちょうどの店舗発・未FN案件に通知される', alertedKanri.includes('SHOP-A'), JSON.stringify(alertedKanri));
  check('まだ40日前になっていない案件には通知されない', !alertedKanri.includes('SHOP-B'));
  check('FN済みの案件には通知されない', !alertedKanri.includes('SHOP-C'));
  check('起票元店舗が無い（店舗発でない）案件には通知されない', !alertedKanri.includes('SHOP-D'));
  check('40日前を過ぎたばかりで再通知間隔（7日）に満たない案件には通知されない', !alertedKanri.includes('SHOP-E'));
  check('撮影日を過ぎ過去一覧に移動した案件でも、7日おきの再通知タイミングなら通知される',
        alertedKanri.includes('SHOP-F'), JSON.stringify(alertedKanri));
  check('再通知の上限（120日）を超えた古い案件には通知されない', !alertedKanri.includes('SHOP-G'));
  check('キャンセル成立（CW）の案件には通知されない', !alertedKanri.includes('SHOP-H'));

  const shopAMail = ctx.__mail.find(m => m.subj.includes('SHOP-A'));
  check('通知は手配課・起票元店舗（日本支店）の両方に届く',
        shopAMail && shopAMail.to.includes('kanto@his-world.com') && shopAMail.to.includes('shop1@his-world.com'),
        shopAMail && shopAMail.to);
}
{
  // setupTriggers に checkShopAlerts のトリガーが追加されていること
  const ctx = shopAlertFixture();
  let err = null;
  try { ctx.setupTriggers(); } catch (e) { err = e.message; }
  check('setupTriggersにcheckShopAlertsを追加してもエラーにならない', err === null, err);
}

// ---------------------------------------------------------------
section('60. プランマスタの納品期限日数（支店マスタより優先）・納品待ち画面にも反映');
{
  const ctx = makeContext(); CTX = ctx;
  const ss = ctx.__ss;
  ctx.ensureSheetWithHeaders_(ss, '支店マスタ', ctx.BRANCH_MASTER_HEADERS);
  const bm = ss.getSheetByName('支店マスタ');
  bm.appendRow(['KANTO', '関東手配課', '', '', 'JP', '関東', 'p', 'kanto@his-world.com', '', '', '', '', '', true]);
  // 支店マスタの納品期限日数は21日
  bm.appendRow(['VIE', 'ウィーン支店', 'オーストリア', 'ウィーン', 'BRANCH', '', 'p', 'vie@his-world.com', 'VIE', '', 21, '', '', true]);
  ctx.ensureSheetWithHeaders_(ss, 'プランマスタ', ctx.PLAN_MASTER_HEADERS);
  const pm = ss.getSheetByName('プランマスタ');
  // このプランだけ納品期限日数を10日に個別設定（支店マスタの21日より優先されるはず）
  pm.appendRow(['VIE', '速報プラン', true, '', '', 10]);
  pm.appendRow(['VIE', '通常プラン', true, '', '', '']); // 未設定なら支店マスタの21日のまま

  ['予約一覧', '過去一覧'].forEach(n => ctx.ensureSheetWithHeaders_(ss, n, ctx.RESERVATION_HEADERS));
  const H = ctx.RESERVATION_HEADERS;
  const mk = (kanri, planName, daysPast) => {
    const sheet = ss.getSheetByName('過去一覧');
    const row = new Array(H.length).fill('');
    row[H.indexOf('支店コード')] = 'VIE'; row[H.indexOf('管理番号')] = kanri;
    row[H.indexOf('管轄')] = '関東'; row[H.indexOf('プラン名')] = planName;
    row[H.indexOf('撮影日FIX')] = daysAgo(daysPast);
    sheet.appendRow(row);
  };

  // 速報プラン：プラン単位の納品期限（10日）ちょうど経過（メールは期限日ちょうどに1通送る仕様）→ 通知される
  mk('VIE-DL1', '速報プラン', 10);
  // 通常プラン：プラン単位の指定が無いので支店マスタの21日を使う。10日経過ではまだ期限前 → 通知されない
  mk('VIE-DL2', '通常プラン', 10);
  // 通常プラン：支店マスタの21日ちょうど経過 → 通知される
  mk('VIE-DL3', '通常プラン', 21);

  ctx.checkDeliveryAlerts();
  const kanriOf = (subj) => subj.match(/：([\w-]+)（/)[1];
  const alertedKanri = ctx.__mail.map(m => kanriOf(m.subj));
  check('プラン単位の納品期限（10日）を過ぎたら、支店の期限（21日）より先に通知される',
        alertedKanri.includes('VIE-DL1'), JSON.stringify(alertedKanri));
  check('プラン単位の指定が無いプランは、支店の期限（21日）が効くので10日経過ではまだ通知されない',
        !alertedKanri.includes('VIE-DL2'), JSON.stringify(alertedKanri));
  check('プラン単位の指定が無いプランでも、支店の期限（21日）を過ぎれば通知される',
        alertedKanri.includes('VIE-DL3'), JSON.stringify(alertedKanri));

  // 「納品待ち」一覧（apiGetPendingDeliveries）でも同じ基準が使われること
  const jpToken = ctx.apiLogin('KANTO', 'p').session.token;
  const pending = ctx.apiGetPendingDeliveries(jpToken, { showAll: true }).results.map(p => p.kanriNo);
  check('納品待ち一覧にも、プラン単位の期限を過ぎた案件が出る（10日設定）', pending.includes('VIE-DL1'), JSON.stringify(pending));
  check('納品待ち一覧では、プラン単位の期限前の案件は出ない', !pending.includes('VIE-DL2'), JSON.stringify(pending));
  check('納品待ち一覧にも、支店単位の期限を過ぎた案件が出る', pending.includes('VIE-DL3'), JSON.stringify(pending));
}

// ---------------------------------------------------------------
section('61. 一覧（apiGetDashboard）に撮影データ送付有無を追加');
{
  const ctx = featureFixture();
  const jpToken = ctx.apiLogin('KANTO', 'pw').session.token;
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-980', '管轄': '関東', 'DriveフォルダURL': 'https://drive.google.com/x' });
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-981', '管轄': '関東' });

  const dash = ctx.apiGetDashboard(jpToken, { showAll: true }).reservations;
  const delivered = dash.find(r => r.kanriNo === 'VIE-980');
  const notDelivered = dash.find(r => r.kanriNo === 'VIE-981');
  check('DriveフォルダURLが登録済みの案件はdataDelivered=trueになる', delivered.dataDelivered === true);
  check('DriveフォルダURL未登録の案件はdataDelivered=falseになる', notDelivered.dataDelivered === false);
}

// ---------------------------------------------------------------
section('62. 新規依頼フォーム上部の支店（都市）欄廃止（希望日①のプランから基準支店を自動特定）・通知メールに希望日ごとの全プランを記載・WEBAPP_URL');
{
  const ctx = shopFixture();
  ctx.ensureSheetWithHeaders_(ctx.__ss, 'プランマスタ', ctx.PLAN_MASTER_HEADERS);
  const pm62 = ctx.__ss.getSheetByName('プランマスタ');
  pm62.appendRow(['VIE', 'ウィーンフォト', true]);
  pm62.appendRow(['VIE', 'プランA', true]);
  pm62.appendRow(['IST', 'カッパドキアサンライズ', true]);
  const shopToken = ctx.apiLogin('SHOP1', 'sp').session.token;

  // --- branchCodeを送らず、希望日①のプランだけで基準支店を特定できる ---
  const created = ctx.apiShopCreateRequest(shopToken, {
    team: '関東', groomLastName: 'Firenze', groomName: 'Test',
    brideLastName: 'Roma', brideName: 'Test',
    hope1: '2026-10-09', hopePlan1: 'ウィーンフォト',
    challengeNo: 'NOBRANCH001'
  });
  check('branchCodeを送らなくても希望日①のプランから基準支店（VIE）が特定され、正常に作成できる',
        created.ok === true && String(created.kanriNo).startsWith('VIE-'), JSON.stringify(created));

  // --- 希望日①のプランが未選択だと作成できない（基準支店が決まらないため） ---
  let err = null;
  try {
    ctx.apiShopCreateRequest(shopToken, {
      team: '関東', groomLastName: 'A', groomName: 'B', brideLastName: 'C', brideName: 'D',
      hope1: '2026-10-09', challengeNo: 'NOBRANCH002'
    });
  } catch (e) { err = e.message; }
  check('branchCodeも希望日①のプランも無いと作成できない', err !== null && err.includes('プラン'), String(err));

  // --- プラン名がどの支店のマスタにも存在しない場合もエラーになる ---
  err = null;
  try {
    ctx.apiShopCreateRequest(shopToken, {
      team: '関東', groomLastName: 'A', groomName: 'B', brideLastName: 'C', brideName: 'D',
      hope1: '2026-10-09', hopePlan1: '存在しないプラン名', challengeNo: 'NOBRANCH003'
    });
  } catch (e) { err = e.message; }
  check('希望日①のプランがどの支店のマスタにも無いと作成できない', err !== null && err.includes('提供元支店'), String(err));

  // --- 通知メールに希望日ごとの全プランが記載される（第一希望しか出ない不具合の修正） ---
  const created2 = ctx.apiShopCreateRequest(shopToken, {
    team: '関東', groomLastName: 'Multi', groomName: 'Plan',
    brideLastName: 'Multi', brideName: 'Plan',
    hope1: '2026-10-09', hopePlan1: 'ウィーンフォト',
    hope2: '2026-10-11', hopePlan2: 'プランA',
    hope3: '2026-10-12', hopePlan3: 'カッパドキアサンライズ',
    challengeNo: 'MULTIPLAN01'
  });
  // hope3（カッパドキアサンライズ＝IST）は別支店のため案件が分割される
  check('希望日ごとに支店が異なるプランを選ぶと案件が分割される', created2.kanriNos.length === 2, JSON.stringify(created2.kanriNos));
  const vieMail = ctx.__mail.find(m => m.body.includes('MULTIPLAN01') && m.body.includes('ウィーンフォト'));
  check('通知メールに第一希望のプランが記載される', !!vieMail && vieMail.body.includes('第一希望') && vieMail.body.includes('ウィーンフォト'));
  check('同じ通知メールに、同じ支店（VIE）の第二希望のプランも記載される（以前は第一希望しか出ない不具合があった）',
        !!vieMail && vieMail.body.includes('第二希望') && vieMail.body.includes('プランA'), vieMail && vieMail.body);
  const istMail = ctx.__mail.find(m => m.body.includes('MULTIPLAN01') && m.body.includes('カッパドキアサンライズ'));
  check('別支店に分割された案件の通知メールには、その支店の希望日（第三希望）のプランが記載される',
        !!istMail && istMail.body.includes('第三希望') && istMail.body.includes('カッパドキアサンライズ'), istMail && istMail.body);

  // --- 通知メールの「ポータルで確認する」リンクにWEBAPP_URLが載る ---
  check('通知メールにWebアプリのURL（WEBAPP_URL）が記載される（プレースホルダのままではない）',
        !!vieMail && vieMail.body.includes('https://script.google.com/a/macros/his-world.com/s/'), vieMail && vieMail.body);
  check('WEBAPP_URLのプレースホルダ文言は残っていない',
        !vieMail || !vieMail.body.includes('Webアプリのデプロイ後のURLをここに記載してください'));
}

// ---------------------------------------------------------------
console.log(`\n${'='.repeat(50)}\n結果: ${pass} 件成功 / ${fail} 件失敗\n${'='.repeat(50)}`);
process.exit(fail === 0 ? 0 : 1);
