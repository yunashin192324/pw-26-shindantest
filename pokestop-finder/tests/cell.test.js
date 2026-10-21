const test = require('node:test');
const assert = require('node:assert');
const PSF = require('./load');
const { S2: G } = require('s2-geometry'); // 別実装のS2ライブラリで突き合わせる

test('緯度経度からのセル計算が別実装のS2ライブラリと一致する', () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 500; i++) {
    const lat = 24 + rnd() * 21, lng = 122 + rnd() * 24, L = [14, 17][i % 2];
    const id = PSF.cell.cellAt(lat, lng, L);
    assert.strictEqual(id, BigInt(G.keyToId(G.latLngToKey(lat, lng, L))));
    const corners = G.S2Cell.FromHilbertQuadKey(G.latLngToKey(lat, lng, L)).getCornerLatLngs();
    const v = PSF.cell.describe(id).vertices;
    for (const c of corners) assert.ok(v.some((p) => Math.abs(p[0] - c.lat) < 1e-9 && Math.abs(p[1] - c.lng) < 1e-9));
  }
});

test('セルIDの入力形式（トークン・10進数・面番号形式・緯度経度・地図URL）を解釈できる', () => {
  const id = PSF.cell.cellAt(35.68, 139.76, 17);
  const token = PSF.cell.describe(id).token;
  assert.strictEqual(PSF.cell.parseInput(token).id, id);
  assert.strictEqual(PSF.cell.parseInput(' ' + token.toUpperCase() + ' ').id, id);
  assert.strictEqual(PSF.cell.parseInput(id.toString()).id, id);
  const key = G.latLngToKey(35.68, 139.76, 17);
  assert.strictEqual(PSF.cell.parseInput(key).id, id);
  assert.deepStrictEqual(PSF.cell.parseInput('35.6812, 139.7671'), { kind: 'point', lat: 35.6812, lng: 139.7671 });
  assert.deepStrictEqual(PSF.cell.parseInput('35.6812 139.7671'), { kind: 'point', lat: 35.6812, lng: 139.7671 });
  const url = PSF.cell.parseInput('https://www.google.com/maps/place/x/@35.6812,139.7671,17z');
  assert.strictEqual(url.kind, 'point');
  assert.strictEqual(url.lat, 35.6812);
  assert.strictEqual(PSF.cell.parseInput('').kind, 'error');
  assert.strictEqual(PSF.cell.parseInput('こんにちは').kind, 'error');
  assert.strictEqual(PSF.cell.parseInput('999999999999999999999').kind, 'error');
});

test('セル内外の判定と境界付近の区別', () => {
  const c = PSF.cell.describe(PSF.cell.cellAt(35.68, 139.76, 17));
  const inside = PSF.cell.classifyPoint(c, c.center[0], c.center[1]);
  assert.strictEqual(inside.status, 'in');
  assert.ok(inside.edgeDistM > 10);
  const far = PSF.cell.classifyPoint(c, c.center[0] + 0.01, c.center[1]);
  assert.strictEqual(far.status, 'out');
  // 頂点のすぐ近くは境界付近になる
  const v = c.vertices[0];
  const near = PSF.cell.classifyPoint(c, v[0] + (c.center[0] - v[0]) * 0.01, v[1] + (c.center[1] - v[1]) * 0.01);
  assert.strictEqual(near.status, 'edge');
  assert.strictEqual(near.inside, true);
});

test('L14セルの中のL17セルは64個', () => {
  const id = PSF.cell.cellAt(35.68, 139.76, 14);
  const kids = PSF.cell.descendants(id, 17);
  assert.strictEqual(kids.length, 64);
  for (const k of kids) assert.strictEqual(PSF.cell.parentToken(k, 14), PSF.cell.describe(id).token);
});
