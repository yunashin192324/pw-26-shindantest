// 実ブラウザ（Chromium）での動作確認。本物の HTML は監査対象にないため、スクリプトが参照する要素だけを持つ仮の HTML を使う。
const { chromium } = require('playwright');
const fs = require('fs');
const file = process.argv[2];
const ids = ['bg-start','bg-q1','bg-q2','bg-q3','bg-q4','bg-q5','bg-q6','bg-q7','bg-result'];
const html = `<!doctype html><meta charset="utf-8"><body>
${ids.map(i=>`<div class="bg-image" id="${i}"></div>`).join('')}
<div class="screen" id="screen-start"><button id="start-btn">start</button></div>
<div class="screen" id="screen-q"><span id="q-step"></span><span id="q-frac"></span><div id="q-bar"></div><span id="q-section"></span><h2 id="q-title"></h2><p id="q-sub"></p>
<div id="opts-single"></div><div id="opts-multi"></div><button id="next-btn">next</button><button id="back-btn">back</button></div>
<div class="screen" id="screen-loading"><div class="loading-slot"><div id="slot-inner"></div></div><div id="loading-final"></div></div>
<div class="screen" id="screen-result"><h2 id="res-name"></h2><p id="res-name-en"></p><div id="res-summary"></div><div id="res-matching"></div><div id="res-appeal"></div>
<div id="res-main-card"></div><div id="res-consult"></div><div id="res-upsell"></div><div class="alt-panel"><div id="res-alt"></div></div>
<button id="insta-copy-btn"></button><button id="share-x"></button><button id="share-line"></button><button id="share-copy"></button><button id="restart-btn">restart</button></div>
<div id="toast"></div>
${fs.readFileSync(file,'utf8')}</body>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.route('**/*', r => r.request().url().startsWith('http') ? r.abort() : r.continue()); // 外部画像は読み込まない（欠落時の挙動確認を兼ねる）
  await p.setContent(html);
  const flows = [
    ['overseas','verylong',['お城・宮殿'],['サンセット（黄金の光）'],'sightseeing','couple',3],
    ['domestic','short',['ビーチ・海'],['こだわりなし・おまかせ'],'resort','couple',1],
  ];
  for (const f of flows) {
    await p.click('#start-btn');
    const single = async (idx) => { await p.locator('#opts-single button').nth(idx).click(); await p.waitForTimeout(450); };
    await single(f[0]==='domestic'?0:1);
    await single(['short','medium','long','verylong','ultra'].indexOf(f[1]));
    for (const t of f[2]) await p.locator('#opts-multi button', { hasText: t }).click();
    await p.click('#next-btn');
    for (const t of f[3]) await p.locator('#opts-multi button', { hasText: t }).click();
    await p.click('#next-btn');
    await single(['resort','sightseeing','shopping','active'].indexOf(f[4]));
    await single(['couple','family_kids','family_elder','group'].indexOf(f[5]));
    const n = await p.locator('#opts-single button').count();
    if (n) await single(f[6]-1);
    await p.waitForFunction(() => document.getElementById('screen-result').style.display === 'block', null, { timeout: 30000 });
    console.log(f.join('/'), '=>', await p.textContent('#res-name'), '| alt:', (await p.locator('.alt-card-name').allTextContents()).join(','));
    await p.click('#restart-btn');
  }
  console.log('ブラウザのエラー:', errs.length ? errs : 'なし');
  await b.close();
})();
