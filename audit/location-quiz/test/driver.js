// 疑似 DOM 上で、利用者と同じ操作（クリック）で質問に回答する補助関数。
'use strict';
const { load } = require('./harness');

function cur(api) { return api.QS[api.qFlow[api.curQIdx]]; }

function singleButtons(api) { return api.els['opts-single'].children; }
function multiButtons(api) { return api.els['opts-multi'].children; }

function clickSingle(api, v) {
  const q = cur(api);
  const i = q.opts.findIndex(o => o.v === v);
  if (i < 0) throw new Error('no opt ' + v + ' in ' + q.id);
  const b = singleButtons(api)[i];
  if (!b) throw new Error('button missing ' + v);
  b.click();
}

function clickMulti(api, vals) {
  const q = cur(api);
  for (const v of vals) {
    const b = multiButtons(api).find(x => x.innerHTML.includes('>' + q.opts.find(o => o.v === v).text + '<'));
    if (!b) throw new Error('multi option hidden: ' + v);
    b.click();
  }
  api.els['next-btn'].click();
}

// ans: {region, days, scene:[], moment:[], style, who, budget}
// 戻り値: 結果画面の情報
function run(file, ans, opts) {
  const api = load(file, opts);
  api.els['start-btn'].click();
  const log = { budgetState: null, autoBudget: false };
  for (let guard = 0; guard < 20; guard++) {
    if (api.els['screen-loading'].style.display === 'block' || api.els['screen-result'].style.display === 'block') break;
    const q = cur(api);
    if (q.type === 'multi') { clickMulti(api, ans[q.id]); continue; }
    if (q.id === 'budget') {
      const btns = singleButtons(api);
      if (!btns.length) { log.autoBudget = true; api.advance(100); continue; }
      log.budgetState = q.opts.map((o, i) => ({ v: o.v, disabled: !!btns[i].disabled, text: btns[i].innerHTML }));
      if (log.budgetState.find(b => b.v === ans.budget).disabled) { log.budgetBlocked = true; return { api, log, result: { name: '(予算選択不可)', altNames: [], altRates: [] } }; }
    }
    clickSingle(api, ans[q.id]);
    api.advance(400);
  }
  api.advance(60000);
  return { api, log, result: readResult(api) };
}

function readResult(api) {
  const e = api.els;
  const alt = e['res-alt'].innerHTML;
  const altNames = [...alt.matchAll(/<p class="alt-card-name">([^<]*)<\/p>/g)].map(m => m[1]);
  const altRates = [...alt.matchAll(/<span class="alt-match-pct">(\d+)%<\/span>/g)].map(m => +m[1]);
  const rate = /class="matching-rate">(\d+)%/.exec(e['res-matching'].innerHTML);
  return {
    name: e['res-name'].textContent,
    rate: rate ? +rate[1] : null,
    matchingHtml: e['res-matching'].innerHTML,
    altNames, altRates,
    upsell: e['res-upsell'].innerHTML.replace(/<[^>]+>/g, '').trim(),
    nameFont: e['res-name'].style.fontSize || '',
  };
}

module.exports = { load, run, cur, clickSingle, clickMulti, singleButtons, multiButtons, readResult };
