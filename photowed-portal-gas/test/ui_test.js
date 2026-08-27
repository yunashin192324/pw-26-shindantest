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

  // ★機能追加：店舗ロールのログインを1件用意する
  const shopRowIdx = bm.getLastRow() + 1;
  const setBm = (name, val) => bm.getRange(shopRowIdx, head.indexOf(name) + 1).setValue(val);
  setBm('支店コード', 'SHOP1');
  setBm('支店名', '新宿店');
  setBm('ロール', 'SHOP');
  setBm('ログインパスコード', 'CHANGE-ME-SHOP1');
  setBm('通知先メール', 'shop1@example.com');
  setBm('有効', true);

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

  // 予約内容タブで備考を書き換え、そのタブの「保存のみ」で確定する
  const remarks = resPane.querySelector('[data-pending="備考"]');
  remarks.value = '会場までの送迎希望';
  remarks.dispatchEvent(new dom.window.Event('change'));
  resPane.querySelector('.quick-save-btn').click();
  await settle();

  check('保存のみでサーバーに反映される',
        ctx.apiGetReservationDetail(ctx.apiLogin('ROW','CHANGE-ME-ROW').session.token, 'R-001').detail['備考'] === '会場までの送迎希望');
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
  // ★機能追加：共有メモ／メモ（現地用）は積み上げ式（memoLog）に変わり、3択保留の対象外になったため、
  // ここでは引き続き3択保留の対象である「備考」で「タブをまたいでも未保存の変更が残る」ことを確認する
  const remarksEl = document.querySelector('[data-pending="備考"]');
  remarksEl.value = 'あとで確定する備考';
  remarksEl.dispatchEvent(new dom.window.Event('change'));
  [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'message').click();
  await settle();
  const indicator = document.getElementById('pending-indicator');
  check('別タブへ移っても未保存件数が表示される',
        !indicator.classList.contains('hidden') && indicator.textContent.includes('1件'),
        indicator.textContent);
  document.getElementById('btn-save-quiet').click();
  await settle();
  check('メッセージタブからの保存も従来どおり動く',
        ctx.apiGetReservationDetail(tok, 'R-001').detail['備考'] === 'あとで確定する備考');

  // ---------------------------------------------------------------
  section('U10. 日本記入欄（日本側のみ）');
  // ここまでは支店（ローマ）としてログインしていたため、まず日本側（関東手配課）でログインし直す
  document.getElementById('nav-logout').click();
  await settle();
  await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
  document.querySelector('#reservation-list .res-card').click();
  await settle();
  check('日本側には「日本記入欄」タブが出る',
        !![...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'jpEntry'));
  [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'jpEntry').click();
  await settle();
  const pbCheckbox = document.querySelector('[data-internal-flag="フォトブリッジ登録"]');
  check('日本側にはフォトブリッジ登録のチェックボックスが出る', !!pbCheckbox);
  check('ベースは未チェック', pbCheckbox.checked === false);
  const aiSelect = document.querySelector('[data-internal-value="AI加工"]');
  const dataCheckbox = document.querySelector('[data-internal-flag="データアップロード"]');
  const earlyCheckbox = document.querySelector('[data-internal-flag="早期納品"]');
  check('AI加工（選択式）・データアップロード・早期納品も表示される',
        !!aiSelect && !!dataCheckbox && !!earlyCheckbox);

  const jpTok = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
  pbCheckbox.click();
  await settle();
  check('チェックすると即座に保存される（画面を離れずに反映）',
        ctx.apiGetReservationDetail(jpTok, 'R-001').detail['フォトブリッジ登録'] === '済');
  const pbAfter = document.querySelector('[data-internal-flag="フォトブリッジ登録"]');
  check('チェック状態が再描画後も維持される', pbAfter.checked === true);
  check('保存後も日本記入欄タブに留まる（他の操作と同じ挙動）',
        activeTab(document) === 'jpEntry', `実際: ${activeTab(document)}`);
  check('入力者名が画面に表示される（自動反映）',
        document.querySelector('[data-tab-pane="jpEntry"]').textContent.includes('登録者:'));
  check('チェック日時も画面に表示される（自動反映）',
        /登録者:.*\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/.test(document.querySelector('[data-tab-pane="jpEntry"]').textContent),
        document.querySelector('[data-tab-pane="jpEntry"]').textContent.match(/登録者:[^\n]*/)?.[0]);

  // 支店（ローマ）としてログインし直すと、この欄自体が画面に存在しないこと
  document.getElementById('nav-logout').click();
  await settle();
  await login(dom, 'ROW', 'CHANGE-ME-ROW');
  document.querySelector('#reservation-list .res-card').click();
  await settle();
  check('支店側には「日本記入欄」タブ自体が出ない',
        ![...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'jpEntry'));
  check('支店側の画面には社内進行管理欄のチェックボックスが一切出ない',
        !document.querySelector('[data-internal-flag]'));
  // ★注意：document.body.innerHTML には<script>タグの中身（JSソースコード自体）も含まれるため、
  // フィールド名の文字列リテラルが常に含まれてしまう。実際に利用者へ表示されるのは
  // #detail-content の中身だけなので、そこだけを見て「値として漏れていないか」を確認する
  const branchDetailHtml = document.getElementById('detail-content').innerHTML;
  check('支店側の画面のどこにも「フォトブリッジ」の文字列が出ない',
        !branchDetailHtml.includes('フォトブリッジ'));
  check('支店側の画面のどこにも「データアップロード」の文字列が出ない',
        !branchDetailHtml.includes('データアップロード'));
  check('支店側の画面のどこにも「AI加工」の文字列が出ない',
        !branchDetailHtml.includes('AI加工'));

  // 予約内容タブへ戻しておく（以降のセクションが予約内容タブを前提にしているため）
  [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'reservation').click();
  await settle();

  // ---------------------------------------------------------------
  section('U11. メモ履歴（共有メモ・メモ（現地用）を画面から追記できる）');
  // 直前のセクションで支店（ローマ）としてログイン済み・案件詳細の「予約内容」タブを開いている
  {
    const memoInput = document.querySelector('[data-memo-input="共有メモ"]');
    check('共有メモの入力欄がある', !!memoInput);
    memoInput.value = '請求書を発送しました';
    document.querySelector('[data-memo-add="共有メモ"]').click();
    await settle();
    const pane = document.querySelector('[data-tab-pane="reservation"]');
    check('追加した内容がすぐ画面に反映される', pane.textContent.includes('請求書を発送しました'));
    check('保存後も予約内容タブに留まる', activeTab(document) === 'reservation', `実際: ${activeTab(document)}`);

    // 現地記入欄タブでも同様に追記できる（種別が別れて保存される）
    [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'local').click();
    await settle();
    const localInput = document.querySelector('[data-memo-input="メモ（現地用）"]');
    localInput.value = '雨天時は屋内スタジオへ変更';
    document.querySelector('[data-memo-add="メモ（現地用）"]').click();
    await settle();
    const localPane = document.querySelector('[data-tab-pane="local"]');
    check('現地記入欄タブにも追記した内容が出る', localPane.textContent.includes('雨天時は屋内スタジオへ変更'));
    check('種別が分かれるので共有メモ欄には現地用メモが出ない',
          !document.querySelector('[data-tab-pane="reservation"]').textContent.includes('雨天時は屋内スタジオへ変更'));
  }

  // ---------------------------------------------------------------
  section('U12. 現地スタッフ手配メール（下書き確認 → 送信）');
  {
    const rowTok = ctx.apiLogin('ROW', 'CHANGE-ME-ROW').session.token;
    // 画面の「設定」を経由せず直接APIで有効化しておく（設定画面自体はU13で確認する）
    ctx.apiSaveArrangementSettings(rowTok, 'ROW', {
      enabled: true,
      categories: { photographer: { name: 'L.Conti', email: 'conti@example.com' } }
    });
    document.getElementById('nav-dashboard').click();
    await settle();
    document.querySelector('#reservation-list .res-card').click();
    await settle();
    [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'arrangement').click();
    await settle();

    const photoBtn = document.querySelector('[data-arrangement-category="photographer"]');
    check('宛先が設定済みのカテゴリはボタンが有効', !!photoBtn && !photoBtn.disabled);
    const floristBtn = document.querySelector('[data-arrangement-category="florist"]');
    check('宛先が未設定のカテゴリはボタンが無効', !!floristBtn && floristBtn.disabled);

    photoBtn.click();
    await settle();
    check('下書きモーダルが開く', !document.getElementById('arrangement-modal').classList.contains('hidden'));
    check('宛先が表示される', document.getElementById('arrangement-modal-to').textContent.includes('conti@example.com'));
    const bodyEl = document.getElementById('arrangement-modal-body');
    check('本文に案件情報が入った状態で開く', bodyEl.value.includes('R-001'));

    bodyEl.value = bodyEl.value + '\n（編集済み）';
    document.getElementById('arrangement-modal-send').click();
    await settle();
    check('送信後はモーダルが閉じる', document.getElementById('arrangement-modal').classList.contains('hidden'));
    check('送信したメールが記録される', ctx.__mail.some(m => m.to === 'conti@example.com' && m.body.includes('（編集済み）')));
    const arrPane = document.querySelector('[data-tab-pane="arrangement"]');
    check('手配履歴に送信内容が表示される', arrPane.textContent.includes('カメラマン'));
  }

  // ---------------------------------------------------------------
  section('U13. 設定画面（現地スタッフ手配メールの宛先を編集）');
  {
    document.getElementById('nav-settings').click();
    await settle();
    check('支店ロールでは対象支店の選択欄が出ない',
          document.getElementById('settings-branch-select').classList.contains('hidden'));
    const emailInput = document.querySelector('[data-arr-email="florist"]');
    check('花屋さんの宛先欄がある（前セクションでは未設定）', !!emailInput && emailInput.value === '');
    emailInput.value = 'florist@example.com';
    const nameInput = document.querySelector('[data-arr-name="florist"]');
    nameInput.value = 'Fiori Roma';
    document.getElementById('settings-save').click();
    await settle();

    const rowTok2 = ctx.apiLogin('ROW', 'CHANGE-ME-ROW').session.token;
    const saved = ctx.apiGetArrangementSettings(rowTok2, 'ROW');
    const floristSaved = saved.categories.find(c => c.key === 'florist');
    check('画面から保存した宛先がサーバーに反映される', floristSaved.email === 'florist@example.com', JSON.stringify(floristSaved));
    check('宛先名も反映される', floristSaved.name === 'Fiori Roma');

    // JP側は対象支店を選べる
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    document.getElementById('nav-settings').click();
    await settle();
    check('JP側では対象支店の選択欄が出る',
          !document.getElementById('settings-branch-select').classList.contains('hidden'));
    const opts = [...document.getElementById('settings-branch-select').options].map(o => o.value);
    check('選択肢に支店が入っている（JPロール自身は含まない）', opts.includes('ROW') && !opts.includes('KANTO'), opts.join(','));
  }

  // ---------------------------------------------------------------
  section('U14. お客様情報タブ・現地記入欄の新項目（同意書はイタリア以外は非表示／ヘアメイク・撮影の開始時間）');
  {
    // ウィーン支店（オーストリア＝イタリアではない）の案件を1件追加
    const H = ctx.RESERVATION_HEADERS;
    const row = new Array(H.length).fill('');
    const set = (k, v) => { const i = H.indexOf(k); if (i !== -1) row[i] = v; };
    set('支店コード', 'VIE'); set('管理番号', 'VIE-901'); set('管轄', '関東');
    set('新郎名（ローマ字）', 'Franz Gruber');
    ctx.__ss.getSheetByName('予約一覧').appendRow(row);

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'VIE', 'CHANGE-ME-VIE');
    document.querySelector('#reservation-list .res-card').click();
    await settle();
    [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'customer').click();
    await settle();
    const custPane = document.querySelector('[data-tab-pane="customer"]');
    check('お客様情報タブに現地連絡先メールの入力欄がある', !!custPane.querySelector('[data-pending="現地連絡先メール"]'));
    check('お客様情報タブにホテル住所の入力欄がある', !!custPane.querySelector('[data-pending="ホテル住所"]'));
    check('お客様情報タブにフライト情報の入力欄がある', !!custPane.querySelector('[data-pending="フライト情報"]'));
    check('パスポート番号欄が未設定の支店ではパスポート番号欄が出ない', !custPane.querySelector('[data-pending="パスポート番号"]'));
    // ★UI変更：同意書欄は必要書類チェックリストの近く（予約内容タブ）に移設した
    const resPaneForConsent = document.querySelector('[data-tab-pane="reservation"]');
    check('イタリアではないウィーン支店では同意書欄が出ない（JPでもないため）', !resPaneForConsent.querySelector('[data-consent-checkbox]'));

    [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'local').click();
    await settle();
    const localPane = document.querySelector('[data-tab-pane="local"]');
    check('現地記入欄にヘアメイク開始時間欄がある', !!localPane.querySelector('[data-pending="ヘアメイク開始時間"]'));
    check('現地記入欄に撮影開始時間欄がある', !!localPane.querySelector('[data-pending="撮影開始時間"]'));

    const hairTime = localPane.querySelector('[data-pending="ヘアメイク開始時間"]');
    hairTime.value = '9:00';
    hairTime.dispatchEvent(new dom.window.Event('change'));
    const photoTime = localPane.querySelector('[data-pending="撮影開始時間"]');
    photoTime.value = '10:30';
    photoTime.dispatchEvent(new dom.window.Event('change'));
    localPane.querySelector('.quick-save-btn').click();
    await settle();
    const vieTok = ctx.apiLogin('VIE', 'CHANGE-ME-VIE').session.token;
    const savedDetail = ctx.apiGetReservationDetail(vieTok, 'VIE-901').detail;
    check('ヘアメイク開始時間が保存できる', savedDetail['ヘアメイク開始時間'] === '9:00');
    check('撮影開始時間が保存できる', savedDetail['撮影開始時間'] === '10:30');
  }

  // ---------------------------------------------------------------
  section('U15. 店舗ロール（新規依頼フォーム → 一覧・詳細 → 手配課からの中継）');
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    check('店舗ロールには一覧系メニュー（検索・当日表・納品待ち・設定・通常の新規案件）が出ない',
          document.getElementById('nav-search').classList.contains('hidden') &&
          document.getElementById('nav-day').classList.contains('hidden') &&
          document.getElementById('nav-delivery').classList.contains('hidden') &&
          document.getElementById('nav-settings').classList.contains('hidden') &&
          document.getElementById('nav-new').classList.contains('hidden'));
    check('店舗ロールには「＋新規依頼」が出る', !document.getElementById('nav-shop-new').classList.contains('hidden'));

    document.getElementById('nav-shop-new').click();
    await settle();
    const branchOpts = [...document.getElementById('shop-new-branch').options].map(o => o.value);
    check('依頼先の支店（都市）が選べる', branchOpts.includes('VIE'), branchOpts.join(','));
    document.getElementById('shop-new-branch').value = 'VIE';
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-groom').value = 'Ahmet Yilmaz';
    document.getElementById('shop-new-hope1').value = '2026-09-10';
    document.getElementById('shop-new-plan').value = 'プランA';
    document.getElementById('shop-new-submit').click();
    await settle();
    check('依頼を送信できる', !document.getElementById('shop-new-success').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);
    const createdKanri = document.getElementById('shop-new-success').textContent.match(/依頼\s*(\S+)\s*を送信/)[1];

    document.getElementById('nav-dashboard').click();
    await settle();
    check('店舗の一覧に自分の依頼が出る',
          document.getElementById('reservation-list').innerHTML.includes(createdKanri));

    document.querySelector('#reservation-list .res-card').click();
    await settle();
    check('店舗向け詳細に管理番号が表示される',
          document.getElementById('detail-content').innerHTML.includes(createdKanri));
    check('店舗向け詳細でも許可された項目（プラン等）は編集できる（拡張要望2章・3-1）',
          !!document.querySelector('[data-pending="プラン名"]'));
    check('店舗向け詳細には請求先など内部項目の入力欄が出ない',
          !document.querySelector('[data-pending="請求先"]') && !document.querySelector('[data-pending="ホテル"]'));

    // 手配課（JP）が支店とのやり取りを経て、店舗へ中継する
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(createdKanri)).click();
    await settle();
    check('日本側の詳細に「店舗からの依頼」の案内が出る',
          document.getElementById('detail-content').innerHTML.includes('新宿店'));
    check('日本側には宛先（支店へ／店舗へ）の選択欄が出る（店舗直接やり取り許可がOFFのため）',
          !!document.getElementById('msg-recipient'));
    document.getElementById('msg-recipient').value = 'SHOP';
    document.getElementById('msg-input').value = '9/10で空きが確認できました';
    document.getElementById('btn-msg-only').click();
    await settle();

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.querySelector('#reservation-list .res-card').click();
    await settle();
    check('手配課が中継したメッセージが店舗の画面に届く',
          document.getElementById('detail-content').innerHTML.includes('9/10で空きが確認できました'));
  }

  // ---------------------------------------------------------------
  section('U16. 一覧表（表示形式が表）にSTSが出る／STSで検索できる');
  {
    // STSがはっきり異なる案件を2件追加しておく
    const H = ctx.RESERVATION_HEADERS;
    const addCase = (o) => {
      const row = new Array(H.length).fill('');
      Object.keys(o).forEach(k => { const i = H.indexOf(k); if (i !== -1) row[i] = o[k]; });
      ctx.__ss.getSheetByName('予約一覧').appendRow(row);
    };
    addCase({ '支店コード': 'ROW', '管理番号': 'R-951', '管轄': '関東', '新郎名（ローマ字）': 'Sts Ok', 'STS JP': 'OK', 'STS 支店': 'OK' });
    addCase({ '支店コード': 'ROW', '管理番号': 'R-952', '管轄': '関東', '新郎名（ローマ字）': 'Sts Fn', 'STS JP': 'FN', 'STS 支店': 'FN' });

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    document.getElementById('nav-dashboard').click();
    await settle();

    document.getElementById('view-mode-table').click();
    await settle();
    check('表示形式を「表」に切り替えられる', !document.getElementById('reservation-table-wrap').classList.contains('hidden'));
    const headerText = document.querySelector('#reservation-table-wrap thead').textContent;
    check('表のヘッダーにSTS JP・STS 支店の列がある', headerText.includes('STS JP') && headerText.includes('STS 支店'));
    const rows = [...document.querySelectorAll('#reservation-table-body tr')];
    const okRow = rows.find(r => r.textContent.includes('R-951'));
    check('表の行に案件ごとのSTS JP・STS 支店の値が入る（R-951はOK/OK）',
          !!okRow && okRow.textContent.includes('OK'), okRow ? okRow.textContent : 'not found');
    const fnRow = rows.find(r => r.textContent.includes('R-952'));
    check('別の案件は別のSTSが表示される（R-952はFN/FN）',
          !!fnRow && fnRow.textContent.includes('FN'), fnRow ? fnRow.textContent : 'not found');

    // STSで検索
    document.getElementById('nav-search').click();
    await settle();
    document.getElementById('s-sts-jp').value = 'FN';
    document.getElementById('search-submit').click();
    await settle();
    const searchHtml = document.getElementById('search-results').innerHTML;
    check('STS JPを指定して検索すると該当案件だけ出る', searchHtml.includes('R-952') && !searchHtml.includes('R-951'));
  }

  // ---------------------------------------------------------------
  section('U17. 店舗発注の拡張要望（新規依頼フォーム拡張・DC/PC警告・チェックリスト・ドライブ連携・請求先）');
  {
    // 支店マスタに請求先を設定しておく（拡張要望6章）
    const bm = ctx.__ss.getSheetByName('支店マスタ');
    const head = bm.getRange(1, 1, 1, bm.getLastColumn()).getValues()[0];
    const codeCol = head.indexOf('支店コード') + 1;
    const billingCol = head.indexOf('請求先') + 1;
    const codes = bm.getRange(2, codeCol, bm.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < codes.length; i++) {
      if (String(codes[i][0]) === 'SHOP1') bm.getRange(i + 2, billingCol).setValue('関東営業本部');
    }

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    // ★U16で「表」表示に切り替えたままなので、カード表示に戻しておく（#reservation-listで検索するため）
    document.getElementById('view-mode-card').click();
    document.getElementById('nav-shop-new').click();
    await settle();
    document.getElementById('shop-new-branch').value = 'VIE';
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-groom').value = 'Extended Groom';
    document.getElementById('shop-new-bride').value = 'Extended Bride';
    document.getElementById('shop-new-hope1').value = '2026-10-01';
    document.getElementById('shop-new-initial-status').value = 'CHK';
    document.getElementById('shop-new-submit').click();
    await settle();
    check('拡張フォームでも依頼を送信できる', !document.getElementById('shop-new-success').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);
    const kanri2 = document.getElementById('shop-new-success').textContent.match(/依頼\s*(\S+)\s*を送信/)[1];

    const jpTokenForCheck = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    check('選んだ初期STS(JP側)（CHK）で作成される（拡張要望2章）',
          ctx.apiGetReservationDetail(jpTokenForCheck, kanri2).detail['STS JP'] === 'CHK');

    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri2)).click();
    await settle();

    // ★要件：専用の「ステータス変更」欄は廃止し、プランの隣のSTS JPバッジから直接変更する。
    // DC/PCを選ぶとチャージ規定の警告が出る（拡張要望3-2章）
    const statusSel = document.querySelector('[data-shop-status-field="STS JP"]');
    check('プランの隣にSTS JPを直接変更できるプルダウンが表示される（専用のステータス変更欄は無い）',
          !!statusSel && !document.getElementById('shop-status-select'));
    statusSel.value = 'DC'; statusSel.dispatchEvent(new dom.window.Event('change'));
    check('DCを選ぶとチャージ規定の警告が表示される',
          !document.getElementById('shop-status-warning').classList.contains('hidden'));
    statusSel.value = 'FN'; statusSel.dispatchEvent(new dom.window.Event('change'));
    check('FNを選ぶと警告は消える', document.getElementById('shop-status-warning').classList.contains('hidden'));
    statusSel.value = ''; statusSel.dispatchEvent(new dom.window.Event('change'));

    // 必要書類チェックリストのチェック（拡張要望9章）
    const checklistBox = [...document.querySelectorAll('.checkbox-label input[type=checkbox]')]
      .find(el => el.closest('.checkbox-label').textContent.includes('ヘアメイク画像'));
    checklistBox.checked = true;
    checklistBox.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    check('店舗がチェックリストにチェックを入れて保存できる',
          ctx.apiGetReservationDetail(jpTokenForCheck, kanri2).detail.checklist.find(c => c.item === 'ヘアメイク画像').checked === true);

    // ★要件：専用の「ステータス変更」欄は廃止し、各オプションの隣のSTS JPバッジからも
    // 店舗自身が直接RQ→CR等へ変更できる（希望日テーブルと同じ表形式で表示される）
    document.querySelector('[data-pending="OP1"]').value = '前撮りアルバム';
    document.querySelector('[data-pending="OP1"]').dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri2)).click();
    await settle();
    const opStatusSel = document.querySelector('[data-shop-status-field="OP1 STS JP"]');
    check('オプション①の隣にもSTS JPを直接変更できるプルダウンが表示される（表形式）',
          !!opStatusSel && !!opStatusSel.closest('table.res-table'));
    opStatusSel.value = 'CR';
    opStatusSel.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    check('オプション①のSTS(JP側)がCRに変わる（サーバー側）',
          ctx.apiGetReservationDetail(jpTokenForCheck, kanri2).detail['OP1 STS JP'] === 'CR');

    // ドライブアップロード一覧・フォームURL欄が表示される（ファイル選択のシミュレーションはjsdomでは行わず、
    // サーバー側APIを直接呼んでから一覧の再読み込みだけを検証する）
    ctx.apiShopUploadDocument(ctx.apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token, kanri2,
      'ヘアメイク画像', 'hair.jpg', 'image/jpeg', Buffer.from('dummy').toString('base64'));
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri2)).click();
    await settle();
    check('アップロード済みの書類一覧が店舗の画面に表示される',
          document.getElementById('shop-upload-list').innerHTML.includes('hair.jpg'));
    // ★要件：entry ID未設定でも同意書フォームの素のURLは案内される（アンケートはURL自体が未設定なので出ない）
    check('同意書・アンケートURL欄に同意書フォームのリンクが表示される',
          document.getElementById('shop-form-urls').textContent.includes('同意書フォームを開く'));
    check('アンケートフォームは未設定なのでリンクが出ない',
          !document.getElementById('shop-form-urls').textContent.includes('アンケートフォームを開く'));
    // ★UI変更：店舗側でも同意書のご案内URLは必要書類チェックリストの近く（同じカード内）に置く
    const checklistCardShop = document.getElementById('shop-form-urls').closest('.section-card');
    check('店舗側でも同意書・アンケートURL欄が必要書類チェックリストと同じカードに表示される',
          !!checklistCardShop && checklistCardShop.querySelector('h3').textContent.includes('必要書類チェックリスト'),
          checklistCardShop && checklistCardShop.querySelector('h3').textContent);

    // JP側：請求先の表示・ドライブタブでのアップロード一覧の閲覧（拡張要望6章・8章）
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri2)).click();
    await settle();
    check('日本側の詳細に、起票した店舗の請求先が表示される（拡張要望6章）',
          document.getElementById('detail-content').innerHTML.includes('関東営業本部'));
    check('日本側の予約内容タブに必要書類チェックリストが表示され、店舗のチェックが反映されている',
          [...document.querySelectorAll('.checkbox-label')].some(l => l.textContent.includes('ヘアメイク画像') && l.querySelector('input').checked));

    document.querySelector('[data-tab="drive"]').click();
    await settle();
    check('日本側のドライブタブに店舗アップロードの一覧が表示される（拡張要望8章）',
          document.getElementById('shop-upload-list').innerHTML.includes('hair.jpg'));
  }

  // ---------------------------------------------------------------
  section('U18. チャレンジ番号入力欄・送信後の案内・店舗一覧の絞り込み・希望日ごとのSTS');
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('view-mode-card').click();
    document.getElementById('nav-shop-new').click();
    await settle();
    document.getElementById('shop-new-branch').value = 'VIE';
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'CH-9001';
    document.getElementById('shop-new-groom').value = 'Hope Tester';
    document.getElementById('shop-new-hope1').value = '2026-08-01';
    document.getElementById('shop-new-hope2').value = '2026-08-05';
    document.getElementById('shop-new-submit').click();
    await settle();
    const successText = document.getElementById('shop-new-success').textContent;
    check('チャレンジ番号つきで依頼を送信できる', !document.getElementById('shop-new-success').classList.contains('hidden'), successText);
    check('送信後に「回答までお待ちください」の案内が出る（拡張要望）', successText.includes('お待ちください'), successText);
    check('送信後の案内が目立つバナー表示になっている（success-bannerクラス）',
          document.getElementById('shop-new-success').classList.contains('success-banner'));
    const kanri3 = successText.match(/依頼\s*(\S+)\s*を送信/)[1];

    document.getElementById('nav-dashboard').click();
    await settle();
    check('店舗の一覧に絞り込み欄が表示される', !document.getElementById('shop-dashboard-filter').classList.contains('hidden'));
    document.getElementById('shop-dashboard-search').value = 'CH-9001';
    document.getElementById('shop-dashboard-search').dispatchEvent(new dom.window.Event('input'));
    await settle();
    check('チャレンジ番号で絞り込むと該当案件だけ表示される',
          document.getElementById('reservation-list').innerHTML.includes(kanri3) &&
          document.querySelectorAll('#reservation-list .res-card').length === 1);
    document.getElementById('shop-dashboard-search').value = '';
    document.getElementById('shop-dashboard-search').dispatchEvent(new dom.window.Event('input'));
    document.getElementById('shop-dashboard-team').value = '関西';
    document.getElementById('shop-dashboard-team').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('担当（手配課）で絞り込むと関東の案件は出ない',
          !document.getElementById('reservation-list').innerHTML.includes(kanri3));
    document.getElementById('shop-dashboard-team').value = '';
    document.getElementById('shop-dashboard-team').dispatchEvent(new dom.window.Event('change'));
    await settle();

    // --- 希望日ごとのSTSが店舗の画面にも表示される ---
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri3)).click();
    await settle();
    const hopeRow1 = [...document.querySelectorAll('#detail-content tr')].find(r => r.textContent.includes('第1希望'));
    check('店舗の画面にも希望日①のSTSが表(優先順位/日付/日本STS/現地STS)で表示される（現地未確認のST）',
          !!hopeRow1 && hopeRow1.textContent.includes('RQ') && hopeRow1.textContent.includes('ST'), hopeRow1 && hopeRow1.textContent);

    // --- 現地(支店)が希望日から確定する ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'VIE', 'CHANGE-ME-VIE');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri3)).click();
    await settle();
    const hopeBtn = document.querySelector('[data-hope-field="希望日② STS 支店"]');
    check('現地の画面に希望日②の「希望日から確定する」ボタンが出る', !!hopeBtn);
    hopeBtn.click();
    await settle();
    check('希望日から確定した後の画面に反映される（希望日②のSTS 支店がOK表示になる）',
          !document.querySelector('[data-hope-field="希望日② STS 支店"]')); // 確定済みなのでボタンはもう出ない

    const jp3 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const afterHope = ctx.apiGetReservationDetail(jp3, kanri3).detail;
    check('希望日②のSTS(支店側)がOKになる（画面操作がサーバーに反映される）', afterHope['希望日② STS 支店'] === 'OK');
    check('撮影日FIXに希望日②の日付が反映される', afterHope['撮影日FIX'] === '2026-08-05', afterHope['撮影日FIX']);
    check('案件全体のSTS(JP側)もOKへ進む', afterHope['STS JP'] === 'OK');
  }

  section('U19. 希望日ごとのSTSを現地・日本共に一括で設定できる（まとめて設定）');
  {
    const kanri4 = ctx.apiShopCreateRequest(ctx.apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token, {
      branchCode: 'VIE', team: '関東', groomName: 'Bulk Tester',
      hope1: '2026-10-01', hope2: '2026-10-02', hope3: '2026-10-03'
    }).kanriNo;

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'VIE', 'CHANGE-ME-VIE');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri4)).click();
    await settle();
    [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'reservation').click();
    await settle();
    const resPaneBulk = document.querySelector('[data-tab-pane="reservation"]');
    check('現地（支店）の画面に一括設定バーが表示される', !!document.getElementById('hope-bulk-apply'));

    const checksAll = [...resPaneBulk.querySelectorAll('.hope-bulk-check')];
    check('希望日は第五希望まで5行分チェックボックスが表示される（未入力分は無効）', checksAll.length === 5, checksAll.length);
    const checks = checksAll.filter(cb => !cb.disabled);
    check('入力済みの第一〜第三希望の3つだけが操作可能', checks.length === 3, checks.length);
    // 第一・第二希望をチェックしてUC（現地不可）にまとめて設定する
    checks[0].checked = true;
    checks[1].checked = true;
    document.getElementById('hope-bulk-value').value = 'UC';
    document.getElementById('hope-bulk-apply').click();
    await settle();

    const sel1 = document.querySelector('[data-pending="希望日① STS 支店"]');
    const sel2 = document.querySelector('[data-pending="希望日② STS 支店"]');
    const sel3 = document.querySelector('[data-pending="希望日③ STS 支店"]');
    check('一括設定：チェックした2件のプルダウンがUCに変わる（画面上）', sel1.value === 'UC' && sel2.value === 'UC');
    check('一括設定：チェックしなかった希望日③は変わらない（画面上）', sel3.value !== 'UC');

    document.querySelector('[data-tab-pane="reservation"] .quick-commit-btn').click();
    await settle();

    const jp4 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const afterBulk = ctx.apiGetReservationDetail(jp4, kanri4).detail;
    check('一括設定：サーバー側にも2件まとめて反映される（現地側）',
          afterBulk['希望日① STS 支店'] === 'UC' && afterBulk['希望日② STS 支店'] === 'UC');
    check('一括設定：日本側のSTSにも1回の送信で両方連動する', afterBulk['希望日① STS JP'] === 'UC' && afterBulk['希望日② STS JP'] === 'UC');
    check('一括設定：選ばなかった希望日③は影響を受けない', afterBulk['希望日③ STS 支店'] === 'ST');
  }

  section('U20. 手配内容をPDFで保存できる（印刷用ブロックの生成）');
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'ROW', 'CHANGE-ME-ROW');
    document.querySelector('#reservation-list .res-card').click();
    await settle();

    const printBtn = document.getElementById('print-arrangement-btn');
    check('日本・支店側の詳細画面に「手配内容をPDFで保存」ボタンが表示される', !!printBtn);
    const printBlockJp = document.getElementById('print-arrangement');
    check('印刷用の手配内容ブロックが管理番号を含めて生成される（画面には出さない）',
          printBlockJp.innerHTML.includes('R-001') && printBlockJp.classList.contains('print-only'));
    // ブラウザ以外（jsdom）ではwindow.printが無いため、押しても例外にならないことだけ確認する
    let printErr = null;
    try { printBtn.click(); } catch (e) { printErr = e; }
    check('ボタンを押しても例外にならない（window.printが無い環境でも安全）', printErr === null, String(printErr));

    // --- 店舗ロールの詳細画面にも同じボタン・仕組みがある ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('view-mode-card').click();
    document.querySelector('#reservation-list .res-card').click();
    await settle();
    const shopPrintBtn = document.getElementById('print-arrangement-btn');
    check('店舗側の詳細画面にも「手配内容をPDFで保存」ボタンが表示される', !!shopPrintBtn);
    const printBlockShop = document.getElementById('print-arrangement');
    check('店舗側でも印刷用の手配内容ブロックが生成される', printBlockShop.innerHTML.includes('手配内容'));
  }

  console.log(`\n${'='.repeat(50)}\n画面テスト結果: ${pass} 件成功 / ${fail} 件失敗\n${'='.repeat(50)}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('テストが異常終了しました:', e); process.exit(1); });
