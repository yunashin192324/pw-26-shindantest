// 2つの版で、候補の順位・一致率・予算の選択可否・表示される選択肢がすべて同じかを比べる
// 使い方: node compare.js <版A> <版B> [件数]
const { load } = require('./harness'); const D = require('./driver');
const A = load(process.argv[2]), B = load(process.argv[3]); const N = +(process.argv[4] || 200000);
const { QS } = A; const SC = QS[2].opts.map(o => o.v), MO = QS[3].opts.map(o => o.v).filter(v => v !== 'none');
let seed = 5; const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; const p = a => a[Math.floor(r() * a.length)];
let diff = 0, n = 0;
for (let i = 0; i < N; i++) {
  const scene = SC.filter(() => r() < 0.25); if (!scene.length) scene.push(p(SC));
  let moment = MO.filter(() => r() < 0.2); if (!moment.length) moment = ['none'];
  const a = { region: p(['domestic', 'overseas']), days: p(['short', 'medium', 'long', 'verylong', 'ultra']), scene, moment, style: p(['resort', 'sightseeing', 'shopping', 'active']), who: p(['couple', 'family_kids', 'family_elder', 'group']), budget: 1 + Math.floor(r() * 6) };
  const x = A.score(a), y = B.score(a); n++;
  const sx = JSON.stringify(x.map(k => [k, A.calcMatching(k, a).rate])), sy = JSON.stringify(y.map(k => [k, B.calcMatching(k, a).rate]));
  if (sx !== sy) { diff++; if (diff <= 3) console.log('差', JSON.stringify(a), sx, sy); }
}
let uiDiff = 0, ui = 0;
for (const region of ['domestic', 'overseas']) for (const days of ['short', 'medium', 'long', 'verylong', 'ultra']) for (const s of SC) {
  ui++;
  const va = JSON.stringify([D.visibleValues(A, region, days, 'scene'), D.visibleValues(A, region, days, 'moment', { scene: [s] })]);
  const vb = JSON.stringify([D.visibleValues(B, region, days, 'scene'), D.visibleValues(B, region, days, 'moment', { scene: [s] })]);
  const ba = (A.answers = { region, days, scene: [s], moment: ['none'], style: 'resort', who: 'couple' }, A.curQIdx = 6, A.renderQ(), A.els['opts-single'].children.map(b => b.disabled).join());
  const bb = (B.answers = { region, days, scene: [s], moment: ['none'], style: 'resort', who: 'couple' }, B.curQIdx = 6, B.renderQ(), B.els['opts-single'].children.map(b => b.disabled).join());
  A.advance(1000); B.advance(1000);
  if (va !== vb || ba !== bb) uiDiff++;
}
console.log(`無作為抽出 ${n} 件で順位・一致率が異なる: ${diff} 件 / 選択肢・予算の表示 ${ui} 通りで異なる: ${uiDiff} 通り`);
