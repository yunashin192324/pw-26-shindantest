// 外部の指摘 BUG-12：モックアップ（PC版・スマホ版）の個人別サマリーの検索を、担当者の氏名でもできるか、
// 数量の負の数・「〇」「☆」の数量未入力の保存を、本体アプリと同じく受け付けないか。
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.env.MOCKUP_DIR || path.join(__dirname, '..', '..', 'reservation-dashboard-gas', 'mockup');
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const f of ['index.html', 'index-mobile.html']) {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto('file://' + path.join(DIR, f)); await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const withName = buildPersonalSummary(STATE.rows).find(b => b.staff && formatStaffName(b.staff) !== b.staff);
      if (!withName) return { skip: true };
      const name = formatStaffName(withName.staff);
      document.getElementById('personal-search').value = name; renderPersonalTab();
      const body = document.getElementById('personal-tbody') || document.getElementById('personal-list');
      const text = body ? body.innerText : '';
      // 「〇」で数量なしの保留中の変更を作って保存してみる
      const row = STATE.rows[0];
      STATE.pendingChanges = {}; const p = getOrCreatePendingAncillary(row.rowIndex, 'insurance'); p.status = '〇'; p.qty = null;
      saveAllPendingChanges();
      const blocked = Object.keys(STATE.pendingChanges).length === 1;
      STATE.pendingChanges = {};
      return { name, hit: text.indexOf(name) !== -1, blocked };
    });
    if (r.skip) { assert(false, f + '：氏名に変換される担当者がデータに無く試験できない'); continue; }
    assert(r.hit, f + '：個人別サマリーを担当者の氏名「' + r.name + '」で検索すると該当行が出る');
    assert(r.blocked, f + '：「〇」で数量が空欄の変更は保存されない');
    // 数量の入力欄に負の数を入れて確定 → 受け付けない
    const neg = await page.evaluate(() => {
      const el = document.querySelector('input.ancillary-qty:not([disabled])'); if (!el) return { none: true };
      const ri = Number(el.dataset.row); const row = STATE.rows.find(r => r.rowIndex === ri); const item = ANCILLARY_BY_QTY_KEY[el.dataset.col];
      const before = row[item.qtyKey]; el.value = '-3'; handleAncillaryQtyBlur(el);
      return { before, after: row[item.qtyKey] };
    });
    if (neg.none) console.log('NOTE: ' + f + '：入力できる数量欄が初期表示に無いため、負の数の確認は省略');
    else assert(neg.after === neg.before, f + '：数量に「-3」を入れても受け付けない（前=' + neg.before + ' 後=' + neg.after + '）');
    assert(errors.length === 0, f + '：画面のエラーなし ' + JSON.stringify(errors.slice(0, 2)));
    await page.close();
  }
  await browser.close();
  console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
})().catch(e => { console.error(e); process.exit(1); });
