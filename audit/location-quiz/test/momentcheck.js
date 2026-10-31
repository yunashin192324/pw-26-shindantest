// 画面に表示される演出の選択肢が、選んだ景色のどれかと両方叶える撮影地を必ず持つか（全景色の組み合わせ）
const { load } = require('./harness'); const D = require('./driver');
const A = load(process.argv[2] || '../fixed.txt'); const SC = A.QS[2].opts.map(o => o.v);
const sub = a => { const r = []; for (let m = 1; m < (1 << a.length); m++) r.push(a.filter((_, i) => m & (1 << i))); return r; };
let shown = 0, bad = 0, hidden = 0, ex = [];
for (const region of ['domestic', 'overseas']) for (const days of ['short', 'medium', 'long', 'verylong', 'ultra']) {
  const reach = A.getEligible({ region, days, budget: 6 });
  for (const scene of sub(D.visibleValues(A, region, days, 'scene'))) {
    const vis = D.visibleValues(A, region, days, 'moment', { scene });
    for (const o of A.QS[3].opts) { if (o.v === 'none') continue;
      const ok = reach.some(k => A.DEST[k][o.v] && scene.some(x => A.DEST[k][x]));
      if (vis.includes(o.v)) { shown++; if (!ok) { bad++; ex.length < 3 && ex.push([region, days, scene.join('+'), o.text]); } } else if (ok) { hidden++; } }
  }
}
console.log(`表示した演出 ${shown} 件のうち、選んだ景色と両方叶える撮影地がないもの ${bad} 件 / 叶えられるのに非表示 ${hidden} 件`, JSON.stringify(ex));
