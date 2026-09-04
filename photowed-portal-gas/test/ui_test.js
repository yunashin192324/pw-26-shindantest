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
const settle = () => sleep(60);

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
  // ★要件：店舗の新規依頼画面でプラン・オプションを選択式にしたため、テスト用にVIE支店の候補を登録
  ss.getSheetByName('プランマスタ').appendRow(['VIE', 'プランA', true]);
  ss.getSheetByName('オプションマスタ').appendRow(['VIE', '追加アルバム', true]);
  // ★要件：プランごとに撮影希望場所の入力方式・候補を変えられるようにする（チェックボックス／
  // プルダウン／自由入力）。テスト用にVIE支店に方式違いのプランを2つ登録する。
  ss.getSheetByName('プランマスタ').appendRow(['VIE', 'ローマ3時間フォト', true, 'checkbox', 'コロッセオ、トレビの泉']);
  ss.getSheetByName('プランマスタ').appendRow(['VIE', 'フィレンツェフォト', true, 'select', 'ドゥオモ\nヴェッキオ橋']);
  // ★要件：セールはプランに紐付けて登録できる（対象プランを指定すればそのプラン専用のセールになる）
  ss.getSheetByName('セールマスタ').appendRow(['VIE', 'ローマ限定セール', true, 'ローマ3時間フォト']);

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

// 既存の支店マスタ行の1列だけ値を書き換える（列名基準。gas_test.jsのsetBranchFieldと同じ考え方）
function setBranchFieldUi_(ctx, branchCode, field, value) {
  const bm = ctx.__ss.getSheetByName('支店マスタ');
  const head = bm.getRange(1, 1, 1, bm.getLastColumn()).getValues()[0];
  const codeCol = head.indexOf('支店コード') + 1;
  const fieldCol = head.indexOf(field) + 1;
  const codes = bm.getRange(2, codeCol, bm.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < codes.length; i++) {
    if (String(codes[i][0]).trim().toUpperCase() === branchCode.toUpperCase()) {
      bm.getRange(i + 2, fieldCol).setValue(value);
      return;
    }
  }
  throw new Error(`支店が見つかりません: ${branchCode}`);
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

// ★要件変更：JP/支店の案件詳細は「隠す/表示」のタブ切替から、店舗画面と同じ常時スクロール表示
// （クイックナビは押すとスクロールするだけで、他のセクションを隠さない）に変わったため、
// 「今どのタブがアクティブか」という概念自体が「記入欄」内の日本記入欄／現地記入欄の
// 切替（.entry-switch-btn）にしか残っていない。
function activeTab(document) {
  const btn = document.querySelector('.entry-switch-btn.active');
  return btn ? btn.dataset.entryTab : null;
}
// 指定タブが「隠されているか」を返す（クイックナビ側のセクションは常にfalse、
// 記入欄内の日本記入欄／現地記入欄だけは実際に切り替わる）
function paneHidden(document, key) {
  const pane = document.querySelector(`[data-tab-pane="${key}"]`);
  return pane ? pane.classList.contains('hidden') : null;
}

(async () => {
  // ---------------------------------------------------------------
  section('U1. ログインして案件を開く');
  const ctx = makeServer();
  const dom = await openApp(ctx);
  const { document } = dom.window;

  // ★要件変更：店舗が増えるとプルダウンが長すぎるため、支店選択のプルダウンをやめて
  // 支店コード直接入力（テキスト欄）に変更した（gas_test.js「56.」も参照）
  check('ログイン画面の支店コード欄はテキスト入力（プルダウンではない）',
        document.getElementById('login-branchcode').tagName === 'INPUT');

  await login(dom, 'ROW', 'CHANGE-ME-ROW');
  check('ログインするとヘッダーが表示される',
        !document.getElementById('app-header').classList.contains('hidden'));
  // ★要件：一覧表示の既定を表（テーブル）に変更した。ログイン直後は表が見えていて、
  // カード一覧は隠れている状態になる
  check('一覧表示の既定は表（テーブル）になっている',
        !document.getElementById('reservation-table-wrap').classList.contains('hidden') &&
        document.getElementById('reservation-list').classList.contains('hidden'));
  check('表示切替ボタンも「表」がアクティブになっている',
        document.getElementById('view-mode-table').classList.contains('active') &&
        !document.getElementById('view-mode-card').classList.contains('active'));
  // ★以降のテストはこれまでどおりカード表示を前提にしているため、ここでカード表示へ切り替える
  document.getElementById('view-mode-card').click();
  await settle();
  check('「カード」ボタンでカード一覧に切り替えられる',
        !document.getElementById('reservation-list').classList.contains('hidden') &&
        document.getElementById('reservation-table-wrap').classList.contains('hidden'));
  check('案件一覧にカードが出る', document.querySelectorAll('#reservation-list .res-card').length === 1,
        document.getElementById('reservation-list').innerHTML.slice(0, 200));

  document.querySelector('#reservation-list .res-card').click();
  await settle();
  check('案件詳細が開く', document.getElementById('detail-content').innerHTML.includes('R-001'));
  // ★要件変更：常時スクロール表示になったため、開いた直後から一番上の「メッセージ」が見えている
  check('開いた直後からメッセージ欄が表示されている', paneHidden(document, 'message') === false);

  // ---------------------------------------------------------------
  section('U2. ①ドライブタブの見出しから「（納品）」が取れている');
  const driveTabBtn = [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'drive');
  driveTabBtn.click();
  await settle();
  const drivePane = document.querySelector('[data-tab-pane="drive"]');
  check('ドライブタブが表示される', paneHidden(document, 'drive') === false);
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
  // ★これが今回の要望の肝：保存後にメッセージタブへ飛ばされないこと（常時スクロール表示になった今も、
  // 予約内容セクションが隠されたりメッセージ欄へ強制的にスクロール移動させられたりしないこと）
  check('保存後も「予約内容」セクションが表示されたまま（メッセージタブへ戻されない）',
        paneHidden(document, 'reservation') === false);

  // 現地記入欄タブからも同様に確定できる（支店ロールでは日本記入欄との切替自体が無いため、
  // 「現地記入欄」セクションはクリック無しで最初から表示されている）
  const pane2 = document.querySelector('[data-tab-pane="local"]');
  const pickup = pane2.querySelector('[data-pending="配車時間"]');
  pickup.value = '08:30';
  pickup.dispatchEvent(new dom.window.Event('change'));
  pane2.querySelector('.quick-commit-btn').click();
  await settle();
  const tok = ctx.apiLogin('ROW','CHANGE-ME-ROW').session.token;
  check('現地記入欄の「変更＋メッセージ」で保存される',
        ctx.apiGetReservationDetail(tok, 'R-001').detail['配車時間'] === '08:30');
  check('保存後も「現地記入欄」セクションが表示されたまま', paneHidden(document, 'local') === false);

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
  check('日本側には「記入欄」内に日本記入欄への切替タブが出る',
        !!document.querySelector('.entry-switch-btn[data-entry-tab="jpEntry"]'));
  document.querySelector('.entry-switch-btn[data-entry-tab="jpEntry"]').click();
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
        activeTab(document) === 'jpEntry' && paneHidden(document, 'jpEntry') === false,
        `実際: ${activeTab(document)}`);
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
  check('支店側には「日本記入欄」タブ自体が出ない（切替タブごと表示されない）',
        !document.querySelector('.entry-switch-btn[data-entry-tab="jpEntry"]') && !document.querySelector('[data-tab-pane="jpEntry"]'));
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
  section('U11. メモ履歴（共有メモ（現地支店）・メモ（現地用）を画面から追記できる）');
  // 直前のセクションで支店（ローマ）としてログイン済み・案件詳細の「予約内容」タブを開いている
  {
    // ★要件：共有メモを現地支店・日本支店（店舗）・手配課で分離。現地支店ロールには
    // 自分専用の「共有メモ（現地支店）」だけが出る
    const memoInput = document.querySelector('[data-memo-input="共有メモ（現地支店）"]');
    check('共有メモ（現地支店）の入力欄がある', !!memoInput);
    memoInput.value = '請求書を発送しました';
    document.querySelector('[data-memo-add="共有メモ（現地支店）"]').click();
    await settle();
    const pane = document.querySelector('[data-tab-pane="reservation"]');
    check('追加した内容がすぐ画面に反映される', pane.textContent.includes('請求書を発送しました'));
    check('保存後も予約内容セクションが表示されたまま', paneHidden(document, 'reservation') === false);

    // 現地記入欄タブでも同様に追記できる（種別が別れて保存される。支店ロールでは切替タブ自体が無く
    // 最初から現地記入欄が表示されているため、クリックは不要）
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

    // 支店ロールでは日本記入欄との切替タブ自体が無く、現地記入欄が最初から表示されている
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
    check('店舗ロールには一覧系メニュー（検索・当日表・納品待ち・設定）が出ない',
          document.getElementById('nav-search').classList.contains('hidden') &&
          document.getElementById('nav-day').classList.contains('hidden') &&
          document.getElementById('nav-delivery').classList.contains('hidden') &&
          document.getElementById('nav-settings').classList.contains('hidden'));
    check('店舗ロールには「＋新規依頼」が出る', !document.getElementById('nav-shop-new').classList.contains('hidden'));

    document.getElementById('nav-shop-new').click();
    await settle();
    check('フォーム上部に「支店（都市）」単独選択欄は無い（希望日①のプランが基準支店を兼ねる）',
          !document.getElementById('shop-new-branch'));
    // ★要件：希望日のカレンダーで過去日が選べないよう min 属性が今日の日付になっている
    const todayIsoNew = new Date().toISOString().slice(0, 10);
    check('新規依頼フォームの希望日欄もカレンダーで過去日を選べない（min=今日）',
          document.getElementById('shop-new-hope1').min === todayIsoNew, document.getElementById('shop-new-hope1').min);
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = '0A2B3C4D5E6';
    document.getElementById('shop-new-groom-last').value = 'Yilmaz';
    document.getElementById('shop-new-groom').value = 'Ahmet';
    document.getElementById('shop-new-bride-last').value = 'Yilmaz';
    document.getElementById('shop-new-bride').value = 'Elif';
    document.getElementById('shop-new-hope1').value = '2026-09-10';
    // ★要件：新郎新婦それぞれの年齢欄（※ISWのみ必要の注記付き）は支店の必須設定に関わらず常に表示される。
    // パスポート番号欄は新規依頼フォームからは廃止（申し込み時点では不要とのこと。既存案件の
    // 詳細画面では引き続き入力できる＝shop-new-passport-block自体がフォームに存在しない）
    check('新郎年齢欄が常に表示される（※ISWのみ必要）', !!document.getElementById('shop-new-groom-age'));
    check('新婦年齢欄が常に表示される（※ISWのみ必要）', !!document.getElementById('shop-new-bride-age'));
    check('新規依頼フォームにパスポート番号欄は無い', !document.getElementById('shop-new-passport-block'));
    document.getElementById('shop-new-groom-age').value = '29';
    document.getElementById('shop-new-bride-age').value = '27';
    // ★要件変更：案件全体の「プラン」単独欄は廃止し、希望日ごとのプラン欄（全支店横断）だけになった
    const hopePlanOpts = [...document.getElementById('shop-new-hopeplan1').options].map(o => o.value);
    check('希望日のプランは全支店のマスタ一覧から選べる（自由入力ではない）', hopePlanOpts.includes('プランA'), hopePlanOpts.join(','));
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    // ★仕様変更：希望日①のプラン選択が基準支店の決定を兼ねるため、選ぶとプラン・セール名・
    // オプションの候補が支店ごとのマスタから入れ替わる（onShopNewHopePlan1Changeを待つ）
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    // ★要件変更：オプション名はマスタ候補（datalist）を出しつつ自由に書ける入力欄になった
    const optionOpts = [...document.getElementById('shop-new-option-datalist').options].map(o => o.value);
    check('オプションはマスタの候補（datalist）が出る（自由入力も可）', optionOpts.includes('追加アルバム'), optionOpts.join(','));
    document.getElementById('shop-new-option1').value = '追加アルバム';
    document.getElementById('shop-new-submit').click();
    await settle();
    check('依頼を送信できる', !document.getElementById('shop-new-success').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);
    const createdKanri = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];
    // ★要件：パスポート番号は新規依頼フォームから廃止したため、年齢のみ確認する
    check('年齢（必須支店でなくても）が保存される',
          ctx.apiGetReservationDetail(ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, createdKanri).detail['新郎年齢'] === '29');
    // ★要件変更：案件全体の「プラン」欄は廃止されたため、第一希望のプランがそのまま
    // 案件全体のプラン名の初期値として自動で反映される（apiShopCreateRequest参照）
    check('第一希望のプランが案件全体のプラン名にも自動反映される',
          ctx.apiGetReservationDetail(ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, createdKanri).detail['プラン名'] === 'プランA');

    document.getElementById('nav-dashboard').click();
    await settle();
    check('店舗の一覧に自分の依頼が出る',
          document.getElementById('reservation-list').innerHTML.includes(createdKanri));

    document.querySelector('#reservation-list .res-card').click();
    await settle();
    check('店舗向け詳細に管理番号が表示される',
          document.getElementById('detail-content').innerHTML.includes(createdKanri));
    // ★要件変更：案件全体のプラン名欄は読み取り専用表示になった（希望日の欄から選ぶ）。
    // 許可された項目が編集できることは、代わりに希望日①のプラン欄（希望日①プラン）で確認する
    check('店舗向け詳細でも許可された項目（希望日のプラン等）は編集できる（拡張要望2章・3-1）',
          !document.querySelector('[data-pending="プラン名"]') &&
          !!document.querySelector('[data-pending="希望日①プラン"]'));
    check('店舗向け詳細には請求先など内部項目の入力欄が出ない',
          !document.querySelector('[data-pending="請求先"]'));
    // ★要件：お客様情報タブに、現地連絡先・滞在ホテル・フライト情報も店舗から入力できるようにする
    check('店舗向け詳細には現地連絡先・滞在ホテル・フライト情報の入力欄がある',
          !!document.querySelector('[data-pending="ホテル"]') &&
          !!document.querySelector('[data-pending="現地連絡先メール"]') &&
          !!document.querySelector('[data-pending="フライト情報"]'));

    // 手配課（JP）が支店とのやり取りを経て、店舗へ中継する
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(createdKanri)).click();
    await settle();
    check('日本側の詳細に「店舗からの依頼」の案内が出る',
          document.getElementById('detail-content').innerHTML.includes('新宿店'));
    // ★要件：現地支店側の画面でも日本の店舗名が自動でヘッダーに表示される（タブを開かなくても見える）
    check('詳細ヘッダーに「日本の店舗」として自動で表示される',
          document.querySelector('.detail-header').textContent.includes('日本の店舗') &&
          document.querySelector('.detail-header').textContent.includes('新宿店'));
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
    addCase({ '支店コード': 'ROW', '管理番号': 'R-951', '管轄': '関東', '新郎名（ローマ字）': 'Sts Ok', 'STS JP': 'OK', 'STS 支店': 'OK', 'プラン名': 'プレミアムプラン' });
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

    // ★要件：一覧を日付範囲・ステータスに加えてプラン名でも絞り込める
    document.getElementById('s-sts-jp').value = '';
    document.getElementById('s-plan').value = 'プレミアム';
    document.getElementById('search-submit').click();
    await settle();
    const planSearchHtml = document.getElementById('search-results').innerHTML;
    check('プラン名でも検索できる（現地支店・日本の支店・手配課いずれも共通の検索画面）',
          planSearchHtml.includes('R-951') && !planSearchHtml.includes('R-952'));
    document.getElementById('s-plan').value = '';
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
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'EXT0001AAAA';
    document.getElementById('shop-new-groom-last').value = 'Extended';
    document.getElementById('shop-new-groom').value = 'Groom';
    document.getElementById('shop-new-bride-last').value = 'Extended';
    document.getElementById('shop-new-bride').value = 'Bride';
    document.getElementById('shop-new-hope1').value = '2026-10-01';
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    document.getElementById('shop-new-initial-status').value = 'CHK';
    document.getElementById('shop-new-submit').click();
    await settle();
    check('拡張フォームでも依頼を送信できる', !document.getElementById('shop-new-success').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);
    check('初期STSがCHK（空き確認のみ）の場合は案内文言が「空き確認依頼」になる',
          document.getElementById('shop-new-success-text').textContent.includes('空き確認依頼をしました'));
    const kanri2 = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];

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

    // ★要件変更：案件全体のプラン欄は読み取り専用表示になった（希望日の欄から選ぶため二重管理をやめた）
    // （プラン行にはSTS JP編集用のselectは残るが、プラン名のselectは無い）
    const planRow = document.querySelector('tr.plan-row');
    check('案件詳細のプラン欄は読み取り専用表示になっている（希望日の欄から選ぶ）',
          !document.querySelector('[data-pending="プラン名"]') && !!planRow && !planRow.querySelector('[data-pending="プラン名"]'));

    // 必要書類チェックリストのチェック（拡張要望9章）
    const checklistBox = [...document.querySelectorAll('.checkbox-label input[type=checkbox]')]
      .find(el => el.closest('.checkbox-label').textContent.includes('ヘアメイク画像'));
    checklistBox.checked = true;
    checklistBox.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    check('店舗がチェックリストにチェックを入れて保存できる',
          ctx.apiGetReservationDetail(jpTokenForCheck, kanri2).detail.checklist.find(c => c.item === 'ヘアメイク画像').checked === true);

    // ★要件：オプションのSTSは新規申し込み時に限らず、いつでも変更できるようにする。
    // 名称が未設定（未使用）のオプション枠でもSTS JPのプルダウン自体は常に表示される。
    check('名称未設定のオプション枠でもSTS JPのプルダウンが最初から表示される',
          !!document.querySelector('[data-shop-status-field="OP2 STS JP"]'));

    // ★要件：専用の「ステータス変更」欄は廃止し、各オプションの隣のSTS JPバッジからも
    // 店舗自身が直接RQ→CR等へ変更できる（希望日テーブルと同じ表形式で表示される）
    document.querySelector('[data-pending="OP1"]').value = '追加アルバム';
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
          !!opStatusSel && !!opStatusSel.closest('table.plan-table'));
    opStatusSel.value = 'CR';
    opStatusSel.dispatchEvent(new dom.window.Event('change'));
    // ★要件：CRを選ぶとキャンセル理由の入力欄が現れ、送信にはその入力が必須になる
    const cancelReasonBlock = document.getElementById('shop-cancel-reason-block');
    check('CRを選ぶとキャンセル理由の入力欄が表示される', !cancelReasonBlock.classList.contains('hidden'));
    const cancelReasonInput = document.querySelector('[data-pending="キャンセル理由"]');
    cancelReasonInput.value = 'お客様都合によるキャンセル';
    cancelReasonInput.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    check('オプション①のSTS(JP側)がCRに変わる（サーバー側）',
          ctx.apiGetReservationDetail(jpTokenForCheck, kanri2).detail['OP1 STS JP'] === 'CR');
    check('入力したキャンセル理由も保存される',
          ctx.apiGetReservationDetail(jpTokenForCheck, kanri2).detail['キャンセル理由'] === 'お客様都合によるキャンセル');

    // ★要件：一度OK（現地確定）になったオプションは、店舗の選択肢がCR・FNのみに絞られる
    // （RQ・DC・PCは選べない）
    ctx.apiSaveFieldsQuiet(jpTokenForCheck, kanri2, { 'OP1 STS JP': 'OK' });
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri2)).click();
    await settle();
    const opStatusSelAfterOk = document.querySelector('[data-shop-status-field="OP1 STS JP"]');
    const opStatusValues = [...opStatusSelAfterOk.options].map(o => o.value).filter(Boolean);
    check('OKになったオプションはRQ・DC・PCが選択肢に出ない',
          !opStatusValues.includes('RQ') && !opStatusValues.includes('DC') && !opStatusValues.includes('PC'), opStatusValues.join(','));
    check('OKになったオプションはCR・FNだけが選べる',
          opStatusValues.includes('CR') && opStatusValues.includes('FN'));

    // ★要件：案件全体（プラン）のSTS(JP側)も、一度OKになった後はRQ（依頼前の状態）が
    // 選択肢に出なくなる。ただしDC・PCはオプションと違い、OKの後も引き続き選べる
    // （拡張要望3-2で店舗から日付変更・プラン変更を出せる仕様のため）。
    ctx.apiSaveFieldsQuiet(ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, kanri2, { 'STS JP': 'OK' });
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri2)).click();
    await settle();
    const planStatusSel = document.querySelector('[data-shop-status-field="STS JP"]');
    const planStatusValues = [...planStatusSel.options].map(o => o.value).filter(Boolean);
    check('OKになった案件全体はRQが選択肢に出ない', !planStatusValues.includes('RQ'), planStatusValues.join(','));
    check('OKになった案件全体でもDC・PC・CR・FNは引き続き選べる（オプションとは別扱い）',
          ['DC', 'PC', 'CR', 'FN'].every(v => planStatusValues.includes(v)), planStatusValues.join(','));

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
    // ★要件：一度アップロードしたものを店舗自身が削除（取消）できるようにする
    // （hair.jpgは後段のJP側の表示確認でも使うため、削除の検証には別のファイルを使う）
    ctx.apiShopUploadDocument(ctx.apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token, kanri2,
      '衣裳画像', 'dress-to-delete.jpg', 'image/jpeg', Buffer.from('dummy').toString('base64'));
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri2)).click();
    await settle();
    check('2件目のアップロードも一覧に表示される',
          document.getElementById('shop-upload-list').innerHTML.includes('dress-to-delete.jpg'));
    const deleteBtn = [...document.querySelectorAll('[data-shop-upload-delete]')]
      .find(b => b.closest('li').textContent.includes('dress-to-delete.jpg'));
    check('アップロード済みの書類に削除ボタンがある（店舗ロール）', !!deleteBtn);
    deleteBtn.click();
    await settle();
    check('削除すると一覧から消える（他のファイルは残る）',
          !document.getElementById('shop-upload-list').innerHTML.includes('dress-to-delete.jpg') &&
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
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-groom-last').value = 'Hope';
    document.getElementById('shop-new-groom').value = 'Tester';
    document.getElementById('shop-new-bride-last').value = 'Hope';
    document.getElementById('shop-new-bride').value = 'Bride';
    document.getElementById('shop-new-hope1').value = '2026-08-01';
    document.getElementById('shop-new-hope2').value = '2026-08-05';
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();

    // ★要件：チャレンジ番号は任意ではなく必須。英数字11桁固定
    document.getElementById('shop-new-submit').click();
    await settle();
    check('チャレンジ番号が未入力だと送信できない',
          document.getElementById('shop-new-success').classList.contains('hidden') &&
          !document.getElementById('shop-new-error').classList.contains('hidden'));
    document.getElementById('shop-new-challengeno').value = 'CH-9001';
    document.getElementById('shop-new-submit').click();
    await settle();
    check('チャレンジ番号の形式が不正（ハイフンあり・10桁）だと送信できない',
          document.getElementById('shop-new-success').classList.contains('hidden') &&
          !document.getElementById('shop-new-error').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);

    document.getElementById('shop-new-challengeno').value = 'CH9001AAAAA';
    document.getElementById('shop-new-submit').click();
    await settle();
    const successText = document.getElementById('shop-new-success-text').textContent;
    check('チャレンジ番号つきで依頼を送信できる', !document.getElementById('shop-new-success').classList.contains('hidden'), successText);
    check('送信後に「回答までお待ちください」の案内が出る（拡張要望）', successText.includes('お待ちください'), successText);
    check('送信後の案内文言が「予約依頼をしました」に変わっている（要望どおり）', successText.includes('予約依頼をしました'), successText);
    check('送信後の案内に予約番号が入る', successText.includes('予約番号'), successText);
    check('送信後の案内が目立つバナー表示になっている（success-bannerクラス）',
          document.getElementById('shop-new-success').classList.contains('success-banner'));
    check('送信後の案内にトップ（案件一覧）へ戻るボタンが併設される',
          !!document.getElementById('shop-new-success-top-btn'));
    const kanri3 = successText.match(/予約番号\s*(\S+)/)[1];

    document.getElementById('nav-dashboard').click();
    await settle();
    check('店舗の一覧に絞り込み欄が表示される', !document.getElementById('shop-dashboard-filter').classList.contains('hidden'));
    document.getElementById('shop-dashboard-search').value = 'CH9001AAAAA';
    document.getElementById('shop-dashboard-search').dispatchEvent(new dom.window.Event('input'));
    await settle();
    check('チャレンジ番号で絞り込むと該当案件だけ表示される',
          document.getElementById('reservation-list').innerHTML.includes(kanri3) &&
          document.querySelectorAll('#reservation-list .res-card').length === 1);
    document.getElementById('shop-dashboard-search').value = '';
    document.getElementById('shop-dashboard-search').dispatchEvent(new dom.window.Event('input'));
    await settle();
    // ★要件：担当（手配課）の絞り込みは廃止し、代わりに撮影日の範囲・STS(JP側)・プラン名で絞り込める
    check('担当（手配課）の絞り込み欄は無い', !document.getElementById('shop-dashboard-team'));
    check('撮影日の範囲・STS(JP側)・プラン名の絞り込み欄がある',
          !!document.getElementById('shop-dashboard-date-from') && !!document.getElementById('shop-dashboard-date-to') &&
          !!document.getElementById('shop-dashboard-sts') && !!document.getElementById('shop-dashboard-plan'));
    document.getElementById('shop-dashboard-plan').value = 'ぜったいに一致しないプラン名';
    document.getElementById('shop-dashboard-plan').dispatchEvent(new dom.window.Event('input'));
    await settle();
    check('プラン名で絞り込むと一致しない案件は出ない',
          !document.getElementById('reservation-list').innerHTML.includes(kanri3));
    document.getElementById('shop-dashboard-plan').value = '';
    document.getElementById('shop-dashboard-plan').dispatchEvent(new dom.window.Event('input'));
    await settle();

    // --- 希望日ごとのSTSが店舗の画面にも表示される ---
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri3)).click();
    await settle();
    const hopeRow1 = [...document.querySelectorAll('#detail-content tr')].find(r => r.textContent.includes('第1希望'));
    check('店舗の画面にも希望日①のSTSが表(優先順位/日付/日本STS/現地STS)で表示される（現地未確認のST）',
          !!hopeRow1 && hopeRow1.textContent.includes('RQ') && hopeRow1.textContent.includes('ST'), hopeRow1 && hopeRow1.textContent);
    // ★要件：希望日のカレンダーで過去日が選べないよう min 属性が今日の日付になっている
    const todayIso = new Date().toISOString().slice(0, 10);
    check('店舗の希望日入力欄はカレンダーで過去日を選べない（min=今日）',
          hopeRow1.querySelector('input[type="date"]').min === todayIso, hopeRow1.querySelector('input[type="date"]').min);

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
      branchCode: 'VIE', team: '関東', groomLastName: 'Bulk', groomName: 'Tester', brideLastName: 'Bulk', brideName: 'Bride',
      hope1: '2026-10-01', hope2: '2026-10-02', hope3: '2026-10-03', challengeNo: 'BULK0001AAA'
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

  section('U21. 店舗画面のクイックナビ（タブを押すと該当セクションへスクロール）');
  {
    // U20の続きで店舗の詳細画面を開いたままの状態
    const nav = document.getElementById('shop-quick-nav');
    check('店舗の詳細画面上部にクイックナビが表示される', !!nav);
    const navBtns = [...nav.querySelectorAll('[data-scroll-to]')];
    // ★要件：オプションはプラン・オプション明細表として「予約内容」に統合したため独立タブが無くなり、
    // 一方で共有メモ（日本支店）が新たに独立セクションとして加わったため7項目になる
    check('クイックナビに依頼状況・お客様情報・予約内容・書類・共有メモ・メッセージ・履歴の7つがある',
          navBtns.length === 7, navBtns.map(b => b.dataset.scrollTo).join(','));
    const missingTargets = navBtns.map(b => b.dataset.scrollTo).filter(id => !document.getElementById(id));
    check('クイックナビの全ボタンに対応するセクションが実在する', missingTargets.length === 0, missingTargets.join(','));
    // ★不具合防止：jsdomにはscrollIntoViewが無いが、押しても例外にならず安全に無視されること
    let navErr = null;
    try { navBtns.forEach(b => b.click()); } catch (e) { navErr = e; }
    check('クイックナビのボタンを押しても例外にならない（scrollIntoViewが無い環境でも安全）',
          navErr === null, String(navErr));
  }

  section('U22. 新郎名・新婦名を姓・名に分けて入力できる');
  {
    // --- 店舗の新規依頼フォーム：姓・名それぞれの入力欄がある ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('view-mode-card').click();
    document.getElementById('nav-shop-new').click();
    await settle();
    check('店舗の新規依頼フォームに新郎姓・新郎名・新婦姓・新婦名の4欄がある',
          !!document.getElementById('shop-new-groom-last') && !!document.getElementById('shop-new-groom') &&
          !!document.getElementById('shop-new-bride-last') && !!document.getElementById('shop-new-bride'));
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'NAMESPLIT03';
    document.getElementById('shop-new-groom-last').value = 'Rossi';
    document.getElementById('shop-new-groom').value = 'Marco';
    document.getElementById('shop-new-bride-last').value = 'Bianchi';
    document.getElementById('shop-new-bride').value = 'Giulia';
    document.getElementById('shop-new-hope1').value = '2026-09-10';
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    document.getElementById('shop-new-submit').click();
    await settle();
    check('姓・名を分けて送信できる', !document.getElementById('shop-new-success').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);
    const kanriSplit = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];

    document.getElementById('nav-dashboard').click();
    await settle();
    const cardText = [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriSplit)).textContent;
    check('一覧のカードにはフルネーム（姓 名・大文字）で表示される', cardText.includes('ROSSI MARCO') && cardText.includes('BIANCHI GIULIA'), cardText);

    // --- 日本側の詳細でも姓・名が別々の入力欄になっている ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriSplit)).click();
    await settle();
    check('日本側の詳細ヘッダーにもフルネーム（姓 名・大文字）で表示される',
          document.querySelector('.names').textContent.includes('ROSSI MARCO') &&
          document.querySelector('.names').textContent.includes('BIANCHI GIULIA'));
    [...document.querySelectorAll('.tab-btn')].find(b => b.dataset.tab === 'reservation').click();
    await settle();
    const resPaneSplit = document.querySelector('[data-tab-pane="reservation"]');
    check('予約内容タブに新郎姓・新郎名・新婦姓・新婦名の4つの入力欄が別々にある',
          !!resPaneSplit.querySelector('[data-pending="新郎姓（ローマ字）"]') &&
          !!resPaneSplit.querySelector('[data-pending="新郎名（ローマ字）"]') &&
          !!resPaneSplit.querySelector('[data-pending="新婦姓（ローマ字）"]') &&
          !!resPaneSplit.querySelector('[data-pending="新婦名（ローマ字）"]'));
    check('新郎姓の入力欄に大文字化されたROSSIが入っている',
          resPaneSplit.querySelector('[data-pending="新郎姓（ローマ字）"]').value === 'ROSSI');

    // --- 店舗側の詳細画面でも姓・名が別々の入力欄になっている ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('view-mode-card').click();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriSplit)).click();
    await settle();
    check('店舗側の詳細にも新郎姓・新郎名・新婦姓・新婦名の4つの入力欄が別々にある',
          !!document.querySelector('[data-pending="新郎姓（ローマ字）"]') &&
          !!document.querySelector('[data-pending="新郎名（ローマ字）"]') &&
          !!document.querySelector('[data-pending="新婦姓（ローマ字）"]') &&
          !!document.querySelector('[data-pending="新婦名（ローマ字）"]'));
  }

  section('U23. プランごとの撮影希望場所の入力方式（チェックボックス／プルダウン）・セールのプラン紐付け');
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();

    // --- 既定（プラン未選択）は従来どおり自由入力 ---
    check('プラン未選択のときは撮影希望場所が自由入力のまま',
          document.getElementById('shop-new-location').tagName === 'INPUT');

    // ★要件変更：案件全体の「プラン」単独欄は廃止したため、希望日①（第一希望）のプラン選択が
    // 撮影希望場所の入力方式切替・セール名のプラン別絞り込みを兼ねる。
    // --- チェックボックス方式のプランを選ぶと複数選択のチェックボックスに切り替わる ---
    document.getElementById('shop-new-hopeplan1').value = 'ローマ3時間フォト';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    const checks = [...document.querySelectorAll('.shop-new-location-cb')];
    check('希望日①にチェックボックス方式のプランを選ぶと候補が複数のチェックボックスで表示される',
          checks.length === 2 && checks.some(c => c.value === 'コロッセオ') && checks.some(c => c.value === 'トレビの泉'));
    checks.find(c => c.value === 'コロッセオ').checked = true;
    checks.find(c => c.value === 'コロッセオ').dispatchEvent(new dom.window.Event('change'));
    checks.find(c => c.value === 'トレビの泉').checked = true;
    checks.find(c => c.value === 'トレビの泉').dispatchEvent(new dom.window.Event('change'));
    check('チェックボックスで選んだ値が撮影希望場所に反映される（読点区切り）',
          document.getElementById('shop-new-location').value === 'コロッセオ、トレビの泉');
    const saleOptsRoma = [...document.getElementById('shop-new-sale').options].map(o => o.value).filter(Boolean);
    check('このプラン専用のセールが候補に出る（対象プラン一致）', saleOptsRoma.includes('ローマ限定セール'));

    // --- プルダウン方式のプランに切り替えると単一選択のプルダウンになり、専用セールは消える ---
    document.getElementById('shop-new-hopeplan1').value = 'フィレンツェフォト';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('希望日①にプルダウン方式のプランを選ぶと単一選択のselectに切り替わる',
          document.getElementById('shop-new-location').tagName === 'SELECT');
    const selectOpts = [...document.getElementById('shop-new-location').options].map(o => o.value).filter(Boolean);
    check('プルダウンの候補にこのプラン専用のものが入る', selectOpts.includes('ドゥオモ') && selectOpts.includes('ヴェッキオ橋'));
    const saleOptsFirenze = [...document.getElementById('shop-new-sale').options].map(o => o.value).filter(Boolean);
    check('プランを切り替えると対象プラン不一致のセールは候補から消える（ローマ限定セール）',
          !saleOptsFirenze.includes('ローマ限定セール'));

    // --- 実際に送信して、選んだ撮影希望場所・セール名が保存されることを確認 ---
    document.getElementById('shop-new-location').value = 'ドゥオモ';
    document.getElementById('shop-new-sale').value = '';
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'PLANLOC0001';
    document.getElementById('shop-new-groom-last').value = 'Verdi';
    document.getElementById('shop-new-groom').value = 'Luca';
    document.getElementById('shop-new-bride-last').value = 'Verdi';
    document.getElementById('shop-new-bride').value = 'Sara';
    document.getElementById('shop-new-hope1').value = '2026-09-10';
    document.getElementById('shop-new-submit').click();
    await settle();
    check('プランごとの入力方式のまま送信できる', !document.getElementById('shop-new-success').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);
    const kanriPlanLoc = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];
    const savedDetail = ctx.apiGetReservationDetail(ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, kanriPlanLoc).detail;
    check('選んだプルダウンの撮影希望場所が保存される', savedDetail['撮影希望場所'] === 'ドゥオモ');
    // ★要件変更：第一希望のプランが案件全体のプラン名の初期値としてそのまま反映される
    check('第一希望のプランが案件全体のプラン名にも反映される', savedDetail['プラン名'] === 'フィレンツェフォト');

    // --- 既存案件の店舗詳細画面では、プラン単独欄は廃止され読み取り専用表示になっている
    //     （プランを変えたい場合は希望日の欄から選び直す。撮影希望場所・セール名切替はもう無い） ---
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriPlanLoc)).click();
    await settle();
    check('既存案件の詳細のプラン欄は読み取り専用表示になっている（プラン選択欄は無い）',
          !document.getElementById('shop-detail-plan-select') &&
          document.querySelector('tr.plan-row').textContent.includes('フィレンツェフォト'));
  }

  section('U24. 撮影日FIX未入力時の一覧表示：STSに応じた文言（撮影日未定の誤表示を修正）');
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    const jpToken = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const rowToken = ctx.apiLogin('ROW', 'CHANGE-ME-ROW').session.token;

    // --- STS JP・STS 支店がどちらもOKなのに撮影日FIX未入力（不整合データ）でも「予約確定」と出る ---
    // （STS 支店はBRANCH_EDIT_GATEにより「現在のSTS JP」次第で書き込める値が変わるため、
    //   まずSTS 支店をRQ状態のうちにOKへ、そのあとでSTS JPを別途OKにする順で組み立てる）
    const kOk = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Ok\n02 Status Bride').kanriNo;
    ctx.apiSaveFieldsQuiet(rowToken, kOk, { 'STS 支店': 'OK' });
    ctx.apiSaveFieldsQuiet(jpToken, kOk, { 'STS JP': 'OK' });
    document.getElementById('nav-dashboard').click();
    await settle();
    const cardOk = [...document.querySelectorAll('#reservation-list .res-card')].find(c => c.textContent.includes(kOk));
    check('STS JP・STS 支店が両方OKで撮影日FIX未入力なら「撮影日未定」ではなく「予約確定」と出る',
          cardOk.textContent.includes('予約確定') && !cardOk.textContent.includes('撮影日未定'), cardOk.textContent);

    // --- どちらかがRQのままなら「リクエスト中」（OKが片方にあっても、まだ確定扱いにしない） ---
    const kRq = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Rq\n02 Status Bride2').kanriNo;
    ctx.apiSaveFieldsQuiet(rowToken, kRq, { 'STS 支店': 'OK' }); // STS JPはRQのまま
    document.getElementById('nav-dashboard').click();
    await settle();
    const cardRq = [...document.querySelectorAll('#reservation-list .res-card')].find(c => c.textContent.includes(kRq));
    check('STS(JP側)がRQ・STS(支店側)がOKなら「リクエスト中」と出る（片方でも未確定なら予約確定にしない）',
          cardRq.textContent.includes('リクエスト中'), cardRq.textContent);

    // --- FN／CR／CWもそれぞれの文言になる ---
    const kFn = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Fn\n02 Status Bride3').kanriNo;
    ctx.apiSaveFieldsQuiet(jpToken, kFn, { 'STS JP': 'FN' });
    ctx.apiSaveFieldsQuiet(rowToken, kFn, { 'STS 支店': 'FN' }); // STS JPがFNの間だけ支店もFNにできる
    const kCr = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Cr\n02 Status Bride4').kanriNo;
    ctx.apiSaveFieldsQuiet(jpToken, kCr, { 'STS JP': 'CR' });
    const kCw = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Cw\n02 Status Bride5').kanriNo;
    ctx.apiSaveFieldsQuiet(jpToken, kCw, { 'STS JP': 'CR' });
    ctx.apiSaveFieldsQuiet(rowToken, kCw, { 'STS 支店': 'CW' }); // 支店がCWで応答→自動連動でSTS JPもCWになる
    document.getElementById('nav-dashboard').click();
    await settle();
    document.getElementById('show-cancelled').checked = true; // CW（キャンセル済み）はデフォルトで一覧に出ないため表示させる
    document.getElementById('show-cancelled').dispatchEvent(new dom.window.Event('change'));
    await settle();
    const textOf = (k) => [...document.querySelectorAll('#reservation-list .res-card')].find(c => c.textContent.includes(k)).textContent;
    check('STS JP・STS 支店が両方FNなら「最終確定」と出る', textOf(kFn).includes('最終確定'));
    check('STS(JP側)がCRなら「キャンセル中」と出る', textOf(kCr).includes('キャンセル中'));
    check('STS JP・STS 支店が両方CWなら「キャンセル済」と出る', textOf(kCw).includes('キャンセル済'));

    // --- ★要件変更：撮影日FIXが入っている案件でも、文言（予約確定など）と日付の両方を併記する ---
    const kDated = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Dated\n02 Status Bride6').kanriNo;
    ctx.apiSaveFieldsQuiet(rowToken, kDated, { 'STS 支店': 'OK' });
    ctx.apiSaveFieldsQuiet(jpToken, kDated, { 'STS JP': 'OK', '撮影日FIX': '2026-12-01' });
    document.getElementById('nav-dashboard').click();
    await settle();
    const cardDated = [...document.querySelectorAll('#reservation-list .res-card')].find(c => c.textContent.includes(kDated));
    check('撮影日FIXが入っていれば日付は従来どおり表示される',
          cardDated.textContent.includes('2026/12/01') || cardDated.textContent.includes('2026-12-01'), cardDated.textContent);
    check('撮影日FIXが入っていても文言（予約確定）が併記される（今回の要望）',
          cardDated.textContent.includes('予約確定'), cardDated.textContent);
    check('日付と文言がそれぞれ別のクラスの要素として構造化されている',
          !!cardDated.querySelector('.case-status-label') && !!cardDated.querySelector('.case-status-date'));

    // --- UC／CHK／DC／PCもそれぞれの文言になる ---
    const kUc = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Uc\n02 Status Bride7').kanriNo;
    ctx.apiSaveFieldsQuiet(rowToken, kUc, { 'STS 支店': 'UC' }); // JPはRQのまま→支店の回答はJP側にも自動連動しUCになる
    const kChk = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Chk\n02 Status Bride8').kanriNo;
    ctx.apiSaveFieldsQuiet(jpToken, kChk, { 'STS JP': 'CHK' });
    const kDc = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Dc\n02 Status Bride9').kanriNo;
    ctx.apiSaveFieldsQuiet(jpToken, kDc, { 'STS JP': 'DC' });
    const kPc = ctx.apiCreateReservation(jpToken, 'ROW', '01 Status Pc\n02 Status Bride10').kanriNo;
    ctx.apiSaveFieldsQuiet(jpToken, kPc, { 'STS JP': 'PC' });
    document.getElementById('nav-dashboard').click();
    await settle();
    check('STS(支店側)がUCなら「空きなし」と出る', textOf(kUc).includes('空きなし'), textOf(kUc));
    check('STS(JP側)がCHKなら「空き確認中」と出る', textOf(kChk).includes('空き確認中'));
    check('STS(JP側)がDCなら「日付変更中」と出る', textOf(kDc).includes('日付変更中'));
    check('STS(JP側)がPCなら「プラン変更中」と出る', textOf(kPc).includes('プラン変更中'));

    // --- 一覧表（表示形式が表）でも同じ文言になる ---
    document.getElementById('view-mode-table').click();
    await settle();
    const rowOk = [...document.querySelectorAll('#reservation-table-body tr')].find(r => r.textContent.includes(kOk));
    check('一覧表（表）でも「予約確定」と出る', rowOk.textContent.includes('予約確定'), rowOk.textContent);
    document.getElementById('view-mode-card').click();
    await settle();
  }

  section('U25. 現地支店・手配課の案件詳細も日本の店舗画面と同じクイックナビ形式（常時スクロール表示）になっている');
  {
    // --- 日本（JP）側：クイックナビ7項目＋「記入欄」内の日本記入欄／現地記入欄の切替タブ ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    document.querySelector('#reservation-list .res-card').click();
    await settle();

    const nav = document.getElementById('detail-quick-nav');
    check('日本側の詳細画面にもクイックナビが表示される（店舗画面と同じ仕組み）', !!nav);
    const navBtns = [...nav.querySelectorAll('[data-scroll-to]')];
    check('クイックナビにメッセージ・お客様情報・予約内容・記入欄・手配・ドライブ・履歴の7つがある',
          navBtns.length === 7, navBtns.map(b => b.dataset.scrollTo).join(','));
    const missingTargets = navBtns.map(b => b.dataset.scrollTo).filter(id => !document.getElementById(id));
    check('クイックナビの全ボタンに対応するセクションが実在する', missingTargets.length === 0, missingTargets.join(','));
    // ★不具合防止：jsdomにはscrollIntoViewが無いが、押しても例外にならず安全に無視されること
    let navErr = null;
    try { navBtns.forEach(b => b.click()); } catch (e) { navErr = e; }
    check('クイックナビのボタンを押しても例外にならない（scrollIntoViewが無い環境でも安全）',
          navErr === null, String(navErr));

    // ★要件の肝：現地支店や手配課ならではの項目（記入欄内の日本記入欄／現地記入欄）だけは
    // これまでどおりタブ（隠す／表示の切替）として残っている一方、その他のセクションは
    // クイックナビをクリックしなくても最初から全部見える（隠されていない）
    ['message', 'customer', 'reservation', 'arrangement', 'drive', 'timeline'].forEach(key => {
      check(`「${key}」セクションはクイックナビを押さなくても最初から表示されている`,
            paneHidden(document, key) === false, String(paneHidden(document, key)));
    });
    const switcherBtns = [...document.querySelectorAll('.entry-switch-btn')];
    check('日本側には「記入欄」内に日本記入欄／現地記入欄の2択の切替タブがある', switcherBtns.length === 2,
          switcherBtns.map(b => b.dataset.entryTab).join(','));

    // --- 現地支店（BRANCH）側：クイックナビは同じ7項目、ただし切替タブは無く現地記入欄のみ ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'ROW', 'CHANGE-ME-ROW');
    document.querySelector('#reservation-list .res-card').click();
    await settle();

    const navBranch = document.getElementById('detail-quick-nav');
    check('現地支店の詳細画面にも同じクイックナビが表示される', !!navBranch);
    const navBranchBtns = [...navBranch.querySelectorAll('[data-scroll-to]')];
    check('現地支店のクイックナビも7項目（日本記入欄が無いだけで項目数は変わらない）',
          navBranchBtns.length === 7, navBranchBtns.map(b => b.dataset.scrollTo).join(','));
    ['message', 'customer', 'reservation', 'arrangement', 'drive', 'timeline', 'local'].forEach(key => {
      check(`現地支店でも「${key}」セクションが最初から表示されている`,
            paneHidden(document, key) === false, String(paneHidden(document, key)));
    });
    check('現地支店には日本記入欄との切替タブ自体が出ない（現地ならではの項目のみ）',
          document.querySelectorAll('.entry-switch-btn').length === 0);
    check('現地支店の画面には日本記入欄セクション自体が存在しない',
          !document.querySelector('[data-tab-pane="jpEntry"]'));
  }

  section('U26. 現地支店・手配課のプラン・オプションを表形式に統一（プラン／オプションの隣でSTSを直接編集）');
  {
    const kanri5 = ctx.apiCreateReservation(
      ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, 'ROW', '01 PlanTable\n02 PlanTable2'
    ).kanriNo;

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri5)).click();
    await settle();

    // ★要件の肝：以前は「プラン名の下」に読み取り専用のSTSバッジ、CHG NOの下に編集用の
    // STS JP/STS 支店の欄が別々にあったが、添付いただいた既存システムのUIに寄せて、
    // プラン・オプションと同じ表の中にSTS列として並べ、その場で直接編集できるようにした
    // ★要件変更：さらに「第◯希望」の一覧とも統合し、1つの明細票カードの中に
    // 「希望日一覧（折りたたみ）」と「プラン・オプション明細」の2つの表として並べた
    const planCard = document.querySelector('.plan-option-card');
    check('プラン・オプションが1つの表（明細票）にまとまっている', !!planCard);
    const cardTables = [...planCard.querySelectorAll('table.plan-table')];
    // [0]は希望日一覧（<details>内）、[1]がプラン・オプション明細（プラン＋オプション①〜⑤）、
    // [2]はオプション⑥〜⑩（別の<details>内。常に描画されるが名称は空のことが多い）
    check('明細票カードの中に希望日・プラン・オプション⑥〜⑩の3つの表がある', cardTables.length === 3);
    const planTable = cardTables[1];
    check('表のヘッダーに希望・名称・場所・日付・STS JP・STS 現地の列がある',
          !!planTable && [...planTable.querySelectorAll('thead th')].map(th => th.textContent.trim()).join(',') ===
          '希望,名称,場所,日付,STS JP,STS 現地');
    const rows = [...planTable.querySelectorAll('tbody tr')];
    check('先頭行がプラン、続く5行がオプション①〜⑤になっている', rows.length === 6 && rows[0].cells[0].textContent === 'プラン');
    check('もう「STS JP」「STS 支店」の独立したカード（status-row）は表示されない（表に一本化）',
          !document.querySelector('.status-row'));
    check('同じフィールドを二重に編集できる状態になっていない（STS JPのdata-pendingは1つだけ）',
          document.querySelectorAll('[data-pending="STS JP"]').length === 1);

    // プランの行のSTS(JP側)は、プラン名のすぐ隣（同じ行のセル。列は希望/名称/場所/日付の次＝4番目）で直接編集できる
    const planRow = rows[0];
    const planStsJpSelect = planRow.cells[4].querySelector('select');
    check('プランの行のSTS（JP側）が、プラン名の隣で直接プルダウン編集できる（FNなども選べる）',
          !!planStsJpSelect && [...planStsJpSelect.options].some(o => o.value === 'FN'));
    planStsJpSelect.value = 'OK';
    planStsJpSelect.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    check('その場で選んだSTS（JP側）がサーバーに保存される',
          ctx.apiGetReservationDetail(ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, kanri5).detail['STS JP'] === 'OK');

    // オプションもオプション名の隣（同じ行のセル）にSTS(JP側)があり、直接編集できる
    const optRow1 = rows[1];
    check('オプション①の行にも名称の隣にSTS（JP側）のプルダウンがある', optRow1.cells[0].textContent === 'オプション1' &&
          !!optRow1.cells[4].querySelector('select'));
    // ★要件：名称未設定（未使用）のオプション枠でも、日本側・支店側はSTS(JP側)の操作自体は
    // 従来から常に可能（名称の有無で制限しているのは店舗ロールだけ）
    const optStsJpSelect = optRow1.cells[4].querySelector('select');
    optStsJpSelect.value = 'FN';
    optStsJpSelect.dispatchEvent(new dom.window.Event('change'));
    await settle();
    document.getElementById('btn-save-quiet').click();
    await settle();
    const afterOptSave = ctx.apiGetReservationDetail(ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, kanri5).detail;
    check('オプション①のSTS（JP側）もその場でFNへ保存できる', afterOptSave['OP1 STS JP'] === 'FN', afterOptSave['OP1 STS JP']);

    // --- 現地支店（BRANCH）側でも同じ表形式で、STS(支店側)がオプション名の隣で編集できる ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'ROW', 'CHANGE-ME-ROW');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanri5)).click();
    await settle();
    // ★BRANCHロールは希望日の一括設定チェックボックス列が先頭に増える分、列が1つ多い
    const branchPlanTable = [...document.querySelectorAll('.plan-option-card table.plan-table')][1];
    const branchPlanRow = branchPlanTable.querySelector('tbody tr');
    // ★注：STS(JP側)がOKの間は、支店側のSTSはBRANCH_EDIT_GATEの仕様により編集不可
    // （ロック表示になる。これは今回の表形式化とは無関係の既存の業務ルール）
    check('現地支店側でも同じ表で、プラン名の隣にSTS（支店側）の欄が表示される',
          branchPlanRow.cells[6].textContent.includes('OK'));

    // ★要件：希望日一覧は「最初の予約時」「日付変更依頼(DC)の対応中」以外はほとんど使わないため、
    // ふだんは折りたたんでおく。kanri5は撮影日FIXが未確定のまま（＝まだ回答待ち）なので開いている
    const hopeDetailsBranch = document.querySelector('.hope-collapse');
    check('撮影日FIXが未確定の間は、希望日一覧が最初から開いている（現地支店）', hopeDetailsBranch.open);
  }

  section('U27. 希望日一覧のふだんの折りたたみ表示（回答待ち・日付変更依頼の間だけ自動で開く）');
  {
    const jpTok2 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;

    // --- 確定済み（撮影日FIXあり・STS JPはOK＝DCではない）は、ふだんは折りたたまれている ---
    const kanriDone = ctx.apiCreateReservation(jpTok2, 'ROW', '01 HopeDone\n02 HopeDone2').kanriNo;
    ctx.apiSaveFieldsQuiet(jpTok2, kanriDone, { 'STS JP': 'OK', '撮影日FIX': '2026-11-20' });

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriDone)).click();
    await settle();
    const hopeDetailsDone = document.querySelector('.hope-collapse');
    check('撮影日FIXが確定済み（DCでもない）なら、希望日一覧はふだん折りたたまれている',
          !hopeDetailsDone.open);

    // --- 日付変更依頼（STS JPがDC）の間は、撮影日FIXが入っていても自動で開く ---
    ctx.apiSaveFieldsQuiet(jpTok2, kanriDone, { 'STS JP': 'DC' });
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriDone)).click();
    await settle();
    const hopeDetailsDc = document.querySelector('.hope-collapse');
    check('STS(JP側)がDC（日付変更依頼）の間は、撮影日FIXが入っていても希望日一覧が自動で開く',
          hopeDetailsDc.open);

    // --- 店舗の画面でも同じ折りたたみ挙動になる ---
    const kanriShop = ctx.apiShopCreateRequest(ctx.apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token, {
      branchCode: 'VIE', team: '関東', groomLastName: 'Hope', groomName: 'Collapse', brideLastName: 'Hope', brideName: 'CollapseB',
      hope1: '2026-10-15', challengeNo: 'HOPECOLPS01'
    }).kanriNo;
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriShop)).click();
    await settle();
    const hopeDetailsShop = document.querySelector('.hope-collapse');
    check('店舗の画面でも、撮影日FIX未確定の間は希望日一覧が最初から開いている', hopeDetailsShop.open);
  }

  section('U28. 出発済み（撮影日が過去）の案件は一覧から既定で非表示・「過去を表示」で表示');
  {
    const jpTok3 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const kanriPast = ctx.apiCreateReservation(jpTok3, 'ROW', '01 PastCase\n02 PastCase2').kanriNo;
    ctx.apiSaveFieldsQuiet(jpTok3, kanriPast, { '撮影日FIX': '2020-01-01' });
    const kanriFuture = ctx.apiCreateReservation(jpTok3, 'ROW', '01 FutureCase\n02 FutureCase2').kanriNo;
    ctx.apiSaveFieldsQuiet(jpTok3, kanriFuture, { '撮影日FIX': '2099-01-01' });

    // --- 日本の手配課（JP）の一覧 ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    check('既定では出発済み（過去の撮影日）の案件が一覧に出ない',
          !document.getElementById('reservation-list').innerHTML.includes(kanriPast));
    check('未来の撮影日の案件は既定でも表示される',
          document.getElementById('reservation-list').innerHTML.includes(kanriFuture));
    document.getElementById('show-past').checked = true;
    document.getElementById('show-past').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('「過去を表示」にチェックすると出発済みの案件も表示される',
          document.getElementById('reservation-list').innerHTML.includes(kanriPast));
    document.getElementById('show-past').checked = false;
    document.getElementById('show-past').dispatchEvent(new dom.window.Event('change'));
    await settle();

    // --- 現地支店（BRANCH）の一覧でも同じ挙動 ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'ROW', 'CHANGE-ME-ROW');
    check('現地支店の一覧でも、既定では出発済みの案件が出ない',
          !document.getElementById('reservation-list').innerHTML.includes(kanriPast));
    document.getElementById('show-past').checked = true;
    document.getElementById('show-past').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('現地支店でも「過去を表示」で出発済みの案件が表示される',
          document.getElementById('reservation-list').innerHTML.includes(kanriPast));
    document.getElementById('show-past').checked = false;
    document.getElementById('show-past').dispatchEvent(new dom.window.Event('change'));
    await settle();

    // --- 店舗（SHOP）の一覧でも同じ挙動（店舗自身が起票した案件で確認） ---
    const kanriShopPast = ctx.apiShopCreateRequest(ctx.apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token, {
      branchCode: 'VIE', team: '関東', groomLastName: 'Past', groomName: 'Shop', brideLastName: 'Past', brideName: 'ShopB',
      hope1: '2026-10-01', challengeNo: 'PASTSHOP001'
    }).kanriNo;
    ctx.apiSaveFieldsQuiet(ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, kanriShopPast, { '撮影日FIX': '2020-06-15' });
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    check('店舗の一覧でも、既定では出発済みの案件が出ない',
          !document.getElementById('reservation-list').innerHTML.includes(kanriShopPast));
    document.getElementById('show-past').checked = true;
    document.getElementById('show-past').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('店舗でも「過去を表示」で出発済みの案件が表示される',
          document.getElementById('reservation-list').innerHTML.includes(kanriShopPast));
  }

  section('U29. 現地支店の「撮影データ納品」（URL登録・ファイルアップロード・取消）');
  {
    const jpTok4 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const kanriDelivery = ctx.apiCreateReservation(jpTok4, 'ROW', '01 Delivery\n02 DeliveryB').kanriNo;

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'ROW', 'CHANGE-ME-ROW');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriDelivery)).click();
    await settle();
    document.querySelector('[data-tab="drive"]').click();
    await settle();

    check('現地支店の画面に「撮影データ納品」の入力欄がある', !!document.getElementById('delivery-data-url-input'));
    document.getElementById('delivery-data-url-input').value = 'https://drive.google.com/final-ui';
    document.getElementById('delivery-data-url-submit').click();
    await settle();
    check('URLを登録できる（サーバー側）',
          ctx.apiGetReservationDetail(jpTok4, kanriDelivery).detail['撮影データ納品URL'] === 'https://drive.google.com/final-ui');

    document.getElementById('delivery-data-url-clear').click();
    await settle();
    check('取消ボタンでURLをクリアできる',
          ctx.apiGetReservationDetail(jpTok4, kanriDelivery).detail['撮影データ納品URL'] === '');

    // アップロード自体はAPIを直接呼び、一覧の表示・削除ボタンの動作だけ画面で確認する
    ctx.apiBranchUploadDeliveryData(ctx.apiLogin('ROW', 'CHANGE-ME-ROW').session.token, kanriDelivery,
      'final-ui.zip', 'application/zip', Buffer.from('x').toString('base64'));
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriDelivery)).click();
    await settle();
    document.querySelector('[data-tab="drive"]').click();
    await settle();
    check('アップロード済みのファイルが一覧に表示される（現地支店）',
          document.getElementById('delivery-data-list').innerHTML.includes('final-ui.zip'));
    const deleteDeliveryBtn = document.querySelector('[data-delivery-data-delete]');
    check('現地支店の画面に削除ボタンがある', !!deleteDeliveryBtn);
    deleteDeliveryBtn.click();
    await settle();
    check('削除すると一覧から消える', !document.getElementById('delivery-data-list').innerHTML.includes('final-ui.zip'));

    // --- 日本側（JP）は閲覧のみ（登録・アップロード・削除の操作欄は出ない） ---
    ctx.apiSetDeliveryDataUrl(ctx.apiLogin('ROW', 'CHANGE-ME-ROW').session.token, kanriDelivery, 'https://drive.google.com/jp-view');
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriDelivery)).click();
    await settle();
    document.querySelector('[data-tab="drive"]').click();
    await settle();
    check('日本側には撮影データ納品のURL登録欄が出ない（閲覧のみ）', !document.getElementById('delivery-data-url-input'));
    check('日本側にも登録済みのURLへのリンクは表示される',
          document.getElementById('detail-content').innerHTML.includes('https://drive.google.com/jp-view'));
  }

  section('U30. オプション枠を5件から10件に拡張（自由入力・6件目以降はアコーディオン）');
  {
    // --- 新規依頼フォーム：10件の入力欄、6〜10件目はアコーディオンに収納 ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();
    for (let n = 1; n <= 10; n++) {
      check(`新規依頼フォームにオプション${n}の入力欄がある`, !!document.getElementById('shop-new-option' + n));
    }
    check('オプション名の入力欄はフリー入力（select ではなく input）',
          document.getElementById('shop-new-option1').tagName === 'INPUT');
    const newOptionAccordion = document.getElementById('shop-new-option6').closest('details');
    check('新規依頼フォームのオプション6〜10はアコーディオン（details）に収納されている', !!newOptionAccordion);
    check('未入力の間はアコーディオンが閉じている', !newOptionAccordion.open);

    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'TENOPTUI001';
    document.getElementById('shop-new-groom-last').value = 'Ten';
    document.getElementById('shop-new-groom').value = 'Options';
    document.getElementById('shop-new-bride-last').value = 'Ten';
    document.getElementById('shop-new-bride').value = 'OptionsB';
    document.getElementById('shop-new-hope1').value = '2026-09-10';
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    for (let n = 1; n <= 10; n++) document.getElementById('shop-new-option' + n).value = `オプション${n}番`;
    document.getElementById('shop-new-submit').click();
    await settle();
    check('10件のオプションを指定して送信できる', !document.getElementById('shop-new-success').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);
    const kanriTenOpt = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];
    const jpTok5 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const tenOptDetail = ctx.apiGetReservationDetail(jpTok5, kanriTenOpt).detail;
    check('10件目（OP10）のオプションも保存される', tenOptDetail['OP10'] === 'オプション10番');

    // --- 店舗の詳細画面：オプション表も6〜10件目はアコーディオン ---
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriTenOpt)).click();
    await settle();
    const shopOpAccordion = document.querySelector('#shop-sec-reservation .plan-option-card details.hope-collapse');
    check('店舗の詳細画面でもオプション6〜10がアコーディオンに入っている', !!shopOpAccordion);
    check('入力済みなのでアコーディオンが自動で開いている', shopOpAccordion.open);
    check('店舗の詳細でもオプション名はフリー入力（input）',
          document.querySelector('[data-pending="OP1"]').tagName === 'INPUT');

    // --- JP/BRANCHの詳細画面でも同様（プラン・オプション明細） ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriTenOpt)).click();
    await settle();
    const jpOpAccordion = document.querySelector('.plan-option-card details.hope-collapse');
    check('日本側（JP）の詳細画面でもオプション6〜10がアコーディオンに入っている', !!jpOpAccordion);
    check('入力済みなのでアコーディオンが自動で開いている（JP側）', jpOpAccordion.open);
    check('日本側でもオプション名はフリー入力（input）',
          document.querySelector('[data-pending="OP1"]').tagName === 'INPUT');
  }

  section('U31. 店舗の「オプション」タブを廃止し、プラン・オプション明細の1枚の表に統合（プラン行を強調表示）');
  {
    // ★このセクション専用の店舗発案件を作る（前のセクションの変数に依存させない）
    const shopTokU31 = ctx.apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token;
    const kanriU31 = ctx.apiShopCreateRequest(shopTokU31, {
      branchCode: 'VIE', team: '関東', groomLastName: 'Union', groomName: 'Plan',
      brideLastName: 'Union', brideName: 'Option', hopeDate: '2026-09-10',
      challengeNo: 'PLANOPT0001'
    }).kanriNo;

    // --- 日本側（JP）は元々1枚の表なので、プラン行に.plan-rowが付いているかだけ確認 ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU31)).click();
    await settle();
    const jpPlanRow = document.querySelector('.plan-option-card table.plan-table tr.plan-row');
    check('日本側の明細表で、プラン行に強調用のクラス（plan-row）が付いている', !!jpPlanRow);
    check('プラン行のいちばん左のセルが「プラン」', jpPlanRow && jpPlanRow.querySelector('td').textContent.trim() === 'プラン');

    // --- 店舗側：オプション独立タブが無くなり、プラン・オプションが1枚の表に統合されている ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU31)).click();
    await settle();

    check('店舗のクイックナビに「オプション」ボタンはもう無い', !document.querySelector('[data-scroll-to="shop-sec-options"]'));
    check('店舗の画面に独立した「オプション」セクション（shop-sec-options）はもう無い', !document.getElementById('shop-sec-options'));

    // ★希望日一覧もプラン・オプションと同じ明細票へ統合したため、#shop-sec-reservation内には
    // table.plan-tableが複数（[0]希望日一覧・[1]プラン・オプション明細・[2]オプション⑥〜⑩）ある
    const shopTable = document.querySelectorAll('#shop-sec-reservation table.plan-table')[1];
    check('店舗の「予約内容」内にプラン・オプション明細の表（plan-table）がある', !!shopTable);
    check('店舗の明細表にもオプション①の入力欄（data-pending="OP1"）が同じ表の中にある',
          document.querySelector('[data-pending="OP1"]').closest('table.plan-table') === shopTable);

    const shopPlanRow = shopTable.querySelector('tr.plan-row');
    check('店舗の明細表でも、プラン行に強調用のクラス（plan-row）が付いている', !!shopPlanRow);
    check('店舗のプラン行のいちばん左のセルが「プラン」', shopPlanRow && shopPlanRow.querySelector('td').textContent.trim() === 'プラン');
    // ★要件変更：案件全体のプラン単独欄は廃止され読み取り専用表示になった
    // （プラン行にはSTS JP編集用のselectは残るが、プラン名のselectは無い）
    check('店舗のプラン行にはもうプラン名の選択欄が無い（読み取り専用表示。プランは希望日の欄から選ぶ）',
          !document.getElementById('shop-detail-plan-select') && !shopPlanRow.querySelector('[data-pending="プラン名"]'));

    // ★要件：PUSHボタン・キャンセル理由欄は、統合後も引き続きプラン・オプションの明細表のすぐ近くにある
    check('PUSHボタンは引き続きプラン・オプション明細表と同じカードの中にある',
          !!shopTable.closest('.plan-option-card').querySelector('#shop-push-btn'));
    check('キャンセル理由欄も引き続き同じカードの中にある',
          !!shopTable.closest('.plan-option-card').querySelector('#shop-cancel-reason-block'));
  }

  section('U32. 現地支店・手配課の案件詳細のセクション掲載順を日本の店舗と揃える');
  {
    const expectedLabels = ['お客様情報', '予約内容', '記入欄', '手配', 'ドライブ', 'メッセージ', '履歴'];
    const expectedIds = ['sec-customer', 'sec-reservation', 'sec-entry', 'sec-arrangement', 'sec-drive', 'sec-message', 'sec-timeline'];

    // --- JP（手配課） ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    document.querySelector('#reservation-list .res-card').click();
    await settle();
    const jpNavBtns = [...document.getElementById('detail-quick-nav').querySelectorAll('button')].map(b => b.textContent);
    check('JPのクイックナビが店舗と同じ並び順（お客様情報→予約内容→記入欄→手配→ドライブ→メッセージ→履歴）になっている',
          jpNavBtns.join(',') === expectedLabels.join(','), jpNavBtns.join(','));
    const jpHtml = document.getElementById('detail-content').innerHTML;
    const jpPositions = expectedIds.map(id => jpHtml.indexOf(`id="${id}"`));
    check('JPのセクションの実際の掲載順（DOM上の並び）も同じ順番になっている',
          jpPositions.every(p => p >= 0) && jpPositions.every((p, i) => i === 0 || p > jpPositions[i - 1]), jpPositions.join(','));

    // --- BRANCH（現地支店） ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'VIE', 'CHANGE-ME-VIE');
    [...document.querySelectorAll('#reservation-list .res-card')][0].click();
    await settle();
    const branchNavBtns = [...document.getElementById('detail-quick-nav').querySelectorAll('button')].map(b => b.textContent);
    check('現地支店のクイックナビも店舗と同じ並び順になっている（項目数はJPと同じ7つ）',
          branchNavBtns.join(',') === expectedLabels.join(','), branchNavBtns.join(','));
    const branchHtml = document.getElementById('detail-content').innerHTML;
    const branchPositions = expectedIds.map(id => branchHtml.indexOf(`id="${id}"`));
    check('現地支店のセクションの実際の掲載順も同じ順番になっている',
          branchPositions.every(p => p >= 0) && branchPositions.every((p, i) => i === 0 || p > branchPositions[i - 1]), branchPositions.join(','));
  }

  section('U33. 現地支店・手配課も店舗と同じく一覧画面の中で検索・絞り込みできる');
  {
    // --- JP（手配課）：一覧に絞り込み欄が出る。店舗用の欄は出ない ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    check('JPの一覧に絞り込み欄が表示される', !document.getElementById('nonshop-dashboard-filter').classList.contains('hidden'));
    check('JPには店舗用の絞り込み欄は出ない', document.getElementById('shop-dashboard-filter').classList.contains('hidden'));

    const jpTokU33 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const kanriU33a = ctx.apiCreateReservation(jpTokU33, 'VIE', '01 U33 Alpha\n02 U33 Bride\nU33FILTER01').kanriNo;
    ctx.apiSaveFieldsQuiet(jpTokU33, kanriU33a, { 'プラン名': 'U33専用プランA' });
    document.getElementById('nav-dashboard').click();
    await settle();

    document.getElementById('nonshop-dashboard-search').value = 'U33FILTER01';
    document.getElementById('nonshop-dashboard-search').dispatchEvent(new dom.window.Event('input'));
    await settle();
    check('チャレンジ番号で絞り込むと該当案件だけ表示される（JP）',
          document.getElementById('reservation-list').innerHTML.includes(kanriU33a) &&
          document.querySelectorAll('#reservation-list .res-card').length === 1);
    document.getElementById('nonshop-dashboard-search').value = '';
    document.getElementById('nonshop-dashboard-search').dispatchEvent(new dom.window.Event('input'));
    await settle();

    document.getElementById('nonshop-dashboard-plan').value = 'ぜったいに一致しないプラン名';
    document.getElementById('nonshop-dashboard-plan').dispatchEvent(new dom.window.Event('input'));
    await settle();
    check('プラン名で絞り込むと一致しない案件は出ない（JP）',
          !document.getElementById('reservation-list').innerHTML.includes(kanriU33a));
    document.getElementById('nonshop-dashboard-plan').value = '';
    document.getElementById('nonshop-dashboard-plan').dispatchEvent(new dom.window.Event('input'));
    await settle();

    ctx.apiSaveFieldsQuiet(jpTokU33, kanriU33a, { 'STS JP': 'FN' });
    // ★一覧は開いた時点のデータをキャッシュしているため、サーバー側の更新を反映させるため再読込する
    document.getElementById('nav-dashboard').click();
    await settle();
    document.getElementById('nonshop-dashboard-sts-jp').value = 'FN';
    document.getElementById('nonshop-dashboard-sts-jp').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('STS(JP側)で絞り込むと一致する案件だけ表示される（JP）',
          document.getElementById('reservation-list').innerHTML.includes(kanriU33a));
    document.getElementById('nonshop-dashboard-sts-jp').value = 'CR';
    document.getElementById('nonshop-dashboard-sts-jp').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('STS(JP側)で一致しない値を選ぶと出なくなる（JP）',
          !document.getElementById('reservation-list').innerHTML.includes(kanriU33a));
    document.getElementById('nonshop-dashboard-sts-jp').value = '';
    document.getElementById('nonshop-dashboard-sts-jp').dispatchEvent(new dom.window.Event('change'));
    await settle();

    // --- 現地支店にも同じ絞り込み欄が出る ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'VIE', 'CHANGE-ME-VIE');
    check('現地支店の一覧にも絞り込み欄が表示される', !document.getElementById('nonshop-dashboard-filter').classList.contains('hidden'));
    document.getElementById('nonshop-dashboard-search').value = 'U33FILTER01';
    document.getElementById('nonshop-dashboard-search').dispatchEvent(new dom.window.Event('input'));
    await settle();
    check('現地支店でもチャレンジ番号で絞り込める',
          document.getElementById('reservation-list').innerHTML.includes(kanriU33a) &&
          document.querySelectorAll('#reservation-list .res-card').length === 1);
    document.getElementById('nonshop-dashboard-search').value = '';
    document.getElementById('nonshop-dashboard-search').dispatchEvent(new dom.window.Event('input'));
    await settle();
  }

  section('U34. お客様提供画像・指示書の一括アップロード（複数個別・ZIPまとめ）UI');
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'BULKUPLOAD1';
    document.getElementById('shop-new-groom-last').value = 'Bulk';
    document.getElementById('shop-new-groom').value = 'Upload';
    document.getElementById('shop-new-bride-last').value = 'Bulk';
    document.getElementById('shop-new-bride').value = 'UploadB';
    document.getElementById('shop-new-hope1').value = '2026-09-10';
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    document.getElementById('shop-new-submit').click();
    await settle();
    const kanriU34 = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU34)).click();
    await settle();

    // --- 個別モード（既定）：チェックすると該当種別のファイル欄だけが現れる ---
    check('個別モードが既定で選ばれている', document.getElementById('shop-upload-mode-each').checked);
    check('個別モードのブロックが表示されている', !document.getElementById('shop-upload-each-block').classList.contains('hidden'));
    check('ZIPモードのブロックは隠れている', document.getElementById('shop-upload-zip-block').classList.contains('hidden'));
    const hairCheck = document.querySelector('.shop-upload-each-check[value="ヘアメイク画像"]');
    const hairFile = [...document.querySelectorAll('.shop-upload-each-file')].find(f => f.dataset.doctype === 'ヘアメイク画像');
    check('未チェックの間はファイル選択欄が隠れている', hairFile.classList.contains('hidden'));
    hairCheck.checked = true;
    hairCheck.dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('チェックするとその種別のファイル選択欄が現れる', !hairFile.classList.contains('hidden'));
    hairCheck.checked = false;
    hairCheck.dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('チェックを外すとファイル選択欄がまた隠れる', hairFile.classList.contains('hidden'));

    document.getElementById('shop-upload-submit').click();
    await settle();
    check('何もチェックせずに送信するとエラーになる（個別モード）',
          !document.getElementById('shop-upload-error').classList.contains('hidden'));

    // --- ZIPモードへ切替 ---
    document.getElementById('shop-upload-mode-zip').checked = true;
    document.getElementById('shop-upload-mode-zip').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('ZIPモードに切り替えると個別ブロックが隠れる', document.getElementById('shop-upload-each-block').classList.contains('hidden'));
    check('ZIPモードのブロックが表示される', !document.getElementById('shop-upload-zip-block').classList.contains('hidden'));
    document.getElementById('shop-upload-submit').click();
    await settle();
    check('対象種別を選ばずに送信するとエラーになる（ZIPモード）',
          !document.getElementById('shop-upload-error').classList.contains('hidden'));

    // --- 実際のアップロード結果（一覧表示）は、jsdomでファイル選択を再現できないため、
    // 他のアップロード系テストと同様にサーバーAPIを直接呼んでから一覧の再読込を検証する ---
    const shopTokU34 = ctx.apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token;
    ctx.apiShopUploadDocumentsBatch(shopTokU34, kanriU34, [
      { docType: 'ヘアメイク画像', filename: 'hairU34.jpg', mimeType: 'image/jpeg', base64Data: Buffer.from('x').toString('base64') },
      { docType: '衣裳画像', filename: 'dressU34.jpg', mimeType: 'image/jpeg', base64Data: Buffer.from('x').toString('base64') }
    ]);
    ctx.apiShopUploadDocumentZip(shopTokU34, kanriU34, ['ヘアメイク画像', '撮影指示書'], 'まとめU34.zip', 'application/zip', Buffer.from('x').toString('base64'));
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU34)).click();
    await settle();
    const uploadListHtml = document.getElementById('shop-upload-list').innerHTML;
    check('個別一括アップロードした2件が一覧に表示される', uploadListHtml.includes('hairU34.jpg') && uploadListHtml.includes('dressU34.jpg'));
    check('ZIPアップロードしたファイルも一覧に表示される', uploadListHtml.includes('まとめU34.zip'));
    check('ZIPファイルの対象種別が一覧にも表示される（対象: ヘアメイク画像、撮影指示書）',
          uploadListHtml.includes('ヘアメイク画像、撮影指示書'));
  }

  section('U35. お客様情報の追加項目（衣装会社・同行者・チェックイン/アウト日）・希望日の時間帯とプラン複数希望');
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'CUSTOMFLD01';
    document.getElementById('shop-new-groom-last').value = 'Custom';
    document.getElementById('shop-new-groom').value = 'Field';
    document.getElementById('shop-new-bride-last').value = 'Custom';
    document.getElementById('shop-new-bride').value = 'FieldB';
    document.getElementById('shop-new-hope1').value = '2026-09-10';
    document.getElementById('shop-new-hope2').value = '2026-09-11';
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    document.getElementById('shop-new-submit').click();
    await settle();
    const kanriU35 = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU35)).click();
    await settle();

    // --- お客様情報：衣装会社（マスタ選択式）・同行者の有無・チェックイン/アウト日 ---
    document.querySelector('[data-scroll-to="shop-sec-customer"]').click();
    await settle();
    const costumeSelect = document.querySelector('[data-pending="衣装会社"]');
    check('店舗のお客様情報に衣装会社の選択欄がある', !!costumeSelect);
    const costumeOptionNames = [...costumeSelect.options].map(o => o.value).filter(Boolean);
    ['ブライダルハウスTUTU', 'フォーシスアンドカンパニー', 'クチュールナオコ', 'ワタベウェディング', 'デスティニーライン']
      .forEach(name => check(`衣装会社の候補に「${name}」がある`, costumeOptionNames.includes(name), costumeOptionNames.join(',')));
    costumeSelect.value = 'ワタベウェディング';
    costumeSelect.dispatchEvent(new dom.window.Event('change'));
    const companionSelect = document.querySelector('[data-pending="同行者の有無"]');
    check('店舗のお客様情報に同行者の有無の選択欄がある', !!companionSelect);
    companionSelect.value = '有';
    companionSelect.dispatchEvent(new dom.window.Event('change'));
    const checkinInput = document.querySelector('[data-pending="チェックイン日"]');
    const checkoutInput = document.querySelector('[data-pending="チェックアウト日"]');
    check('店舗のお客様情報にチェックイン日・チェックアウト日の欄がある（ホテル住所の隣）', !!checkinInput && !!checkoutInput);
    checkinInput.value = '2026-09-09';
    checkinInput.dispatchEvent(new dom.window.Event('change'));
    checkoutInput.value = '2026-09-12';
    checkoutInput.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();

    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU35)).click();
    await settle();
    const jpTokU35 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    let detU35 = ctx.apiGetReservationDetail(jpTokU35, kanriU35).detail;
    check('衣装会社が保存される', detU35['衣装会社'] === 'ワタベウェディング');
    check('同行者の有無が保存される', detU35['同行者の有無'] === '有');
    check('チェックイン日が保存される', detU35['チェックイン日'] === '2026-09-09', detU35['チェックイン日']);
    check('チェックアウト日が保存される', detU35['チェックアウト日'] === '2026-09-12', detU35['チェックアウト日']);

    // --- 必要書類チェックリストに「ヘアメイクアンケート」がある ---
    document.querySelector('[data-scroll-to="shop-sec-docs"]').click();
    await settle();
    check('店舗の必要書類チェックリストに「ヘアメイクアンケート」がある',
          [...document.querySelectorAll('.checkbox-label')].some(l => l.textContent.includes('ヘアメイクアンケート')));

    // --- 希望日の時間帯（AM/PM）：支店マスタのフラグがOFFの間は列自体が出ない ---
    document.querySelector('[data-scroll-to="shop-sec-reservation"]').click();
    await settle();
    check('希望日時間帯表示フラグがOFFの間は時間帯の選択欄が出ない',
          ![...document.querySelectorAll('[data-pending]')].some(el => el.dataset.pending === '希望日①時間帯'));

    setBranchFieldUi_(ctx, 'VIE', '希望日時間帯表示', true);
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU35)).click();
    await settle();
    const hopeTimeSelect1 = document.querySelector('[data-pending="希望日①時間帯"]');
    check('支店マスタでONにすると希望日①の時間帯選択欄が現れる', !!hopeTimeSelect1);
    hopeTimeSelect1.value = 'AM';
    hopeTimeSelect1.dispatchEvent(new dom.window.Event('change'));

    // --- プランを複数希望できる（希望日ごとにプラン欄）。第一希望・第二希望それぞれにプランを指定 ---
    const hopePlanSelect1 = document.querySelector('[data-pending="希望日①プラン"]');
    const hopePlanSelect2 = document.querySelector('[data-pending="希望日②プラン"]');
    check('希望日ごとにプラン選択欄がある（第一希望）', !!hopePlanSelect1);
    check('希望日ごとにプラン選択欄がある（第二希望）', !!hopePlanSelect2);
    hopePlanSelect1.value = 'ローマ3時間フォト';
    hopePlanSelect1.dispatchEvent(new dom.window.Event('change'));
    hopePlanSelect2.value = 'フィレンツェフォト';
    hopePlanSelect2.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();

    detU35 = ctx.apiGetReservationDetail(jpTokU35, kanriU35).detail;
    check('希望日①の時間帯（AM）が保存される', detU35['希望日①時間帯'] === 'AM');
    check('希望日①のプランが保存される', detU35['希望日①プラン'] === 'ローマ3時間フォト');
    check('希望日②のプランも保存される', detU35['希望日②プラン'] === 'フィレンツェフォト');

    // 現地支店が第二希望（フィレンツェフォト）を確定 → 案件全体のプラン名へ自動反映される
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'VIE', 'CHANGE-ME-VIE');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU35)).click();
    await settle();
    const branchCell2 = document.querySelector('[data-pending="希望日② STS 支店"]');
    check('現地支店の希望日②STS支店の選択欄がある', !!branchCell2);
    branchCell2.value = 'OK';
    branchCell2.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();

    detU35 = ctx.apiGetReservationDetail(jpTokU35, kanriU35).detail;
    check('現地確定した希望日②のプラン（フィレンツェフォト）が案件全体のプラン名へ反映される',
          detU35['プラン名'] === 'フィレンツェフォト', detU35['プラン名']);

    // 画面を開き直すと、プラン・オプション明細のプラン選択にも反映されている（JP側）
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU35)).click();
    await settle();
    // ★要件変更：案件全体のプラン単独欄は読み取り専用表示になったため、selectの値ではなく
    // 表示テキストで自動反映後の値を確認する
    const planTableRow = document.querySelector('.plan-option-card tr.plan-row');
    check('JP側のプラン・オプション明細のプラン表示にも自動反映後の値が表示される',
          !!planTableRow && planTableRow.textContent.includes('フィレンツェフォト'));
  }

  // ---------------------------------------------------------------
  section('U36. 新規依頼フォーム：AM/PM・複数プラン希望・備考欄を追加、パスポート番号欄は削除');
  {
    document.getElementById('nav-logout').click();
    await settle();
    // ★仕様変更：フォーム上部の支店（都市）単独選択欄は廃止したため、AM/PM表示ON/OFFの確認は
    // 希望日①のプランを切り替えて行う。イスタンブール支店にはこのテスト専用のプランを1件
    // 登録しておく（表示OFF＝プラン未登録の支店の確認用）。
    ctx.__ss.getSheetByName('プランマスタ').appendRow(['IST', 'イスタンブール新規テスト用プラン', true]);
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();

    check('新規依頼フォームにパスポート番号の入力欄は無い', !document.getElementById('shop-new-passport-block'));
    check('新規依頼フォームの一番下に備考欄がある', !!document.getElementById('shop-new-remarks'));

    document.getElementById('shop-new-hopeplan1').value = 'イスタンブール新規テスト用プラン';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('希望日時間帯表示フラグがOFFの間は新規依頼フォームにも時間帯欄が出ない',
          document.getElementById('shop-new-hopetime1').classList.contains('hidden'));

    // ★U35でVIEの「希望日時間帯表示」フラグが既にONにされている（既存案件の詳細画面で確認済み）。
    // ここでは新規依頼フォームでも、希望日①のプランをVIEのものに切り替えると同じフラグが
    // 反映されることを確認する
    document.getElementById('shop-new-hopeplan1').value = 'ローマ3時間フォト';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('支店マスタでONの支店のプランを選ぶと新規依頼フォームにも時間帯欄が現れる（第一希望）',
          !document.getElementById('shop-new-hopetime1').classList.contains('hidden'));
    const newHopePlan1Opts = [...document.getElementById('shop-new-hopeplan1').options].map(o => o.value).filter(Boolean);
    check('希望日ごとのプラン選択欄にプランマスタの候補が入る（第一希望）',
          newHopePlan1Opts.includes('ローマ3時間フォト'), newHopePlan1Opts.join(','));
    check('希望日ごとのプラン選択欄にプランマスタの候補が入る（第二希望）',
          [...document.getElementById('shop-new-hopeplan2').options].map(o => o.value).includes('フィレンツェフォト'));

    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'NEWFORM0001';
    document.getElementById('shop-new-groom-last').value = 'New';
    document.getElementById('shop-new-groom').value = 'Form';
    document.getElementById('shop-new-bride-last').value = 'New';
    document.getElementById('shop-new-bride').value = 'FormB';
    document.getElementById('shop-new-hope1').value = '2026-10-01';
    document.getElementById('shop-new-hopetime1').value = 'PM';
    document.getElementById('shop-new-hope2').value = '2026-10-02';
    document.getElementById('shop-new-hopeplan2').value = 'フィレンツェフォト';
    document.getElementById('shop-new-remarks').value = '雨天の場合は室内ロケに変更希望';
    document.getElementById('shop-new-submit').click();
    await settle();

    const kanriU36 = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];
    const jpTokU36 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const detU36 = ctx.apiGetReservationDetail(jpTokU36, kanriU36).detail;
    check('パスポート番号は送信されず空欄のまま作成される', !detU36['パスポート番号'], detU36['パスポート番号']);
    check('備考が保存される', detU36['備考'] === '雨天の場合は室内ロケに変更希望', detU36['備考']);
    check('希望日①の時間帯（PM）が保存される', detU36['希望日①時間帯'] === 'PM');
    check('希望日①のプランが保存される', detU36['希望日①プラン'] === 'ローマ3時間フォト');
    check('希望日②のプランが保存される', detU36['希望日②プラン'] === 'フィレンツェフォト');
  }

  // ---------------------------------------------------------------
  section('U37. STS(支店側)が未回答の間は「未設定」ではなく「未確認」と表示される');
  let kanriU37 = null;
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'UNCONFIRM01';
    document.getElementById('shop-new-groom-last').value = 'Un';
    document.getElementById('shop-new-groom').value = 'Confirm';
    document.getElementById('shop-new-bride-last').value = 'Un';
    document.getElementById('shop-new-bride').value = 'ConfirmB';
    document.getElementById('shop-new-hope1').value = '2026-10-15';
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    document.getElementById('shop-new-submit').click();
    await settle();
    kanriU37 = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU37)).click();
    await settle();

    const statusJpChip = document.querySelector('#shop-sec-status [data-history-field="STS JP"]');
    const statusBranchChip = document.querySelector('#shop-sec-status [data-history-field="STS 支店"]');
    check('STS(支店側)が未回答の間は「未確認」と表示される（「未設定」ではない）',
          !!statusBranchChip && statusBranchChip.textContent.trim() === '未確認', statusBranchChip && statusBranchChip.textContent);
    check('STS(JP側)は依頼直後から必ず値が入るため「未確認」にはならない（値そのものが表示される）',
          !!statusJpChip && statusJpChip.textContent.trim() !== '未確認' && statusJpChip.textContent.trim() !== '未設定',
          statusJpChip && statusJpChip.textContent);

    // プラン・オプション明細の表側の支店バッジも同様に「未確認」になる
    const planRowShop = document.querySelector('.plan-table tbody tr.plan-row');
    const planBranchChip = planRowShop.querySelector('.chip.branch');
    check('プラン・オプション明細のSTS（支店側）バッジも「未確認」になる',
          !!planBranchChip && planBranchChip.textContent.trim() === '未確認');
  }

  // ---------------------------------------------------------------
  section('U38. 同行者の有無で「有」を選ぶと人数入力欄（大人・子供・幼児）が現れる');
  {
    document.querySelector('[data-scroll-to="shop-sec-customer"]').click();
    await settle();
    const companionSel = document.querySelector('[data-pending="同行者の有無"]');
    const countBlock = document.getElementById('companion-count-block');
    check('人数入力欄は最初は隠れている（同行者の有無が未設定のため）',
          !!countBlock && countBlock.style.display === 'none');
    companionSel.value = '有';
    companionSel.dispatchEvent(new dom.window.Event('change'));
    check('「有」を選ぶと人数入力欄（大人・子供・幼児）が表示される',
          countBlock.style.display !== 'none');
    check('人数入力欄は大人・子供・幼児の3つ',
          !!countBlock.querySelector('[data-pending="同行者（大人）"]') &&
          !!countBlock.querySelector('[data-pending="同行者（子供）"]') &&
          !!countBlock.querySelector('[data-pending="同行者（幼児）"]'));
    countBlock.querySelector('[data-pending="同行者（大人）"]').value = '2';
    countBlock.querySelector('[data-pending="同行者（子供）"]').value = '1';
    countBlock.querySelector('[data-pending="同行者（幼児）"]').value = '0';
    countBlock.querySelector('[data-pending="同行者（大人）"]').dispatchEvent(new dom.window.Event('change'));
    countBlock.querySelector('[data-pending="同行者（子供）"]').dispatchEvent(new dom.window.Event('change'));
    countBlock.querySelector('[data-pending="同行者（幼児）"]').dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    const jpTokU38 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const kanriU38 = document.getElementById('detail-content').querySelector('.kanri').textContent.replace('管理番号: ', '');
    const detU38 = ctx.apiGetReservationDetail(jpTokU38, kanriU38).detail;
    check('大人の人数が保存される', String(detU38['同行者（大人）']) === '2', detU38['同行者（大人）']);
    check('子供の人数が保存される', String(detU38['同行者（子供）']) === '1', detU38['同行者（子供）']);

    companionSel.value = '無';
    companionSel.dispatchEvent(new dom.window.Event('change'));
    check('「無」に戻すと人数入力欄が再び隠れる', countBlock.style.display === 'none');
  }

  // ---------------------------------------------------------------
  section('U39. チェックイン/アウト日のヒント表示・フライト情報のIN/OUT分割');
  {
    const checkinBlockJp = document.querySelector('[data-pending="チェックイン日"]').closest('.field-block');
    const checkoutBlockJp = document.querySelector('[data-pending="チェックアウト日"]').closest('.field-block');
    check('チェックイン日の欄に案内文が薄く入っている',
          checkinBlockJp.textContent.includes('撮影地のチェックイン日を入れてください'));
    check('チェックアウト日の欄に案内文が薄く入っている',
          checkoutBlockJp.textContent.includes('撮影地のチェックアウト日を入れてください'));
    const flightIn = document.querySelector('[data-pending="フライト情報"]');
    const flightOut = document.querySelector('[data-pending="フライト情報（OUT）"]');
    check('フライト情報がINとOUTの2つの欄に分かれている', !!flightIn && !!flightOut);
    check('IN欄のラベルに「（IN）」と入っている',
          flightIn.closest('.field-block').querySelector('label').textContent.includes('（IN）'));
    check('OUT欄のラベルに「（OUT）」と入っている',
          flightOut.closest('.field-block').querySelector('label').textContent.includes('（OUT）'));
    flightIn.value = 'JL123 10/1 10:00羽田発';
    flightIn.dispatchEvent(new dom.window.Event('change'));
    flightOut.value = 'JL124 10/5 16:00現地発';
    flightOut.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    const jpTokU39 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const kanriU39 = document.getElementById('detail-content').querySelector('.kanri').textContent.replace('管理番号: ', '');
    const detU39 = ctx.apiGetReservationDetail(jpTokU39, kanriU39).detail;
    check('フライト情報（IN）が保存される', detU39['フライト情報'] === 'JL123 10/1 10:00羽田発');
    check('フライト情報（OUT）が保存される', detU39['フライト情報（OUT）'] === 'JL124 10/5 16:00現地発');
  }

  // ---------------------------------------------------------------
  section('U40. 撮影日FIXと挙式日FIXを「撮影日(挙式日)FIX」として同じ欄にまとめる');
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU37)).click();
    await settle();

    check('予約内容タブに「撮影日(挙式日)FIX」という1つの欄しか無い（挙式日FIXの単独欄は無い）',
          !document.querySelector('[data-pending="挙式日FIX"]') &&
          !!document.querySelector('[data-pending="撮影日FIX"]'));
    const mergedLabel = [...document.querySelectorAll('label')].find(l => l.textContent.trim() === '撮影日(挙式日)FIX');
    check('欄のラベルが「撮影日(挙式日)FIX」になっている', !!mergedLabel);

    const confirmedInput = document.querySelector('[data-pending="撮影日FIX"]');
    confirmedInput.value = '2026-11-20';
    confirmedInput.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    const jpTokU40 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const detU40 = ctx.apiGetReservationDetail(jpTokU40, kanriU37).detail;
    check('撮影日FIXを設定すると挙式日FIXにも自動でミラーされる（同じ日付として扱う）',
          detU40['撮影日FIX'] === '2026-11-20' && detU40['挙式日FIX'] === '2026-11-20',
          JSON.stringify({ c: detU40['撮影日FIX'], w: detU40['挙式日FIX'] }));
  }

  // ---------------------------------------------------------------
  section('U41. 共有メモを現地支店・日本支店（店舗）・手配課で分離した画面表示');
  {
    // 直前のU40まで手配課（JP）としてログイン済み・案件詳細を開いている
    document.querySelector('[data-scroll-to="sec-reservation"]').click();
    await settle();
    // ★注意：document.body.textContentには<script>タグの中身（JSソースコード自体）も含まれ、
    // フィールド名の文字列リテラルが常に含まれてしまうため、#detail-contentの中身だけを見る
    const dcJp = document.getElementById('detail-content');
    check('手配課の画面には「共有メモ（手配課）」の入力欄がある',
          !!document.querySelector('[data-memo-input="共有メモ（手配課）"]'));
    check('手配課の画面には「共有メモ（日本支店）」が閲覧のみで表示される（入力欄は無い）',
          dcJp.textContent.includes('共有メモ（日本支店）') &&
          !document.querySelector('[data-memo-input="共有メモ（日本支店）"]'));
    check('手配課の画面には「共有メモ（現地支店）」は出ない（他ロール専用のため）',
          !dcJp.textContent.includes('共有メモ（現地支店）'));

    // ★U37の案件はウィーン支店（VIE）宛のため、現地支店側の確認はVIEでログインする
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'VIE', 'CHANGE-ME-VIE');
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU37)).click();
    await settle();
    const dcBranch = document.getElementById('detail-content');
    check('現地支店の画面には「共有メモ（現地支店）」の入力欄がある',
          !!document.querySelector('[data-memo-input="共有メモ（現地支店）"]'));
    check('現地支店の画面には「共有メモ（手配課）」も「共有メモ（日本支店）」も出ない',
          !dcBranch.textContent.includes('共有メモ（手配課）') &&
          !dcBranch.textContent.includes('共有メモ（日本支店）'));

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU37)).click();
    await settle();
    const dcShop = document.getElementById('detail-content');
    check('店舗の画面には「共有メモ（日本支店）」の入力欄がある',
          !!document.querySelector('[data-memo-input="共有メモ（日本支店）"]'));
    check('店舗の画面には「共有メモ（現地支店）」も「共有メモ（手配課）」も出ない',
          !dcShop.textContent.includes('共有メモ（現地支店）') &&
          !dcShop.textContent.includes('共有メモ（手配課）'));
  }

  // ---------------------------------------------------------------
  section('U42. メッセージは、相手がまだ見ていない間だけ送信者が削除できる');
  {
    // 直前のU41で店舗（新宿店）としてログイン済み・kanriU37の案件詳細を開いている
    document.querySelector('[data-scroll-to="shop-sec-message"]').click();
    await settle();
    document.getElementById('msg-input').value = '削除できるはずの未読メッセージ';
    document.getElementById('btn-msg-only').click();
    await settle();

    const deleteBtn = document.querySelector('[data-history-message-delete]');
    check('送信直後・相手が未読の間は削除ボタンが出る', !!deleteBtn);

    const origConfirm = dom.window.confirm;
    dom.window.confirm = () => true;
    deleteBtn.click();
    await settle();
    dom.window.confirm = origConfirm;

    check('削除ボタンを押すとメッセージが履歴から消える',
          !document.getElementById('shop-sec-history').textContent.includes('削除できるはずの未読メッセージ'));

    // 相手（手配課）が既読にした後は削除ボタンが出ない
    document.getElementById('msg-input').value = '既読後は削除できないメッセージ';
    document.getElementById('btn-msg-only').click();
    await settle();
    const kanriU42 = document.getElementById('detail-content').querySelector('.kanri').textContent.replace('管理番号: ', '');
    const jpTokU42 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const hidU42 = ctx.apiGetReservationDetail(jpTokU42, kanriU42).detail.history
      .find(h => h.body.includes('既読後は削除できないメッセージ')).id;
    ctx.apiToggleHistoryCheck(jpTokU42, hidU42, true);
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU42)).click();
    await settle();
    document.querySelector('[data-scroll-to="shop-sec-history"]').click();
    await settle();
    const readItem = [...document.querySelectorAll('.history-item')]
      .find(el => el.textContent.includes('既読後は削除できないメッセージ'));
    check('相手が既読にした後は削除ボタンが出ない', !!readItem && !readItem.querySelector('[data-history-message-delete]'));
  }

  // ---------------------------------------------------------------
  section('U43. 希望日一覧に「場所」欄を追加、プランは他支店（他国）の候補も選べる');
  {
    // ★ここまでのプランマスタはVIE支店にしか登録されていないため、複数の国（支店）が
    // 実際にoptgroupで並ぶことを確認するにはROW支店にもプランを1件登録しておく
    ctx.__ss.getSheetByName('プランマスタ').appendRow(['ROW', 'ローマ半日プラン', true]);

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    document.querySelector('#reservation-list .res-card').click();
    await settle();

    // R-001はローマ支店（ROW）の案件。希望日一覧はプラン・オプション明細と同じカードに統合されている
    const hopeCard = document.querySelector('.plan-option-card');
    check('希望日一覧がプラン・オプション明細と同じカード（.plan-option-card）に統合されている', !!hopeCard);
    const hopeHeaderText = hopeCard.querySelector('table.plan-table thead').textContent;
    check('明細表の見出しに「場所」列がある', hopeHeaderText.includes('場所'));
    check('明細表の見出しに「名称」列もある', hopeHeaderText.includes('名称'));

    const hopePlanSelect1 = hopeCard.querySelector('[data-pending="希望日①プラン"]');
    check('希望日①のプラン選択欄がある', !!hopePlanSelect1);
    const optgroupLabels = [...hopePlanSelect1.querySelectorAll('optgroup')].map(g => g.label);
    check('プラン選択欄は都市ごとのoptgroupにまとまっている（複数の国が並ぶ）',
          optgroupLabels.length >= 2, optgroupLabels.join(','));
    const allOptionValues = [...hopePlanSelect1.querySelectorAll('option')].map(o => o.value);
    check('自支店（ローマ）のプランが候補にある', allOptionValues.includes('ローマ半日プラン'), allOptionValues.join(','));
    check('他支店（ウィーン）のプランも候補にある（国をまたいだプラン希望に対応）',
          allOptionValues.includes('フィレンツェフォト'), allOptionValues.join(','));

    // 場所欄に自由入力で保存できる
    const hopeLocationInput1 = hopeCard.querySelector('[data-pending="希望日①場所"]');
    check('希望日①の場所入力欄がある', !!hopeLocationInput1);
    hopeLocationInput1.value = 'ローマ';
    hopeLocationInput1.dispatchEvent(new dom.window.Event('change'));
    // 他支店（ウィーン方面）のプランを第二希望として選ぶ
    const hopePlanSelect2 = hopeCard.querySelector('[data-pending="希望日②プラン"]');
    hopePlanSelect2.value = 'フィレンツェフォト';
    hopePlanSelect2.dispatchEvent(new dom.window.Event('change'));
    const hopeLocationInput2 = hopeCard.querySelector('[data-pending="希望日②場所"]');
    hopeLocationInput2.value = 'フィレンツェ';
    hopeLocationInput2.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();

    const jpTokU43 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const detU43 = ctx.apiGetReservationDetail(jpTokU43, 'R-001').detail;
    check('希望日①の場所が保存される', detU43['希望日①場所'] === 'ローマ');
    check('希望日②のプラン（他支店のプラン）が保存される', detU43['希望日②プラン'] === 'フィレンツェフォト');
    check('希望日②の場所が保存される', detU43['希望日②場所'] === 'フィレンツェ');

    // 店舗の画面にも同じく「場所」欄・他支店のプラン候補が出る
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU37)).click();
    await settle();
    const shopHopeCard = document.querySelector('.plan-option-card');
    check('店舗の画面にも希望日一覧の場所欄がある', !!shopHopeCard.querySelector('[data-pending="希望日①場所"]'));
    const shopHopePlanOpts = [...shopHopeCard.querySelectorAll('[data-pending="希望日①プラン"] option')].map(o => o.value);
    check('店舗の画面のプラン選択欄にも他支店（他国）の候補が入る',
          shopHopePlanOpts.includes('ローマ3時間フォト') || shopHopePlanOpts.includes('フィレンツェフォト'),
          shopHopePlanOpts.join(','));
  }

  // ---------------------------------------------------------------
  section('U44. 撮影データ納品先メールアドレス欄・準備場所のヒント表示・新規依頼フォームの希望日プランは支店選択前から全支店横断');
  {
    // --- JP側：準備場所のヒント表示（イタリアの支店＝ROW）と撮影データ納品先メールアドレス欄 ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    const jpTokU44 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const kanriU44 = ctx.apiCreateReservation(jpTokU44, 'ROW', '01 Hint\n02 Test').kanriNo;
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(kanriU44)).click();
    await settle();
    const resPaneU44 = document.querySelector('[data-tab-pane="reservation"]');
    const prepLabelU44 = [...resPaneU44.querySelectorAll('label')].find(l => l.textContent.includes('準備場所'));
    check('準備場所のラベルに「ローマの場合は選択」のヒントが付いている',
          !!prepLabelU44 && prepLabelU44.textContent.includes('ローマの場合は選択'), prepLabelU44 && prepLabelU44.textContent);

    const customerPaneU44 = document.querySelector('[data-tab-pane="customer"]');
    const localEmailField = customerPaneU44.querySelector('[data-pending="現地連絡先メール"]');
    const deliveryEmailField = customerPaneU44.querySelector('[data-pending="撮影データ納品先メールアドレス"]');
    check('お客様情報タブに撮影データ納品先メールアドレスの入力欄がある', !!deliveryEmailField);
    check('撮影データ納品先メールアドレスは現地で連絡可能なメールアドレスの直後に置かれている',
          !!localEmailField && !!deliveryEmailField &&
          localEmailField.closest('.field-block').nextElementSibling === deliveryEmailField.closest('.field-block'));
    deliveryEmailField.value = 'jp-delivery@example.com';
    deliveryEmailField.dispatchEvent(new dom.window.Event('change'));
    document.getElementById('btn-save-quiet').click();
    await settle();
    check('撮影データ納品先メールアドレスが保存される',
          ctx.apiGetReservationDetail(jpTokU44, kanriU44).detail['撮影データ納品先メールアドレス'] === 'jp-delivery@example.com');

    // --- 店舗側：お客様情報にも同じ欄がある ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    const shopTokU44 = ctx.apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token;
    const shopKanriU44 = ctx.apiShopCreateRequest(shopTokU44, {
      branchCode: 'VIE', team: '関東', groomLastName: 'Shop', groomName: 'Delivery',
      brideLastName: 'Shop', brideName: 'Delivery', challengeNo: 'U44SHOPDEL1', hope1: '2026-09-10'
    }).kanriNo;
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card')]
      .find(c => c.textContent.includes(shopKanriU44)).click();
    await settle();
    const shopLocalEmailField = document.querySelector('[data-pending="現地連絡先メール"]');
    const shopDeliveryEmailField = document.querySelector('[data-pending="撮影データ納品先メールアドレス"]');
    check('店舗の画面にも撮影データ納品先メールアドレスの入力欄がある', !!shopDeliveryEmailField);
    check('店舗の画面でも現地で連絡可能なメールアドレスの直後に置かれている',
          !!shopLocalEmailField && !!shopDeliveryEmailField &&
          shopLocalEmailField.closest('.field-block').nextElementSibling === shopDeliveryEmailField.closest('.field-block'));

    // --- 新規依頼フォーム：希望日のプラン選択欄は、支店（都市）を選ぶ前から全支店横断の候補が入っている ---
    document.getElementById('nav-shop-new').click();
    await settle();
    const hopePlan2OptsU44 = [...document.getElementById('shop-new-hopeplan2').querySelectorAll('option')].map(o => o.value);
    check('新規依頼フォームの希望日②プラン欄には、依頼先支店を選ぶ前から複数支店の候補が入っている（自支店＝ローマ）',
          hopePlan2OptsU44.includes('ローマ半日プラン'), hopePlan2OptsU44.join(','));
    check('新規依頼フォームの希望日②プラン欄には、依頼先支店を選ぶ前から複数支店の候補が入っている（他支店＝ウィーン）',
          hopePlan2OptsU44.includes('プランA'), hopePlan2OptsU44.join(','));
    const hopePlan2GroupsU44 = [...document.getElementById('shop-new-hopeplan2').querySelectorAll('optgroup')].length;
    check('希望日②プラン欄も都市ごとのoptgroupにまとまっている（複数の国が並ぶ）', hopePlan2GroupsU44 >= 2);
  }

  // ---------------------------------------------------------------
  section('U45. 手配課・現地支店の一覧に「撮影データ送付」有無を表示（店舗の一覧には出さない）');
  {
    const H = ctx.RESERVATION_HEADERS;
    const addCaseU45 = (o) => {
      const row = new Array(H.length).fill('');
      Object.keys(o).forEach(k => { const i = H.indexOf(k); if (i !== -1) row[i] = o[k]; });
      ctx.__ss.getSheetByName('予約一覧').appendRow(row);
    };
    addCaseU45({ '支店コード': 'ROW', '管理番号': 'R-DELIVERTEST1', '管轄': '関東', '新郎名（ローマ字）': 'Delivered', 'DriveフォルダURL': 'https://drive.google.com/x' });
    addCaseU45({ '支店コード': 'ROW', '管理番号': 'R-DELIVERTEST2', '管轄': '関東', '新郎名（ローマ字）': 'NotDelivered' });

    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    document.getElementById('nav-dashboard').click();
    await settle();
    document.getElementById('view-mode-table').click();
    await settle();

    const headerTextU45 = document.querySelector('#reservation-table-wrap thead').textContent;
    check('手配課の表のヘッダーに「撮影データ送付」列がある', headerTextU45.includes('撮影データ送付'));
    const rowsU45 = [...document.querySelectorAll('#reservation-table-body tr')];
    const deliveredRow = rowsU45.find(r => r.textContent.includes('R-DELIVERTEST1'));
    check('DriveフォルダURL登録済みの案件は「送付済」と表示される',
          !!deliveredRow && deliveredRow.textContent.includes('送付済'), deliveredRow ? deliveredRow.textContent : 'not found');
    const notDeliveredRow = rowsU45.find(r => r.textContent.includes('R-DELIVERTEST2'));
    check('DriveフォルダURL未登録の案件は「未送付」と表示される',
          !!notDeliveredRow && notDeliveredRow.textContent.includes('未送付'), notDeliveredRow ? notDeliveredRow.textContent : 'not found');

    // カード表示にも同じチップが出る
    document.getElementById('view-mode-card').click();
    await settle();
    const deliveredCard = [...document.querySelectorAll('#reservation-list .res-card')].find(c => c.textContent.includes('R-DELIVERTEST1'));
    check('カード表示にも「撮影データ送付済」のチップが出る',
          !!deliveredCard && deliveredCard.textContent.includes('撮影データ送付済'));

    // 現地支店（BRANCH）でも同じ列が出る
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'ROW', 'CHANGE-ME-ROW');
    document.getElementById('view-mode-table').click();
    await settle();
    check('現地支店の表にも「撮影データ送付」列がある',
          document.querySelector('#reservation-table-wrap thead').textContent.includes('撮影データ送付'));

    // 店舗（SHOP）の一覧には出さない
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    await settle();
    check('店舗の表には「撮影データ送付」列が出ない（.non-shopのため非表示）',
          document.querySelector('#reservation-table-wrap thead th.non-shop').classList.contains('hidden'));
  }

  // ---------------------------------------------------------------
  section('U46. 新規依頼フォームの二重送信防止（連打しても1件だけ作成される）');
  {
    // ★不具合修正：送信ボタンに二重送信防止が無く、通信中に連打すると同じ内容の案件が
    // 複数作成されてしまっていた（「予約が複数できてしまう」「送信できたか分かりづらくて
    // 何度も押してしまう」というユーザーからの報告に対応）。
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'DBLCLICK001';
    document.getElementById('shop-new-groom-last').value = 'Double';
    document.getElementById('shop-new-groom').value = 'Click';
    document.getElementById('shop-new-bride-last').value = 'Double';
    document.getElementById('shop-new-bride').value = 'ClickB';
    document.getElementById('shop-new-hope1').value = '2026-11-01';
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();

    const submitBtnU46 = document.getElementById('shop-new-submit');
    const originalLabelU46 = submitBtnU46.textContent;
    submitBtnU46.click();
    // ★通信（setTimeoutで疑似非同期化されている）が終わる前、settle()を待つより先に確認する
    check('送信直後はボタンが無効化される（二重送信防止）', submitBtnU46.disabled === true);
    check('送信中はボタンの文言が「送信中...」に変わる', submitBtnU46.textContent === '送信中...');
    // 無効化されている間にもう一度押しても、無効なボタンなのでハンドラは実行されない
    submitBtnU46.click();
    await settle();

    check('通信が終わるとボタンの文言が元に戻る', submitBtnU46.textContent === originalLabelU46);
    check('通信が終わるとボタンは再度押せる状態に戻る', submitBtnU46.disabled === false);

    const jpTokenU46 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const createdU46 = ctx.apiGetDashboard(jpTokenU46, { showAll: true }).reservations
      .filter(r => r.groomName && r.groomName.includes('DOUBLE') && r.groomName.includes('CLICK'));
    check('連打しても案件は1件だけ作成される', createdU46.length === 1, JSON.stringify(createdU46.map(r => r.kanriNo)));
  }

  // ---------------------------------------------------------------
  section('U47. 新規依頼フォームに複数支店にまたがる依頼ができる旨の案内を追加');
  {
    // ★不具合修正：以前は一番上の「支店（都市）」欄が単一選択のため、下の希望日ごとのプラン欄で
    // 支店をまたいで選べることが伝わりにくいという指摘への対応。フォーム冒頭に案内を追加した
    // （その後U48でその「支店（都市）」欄自体を廃止したため、案内文言・位置チェックも合わせて更新）。
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();
    const noteU47 = document.querySelector('#view-shop-new .multi-branch-note');
    check('新規依頼フォームに複数支店にまたがる依頼ができる案内が出る', !!noteU47, document.getElementById('view-shop-new').innerHTML.slice(0, 300));
    check('案内には「複数の現地支店にまたがる」という文言が含まれる', !!noteU47 && noteU47.textContent.includes('複数の現地支店にまたがる'));
    check('案内は該当の手配課欄より前（フォーム冒頭）に出る',
          !!noteU47 && noteU47.compareDocumentPosition(document.getElementById('shop-new-team')) & 4 /* Node.DOCUMENT_POSITION_FOLLOWING */,
          'compareDocumentPosition');
  }

  // ---------------------------------------------------------------
  section('U48. メッセージ・保存ボタンの送信中表示、新規依頼のロード画面、支店（都市）欄廃止、完了案内の明るい配色');
  {
    // --- ①②メッセージ・保存・決定ボタンを押すと「送信中...」「保存中...」に変わり、連打できなくなる ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    document.querySelector('#reservation-list .res-card, #reservation-table-body tr').click();
    await settle();
    document.getElementById('msg-input').value = 'ロード表示確認用メッセージ';
    const msgBtn = document.getElementById('btn-msg-only');
    const msgBtnLabel = msgBtn.textContent;
    msgBtn.click();
    check('メッセージ送信ボタンを押すと文言が「送信中...」に変わる', msgBtn.textContent === '送信中...');
    check('メッセージ送信ボタンを押すと無効化される（連打防止）', msgBtn.disabled === true);
    await settle();
    check('通信が終わるとメッセージ送信ボタンの文言が元に戻る', msgBtn.textContent === msgBtnLabel);
    check('通信が終わるとメッセージ送信ボタンが再度押せる状態に戻る', msgBtn.disabled === false);

    // 予約内容タブ下部の「保存のみ」クイックボタンでも同様（quick-save-btn。複数箇所に同じハンドラが
    // querySelectorAllで登録されているため、押した実際のボタンだけが busy 表示になることも確認する）
    const remarksField = document.querySelector('[data-tab-pane="reservation"] [data-pending="備考"]');
    if (remarksField) { remarksField.value = 'U48保存中表示確認'; remarksField.dispatchEvent(new dom.window.Event('change')); }
    const quickSaveBtn = document.querySelector('[data-tab-pane="reservation"] .quick-save-btn');
    const quickSaveLabel = quickSaveBtn.textContent;
    quickSaveBtn.click();
    check('クイック保存ボタンを押すと文言が「保存中...」に変わる', quickSaveBtn.textContent === '保存中...');
    await settle();
    check('通信が終わるとクイック保存ボタンの文言が元に戻る', quickSaveBtn.textContent === quickSaveLabel);

    // --- ⑦完了案内（success-banner）の配色が白背景＋青文字になっている（以前は緑背景で暗いと指摘された） ---
    const styleText = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    const successBannerRule = (styleText.match(/\.success-banner\s*\{[^}]*\}/) || [''])[0];
    check('完了案内（success-banner）の背景が白になっている（以前の緑背景から変更）',
          /background:\s*#fff/i.test(successBannerRule), successBannerRule);
    check('完了案内（success-banner）の文字色が他の案内文と同じ青系（--color-primary-dark）になっている',
          successBannerRule.includes('--color-primary-dark'), successBannerRule);

    // --- ②新規依頼フォーム上部の「支店（都市）」単独選択欄が廃止されている ---
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();
    check('新規依頼フォームに「支店（都市）」の単独選択欄はもう無い', !document.getElementById('shop-new-branch'));
    check('撮影希望場所欄は希望日（第一希望）の行の直後に配置されている',
          (document.getElementById('shop-new-hope1').closest('.shop-new-hope-row').nextElementSibling.tagName === 'LABEL' &&
           document.getElementById('shop-new-hope1').closest('.shop-new-hope-row').nextElementSibling.nextElementSibling.id === 'shop-new-location-wrap'));

    // --- ②希望日①のプランを選ぶとすぐ下の撮影希望場所欄に、その支店・そのプランの候補が反映される ---
    document.getElementById('shop-new-hopeplan1').value = 'ローマ3時間フォト';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('希望日①にチェックボックス方式のプランを選ぶと、すぐ下の撮影希望場所欄が複数選択のチェックボックスになる',
          document.querySelectorAll('.shop-new-location-cb').length === 2);

    // --- ⑥別のプランを選び直すと、前のプランの撮影地（チェックボックス）が残らず、新しいプランの
    //     入力方式（この場合はプルダウン）に確実に切り替わる ---
    document.getElementById('shop-new-hopeplan1').value = 'フィレンツェフォト';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('別のプラン（プルダウン方式）に切り替えると、前のプランのチェックボックスは残らない',
          document.querySelectorAll('.shop-new-location-cb').length === 0);
    check('切り替え後は新しいプランの入力方式（プルダウン）になっている',
          document.getElementById('shop-new-location').tagName === 'SELECT');
    const locOptsAfterSwitch = [...document.getElementById('shop-new-location').options].map(o => o.value).filter(Boolean);
    check('切り替え後の候補は新しいプラン（フィレンツェフォト）専用のものだけになっている（前のプランの候補は残らない）',
          locOptsAfterSwitch.includes('ドゥオモ') && !locOptsAfterSwitch.includes('コロッセオ'), locOptsAfterSwitch.join(','));

    // 再度、自由入力モードのプラン（プランA）に戻しても、候補（datalist）が空にならず反映される
    // （以前は支店切り替えと希望日①プラン変更の非同期処理の順序次第でdatalistが空になる不具合があった）
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('自由入力方式のプランに戻すと撮影希望場所が自由入力欄に戻る',
          document.getElementById('shop-new-location').tagName === 'INPUT');

    // --- ②希望日①のプラン未選択のまま送信しようとするとエラーになる（基準支店が決まらないため） ---
    document.getElementById('shop-new-hopeplan1').value = '';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'U48NOPLAN01';
    document.getElementById('shop-new-groom-last').value = 'No';
    document.getElementById('shop-new-groom').value = 'Plan';
    document.getElementById('shop-new-bride-last').value = 'No';
    document.getElementById('shop-new-bride').value = 'PlanB';
    document.getElementById('shop-new-hope1').value = '2026-09-10';
    document.getElementById('shop-new-submit').click();
    await settle();
    check('希望日①のプラン未選択のままだと送信できない',
          document.getElementById('shop-new-success').classList.contains('hidden') &&
          !document.getElementById('shop-new-error').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);

    // --- ④新規依頼の送信中は、画面全体を覆うロード表示が出る ---
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    const overlay = document.getElementById('loading-overlay');
    check('送信前はロード表示が隠れている', overlay.classList.contains('hidden'));
    document.getElementById('shop-new-submit').click();
    check('新規依頼を送信するとロード表示が出る', !overlay.classList.contains('hidden'));
    check('ロード表示に「しばらくお待ちください」の案内が出る',
          document.getElementById('loading-overlay-text').textContent.includes('お待ちください'));
    await settle();
    check('通信が終わるとロード表示が隠れる', overlay.classList.contains('hidden'));
    check('この送信自体は成功する（プランを選んだので基準支店が決まる）',
          !document.getElementById('shop-new-success').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);
  }

  // ---------------------------------------------------------------
  section('U49. 新郎新婦年齢欄にFN確定までの入力ヒントを追加・希望日②〜⑤にも撮影希望場所欄を追加');
  {
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'SHOP1', 'CHANGE-ME-SHOP1');
    document.getElementById('nav-shop-new').click();
    await settle();

    const groomAgeLabel = [...document.querySelectorAll('#view-shop-new label')].find(l => l.textContent.includes('新郎年齢'));
    const brideAgeLabel = [...document.querySelectorAll('#view-shop-new label')].find(l => l.textContent.includes('新婦年齢'));
    check('新規依頼フォームの新郎年齢・新婦年齢のラベル自体には期限の文言を埋め込まない（元の文言のまま）',
          !!groomAgeLabel && groomAgeLabel.textContent.trim() === '新郎年齢（※ISWのみ必要）' &&
          !!brideAgeLabel && brideAgeLabel.textContent.trim() === '新婦年齢（※ISWのみ必要）',
          groomAgeLabel && groomAgeLabel.textContent + ' / ' + brideAgeLabel && brideAgeLabel.textContent);
    const ageHintBand = [...document.querySelectorAll('#view-shop-new .field-group-hint')]
      .find(el => el.textContent.includes('FN確定までに要入力'));
    check('新郎新婦年齢欄のまとまりの上に「下記はFN確定までに要入力」の帯が1つ出る', !!ageHintBand, ageHintBand && ageHintBand.textContent);
    check('その帯は新郎年齢欄より前（フォーム上で上）にある',
          !!ageHintBand && !!groomAgeLabel &&
          (ageHintBand.compareDocumentPosition(groomAgeLabel) & 4) /* Node.DOCUMENT_POSITION_FOLLOWING */);

    // --- 希望日②〜⑤にも、それぞれ独立した撮影希望場所欄がある（希望日①と同じプラン連動の仕組み） ---
    check('希望日②の撮影希望場所欄は最初は自由入力（プラン未選択のため）',
          document.getElementById('shop-new-hopelocation2').tagName === 'INPUT');
    document.getElementById('shop-new-hopeplan2').value = 'ローマ3時間フォト';
    document.getElementById('shop-new-hopeplan2').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('希望日②にチェックボックス方式のプランを選ぶと、希望日②の撮影希望場所欄がチェックボックスになる',
          document.querySelectorAll('.shop-new-hopelocation-cb2').length === 2);
    check('希望日①の撮影希望場所欄は希望日②の選択の影響を受けない（自由入力のまま）',
          document.getElementById('shop-new-location').tagName === 'INPUT');

    document.getElementById('shop-new-hopeplan3').value = 'フィレンツェフォト';
    document.getElementById('shop-new-hopeplan3').dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('希望日③にプルダウン方式のプランを選ぶと、希望日③の撮影希望場所欄がプルダウンになる',
          document.getElementById('shop-new-hopelocation3').tagName === 'SELECT');

    // --- 実際に入力して送信し、希望日ごとに違う撮影希望場所が保存されることを確認 ---
    document.getElementById('shop-new-team').value = '関東';
    document.getElementById('shop-new-challengeno').value = 'HOPELOCUI01';
    document.getElementById('shop-new-groom-last').value = 'Hope';
    document.getElementById('shop-new-groom').value = 'Location';
    document.getElementById('shop-new-bride-last').value = 'Hope';
    document.getElementById('shop-new-bride').value = 'LocationB';
    document.getElementById('shop-new-hope1').value = '2026-09-10';
    document.getElementById('shop-new-hopeplan1').value = 'プランA';
    document.getElementById('shop-new-hopeplan1').dispatchEvent(new dom.window.Event('change'));
    await settle();
    document.getElementById('shop-new-hope2').value = '2026-09-11';
    const hopeLoc2Checks = [...document.querySelectorAll('.shop-new-hopelocation-cb2')];
    hopeLoc2Checks.find(c => c.value === 'コロッセオ').checked = true;
    hopeLoc2Checks.find(c => c.value === 'コロッセオ').dispatchEvent(new dom.window.Event('change'));
    document.getElementById('shop-new-hope3').value = '2026-09-12';
    document.getElementById('shop-new-hopelocation3').value = 'ドゥオモ';

    document.getElementById('shop-new-submit').click();
    await settle();
    check('希望日ごとに違う撮影希望場所を指定して送信できる',
          !document.getElementById('shop-new-success').classList.contains('hidden'),
          document.getElementById('shop-new-error').textContent);
    const kanriU49 = document.getElementById('shop-new-success-text').textContent.match(/予約番号\s*(\S+)/)[1];
    const jpTokU49 = ctx.apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token;
    const detU49 = ctx.apiGetReservationDetail(jpTokU49, kanriU49).detail;
    check('希望日②の場所（チェックボックスで選んだ値）が保存される', detU49['希望日②場所'] === 'コロッセオ', detU49['希望日②場所']);
    check('希望日③の場所（プルダウンで選んだ値）が保存される', detU49['希望日③場所'] === 'ドゥオモ', detU49['希望日③場所']);

    // --- 送信後はフォームがリセットされ、希望日②の撮影希望場所欄も自由入力に戻っている ---
    check('送信後は希望日②の撮影希望場所欄も自由入力に戻る（前のプランのチェックボックスが残らない）',
          document.getElementById('shop-new-hopelocation2').tagName === 'INPUT');

    // --- 既存案件の詳細画面（日本側・お客様情報タブ）にも同じヒントが付いている ---
    document.getElementById('nav-logout').click();
    await settle();
    await login(dom, 'KANTO', 'CHANGE-ME-KANTO');
    document.getElementById('nav-dashboard').click();
    await settle();
    [...document.querySelectorAll('#reservation-list .res-card, #reservation-table-body tr')]
      .find(c => c.textContent.includes(kanriU49)).click();
    await settle();
    const jpAgeHintBand = [...document.querySelectorAll('[data-tab-pane="customer"] .field-group-hint')]
      .find(el => el.textContent.includes('FN確定までに要入力'));
    check('既存案件の詳細画面（日本側・お客様情報タブ）にも同じ帯が1つ出る',
          !!jpAgeHintBand, jpAgeHintBand && jpAgeHintBand.textContent);
  }

  console.log(`\n${'='.repeat(50)}\n画面テスト結果: ${pass} 件成功 / ${fail} 件失敗\n${'='.repeat(50)}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('テストが異常終了しました:', e); process.exit(1); });
