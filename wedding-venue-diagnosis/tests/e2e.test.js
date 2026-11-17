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
const title = page => page.textContent('#q-title');
const optTexts = page => page.locator('#opts-single .opt-main, #opts-multi .opt-multi-text').allTextContents();
async function single(page, text) {
  await page.locator('#opts-single .opt', { hasText: text }).first().click();
  await page.waitForTimeout(450);
}
async function multi(page, texts) {
  for (const t of texts) {
    const l = page.locator('#opts-multi .opt-multi', { hasText: t }).first();
    if (!(await l.getAttribute('class')).includes('selected')) await l.click();
  }
  await page.click('#next-btn'); await page.waitForTimeout(150);
}
async function back(page) { await page.click('#back-btn'); await page.waitForTimeout(200); }
async function waitResult(page) { await page.waitForSelector('#screen-result.active', { timeout: 15000 }); await page.waitForTimeout(900); }
async function noOverflow(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  assert.ok(r.sw <= r.w, label + ': 横スクロールが発生 (' + r.sw + ' > ' + r.w + ')');
}
const answers = page => page.evaluate(() => window.VENUE_DIAG.app.getAnswers());
const expected = (page, ans) => page.evaluate(a => {
  const NS = window.VENUE_DIAG;
  return NS.logic.diagnose(NS.app.model, NS.QUESTIONS, a).recommended.map(r => r.venue.name);
}, ans);

for (const file of TARGETS) {
  const tag = path.basename(file);

  for (const vp of ['mobile', 'desktop', 'tablet']) {
    test(`[${tag}/${vp}] ハワイを選んで最後まで回答でき、データ通りの結果が出る`, async () => {
      const { ctx, page, problems } = await open(file, vp);
      const shot = n => file.endsWith('index.html') ? page.screenshot({ path: path.join(SHOTS, `${vp}-${n}.png`), fullPage: n === '5-result' }) : null;
      await page.waitForTimeout(1200);
      assert.match(await page.textContent('#pill-count'), /51式場/);
      await noOverflow(page, 'start'); await shot('1-start');
      await page.click('#start-btn');
      assert.match(await title(page), /国・地域/);
      assert.equal((await optTexts(page)).length, 10);
      assert.equal((await optTexts(page))[0], 'まだ決めていない');
      await noOverflow(page, 'region'); await shot('2-question-region');
      await single(page, 'ハワイ');
      await single(page, 'いいえ、大人のみです');
      assert.match(await title(page), /挙式のスタイル/);
      await single(page, '海の見えるチャペル（白系）');
      assert.match(await title(page), /海はどのように/);
      await single(page, '目の前がビーチ');
      await single(page, '滞在するホテルの中で挙式したい');
      // 複数選択：未選択では次へ不可。候補に無い選択肢（キャラクター等）は出ない
      assert.equal(await page.isDisabled('#next-btn'), true);
      assert.ok(!(await optTexts(page)).some(t => t.includes('キャラクター')));
      await noOverflow(page, 'focus'); await shot('3-question-multi');
      await multi(page, ['料理のおいしさ']);
      assert.match(await title(page), /いちばん重視/);
      await single(page, 'どれも同じくらい大切');
      assert.equal(await active(page), 'screen-loading'); await shot('4-loading');
      await waitResult(page);
      const ans = await answers(page);
      assert.equal(await page.textContent('#res-name'), (await expected(page, ans))[0]);
      assert.equal(await page.textContent('#res-name'), 'コオリナ・チャペル・プレイス・オブ・ジョイ');
      assert.match(await page.textContent('#res-badges'), /ハワイ（オアフ島）/);
      assert.equal(await page.locator('.cond-table tbody tr').count(), 6);
      assert.match(await page.locator('.venue-card-meta').textContent(), /ハワイ・オアフ島.*基本挙式料金 408,000円〜（目安）/);
      const alts = await page.locator('.alt-card .alt-name').allTextContents();
      assert.deepEqual(alts, (await expected(page, ans)).slice(1, 5));
      await noOverflow(page, 'result'); await shot('5-result');
      await page.click('.venue-card [data-detail]');
      assert.equal(await page.locator('#modal.open .cat-item').count(), 19);
      assert.ok((await page.locator('#modal.open .tags .tag').allTextContents()).includes('内観：白系'));
      await noOverflow(page, 'modal'); await shot('6-detail');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#modal.open').count(), 0);
      assert.equal(await page.locator('img').count(), 0);
      const hrefs = await page.$$eval('a[href]', as => as.filter(a => a.offsetParent !== null).map(a => a.getAttribute('href')));
      hrefs.forEach(h => assert.match(h, /^https:\/\/www\.his-wedding\.com\//));
      const small = await page.$$eval('button', bs => bs.filter(b => b.offsetParent !== null && b.getBoundingClientRect().height < 44).map(b => b.textContent.trim()));
      assert.deepEqual(small, []);
      assert.deepEqual(problems, []);
      await ctx.close();
    });
  }

  test(`[${tag}] 戻っても回答が保持され、地域を変えると質問と結果が切り替わる`, async () => {
    const { ctx, page, problems } = await open(file, 'mobile');
    await page.click('#start-btn');
    await single(page, 'ハワイ');
    await single(page, 'いいえ、大人のみです');
    await single(page, '海の見えるチャペル（白系）');
    await back(page);
    assert.match(await page.locator('#opts-single .opt.selected').textContent(), /白系/);
    await back(page); await back(page);
    assert.match(await page.locator('#opts-single .opt.selected').textContent(), /ハワイ/);
    await single(page, '沖縄');
    // 沖縄は全式場が「子供と一緒」なので、お子さまの質問は出ない
    assert.match(await title(page), /沖縄の旅/);
    assert.equal((await answers(page)).hawaiiStyle, undefined);   // ハワイの回答は消える
    await single(page, 'ゲストが多い');
    await single(page, 'リゾートらしい恩納村・読谷');
    await single(page, '海の見えるチャペル（白系）');
    // 「ホテルの中」と「独立した式場」は同時に選べない
    await page.locator('.opt-multi', { hasText: '滞在するホテルの中' }).click();
    await page.locator('.opt-multi', { hasText: 'ホテルから独立した' }).click();
    assert.deepEqual(await page.locator('.opt-multi.selected .opt-multi-text').allTextContents(), ['ホテルから独立した式場']);
    await page.locator('.opt-multi', { hasText: 'ホテルから独立した' }).click();
    await multi(page, ['ビーチが目の前の式場']);
    await multi(page, ['料理のおいしさ']);
    await single(page, 'リゾートらしい恩納村・読谷');
    await waitResult(page);
    assert.equal(await page.textContent('#res-name'), 'ザ・ヨミタンリゾート アクアグレイス・チャペル');
    assert.equal(await page.textContent('#res-name'), (await expected(page, await answers(page)))[0]);
    assert.match(await page.textContent('#res-badges'), /最重視の条件に該当/);
    // もう一度診断する
    await page.click('#restart-btn'); await page.waitForTimeout(300);
    assert.equal(await active(page), 'screen-start');
    assert.deepEqual(await answers(page), {});
    await page.click('#start-btn');
    assert.equal(await page.locator('#opts-single .opt.selected').count(), 0);
    assert.deepEqual(problems, []);
    await ctx.close();
  });

  test(`[${tag}] 地域が未定・式場が1件の地域・やり直しの各ケース`, async () => {
    const { ctx, page, problems } = await open(file, 'desktop');
    await page.click('#start-btn');
    await single(page, 'まだ決めていない');
    await single(page, 'はい、子どもも参列します');
    await single(page, '3〜5日');
    assert.deepEqual(await optTexts(page), ['グアム', '沖縄', '北海道']);   // お子さま連れのおすすめ順
    await single(page, 'グアム');
    await single(page, 'ガーデン');
    await waitResult(page);                                                   // 候補が1件になったので質問終了
    assert.equal(await page.textContent('#res-name'), 'クラウンプラザガーデン');
    assert.match(await page.textContent('#res-notice'), /1つでも該当する式場は.*1件/);
    // モルディブ：質問1つで結果。条件の一致表は出さない
    await page.click('#review-btn'); await page.waitForTimeout(200);
    await single(page, 'モルディブ');
    await waitResult(page);
    assert.equal(await page.textContent('#res-name'), 'フォーシーズンズ ランダギラーバル ウェディング');
    assert.equal(await page.locator('.cond-table').count(), 0);
    assert.match(await page.textContent('#res-notice'), /人気の高い順/);
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
