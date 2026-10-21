const test = require('node:test');
const assert = require('node:assert');
const PSF = require('./load');
const fx = require('./fixtures/sample.json');

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) });

function mockFetch(log) {
  return async (url, init) => {
    log.push(url);
    const host = new URL(url).hostname;
    if (url.includes('/api/interpreter')) return res(200, fx.overpass);
    if (host === 'ja.wikipedia.org') return res(200, fx.wikipedia);
    if (host === 'query.wikidata.org') return res(200, fx.wikidata);
    if (host === 'nominatim.openstreetmap.org') return res(200, fx.nominatim);
    throw new TypeError('unexpected ' + url);
  };
}

async function runAll(cell, fetch) {
  const b = PSF.cell.searchBounds(cell, 30);
  const osm = await PSF.sources.fetchOsm(b, cell.center, { fetch });
  const wikipedia = await PSF.sources.fetchWikipedia(b, { fetch });
  const ids = [...new Set(osm.elements.map((e) => e.tags && e.tags.wikidata).filter(Boolean))];
  const wikidata = await PSF.sources.fetchWikidata(b, ids, { fetch });
  const area = await PSF.sources.fetchPlaceName(cell.center[0], cell.center[1], { fetch });
  return { osm, wikipedia, wikidata, area };
}

const cell = PSF.cell.describe(PSF.cell.fromToken(fx.cellToken));

test('取得結果を解釈し、重複をまとめ、セル内外と評価を付ける', async () => {
  const log = [];
  const raw = await runAll(cell, mockFetch(log));
  assert.strictEqual(log.length, 4, '各サービスへの問い合わせは1回ずつ');
  assert.strictEqual(raw.area.municipality, '架空市架空区');
  const { candidates, context } = PSF.candidates.build(cell, raw, {});
  const by = (n) => candidates.find((c) => c.name === n);

  const statue = by('平和の像');
  assert.ok(statue, '像が候補になる');
  assert.strictEqual(candidates.filter((c) => c.name === '平和の像').length, 1, '同名・近接の重複登録は1件にまとめる');
  assert.strictEqual(statue.kind, '銅像');
  assert.strictEqual(statue.cellStatus, 'in');
  assert.deepStrictEqual(statue.insideOf.map((p) => p.name), ['テスト中央公園']);
  assert.ok(statue.eval.enough);

  const park = by('テスト中央公園');
  assert.strictEqual(park.posKind, 'area', '公園は区域として扱い、中心を正確な位置とみなさない');
  assert.ok(park.wiki && park.wiki.wd && park.wiki.wp, 'wikidataタグで百科事典の情報を結び付ける');
  assert.ok(park.facts.some((f) => f.key === 'inception' && f.value === '1965'));
  assert.strictEqual(candidates.filter((c) => c.id === 'osm:way/2001').length, 1, 'セル中心を含む区域と輪郭つきの公園を二重に数えない');

  const board = candidates.find((c) => c.kind === '歴史解説板');
  assert.strictEqual(board.name, null);
  assert.strictEqual(board.eval.status, 'onsite', '名称のない案内板は現地確認');

  const shrine = by('稲荷神社');
  assert.strictEqual(shrine.cellStatus, 'out');
  assert.strictEqual(shrine.eval.status, 'out');

  const jizo = by('地蔵堂');
  assert.strictEqual(jizo.cellStatus, 'edge');
  assert.ok(jizo.eval.onsite.some((t) => t.includes('境界')));

  const priv = by('庭のオブジェ');
  assert.strictEqual(priv.eval.status, 'concern');

  const pitch = candidates.find((c) => c.kind === '野球場');
  assert.ok(pitch.inSchool, '学校の敷地内の運動場を検出する');
  assert.strictEqual(pitch.eval.status, 'concern');

  const dot = by('旧街道道標');
  assert.strictEqual(dot.cat, 'historic', 'Wikidataの種類名から分類を推定する');
  assert.strictEqual(dot.posKind, 'reference');
  assert.deepStrictEqual(dot.insideOf, [], '参考座標では公園内かどうかを決めない');
  assert.ok(dot.facts.some((f) => f.key === 'heritage'));
  assert.ok(!dot.facts.some((f) => f.key === 'inception'), '精度が年未満の日付は使わない');

  assert.ok(candidates.some((c) => c.name === '架空駅' && !c.inCell));
  assert.strictEqual(context.schools.length, 1);
  // 並び順は評価の高い順
  for (let i = 1; i < candidates.length; i++) assert.ok(candidates[i - 1].eval.score >= candidates[i].eval.score);
});

test('既存スポットを登録すると同じL17セル・20m以内の候補に注意が付く', async () => {
  const raw = await runAll(cell, mockFetch([]));
  const first = PSF.candidates.build(cell, raw, {});
  const statue = first.candidates.find((c) => c.name === '平和の像');
  const existing = [{ id: 'e1', lat: statue.lat, lng: statue.lng, label: '既存', l17: statue.l17 }];
  const again = PSF.candidates.refresh(cell, first.candidates, first.context, { existing });
  const s2 = again.find((c) => c.name === '平和の像');
  assert.strictEqual(s2.eval.status, 'concern');
  assert.ok(s2.eval.concerns.some((t) => t.includes('20m')));
  const memo = again.find((c) => c.name === '開園記念碑');
  assert.ok(memo.eval.concerns.some((t) => t.includes('L17')));
});

test('手動で追加した候補も評価される', async () => {
  const raw = await runAll(cell, mockFetch([]));
  const first = PSF.candidates.build(cell, raw, {});
  const u = PSF.candidates.userCandidate({ id: 'x', name: '時計台', cat: 'landmark', lat: cell.center[0], lng: cell.center[1], memo: '公園入口の時計台' });
  const list = PSF.candidates.refresh(cell, first.candidates, first.context, { userCandidates: [u] });
  const got = list.find((c) => c.id === 'user:x');
  assert.ok(got.inCell);
  assert.deepStrictEqual(got.insideOf.map((p) => p.name), ['テスト中央公園']);
});

test('取得失敗の種類を区別し、利用制限では別サーバーに切り替えない', async () => {
  const b = PSF.cell.searchBounds(cell, 30);
  let calls = 0;
  await assert.rejects(PSF.sources.fetchOsm(b, cell.center, { fetch: async () => { calls++; return res(429, {}); } }), (e) => e.code === 'rate' && /利用制限/.test(e.userMessage));
  assert.strictEqual(calls, 1);

  calls = 0;
  await assert.rejects(PSF.sources.fetchOsm(b, cell.center, { fetch: async () => { calls++; return res(504, {}); } }), (e) => e.code === 'server');
  assert.strictEqual(calls, 2, '混雑時は予備のサーバーを1回だけ試す');

  calls = 0;
  const ok = await PSF.sources.fetchOsm(b, cell.center, { fetch: async () => { calls++; return calls === 1 ? res(504, {}) : res(200, fx.overpass); } });
  assert.strictEqual(ok.elements.length, fx.overpass.elements.length);

  await assert.rejects(PSF.sources.fetchWikipedia(b, { fetch: async () => { throw new TypeError('Failed to fetch'); } }), (e) => e.code === 'network');
  await assert.rejects(PSF.sources.fetchWikidata(b, [], { fetch: async () => res(200, { nope: 1 }) }), (e) => e.code === 'parse');
  await assert.rejects(PSF.sources.fetchOsm(b, cell.center, { fetch: () => new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('x'), { name: 'AbortError' })), 5)) }), (e) => e.code === 'timeout');

  const partial = await PSF.sources.fetchOsm(b, cell.center, { fetch: async () => res(200, { elements: [], remark: 'runtime error: Query timed out in "query" at line 3' }) });
  assert.strictEqual(partial.partial, true);
});

test('問い合わせ文が対象範囲と分類を含む', () => {
  const b = PSF.cell.searchBounds(cell, 30);
  const q = PSF.sources.overpassQuery(b, cell.center);
  assert.match(q, /\[out:json\]/);
  assert.match(q, /tourism"~"\^\(artwork/);
  assert.match(q, /is_in\(/);
  const w = PSF.sources.wikidataQuery(b, ['Q1']);
  assert.match(w, /wikibase:box/);
  assert.match(w, /VALUES \?item \{ wd:Q1 \}/);
});
