// S2セルの指定・判定。計算そのものは vendor/s2/s2.bundle.js（s2js）に任せる。
(function (g) {
  const PSF = (g.PSF = g.PSF || {});
  const S2 = g.S2;

  const SEARCH_MIN_LEVEL = 14; // これより広いセルは公開サーバーへの負荷が大きいので検索しない
  const EDGE_MARGIN_M = 5; // 公開地図データの位置誤差を考え、境界からこの距離以内は「境界付近」とする

  function fromToken(token) {
    const t = token.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{1,16}$/.test(t)) return null;
    const id = S2.fromToken(t);
    return S2.valid(id) ? id : null;
  }

  function fromDecimal(s) {
    try {
      const id = BigInt(s);
      return id > 0n && id < 1n << 64n && S2.valid(id) ? id : null;
    } catch (e) {
      return null;
    }
  }

  // "3/0123..." 形式（面番号/四分木の数字列）
  function fromQuadKey(s) {
    const m = /^([0-5])\/([0-3]{0,30})$/.exec(s);
    if (!m) return null;
    const face = BigInt(m[1]);
    const digits = m[2];
    const L = digits.length;
    let pos = 0n;
    for (const d of digits) pos = (pos << 2n) | BigInt(d);
    const id = (face << 61n) | (L ? pos << BigInt(61 - 2 * L) : 0n) | (1n << BigInt(60 - 2 * L));
    return S2.valid(id) ? id : null;
  }

  function parseLatLng(text) {
    const t = text.trim();
    // 地図サービスのURL（@緯度,経度 / q=緯度,経度 / ll=緯度,経度）
    const url = /[@=](-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(t);
    const plain = /^\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,，、\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/.exec(t);
    const m = plain || url;
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
    return [lat, lng];
  }

  // 入力欄の文字列を解釈する。戻り値: {kind:'cell', id} | {kind:'point', lat, lng} | {kind:'error', message}
  function parseInput(raw) {
    const text = String(raw || '').trim().replace(/[　]/g, ' ');
    if (!text) return { kind: 'error', message: 'セルIDまたは緯度・経度を入力してください。' };
    const compact = text.replace(/\s+/g, '').replace(/^(token|s2|cell|セル)[:：]/i, '');
    if (/^[0-5]\/[0-3]*$/.test(compact)) {
      const id = fromQuadKey(compact);
      return id ? { kind: 'cell', id } : { kind: 'error', message: 'この形式（面番号/数字列）のセル指定を解釈できませんでした。' };
    }
    if (/^\d{17,20}$/.test(compact)) {
      const id = fromDecimal(compact);
      return id ? { kind: 'cell', id } : { kind: 'error', message: '数字のセルIDとして正しくありません。桁の抜けや余分な文字がないか確認してください。' };
    }
    if (/^(0x)?[0-9a-f]{1,16}$/i.test(compact) && !/^\d{1,3}$/.test(compact)) {
      const id = fromToken(compact);
      if (id) return { kind: 'cell', id };
    }
    const ll = parseLatLng(text);
    if (ll) return { kind: 'point', lat: ll[0], lng: ll[1] };
    return {
      kind: 'error',
      message: '入力を解釈できませんでした。セルID（例: 6018c3d5 や 6924438341328830464）か、緯度・経度（例: 35.6812, 139.7671）を入力してください。',
    };
  }

  function describe(id) {
    const level = S2.level(id);
    const vertices = S2.vertices(id);
    return {
      id,
      token: S2.toToken(id),
      decimal: id.toString(),
      level,
      vertices,
      center: S2.center(id),
      areaM2: S2.areaM2(id),
    };
  }

  function cellAt(lat, lng, level) {
    return S2.cellIdFromLatLng(lat, lng, level);
  }

  function tokenAt(lat, lng, level) {
    return S2.toToken(cellAt(lat, lng, level));
  }

  // 点がセル内か。境界から EDGE_MARGIN_M 以内は edge として区別する
  function classifyPoint(cell, lat, lng) {
    const inside = S2.cellIdFromLatLng(lat, lng, cell.level) === cell.id;
    const edgeDistM = PSF.geo.distToRingM([lat, lng], cell.vertices);
    let status = inside ? 'in' : 'out';
    if (edgeDistM <= EDGE_MARGIN_M) status = 'edge';
    return { status, inside, edgeDistM };
  }

  // 区域（公園など）とセルの関係
  function classifyArea(cell, ring, centroid) {
    const c = classifyPoint(cell, centroid[0], centroid[1]);
    if (c.inside) return { status: 'in', inside: true, edgeDistM: c.edgeDistM, partial: false };
    if (ring && PSF.geo.ringsOverlap(ring, cell.vertices)) return { status: 'partial', inside: false, edgeDistM: c.edgeDistM, partial: true };
    return { status: 'out', inside: false, edgeDistM: c.edgeDistM, partial: false };
  }

  function descendants(id, level) {
    let cur = [id];
    while (cur.length && S2.level(cur[0]) < level) {
      cur = cur.flatMap((c) => S2.children(c));
    }
    return cur;
  }

  function parentToken(id, level) {
    return S2.toToken(S2.parent(id, level));
  }

  function searchBounds(cell, marginM) {
    return PSF.geo.expandBounds(PSF.geo.bounds(cell.vertices), marginM);
  }

  PSF.cell = {
    SEARCH_MIN_LEVEL, EDGE_MARGIN_M,
    parseInput, describe, cellAt, tokenAt, classifyPoint, classifyArea, descendants, parentToken, searchBounds,
    fromToken, fromQuadKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
