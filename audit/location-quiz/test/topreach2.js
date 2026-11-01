// 1位になりうる撮影地を、景色・演出の2つまでの組み合わせで全数探索する（海外、全日数、全予算、全過ごし方、全同行者）
const { load } = require('./harness'); const D = require('./driver');
const A = load(process.argv[2] || '../fixed.txt');
const sub2 = a => { const r = a.map(x => [x]); for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) r.push([a[i], a[j]]); return r; };
const top = {}; Object.keys(A.DEST).forEach(k => top[k] = 0); let n = 0; const ex = {};
for (const region of ['domestic', 'overseas']) for (const days of ['short', 'medium', 'long', 'verylong', 'ultra']) {
  for (const scene of sub2(D.visibleValues(A, region, days, 'scene'))) {
    const vm = D.visibleValues(A, region, days, 'moment', { scene }).filter(v => v !== 'none');
    for (const moment of [['none']].concat(sub2(vm))) for (const style of ['resort', 'sightseeing', 'shopping', 'active']) for (const who of ['couple', 'family_kids', 'family_elder', 'group']) for (let budget = 1; budget <= 6; budget++) {
      const ans = { region, days, scene, moment, style, who, budget }; const R = A.score(ans); n++;
      if (R.length) { top[R[0]]++; if (!ex[R[0]]) ex[R[0]] = ans; }
    }
  }
}
console.log('探索', n, '件');
console.log('1位0件:', Object.keys(top).filter(k => !top[k]).map(k => A.DEST[k].name).join(',') || 'なし');
for (const k of ['fiji', 'portugal', 'central_eu', 'romantic_road', 'netherlands']) console.log(A.DEST[k].name, top[k], ex[k] ? JSON.stringify(ex[k]) : '');
