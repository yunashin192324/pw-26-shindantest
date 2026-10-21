// テスト用のサンプル応答（各サービスの実際の応答形式に合わせた架空データ）を生成する。
// 実在の場所・データではない。node tools/make-fixture.js で tests/fixtures/sample.json を作り直す。
require('../vendor/s2/s2.bundle.js');
require('../js/core/geo.js');
require('../js/core/cell.js');
const fs = require('fs');
const path = require('path');
const { cell, geo } = globalThis.PSF;

const id = globalThis.S2.cellIdFromLatLng(35.6800, 139.7600, 17);
const c = cell.describe(id);
const [clat, clng] = c.center;
const m = (dx, dy) => { // 中心から東へdx m・北へdy m の点
  const R = 6371008.8, RAD = Math.PI / 180;
  return [clat + dy / (R * RAD), clng + dx / (R * RAD * Math.cos(clat * RAD))];
};
const node = (id, p, tags) => ({ type: 'node', id, lat: +p[0].toFixed(7), lon: +p[1].toFixed(7), tags });
const way = (id, pts, tags) => {
  const g = pts.concat([pts[0]]).map((p) => ({ lat: +p[0].toFixed(7), lon: +p[1].toFixed(7) }));
  return { type: 'way', id, bounds: {}, nodes: g.map((_, i) => 9000 + i), geometry: g, tags };
};
// セル境界の1辺の中点から少しだけ内側の点
const v = c.vertices;
const mid = [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2];
const inward = [mid[0] + (clat - mid[0]) * 0.03, mid[1] + (clng - mid[1]) * 0.03];

const overpass = {
  version: 0.6, generator: 'Overpass API (sample)', osm3s: { copyright: 'sample' },
  elements: [
    node(1001, m(-5, 8), { tourism: 'artwork', artwork_type: 'statue', material: 'bronze', name: '平和の像', artist_name: '山田太郎', start_date: '1965' }),
    node(1002, m(-2, 10), { tourism: 'artwork', name: '平和の像' }),
    node(1003, m(12, -6), { historic: 'memorial', memorial: 'stone', name: '開園記念碑', inscription: '昭和四十年開園' }),
    node(1004, m(-15, -12), { tourism: 'information', information: 'board', board_type: 'history' }),
    node(1005, m(18, 14), { leisure: 'playground' }),
    node(1006, m(150, 150), { amenity: 'place_of_worship', religion: 'shinto', name: '稲荷神社' }),
    node(1007, inward, { historic: 'wayside_shrine', name: '地蔵堂' }),
    node(1008, m(-25, 25), { tourism: 'artwork', name: '庭のオブジェ', access: 'private' }),
    node(1009, m(25, -30), { leisure: 'pitch', sport: 'baseball' }),
    way(2001, [m(-30, -20), m(22, -20), m(22, 22), m(-30, 22)], { leisure: 'park', name: 'テスト中央公園', wikidata: 'Q900001' }),
    way(2002, [m(20, -40), m(40, -40), m(40, -20), m(20, -20)], { amenity: 'school', name: 'テスト小学校' }),
    { type: 'area', id: 2400002001, tags: { leisure: 'park', name: 'テスト中央公園' } },
  ],
};

const parkCenter = m(-4, 1);
const wikipedia = {
  batchcomplete: true,
  query: {
    pages: [
      { pageid: 555001, ns: 0, title: 'テスト中央公園', index: 1, coordinates: [{ lat: parkCenter[0], lon: parkCenter[1], primary: true, globe: 'earth' }], pageprops: { wikibase_item: 'Q900001' }, extract: 'テスト中央公園は架空の公園である。' },
      { pageid: 555002, ns: 0, title: '架空駅', index: 2, coordinates: [{ lat: m(120, -90)[0], lon: m(120, -90)[1], primary: true, globe: 'earth' }], pageprops: { wikibase_item: 'Q900003' }, extract: '架空駅は架空の駅である。' },
    ],
  },
};

const dot = m(5, -15);
const b = (v) => ({ type: 'uri', value: v });
const l = (v) => ({ type: 'literal', value: v });
const wikidata = {
  head: { vars: ['item', 'itemLabel', 'coord', 'typeLabel', 'heritageLabel', 'inception', 'prec', 'image', 'article'] },
  results: {
    bindings: [
      { item: b('http://www.wikidata.org/entity/Q900001'), itemLabel: l('テスト中央公園'), coord: l(`Point(${parkCenter[1]} ${parkCenter[0]})`), typeLabel: l('都市公園'), inception: l('1965-04-01T00:00:00Z'), prec: l('11'), article: b('https://ja.wikipedia.org/wiki/%E3%83%86%E3%82%B9%E3%83%88%E4%B8%AD%E5%A4%AE%E5%85%AC%E5%9C%92') },
      { item: b('http://www.wikidata.org/entity/Q900002'), itemLabel: l('旧街道道標'), coord: l(`Point(${dot[1]} ${dot[0]})`), typeLabel: l('道標'), heritageLabel: l('架空市指定文化財'), inception: l('1800-01-01T00:00:00Z'), prec: l('7') },
    ],
  },
};

const nominatim = { place_id: 1, lat: String(clat), lon: String(clng), display_name: '架空町, 架空区, 架空市, 架空県, 日本', address: { neighbourhood: '架空町', city_district: '架空区', city: '架空市', province: '架空県', country: '日本', country_code: 'jp' } };

const out = { note: 'テスト用の架空データ。実在の場所・団体とは関係ありません。', cellToken: c.token, cellDecimal: c.decimal, overpass, wikipedia, wikidata, nominatim };
fs.writeFileSync(path.join(__dirname, '../tests/fixtures/sample.json'), JSON.stringify(out, null, 1));
console.log('cell', c.token, c.decimal);
