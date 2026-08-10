// Apps Script 実行環境の簡易モック。Code.gs を実際に動かして挙動を検証するためのもの。
const fs = require('fs');
const vm = require('vm');

function pad(n, w) { return String(n).padStart(w, '0'); }

class Range {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet; this.row = row; this.col = col;
    this.numRows = numRows === undefined ? 1 : numRows;
    this.numCols = numCols === undefined ? 1 : numCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      for (let c = 0; c < this.numCols; c++) row.push(this.sheet._get(this.row + r, this.col + c));
      out.push(row);
    }
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.numRows) throw new Error(`setValues row mismatch: got ${vals.length} want ${this.numRows}`);
    for (let r = 0; r < this.numRows; r++) {
      if (vals[r].length !== this.numCols) throw new Error(`setValues col mismatch: got ${vals[r].length} want ${this.numCols}`);
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, vals[r][c]);
    }
    return this;
  }
  getValue() { return this.sheet._get(this.row, this.col); }
  setValue(v) {
    if (this.row < 1 || this.col < 1) throw new Error(`getRange out of bounds: row=${this.row} col=${this.col}`);
    this.sheet._set(this.row, this.col, v); return this;
  }
  sort(spec) {
    const abs = spec.column, asc = spec.ascending !== false;
    const rows = this.getValues();
    const key = abs - this.col;
    rows.sort((a, b) => {
      const x = a[key], y = b[key];
      const xs = x instanceof Date ? x.getTime() : (x === '' || x === null || x === undefined ? Infinity : x);
      const ys = y instanceof Date ? y.getTime() : (y === '' || y === null || y === undefined ? Infinity : y);
      if (xs < ys) return asc ? -1 : 1;
      if (xs > ys) return asc ? 1 : -1;
      return 0;
    });
    this.setValues(rows);
    return this;
  }
  setBackground() { return this; } setFontColor() { return this; } setFontWeight() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  _get(r, c) {
    if (r < 1 || c < 1) throw new Error(`getRange out of bounds: row=${r} col=${c}`);
    const row = this.data[r - 1]; if (!row) return '';
    const v = row[c - 1]; return v === undefined ? '' : v;
  }
  _set(r, c, v) {
    if (r < 1 || c < 1) throw new Error(`getRange out of bounds: row=${r} col=${c}`);
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  }
  _nonEmpty(v) { return !(v === '' || v === null || v === undefined); }
  getLastRow() {
    let last = 0;
    for (let r = 0; r < this.data.length; r++) if ((this.data[r] || []).some(v => this._nonEmpty(v))) last = r + 1;
    return last;
  }
  getLastColumn() {
    let last = 0;
    for (const row of this.data) for (let c = 0; c < (row || []).length; c++) if (this._nonEmpty(row[c]) && c + 1 > last) last = c + 1;
    return last;
  }
  getRange(r, c, nr, nc) {
    if (r < 1 || c < 1) throw new Error(`getRange out of bounds: row=${r} col=${c}`);
    if (nr !== undefined && nr < 1) throw new Error(`getRange numRows must be >= 1 (got ${nr})`);
    if (nc !== undefined && nc < 1) throw new Error(`getRange numCols must be >= 1 (got ${nc})`);
    return new Range(this, r, c, nr, nc);
  }
  appendRow(arr) { const r = this.getLastRow() + 1; arr.forEach((v, i) => this._set(r, i + 1, v)); }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  setFrozenRows() {}
  getName() { return this.name; }
}

class Spreadsheet {
  constructor() { this.sheets = {}; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { this.sheets[n] = new Sheet(n); return this.sheets[n]; }
}

function makeContext() {
  const ss = new Spreadsheet();
  const sentMail = [];
  const cache = {};
  let uuid = 0;
  // vm コンテキスト生成後に「vm内のDateを作る関数」が入る（下の __newDate と同じもの）。
  // Utilities.parseDate から参照するため、先に宣言だけしておく。
  let mkDate = (y, m, d) => new Date(y, m, d);
  const ctx = {
    __ss: ss, __mail: sentMail, console,
    SpreadsheetApp: { openById: () => ss, getUi: () => ({ alert: () => {} }) },
    Utilities: {
      getUuid: () => `uuid-${++uuid}`,
      formatDate: (d, tz, fmt) => {
        const Y = d.getFullYear(), M = pad(d.getMonth() + 1, 2), D = pad(d.getDate(), 2);
        const h = pad(d.getHours(), 2), m = pad(d.getMinutes(), 2), s = pad(d.getSeconds(), 2);
        return fmt.replace('yyyy', Y).replace('MM', M).replace('dd', D)
                  .replace('HH', h).replace('mm', m).replace('ss', s);
      },
      // ★重要：実GASの Utilities.parseDate は本物の Date を返し、Code.gs 側の
      // `val instanceof Date` を通る。ここで Node 側の new Date を返すと
      // vm が別realmのため instanceof が false になり、
      // 「日付を保存 → 日付として読み直す」経路（当日表・アーカイブ・各アラート）が
      // 実際には壊れていてもテストが素通りしてしまう。必ず vm 内の Date を作る。
      parseDate: (str) => {
        const [y, mo, d] = str.split('-').map(Number);
        return mkDate(y, mo - 1, d);
      }
    },
    CacheService: { getScriptCache: () => ({
      put: (k, v) => { cache[k] = v; }, get: (k) => (k in cache ? cache[k] : null), remove: (k) => { delete cache[k]; }
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    MailApp: { sendEmail: (to, subj, body) => sentMail.push({ to, subj, body }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'tanaka@his-world.com' }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {},
      newTrigger: (fnName) => {
        const created = () => ({ getUniqueId: () => `trg-${fnName}`, getHandlerFunction: () => fnName });
        return {
          timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: created }) }) }),
          forSpreadsheet: () => ({ onFormSubmit: () => ({ create: created }) })
        };
      } },
    HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ addMetaTag: () => ({ setXFrameOptionsMode: () => ({}) }) }) }) }),
      createHtmlOutputFromFile: () => ({ getContent: () => '' }), XFrameOptionsMode: { ALLOWALL: 1 } }
  };
  vm.createContext(ctx);
  let src = fs.readFileSync('/home/user/pw-26-shindantest/photowed-portal-gas/Code.gs', 'utf8');
  src = src.replace("const SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE';", "const SPREADSHEET_ID = 'TEST_ID';");
  // top-level const は vm のグローバルには露出しないので、テストから参照したいものを明示的に公開する
  src += `
;(function () {
  const names = ['RESERVATION_HEADERS','HISTORY_HEADERS','BRANCH_MASTER_HEADERS','STATUS_LOG_HEADERS',
                 'MASTER_ITEM_HEADERS','STATUS_CODES','BILLING_REGIONS','JP_TEAMS',
                 'ALERT_DAYS_BEFORE','DELIVERY_ALERT_DEFAULT_DAYS','COMMITTABLE_FIELDS',
                 'PHRASE_MASTER_HEADERS','UNANSWERED_REMIND_DEFAULT_DAYS'];
  const vals = [RESERVATION_HEADERS,HISTORY_HEADERS,BRANCH_MASTER_HEADERS,STATUS_LOG_HEADERS,
                MASTER_ITEM_HEADERS,STATUS_CODES,BILLING_REGIONS,JP_TEAMS,
                ALERT_DAYS_BEFORE,DELIVERY_ALERT_DEFAULT_DAYS,COMMITTABLE_FIELDS,
                PHRASE_MASTER_HEADERS,UNANSWERED_REMIND_DEFAULT_DAYS];
  names.forEach((n, i) => { this[n] = vals[i]; });
}).call(this);`;
  vm.runInContext(src, ctx);
  // vm は別realmなので、Node側で作った Date は `instanceof Date` が false になる。
  // シートに入れる日付は必ずこのファクトリ経由で「vm内のDate」を作る。
  ctx.__newDate = vm.runInContext('(function (y, m, d) { return new Date(y, m, d); })', ctx);
  mkDate = ctx.__newDate; // Utilities.parseDate も vm 内の Date を返すようにする
  ctx.__daysFromToday = vm.runInContext(
    '(function (n) { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); })', ctx);
  return ctx;
}

module.exports = { makeContext };
