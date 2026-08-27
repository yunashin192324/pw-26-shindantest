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
  check('アラート宛先が管轄チーム（関東）になっている',
        deliveryScenario({ sheet: '過去一覧', daysPast: 30 })[0].to === 'kanto@his-world.com');
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
                  '定型文マスタ','セールマスタ','予約一覧','やり取り履歴','過去一覧','ステータス変更履歴'];
  SHEETS.forEach(n => check(`シート「${n}」が作られる`, !!ss.getSheetByName(n)));

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
section('28. メモ履歴（共有メモ・メモ（現地用）の積み上げ記録）');
{
  const ctx = featureFixture();
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-601','管轄':'関東' });
  const jp = ctx.apiLogin('KANTO','pw');
  const vie = ctx.apiLogin('VIE','vp');

  // 追加すると即座に反映され、日付・記入者は自動で入る（3択保留の対象外）
  ctx.apiAddMemo(jp.session.token, 'VIE-601', '共有メモ', '請求書は月末締めで発行予定');
  const afterFirst = ctx.apiGetReservationDetail(jp.session.token, 'VIE-601').detail;
  check('追加した内容が入る', afterFirst.memoLog[0].body === '請求書は月末締めで発行予定');
  check('種別が共有メモになっている', afterFirst.memoLog[0].type === '共有メモ');
  check('記入者が自動で入る（Googleアカウントの氏名）', afterFirst.memoLog[0].who.includes('tanaka'),
        afterFirst.memoLog[0].who);
  check('日時が自動で入る', /^\d{4}\/\d{2}\/\d{2}/.test(afterFirst.memoLog[0].datetime), afterFirst.memoLog[0].datetime);

  // 積み上げ式：追加するたびに増え、新しい順で返る
  ctx.apiAddMemo(vie.session.token, 'VIE-601', '共有メモ', '請求書は届いています');
  ctx.apiAddMemo(vie.session.token, 'VIE-601', 'メモ（現地用）', '雨天時は屋内スタジオへ変更');
  const afterThree = ctx.apiGetReservationDetail(jp.session.token, 'VIE-601').detail;
  const sharedOnly = afterThree.memoLog.filter(m => m.type === '共有メモ');
  const localOnly = afterThree.memoLog.filter(m => m.type === 'メモ（現地用）');
  check('共有メモが2件積み上がっている', sharedOnly.length === 2, JSON.stringify(sharedOnly));
  check('新しい順（最新が先頭）', sharedOnly[0].body === '請求書は届いています', JSON.stringify(sharedOnly));
  check('古い方も消えずに残っている', sharedOnly[1].body === '請求書は月末締めで発行予定');
  check('メモ（現地用）は種別で分かれて1件だけ', localOnly.length === 1 && localOnly[0].body === '雨天時は屋内スタジオへ変更');

  // 空欄・不正な種別は拒否する
  let emptyErr = null;
  try { ctx.apiAddMemo(jp.session.token, 'VIE-601', '共有メモ', '   '); } catch (e) { emptyErr = e.message; }
  check('空欄のメモは追加できない', emptyErr !== null, String(emptyErr));
  let typeErr = null;
  try { ctx.apiAddMemo(jp.session.token, 'VIE-601', 'アンケート回答', '手入力で紛れ込ませようとする内容'); } catch (e) { typeErr = e.message; }
  check('種別「アンケート回答」は手入力では追加できない（Googleフォーム専用）', typeErr !== null, String(typeErr));

  // 他支店の案件へは追加できない
  const ist = ctx.apiLogin('IST','ip');
  let crossErr = null;
  try { ctx.apiAddMemo(ist.session.token, 'VIE-601', '共有メモ', '侵入'); } catch (e) { crossErr = e.message; }
  check('他支店の案件へメモを追加できない', crossErr !== null, String(crossErr));

  // 過去（移行前）のメモは、まだ1件も無いときだけフォールバックとして表示される
  addCase(ctx, '予約一覧', { '支店コード':'VIE','管理番号':'VIE-602','管轄':'関東', '共有メモ':'旧方式で保存されていたメモ' });
  const legacy = ctx.apiGetReservationDetail(jp.session.token, 'VIE-602').detail;
  check('メモ履歴が空でも旧方式の値がフォールバック表示される', legacy['共有メモ'] === '旧方式で保存されていたメモ');
  check('メモ履歴自体は空のまま（フォールバックは画面側の責務）', legacy.memoLog.length === 0);
  ctx.apiAddMemo(jp.session.token, 'VIE-602', '共有メモ', '新方式の1件目');
  const afterMigrate = ctx.apiGetReservationDetail(jp.session.token, 'VIE-602').detail;
  check('新しく追加すればメモ履歴に乗る', afterMigrate.memoLog.some(m => m.body === '新方式の1件目'));
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

  // 通知メールは飛ばない（自動連動は監査ログのみで、メッセージ通知には乗らない）
  check('自動連動そのものはメールを増やさない（直前の3件の保存はいずれも apiSaveFieldsQuiet）',
        !ctx.__mail.some(m => /VIE-711|VIE-712/.test(m.subj + m.body)));
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
  err = null; try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', customerName: '' }); } catch (e) { err = e.message; }
  check('お客様名が無いと作成できない', err !== null, String(err));
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
    branchCode: 'VIE', team: '関東', customerName: 'Ahmet Yilmaz', hopeDate: '2026-09-10', plan: 'プランA'
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
  check('お客様名が入る', jpDetail['新郎名（ローマ字）'] === 'Ahmet Yilmaz');
  check('希望日①が入る', jpDetail['希望日①'] === '2026-09-10');
  check('プランが入る', jpDetail['プラン名'] === 'プランA');
  check('起票元店舗が記録される', jpDetail.originShop === 'SHOP1');
  check('起票元店舗名も返る', jpDetail.originShopName === '新宿店');

  check('日本の該当手配課へ通知メールが飛ぶ', ctx.__mail.some(m => m.to.includes('kanto@his-world.com') && m.body.includes('Ahmet Yilmaz')));
  check('現地支店へも通知メールが飛ぶ', ctx.__mail.some(m => m.to.includes('vie@his-world.com') && m.body.includes('Ahmet Yilmaz')));

  check('日本側は要対応（未読）になる', ctx.apiGetDashboard(jpToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri).needsAction === true);
  check('支店側も要対応（未読）になる', ctx.apiGetDashboard(vieToken, { showAll: true }).reservations.find(r => r.kanriNo === kanri).needsAction === true);

  // --- 店舗自身から見える案件詳細（項目は最小限） ---
  const shopDetail = ctx.apiGetReservationDetail(shopToken, kanri).detail;
  check('店舗自身は自分の起票した案件を見られる', shopDetail['管理番号'] === kanri);
  check('店舗向けの詳細にはSTSが入る', shopDetail['STS JP'] === 'RQ' && shopDetail['STS 支店'] === '');
  check('店舗向けの詳細には請求先など内部項目は含まれない', !('請求先' in shopDetail) && !('ホテル' in shopDetail));
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

  // JPからのメッセージは、直結モードでは（recipient指定に関わらず）支店へ届く
  ctx.apiCommitChanges(jpToken, kanri, {}, '直結モード中のJPからの確認', 'SHOP');
  const stillToBranch = ctx.apiGetReservationDetail(vieToken, kanri).detail;
  check('直結モードではrecipient="SHOP"指定でもJPのメッセージは支店へ届く（店舗とは直接やり取りする設計のため）',
        stillToBranch.history.some(h => h.body.includes('直結モード中のJPからの確認')));

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
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-801', '管轄': '関東', '新郎名（ローマ字）': 'A', 'STS JP': 'RQ', 'STS 支店': 'NC' });
  addCase(ctx, '予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-802', '管轄': '関東', '新郎名（ローマ字）': 'B', 'STS JP': 'OK', 'STS 支店': 'OK' });
  addCase(ctx, '予約一覧', { '支店コード': 'IST', '管理番号': 'IST-801', '管轄': '関西', '新郎名（ローマ字）': 'C', 'STS JP': 'OK', 'STS 支店': 'NC' });
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
  try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'A' }); } catch (e) { err = e.message; }
  check('希望日（第一希望）が無いと作成できない', err !== null, String(err));

  // --- 新規作成時のSTS(JP側)選択（RQ／CHK） ---
  err = null;
  try { ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'A', hope1: '2026-09-10', initialStatus: 'OK' }); } catch (e) { err = e.message; }
  check('初期STS(JP側)にRQ/CHK以外を指定すると作成できない', err !== null, String(err));

  // --- フル項目での作成（イスタンブール＝パスポート必須） ---
  const created = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'IST', team: '関西', groomName: 'Kenji Sato', brideName: 'Yui Sato',
    plan: 'プランA', saleName: '春の特別セール', location: '旧市街の教会', prep: 'サロン',
    hope1: '2026-09-10', hope2: '2026-09-11', hope3: '2026-09-12', hope4: '2026-09-13', hope5: '2026-09-14',
    option1: '追加アルバム', option2: 'アクセサリーレンタル',
    passportNumber: 'TR1234567', initialStatus: 'CHK'
  });
  check('拡張項目つきで起票が成功する', created.ok === true && !!created.kanriNo, JSON.stringify(created));
  const kanri = created.kanriNo;
  const detail = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('新郎名が入る', detail['新郎名（ローマ字）'] === 'Kenji Sato');
  check('新婦名が入る', detail['新婦名（ローマ字）'] === 'Yui Sato');
  check('セール名が入る', detail['セール名'] === '春の特別セール');
  check('撮影希望場所が入る', detail['撮影希望場所'] === '旧市街の教会');
  check('準備場所が入る', detail['準備場所'] === 'サロン');
  check('希望日が第五希望まで入る', ['希望日①','希望日②','希望日③','希望日④','希望日⑤'].map((k,i) => detail[k] === `2026-09-1${i}`).every(Boolean),
        JSON.stringify(['希望日①','希望日②','希望日③','希望日④','希望日⑤'].map(k => detail[k])));
  check('オプション名が入る', detail.options[0].name === '追加アルバム' && detail.options[1].name === 'アクセサリーレンタル');
  check('パスポート必須支店ではパスポート番号が保存される', detail['パスポート番号'] === 'TR1234567');
  check('選択した初期STS(JP側)（CHK）で作成される', detail['STS JP'] === 'CHK');

  // --- パスポート非必須支店では指定しても無視される（表示条件を作成時にも踏襲） ---
  const created2 = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomName: 'B', hope1: '2026-10-01', passportNumber: 'SHOULD-BE-IGNORED'
  });
  const detail2 = ctx.apiGetReservationDetail(jpToken, created2.kanriNo).detail;
  check('パスポート非必須支店ではパスポート番号は保存されない', !detail2['パスポート番号']);
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

  const created = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'A', hope1: '2026-09-10' });
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

  // --- オプションは全案件共通仕様の対象外（DC/PCの影響を受けない・従来どおり） ---
  let err = null;
  try { ctx.apiSaveFieldsQuiet(shopToken, kanri, { 'OP1 STS JP': 'DC' }); } catch (e) { err = e.message; }
  check('オプションのSTSはDC/PCの対象外（店舗はオプションのSTSを変更できない）', err !== null, String(err));

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
  const created2 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'B', hope1: '2026-11-01' });
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
  const created1 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'A', hope1: '2026-09-10' });
  check('通知トグル未設定なら手配課にも通知メールが飛ぶ（既定＝ON）', ctx.__mail.some(m => m.to.includes('kanto@his-world.com')));

  // --- 通知トグルをOFFにした支店は手配課宛メールだけ止まる（可視性は変わらない） ---
  setBranchField(ctx, 'VIE', '店舗依頼の手配課通知', false);
  ctx.__mail.length = 0;
  const created2 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'B', hope1: '2026-09-11' });
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

  const created = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'A', hope1: '2026-09-10' });
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

  const created = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'A', hope1: '2026-09-10' });
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
        folderName === `NoCH_${kanri}`, folderName);
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

  const created = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'A', hope1: '2026-09-10' });
  const kanri = created.kanriNo;

  // URL生成ロジック単体（entry IDが未設定＝実運用フォーム未設定の状態）
  const urls = ctx.apiGetPrefilledFormUrls(shopToken, kanri);
  check('フォームのentry ID未設定時は空文字を返す（画面側は案内しない）',
        urls.consentFormUrl === '' && urls.surveyFormUrl === '');

  // URL生成ロジック単体テスト（実際にentry IDが設定されている想定）
  const built = ctx.buildPrefilledFormUrl_('https://docs.google.com/forms/d/e/abc/viewform', 'entry.123456789', kanri);
  check('管理番号を埋め込んだURLが生成される', built === `https://docs.google.com/forms/d/e/abc/viewform?entry.123456789=${encodeURIComponent(kanri)}`, built);
  const builtWithQuery = ctx.buildPrefilledFormUrl_('https://example.com/form?usp=pp_url', 'entry.1', kanri);
  check('既に?が含まれるURLには&で連結する', builtWithQuery.includes('&entry.1='), builtWithQuery);
  check('baseUrlが空なら空文字を返す', ctx.buildPrefilledFormUrl_('', 'entry.1', kanri) === '');

  // ★ご提供いただいた実際の同意書フォームURLが設定されていること（entry IDは
  // ネットワーク制限のためこの環境では自動取得できず、別途設定が必要）
  check('同意書フォームURL（通常）が設定されている', ctx.CONSENT_FORM_URL === 'https://forms.gle/D45veRz2svQVSnc16');
  check('同意書フォームURL（イタリア専用）が設定されている',
        ctx.ITALY_CONSENT_FORM_URL === 'https://docs.google.com/forms/d/e/1FAIpQLSfWEeaiQmvt3ffV1giA3Cc2b5rPmcSxazZP2fZdveDQhGPT0A/viewform');

  // ★要件：イタリアの支店の案件だけ、同意書はイタリア専用フォームを使う（entry ID設定済みと仮定して検証）
  const italyUrl = ctx.buildPrefilledFormUrl_(ctx.ITALY_CONSENT_FORM_URL, 'entry.999', kanri);
  const normalUrl = ctx.buildPrefilledFormUrl_(ctx.CONSENT_FORM_URL, 'entry.999', kanri);
  check('通常フォームとイタリア専用フォームで異なるURLが生成される', italyUrl !== normalUrl);

  // イタリアの支店（国名で判定）でも例外なく動く（entry ID未設定のため空文字が返るのは同じ）
  addBranchRow(ctx, { '支店コード': 'ROW', '支店名': 'ローマ支店', '国': 'イタリア', '都市': 'ローマ', 'ロール': 'BRANCH', 'ログインパスコード': 'rp', '有効': true });
  addCase(ctx, '予約一覧', { '支店コード': 'ROW', '管理番号': 'ROW-901', '管轄': '関東', '新郎名（ローマ字）': 'X' });
  const jpToken42 = ctx.apiLogin('KANTO', 'pw').session.token;
  const urlsItaly = ctx.apiGetPrefilledFormUrls(jpToken42, 'ROW-901');
  check('イタリアの支店の案件でも例外なくURLを返す', urlsItaly.ok === true && urlsItaly.consentFormUrl === '');
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
    branchCode: 'VIE', team: '関東', groomName: 'A',
    hope1: '2026-08-01', hope2: '2026-08-05', hope3: '2026-08-06'
    // 希望日④・⑤は未入力のまま
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
    branchCode: 'VIE', team: '関東', groomName: 'B', hope1: '2026-09-01', initialStatus: 'CHK'
  });
  ctx.apiSaveFieldsQuiet(vieToken, created2.kanriNo, { '希望日① STS 支店': 'OK' });
  const d2 = ctx.apiGetReservationDetail(jpToken, created2.kanriNo).detail;
  check('希望日①のSTS(支店側)はOKになる（CHKでも希望日単位の連動自体は動く）', d2['希望日① STS 支店'] === 'OK');
  check('CHK（空き確認のみ）で作成した案件は、希望日が取れても全体を自動でOKにはしない', d2['STS JP'] === 'CHK');

  // --- 既にDC/PC/CR/NC等へ手動で進めている案件は、希望日の自動連動で巻き戻さない ---
  const created3 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'C', hope1: '2026-09-05', hope2: '2026-09-06' });
  ctx.apiSaveFieldsQuiet(jpToken, created3.kanriNo, { 'STS JP': 'DC' }); // 案件全体を手動でDCへ
  ctx.apiSaveFieldsQuiet(vieToken, created3.kanriNo, { '希望日① STS 支店': 'OK' });
  const d3 = ctx.apiGetReservationDetail(jpToken, created3.kanriNo).detail;
  check('案件全体のSTSが既にRQ以外（DC）に進んでいる場合は、希望日確定で巻き戻さない', d3['STS JP'] === 'DC');
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

  // --- チャレンジ番号を店舗発の新規依頼に入力できる ---
  const created = ctx.apiShopCreateRequest(shopToken, {
    branchCode: 'VIE', team: '関東', groomName: 'A', hope1: '2026-09-10', challengeNo: 'CH-9001'
  });
  const kanri = created.kanriNo;
  check('店舗が入力したチャレンジ番号が保存される', ctx.apiGetReservationDetail(jpToken, kanri).detail['CHG NO'] === 'CH-9001');

  // --- CR→CF（キャンセルチャージあり）でもJP側に反映される（従来はCWだけ反映されていた不具合） ---
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'STS JP': 'OK' });
  ctx.apiSaveFieldsQuiet(jpToken, kanri, { 'STS JP': 'CR' });
  ctx.apiSaveFieldsQuiet(vieToken, kanri, { 'STS 支店': 'CF' });
  const afterCf = ctx.apiGetReservationDetail(jpToken, kanri).detail;
  check('支店がCFで応答するとSTS(支店側)がCFになる', afterCf['STS 支店'] === 'CF');
  check('不具合修正：CFの応答もSTS(JP側)へ反映される（従来はCWだけ反映されていた）', afterCf['STS JP'] === 'CF');

  // --- FN確定後、現地側も自分のSTS(支店側)をFNにできる（従来はロックされて変更不可だった不具合） ---
  const created2 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'B', hope1: '2026-10-01' });
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
  const created3 = ctx.apiShopCreateRequest(shopToken, { branchCode: 'VIE', team: '関東', groomName: 'C', hope1: '2026-11-01' });
  ctx.__mail.length = 0;
  ctx.apiCommitChanges(jpToken, created3.kanriNo, { '新婦名（ローマ字）': 'Renamed Bride' }, '');
  check('日本側が新婦名を変更して送信してもネームチェンジ通知になる',
        ctx.__mail.some(m => m.subj.includes('ネームチェンジ')));
  const afterNameChange = ctx.apiGetReservationDetail(jpToken, created3.kanriNo).detail;
  check('新婦名の変更自体は普通に保存される', afterNameChange['新婦名（ローマ字）'] === 'Renamed Bride');
}

// ---------------------------------------------------------------
console.log(`\n${'='.repeat(50)}\n結果: ${pass} 件成功 / ${fail} 件失敗\n${'='.repeat(50)}`);
process.exit(fail === 0 ? 0 : 1);
