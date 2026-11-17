/* 診断ロジックとデータの検証。実行: node --test tests/logic.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const base = path.join(__dirname, '..', 'js');
['venues', 'venue-extras', 'questions'].forEach(f => require(path.join(base, 'data', f + '.js')));
require(path.join(base, 'config.js'));
const L = require(path.join(base, 'logic.js'));
const { DATA, QUESTIONS, EXTRAS, CONFIG } = globalThis.VENUE_DIAG;
const M = L.prepare(DATA, EXTRAS, CONFIG);

const byName = Object.fromEntries(M.venues.map(v => [v.name, v]));
const run = a => L.diagnose(M, QUESTIONS, a);
const flowIds = a => L.evaluateFlow(M, QUESTIONS, a).steps.map(s => s.q.id);
const names = list => list.map(r => r.venue.name);

test('データ件数: 式場51件・カテゴリ19件・付与326個', () => {
  assert.equal(M.venues.length, 51);
  assert.equal(M.categories.length, 19);
  assert.equal(M.venues.reduce((n, v) => n + v.excel.length, 0), 326);
});

test('データ・質問の整合性にエラーがない（未使用カテゴリは警告のみ）', () => {
  const r = L.validate(M, QUESTIONS);
  assert.deepEqual(r.errors, []);
  r.warnings.forEach(w => assert.match(w, /どの質問でも使われていません/));
});

test('全式場にエリアと地域が設定されている', () => {
  const count = {};
  M.venues.forEach(v => { assert.ok(v.region, v.name); count[v.region] = (count[v.region] || 0) + 1; });
  assert.deepEqual(count, { hawaii: 14, okinawa: 14, guam: 5, bali: 10, europe: 3, cairns: 2, nz: 1, maldives: 1, hokkaido: 1 });
  Object.keys(EXTRAS).forEach(k => assert.ok(byName[k], '存在しない式場名: ' + k));
});

test('Excelの代表的な行が正しく取り込まれている', () => {
  assert.deepEqual(byName['プルメリアガーデン'].excel, ['ガーデンがある', '海が見える', 'アットホーム', 'パーティ会場併設', '自然豊か']);
  assert.deepEqual(byName['星野リゾート トマム 水の教会'].excel,
    ['ガーデンがある', '食事がおいしい', 'ホテル内', 'パーティ会場併設', 'フライト時間が短い', '時差がない', '自然豊か', '子供と一緒']);
  assert.equal(byName['ザ・プライベート・ガーデン・アロハ・ケ・アクア'].row, 8);
});

test('追加情報から作る特徴（ご回答の内容）', () => {
  const f = n => byName[n].features;
  assert.ok(f('ザ・テラス バイ・ザ・シー').includes('内観：白系') && f('ザ・テラス バイ・ザ・シー').includes('内観：茶系'));
  assert.ok(f('ザ・モアナチャペル').includes('ワイキキから30分圏内'));          // ホテル内
  assert.ok(!f('コオリナ・チャペル・プレイス・オブ・ジョイ').includes('ワイキキから30分圏内')); // 60分程度
  assert.ok(f('ブルーアステール').includes('独立型'));                         // ホテル内なし
  assert.ok(!f('ジュエル・バイ・ザ・シー').includes('独立型'));
  assert.ok(f('サザンチャペル キラナリゾート沖縄').includes('立地：南部'));
  assert.ok(f('コンラッド インフィニティ').includes('立地：ベノア'));
  assert.ok(f('アメリカンチャーチ').includes('撮影：エッフェル塔'));
  assert.ok(f('プルメリアガーデン').includes('挙式：ガーデン') && !f('プルメリアガーデン').includes('挙式：チャペル'));
});

test('地域が決まっていれば、その地域の質問だけが出る', () => {
  assert.deepEqual(flowIds({ region: 'hawaii' }), ['region', 'kids', 'hawaiiStyle', 'hawaiiMove', 'focus']);
  assert.deepEqual(flowIds({ region: 'europe' }), ['region', 'europeGlass', 'europeSpot']);   // 子連れ・こだわりは違いが出ないため省略
  assert.deepEqual(flowIds({ region: 'maldives' }), ['region']);                             // 1件のみ
  assert.deepEqual(flowIds({ region: 'okinawa', okinawaIsland: 'ishigaki' }), ['region', 'okinawaIsland']);
});

test('地域が未定なら、日数とお子さまの有無でおすすめの地域を出す', () => {
  const pick = a => L.evaluateFlow(M, QUESTIONS, a).steps.find(s => s.q.id === 'regionPick').opts.map(o => o.v);
  assert.deepEqual(pick({ region: 'undecided', kids: 'yes', days: 3 }), ['guam', 'okinawa', 'hokkaido']);
  assert.deepEqual(pick({ region: 'undecided', kids: 'yes', days: 6 }), ['guam', 'okinawa', 'bali', 'hawaii', 'cairns', 'hokkaido']);
  assert.deepEqual(pick({ region: 'undecided', kids: 'no', days: 8 }), CONFIG.regions.map(r => r.id));
  assert.equal(run({ region: 'undecided', kids: 'no', days: 3 }).status, 'no_region');
});

test('ハワイ：白系の海の見えるチャペル・ビーチ・ホテル内 → モアナ', () => {
  const d = run({ region: 'hawaii', kids: 'no', hawaiiStyle: 'chapelWhite', hawaiiView: 'beach', hawaiiMove: 'hotel', focus: ['none'] });
  assert.equal(d.status, 'ok');
  assert.equal(d.recommended[0].venue.name, 'ザ・モアナチャペル');
  d.recommended.forEach(r => assert.ok(r.venue.categories.includes('内観：白系') && r.venue.categories.includes('挙式：チャペル')));
});

test('ハワイ：教会・アットホーム → キャルバリー、次にセントアンドリュース（教会以外は出さない）', () => {
  const d = run({ region: 'hawaii', kids: 'no', hawaiiStyle: 'church', hawaiiChurch: 'athome', hawaiiMove: 'any', focus: ['none'] });
  assert.deepEqual(names(d.recommended), ['キャルバリー・バイ・ザ・シー教会', 'セント・アンドリュース・カテドラル教会 大聖堂']);
});

test('ハワイ：ガーデン・30分圏内・ガーデンパーティ → 同点2件は人気順', () => {
  const d = run({ region: 'hawaii', kids: 'no', hawaiiStyle: 'garden', hawaiiMove: 'near', focus: ['gardenParty'] });
  assert.deepEqual(names(d.recommended.slice(0, 2)), ['プルメリアガーデン', 'アイネスヴィラノッツェ ワイキキレイア']);
  assert.ok(d.recommended[0].tied && d.recommended[1].tied);
});

test('沖縄本島：恩納村・読谷を最重視 → 該当する式場が上位を占める', () => {
  const d = run({ region: 'okinawa', okinawaIsland: 'main', okinawaLocation: 'resort', resortStyle: 'chapelWhite', place: ['beach'], focus: ['food'], priority: '立地：恩納村・読谷' });
  assert.equal(d.priority, '立地：恩納村・読谷');
  assert.equal(d.recommended[0].venue.name, 'ザ・ヨミタンリゾート アクアグレイス・チャペル');
  const firstNon = d.recommended.findIndex(r => !r.priorityMatch);
  if (firstNon !== -1) d.recommended.slice(firstNon).forEach(r => assert.equal(r.priorityMatch, false));
});

test('沖縄：宮古島・茶系チャペル → 宮古島チャペル／石垣島 → ホテルアオ石垣（エリアの式場として案内）', () => {
  assert.equal(run({ region: 'okinawa', okinawaIsland: 'miyako', resortStyle: 'chapelBrown' }).recommended[0].venue.name, '宮古島チャペル');
  const d = run({ region: 'okinawa', okinawaIsland: 'ishigaki' });
  assert.equal(d.status, 'region_only');
  assert.deepEqual(names(d.recommended), ['ホテルアオ石垣']);
});

test('グアム：ガーデン → クラウンプラザガーデンのみ', () => {
  assert.deepEqual(names(run({ region: 'guam', resortStyle: 'garden' }).recommended), ['クラウンプラザガーデン']);
});

test('ヨーロッパ：ステンドグラス重視はフィレンツェ→パリ、コロッセオはローマ', () => {
  assert.deepEqual(names(run({ region: 'europe', europeGlass: 'yes', europeSpot: 'any' }).recommended.slice(0, 2)), ['セント・ジェームス教会', 'アメリカンチャーチ']);
  assert.equal(run({ region: 'europe', europeGlass: 'no', europeSpot: 'colosseum' }).recommended[0].venue.name, 'セント・ポールズ・ウィズ イン・ザ・ウォールズ教会');
  assert.equal(run({ region: 'europe', europeGlass: 'no', europeSpot: 'eiffel' }).recommended[0].venue.name, 'アメリカンチャーチ');
});

test('モルディブ：質問なしでその式場を案内', () => {
  const d = run({ region: 'maldives' });
  assert.equal(d.status, 'region_only');
  assert.deepEqual(names(d.recommended), ['フォーシーズンズ ランダギラーバル ウェディング']);
});

/* 無作為な回答（各質問で、表示された選択肢から選ぶ）を多数作り、別に書いた判定と比べる */
function randomAnswers(seed) {
  let x = seed;
  const rnd = n => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; };
  const a = {};
  for (let guard = 0; guard < 30; guard++) {
    const steps = L.evaluateFlow(M, QUESTIONS, a).steps;
    const next = steps.find(s => a[s.q.id] === undefined);
    if (!next) break;
    const opts = next.opts;
    if (next.q.type === 'multi') {
      const real = opts.filter(o => !o.exclusive);
      const pick = real.filter(() => rnd(3) === 0).filter((o, i, arr) => !o.group || arr.findIndex(p => p.group === o.group) === i);
      a[next.q.id] = pick.length ? pick.map(o => o.v) : [opts.find(o => o.exclusive).v];
    } else a[next.q.id] = opts[rnd(opts.length)].v;
  }
  return a;
}

function reference(a) {
  const f = L.evaluateFlow(M, QUESTIONS, a);
  const conds = f.conditions.map(c => c.category);
  const pr = f.shown.priority && conds.includes(a.priority) ? a.priority : null;
  const tie = f.tieOrder || [];
  const rows = f.pool.map(v => ({ v, p: pr && v.categories.includes(pr) ? 1 : 0, m: conds.filter(c => v.categories.includes(c)).length,
    t: tie.includes(v.name) ? tie.indexOf(v.name) : Infinity }));
  rows.sort((x, y) => y.p - x.p || y.m - x.m || (x.t - y.t || 0) || (x.v.order - y.v.order || 0) || x.v.row - y.v.row);
  const hit = conds.length ? rows.filter(r => r.m > 0) : [];
  return (hit.length ? hit : rows).map(r => r.v.name);
}

test('無作為な回答3000通りで、別実装と順位が一致し、地域外・絞り込み外の式場を出さない', () => {
  let ok = 0;
  for (let s = 1; s <= 3000; s++) {
    const a = randomAnswers(s);
    const d = run(a);
    if (d.status === 'no_region') continue;
    assert.deepEqual(names(d.recommended), reference(a), JSON.stringify(a));
    d.recommended.forEach(r => {
      assert.equal(r.venue.region, d.region);
      d.conditions.filter(c => c.required).forEach(c => assert.ok(r.venue.categories.includes(c.category)));
      if (d.status === 'ok') assert.ok(r.matchCount > 0);
    });
    ok++;
  }
  assert.ok(ok > 2500, '検証件数: ' + ok);
});
