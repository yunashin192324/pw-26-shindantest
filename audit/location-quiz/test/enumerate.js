// 全入力組み合わせの総当たり検証。
// 使い方: node enumerate.js <対象ファイル> [出力JSON]
// 画面上で選べない組み合わせ（国内で非表示の選択肢、「こだわりなし」と他の同時選択）は除外する。
'use strict';
const fs = require('fs');
const { load } = require('./harness');

const file = process.argv[2] || '../original.txt';
const out = process.argv[3];
const api = load(file);
const { QS, DEST } = api;

const SCENES = QS[2].opts.map(o => o.v);
const MOMENTS = QS[3].opts.map(o => o.v).filter(v => v !== 'none');
const DAYS = QS[1].opts.map(o => o.v);
const STYLES = QS[4].opts.map(o => o.v);
const WHOS = QS[5].opts.map(o => o.v);
const HIDDEN = { domestic: { scene: (process.argv[4] === 'fixed' ? ['landscape'] : []).concat(['castle', 'architecture', 'villa']), moment: ['balloon', 'animal'] } };
const HARD = ['starry', 'balloon', 'animal'];

function subsets(arr) {
  const r = [];
  for (let m = 1; m < (1 << arr.length); m++) r.push(arr.filter((_, i) => m & (1 << i)));
  return r;
}

// 予算質問を実際に描画して、選択可能な予算を読み取る
function budgetUi(base) {
  api.answers = Object.assign({}, base);
  api.curQIdx = 6;
  api.renderQ('right');
  const btns = api.els['opts-single'].children;
  if (!btns.length) { // 1件だけ有効 → 自動選択
    const v = api.answers.budget;
    api.advance(1000);
    return { auto: v, enabled: [v] };
  }
  const enabled = QS[6].opts.filter((o, i) => !btns[i].disabled).map(o => o.v);
  return { auto: null, enabled };
}

const stats = {
  combos: 0, uiPaths: 0,
  noResult: 0, noResultButSelectable: 0, // 選択可能な予算で結果なし
  noResultDueToMaxScore: 0,               // 候補はあるのに最高点<=0で「見つかりません」
  regionLeak: 0,
  topMissingHard: 0,     // 必須演出（星空・気球・動物）を第1候補が満たさない
  topNoScene: 0,         // 選んだ景色を1つも満たさない第1候補
  altBeatsTop: 0,        // 代替候補の一致率が第1候補より高い
  allBudgetsDisabledReleased: 0,
  autoBudget: 0,
  budgetDisabledButHasResult: 0, // 選択不可にした予算でも実際は結果が出る
  shown: 0,
  rateHist: {},
};
const examples = {};
function ex(k, v) { (examples[k] = examples[k] || []).length < 8 && examples[k].push(v); }

const { visibleValues } = require('./driver');
for (const region of ['domestic', 'overseas']) for (const days of DAYS) {
  // 選択肢は、対象ファイルの画面描画で実際に表示されるものだけを使う
  const sceneSets = subsets(visibleValues(api, region, days, 'scene'));
  for (const scene of sceneSets) {
  // 演出の選択肢は、先に選んだ景色によって変わる
  const momentSets = [['none']].concat(subsets(visibleValues(api, region, days, 'moment', { scene }).filter(v => v !== 'none')));
  for (const moment of momentSets) {
    const base = { region, days, scene, moment, style: 'resort', who: 'couple' };
    const ui = budgetUi(base);
    const allDisabledReleased = !ui.auto && ui.enabled.length === 6 && (() => {
      // 全部有効なのが「解除」によるものか確認: 各予算の結果が全部空か
      return [1, 2, 3, 4, 5, 6].every(b => api.score(Object.assign({}, base, { budget: b })).length === 0);
    })();
    if (allDisabledReleased) { stats.allBudgetsDisabledReleased++; }
    if (ui.auto) stats.autoBudget++;
    for (let b = 1; b <= 6; b++) {
      if (ui.enabled.includes(b)) continue;
      const r = api.score(Object.assign({}, base, { budget: b }));
      if (r.length) { stats.budgetDisabledButHasResult++; ex('budgetDisabledButHasResult', { region, days, scene, moment, budget: b, top: r[0] }); }
    }
    for (const budget of ui.enabled) for (const style of STYLES) for (const who of WHOS) {
      stats.combos++;
      const ans = { region, days, scene, moment, style, who, budget };
      const ranked = api.score(ans);
      const max = api.window._lastMaxScore;
      // 修正前の renderResult() は最高点が0以下だと「見つかりません」を表示する。修正版はこの条件を削除した
      const shown = ranked.length && DEST[ranked[0]] && (process.argv[4] === 'fixed' || !(max <= 0));
      if (!shown) {
        stats.noResult++;
        if (!allDisabledReleased) { stats.noResultButSelectable++; ex('noResultButSelectable', ans); }
        if (ranked.length) { stats.noResultDueToMaxScore++; ex('noResultDueToMaxScore', Object.assign({ top: ranked[0], max }, ans)); }
        continue;
      }
      stats.shown++;
      for (const k of ranked) if (!!DEST[k].domestic !== (region === 'domestic')) { stats.regionLeak++; ex('regionLeak', ans); break; }
      const mt = api.calcMatching(ranked[0], ans);
      stats.rateHist[mt.rate] = (stats.rateHist[mt.rate] || 0) + 1;
      const wantHard = moment.filter(m => HARD.includes(m));
      const LBL = { starry: '星空', balloon: '気球・バルーン', animal: '動物との撮影' };
      if (wantHard.length && wantHard.some(h => mt.unmatched.some(u => u.label === LBL[h]))) { stats.topMissingHard++; ex('topMissingHard', Object.assign({ top: ranked[0] }, ans)); }
      if (!mt.matched.some(c => c.type === 'scene')) { stats.topNoScene++; ex('topNoScene', Object.assign({ top: ranked[0] }, ans)); }
      // 優先順位の検証
      const hardN = k => { const m = api.calcMatching(k, { moment: wantHard }); return m.matched.length; };
      const sceneHit = k => api.calcMatching(k, { scene }).matched.length > 0 ? 1 : 0;
      const th = hardN(ranked[0]), ts = sceneHit(ranked[0]);
      // 並べ方の決まり: ①景色を1つ以上満たす ②必須演出を多く満たす
      if (ranked.some(k => sceneHit(k) > ts)) { stats.betterSceneBelow = (stats.betterSceneBelow || 0) + 1; ex('betterSceneBelow', Object.assign({ top: ranked[0] }, ans)); }
      if (ranked.some(k => sceneHit(k) === ts && hardN(k) > th)) { stats.betterHardBelow = (stats.betterHardBelow || 0) + 1; ex('betterHardBelow', Object.assign({ top: ranked[0] }, ans)); }
      if (th === 0 && wantHard.length) { stats.topNoHardAtAll = (stats.topNoHardAtAll || 0) + 1; }
      for (let i = 1; i < Math.min(ranked.length, 5); i++) {
        if (api.calcMatching(ranked[i], ans).rate > mt.rate) { stats.altBeatsTop++; ex('altBeatsTop', Object.assign({ top: ranked[0], alt: ranked[i] }, ans)); break; }
      }
    }
    stats.uiPaths++;
  }
  }
}
const res = { file, stats, examples };
const txt = JSON.stringify(res, null, 1);
if (out) fs.writeFileSync(out, txt);
console.log(JSON.stringify(stats, null, 1));
