// 2つの版で「予算を広げると」の案内に出る撮影地の集合が同じかを比べる（並び順の違いは、同点の順番の変更によるもので対象外）
// 使い方: node upsellcompare.js <版A> <版B> [件数]
const D = require('./driver');
const [fa, fb] = [process.argv[2], process.argv[3]]; const N = +(process.argv[4] || 3000);
const A = D.load(fa); const SC = A.QS[2].opts.map(o => o.v);
let seed = 21; const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; const p = a => a[Math.floor(r() * a.length)];
const names = u => u ? u.replace('もう少し予算を広げると…', '').split('も視野に入ります')[0].split('・').sort().join('・') : '';
let n = 0, shown = 0, diff = 0;
for (let i = 0; i < N; i++) {
  const region = p(['domestic', 'overseas']), days = p(['short', 'medium', 'long', 'verylong', 'ultra']);
  const scene = [p(D.visibleValues(A, region, days, 'scene'))];
  const ans = { region, days, scene, moment: ['none'], style: p(['resort', 'sightseeing', 'shopping', 'active']), who: p(['couple', 'family_kids', 'family_elder', 'group']), budget: 1 + Math.floor(r() * 5) };
  const x = D.run(fa, ans).result.upsell, y = D.run(fb, ans).result.upsell; n++;
  if (x || y) shown++;
  if (names(x) !== names(y)) { diff++; if (diff <= 3) console.log('差', JSON.stringify(ans), x, '|', y); }
}
console.log(`${n} 件中、案内が出た ${shown} 件で、案内に出る撮影地が異なる ${diff} 件`);
