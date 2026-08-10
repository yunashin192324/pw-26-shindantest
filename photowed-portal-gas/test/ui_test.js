// =====================================================
// 画面（フロントエンド）を実際にブラウザDOM上で動かすテスト
// -----------------------------------------------------
// gas_test.js はサーバー側(Code.gs)のロジックだけを検証しており、
// 画面側の不具合（ボタンが繋がっていない・保存後に別タブへ飛ぶ・
// チェックボックスの値が送られない等）は一切拾えていなかった。
// ここでは jsdom 上に実際の Index.html を組み立て、google.script.run を
// gas_harness の Code.gs へ繋いで、人が操作するのと同じ経路で検証する。
//
//   node ui_test.js
// =====================================================
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { makeContext } = require('./gas_harness');

const BASE = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '\n        → ' + extra : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// google.script.run は非同期なので、描画が終わるまで少し待つ
const settle = () => sleep(40);

// --- Code.gs 側（サーバー）を用意して、動かせる状態のデータを入れる ---
function makeServer() {
  const ctx = makeContext();
  const ss = ctx.__ss;
  ctx.setupPortal();

  // シードのパスコードは CHANGE-ME-*。ローマ支店を同意書必須にする
  const bm = ss.getSheetByName('支店マスタ');
  const head = bm.getRange(1, 1, 1, bm.getLastColumn()).getValues()[0];
  const codeCol = head.indexOf('支店コード') + 1;
  const consentCol = head.indexOf('同意書必須') + 1;
  const codes = bm.getRange(2, codeCol, bm.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < codes.length; i++) {
    if (String(codes[i][0]) === 'ROW') bm.getRange(i + 2, consentCol).setValue(true);
  }

  // セールマスタに候補を1件登録
  ss.getSheetByName('セールマスタ').appendRow(['ROW', '春の特典フェア', true]);

  // 案件を1件作る
  const H = ctx.RESERVATION_HEADERS;
  const row = new Array(H.length).fill('');
  const set = (k, v) => { const i = H.indexOf(k); if (i !== -1) row[i] = v; };
  set('支店コード', 'ROW'); set('管理番号', 'R-001'); set('管轄', '関東');
  set('新郎名（ローマ字）', 'Taro Yamada'); set('新婦名（ローマ字）', 'Hanako Yamada');
  set('STS JP', 'RQ'); set('ホテル', 'Hotel Roma');
  ss.getSheetByName('予約一覧').appendRow(row);
  return ctx;
}

// --- Index.html を jsdom で開けるHTMLに組み立てる ---
function buildHtml() {
  const index = fs.readFileSync(path.join(BASE, 'Index.html'), 'utf8');
  const css = fs.readFileSync(path.join(BASE, 'Stylesheet.html'), 'utf8');
  const js = fs.readFileSync(path.join(BASE, 'JavaScript.html'), 'utf8');
  return index
    .replace("<?!= include('Stylesheet'); ?>", css)
    .replace("<?!= include('JavaScript'); ?>", js);
}

async function openApp(ctx) {
  const dom = new JSDOM(buildHtml(), {
    runScripts: 'dangerously',
    url: 'https://script.google.com/', // localStorage を使えるようにするため origin が必要
    beforeParse(window) {
      // google.script.run を Code.gs（vmコンテキスト）へ橋渡しする
      function makeRunner() {
        let onSuccess = null, onFailure = null;
        const runner = {
          withSuccessHandler(fn) { onSuccess = fn; return runner; },
          withFailureHandler(fn) { onFailure = fn; return runner; }
        };
        Object.keys(ctx).forEach(key => {
          if (typeof ctx[key] !== 'function' || !/^api|^onConsent/.test(key)) return;
          runner[key] = (...args) => {
            setTimeout(() => {
              try {
                const out = ctx[key](...args);
                // GASは値をJSON経由で渡すので、同じくプレーンな値に落としてから返す
                if (onSuccess) onSuccess(JSON.parse(JSON.stringify(out === undefined ? null : out)));
              } catch (e) {
                if (onFailure) onFailure({ message: e.message });
              }
            }, 0);
          };
        });
        return runner;
      }
      window.google = { script: { get run() { return makeRunner(); } } };
      window.confirm = () => true;
      window.alert = () => {};
    }
  });
  await settle();
  return dom;
}

async function login(dom, code, passcode) {
  const { document } = dom.window;
  document.getElementById('login-branchcode').value = code;
  document.getElementById('login-passcode').value = passcode;
  document.getElementById('login-submit').click();
  await settle();
}

function activeTab(document) {
  const btn = document.querySelector('.tab-btn.active');
  return btn ? btn.dataset.tab : null;
}
function visiblePane(document) {
  const pane = [...document.querySelectorAll('.tab-pane')].find(p => !p.classList.contains('hidden'));
  return pane ? pane.dataset.tabPane : null;
}

(async () => {
  // ---------------------------------------------------------------
  section('U1. ログインして案件を開く');
  const ctx = makeServer();
  const dom = await openApp(ctx);
  const { document } = dom.window;

  const opts = [...document.getElementById('login-branchcode').options].map(o => o.value);
  check('ログイン画面に支店の選択肢が出る', opts.includes('ROW'), opts.slice(0, 5).join(','));

  await login(dom, 'ROW', 'CHANGE-ME-ROW');
  check('ログインするとヘッダーが表示される',
        !document.getElementById('app-header').classList.contains('hidden'));
  check('案件一覧にカードが出る', document.querySelectorAll('#reservation-list .res-card').length === 1,
        document.getElementById('reservation-list').innerHTML.slice(0, 200));

  document.querySelector('#reservation-list .res-card').click();
  await settle();
  check('案件詳細が開く', document.getElementById('detail-content').innerHTML.includes('R-001'));
  check('開いた直後はメッセージタブ', activeTab(document) === 'message', String(activeTab(document)));

  // ---------------------------------------------------------------
  section('U2. ①ドライブタブの見出しから「（納品）」が取れている');
  const driveTabBtn = [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'drive');
  driveTabBtn.click();
  await settle();
  const drivePane = document.querySelector('[data-tab-pane="drive"]');
  check('ドライブタブが表示される', visiblePane(document) === 'drive', String(visiblePane(document)));
  check('見出しが「Driveフォルダ URL」', drivePane.querySelector('h3').textContent.trim() === 'Driveフォルダ URL',
        drivePane.querySelector('h3').textContent);
  check('「（納品）」の文字が残っていない', !drivePane.innerHTML.includes('（納品）'));

  // ---------------------------------------------------------------
  section('U3. ②予約内容・現地記入欄タブの下部ボタンで確定できる');
  [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'reservation').click();
  await settle();
  const resPane = document.querySelector('[data-tab-pane="reservation"]');
  check('予約内容タブに「変更を決定して送信」ボタンがある', !!resPane.querySelector('.quick-commit-btn'));
  check('予約内容タブに「保存のみ」ボタンがある', !!resPane.querySelector('.quick-save-btn'));
  const localPane = document.querySelector('[data-tab-pane="local"]');
  check('現地記入欄タブにも両ボタンがある',
        !!localPane.querySelector('.quick-commit-btn') && !!localPane.querySelector('.quick-save-btn'));

  // 予約内容タブでホテル名を書き換え、そのタブの「保存のみ」で確定する
  const hotel = resPane.querySelector('[data-pending="ホテル"]');
  hotel.value = 'Hotel Nuovo';
  hotel.dispatchEvent(new dom.window.Event('change'));
  resPane.querySelector('.quick-save-btn').click();
  await settle();

  check('保存のみでサーバーに反映される',
        ctx.apiGetReservationDetail(ctx.apiLogin('ROW','CHANGE-ME-ROW').session.token, 'R-001').detail['ホテル'] === 'Hotel Nuovo');
  // ★これが今回の要望の肝：保存後にメッセージタブへ飛ばされないこと
  check('保存後も「予約内容」タブに留まる（メッセージタブに戻らない）',
        activeTab(document) === 'reservation', `実際: ${activeTab(document)}`);
  check('表示中のパネルも予約内容のまま', visiblePane(document) === 'reservation', String(visiblePane(document)));

  // 現地記入欄タブからも同様に確定できる
  [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'local').click();
  await settle();
  const pane2 = document.querySelector('[data-tab-pane="local"]');
  const pickup = pane2.querySelector('[data-pending="配車時間"]');
  pickup.value = '08:30';
  pickup.dispatchEvent(new dom.window.Event('change'));
  pane2.querySelector('.quick-commit-btn').click();
  await settle();
  const tok = ctx.apiLogin('ROW','CHANGE-ME-ROW').session.token;
  check('現地記入欄の「変更＋メッセージ」で保存される',
        ctx.apiGetReservationDetail(tok, 'R-001').detail['配車時間'] === '08:30');
  check('保存後も「現地記入欄」タブに留まる', activeTab(document) === 'local', `実際: ${activeTab(document)}`);

  // ---------------------------------------------------------------
  section('U4. ③タイトルがWEDLINKになっている');
  check('ヘッダーのブランド名がWEDLINK', document.querySelector('.brand').textContent.includes('WEDLINK'),
        document.querySelector('.brand').textContent);
  check('画面のどこにもPhotoWEDが残っていない', !document.body.innerHTML.includes('PhotoWED'));

  // ---------------------------------------------------------------
  section('U5. ④同意書のチェックが画面から保存できる');
  [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'reservation').click();
  await settle();
  const consent = document.querySelector('[data-pending="同意書"]');
  check('同意書のチェックボックスがある', !!consent);
  check('未回収なので初期状態はオフ', consent.checked === false);
  const consentLabel = consent.closest('label').textContent;
  check('必須支店には「必須」と表示される', consentLabel.includes('必須'), consentLabel.trim());
  check('未回収の警告が出る', consentLabel.includes('未回収'), consentLabel.trim());

  consent.checked = true;
  consent.dispatchEvent(new dom.window.Event('change'));
  document.querySelector('[data-tab-pane="reservation"] .quick-save-btn').click();
  await settle();
  check('チェックすると同意書が「済」で保存される',
        ctx.apiGetReservationDetail(tok, 'R-001').detail['同意書'] === '済',
        String(ctx.apiGetReservationDetail(tok, 'R-001').detail['同意書']));

  const consent2 = document.querySelector('[data-pending="同意書"]');
  check('再描画後もチェックが入ったまま表示される', consent2.checked === true);
  check('取得済みなら未回収の警告が消える',
        !consent2.closest('label').textContent.includes('未回収'));

  // 外す操作も効く（誤チェックの取り消し）
  consent2.checked = false;
  consent2.dispatchEvent(new dom.window.Event('change'));
  document.querySelector('[data-tab-pane="reservation"] .quick-save-btn').click();
  await settle();
  check('チェックを外すと未回収に戻せる',
        !ctx.apiGetReservationDetail(tok, 'R-001').detail['同意書'],
        String(ctx.apiGetReservationDetail(tok, 'R-001').detail['同意書']));

  // ---------------------------------------------------------------
  section('U6. ⑤セール名がマスタ候補＋自由入力で使える');
  const sale = document.querySelector('[data-pending="セール名"]');
  check('セール名の入力欄がある', !!sale);
  const dl = document.getElementById('sale-datalist');
  check('セールマスタの候補が出る',
        !!dl && [...dl.options].some(o => o.value === '春の特典フェア'),
        dl ? [...dl.options].map(o => o.value).join(',') : 'datalistなし');
  sale.value = '直前割引20%（自由入力）';
  sale.dispatchEvent(new dom.window.Event('change'));
  document.querySelector('[data-tab-pane="reservation"] .quick-save-btn').click();
  await settle();
  check('マスタに無いセール名も自由に保存できる',
        ctx.apiGetReservationDetail(tok, 'R-001').detail['セール名'] === '直前割引20%（自由入力）',
        String(ctx.apiGetReservationDetail(tok, 'R-001').detail['セール名']));

  // ---------------------------------------------------------------
  section('U7. XSS：スプレッドシート由来の文字列がスクリプトとして動かない');
  // 支店名・新郎名などに悪意ある文字列が入っても、エスケープされて実行されないこと
  const H = ctx.RESERVATION_HEADERS;
  const evil = '<img src=x onerror="window.__XSS=1">';
  const resSheet = ctx.__ss.getSheetByName('予約一覧');
  const groomCol = H.indexOf('新郎名（ローマ字）') + 1;
  resSheet.getRange(2, groomCol).setValue(evil);
  document.getElementById('nav-dashboard').click();
  await settle();
  document.querySelector('#reservation-list .res-card').click();
  await settle();
  check('危険な文字列を含む案件も詳細が開ける',
        document.getElementById('detail-content').innerHTML.includes('R-001'));
  check('スクリプトが実行されていない（XSSなし）', dom.window.__XSS === undefined);
  check('危険な文字列はエスケープされて表示される',
        document.querySelector('.names').textContent.includes('<img'),
        document.querySelector('.names').textContent);

  // ---------------------------------------------------------------
  section('U8. 当日表に同意書・セール名が出る');
  const shoot = ctx.__daysFromToday(3);
  const iso = `${shoot.getFullYear()}-${String(shoot.getMonth() + 1).padStart(2, '0')}-${String(shoot.getDate()).padStart(2, '0')}`;
  ctx.apiSaveFieldsQuiet(tok, 'R-001', { '撮影日FIX': iso, '配車時間': '09:00' });
  document.getElementById('nav-day').click();
  await settle();
  document.getElementById('day-date').value = iso;
  document.getElementById('day-submit').click();
  await settle();
  const dayHtml = document.getElementById('day-content').innerHTML;
  check('当日表に案件が出る', dayHtml.includes('R-001'), dayHtml.slice(0, 200));
  check('当日表にセール名が出る', dayHtml.includes('直前割引20%'), dayHtml.slice(0, 400));
  check('必須支店で未回収なら当日表に警告が出る', dayHtml.includes('同意書が未回収'), dayHtml.slice(0, 600));

  // ---------------------------------------------------------------
  section('U9. 未保存の変更がタブをまたいで保持される');
  document.getElementById('nav-dashboard').click();
  await settle();
  document.querySelector('#reservation-list .res-card').click();
  await settle();
  [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'reservation').click();
  await settle();
  const memoEl = document.querySelector('[data-pending="共有メモ"]');
  memoEl.value = 'あとで確定するメモ';
  memoEl.dispatchEvent(new dom.window.Event('change'));
  [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'message').click();
  await settle();
  const indicator = document.getElementById('pending-indicator');
  check('別タブへ移っても未保存件数が表示される',
        !indicator.classList.contains('hidden') && indicator.textContent.includes('1件'),
        indicator.textContent);
  document.getElementById('btn-save-quiet').click();
  await settle();
  check('メッセージタブからの保存も従来どおり動く',
        ctx.apiGetReservationDetail(tok, 'R-001').detail['共有メモ'] === 'あとで確定するメモ');

  console.log(`\n${'='.repeat(50)}\n画面テスト結果: ${pass} 件成功 / ${fail} 件失敗\n${'='.repeat(50)}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('テストが異常終了しました:', e); process.exit(1); });
