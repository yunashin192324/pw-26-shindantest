// 画面の通し確認。外部サービスへの通信はすべてテスト用の架空データに差し替える（実際の公開サーバーには接続しない）。
// 実行: npm run e2e（Playwright と Chromium が必要）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fx = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/sample.json'), 'utf8'));
const shots = process.env.SHOTS_DIR || path.join(root, 'test-results');
fs.mkdirSync(shots, { recursive: true });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
const results = [];
async function check(name, fn) {
  try { await fn(); results.push(`ok   ${name}`); } catch (e) { failures++; results.push(`FAIL ${name}\n     ${String(e && e.stack || e).split('\n').slice(0, 3).join('\n     ')}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const browser = await playwright.chromium.launch();

async function newPage(routes) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  const calls = [];
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    const host = new URL(url).hostname;
    calls.push(host);
    const r = routes(url, host);
    if (!r) return route.abort('blockedbyclient');
    return route.fulfill({ status: r.status || 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(r.body || {}) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_BLOCKED/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, calls, errors };
}

const okRoutes = (url, host) => {
  if (url.includes('/api/interpreter')) return { body: fx.overpass };
  if (host === 'ja.wikipedia.org') return { body: fx.wikipedia };
  if (host === 'query.wikidata.org') return { body: fx.wikidata };
  if (host === 'nominatim.openstreetmap.org') return { body: fx.nominatim };
  return null; // 地図画像などは遮断（オフライン時の表示も確認できる）
};

// ---- 通常の流れ ----
{
  const { ctx, page, calls, errors } = await newPage(okRoutes);
  await page.goto(base);
  await check('最初の画面に使い方と「候補を探す」（セル未指定のため押せない）がある', async () => {
    assert(await page.isVisible('#intro'), '使い方が表示されない');
    assert(await page.isDisabled('#btn-search'), 'セル未指定なのに押せる');
    assert((await page.textContent('.steps li.now')).includes('セルを指定'), '手順表示');
  });
  await check('不正な入力には日本語で理由を表示する', async () => {
    await page.fill('#cell-input', 'あいうえお');
    await page.click('#cell-form button');
    assert((await page.textContent('#cell-msg')).includes('解釈できませんでした'), 'エラー文');
  });
  await check('セルIDを貼り付けるとセルが表示される', async () => {
    await page.fill('#cell-input', fx.cellToken);
    await page.click('#cell-form button');
    assert((await page.textContent('#cell-info')).includes(fx.cellToken), 'トークンが出ない');
    assert(await page.isEnabled('#btn-search'), '検索ボタンが押せない');
    assert(await page.isVisible('.leaflet-overlay-pane path'), 'セル境界が地図に描かれない');
  });
  await check('地図画像を取得できないときに案内を出す', async () => {
    await page.waitForSelector('#map-note:not([hidden])', { timeout: 5000 });
    assert((await page.textContent('#map-note')).includes('インターネット接続'), '案内文');
  });
  await page.screenshot({ path: path.join(shots, '1-cell.png') });
  await check('候補を探すと各段階が完了し、候補カードが表示される', async () => {
    await page.click('#btn-search');
    await page.waitForSelector('#sec-results:not([hidden]) .cand', { timeout: 10000 });
    const steps = await page.$$eval('#progress li', (els) => els.map((e) => e.className));
    assert(steps.every((c) => c === 'done'), '未完了の段階: ' + steps.join(','));
    assert((await page.textContent('#search-msg')).includes('見つかりました'), '完了メッセージ');
    const names = await page.$$eval('.cand h3', (els) => els.map((e) => e.textContent));
    assert(names.some((n) => n.includes('平和の像')), '像のカードがない: ' + names.join('/'));
    assert(!names.some((n) => n.includes('稲荷神社')), 'セル外の候補が優先一覧に出ている');
    assert((await page.textContent('#cell-info')).includes('架空市'), '地名');
    const hosts = calls.filter((h) => h !== 'tile.openstreetmap.org');
    assert(hosts.length === 4, '外部問い合わせ回数が想定外: ' + hosts.join(','));
  });
  await page.screenshot({ path: path.join(shots, '2-results.png'), fullPage: true });
  await check('絞り込みをワンタップで切り替えられる', async () => {
    await page.click('.chip[data-f="all"]');
    const names = await page.$$eval('.cand h3', (els) => els.map((e) => e.textContent));
    assert(names.some((n) => n.includes('稲荷神社')), '「すべて」にセル外が出ない');
    await page.click('.chip[data-f="concern"]');
    const c2 = await page.$$eval('.cand h3', (els) => els.map((e) => e.textContent));
    assert(c2.some((n) => n.includes('庭のオブジェ')) && !c2.some((n) => n.includes('平和の像')), '懸念の絞り込み');
    await page.click('.chip[data-f="priority"]');
  });
  await check('候補をタップすると詳細（評価の理由・情報源）が開き、戻れる', async () => {
    await page.click('.cand:has-text("平和の像") h3');
    await page.waitForSelector('#sheet:not([hidden])');
    const t = await page.textContent('#sheet-content');
    assert(t.includes('評価の理由') && t.includes('山田太郎') && t.includes('OpenStreetMap'), '詳細の内容');
    await page.screenshot({ path: path.join(shots, '3-detail.png') });
    await page.click('.sheet-head [data-close]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
  });
  await check('申請文を作ると、タイトル・説明文・補助文とチェック結果が出る', async () => {
    await page.click('.cand:has-text("平和の像") [data-assist]');
    await page.waitForSelector('#f-title');
    assert((await page.inputValue('#f-title')) === '平和の像', 'タイトル');
    const d = await page.inputValue('#f-description');
    assert(d.includes('山田太郎') && d.includes('1965'), '説明文: ' + d);
    assert((await page.inputValue('#f-support')).includes('探索'), '補助文');
    assert((await page.textContent('.steps li.now')).includes('申請文'), '手順表示が4にならない');
    assert((await page.textContent('#ready')).includes('まだ'), '未確認のまま準備完了になっている');
  });
  await page.screenshot({ path: path.join(shots, '4-assist.png'), fullPage: false });
  await check('タイトルだけ・まとめてコピーでき、コピーしたことを表示する', async () => {
    await page.click('[data-copy-field="title"]');
    await page.waitForSelector('#toast:not([hidden])');
    assert((await page.textContent('#toast')).includes('タイトルをコピーしました'), 'トースト');
    assert((await page.evaluate(() => navigator.clipboard.readText())) === '平和の像', 'クリップボード');
    await page.click('#btn-copy-all');
    const all = await page.evaluate(() => navigator.clipboard.readText());
    assert(all.includes('【説明文】') && all.includes('【補助文】'), '一括コピー');
  });
  await check('根拠のない表現を書くと警告が出る', async () => {
    await page.fill('#f-description', '地元で有名な銅像です。1890年に建てられました。');
    const t = await page.textContent('#issues');
    assert(t.includes('「有名」') && t.includes('1890年'), '警告: ' + t);
  });
  await check('編集と確認状況は自動保存され、再読み込み後も残る', async () => {
    await page.fill('#f-description', '平和の像は公園内の銅像です。編集テスト。');
    await page.click('[data-ck="exists"][data-v="ok"]');
    await page.waitForFunction(() => document.querySelector('#save-state').textContent.includes('保存済み'));
    await page.reload();
    await page.waitForSelector('.cand');
    await page.click('.cand:has-text("平和の像") [data-assist]');
    assert((await page.inputValue('#f-description')).includes('編集テスト'), '編集が消えた');
    assert(await page.isVisible('[data-ck="exists"][data-v="ok"].on'), '確認状況が消えた');
  });
  await check('元の文章に戻す・再生成ができる', async () => {
    page.once('dialog', (d) => d.accept());
    await page.click('#btn-revert');
    await page.waitForFunction(() => !document.querySelector('#f-description').value.includes('編集テスト'));
    const before = await page.inputValue('#f-description');
    await page.click('#btn-regen');
    await page.waitForFunction((b) => document.querySelector('#f-description').value !== b, before);
  });
  await check('CSVとバックアップ（JSON）を保存できる', async () => {
    let dl = page.waitForEvent('download');
    await page.click('#btn-export-cell');
    const csv = fs.readFileSync(await (await dl).path(), 'utf8');
    assert(csv.charCodeAt(0) === 0xfeff && csv.includes('平和の像') && csv.includes('タイトル'), 'CSV');
    await page.click('.sheet-head [data-close]');
    await page.click('#btn-menu');
    dl = page.waitForEvent('download');
    await page.click('#m-json');
    const json = JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'));
    assert(json.app === 'pokestop-finder' && json.projects[fx.cellToken], 'JSON');
    await page.click('.sheet-head [data-close]');
  });
  await check('既存スポットを登録すると候補に注意が付く', async () => {
    await page.click('.mode[data-mode="existing"]');
    await page.locator('#map').scrollIntoViewIfNeeded();
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('#ex-form', { timeout: 5000 });
    await page.click('#ex-form button[type=submit]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    await page.click('.chip[data-f="concern"]');
    const t = await page.textContent('#cards');
    assert(t.includes('平和の像') || t.includes('開園記念碑'), '注意が付かない: ' + t);
    await page.click('.chip[data-f="priority"]');
  });
  await check('同じセルの再取得は1分あける', async () => {
    await page.click('#btn-search');
    assert((await page.textContent('#search-msg')).includes('秒後'), '待機案内');
  });
  await check('地図をタップするとそこのセルに切り替わる', async () => {
    await page.click('.mode[data-mode="cell"]');
    await page.locator('#map').scrollIntoViewIfNeeded();
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width - 25, box.y + box.height * 0.6);
    const t = await page.textContent('#cell-info');
    assert(!t.includes(fx.cellToken), 'セルが変わらない');
  });
  await check('スマートフォン幅で横にはみ出さない', async () => {
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert(w[0] <= w[1], `横幅 ${w[0]} > ${w[1]}`);
  });
  await check('画面のスクリプトエラーがない', async () => assert(!errors.length, errors.join('\n')));
  await ctx.close();
}

// ---- 取得失敗 ----
{
  const { ctx, page, calls, errors } = await newPage((url, host) => {
    if (url.includes('/api/interpreter')) return { status: 429, body: {} };
    if (host === 'nominatim.openstreetmap.org') return { body: fx.nominatim };
    return null;
  });
  await page.goto(base);
  await page.fill('#cell-input', fx.cellToken);
  await page.click('#cell-form button');
  await page.click('#btn-search');
  await page.waitForFunction(() => !document.querySelector('#search-msg').hidden);
  await check('すべて失敗したときは「候補がない」と区別して表示し、利用制限では再試行しない', async () => {
    const t = await page.textContent('#search-msg');
    assert(t.includes('検索に失敗しました') && t.includes('候補がないという意味ではありません') && t.includes('利用制限'), t);
    assert(calls.filter((h) => /overpass/.test(h)).length === 1, '利用制限なのに別サーバーへ問い合わせた: ' + calls.join(','));
    assert(await page.isHidden('#sec-results'), '失敗なのに結果欄が出ている');
  });
  await page.screenshot({ path: path.join(shots, '5-failure.png') });
  await check('失敗時もスクリプトエラーがない', async () => assert(!errors.length, errors.join('\n')));
  await ctx.close();
}

// ---- 候補ゼロ ----
{
  const { ctx, page } = await newPage((url, host) => {
    if (url.includes('/api/interpreter')) return { body: { elements: [] } };
    if (host === 'ja.wikipedia.org') return { body: { query: { pages: [] } } };
    if (host === 'query.wikidata.org') return { body: { results: { bindings: [] } } };
    if (host === 'nominatim.openstreetmap.org') return { body: fx.nominatim };
    return null;
  });
  await page.goto(base);
  await page.fill('#cell-input', '35.0, 135.0');
  await page.click('#cell-form button');
  await page.click('#btn-search');
  await page.waitForFunction(() => !document.querySelector('#search-msg').hidden);
  await check('候補がないときは、未登録の可能性と手動追加を案内する', async () => {
    const t = await page.textContent('#search-msg');
    assert(t.includes('登録されていませんでした') && t.includes('候補を追加'), t);
  });
  await check('現地で見つけた候補を手動で追加し、申請文を作れる', async () => {
    await page.click('.mode[data-mode="add"]');
    await page.locator('#map').scrollIntoViewIfNeeded();
    const box = await page.locator('#map').boundingBox();
    // セルの中心付近（地図はセルに合わせて表示されている）
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('#add-form');
    await page.fill('#add-form [name=name]', '手動追加の記念碑');
    await page.selectOption('#add-form [name=cat]', 'memorial');
    await page.fill('#add-form [name=memo]', '石に地域の歴史が刻まれている');
    await page.click('#add-form button[type=submit]');
    await page.waitForSelector('.cand:has-text("手動追加の記念碑")');
    await page.click('.cand:has-text("手動追加の記念碑") [data-assist]');
    assert((await page.inputValue('#f-title')) === '手動追加の記念碑', 'タイトル');
    assert((await page.inputValue('#f-support')).includes('現地で確認'), '補助文');
  });
  await ctx.close();
}

// ---- 広い画面 ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  const page = await ctx.newPage();
  await page.goto(base);
  await page.fill('#cell-input', fx.cellToken);
  await page.click('#cell-form button');
  await page.screenshot({ path: path.join(shots, '6-desktop.png') });
  await ctx.close();
}

await browser.close();
server.close();
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed. スクリーンショット: ${shots}`);
process.exit(failures ? 1 : 0);
