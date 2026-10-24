// 本物の Index.html + Javascript.html をブラウザで動かし、google.script.run を Node 上の Code.gs へつなぐ。
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Playwright（画面を動かす部品）は、画面を使う試験のときだけ読み込む（サーバーだけの試験は Playwright が無くても動くように）。
function loadChromium() {
  try { return require('playwright').chromium; } catch (e) {
    throw new Error('Playwright が見つかりません（画面を使う試験には Playwright と Chromium が必要です）: ' + e.message);
  }
}
// Chromium の場所：環境変数 CHROMIUM_PATH があればそれ、この作業環境の決まった場所にあればそれ、無ければ Playwright の既定。
function chromiumLaunchOptions() {
  const p = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (process.env.CHROMIUM_PATH && !fs.existsSync(p)) throw new Error('CHROMIUM_PATH の Chromium が見つかりません: ' + p);
  return fs.existsSync(p) ? { executablePath: p } : {};
}

const APP = process.env.APP_DIR || path.join(__dirname, '..', '..', 'reservation-dashboard-gas') + path.sep;

function createBackend() {
  class FakeRange {
    constructor(sheet, row, col, numRows, numCols) { this.sheet=sheet; this.row=row; this.col=col; this.numRows=numRows||1; this.numCols=numCols||1; }
    getValues() { const out=[]; for (let r=0;r<this.numRows;r++){ const rowArr=[]; for(let c=0;c<this.numCols;c++){ const ar=this.row+r-1, ac=this.col+c-1; rowArr.push((this.sheet.data[ar]&&this.sheet.data[ar][ac]!==undefined)?this.sheet.data[ar][ac]:''); } out.push(rowArr);} return out; }
    setValues(values) { for(let r=0;r<values.length;r++){ const ar=this.row+r-1; if(!this.sheet.data[ar])this.sheet.data[ar]=[]; for(let c=0;c<values[r].length;c++){ this.sheet.data[ar][this.col-1+c]=values[r][c]; } } return this; }
    setValue(v){ return this.setValues([[v]]); }
    setNumberFormat(){ return this; } setNumberFormats(){ return this; }
    setFontWeight(){ return this; } setBackground(){ return this; } setFontColor(){ return this; } setDataValidation(){ return this; }
    clearContent(){ for(let r=0;r<this.numRows;r++){ const ar=this.row+r-1; if(this.sheet.data[ar]){ for(let c=0;c<this.numCols;c++){ this.sheet.data[ar][this.col-1+c]=''; } } } return this; }
  }
  class FakeSheet {
    constructor(n){ this.name=n; this.data=[]; this.maxRows=1000; this.maxCols=40; }
    getRange(r,c,nr,nc){ return new FakeRange(this,r,c,nr,nc); }
    getLastRow(){ for (let r=Math.min(this.data.length,this.maxRows)-1;r>=0;r--){ const row=this.data[r]; if(row && row.some(v=>v!==''&&v!==null&&v!==undefined)) return r+1; } return 0; }
    getLastColumn(){ return 40; } getName(){ return this.name; }
    getMaxRows(){ return this.maxRows; } getMaxColumns(){ return this.maxCols; }
    insertRowsAfter(a,n){ this.maxRows+=n; }
    deleteRows(s,n){ this.data.splice(s-1,n); this.maxRows-=n; } deleteRow(r){ this.deleteRows(r,1); }
    setFrozenRows(){ return this; } setTabColor(){ return this; } setColumnWidth(){ return this; } hideColumns(){ return this; }
  }
  const sheets = {};
  const ss = { getSheetByName(n){ return sheets[n]||null; }, insertSheet(n){ return sheets[n]=new FakeSheet(n); }, getSheets(){ return Object.values(sheets); }, getUrl(){ return '#'; }, getId(){ return 'main'; } };
  const docProps = {};
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet(){ return ss; }, flush(){}, openById(){ throw new Error('nf'); },
      newDataValidation(){ const b={ requireValueInList(){return b;}, setAllowInvalid(){return b;}, build(){return {};} }; return b; } },
    Utilities: { parseCsv(t){ return t.split(/\r?\n/).filter(Boolean).map(l=>l.split(',')); },
      formatDate(d, tz, fmt){ const p=n=>String(n).padStart(2,'0'); const b=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); return fmt==='yyyy-MM-dd'?b:b+' 00:00'; } },
    Session: { getActiveUser(){ return { getEmail(){ return 'master@example.com'; } }; } },
    PropertiesService: { getDocumentProperties(){ return { getProperty(k){ return k in docProps ? docProps[k] : null; }, setProperty(k,v){ docProps[k]=v; }, deleteProperty(k){ delete docProps[k]; } }; } },
    LockService: { getScriptLock(){ return { tryLock(){ return true; }, releaseLock(){} }; } },
    HtmlService: {}
  };
  require(__dirname + '/../gas_mock_extra.js')(sandbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(APP+'Code.gs','utf8'), sandbox, {filename:'Code.gs'});
  vm.runInContext(fs.readFileSync(APP+'InitSheet.gs','utf8'), sandbox, {filename:'InitSheet.gs'});
  sandbox.runInitialSetup();
  const SDate = vm.runInContext('Date', sandbox);
  return { sandbox, sheets, SDate };
}

function buildPage(outPath) {
  let html = fs.readFileSync(APP+'Index.html','utf8');
  const js = fs.readFileSync(APP+'Javascript.html','utf8');
  html = html.replace("<?!= include('Javascript'); ?>", js);
  // 外部CDNは使えないため、Tailwind（表示切替に必要な最小限のクラス）とChart.jsを簡易な代用品に差し替える。
  html = html.replace('<script src="https://cdn.tailwindcss.com"></script>',
    '<style>.hidden{display:none !important}.flex{display:flex}.fixed{position:fixed}</style>');
  html = html.replace(/<link rel="stylesheet" href="https:\/\/[^>]+>/g, '');
  html = html.replace(/<script defer id="chartjs-lib" src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@4\.4\.1\/dist\/chart\.umd\.js"[^>]*><\/script>/,
    '<script>window.Chart = function (ctx, cfg) { this.config = cfg; window.__chartCount = (window.__chartCount||0)+1; }; window.Chart.prototype.destroy = function () {}; window.Chart.prototype.update = function () {};</script>');
  fs.writeFileSync(outPath, html);
}

async function launch(backend, htmlPath) {
  const browser = await loadChromium().launch(chromiumLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.__calls = [];
  await page.exposeFunction('__gasCall', (name, argsJson) => {
    const args = JSON.parse(argsJson);
    page.__calls.push(name);
    try {
      const v = backend.sandbox[name].apply(null, args);
      return { ok: true, value: v === undefined ? null : JSON.parse(JSON.stringify(v)) };
    } catch (e) { return { ok: false, message: e.message }; }
  });
  await page.addInitScript(() => {
    function runner(succ, fail) {
      return new Proxy({}, { get(_, prop) {
        if (prop === 'withSuccessHandler') return fn => runner(fn, fail);
        if (prop === 'withFailureHandler') return fn => runner(succ, fn);
        return (...args) => { window.__gasCall(prop, JSON.stringify(args)).then(r => {
          if (r.ok) { if (succ) succ(r.value); } else if (fail) fail(new Error(r.message));
        }); };
      } });
    }
    window.google = { script: { run: runner(null, null) } };
  });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.goto('file://' + htmlPath);
  return { browser, page };
}

module.exports = { createBackend, buildPage, launch, loadChromium, chromiumLaunchOptions };
