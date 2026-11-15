/**
 * Google Apps Script（スプレッドシート周り）の最小限の模擬環境。
 * src/ の .gs をそのまま読み込んで、Node.js 上で処理を通して確認するためのもの。
 * 実際のGoogleスプレッドシートと同じく、'2026-12-01' や '2026-12' のような文字列は日付に自動変換する
 * （表示形式を「書式なしテキスト（@）」にしたセルは変換しない）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function autoConvert(v, fmt) {
  if (fmt === '@' || typeof v !== 'string') return v;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = v.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return v;
}

class Range {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr: nr || 1, nc: nc || 1 }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.nc; c++) {
        const v = src[this.col - 1 + c];
        line.push(v === undefined || v === null ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    if (values.length !== this.nr || values.some(function (r) { return r.length !== this.nc; }, this)) {
      throw new Error('setValues: 範囲のサイズと値の数が一致しません（' + this.nr + 'x' + this.nc + '）');
    }
    for (let r = 0; r < this.nr; r++) {
      const rowIdx = this.row - 1 + r;
      this.sheet.ensureRow(rowIdx);
      for (let c = 0; c < this.nc; c++) {
        const colIdx = this.col - 1 + c;
        this.sheet.data[rowIdx][colIdx] = autoConvert(values[r][c], this.sheet.fmt[colIdx + ':' + rowIdx]);
      }
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  clearContent() {
    for (let r = 0; r < this.nr; r++) {
      const row = this.sheet.data[this.row - 1 + r];
      if (!row) continue;
      for (let c = 0; c < this.nc; c++) row[this.col - 1 + c] = '';
    }
    return this;
  }
  setNumberFormat(f) {
    for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) this.sheet.fmt[(this.col - 1 + c) + ':' + (this.row - 1 + r)] = f;
    return this;
  }
  setFontWeight() { return this; }
}

class Sheet {
  constructor(name, data) { this.name = name; this.data = data || []; this.fmt = {}; }
  ensureRow(i) { while (this.data.length <= i) this.data.push([]); }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) {
      if ((this.data[r] || []).some(function (v) { return v !== '' && v !== null && v !== undefined; })) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.data.forEach(function (row) {
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c] !== '' && row[c] !== null && row[c] !== undefined) { if (c + 1 > max) max = c + 1; break; }
      }
    });
    return max;
  }
  getRange(row, col, nr, nc) { return new Range(this, row, col, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(values) {
    const idx = this.getLastRow();
    this.ensureRow(idx);
    this.data[idx] = values.map((v, c) => autoConvert(v, this.fmt[c + ':' + idx]));
    return this;
  }
  deleteRow(rowIndex) { this.data.splice(rowIndex - 1, 1); }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
}

let idSeq = 0;
class Spreadsheet {
  constructor(name) { this.name = name; this.sheets = [new Sheet('シート1')]; this.id = 'SS-' + (++idSeq); }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find(function (s) { return s.name === n; }) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter(function (x) { return x !== s; }); }
}

function formatDate(date, tz, fmt) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return fmt.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
    .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
}

function createEnv(options) {
  options = options || {};
  const registry = {};
  const props = {};
  const triggers = [];
  const logs = [];
  const mails = [];
  const state = { email: options.email || 'admin@example.com' };

  const SpreadsheetApp = {
    create: function (name) { const ss = new Spreadsheet(name); registry[ss.id] = ss; return ss; },
    openById: function (id) { if (!registry[id]) throw new Error('スプレッドシートが見つかりません: ' + id); return registry[id]; },
    openByUrl: function (url) {
      const m = String(url).match(/\/d\/([^/]+)/);
      return SpreadsheetApp.openById(m ? m[1] : url);
    },
    getActiveSpreadsheet: function () { return null; },
    register: function (ss) { registry[ss.id] = ss; return ss; }
  };
  const ctx = {
    console: console,
    SpreadsheetApp: SpreadsheetApp,
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { props[k] = v; } }; } },
    Utilities: {
      formatDate: formatDate,
      getUuid: function () { return crypto.randomUUID(); },
      formatString: function (f, n) { const m = f.match(/%0(\d+)d/); return m ? String(n).padStart(Number(m[1]), '0') : String(n); }
    },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {}, tryLock: function () { return true; } }; } },
    ScriptApp: {
      getProjectTriggers: function () { return triggers.slice(); },
      deleteTrigger: function (t) { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: function (fn) {
        const b = { timeBased: function () { return b; }, after: function () { return b; }, everyDays: function () { return b; }, atHour: function () { return b; },
          forForm: function () { return b; }, onFormSubmit: function () { return b; }, nearMinute: function () { return b; },
          create: function () { const t = { getHandlerFunction: function () { return fn; } }; triggers.push(t); return t; } };
        return b;
      }
    },
    Session: { getActiveUser: function () { return { getEmail: function () { return state.email; } }; } },
    Logger: { log: function (m) { logs.push(String(m)); } },
    MailApp: { sendEmail: function (o) { mails.push(o); } },
    GmailApp: { sendEmail: function (to, subject, body) { mails.push({ to: to, subject: subject, body: body }); } },
    HtmlService: {}
  };
  vm.createContext(ctx);
  const srcDir = path.join(__dirname, '..', 'src');
  const files = [];
  (function walk(dir) {
    fs.readdirSync(dir).sort().forEach(function (f) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.gs')) files.push(p);
    });
  })(srcDir);
  // SHEET_NAMES等の定数を持つファイルを先に読み込む（Apps Scriptでもこの順で作成する想定）
  const first = ['repository/sheetUtil.gs', 'util/errors.gs'].map(function (f) { return path.join(srcDir, f); });
  first.concat(files.filter(function (f) { return first.indexOf(f) === -1; })).forEach(function (f) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.relative(srcDir, f) });
  });
  return { ctx: ctx, registry: registry, props: props, triggers: triggers, logs: logs, mails: mails, state: state,
    Spreadsheet: Spreadsheet, Sheet: Sheet };
}

module.exports = { createEnv: createEnv };
