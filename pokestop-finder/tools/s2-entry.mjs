// S2ライブラリ（s2js, Apache-2.0）から本アプリが使う関数だけを取り出すエントリ。
// `npm run build:s2` で vendor/s2/s2.bundle.js を生成する。
import { s2 } from 's2js';

const { cellid, LatLng, Cell } = s2;
const DEG = 180 / Math.PI;

export function cellIdFromLatLng(lat, lng, level) {
  return cellid.parent(cellid.fromLatLng(LatLng.fromDegrees(lat, lng)), level);
}

export function vertices(id) {
  const c = Cell.fromCellID(id);
  const out = [];
  for (let k = 0; k < 4; k++) {
    const ll = LatLng.fromPoint(c.vertex(k));
    out.push([ll.lat * DEG, ll.lng * DEG]);
  }
  return out;
}

export function center(id) {
  const ll = LatLng.fromPoint(Cell.fromCellID(id).center());
  return [ll.lat * DEG, ll.lng * DEG];
}

export function areaM2(id) {
  const R = 6371008.8;
  return Cell.fromCellID(id).exactArea() * R * R;
}

export const level = cellid.level;
export const valid = cellid.valid;
export const parent = cellid.parent;
export const children = cellid.children;
export const contains = cellid.contains;
export const toToken = cellid.toToken;
export const fromToken = cellid.fromToken;
export const face = cellid.face;
