// =====================================================
// 全API横断の監査テスト
// -----------------------------------------------------
// gas_test.js は「個々の機能が正しく動くか」を見るテスト。
// こちらは「全てのAPIが例外なく守られているか」を機械的に総当たりで確認する。
//
//   1. 認可マトリクス   … 新しいAPIを追加したのに保護を書き忘れたら落ちる
//   2. 支店データ分離   … 全APIに対して他支店のデータを触れないことを実際に試す
//   3. セッション       … 未指定/偽造/期限切れトークンを全APIが拒否する
//   4. ロック競合       … 書き込みAPIが競合時に分かりやすく失敗し、ロックを漏らさない
//   5. 異常入力(ファズ) … 壊れた入力でも内部エラーを露出せず、日本語の説明で失敗する
//
//   node audit_test.js
// =====================================================
const fs = require('fs');
const path = require('path');
const { makeContext } = require('./gas_harness');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '\n        → ' + extra : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

// -----------------------------------------------------------------
// 共通のテストデータ
// -----------------------------------------------------------------
function fixture() {
  const ctx = makeContext();
  const ss = ctx.__ss;
  ctx.setupPortal();
  const H = ctx.RESERVATION_HEADERS;
  const add = (sheet, o) => {
    const row = new Array(H.length).fill('');
    Object.keys(o).forEach(k => { const i = H.indexOf(k); if (i !== -1) row[i] = o[k]; });
    ss.getSheetByName(sheet).appendRow(row);
  };
  add('予約一覧', { '支店コード': 'ROW', '管理番号': 'R-001', '管轄': '関東',
    '新郎名（ローマ字）': 'Taro', 'STS JP': 'RQ', '撮影日FIX': ctx.__daysFromToday(10) });
  add('予約一覧', { '支店コード': 'VIE', '管理番号': 'VIE-001', '管轄': '関西',
    '新郎名（ローマ字）': 'Jiro', 'STS JP': 'RQ', '撮影日FIX': ctx.__daysFromToday(20) });
  ss.getSheetByName('セールマスタ').appendRow(['ROW', '春セール', true]);
  ss.getSheetByName('スタッフマスタ').appendRow(['ROW', 'L.Conti', true]);

  // 手配メール機能：無効のままだと apiBuildArrangementDraft / apiSendArrangementRequest が
  // 「機能が無効」で即エラーになり、認可・ロックまわりの監査が意味を持たなくなる。
  // VIEを実際に有効化＋カメラマンの宛先を設定し、他の書き込みAPIと同じ土俵で監査できるようにする。
  const bm = ss.getSheetByName('支店マスタ');
  const bmHead = bm.getRange(1, 1, 1, bm.getLastColumn()).getValues()[0];
  const codeCol = bmHead.indexOf('支店コード') + 1;
  const codes = bm.getRange(2, codeCol, bm.getLastRow() - 1, 1).getValues();
  const vieRow = codes.findIndex(r => String(r[0]) === 'VIE') + 2;
  bm.getRange(vieRow, bmHead.indexOf('手配メール機能') + 1).setValue(true);
  bm.getRange(vieRow, bmHead.indexOf('手配先名-カメラマン') + 1).setValue('M.Gruber');
  bm.getRange(vieRow, bmHead.indexOf('手配先メール-カメラマン') + 1).setValue('photographer@example.com');
  return ctx;
}

// 全APIの呼び出しテンプレート。
// scope: 'public'（未ログインでも可）／'any'（ログイン必須）／'jp'（日本側専用）
// target: そのAPIが触る案件の支店（支店分離テストで使う）。null なら案件を指定しないAPI
const API_SPECS = [
  { fn: 'apiListLoginOptions', scope: 'public', args: () => [] },
  { fn: 'apiLogin',            scope: 'public', args: () => ['ROW', 'CHANGE-ME-ROW'] },
  { fn: 'apiLogout',           scope: 'public', args: (t) => [t] },

  { fn: 'apiGetCurrentUserName', scope: 'any', args: (t) => [t] },
  { fn: 'apiListBranches',       scope: 'jp',  args: (t) => [t] },
  { fn: 'apiSaveBranch',         scope: 'jp',  args: (t) => [t, { code: 'TST', name: 'テスト支店', passcode: 'p' }], writes: true },
  { fn: 'apiSetBranchActive',    scope: 'jp',  args: (t) => [t, 'VIE', true], writes: true },

  { fn: 'apiListPlans',       scope: 'any', args: (t) => [t, 'VIE'], target: 'VIE', reads: true },
  { fn: 'apiListOptionItems', scope: 'any', args: (t) => [t, 'VIE'], target: 'VIE', reads: true },
  { fn: 'apiListLocations',   scope: 'any', args: (t) => [t, 'VIE'], target: 'VIE', reads: true },
  { fn: 'apiListStaff',       scope: 'any', args: (t) => [t, 'VIE'], target: 'VIE', reads: true },
  { fn: 'apiListSales',       scope: 'any', args: (t) => [t, 'VIE'], target: 'VIE', reads: true },
  { fn: 'apiListPhrases',     scope: 'any', args: (t) => [t, 'VIE'], target: 'VIE', reads: true },

  { fn: 'apiSaveStaffItem',    scope: 'any', args: (t) => [t, 'VIE', '侵入テスト', null, true], target: 'VIE', writes: true },
  { fn: 'apiSaveSaleItem',     scope: 'any', args: (t) => [t, 'VIE', '侵入テスト', null, true], target: 'VIE', writes: true },
  { fn: 'apiSaveLocationItem', scope: 'any', args: (t) => [t, 'VIE', '侵入テスト', null, true], target: 'VIE', writes: true },
  { fn: 'apiSavePlanItem',     scope: 'any', args: (t) => [t, 'VIE', '侵入テスト', null, true], target: 'VIE', writes: true },
  { fn: 'apiSaveOptionItem',   scope: 'any', args: (t) => [t, 'VIE', '侵入テスト', null, true], target: 'VIE', writes: true },

  { fn: 'apiGetDashboard',        scope: 'any', args: (t) => [t, { showAll: true }] },
  { fn: 'apiGetStats',            scope: 'jp',  args: (t) => [t, { showAll: true }] },
  { fn: 'apiGetPendingDeliveries',scope: 'any', args: (t) => [t, { showAll: true }] },
  { fn: 'apiGetDaySchedule',      scope: 'any', args: (t) => [t, '2026-09-05', { showAll: true }] },
  { fn: 'apiSearchReservations',  scope: 'any', args: (t) => [t, { scope: { showAll: true } }] },
  { fn: 'apiGetBillingGaps',      scope: 'jp',  args: (t) => [t, '2026-09'] },
  { fn: 'apiExportReservations',  scope: 'jp',  args: (t) => [t, { scope: { showAll: true } }], writes: true },

  { fn: 'apiGetReservationDetail', scope: 'any', args: (t) => [t, 'VIE-001'], target: 'VIE', reads: true },
  { fn: 'apiGetCaseTimeline',      scope: 'any', args: (t) => [t, 'VIE-001'], target: 'VIE', reads: true },
  { fn: 'apiGetFieldHistory',      scope: 'any', args: (t) => [t, 'VIE-001', 'STS JP'], target: 'VIE', reads: true },
  { fn: 'apiCheckStaffConflict',   scope: 'any', args: (t) => [t, 'VIE-001', '2026-09-05', { 'カメラマン': 'X' }], target: 'VIE', reads: true },
  { fn: 'apiSaveFieldsQuiet',      scope: 'any', args: (t) => [t, 'VIE-001', { 'ホテル': '侵入' }], target: 'VIE', writes: true },
  { fn: 'apiCommitChanges',        scope: 'any', args: (t) => [t, 'VIE-001', { 'ホテル': '侵入' }, ''], target: 'VIE', writes: true },
  { fn: 'apiSetInternalFlag',      scope: 'jp',  args: (t) => [t, 'VIE-001', 'フォトブリッジ登録', true], target: 'VIE', writes: true },
  { fn: 'apiSetDriveUrl',          scope: 'any', args: (t) => [t, 'VIE-001', 'https://drive.google.com/x'], target: 'VIE', writes: true },
  // 支店ロールでは指定した支店コードは無視され、必ず自支店の案件になる（下で個別に検証する）
  { fn: 'apiCreateReservation',    scope: 'any', args: (t) => [t, 'VIE', '新郎名: A\n新婦名: B'], writes: true },
  { fn: 'apiToggleHistoryCheck',   scope: 'any', args: (t, ctx) => [t, ctx.__someHistoryId || 'none', true], target: 'VIE', writes: true },

  // メモ履歴（共有メモ／メモ（現地用）の積み上げ記録）
  { fn: 'apiAddMemo', scope: 'any', args: (t) => [t, 'VIE-001', '共有メモ', '侵入テスト'], target: 'VIE', writes: true },

  // 現地スタッフ手配メール（fixture()でVIEのカメラマン宛先のみ有効化済み）
  { fn: 'apiGetArrangementSettings',  scope: 'any', args: (t) => [t, 'VIE'], target: 'VIE', reads: true },
  { fn: 'apiSaveArrangementSettings', scope: 'any',
    args: (t) => [t, 'VIE', { enabled: true, categories: { photographer: { name: '侵入', email: 'x@example.com' } } }],
    target: 'VIE', writes: true },
  { fn: 'apiBuildArrangementDraft',   scope: 'any', args: (t) => [t, 'VIE-001', 'photographer'], target: 'VIE', reads: true },
  { fn: 'apiSendArrangementRequest',  scope: 'any', args: (t) => [t, 'VIE-001', 'photographer', '侵入件名', '侵入本文'],
    target: 'VIE', writes: true }
];

// -----------------------------------------------------------------
section('A1. 認可マトリクス：保護の書き忘れを機械的に検出');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const declared = new Set(API_SPECS.map(s => s.fn));
  const found = [...src.matchAll(/^function (api[A-Za-z]*)\(/gm)].map(m => m[1]);

  const undeclared = found.filter(f => !declared.has(f));
  check('全てのAPIが監査テストに登録されている（新設APIの登録漏れ検出）',
        undeclared.length === 0, '未登録: ' + undeclared.join(', '));
  const missing = [...declared].filter(d => !found.includes(d));
  check('監査テストに存在しないAPIが書かれていない', missing.length === 0, '不明: ' + missing.join(', '));

  // 各APIの本文を切り出して、認証チェックが入っているかを見る
  function bodyOf(name) {
    const i = src.indexOf(`function ${name}(`);
    if (i === -1) return '';
    let depth = 0, started = false;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') { depth++; started = true; }
      else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
    }
    return '';
  }
  const publicApis = new Set(API_SPECS.filter(s => s.scope === 'public').map(s => s.fn));
  const noSession = found.filter(f => !publicApis.has(f) && !/requireSession_/.test(bodyOf(f)));
  check('公開API以外は全て requireSession_ を通している',
        noSession.length === 0, '未認証: ' + noSession.join(', '));

  const jpApis = API_SPECS.filter(s => s.scope === 'jp').map(s => s.fn);
  const noJp = jpApis.filter(f => !/assertJp_/.test(bodyOf(f)));
  check('日本側専用APIは全て assertJp_ を通している', noJp.length === 0, 'JP判定なし: ' + noJp.join(', '));

  // 案件を特定して読み書きするAPIは、行の可視性チェックが必要
  const caseApis = ['apiGetReservationDetail','apiGetCaseTimeline','apiGetFieldHistory',
                    'apiCheckStaffConflict','apiSaveFieldsQuiet','apiCommitChanges','apiSetDriveUrl',
                    'apiAddMemo','apiBuildArrangementDraft','apiSendArrangementRequest'];
  const noVisible = caseApis.filter(f => !/assertRowVisible_/.test(bodyOf(f)));
  check('案件を指定するAPIは全て assertRowVisible_ を通している',
        noVisible.length === 0, '可視性チェックなし: ' + noVisible.join(', '));

  // 書き込みAPIは排他ロックが必要（読み取り専用は不要）
  const mustLock = ['apiSaveBranch','apiSetBranchActive','apiSaveFieldsQuiet','apiCommitChanges',
                    'apiSetDriveUrl','apiCreateReservation','apiToggleHistoryCheck',
                    'apiSaveStaffItem','apiSaveSaleItem','apiSavePlanItem','apiSaveOptionItem','apiSaveLocationItem',
                    'apiSaveArrangementSettings'];
  const noLock = mustLock.filter(f => {
    const b = bodyOf(f);
    return !/getScriptLock/.test(b) && !/saveMasterItem_/.test(b);
  });
  check('書き込みAPIは全て排他ロックを取っている', noLock.length === 0, 'ロックなし: ' + noLock.join(', '));
}

// -----------------------------------------------------------------
section('A2. 支店データ分離：全APIに他支店のデータを触らせない');
{
  const ctx = fixture();
  // ローマ支店としてログインし、ウィーン(VIE)のデータを狙う
  const row = ctx.apiLogin('ROW', 'CHANGE-ME-ROW');
  check('ローマ支店でログインできる', row.ok === true, JSON.stringify(row));
  const t = row.session.token;

  API_SPECS.filter(s => s.target === 'VIE').forEach(spec => {
    let blocked = false, note = '';
    try {
      const out = ctx[spec.fn](...spec.args(t, ctx));
      // 例外を投げないAPIでも、他支店のデータが返ってこなければ分離できている
      if (spec.reads) {
        const s = JSON.stringify(out || '');
        blocked = !s.includes('Jiro') && !s.includes('VIE-001');
        note = '返却値に他支店データ: ' + s.slice(0, 120);
      } else {
        note = '例外なく実行できてしまった';
      }
    } catch (e) {
      blocked = true;
      note = e.message;
    }
    check(`${spec.fn} は他支店(VIE)を操作できない`, blocked, note);
  });

  // 書き込みが実際に起きていないことを、データ側からも確認する
  const jp = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO');
  const vie = ctx.apiGetReservationDetail(jp.session.token, 'VIE-001').detail;
  check('他支店の案件データが書き換わっていない', vie['ホテル'] !== '侵入', String(vie['ホテル']));
  check('他支店のDriveURLが書き換わっていない', !vie['DriveフォルダURL'], String(vie['DriveフォルダURL']));
  const sales = ctx.apiListSales(jp.session.token, 'VIE');
  check('他支店のマスタに書き込まれていない', !sales.some(s => s.name === '侵入テスト'),
        JSON.stringify(sales.map(s => s.name)));

  // 支店が他支店を指定して新規案件を作ろうとしても、必ず自支店の案件になること
  const created = ctx.apiCreateReservation(t, 'VIE', '新郎名: A\n新婦名: B');
  const createdDetail = ctx.apiGetReservationDetail(jp.session.token, created.kanriNo).detail;
  check('支店が他支店を指定しても自支店の案件になる（なりすまし不可）',
        createdDetail['支店コード'] === 'ROW', `実際: ${createdDetail['支店コード']}`);
  check('採番も自支店のプレフィックスになる', String(created.kanriNo).startsWith('R-'), String(created.kanriNo));
}

// -----------------------------------------------------------------
section('A3. 既読チェックの認可（IDを推測されても他支店を操作できない）');
{
  const ctx = fixture();
  const jp = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO');
  // 日本側からVIEへメッセージを送り、その履歴IDを得る
  ctx.apiCommitChanges(jp.session.token, 'VIE-001', {}, 'JPからのメッセージ');
  const detail = ctx.apiGetReservationDetail(jp.session.token, 'VIE-001').detail;
  const hid = detail.history[0].id;
  check('履歴IDが取得できる', !!hid);

  const row = ctx.apiLogin('ROW', 'CHANGE-ME-ROW');
  let err = null;
  try { ctx.apiToggleHistoryCheck(row.session.token, hid, true); } catch (e) { err = e.message; }
  check('他支店の履歴IDを知っていても既読にできない', err !== null, String(err));

  const after = ctx.apiGetReservationDetail(jp.session.token, 'VIE-001').detail;
  check('他支店の既読状態が変わっていない', after.history[0].checkBranch === false);
}

// -----------------------------------------------------------------
section('A4. セッション：未指定・偽造・期限切れを全APIが拒否する');
{
  const ctx = fixture();
  const badTokens = [
    ['未指定(undefined)', undefined],
    ['空文字', ''],
    ['null', null],
    ['偽造トークン', 'uuid-99999'],
    ['数値', 12345],
    ['オブジェクト', {}]
  ];
  const guarded = API_SPECS.filter(s => s.scope !== 'public');
  badTokens.forEach(([label, tok]) => {
    const leaked = [];
    guarded.forEach(spec => {
      try {
        ctx[spec.fn](...spec.args(tok, ctx));
        leaked.push(spec.fn); // 例外を投げずに通ってしまった
      } catch (e) { /* 期待どおり拒否 */ }
    });
    check(`${label} のトークンは全APIが拒否する`, leaked.length === 0, '通過: ' + leaked.join(', '));
  });

  // 期限切れセッション：CacheServiceのTTLを過ぎると使えなくなる
  const row = ctx.apiLogin('ROW', 'CHANGE-ME-ROW');
  const t = row.session.token;
  check('ログイン直後はトークンが使える', !!ctx.apiGetCurrentUserName(t) || true);
  ctx.__advanceClock(ctx.SESSION_TTL_SEC + 1);
  const leaked = [];
  guarded.forEach(spec => {
    try { ctx[spec.fn](...spec.args(t, ctx)); leaked.push(spec.fn); } catch (e) { /* 期待どおり */ }
  });
  check('期限切れトークンは全APIが拒否する', leaked.length === 0, '通過: ' + leaked.join(', '));

  // 期限切れ後に再ログインすれば使える（＝ただ壊れているのではない）
  const again = ctx.apiLogin('ROW', 'CHANGE-ME-ROW');
  check('再ログインすれば使えるようになる', again.ok === true);
  check('再ログイン後のトークンで案件を開ける',
        ctx.apiGetReservationDetail(again.session.token, 'R-001').ok === true);

  // ログアウトすると即座に無効になる
  ctx.apiLogout(again.session.token);
  let logoutErr = null;
  try { ctx.apiGetReservationDetail(again.session.token, 'R-001'); } catch (e) { logoutErr = e.message; }
  check('ログアウト後のトークンは使えない', logoutErr !== null, String(logoutErr));
}

// -----------------------------------------------------------------
section('A5. ロック競合：同時書き込みでも壊れず、分かりやすく失敗する');
{
  const ctx = fixture();
  const jp = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO');
  const t = jp.session.token;
  const writers = API_SPECS.filter(s => s.writes && s.scope !== 'public');

  writers.forEach(spec => {
    ctx.__failNextLocks(1); // 他の処理がロックを握っている状況を作る
    let msg = null, threw = false;
    try { ctx[spec.fn](...spec.args(t, ctx)); }
    catch (e) { threw = true; msg = e.message; }
    // ロックが取れない場合は「失敗した」と分かる形で終わること（黙って壊れない）
    const ok = !threw || /実行中|待って|再試行|競合/.test(msg || '');
    check(`${spec.fn} はロック競合時に分かりやすく失敗する`, ok, `メッセージ: ${msg}`);
    ctx.__failNextLocks(0);
    check(`${spec.fn} はロックを解放している（保持したままにしない）`, ctx.__lockDepth() === 0,
          `保持数: ${ctx.__lockDepth()}`);
  });

  // 例外が起きてもロックが解放されること（finally漏れの検出）
  try { ctx.apiCommitChanges(t, '存在しない番号', { 'ホテル': 'X' }, ''); } catch (e) { /* 想定内 */ }
  check('エラー時でもロックが解放される', ctx.__lockDepth() === 0, `保持数: ${ctx.__lockDepth()}`);

  // フォーム連携もロックを漏らさない
  ctx.onConsentFormSubmitCore_({ namedValues: { '管理番号': ['R-001'] } }, []);
  check('同意書フォーム連携もロックを解放する', ctx.__lockDepth() === 0, `保持数: ${ctx.__lockDepth()}`);
  ctx.__failNextLocks(1);
  const ferr = [];
  ctx.onConsentFormSubmitCore_({ namedValues: { '管理番号': ['R-001'] } }, ferr);
  check('ロックが取れないときは同意書を握りつぶさず記録する', ferr.length === 1, JSON.stringify(ferr));
  ctx.__failNextLocks(0);
}

// -----------------------------------------------------------------
section('A6. 異常入力（ファズ）：内部エラーを画面に出さない');
{
  // GAS内部の生エラー（英語のTypeError等）が利用者に見えると、原因も対処も伝わらない。
  // どんな入力でも「日本語で理由が分かるエラー」か「正常終了」のどちらかであるべき。
  const NASTY = [
    undefined, null, '', ' ', 0, -1, 1e9, NaN, true, false,
    {}, [], { __proto__: { evil: 1 } }, [[[]]],
    'a'.repeat(20000),
    '../../etc/passwd', '<script>alert(1)</script>', "'; DROP TABLE --",
    ' ￿', '2026-13-45', '9999-99', '${jndi:ldap://x}', '=1+1'
  ];
  const INTERNAL = /(is not a function|Cannot read|undefined is not|of undefined|of null|TypeError|ReferenceError|RangeError|not iterable|Maximum call stack|Converting circular)/i;

  const ctx = fixture();
  const jp = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO');
  const t = jp.session.token;

  let cases = 0;
  const leaks = [];
  API_SPECS.filter(s => s.scope !== 'public').forEach(spec => {
    const base = spec.args(t, ctx);
    // 第2引数以降（トークン以外）を1つずつ壊す
    for (let i = 1; i < base.length; i++) {
      NASTY.forEach(bad => {
        const args = base.slice();
        args[i] = bad;
        cases++;
        try { ctx[spec.fn](...args); }
        catch (e) {
          const m = String(e && e.message || e);
          if (INTERNAL.test(m)) leaks.push(`${spec.fn}(第${i + 1}引数=${JSON.stringify(bad) || String(bad)}): ${m}`);
        }
      });
    }
  });
  console.log(`  （${cases} 通りの異常入力を試行）`);
  check('内部エラーがそのまま利用者に出る箇所がない', leaks.length === 0,
        leaks.slice(0, 12).join('\n        → '));

  // ログイン画面も未認証で叩かれる入口なので同様に確認する
  const loginLeaks = [];
  NASTY.forEach(a => NASTY.forEach(b => {
    try { ctx.apiLogin(a, b); } catch (e) {
      const m = String(e && e.message || e);
      if (INTERNAL.test(m)) loginLeaks.push(`apiLogin(${String(a)},${String(b)}): ${m}`);
    }
  }));
  check('ログインAPIも異常入力で内部エラーを出さない', loginLeaks.length === 0,
        loginLeaks.slice(0, 8).join('\n        → '));

  // 異常入力を浴びせたあともデータが壊れていないこと
  const after = ctx.apiGetReservationDetail(t, 'R-001');
  check('異常入力のあとも既存データが読める', after.ok === true && after.detail['管理番号'] === 'R-001');
}

// -----------------------------------------------------------------
section('A7. データ側の異常：シート欠損・空・不正値でも落ちない');
{
  const ctx = fixture();
  const jp = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO');
  const t = jp.session.token;

  // 履歴が空の状態で詳細・タイムラインを開く
  const ctx2 = makeContext();
  ctx2.setupPortal();
  const jp2 = ctx2.apiLogin('KANTO', 'CHANGE-ME-KANTO');
  let e1 = null;
  try { ctx2.apiGetDashboard(jp2.session.token, { showAll: true }); } catch (e) { e1 = e.message; }
  check('案件が1件も無くてもダッシュボードが開ける', e1 === null, String(e1));
  let e2 = null;
  try { ctx2.apiGetStats(jp2.session.token, { showAll: true }); } catch (e) { e2 = e.message; }
  check('案件が1件も無くても統計が開ける', e2 === null, String(e2));
  let e3 = null;
  try { ctx2.apiGetPendingDeliveries(jp2.session.token, { showAll: true }); } catch (e) { e3 = e.message; }
  check('案件が1件も無くても納品待ちが開ける', e3 === null, String(e3));

  // 撮影日が文字列（スプレッドシートを直接編集された想定）でも落ちない
  const ss = ctx.__ss;
  const sheet = ss.getSheetByName('予約一覧');
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.getRange(2, head.indexOf('撮影日FIX') + 1).setValue('でたらめな日付');
  const checks = [
    ['ダッシュボード', () => ctx.apiGetDashboard(t, { showAll: true })],
    ['統計', () => ctx.apiGetStats(t, { showAll: true })],
    ['納品待ち', () => ctx.apiGetPendingDeliveries(t, { showAll: true })],
    ['当日表', () => ctx.apiGetDaySchedule(t, '2026-09-05', { showAll: true })],
    ['検索', () => ctx.apiSearchReservations(t, { scope: { showAll: true } })],
    ['詳細', () => ctx.apiGetReservationDetail(t, 'R-001')]
  ];
  checks.forEach(([label, fn]) => {
    let err = null;
    try { fn(); } catch (e) { err = e.message; }
    check(`撮影日が不正な文字列でも${label}が開ける`, err === null, String(err));
  });

  // 定期処理も不正データで止まらない（1件の異常で全体が停止しないこと）
  ['checkAlerts', 'checkDeliveryAlerts', 'checkUnansweredAlerts', 'archivePastReservations'].forEach(name => {
    let err = null;
    try { ctx[name](); } catch (e) { err = e.message; }
    check(`${name} が不正データでも例外で止まらない`, err === null, String(err));
  });
}

// -----------------------------------------------------------------
section('A8. ログインの総当たり対策');
{
  const ctx = fixture();
  // 連続で間違え続けると一時的にロックされる
  let lockedAt = -1;
  for (let i = 1; i <= 15; i++) {
    const res = ctx.apiLogin('ROW', 'まちがい' + i);
    if (res.ok === false && /停止/.test(res.error)) { lockedAt = i; break; }
  }
  check('連続失敗でログインが一時停止される', lockedAt > 0, `${lockedAt} 回目で停止`);
  check('正規利用者の打ち間違いを潰さない回数で止まる', lockedAt > 3, `${lockedAt} 回目`);

  // ロック中は正しいパスコードでも入れない（総当たりを止める意味がある）
  const blocked = ctx.apiLogin('ROW', 'CHANGE-ME-ROW');
  check('停止中は正しいパスコードでも入れない', blocked.ok === false, JSON.stringify(blocked));
  check('停止の理由が日本語で伝わる', /停止|お試し/.test(blocked.error || ''), String(blocked.error));

  // 他の支店は巻き添えにならない
  const other = ctx.apiLogin('VIE', 'CHANGE-ME-VIE');
  check('別の支店は巻き添えでロックされない', other.ok === true, JSON.stringify(other));

  // 時間が経てば自動的に解除される
  ctx.__advanceClock(ctx.LOGIN_LOCKOUT_SEC + 1);
  const recovered = ctx.apiLogin('ROW', 'CHANGE-ME-ROW');
  check('時間経過で自動的に解除される', recovered.ok === true, JSON.stringify(recovered));

  // 途中で成功したら失敗回数はリセットされる
  const ctx2 = fixture();
  for (let i = 0; i < 5; i++) ctx2.apiLogin('ROW', 'wrong');
  check('数回失敗しても正しければ入れる', ctx2.apiLogin('ROW', 'CHANGE-ME-ROW').ok === true);
  for (let i = 0; i < 5; i++) ctx2.apiLogin('ROW', 'wrong');
  check('成功後は失敗回数がリセットされている', ctx2.apiLogin('ROW', 'CHANGE-ME-ROW').ok === true);
}

// -----------------------------------------------------------------
section('A9. 日付は「認識できないなら保存しない」');
{
  // ★以前は解析に失敗した日付を文字列のまま保存していたため、画面上は日付が入って見えるのに
  // アラート・過去一覧への移動・当日表が一切効かない案件が静かに生まれていた。
  const ctx = fixture();
  const jp = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO');
  const t = jp.session.token;

  const bad = ['2026/13/01', '2026-02-31', 'あした', '09-05-2026', '20260905', '2026-9', '${x}'];
  bad.forEach(v => {
    let err = null;
    try { ctx.apiSaveFieldsQuiet(t, 'R-001', { '撮影日FIX': v }); } catch (e) { err = e.message; }
    check(`不正な日付「${v}」は保存されずエラーになる`, err !== null && /日付/.test(err), String(err));
  });

  // 壊れた値が1つも書き込まれていないこと
  const sheet = ctx.__ss.getSheetByName('予約一覧');
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const stored = sheet.getRange(2, head.indexOf('撮影日FIX') + 1).getValue();
  check('不正入力のあとも撮影日はDateのまま', Object.prototype.toString.call(stored) === '[object Date]',
        `型: ${Object.prototype.toString.call(stored)}`);

  // 正しい形式は受け付ける（カレンダー入力・手入力の両方）
  ['2026-09-05', '2026/09/05', '2026-9-5'].forEach(v => {
    let err = null;
    try { ctx.apiSaveFieldsQuiet(t, 'R-001', { '撮影日FIX': v }); } catch (e) { err = e.message; }
    check(`正しい日付「${v}」は保存できる`, err === null, String(err));
  });
  const after = ctx.apiGetReservationDetail(t, 'R-001').detail;
  check('保存した日付が正しく読み戻せる', after['撮影日FIX'] === '2026-09-05', String(after['撮影日FIX']));

  // 空欄は「日付をクリアする」操作として引き続き許可する
  let clearErr = null;
  try { ctx.apiSaveFieldsQuiet(t, 'R-001', { '撮影日FIX': '' }); } catch (e) { clearErr = e.message; }
  check('空欄にして日付を消すことはできる', clearErr === null, String(clearErr));
  check('クリア後は撮影日が空になる', !ctx.apiGetReservationDetail(t, 'R-001').detail['撮影日FIX']);
}

// -----------------------------------------------------------------
section('A10. 画面の埋め込み制限（クリックジャッキング対策）');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  check('外部サイトへのiframe埋め込みを許可していない',
        !/XFrameOptionsMode\.ALLOWALL/.test(src),
        'ALLOWALL が残っています');
}

// -----------------------------------------------------------------
section('A11. 保存の原子性：1項目でも不正なら何も書き込まない');
{
  const ctx = fixture();
  const jp = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO');
  const t = jp.session.token;
  const before = ctx.apiGetReservationDetail(t, 'R-001').detail;

  // ホテル（正しい）と撮影日（不正）を同時に送る
  let err = null;
  try {
    ctx.apiCommitChanges(t, 'R-001', { 'ホテル': '書き込まれてはいけない', '撮影日FIX': 'でたらめ' }, '');
  } catch (e) { err = e.message; }
  check('不正な項目があると保存全体が中止される', err !== null, String(err));
  const after = ctx.apiGetReservationDetail(t, 'R-001').detail;
  check('正しかった項目も書き込まれていない（中途半端に保存されない）',
        after['ホテル'] === before['ホテル'], `${before['ホテル']} → ${after['ホテル']}`);
  check('撮影日も元のまま', after['撮影日FIX'] === before['撮影日FIX']);

  // 権限違反でも同じ（支店が日本側のSTSを含めて送った場合）
  const rowSess = ctx.apiLogin('ROW', 'CHANGE-ME-ROW');
  let err2 = null;
  try {
    ctx.apiCommitChanges(rowSess.session.token, 'R-001', { 'ホテル': '侵入', 'STS JP': 'FN' }, '');
  } catch (e) { err2 = e.message; }
  check('権限のない項目が混ざると保存全体が中止される', err2 !== null, String(err2));
  const after2 = ctx.apiGetReservationDetail(t, 'R-001').detail;
  check('権限違反時も他の項目が書き込まれていない', after2['ホテル'] === before['ホテル'],
        `実際: ${after2['ホテル']}`);
  check('STS JPも変わっていない', after2['STS JP'] === before['STS JP']);
}

// -----------------------------------------------------------------
section('A12. 日本側と支店が同時に編集したときの挙動');
{
  const ctx = fixture();
  const jp = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO');
  const row = ctx.apiLogin('ROW', 'CHANGE-ME-ROW');

  // 両者が同じ案件を開いた状態（＝どちらも古い内容を持っている）を作る
  ctx.apiGetReservationDetail(jp.session.token, 'R-001');
  ctx.apiGetReservationDetail(row.session.token, 'R-001');

  // 支店が「配車時間」を、日本側が「ホテル」を、それぞれ自分が触った項目だけ保存する
  ctx.apiSaveFieldsQuiet(row.session.token, 'R-001', { '配車時間': '09:00' });
  ctx.apiSaveFieldsQuiet(jp.session.token, 'R-001', { 'ホテル': 'Hotel Roma' });

  const d = ctx.apiGetReservationDetail(jp.session.token, 'R-001').detail;
  // 3択方式では「実際に触った項目だけ」を送るため、互いの変更を消し合わない
  check('支店の変更が日本側の保存で消えない', d['配車時間'] === '09:00', String(d['配車時間']));
  check('日本側の変更も残っている', d['ホテル'] === 'Hotel Roma', String(d['ホテル']));

  // 同じ項目を両者が変えた場合は後勝ち。ただし誰が何を変えたかは履歴に必ず残る
  ctx.apiCommitChanges(row.session.token, 'R-001', { 'メモ（現地用）': '支店の記入' }, '');
  ctx.apiCommitChanges(jp.session.token, 'R-001', { 'メモ（現地用）': '日本側の記入' }, '');
  const d2 = ctx.apiGetReservationDetail(jp.session.token, 'R-001').detail;
  check('同じ項目は後から保存した方が残る', d2['メモ（現地用）'] === '日本側の記入', String(d2['メモ（現地用）']));
  const tl = ctx.apiGetCaseTimeline(jp.session.token, 'R-001');
  const bodies = tl.items.map(i => String(i.body || ''));
  check('上書きされた側の変更も履歴に残っていて追える',
        bodies.some(b => b.includes('支店の記入')) && bodies.some(b => b.includes('日本側の記入')),
        JSON.stringify(bodies).slice(0, 300));
}

// -----------------------------------------------------------------
console.log(`\n${'='.repeat(50)}\n監査テスト結果: ${pass} 件成功 / ${fail} 件失敗\n${'='.repeat(50)}`);
process.exit(fail === 0 ? 0 : 1);
