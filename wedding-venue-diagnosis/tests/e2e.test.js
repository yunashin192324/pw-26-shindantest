/* ブラウザでの動作検証（Playwright / Chromium）。
   実行: NODE_PATH=$(npm root -g) node --test tests/e2e.test.js
   対象: index.html（file:// で開く＝オフライン状態）と、1ファイル版モックアップ（存在する場合） */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TARGETS = [path.join(ROOT, 'index.html')];
const MOCK = path.join(ROOT, 'dist', 'wedding-venue-diagnosis-mockup.html');
if (fs.existsSync(MOCK)) TARGETS.push(MOCK);
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = {
  mobile: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 800 } },
  tablet: { viewport: { width: 820, height: 1180 }, hasTouch: true }
};

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

async function open(file, vp) {
  const ctx = await browser.newContext(VIEWPORTS[vp]);
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', r => problems.push('requestfailed: ' + r.url()));
  page.on('request', r => { if (!r.url().startsWith('file://')) problems.push('外部通信: ' + r.url()); });
  await page.goto('file://' + file);
  return { ctx, page, problems };
}

const active = page => page.locator('.screen.active').getAttribute('id');
async function single(page, text) {
  await page.locator('#opts-single .opt', { hasText: text }).first().click();
  await page.waitForTimeout(450);
}
async function multi(page, texts) {
  for (const t of texts) await page.locator('#opts-multi .opt-multi', { hasText: t }).first().click();
}
async function next(page) { await page.click('#next-btn'); await page.waitForTimeout(150); }
async function waitResult(page) { await page.waitForSelector('#screen-result.active', { timeout: 15000 }); await page.waitForTimeout(900); }
async function noOverflow(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  assert.ok(r.sw <= r.w, label + ': 横スクロールが発生 (' + r.sw + ' > ' + r.w + ')');
}
const frac = page => page.textContent('#q-frac');
const expected = (page, ans) => page.evaluate(a => {
  const NS = window.VENUE_DIAG;
  return NS.logic.diagnose(NS.DATA, NS.QUESTIONS, a).recommended.map(r => r.venue.name);
}, ans);

for (const file of TARGETS) {
  const tag = path.basename(file);

  for (const vp of ['mobile', 'desktop', 'tablet']) {
    test(`[${tag}/${vp}] 最初から最後まで回答でき、Excelデータ通りの結果が出る`, async () => {
      const { ctx, page, problems } = await open(file, vp);
      const shot = n => file.endsWith('index.html') ? page.screenshot({ path: path.join(SHOTS, `${vp}-${n}.png`), fullPage: n === '5-result' }) : null;
      await page.waitForTimeout(1200);
      assert.match(await page.textContent('#pill-count'), /51式場/);
      await noOverflow(page, 'start'); await shot('1-start');
      await page.click('#start-btn');
      assert.equal(await active(page), 'screen-q');
      assert.equal(await frac(page), '1 / 6');
      await single(page, 'はい、子どもも参列します');
      assert.equal(await frac(page), '2 / 6');
      await single(page, '時差のない場所がいい');
      // 複数選択：未選択では次へ不可
      assert.equal(await page.isDisabled('#next-btn'), true);
      await multi(page, ['ビーチが目の前の式場']);
      assert.equal(await page.isDisabled('#next-btn'), false);
      // 重視条件の質問が追加され、全7問になる
      assert.equal(await frac(page), '3 / 7');
      await noOverflow(page, 'q3'); await shot('2-question-multi');
      await next(page);
      await multi(page, ['海の見えるチャペル']);
      await next(page);
      await multi(page, ['挙式の後、同じ場所でパーティをしたい']);
      await next(page);
      await multi(page, ['費用を抑えたい']);
      await next(page);
      assert.match(await page.textContent('#q-title'), /いちばん重視/);
      assert.equal(await page.locator('#opts-single .opt').count(), 7); // 6条件＋「どれも同じくらい大切」
      await noOverflow(page, 'priority'); await shot('3-question-priority');
      await single(page, 'ビーチが目の前の式場');
      assert.equal(await active(page), 'screen-loading'); await shot('4-loading');
      await waitResult(page);
      assert.equal(await page.textContent('#res-name'), 'ザ・サーフ ビーチサイドテラス');
      assert.equal(await page.locator('.cond-table tbody tr').count(), 6);
      assert.equal(await page.locator('.alt-card').count(), 4);
      const alts = await page.locator('.alt-card .alt-name').allTextContents();
      const exp = await expected(page, { kids: 'yes', access: 'nojetlag', scenery: ['beach'], space: ['seaview'], stay: ['party'], focus: ['cost'], priority: 'ビーチが目の前' });
      assert.deepEqual(alts, exp.slice(1, 5));
      assert.match(await page.textContent('#res-notice'), /同じ評価の式場が2件/);
      assert.match(await page.textContent('.reason'), /最も重視された「ビーチが目の前」に該当/);
      await noOverflow(page, 'result'); await shot('5-result');
      // 式場の詳細（全19カテゴリ）
      await page.click('.venue-card [data-detail]');
      assert.equal(await page.locator('#modal.open .cat-item').count(), 19);
      assert.equal(await page.locator('#modal.open .cat-item.on').count(), 11);
      await noOverflow(page, 'modal'); await shot('6-detail');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#modal.open').count(), 0);
      // 画像・リンクの確認：画像は未設定、リンクは設定済みのURLのみ
      assert.equal(await page.locator('img').count(), 0);
      const hrefs = await page.$$eval('a[href]', as => as.filter(a => a.offsetParent !== null).map(a => a.getAttribute('href')));
      hrefs.forEach(h => assert.match(h, /^https:\/\/www\.his-wedding\.com\//));
      // タップしやすさ：主要ボタンは高さ44px以上
      const small = await page.$$eval('button', bs => bs.filter(b => b.offsetParent !== null && b.getBoundingClientRect().height < 44).map(b => b.textContent.trim()));
      assert.deepEqual(small, []);
      assert.deepEqual(problems, []);
      await ctx.close();
    });
  }

  test(`[${tag}] 戻っても回答が保持され、回答の変更が結果に反映される`, async () => {
    const { ctx, page, problems } = await open(file, 'mobile');
    await page.click('#start-btn');
    await single(page, 'いいえ、大人のみです');
    await single(page, '移動時間や時差は気にしない');
    await multi(page, ['緑あふれるガーデン', '豊かな自然に囲まれた場所']);
    await next(page);
    await multi(page, ['歴史ある教会・大聖堂']);
    await next(page);
    // Q5 → 戻る → Q4・Q3 の選択が残っている
    await page.click('#back-btn'); await page.waitForTimeout(200);
    assert.deepEqual(await page.locator('#opts-multi .opt-multi.selected').allTextContents(), ['歴史ある教会・大聖堂']);
    await page.click('#back-btn'); await page.waitForTimeout(200);
    assert.deepEqual(await page.locator('#opts-multi .opt-multi.selected').allTextContents(), ['緑あふれるガーデン', '豊かな自然に囲まれた場所']);
    // 単一選択も保持
    await page.click('#back-btn'); await page.waitForTimeout(200);
    assert.match(await page.locator('#opts-single .opt.selected').textContent(), /気にしない/);
    assert.equal(await page.isVisible('#next-btn'), true);
    await page.click('#next-btn'); await page.waitForTimeout(200);
    // 「こだわらない」は他と同時に選べない
    await multi(page, ['特にこだわらない']);
    assert.deepEqual(await page.locator('#opts-multi .opt-multi.selected').allTextContents(), ['特にこだわらない']);
    await multi(page, ['緑あふれるガーデン', '豊かな自然に囲まれた場所']);
    assert.deepEqual(await page.locator('#opts-multi .opt-multi.selected').allTextContents(), ['緑あふれるガーデン', '豊かな自然に囲まれた場所']);
    await next(page); await next(page);
    await multi(page, ['ヴィラ・水上ヴィラに泊まりたい']); await next(page);
    await multi(page, ['ドレス・衣裳にこだわりたい']); await next(page);
    await single(page, 'どれも同じくらい大切');
    await waitResult(page);
    const first = await page.textContent('#res-name');
    const ansB = { kids: 'no', access: 'any', scenery: ['garden', 'nature'], space: ['church'], stay: ['villa'], focus: ['dress'], priority: 'none' };
    assert.equal(first, (await expected(page, ansB))[0]);
    assert.equal(first, 'ウブドフォレスト アット フォーシーズンズ サヤン');
    // 回答を見直す → 最重視を「教会・大聖堂」に変更
    await page.click('#review-btn'); await page.waitForTimeout(300);
    assert.match(await page.locator('#opts-single .opt.selected').textContent(), /大人のみ/);
    for (let i = 0; i < 6; i++) await next(page);
    assert.match(await page.textContent('#q-title'), /いちばん重視/);
    assert.match(await page.locator('#opts-single .opt.selected').textContent(), /どれも同じくらい大切/);
    await single(page, '歴史ある教会・大聖堂');
    await waitResult(page);
    assert.equal(await page.textContent('#res-name'), 'チャペル・バイ・ザ・レイク');
    assert.equal(await page.textContent('#res-name'), (await expected(page, Object.assign({}, ansB, { priority: '教会・大聖堂' })))[0]);
    // 最初からやり直す
    await page.click('#restart-btn'); await page.waitForTimeout(300);
    assert.equal(await active(page), 'screen-start');
    assert.deepEqual(await page.evaluate(() => window.VENUE_DIAG.app.getAnswers()), {});
    await page.click('#start-btn');
    assert.equal(await page.locator('#opts-single .opt.selected').count(), 0);
    assert.deepEqual(problems, []);
    await ctx.close();
  });

  test(`[${tag}] 条件なし・候補が少ない・条件1つ（重視質問の省略）の各ケース`, async () => {
    const { ctx, page, problems } = await open(file, 'desktop');
    // 条件なし
    await page.click('#start-btn');
    await single(page, 'いいえ、大人のみです'); await single(page, '移動時間や時差は気にしない');
    for (let i = 0; i < 4; i++) { await multi(page, ['特にこだわらない']); await next(page); }
    await waitResult(page);
    assert.equal(await page.textContent('#res-name'), '希望条件が選ばれていません');
    assert.equal(await page.isVisible('#share-row'), false);
    assert.equal(await page.locator('.cond-table').count(), 0);
    // 世界遺産のみ（条件1つ → 重視の質問は表示されない、候補2件）
    await page.click('#review-btn'); await page.waitForTimeout(200);
    assert.equal(await frac(page), '1 / 6');
    await next(page); await next(page);
    await multi(page, ['世界遺産のある場所']);
    assert.equal(await frac(page), '3 / 6');
    for (let i = 0; i < 4; i++) await next(page);
    await waitResult(page);
    assert.equal(await page.textContent('#res-name'), 'ヒルトン ブルーホライズン');
    assert.equal(await page.locator('.alt-card').count(), 1);
    assert.match(await page.textContent('#res-notice'), /1つでも該当する式場は2件/);
    assert.match(await page.locator('.alt-card .alt-rank').textContent(), /同率 No\.1/);
    // 「最初からやり直す」（2回押しで確定）
    await page.click('#review-btn'); await page.waitForTimeout(200);
    await page.click('#reset-btn');
    assert.equal(await active(page), 'screen-q');
    await page.click('#reset-btn'); await page.waitForTimeout(200);
    assert.equal(await active(page), 'screen-start');
    assert.deepEqual(problems, []);
    await ctx.close();
  });
}
