// WEDLINK モックアップ共通ビルドコア
// 実物の Code.gs / Stylesheet.html / JavaScript.html をそのまま束ね、GAS固有API
// （SpreadsheetApp等）だけをブラウザ内で動く簡易モックに差し替えた <script> 群一式と、
// ダミーデータ投入済みの状態でブラウザだけで動く仕組みを作る。PC用（フルHTML）と
// スマホ用（Artifact向けbodyフラグメント）の両方から共通で使う。
//
// ★このファイルはリポジトリ本体（tools/mockup/）に置いてあるため、どのセッション・
//   どのクローン先からでも `node tools/mockup/build_offline_mockup.js` で動く
//   （以前はセッションのscratchpadだけに存在し、セッションが変わると消えていた）。
const fs = require('fs');
const path = require('path');

// tools/mockup/ から2つ上がリポジトリ直下（Code.gs等がある場所）
const REPO = path.join(__dirname, '..', '..');

function readSource() {
  let codeGs = fs.readFileSync(path.join(REPO, 'Code.gs'), 'utf8');
  codeGs = codeGs.replace(
    "const SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE';",
    "const SPREADSHEET_ID = 'DEMO_OFFLINE_MOCKUP';"
  );
  const indexHtml = fs.readFileSync(path.join(REPO, 'Index.html'), 'utf8');
  const stylesheetHtml = fs.readFileSync(path.join(REPO, 'Stylesheet.html'), 'utf8');
  const javascriptHtml = fs.readFileSync(path.join(REPO, 'JavaScript.html'), 'utf8');
  return { codeGs, indexHtml, stylesheetHtml, javascriptHtml };
}

// Index.html の <body>...</body> の中身だけを取り出す（JSの<?!= include ?>は除去）
function extractBodyInner(indexHtml) {
  const bodyMatch = indexHtml.match(/<body>([\s\S]*)<\/body>/);
  if (!bodyMatch) throw new Error('Index.html の <body> が見つかりません');
  return bodyMatch[1].replace("<?!= include('JavaScript'); ?>", '');
}

function apiNamesOf(codeGs) {
  return [...codeGs.matchAll(/^function (api[A-Za-z]*)\(/gm)].map(m => m[1]);
}

// ブロック1〜5（GASモック／Code.gs／ブリッジ／ダミーデータ／JavaScript.html）を1つの文字列にして返す。
// bodyInner（Index.htmlの中身）はPC/スマホどちらも呼び出し側でそのまま使う。
function buildScripts({ codeGs, javascriptHtml, apiNames }) {
  return `
<script>
// =====================================================
// 1. GAS固有APIの簡易モック（ブラウザだけで完結させるため）
// =====================================================
(function () {
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
      for (let r = 0; r < this.numRows; r++) {
        for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, (vals[r] || [])[c]);
      }
      return this;
    }
    getValue() { return this.sheet._get(this.row, this.col); }
    setValue(v) { this.sheet._set(this.row, this.col, v); return this; }
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
      const row = this.data[r - 1]; if (!row) return '';
      const v = row[c - 1]; return v === undefined ? '' : v;
    }
    _set(r, c, v) {
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
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
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

  const ss = new Spreadsheet();
  const sentMail = [];
  const cache = {};
  let uuid = 0;

  window.__DEMO__ = { ss, sentMail };

  window.SpreadsheetApp = { openById: () => ss, getUi: () => ({ alert: (msg) => window.alert(msg) }) };
  window.Utilities = {
    getUuid: () => 'uuid-' + (++uuid),
    formatDate: (d, tz, fmt) => {
      const Y = d.getFullYear(), M = pad(d.getMonth() + 1, 2), D = pad(d.getDate(), 2);
      const h = pad(d.getHours(), 2), m = pad(d.getMinutes(), 2), s = pad(d.getSeconds(), 2);
      return fmt.replace('yyyy', Y).replace('MM', M).replace('dd', D).replace('HH', h).replace('mm', m).replace('ss', s);
    },
    parseDate: (str) => { const [y, mo, d] = str.split('-').map(Number); return new Date(y, mo - 1, d); },
    // ★店舗アップロード（拡張要望8章）用：base64Decode/newBlobの最小モック
    base64Decode: (s) => { const bin = atob(s || ''); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr; },
    newBlob: (data, mimeType, name) => ({
      getName: () => name || 'file', getContentType: () => mimeType || 'application/octet-stream', getBytes: () => data
    }),
    // ★機能追加（マーレ支店など英語専用支店対応）：translateJaToEn_のキャッシュキー生成に使う。
    // 本物の暗号学的ハッシュである必要はなく、同じ文字列に同じキーが振られれば十分なため、
    // ブラウザの同期APIだけで済む簡易ハッシュ（実DigestAlgorithmの値そのものは使わない）。
    computeDigest: (algorithm, text) => {
      let h = 0;
      const s = String(text);
      for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
      return [h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff, (h >> 24) & 0xff];
    },
    DigestAlgorithm: { MD5: 'MD5' },
    Charset: { UTF_8: 'UTF_8' }
  };
  // ★機能追加（マーレ支店など英語専用支店対応）：本物のLanguageAppは呼べないため、
  // 「翻訳された」ことが分かる簡易モック（EN:接頭辞）。gas_harness.jsのモックと同じ考え方。
  window.LanguageApp = { translate: (text) => 'EN:' + text };
  // ★DriveApp簡易モック（拡張要望8章：店舗アップロード用フォルダの自動作成・書類一覧）。
  // 実DriveAppとの互換は最小サブセットのみ（gas_harness.jsのDriveAppモックと同じ設計）。
  (function () {
    let driveSeq = 0;
    const driveFolders = {}, driveFiles = {};
    function makeFolderObj(id) {
      return {
        getId: () => id, getName: () => driveFolders[id].name, getUrl: () => 'https://drive.mock/folders/' + id,
        createFolder: (name) => {
          const newId = 'fld-' + (++driveSeq);
          driveFolders[newId] = { id: newId, name, subIds: [], fileIds: [] };
          driveFolders[id].subIds.push(newId);
          return makeFolderObj(newId);
        },
        getFoldersByName: (name) => {
          const matches = driveFolders[id].subIds.filter(sid => driveFolders[sid].name === name);
          let i = 0;
          return { hasNext: () => i < matches.length, next: () => makeFolderObj(matches[i++]) };
        },
        getFolders: () => {
          const subIds = driveFolders[id].subIds.slice();
          let i = 0;
          return { hasNext: () => i < subIds.length, next: () => makeFolderObj(subIds[i++]) };
        },
        createFile: (blob) => {
          const fid = 'file-' + (++driveSeq);
          driveFiles[fid] = { id: fid, name: blob.getName ? blob.getName() : 'file', updatedAt: new Date() };
          driveFolders[id].fileIds.push(fid);
          return makeFileObj(fid);
        },
        getFiles: () => {
          const fileIds = driveFolders[id].fileIds.slice();
          let i = 0;
          return { hasNext: () => i < fileIds.length, next: () => makeFileObj(fileIds[i++]) };
        }
      };
    }
    function makeFileObj(id) {
      return { getId: () => id, getName: () => driveFiles[id].name, getUrl: () => 'https://drive.mock/file/' + id,
        getLastUpdated: () => driveFiles[id].updatedAt };
    }
    window.DriveApp = {
      createFolder: (name) => { const id = 'fld-' + (++driveSeq); driveFolders[id] = { id, name, subIds: [], fileIds: [] }; return makeFolderObj(id); },
      getFolderById: (id) => { if (!driveFolders[id]) throw new Error('フォルダが見つかりません: ' + id); return makeFolderObj(id); }
    };
  })();
  window.CacheService = { getScriptCache: () => ({
    put: (k, v) => { cache[k] = v; },
    get: (k) => (k in cache ? cache[k] : null),
    remove: (k) => { delete cache[k]; }
  }) };
  let lockDepth = 0;
  window.LockService = { getScriptLock: () => ({
    tryLock: () => { if (lockDepth > 0) return false; lockDepth++; return true; },
    releaseLock: () => { if (lockDepth > 0) lockDepth--; }
  }) };
  window.MailApp = { sendEmail: (...args) => {
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      const m = args[0];
      sentMail.push({ to: m.to, subj: m.subject, body: m.body, replyTo: m.replyTo });
    } else {
      const [to, subj, body] = args;
      sentMail.push({ to, subj, body });
    }
    console.log('[デモ：メール送信の代わりにログへ出力]', sentMail[sentMail.length - 1]);
  } };
  window.Session = { getActiveUser: () => ({ getEmail: () => 'yamamoto@his-world.com' }) };
  window.ScriptApp = { getProjectTriggers: () => [], deleteTrigger: () => {},
    newTrigger: () => ({
      timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => ({ getUniqueId: () => 'trg', getHandlerFunction: () => '' }) }) }) }),
      forSpreadsheet: () => ({ onFormSubmit: () => ({ create: () => ({ getUniqueId: () => 'trg', getHandlerFunction: () => '' }) }) })
    }) };
  window.HtmlService = {
    createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ addMetaTag: () => ({ setXFrameOptionsMode: () => ({}) }) }) }) }),
    createHtmlOutputFromFile: () => ({ getContent: () => '' }),
    XFrameOptionsMode: { ALLOWALL: 1, DEFAULT: 0 }
  };
})();
</script>

<script>
// =====================================================
// 2. Code.gs（本物のサーバーロジック。無改変でそのまま実行）
// -----------------------------------------------------
// Code.gs は STATUS_CODES 等、JavaScript.html 側と同名の定数を独自に持つため
// （両者は本来別々のGAS実行環境で動くコードで、同じページの同じグローバルスコープを
// 共有する想定ではない）、IIFEで包んでスコープを分離し、呼び出しに必要な api* 関数だけを
// window.__GAS_API__ として外へ渡す。
// =====================================================
window.__GAS_API__ = (function () {
${codeGs}
return {
  ${apiNames.map(n => `${n}: ${n}`).join(', ')},
  // ダミーデータ投入（ブロック4）で使うため、api*以外もいくつか渡す
  setupPortal: setupPortal, RESERVATION_HEADERS: RESERVATION_HEADERS
};
})();
</script>

<script>
// =====================================================
// 3. google.script.run のブリッジ（本物のapi*関数を直接呼ぶだけ）
// =====================================================
(function () {
  const API = window.__GAS_API__;
  // 本物の google.script.run は
  //   google.script.run.withSuccessHandler(cb).withFailureHandler(errcb).apiFoo(arg1, arg2)
  // という「メソッドチェーンの最後にAPI名を呼ぶ」形。withSuccessHandler/withFailureHandlerは
  // ハンドラを覚えて自分自身（を模したオブジェクト）を返し、それ以外のプロパティ呼び出しが
  // 実際のAPI呼び出しとして扱われる。
  function makeRunner(ok, err) {
    return new Proxy({}, {
      get(_, prop) {
        if (prop === 'withSuccessHandler') return (cb) => makeRunner(cb, err);
        if (prop === 'withFailureHandler') return (cb) => makeRunner(ok, cb);
        const fnName = prop;
        return function (...args) {
          // GASの google.script.run は常に非同期のため、挙動を合わせるためsetTimeoutを挟む
          setTimeout(() => {
            try {
              if (typeof API[fnName] !== 'function') throw new Error('未対応のAPIです: ' + String(fnName));
              const result = API[fnName](...args);
              if (ok) ok(result);
            } catch (e) {
              if (err) err(e); else console.error(e);
            }
          }, 30);
        };
      }
    });
  }
  window.google = { script: { run: makeRunner(null, null) } };
})();
</script>

<script>
// =====================================================
// 4. ダミーデータの投入（オフラインで一通りの画面が見られるように）
// =====================================================
(function () {
  const { setupPortal, RESERVATION_HEADERS, apiLogin, apiCommitChanges, apiShopCreateRequest } = window.__GAS_API__;
  const ss = window.__DEMO__.ss;
  setupPortal(); // 実物の初期セットアップ関数で支店マスタ等を標準構成にする

  const bm = ss.getSheetByName('支店マスタ');
  const bmHead = bm.getRange(1, 1, 1, bm.getLastColumn()).getValues()[0];
  const setBmByCode = (code, field, val) => {
    const codeCol = bmHead.indexOf('支店コード');
    const fieldCol = bmHead.indexOf(field);
    const rows = bm.getRange(2, 1, bm.getLastRow() - 1, bm.getLastColumn()).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][codeCol]) === code) { bm.getRange(i + 2, fieldCol + 1).setValue(val); return; }
    }
  };
  const addBranchRow = (o) => {
    const rowIdx = bm.getLastRow() + 1;
    Object.keys(o).forEach(k => { const i = bmHead.indexOf(k); if (i !== -1) bm.getRange(rowIdx, i + 1).setValue(o[k]); });
  };

  // 支店ごとの機能フラグ（デモ用に代表的な組み合わせを用意）
  setBmByCode('ROW', '同意書必須', true);
  setBmByCode('IST', 'パスポート番号欄', true);
  setBmByCode('VIE', '店舗直接やり取り許可', true);
  setBmByCode('VIE', '手配メール機能', true);
  setBmByCode('VIE', '手配先名-カメラマン', 'M.Gruber');
  setBmByCode('VIE', '手配先メール-カメラマン', 'photographer@example.com');
  setBmByCode('VIE', '手配先名-ヘアメイク', 'M.Gruber');
  setBmByCode('VIE', '手配先メール-ヘアメイク', 'photographer@example.com');
  // ★機能追加（拡張要望8章）：ウィーン支店は店舗アップロードを現地にも公開するデモにする
  setBmByCode('VIE', '店舗アップロードの現地公開', true);
  // ★機能追加（拡張要望5章）：イスタンブール支店は「手配課への通知メールを送らない」デモにする
  setBmByCode('IST', '店舗依頼の手配課通知', false);

  // ★機能追加（マーレ支店など英語専用支店対応）：英語しか読めない支店のデモ。
  // 画面表示・日本側からの連絡（メッセージ・通知メール本文）が自動的に英訳される一方、
  // メール通知そのものは（今後必要になった時にすぐON/OFFを切り替えられるよう）OFFにしてある。
  addBranchRow({ '支店コード': 'MLE', '支店名': 'マーレ支店', '国': 'モルディブ', '都市': 'マーレ',
    'ロール': 'BRANCH', 'ログインパスコード': 'CHANGE-ME-MLE', '通知先メール': 'male-branch@his-world.com',
    '案件番号プレフィックス': 'MLE', '有効': true, '表示言語': 'en', '支店メール通知': false });

  // 店舗ロール（デモ用に2店舗。請求先（拡張要望6章）も設定しておく）
  addBranchRow({ '支店コード': 'SHOP1', '支店名': '新宿店', 'ロール': 'SHOP', 'ログインパスコード': 'CHANGE-ME-SHOP1', '通知先メール': 'shop1@example.com', '有効': true, '請求先': '関東営業本部' });
  addBranchRow({ '支店コード': 'SHOP2', '支店名': '梅田店', 'ロール': 'SHOP', 'ログインパスコード': 'CHANGE-ME-SHOP2', '通知先メール': 'shop2@example.com', '有効': true, '請求先': '関西営業本部' });

  // ★機能追加：プランごとの撮影希望場所の入力方式（チェックボックス／プルダウン／自由入力）と、
  // セールのプラン/支店紐付けのデモ。ローマ支店（ROW）に候補違いのプランを3つ用意する。
  const pm = ss.getSheetByName('プランマスタ');
  pm.appendRow(['ROW', 'プレミアムプラン', true, 'checkbox', 'トレヴィの泉、コロッセオ、スペイン広場']);
  pm.appendRow(['ROW', 'スタンダードプラン', true, 'select', 'ナヴォーナ広場、パンテオン']);
  pm.appendRow(['ROW', 'シンプルプラン', true, '', '']); // 方式未設定＝従来どおり自由入力
  // ★機能追加：新規依頼フォームの希望日ごとのプラン複数希望欄で選べるよう、モックアップ用に
  // 実際の商品名に近いプランを仮登録しておく（イタリア方面はROW＝ローマ支店扱いでまとめる）
  pm.appendRow(['ROW', 'フィレンツェ（3時間撮影）', true, '', '']);
  pm.appendRow(['ROW', 'フィレンツェ（5時間撮影）', true, '', '']);
  pm.appendRow(['ROW', 'ローマ（半日コース）', true, '', '']);
  pm.appendRow(['ROW', 'ローマ（明るい時間＋夕方～夜撮影）', true, '', '']);
  // トルコ方面（カッパドキア・塩湖）はIST＝イスタンブール支店扱いでまとめる
  pm.appendRow(['IST', 'カッパドキア サンセットフォト', true, '', '']);
  pm.appendRow(['IST', 'カッパドキア サンライズフォト', true, '', '']);
  pm.appendRow(['IST', '塩湖の夕日フォト', true, '', '']);
  pm.appendRow(['IST', 'カッパドキア サンライズフォト＆塩湖の夕日フォト', true, '', '']);
  const salem = ss.getSheetByName('セールマスタ');
  salem.appendRow(['ROW', '春の特典フェア', true, '']); // 対象プラン空欄＝ローマ支店の全プラン共通
  salem.appendRow(['ROW', 'プレミアム限定10%OFF', true, 'プレミアムプラン']); // このプランを選んだ時だけ出る
  salem.appendRow(['ALL', '全社共通：早期予約割引', true, '']); // 支店コードALL＝全支店共通

  const H = RESERVATION_HEADERS;
  const addCase = (o) => {
    const row = new Array(H.length).fill('');
    Object.keys(o).forEach(k => { const i = H.indexOf(k); if (i !== -1) row[i] = o[k]; });
    ss.getSheetByName('予約一覧').appendRow(row);
  };
  const daysFromToday = (n) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); };

  // --- ローマ支店（イタリア・同意書必須・準備場所あり） ---
  addCase({
    '支店コード': 'ROW', '管理番号': 'R-101', '管轄': '関東', 'STS JP': 'OK', 'STS 支店': 'OK',
    '撮影日FIX': daysFromToday(12), '新郎姓（ローマ字）': 'Yamada', '新郎名（ローマ字）': 'Taro',
    '新婦姓（ローマ字）': 'Yamada', '新婦名（ローマ字）': 'Hanako',
    'CHG NO': 'CH-2201', 'プラン名': 'プレミアムプラン', 'セール名': '春の特典フェア', '撮影希望場所': 'トレヴィの泉',
    '準備場所': 'ホテル', 'ホテル': 'Hotel Roma', '請求先': '関東', '日本支店名': '新宿西口店',
    '希望日①': '2026-09-20', '同意書': '', '備考': '雨天時は屋内スタジオへ変更'
  });
  // --- イスタンブール支店（パスポート欄あり。希望日ごとの空き確認ステータスのデモ：
  //     第一希望はまだ現地未確認（ST）、第二希望はベンダー確認済み（RQ）の状態） ---
  addCase({
    '支店コード': 'IST', '管理番号': 'IST-201', '管轄': '関西', 'STS JP': 'RQ', 'STS 支店': '',
    '撮影日FIX': daysFromToday(40), '新郎姓（ローマ字）': 'Yilmaz', '新郎名（ローマ字）': 'Ahmet',
    '新婦姓（ローマ字）': 'Yilmaz', '新婦名（ローマ字）': 'Elif',
    'CHG NO': 'CH-2202', 'プラン名': 'スタンダードプラン',
    '希望日①': '2026-10-05', '希望日① STS JP': 'RQ', '希望日① STS 支店': 'ST',
    '希望日②': '2026-10-06', '希望日② STS JP': 'RQ', '希望日② STS 支店': 'RQ',
    'パスポート番号': '', '現地連絡先メール': 'ahmet.y@example.com', '現地連絡先電話': '+90-555-0101',
    'ホテル': 'Istanbul Grand Hotel', 'ホテル住所': 'Sultanahmet, Istanbul', 'フライト情報': 'TK123 9/20 10:00成田発 → 16:00IST着'
  });
  // --- ウィーン支店（店舗直結ON・手配メール有効・現地記入欄サンプル） ---
  addCase({
    '支店コード': 'VIE', '管理番号': 'VIE-301', '管轄': '関東', 'STS JP': 'FN', 'STS 支店': 'FN',
    '撮影日FIX': daysFromToday(-5), '新郎姓（ローマ字）': 'Gruber', '新郎名（ローマ字）': 'Franz',
    '新婦姓（ローマ字）': 'Gruber', '新婦名（ローマ字）': 'Anna',
    'CHG NO': 'CH-2203', 'プラン名': 'スタンダードプラン', '当日の担当': 'M.Gruber', 'ヘアメイク': 'M.Gruber',
    'ヘアメイク開始時間': '8:00', 'カメラマン': 'M.Gruber', '撮影開始時間': '9:00', 'アシスタント': 'L.Bauer',
    'DriveフォルダURL': 'https://drive.google.com/drive/folders/demo'
  });
  addCase({
    '支店コード': 'VIE', '管理番号': 'VIE-302', '管轄': '関西', 'STS JP': 'CHK', 'STS 支店': '',
    '撮影日FIX': '', '新郎姓（ローマ字）': 'Novak', '新郎名（ローマ字）': 'Peter',
    '新婦姓（ローマ字）': 'Novak', '新婦名（ローマ字）': 'Julia',
    'CHG NO': '', 'プラン名': '', '空き確認のみ': '済',
    '希望日①': '2026-11-01', '希望日① STS JP': 'RQ', '希望日① STS 支店': 'ST',
    '希望日②': '2026-11-08', '希望日② STS JP': 'RQ', '希望日② STS 支店': 'ST',
    '希望日③': '2026-11-15', '希望日③ STS JP': 'RQ', '希望日③ STS 支店': 'ST'
  });

  // --- マーレ支店（英語専用支店のデモ。日本側から見た内容は日本語のままで、
  //     マーレ支店としてログインすると画面・このメッセージ本文が自動的に英訳される） ---
  addCase({
    '支店コード': 'MLE', '管理番号': 'MLE-401', '管轄': '関東', 'STS JP': 'RQ', 'STS 支店': '',
    '撮影日FIX': daysFromToday(60), '新郎姓（ローマ字）': 'Smith', '新郎名（ローマ字）': 'John',
    '新婦姓（ローマ字）': 'Smith', '新婦名（ローマ字）': 'Jane',
    'CHG NO': 'CH-2204', 'プラン名': 'オーバーウォーターヴィラプラン',
    '希望日①': '2026-11-20', '撮影希望場所': 'サンセットビーチ', '備考': '日本語入力例：新婦の希望で夕日の時間帯に撮影してほしい'
  });
  apiCommitChanges(apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, 'MLE-401', {},
    '撮影時間は現地の日没時刻に合わせて調整しますので、確定次第ご連絡します。');

  // --- 共有メモ・現地用メモ（積み上げ式）のサンプル ---
  const memoSheet = ss.getSheetByName('メモ履歴');
  memoSheet.appendRow(['R-101', '共有メモ', '請求書を発送しました', '田中（関東手配課）', new Date()]);
  memoSheet.appendRow(['R-101', 'メモ（現地用）', '雨天時は近隣の屋内スタジオを予約済み', 'L.Conti（ローマ支店）', new Date()]);

  // --- 手配履歴のサンプル（VIE-301） ---
  ss.getSheetByName('手配履歴').appendRow(['VIE-301', 'カメラマン', 'M.Gruber', 'photographer@example.com',
    '[WEDLINK][VIE] カメラマン手配のお願い（VIE-301）', 'カメラマンの手配をお願いします。', '田中（関東手配課）', new Date()]);

  // --- 店舗発の依頼サンプル（新宿店 → ウィーン支店。店舗直結ONなので支店と直接やり取り。
  //     拡張要望2章の新項目（新婦名・セール名・撮影希望場所・希望日5件・オプション・初期STS選択）を反映） ---
  const { apiSaveFieldsQuiet, apiShopUploadDocument } = window.__GAS_API__;
  const shopKanri = apiShopCreateRequest(
    apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token,
    {
      branchCode: 'VIE', team: '関東', challengeNo: 'CH2210AAAAA',
      groomLastName: 'Rossi', groomName: 'Marco', brideLastName: 'Rossi', brideName: 'Giulia',
      plan: 'プレミアムプラン', saleName: '春の特典フェア', location: 'シェーンブルン宮殿',
      hope1: '2026-12-05', hope2: '2026-12-06', option1: '追加アルバム', initialStatus: 'RQ'
    }
  ).kanriNo;
  const vieTok = apiLogin('VIE', 'CHANGE-ME-VIE').session.token;
  apiCommitChanges(vieTok, shopKanri, {}, '12/5であれば承れます。折り返しお待ちしております。');
  let shopTok = apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token;
  apiCommitChanges(shopTok, shopKanri, {}, 'ありがとうございます、そちらで確定でお願いします。');
  // 必要書類チェックリスト（拡張要望9章）のデモ：店舗が1件チェック済みにしておく
  apiSaveFieldsQuiet(shopTok, shopKanri, { '必要書類チェック:ヘアメイク画像': 'TRUE' });
  // ドライブ連携（拡張要望8章）のデモ：お客様提供画像を1件アップロード済みにしておく
  apiShopUploadDocument(shopTok, shopKanri, 'ヘアメイク画像', 'hairstyle-sample.jpg', 'image/jpeg',
    btoa('demo-image-bytes'));

  // --- 日付変更依頼（DC）のデモ：OKまで進んだ案件を店舗がDCに変更 → 支店がOKで応答（拡張要望3-2章） ---
  apiSaveFieldsQuiet(apiLogin('KANTO', 'CHANGE-ME-KANTO').session.token, shopKanri, { 'STS JP': 'OK' });
  shopTok = apiLogin('SHOP1', 'CHANGE-ME-SHOP1').session.token;
  apiCommitChanges(shopTok, shopKanri, { 'STS JP': 'DC' }, '日程を12/12に変更したいです。チャージ規定は確認済みです。');
  apiSaveFieldsQuiet(apiLogin('VIE', 'CHANGE-ME-VIE').session.token, shopKanri, { 'STS 支店': 'OK' });

  // --- 希望日ごとの空き確認ステータスのデモ：現地が希望日②を確定すると、撮影日FIXへの反映・
  //     他の希望日の自動UC・案件全体のSTS昇格が自動で起きる（拡張要望：希望日ごとのSTS新設） ---
  const hopeKanri = apiShopCreateRequest(
    apiLogin('SHOP2', 'CHANGE-ME-SHOP2').session.token,
    { branchCode: 'IST', team: '関西', challengeNo: 'CH2211BBBBB',
      groomLastName: 'Sato', groomName: 'Kenji', brideLastName: 'Sato', brideName: 'Yui',
      hope1: '2026-11-20', hope2: '2026-11-25', hope3: '2026-11-28' }
  ).kanriNo;
  const istTok = apiLogin('IST', 'CHANGE-ME-IST').session.token;
  apiSaveFieldsQuiet(istTok, hopeKanri, { '希望日① STS 支店': 'UC' }); // 第一希望は空きなし
  apiSaveFieldsQuiet(istTok, hopeKanri, { '希望日② STS 支店': 'OK' }); // 第二希望が取れた → 自動連動
})();
</script>

<script>
// =====================================================
// 5. JavaScript.html（本物のクライアントロジック。無改変でそのまま実行）
// =====================================================
${javascriptHtml.replace(/<\/?script>/g, '')}
</script>

<script>
// =====================================================
// 6. デモ用のログインショートカットの配線（data-demo-login属性を持つ要素すべてに反応）
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-demo-login]').forEach(el => {
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'click', () => {
      const val = el.tagName === 'SELECT' ? el.value : el.dataset.demoLogin;
      if (!val) return;
      const [code, pass] = val.split(',');
      document.getElementById('login-branchcode').value = code;
      document.getElementById('login-passcode').value = pass;
      document.getElementById('login-submit').click();
    });
  });
});
</script>
`;
}

module.exports = { readSource, extractBodyInner, apiNamesOf, buildScripts };
