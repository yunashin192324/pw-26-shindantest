// 第2巡目：仕様からの独立計算（アプリの関数を使わずに計算した値）と、画面に表示された値の突き合わせ。
// 仕様（manual.html・README）：
//  ・社員＝自店舗のみ、所長・チーフ＝自エリアのみ、マスタ＝全件
//  ・表示期間：既定＝出発予定日が直近6か月以内または未来／直近1年＋今後／今期・前期（11月〜10月）／全期間
//  ・KPI：予約件数＝行数、保険・Wifi・キャンサポ・TAViCA＝各数量欄の合計
//  ・ランキング・個人別：エリア・営業所・担当者ごとの件数、数量合計、NB付帯（〇）件数、PUSH成約（☆）件数
const path = require('path');
const { createBackend, buildPage, launch } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
const notes = [];

// ---- 試験データ（乱数の種を固定） ----
let seed = 20261023; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(rnd() * a.length)];
const today = new Date(); today.setHours(0, 0, 0, 0);
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
const gen = [];
for (let i = 0; i < 400; i++) {
  const depKind = rnd();
  const dep = depKind < 0.06 ? null : addDays(today, Math.floor(rnd() * 1400) - 1000); // 約2.7年前〜1年後、6%は空欄
  gen.push({
    area: pick(['東', '東', '西', '']), office: pick(['A店', 'A店', 'B店', 'C店', '']), staff: pick(['C1', 'C2', 'C3', '']),
    reservationNo: 'R' + i, departureDate: dep, bookingDate: addDays(today, -Math.floor(rnd() * 900)),
    insuranceQty: pick([1, 2, 3, '1,500', '-', '', 0, 2.5]), wifiQty: pick([1, 4, '', 'abc']), cansapoQty: pick([1, '', 7]), tavicaQty: pick(['', 2, '3']),
    insuranceStatus: pick(['〇', '☆', '×', '-', '', '△']), wifiStatus: pick(['〇', '☆', '']), cansapoStatus: pick(['〇', '-']), tavicaStatus: pick(['☆', ''])
  });
}
// 仕様どおりの数値の読み方：数値、または桁区切り付きの数字の文字。それ以外（-、abc、空欄）は数えない。
const num = v => typeof v === 'number' ? v : (/^\s*-?[\d,]+(\.\d+)?\s*$/.test(String(v)) && String(v).trim() !== '' ? Number(String(v).replace(/,/g, '')) : null);

function inWindow(r, mode) {
  const d = r.departureDate ? ymd(r.departureDate) : null;
  const t = ymd(today);
  if (mode === 'all') return true;
  if (d === null) return true; // Code.gs selectRows_ の注記：出発予定日が空欄の行は表示期間では除外しない（manual.html には記載なし）
  if (mode === 'default' || mode === '1y') {
    const from = new Date(today.getTime()); const day = from.getDate(); from.setDate(1); from.setMonth(from.getMonth() - (mode === '1y' ? 12 : 6));
    from.setDate(Math.min(day, new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate()));
    return d !== null && d >= ymd(from);
  }
  // 今期・前期：11月〜翌10月
  const fyStartYear = today.getMonth() >= 10 ? today.getFullYear() : today.getFullYear() - 1;
  const y = mode === 'fy-current' ? fyStartYear : fyStartYear - 1;
  return d !== null && d >= y + '-11-01' && d <= (y + 1) + '-10-31';
}
function oracle(rows) {
  const sum = k => rows.reduce((s, r) => s + (num(r[k]) === null ? 0 : num(r[k])), 0);
  const groups = {};
  rows.forEach(r => {
    const a = r.area || '(未設定)', o = r.office || '(未設定)', s = r.staff || '(未設定)'; const key = a + '|' + o + '|' + s;
    const g = groups[key] || (groups[key] = { count: 0, ins: [0, 0, 0] });
    g.count++; g.ins[0] += num(r.insuranceQty) === null ? 0 : num(r.insuranceQty);
    if (r.insuranceStatus === '〇') g.ins[1]++; else if (r.insuranceStatus === '☆') g.ins[2]++;
  });
  return { total: rows.length, ins: sum('insuranceQty'), wifi: sum('wifiQty'), cansapo: sum('cansapoQty'), tavica: sum('tavicaQty'), groups };
}
const fmtN = n => Number(n || 0).toLocaleString('ja-JP');

(async () => {
  const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 3, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限'], ['s@example.com', 'S', 'A店', '東', '社員'], ['m@example.com', 'G', '', '西', '所長・チーフ']]);
  be.sheets[S.STAFF_NAME_SHEET_NAME].getRange(2, 1, 3, 2).setValues([['C1', '山田'], ['C2', '佐藤'], ['C3', '鈴木']]);
  const toSheet = r => S.ALL_COLUMNS.map(c => { const v = r[c.key]; if (v === undefined || v === null) return ''; if (v instanceof Date) return new be.SDate(v.getFullYear(), v.getMonth(), v.getDate()); return v; });
  be.sheets[S.SHEET_NAME].getRange(2, 1, gen.length, N).setValues(gen.map(toSheet));
  const htmlPath = path.join(__dirname, 'r2_kpi.html'); buildPage(htmlPath);

  for (const who of [{ email: 'master@example.com', scope: r => true }, { email: 's@example.com', scope: r => r.office === 'A店' }, { email: 'm@example.com', scope: r => r.area === '西' }]) {
    S.Session.getActiveUser = () => ({ getEmail: () => who.email });
    const { browser, page } = await launch(be, htmlPath);
    const errors = []; page.removeAllListeners('pageerror'); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.waitForFunction(() => window.STATE && STATE.rows && STATE.rows.length > 0, null, { timeout: 30000 });
    for (const mode of ['default', '1y', 'fy-current', 'fy-prev', 'all']) {
      if (mode !== 'default') {
        const before = await page.evaluate(() => STATE.rows);
        await page.selectOption('#data-window-mode', mode);
        await page.waitForFunction(b => STATE.rows !== b || true, null).catch(() => {});
        await page.waitForTimeout(400);
      }
      const expectedRows = gen.filter(r => who.scope(r) && inWindow(r, mode));
      const o = oracle(expectedRows);
      const ui = await page.evaluate(() => ({
        total: document.getElementById('kpi-total').textContent, ins: document.getElementById('kpi-insurance').textContent,
        wifi: document.getElementById('kpi-wifi').textContent, cansapo: document.getElementById('kpi-cansapo').textContent, tavica: document.getElementById('kpi-tavica').textContent,
        ranking: Array.from(document.querySelectorAll('#ranking-tbody tr')).map(tr => Array.from(tr.children).map(td => td.innerText.replace(/\s+/g, ' ').trim()))
      }));
      const tag = who.email.split('@')[0] + '/' + mode;
      const kpiOk = ui.total === fmtN(o.total) && ui.ins === fmtN(o.ins) && ui.wifi === fmtN(o.wifi) && ui.cansapo === fmtN(o.cansapo) && ui.tavica === fmtN(o.tavica);
      assert(kpiOk, tag + '：KPI（件数・数量合計）が独立計算と一致 画面=' + JSON.stringify([ui.total, ui.ins, ui.wifi, ui.cansapo, ui.tavica]) + ' 期待=' + JSON.stringify([o.total, o.ins, o.wifi, o.cansapo, o.tavica].map(fmtN)));
      // ランキング：担当者名は氏名に変換されて表示される
      const nameOf = { C1: '山田', C2: '佐藤', C3: '鈴木', '(未設定)': '(未設定)' };
      let rankOk = Object.keys(o.groups).length === ui.ranking.filter(r => r.length >= 8).length;
      const mism = [];
      Object.keys(o.groups).forEach(k => {
        const [a, of, s] = k.split('|'); const g = o.groups[k];
        const tr = ui.ranking.find(r => r[0] === a && r[1] === of && r[2] === nameOf[s]);
        const want = '合計 ' + fmtN(g.ins[0]) + ' NB付帯 ' + fmtN(g.ins[1]) + '／PUSH成約 ' + fmtN(g.ins[2]);
        if (!tr || tr[3] !== fmtN(g.count) || tr[4] !== want) { rankOk = false; mism.push(k + ' 画面=' + (tr ? tr[3] + ' ' + tr[4] : 'なし') + ' 期待=' + g.count + ' ' + want); }
      });
      assert(rankOk, tag + '：ランキングの各行（件数・保険の合計／NB付帯／PUSH成約）が独立計算と一致' + (mism.length ? ' 例: ' + mism[0] : ''));
    }
    // 出発予定日が空欄の行の扱い（仕様の文言からは決まらないため、記録だけする）
    const blankShown = await page.evaluate(() => STATE.rows.filter(r => !r.departureDate).length);
    notes.push(who.email + '：出発予定日が空欄の行 ' + blankShown + ' 件は、どの表示期間でも表示される');
    assert(errors.length === 0, who.email + '：画面のエラーなし ' + JSON.stringify(errors.slice(0, 2)));
    await browser.close();
  }
  notes.forEach(n => console.log('NOTE: ' + n));
  console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
})().catch(e => { console.error(e); process.exit(1); });
