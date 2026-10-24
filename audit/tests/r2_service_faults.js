// 第2巡目：故障注入（Googleの部品側）。キャッシュ（CacheService）の保存・読み出しの失敗、保存済みの写しの破損・一部欠落、
// 大きすぎる値の保存拒否が起きても、画面に返すデータが正しい（シートの内容どおり）ことを確かめる。
const zlib = require('zlib');
const { createBackend } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
function setup(nRows) {
  const be = createBackend(); const S = be.sandbox, N = S.ALL_COLUMNS.length;
  be.sheets[S.SHEET_NAME].maxRows = 100000;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 1, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限']]);
  const rows = [];
  for (let i = 0; i < nRows; i++) rows.push(S.ALL_COLUMNS.map(c => c.key === 'reservationNo' ? 'R' + i : c.key === 'area' ? '東' : c.key === 'memo' ? 'メモ' + i + 'x'.repeat(i % 50) : c.key === 'departureDate' ? new be.SDate(2027, i % 12, 1 + i % 28) : c.key === 'salesAmount' ? i * 7 : ''));
  be.sheets[S.SHEET_NAME].getRange(2, 1, rows.length, N).setValues(rows);
  return { be, S };
}
const decode = res => { if (res.rows) return res.rows; const p = JSON.parse(zlib.gunzipSync(Buffer.from(res.packedRows, 'base64')).toString('utf8')); const out = []; for (let i = 0; i < p.n; i++) { const r = {}; p.k.forEach((k, ci) => { const c = p.c[ci]; r[k] = c.d ? c.d[c.i[i]] : c.v[i]; }); out.push(r); } return out; };
const view = S => JSON.stringify(decode(S.getBootstrapData({ mode: 'all', packing: 'gzip' })).map(r => [r.rowIndex, r.reservationNo, r.memo, r.salesAmount, r.departureDate]));
for (const n of [50, 6000]) {
  const truth = (() => { const { S } = setup(n); return view(S); })();
  // 1. キャッシュの保存がすべて失敗する
  { const { S } = setup(n); const c = S.CacheService.getScriptCache(); S.CacheService = { getScriptCache: () => Object.assign({}, c, { put() { throw new Error('Service invoked too many times'); }, putAll() { throw new Error('Service invoked too many times'); } }) };
    let ok = true, v; try { v = view(S); } catch (e) { ok = false; console.log('  ', e.message); }
    assert(ok && v === truth, n + '行：キャッシュの保存が失敗しても正しいデータを返す'); }
  // 2. キャッシュの読み出しが失敗する
  { const { S } = setup(n); view(S); const c = S.CacheService.getScriptCache(); S.CacheService = { getScriptCache: () => Object.assign({}, c, { get() { throw new Error('Cache unavailable'); }, getAll() { throw new Error('Cache unavailable'); } }) };
    let ok = true, v; try { v = view(S); } catch (e) { ok = false; console.log('  ', e.message); }
    assert(ok && v === truth, n + '行：キャッシュの読み出しが失敗しても正しいデータを返す'); }
  // 3. 保存済みの写しの一部（分割した断片の1つ）が消えている（有効期限・容量超過で一部だけ追い出された状態）
  for (const mode of ['delete', 'corrupt', 'truncate']) {
    // 断片を1つずつ壊して、そのたびに確かめる（写しの断片・応答の断片・目次のどれが壊れても正しく返すか）
    const probe = setup(n); view(probe.S); const keys = Array.from(probe.S.__cacheStore.keys()).sort();
    let bad = 0, firstBad = '';
    let tried = 0;
    for (let ki = 0; ki < keys.length; ki++) {
      const { S } = setup(n); view(S);
      const own = Array.from(S.__cacheStore.keys()).sort(); const key = own[ki]; // 各回の環境自身のキー（版番号が毎回違うため）
      const v0 = S.__cacheStore.get(key); if (v0 === undefined) continue; tried++;
      if (mode === 'delete') S.__cacheStore.delete(key);
      else if (mode === 'corrupt') { const p = Math.min(40, v0.length - 1); S.__cacheStore.set(key, v0.slice(0, p) + (v0[p] === 'A' ? 'B' : 'A') + v0.slice(p + 1)); }
      else S.__cacheStore.set(key, v0.slice(0, Math.floor(v0.length / 2)));
      let ok = true, v; try { v = view(S); } catch (e) { ok = false; firstBad = firstBad || (key.replace(/:[^:]+-[^:]+:/, ':…:') + ' → 例外: ' + e.message.slice(0, 60)); }
      if (!ok || v !== truth) { bad++; if (ok) firstBad = firstBad || (key.replace(/:[^:]+-[^:]+:/, ':…:') + ' → 違うデータ'); }
    }
    assert(bad === 0, n + '行：キャッシュの断片（全 ' + keys.length + ' 件を1つずつ）が ' + ({ delete: '消えている', corrupt: '1文字壊れている', truncate: '途中で切れている' })[mode] + ' 場合も正しいデータを返す（失敗 ' + bad + '）' + (firstBad ? ' 例: ' + firstBad : ''));
  }
}
console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
