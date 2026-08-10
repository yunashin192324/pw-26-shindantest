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
  return ctx;
}
function addCase(ctx, sheetName, o) {
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  Object.keys(o).forEach(k => { const i = H.indexOf(k); if (i !== -1) row[i] = o[k]; });
  ctx.__ss.getSheetByName(sheetName).appendRow(row);
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

// ---------------------------------------------------------------
console.log(`\n${'='.repeat(50)}\n結果: ${pass} 件成功 / ${fail} 件失敗\n${'='.repeat(50)}`);
process.exit(fail === 0 ? 0 : 1);
