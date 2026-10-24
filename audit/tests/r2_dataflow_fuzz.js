// 第2巡目：データの流れの追跡（無作為な値）。シートの生の値 → サーバー（写し・圧縮）→ 通信 → ブラウザでの展開 → STATE.rows
// を通した結果が、仕様どおりの変換（独立に書いた期待値）と1件ずつ一致するかを確かめる。圧縮あり・圧縮なしの両方。
const path = require('path');
const { createBackend, buildPage, launch } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(rnd() * a.length)];
const TEXTS = ['', ' 前後空白 ', '改行\nあり', 'タブ\tあり', '"引用"', "'先頭アポ", '=1+1', '+81', '-x', '@a', '<script>alert(1)</script>', '🍣絵文字', 'ｶﾀｶﾅ', '\u0000制御', 'a'.repeat(3000), '0012', '717:イオン', 'null', 'undefined', '0', 'true'];
(async () => {
  const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 1, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限']]);
  const raws = [];
  for (let i = 0; i < 300; i++) {
    raws.push(S.ALL_COLUMNS.map(c => {
      const r = rnd();
      if (c.type === 'date') return r < 0.15 ? '' : r < 0.25 ? pick(['2026/3/5', '2026-03-05', '2026/02/30', '未定', '2026年3月5日', ' 2026/3/5 ']) : new be.SDate(2020 + Math.floor(rnd() * 8), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28));
      if (c.type === 'number') return r < 0.15 ? '' : r < 0.3 ? pick(['1,500', '-', 'abc', ' 12 ', '1e3', '¥100', '0', '-5', '3.14']) : Math.round(rnd() * 1e6) / pick([1, 10, 100]);
      if (c.key === 'reservationNo') return r < 0.2 ? Math.floor(rnd() * 1e9) : 'R' + i;
      if (c.key === 'staff' && r < 0.1) return 1234; // 数値として入った担当者コード
      return r < 0.4 ? '' : pick(TEXTS);
    }));
  }
  raws[0][0] = '東'; // 少なくとも1行は空でない
  be.sheets[S.SHEET_NAME].getRange(2, 1, raws.length, N).setValues(raws);
  // ---- 仕様どおりの期待値（アプリのコードを使わずに書く） ----
  const pad = n => String(n).padStart(2, '0');
  const expectOf = (col, v) => {
    if (col.type === 'date') {
      if (v === '' || v === null) return null;
      if (v instanceof be.SDate || (v && v.getFullYear)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
      const m = String(v).trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      // 実在しない日付（2026/02/30 など）は日付の形にそろえず、入力された文字のまま（v2.7.8〜。外部の指摘 DATE-001）
      const real = m && (() => { const y = +m[1], mo = +m[2], d = +m[3]; return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(y, mo, 0).getDate(); })();
      return real ? m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) : String(v);
    }
    if (col.type === 'number') {
      if (v === '' || v === null) return null;
      if (typeof v === 'number') return v;
      const t = String(v).replace(/,/g, '').trim(); if (t === '') return null; const n = Number(t); return isNaN(n) ? null : n;
    }
    if (col.key === 'reservationNo' && typeof v === 'number') return String(v).padStart(11, '0');
    return String(v);
  };
  // 期待値は、シートに実際に保存された値から作る（本物と同じく、先頭の ' は「文字として保存する」印として取り除かれる）
  const stored = be.sheets[S.SHEET_NAME].data.slice(1, 1 + raws.length).map(r => S.ALL_COLUMNS.map((c, i) => (r && r[i] !== undefined) ? r[i] : ''));
  const expected = stored.map(r => r.some(v => v !== '') ? S.ALL_COLUMNS.map((c, i) => expectOf(c, r[i])) : null);
  const htmlPath = path.join(__dirname, 'r2_flow.html'); buildPage(htmlPath);
  for (const variant of ['gzip', 'plain']) {
    const { browser, page } = await launch(be, htmlPath);
    if (variant === 'plain') await page.addInitScript(() => { window.DecompressionStream = undefined; });
    const errors = []; page.removeAllListeners('pageerror'); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    if (variant === 'plain') await page.reload();
    await page.waitForFunction(() => window.STATE && STATE.rows && STATE.rows.length > 0, null, { timeout: 30000 });
    await page.selectOption('#data-window-mode', 'all'); await page.waitForTimeout(800);
    const got = await page.evaluate(keys => STATE.rows.map(r => [r.rowIndex].concat(keys.map(k => r[k] === undefined ? '__undef__' : r[k]))), S.ALL_COLUMNS.map(c => c.key));
    const byRow = {}; got.forEach(g => { byRow[g[0]] = g.slice(1); });
    let bad = 0, firstBad = '';
    expected.forEach((exp, i) => {
      const g = byRow[i + 2];
      if (!exp) { if (g) { bad++; firstBad = firstBad || ('空行' + (i + 2) + 'が表示された'); } return; }
      if (!g) { bad++; firstBad = firstBad || ((i + 2) + '行目が届いていない'); return; }
      S.ALL_COLUMNS.forEach((c, ci) => { if (JSON.stringify(g[ci]) !== JSON.stringify(exp[ci])) { bad++; firstBad = firstBad || ((i + 2) + '行目 ' + c.key + ' 画面=' + JSON.stringify(g[ci]).slice(0, 40) + ' 期待=' + JSON.stringify(exp[ci]).slice(0, 40)); } });
    });
    const tr = await page.evaluate(() => window.__bootTiming ? JSON.stringify(window.__bootTiming).slice(0, 80) : '');
    assert(bad === 0, variant + '：全 ' + expected.filter(Boolean).length + ' 行×' + N + ' 項目が仕様どおりの値で画面に届く（不一致 ' + bad + '）' + (firstBad ? ' 例: ' + firstBad : ''));
    assert(errors.length === 0, variant + '：画面のエラーなし ' + JSON.stringify(errors.slice(0, 2)));
    // 一覧の表示に、文字がそのまま（HTMLとして解釈されずに）出ているか
    await page.click('button[data-tab="data"]'); await page.waitForTimeout(300);
    const injected = await page.evaluate(() => document.querySelectorAll('#data-tbody script').length);
    assert(injected === 0, variant + '：「<script>」を含む値がHTMLとして解釈されない');
    await browser.close();
  }
  console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
})().catch(e => { console.error(e); process.exit(1); });
