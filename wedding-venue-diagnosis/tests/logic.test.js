/* 診断ロジックとデータの検証。実行: node --test tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const base = path.join(__dirname, '..', 'js');
require(path.join(base, 'data', 'venues.js'));
require(path.join(base, 'data', 'venue-extras.js'));
require(path.join(base, 'data', 'questions.js'));
const L = require(path.join(base, 'logic.js'));
const { DATA, QUESTIONS, EXTRAS } = globalThis.VENUE_DIAG;

const byName = Object.fromEntries(DATA.venues.map(v => [v.name, v]));
const run = a => L.diagnose(DATA, QUESTIONS, a);
const names = list => list.map(r => r.venue.name);
const NONE = { kids: 'no', access: 'any', scenery: ['none'], space: ['none'], stay: ['none'], focus: ['none'] };

test('データ件数: 式場51件・カテゴリ19件', () => {
  assert.equal(DATA.venues.length, 51);
  assert.equal(DATA.categories.length, 19);
  assert.equal(DATA.venues.reduce((n, v) => n + v.categories.length, 0), 327);
});

test('データと質問の整合性にエラー・警告がない', () => {
  const r = L.validate(DATA, QUESTIONS);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('Excelの全19カテゴリが、いずれか1つの選択肢にちょうど1回対応している', () => {
  const used = [];
  QUESTIONS.forEach(q => (q.opts || []).forEach(o => used.push(...(o.categories || []))));
  assert.deepEqual([...used].sort(), [...DATA.categories].sort());
});

test('追加情報ファイルのキーは、すべて実在する式場名', () => {
  Object.keys(EXTRAS).forEach(k => assert.ok(byName[k], '存在しない式場名: ' + k));
});

test('Excelの代表的な行が正しく取り込まれている', () => {
  assert.deepEqual(byName['プルメリアガーデン'].categories, ['ガーデンがある', '海が見える', 'アットホーム', 'パーティ会場併設', '自然豊か']);
  assert.deepEqual(byName['ディズニー・フェアリーテール・ウエディング・アウラニ'].categories,
    ['ガーデンがある', '海が見える', 'ビーチが目の前', 'アットホーム', 'ホテル内', 'パーティ会場併設', 'キャラクターと一緒']);
  assert.deepEqual(byName['星野リゾート トマム 水の教会'].categories,
    ['ガーデンがある', '食事がおいしい', 'ホテル内', 'パーティ会場併設', 'フライト時間が短い', '時差がない', '自然豊か', '子供と一緒']);
  assert.equal(byName['ザ・プライベート・ガーデン・アロハ・ケ･アクア'].row, 8); // Excelの表記（半角の中点）をそのまま保持
});

test('条件をすべて「こだわらない」にすると、おすすめを出さない', () => {
  const d = run(NONE);
  assert.equal(d.status, 'no_conditions');
  assert.equal(d.recommended.length, 0);
});

test('パターンA: 子連れ・時差なし・海/ビーチ・パーティ・コスパ（最重視=ビーチが目の前）', () => {
  const d = run({ kids: 'yes', access: 'nojetlag', scenery: ['seaview', 'beach'], space: ['none'], stay: ['party'], focus: ['cost'], priority: 'ビーチが目の前' });
  assert.equal(d.status, 'ok');
  assert.equal(d.conditions.length, 6);
  // 6条件すべてに該当するのはこの2式場のみ（同順位、掲載順）
  assert.deepEqual(names(d.recommended.slice(0, 2)), ['ザ・サーフ ビーチサイドテラス', 'ホテルアオ石垣']);
  assert.equal(d.recommended[0].rank, 1); assert.equal(d.recommended[1].rank, 1);
  assert.equal(d.recommended[0].matchCount, 6);
  assert.equal(d.recommended[2].matchCount, 5);
});

test('パターンB: 大人のみ・ガーデン/自然・教会・ヴィラ・衣裳（最重視なし）', () => {
  const d = run({ kids: 'no', access: 'any', scenery: ['garden', 'nature'], space: ['church'], stay: ['villa'], focus: ['dress'] });
  assert.equal(d.priority, null);
  assert.deepEqual(names(d.recommended.filter(r => r.rank === 1)), [
    'ウブドフォレスト アット フォーシーズンズ サヤン', 'ウォーターフォールウェディング',
    'チャペル・バイ・ザ・レイク', 'フォーシーズンズ ランダギラーバル ウェディング']);
  d.recommended.filter(r => r.rank === 1).forEach(r => assert.equal(r.matchCount, 4));
});

test('パターンC: キャラクターを最重視すると、唯一該当する式場が1位', () => {
  const d = run({ kids: 'yes', access: 'any', scenery: ['none'], space: ['none'], stay: ['hotel'], focus: ['character'], priority: 'キャラクターと一緒' });
  assert.equal(d.recommended[0].venue.name, 'ディズニー・フェアリーテール・ウエディング・アウラニ');
  assert.equal(d.recommended[0].rank, 1);
  assert.equal(d.recommended[0].tied, false);
  assert.equal(d.priorityCount, 1);
});

test('パターンE: 世界遺産のみ選択 → 該当する2式場だけを同順位でおすすめ', () => {
  const d = run(Object.assign({}, NONE, { scenery: ['heritage'] }));
  assert.deepEqual(names(d.recommended), ['ヒルトン ブルーホライズン', 'アラマンダ グレートバリアリーフチャペル']);
  assert.ok(d.recommended.every(r => r.rank === 1 && r.tied));
});

test('最重視の条件は、同じ条件を選んでも最重視しない場合より順位に強く効く', () => {
  const a = { kids: 'no', access: 'any', scenery: ['none'], space: ['church', 'glass'], stay: ['none'], focus: ['dress'] };
  const plain = run(a);
  const prio = run(Object.assign({}, a, { priority: 'ステンドグラスがある' }));
  // 最重視なし: 教会・大聖堂＋衣裳（2件一致、ステンドグラスなし）のチャペル・バイ・ザ・レイクは、ステンドグラスのみ（1件一致）の式場より上
  const pos = (d, n) => names(d.recommended).indexOf(n);
  assert.ok(pos(plain, 'チャペル・バイ・ザ・レイク') < pos(plain, 'ザ・プライベート・ガーデン・アロハ・ケ･アクア'));
  // 最重視=ステンドグラス: 該当式場がすべて上位に来る
  assert.ok(pos(prio, 'チャペル・バイ・ザ・レイク') > pos(prio, 'ザ・プライベート・ガーデン・アロハ・ケ･アクア'));
});

test('最重視が無効な値（選んだ条件に無い）の場合は無視される', () => {
  const d = run({ kids: 'yes', access: 'short', scenery: ['none'], space: ['none'], stay: ['none'], focus: ['none'], priority: '世界遺産' });
  assert.equal(d.priority, null);
});

/* 網羅テスト: すべての回答の組み合わせについて、独立に書いた判定と結果が一致するか */
function allCombos() {
  const qs = QUESTIONS.filter(q => q.type !== 'priority');
  const choices = qs.map(q => {
    if (q.type === 'single') return q.opts.map(o => o.v);
    const real = q.opts.filter(o => !o.exclusive).map(o => o.v);
    const subsets = [['none']];
    for (let m = 1; m < (1 << real.length); m++) subsets.push(real.filter((_, i) => m & (1 << i)));
    return subsets;
  });
  const out = [];
  (function rec(i, acc) {
    if (i === qs.length) { out.push(acc); return; }
    choices[i].forEach(c => rec(i + 1, Object.assign({}, acc, { [qs[i].id]: c })));
  })(0, {});
  return out;
}

function reference(a) {
  // 選択肢 → カテゴリ（質問定義を直接読む独立実装）
  const conds = [];
  QUESTIONS.forEach(q => (q.opts || []).forEach(o => {
    const sel = Array.isArray(a[q.id]) ? a[q.id].includes(o.v) : a[q.id] === o.v;
    if (sel) o.categories.forEach(c => conds.push([c, q.id]));
  }));
  const pr = conds.some(c => c[0] === a.priority) ? a.priority : null;
  return DATA.venues.map(v => {
    const hit = conds.filter(c => v.categories.includes(c[0]));
    return { name: v.name, row: v.row, p: pr && v.categories.includes(pr) ? 1 : 0, m: hit.length, b: new Set(hit.map(h => h[1])).size };
  }).filter(x => x.m > 0).sort((x, y) => y.p - x.p || y.m - x.m || y.b - x.b || x.row - y.row);
}

// 通常は「最重視なし」を全件、「最重視あり」を13件に1件の割合で検証（約40秒）。
// FULL=1 node --test tests/ で全組み合わせ×全最重視を検証（約4分）。
const FULL = process.env.FULL === '1';
test('全回答パターンで、独立実装と順位が完全一致し、根拠のないおすすめが無い', () => {
  const combos = allCombos();
  assert.equal(combos.length, 2 * 3 * 32 * 8 * 16 * 16); // 393,216通り
  let checked = 0;
  combos.forEach((a, n) => {
    const conds = L.collectConditions(QUESTIONS, a).map(c => c.category);
    const prios = conds.length >= 2 && (FULL || n % 13 === 0) ? [undefined].concat(conds) : [undefined];
    prios.forEach(p => {
      const ans = Object.assign({}, a, p ? { priority: p } : {});
      const d = run(ans);
      const ref = reference(ans);
      if (!conds.length) { assert.equal(d.status, 'no_conditions'); return; }
      assert.deepEqual(names(d.recommended), ref.map(r => r.name));
      d.recommended.forEach((r, i) => {
        assert.ok(r.matchCount > 0);
        if (i > 0) {
          const prev = d.recommended[i - 1];
          const same = prev.priorityMatch === r.priorityMatch && prev.matchCount === r.matchCount && prev.breadth === r.breadth;
          assert.equal(r.rank === prev.rank, same);
        }
      });
      checked++;
    });
  });
  assert.ok(checked > 10000, '検証件数: ' + checked);
});
