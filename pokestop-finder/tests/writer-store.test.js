const test = require('node:test');
const assert = require('node:assert');
const PSF = require('./load');
const fx = require('./fixtures/sample.json');

const cell = PSF.cell.describe(PSF.cell.fromToken(fx.cellToken));
const wp = fx.wikipedia.query.pages.map((p) => ({ pageid: p.pageid, title: p.title, lat: p.coordinates[0].lat, lng: p.coordinates[0].lon, wikidata: p.pageprops.wikibase_item, extract: p.extract, url: 'https://ja.wikipedia.org/wiki/x' }));
const wd = PSF.sources.parseWikidataRows(fx.wikidata.results.bindings);
const built = PSF.candidates.build(cell, { osm: fx.overpass, wikipedia: wp, wikidata: wd }, {});
const list = built.candidates;
const area = { municipality: '架空市架空区' };
const get = (n) => list.find((c) => c.name === n);

test('タイトル・説明文・補助文を確認できた事実から作る', () => {
  const c = get('平和の像');
  const g = PSF.writer.generate(c, { area });
  assert.strictEqual(g.title, '平和の像');
  assert.match(g.description, /山田太郎/);
  assert.match(g.description, /1965年/);
  assert.match(g.description, /テスト中央公園/);
  assert.match(g.support, /OpenStreetMap/);
  assert.match(g.support, /探索/);
  assert.notStrictEqual(g.description, g.support);
  // 説明文の各文に根拠が付いている
  for (const part of g.evidence.description) assert.ok(part.srcs.length > 0, part.text);
  assert.deepStrictEqual(PSF.writer.check(c, g, []).filter((i) => i.level !== 'info'), []);
});

test('Wikipediaの要約は参考扱いで、申請文には転載しない', () => {
  const park = get('テスト中央公園');
  const g = PSF.writer.generate(park, { area });
  assert.ok(!g.description.includes('架空の公園である'));
  assert.ok(!g.support.includes('架空の公園である'));
});

test('名称がない候補は仮タイトルになり、存在しない名称を作らない', () => {
  const board = list.find((c) => c.kind === '歴史解説板');
  const g = PSF.writer.generate(board, { area });
  assert.match(g.title, /^【仮】/);
  assert.ok(PSF.writer.check(board, g, []).some((i) => /仮のまま/.test(i.message)));
});

test('同じ種類の候補でも同一の定型文にならない', () => {
  const texts = list.filter((c) => c.inCell).map((c) => PSF.writer.generate(c, { area }).description);
  assert.strictEqual(new Set(texts).size, texts.length);
});

test('再生成で言い回しが変わる', () => {
  const c = get('平和の像');
  const a = PSF.writer.generate(c, { area, variant: 0 });
  const b = PSF.writer.generate(c, { area, variant: 1 });
  assert.notStrictEqual(a.description, b.description);
});

test('品質チェックが根拠のない表現・数値・名称の不一致・重複内容を指摘する', () => {
  const c = get('平和の像');
  const issues = PSF.writer.check(c, {
    title: '平和の銅像',
    description: '地元で有名な銅像で、1890年に建てられました。',
    support: '地元で有名な銅像で、1890年に建てられました。',
  }, []);
  const msg = issues.map((i) => i.message).join('\n');
  assert.match(msg, /一致しません/);
  assert.match(msg, /「有名」/);
  assert.match(msg, /1890年/);
  assert.match(msg, /ほぼ同じ/);
  assert.match(msg, /探索・運動・交流/);
  const empty = PSF.writer.check(c, { title: '', description: '', support: '' }, []);
  assert.strictEqual(empty.filter((i) => i.level === 'error').length, 3);
});

test('説明文と補助文の年の食い違いを指摘する', () => {
  const c = get('平和の像');
  const issues = PSF.writer.check(c, { title: '平和の像', description: '1965年に設置。像です。', support: '1970年の設置です。探索に関わります。' }, []);
  assert.ok(issues.some((i) => /食い違/.test(i.message)));
});

test('保存・読み込み・バックアップの復元', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const st = PSF.store.create(storage);
  const c = get('平和の像');
  const gen = PSF.writer.generate(c, { area });
  const p = { token: cell.token, level: 17, candidates: list, context: built.context, drafts: { [c.id]: { generated: gen, edited: { title: '平和の像（編集）' } } }, checklist: { [c.id]: { exists: 'ok' } } };
  assert.ok(st.saveProject(p).ok);
  const again = st.project(cell.token);
  assert.strictEqual(again.drafts[c.id].edited.title, '平和の像（編集）');
  assert.strictEqual(st.history()[0].token, cell.token);

  const backup = JSON.parse(JSON.stringify(st.backup()));
  const st2 = PSF.store.create({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  assert.strictEqual(st2.restore({ foo: 1 }).ok, false);
  const mem3 = new Map();
  const st3 = PSF.store.create({ getItem: (k) => (mem3.has(k) ? mem3.get(k) : null), setItem: (k, v) => mem3.set(k, v), removeItem: (k) => mem3.delete(k) });
  const r = st3.restore(backup);
  assert.ok(r.ok);
  assert.strictEqual(st3.project(cell.token).drafts[c.id].edited.title, '平和の像（編集）');
});

test('保存領域が満杯のときは日本語で知らせる', () => {
  const st = PSF.store.create({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} });
  const r = st.saveProject({ token: 'x', candidates: [] });
  assert.strictEqual(r.ok, false);
  assert.match(r.message, /保存領域/);
});

test('CSV出力（Excelで文字化けしない形式、編集後の文章を優先）', () => {
  const c = get('平和の像');
  const gen = PSF.writer.generate(c, { area });
  const p = { token: cell.token, level: 17, candidates: list, drafts: { [c.id]: { generated: gen, edited: { description: '編集した説明, "引用"あり' } } }, checklist: {} };
  const csv = PSF.store.toCsv([p]);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /"編集した説明, ""引用""あり"/);
  assert.match(csv, /平和の像/);
  const lines = csv.split('\r\n');
  assert.strictEqual(lines.length, list.length + 1);
});
