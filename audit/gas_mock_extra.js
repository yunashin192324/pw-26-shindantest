// 既存テストの模擬環境に、高速化で使う Google Apps Script の機能を追加する共通部品。
// CacheService（1件100KBの上限を本物と同じく検査）、Utilities.gzip/ungzip/newBlob/base64、
// Session.getScriptTimeZone、LockService.getDocumentLock、SpreadsheetApp.flush。
const zlib = require('zlib');
module.exports = function extend(sandbox, opts) {
  opts = opts || {};
  const store = new Map();
  const stats = { gets: 0, puts: 0, hits: 0 };
  const CacheService = {
    getScriptCache() {
      return {
        get(k) { stats.gets++; const v = store.get(k); if (v !== undefined) stats.hits++; return v === undefined ? null : v; },
        getAll(keys) { stats.gets++; const o = {}; keys.forEach(k => { if (store.has(k)) o[k] = store.get(k); }); return o; },
        put(k, v) { if (opts.cacheDisabled) throw new Error('cache disabled'); if (String(v).length > 100 * 1024) throw new Error('Argument too large: value'); if (k.length > 250) throw new Error('key too long'); stats.puts++; store.set(k, String(v)); },
        putAll(o) { Object.keys(o).forEach(k => this.put(k, o[k])); },
        remove(k) { store.delete(k); }
      };
    }
  };
  const U = sandbox.Utilities || {};
  class FakeBlob {
    constructor(data, type) { this.buf = Buffer.isBuffer(data) ? data : (Array.isArray(data) ? Buffer.from(data.map(b => b & 0xff)) : Buffer.from(String(data), 'utf8')); this.type = type; }
    getBytes() { return Array.from(this.buf).map(b => (b > 127 ? b - 256 : b)); }
    getDataAsString() { return this.buf.toString('utf8'); }
  }
  const Utilities = Object.assign({}, U, {
    newBlob(data, type) { return new FakeBlob(data, type); },
    gzip(blob) { return new FakeBlob(zlib.gzipSync(blob.buf), 'application/x-gzip'); },
    ungzip(blob) { return new FakeBlob(zlib.gunzipSync(blob.buf)); },
    base64Encode(bytes) { return Buffer.from(bytes.map(b => b & 0xff)).toString('base64'); },
    base64Decode(s) { return Array.from(Buffer.from(s, 'base64')).map(b => (b > 127 ? b - 256 : b)); }
  });
  const S0 = sandbox.Session || {};
  const Session = Object.assign({}, S0, { getScriptTimeZone() { return opts.scriptTimeZone || 'Asia/Tokyo'; } });
  // デプロイした人（実行者）。既定では「今の利用者＝デプロイした本人」とみなす（sandbox.__deployerEmail で変更できる）。
  Session.getEffectiveUser = function () { return { getEmail() { return sandbox.__deployerEmail !== undefined ? sandbox.__deployerEmail : sandbox.Session.getActiveUser().getEmail(); } }; };
  const L0 = sandbox.LockService || { getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; } };
  const LockService = Object.assign({}, L0, { getDocumentLock() { return { tryLock() { return true; }, releaseLock() {} }; } });
  if (sandbox.SpreadsheetApp && !sandbox.SpreadsheetApp.flush) sandbox.SpreadsheetApp.flush = function () {};
  // 本物のスプレッドシートと同じく、先頭の ' は「文字として保存する」印として取り除いて保存する。
  // また、' の付いていない「=」で始まる文字は数式になってしまうことを記録する（数式化の検出用）。
  const formulaWrites = [];
  const strip = v => (typeof v === 'string' && v.charAt(0) === "'") ? v.slice(1) : (typeof v === 'string' && v.charAt(0) === '=' ? (formulaWrites.push(v), v) : v);
  const wrapRange = r => { if (!r || r.__wrapped) return r; r.__wrapped = true;
    if (typeof r.getValue !== 'function' && typeof r.getValues === 'function') r.getValue = function () { return r.getValues()[0][0]; };
    if (typeof r.setValues === 'function') { const o = r.setValues; r.setValues = function (vals) { return o.call(r, vals.map(row => row.map(strip))); }; }
    if (typeof r.setValue === 'function') { const o1 = r.setValue; r.setValue = function (v) { return o1.call(r, strip(v)); }; }
    return r; };
  const wrapSheet = sh => { if (!sh || sh.__wrapped) return sh; sh.__wrapped = true; const g = sh.getRange; sh.getRange = function () { return wrapRange(g.apply(sh, arguments)); }; return sh; };
  const wrapSs = ss => { if (!ss || ss.__wrapped) return ss; ss.__wrapped = true;
    ['getSheetByName', 'insertSheet'].forEach(k => { if (typeof ss[k] === 'function') { const o = ss[k]; ss[k] = function () { return wrapSheet(o.apply(ss, arguments)); }; } });
    if (typeof ss.getSheets === 'function') { const o = ss.getSheets; ss.getSheets = function () { return o.apply(ss, arguments).map(wrapSheet); }; }
    return ss; };
  if (sandbox.SpreadsheetApp && !opts.noApostropheEmulation) {
    const SA = sandbox.SpreadsheetApp;
    ['getActiveSpreadsheet', 'openById', 'create'].forEach(k => { if (typeof SA[k] === 'function') { const o = SA[k]; SA[k] = function () { return wrapSs(o.apply(SA, arguments)); }; } });
  }
  sandbox.__formulaWrites = formulaWrites;
  const triggers = [];
  if (!opts.noScriptApp && !sandbox.ScriptApp) {
    sandbox.ScriptApp = {
      EventType: { ON_CHANGE: 'ON_CHANGE' },
      getProjectTriggers() { return triggers.slice(); },
      newTrigger(fn) { return { forSpreadsheet() { return { onChange() { return { create() { const t = { getHandlerFunction() { return fn; }, getEventType() { return 'ON_CHANGE'; } }; triggers.push(t); return t; } }; } }; } }; }
    };
  }
  sandbox.__triggers = triggers;
  sandbox.CacheService = CacheService;
  sandbox.Utilities = Utilities;
  sandbox.Session = Session;
  sandbox.LockService = LockService;
  sandbox.__cacheStore = store;
  sandbox.__cacheStats = stats;
  return sandbox;
};
