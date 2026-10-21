// 位置計算の小さな道具。セル程度（数km以下）の範囲を前提に、局所的な平面近似を使う。
(function (g) {
  const PSF = (g.PSF = g.PSF || {});
  const R = 6371008.8;
  const RAD = Math.PI / 180;

  function distanceM(a, b) {
    const dLat = (b[0] - a[0]) * RAD;
    const dLng = (b[1] - a[1]) * RAD;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // 基準点まわりのメートル座標 [x(東), y(北)] に変換する
  function toLocal(origin, p) {
    return [(p[1] - origin[1]) * RAD * R * Math.cos(origin[0] * RAD), (p[0] - origin[0]) * RAD * R];
  }

  function pointSegmentDistM(p, a, b) {
    const A = toLocal(p, a);
    const B = toLocal(p, b);
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 ? -(A[0] * dx + A[1] * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(A[0] + t * dx, A[1] + t * dy);
  }

  // ring: [[lat,lng],...]（閉じていなくてもよい）
  function distToRingM(p, ring) {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      best = Math.min(best, pointSegmentDistM(p, ring[i], ring[(i + 1) % ring.length]));
    }
    return best;
  }

  function pointInRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function segmentsCross(a, b, c, d) {
    const o = (p, q, r) => (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }

  function ringsOverlap(r1, r2) {
    if (r1.some((p) => pointInRing(p, r2)) || r2.some((p) => pointInRing(p, r1))) return true;
    for (let i = 0; i < r1.length; i++) {
      for (let j = 0; j < r2.length; j++) {
        if (segmentsCross(r1[i], r1[(i + 1) % r1.length], r2[j], r2[(j + 1) % r2.length])) return true;
      }
    }
    return false;
  }

  function bounds(points) {
    let s = 90, w = 180, n = -90, e = -180;
    for (const p of points) {
      s = Math.min(s, p[0]); n = Math.max(n, p[0]);
      w = Math.min(w, p[1]); e = Math.max(e, p[1]);
    }
    return { s, w, n, e };
  }

  function expandBounds(b, meters) {
    const dLat = meters / (R * RAD);
    const dLng = meters / (R * RAD * Math.cos(((b.s + b.n) / 2) * RAD));
    return { s: b.s - dLat, w: b.w - dLng, n: b.n + dLat, e: b.e + dLng };
  }

  // 面積重心。退化した図形は頂点の平均で代用する
  function ringCentroid(ring) {
    const o = ring[0];
    let a = 0, cx = 0, cy = 0;
    const pts = ring.map((p) => toLocal(o, p));
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      const f = x1 * y2 - x2 * y1;
      a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
    }
    if (Math.abs(a) < 1e-9) {
      const lat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      const lng = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      return [lat, lng];
    }
    cx /= 3 * a; cy /= 3 * a;
    return [o[0] + cy / (R * RAD), o[1] + cx / (R * RAD * Math.cos(o[0] * RAD))];
  }

  function ringDiagonalM(ring) {
    const b = bounds(ring);
    return distanceM([b.s, b.w], [b.n, b.e]);
  }

  PSF.geo = { distanceM, toLocal, pointSegmentDistM, distToRingM, pointInRing, ringsOverlap, bounds, expandBounds, ringCentroid, ringDiagonalM };
})(typeof window !== 'undefined' ? window : globalThis);
