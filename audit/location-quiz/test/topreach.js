// どの撮影地が1位になりうるかを調べる（画面で選べる回答の中から無作為に抽出）
const { load } = require('./harness'); const D = require('./driver');
const A = load(process.argv[2] || '../fixed.txt'); const N = +(process.argv[3] || 200000);
let seed = 77; const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; const p = a => a[Math.floor(r() * a.length)];
const VS = {}, VM = {}; const top = {}; Object.keys(A.DEST).forEach(k => top[k] = 0);
for (let i = 0; i < N; i++) {
  const region = p(['domestic', 'overseas']), days = p(['short', 'medium', 'long', 'verylong', 'ultra']);
  const vs = VS[region + days] || (VS[region + days] = D.visibleValues(A, region, days, 'scene'));
  let scene = vs.filter(() => r() < 0.3); if (!scene.length) scene = [p(vs)];
  const key = region + days + scene.join();
  const vm = (VM[key] || (VM[key] = D.visibleValues(A, region, days, 'moment', { scene }))).filter(v => v !== 'none');
  let moment = vm.filter(() => r() < 0.25); if (!moment.length) moment = ['none'];
  const ans = { region, days, scene, moment, style: p(['resort', 'sightseeing', 'shopping', 'active']), who: p(['couple', 'family_kids', 'family_elder', 'group']), budget: 1 + Math.floor(r() * 6) };
  const R = A.score(ans); if (R.length) top[R[0]]++;
}
const rows = Object.keys(top).sort((a, b) => top[b] - top[a]).map(k => A.DEST[k].name + ' ' + top[k]);
console.log(rows.join(' / ')); console.log('1位0件:', Object.keys(top).filter(k => !top[k]).map(k => A.DEST[k].name).join(','));
