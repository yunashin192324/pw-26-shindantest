/**
 * Internal Portal & CMS - Ultra Optimized Core
 */

const CONFIG = {
  SHEET_MAIN: 'シート1',
  SHEET_ADMIN: '管理マスタ',
  SHEET_NEWS: 'ニュース',
  SHEET_BACKUP: 'バックアップ', 
  SHEET_AGT: 'AGTマスタ', 
  SHEET_IMAGES: '画像DB', 
  SHEET_ORDER: '表示順',
  CACHE_TIME: 3600 
};

// ★スキーマの末尾に point と promo を追加
const SCHEMA_MAP = [
  "area", "country", "city", "cat", "title", "notice", "co", "area_f", "deliv", "loc", "child", "comp",
  "c_sum", "c_fit", "c_ben", "c_fee", "c_pay", "c_chg", "alb", "opt", "docs", "attn", "bouquet",
  "p_av", "p_bk", "p_op", "p_fn", "p_ch", "p_cx", "p_rem",
  "m_sum", "m_pln", "m_dst", "m_opt",
  "w_det", "w_imp", "w_ins", "w_fit", "w_abd", "w_ret", "w_ga", "w_flw",
  "sch", "url", "qa", "raw_backup", "rowId", "agt_code", "sheet_embed",
  "md_feature", "md_img_url", "md_plan_resort", "md_plan_party", "md_hp", "md_salon", "md_c_name", "md_c_agt", "md_c_city", "md_c_ivr",
  "md_pay_dest", "md_pay_his", "md_pay_agt", "md_gallery", "season_year", "season_type", "is_draft", "updated_at", "tags", "product_url", "point", "promo"
];

// ==========================================
// ★ JSONの読み込み(制御文字が混入した行でも読めるようにする)
//   旧xlsxのセル内改行(_x000b_)がスプレッドシート取り込み時に制御文字へ戻るケースへの対策
// ==========================================
function sanitizeJsonString_(str) {
  return String(str)
    .replace(/\r\n/g, '\\n')
    .replace(/[\r\n\u000b]/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/[\u0000-\u001F\u007F]/g, '');
}

function parseJsonSafe_(jsonStr) {
  try { return JSON.parse(jsonStr); } catch (e) {
    try { return JSON.parse(sanitizeJsonString_(jsonStr)); } catch (e2) { return null; }
  }
}

// ==========================================
// ★ 超速キャッシュ管理
// ==========================================
function getCacheVer_() {
  const cache = CacheService.getScriptCache();
  let ver = cache.get('DATA_CACHE_VER');
  if (!ver) {
    ver = new Date().getTime().toString();
    cache.put('DATA_CACHE_VER', ver, 21600); 
  }
  return ver;
}

function bumpCache_() {
  CacheService.getScriptCache().put('DATA_CACHE_VER', new Date().getTime().toString(), 21600);
}

// ★高速化: 分割キャッシュは putAll / getAll で1回の呼び出しにまとめて読み書きする。
//   1エントリ上限(100KB)に対し、日本語(UTF-8で最大3バイト)でも収まるよう30,000文字ずつ分割。
const LARGE_CACHE_CHUNK = 30000;
const LARGE_CACHE_MAX_CHARS = 8000000;

function putLargeCache_(key, dataObj) {
  try {
    const cache = CacheService.getScriptCache();
    const jsonStr = JSON.stringify(dataObj);
    if (jsonStr.length > LARGE_CACHE_MAX_CHARS) return;
    const chunksCount = Math.ceil(jsonStr.length / LARGE_CACHE_CHUNK);
    const entries = {};
    for (let i = 0; i < chunksCount; i++) {
      entries[`${key}_${i}`] = jsonStr.substring(i * LARGE_CACHE_CHUNK, (i + 1) * LARGE_CACHE_CHUNK);
    }
    cache.putAll(entries, 21600);
    // 本体が全部書けてから目印を置く(途中失敗時に壊れたキャッシュを読まないため)
    cache.put(key, JSON.stringify({ count: chunksCount }), 21600);
  } catch(e) {}
}

function getLargeCache_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const metaStr = cache.get(key);
    if (!metaStr) return null;
    const meta = JSON.parse(metaStr);
    const keys = [];
    for (let i = 0; i < meta.count; i++) keys.push(`${key}_${i}`);
    const got = cache.getAll(keys);
    let jsonStr = "";
    for (let i = 0; i < keys.length; i++) {
      const chunk = got[keys[i]];
      if (chunk == null) return null;
      jsonStr += chunk;
    }
    return JSON.parse(jsonStr);
  } catch (e) { return null; }
}
// ==========================================

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialPlanId = (e && e.parameter && e.parameter.id) ? e.parameter.id : '';
  template.initialNewsId = (e && e.parameter && e.parameter.news) ? e.parameter.news : '';
  template.scriptUrl = ScriptApp.getService().getUrl(); 
  return template.evaluate().setTitle('ニュース＆商説').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function checkAdmin_(email) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `ADMIN_${email}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached === 'true';

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_ADMIN);
    if (!sheet || sheet.getLastRow() < 2) return false;
    const admins = new Set( sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().filter(Boolean).map(e => String(e).trim().toLowerCase()) );
    const isAdmin = admins.has(email);
    cache.put(cacheKey, String(isAdmin), CONFIG.CACHE_TIME);
    return isAdmin;
  } catch (e) { return false; }
}

function backupData_(action, targetRow, dataArray) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_BACKUP);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_BACKUP);
      sheet.appendRow(["タイムスタンプ", "ユーザー", "アクション", "対象行", "データ..."]);
    }
    const user = Session.getActiveUser().getEmail();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
    sheet.appendRow([timestamp, user, action, targetRow].concat(dataArray));
  } catch(e) {} 
}

function updatePresence() {
  const userEmail = Session.getActiveUser().getEmail().toLowerCase();
  if (!checkAdmin_(userEmail)) return []; 

  const cache = CacheService.getScriptCache();
  const CACHE_KEY = 'ACTIVE_ADMINS';
  const lock = LockService.getScriptLock();
  
  let activeAdmins = {};
  
  if (lock.tryLock(2000)) {
    try {
      const cachedData = cache.get(CACHE_KEY);
      if (cachedData) {
        activeAdmins = JSON.parse(cachedData);
      }
      
      const now = new Date().getTime();
      activeAdmins[userEmail] = now;
      
      for (let email in activeAdmins) {
        if (now - activeAdmins[email] > 30000) {
          delete activeAdmins[email];
        }
      }
      
      cache.put(CACHE_KEY, JSON.stringify(activeAdmins), 60); 
    } catch(e) {
    } finally {
      lock.releaseLock();
    }
  }
  return Object.keys(activeAdmins);
}

function getInitialDataLight() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase() || "unknown";
    const isAdmin = checkAdmin_(userEmail);
    
    const cacheVer = getCacheVer_();
    const cacheKey = isAdmin ? `INIT_LIGHT_ADMIN_${cacheVer}` : `INIT_LIGHT_USER_${cacheVer}`;
    const cachedData = getLargeCache_(cacheKey);
    if (cachedData) {
      cachedData.userEmail = userEmail;
      cachedData.treeOrder = getTreeOrder_();
      return cachedData;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_MAIN);
    
    let areaMaster = [];
    let contactInfo = "";
    try {
      let adminSheet = ss.getSheetByName(CONFIG.SHEET_ADMIN);
      if (!adminSheet) {
        adminSheet = ss.insertSheet(CONFIG.SHEET_ADMIN);
        adminSheet.appendRow(['管理者メールアドレス', '', 'エリアマスタ（ここから下に記載）', '', '問い合わせ先（E2セルに記載）']);
        adminSheet.setColumnWidth(1, 200); adminSheet.setColumnWidth(3, 200); adminSheet.setColumnWidth(5, 400);
      }
      const lastRow = adminSheet.getLastRow();
      if (lastRow >= 2) {
        const cValues = adminSheet.getRange(2, 3, lastRow - 1, 1).getValues();
        areaMaster = [...new Set(cValues.flat().filter(String))];
      }
      contactInfo = String(adminSheet.getRange(2, 5).getValue() || "");
    } catch(e) {}

    if (!contactInfo) {
      contactInfo = `▽お問い合わせ先はコチラ▽
関東業務チーム（企画・手配・WEB）　TEL：050-1748-5146
・企画関連　メール：t-avantikikaku@his-world.com
・手配関連　メール：tw-avanti@his-world.com
・沖縄旅行企画関連　メール：tk-avanti@his-world.com　
・WEB関連　メール：t-avantiweb@his-world.com

関西企画 o-avanti@his-world.com
中部企画 n-avanti@his-world.com`;
    }

    let agtMaster = {};
    try {
      let agtSheet = ss.getSheetByName(CONFIG.SHEET_AGT);
      if (!agtSheet) {
        agtSheet = ss.insertSheet(CONFIG.SHEET_AGT);
        agtSheet.appendRow(['AGTコード', '正式会社名', '電話番号', 'メールアドレス', 'WEBサイトURL', '営業時間/定休日', '空き状況確認', '予約方法', 'OP追加時', 'ファイナル', '変更', 'CXL', '備考', '衣裳概要', '衣裳合わせ', '早期特典', '衣裳持込', '差額収受先', 'お着換え', 'アルバム概要', 'オプション概要', '予約後お渡しする書類', '注意事項', 'ブーケについて']);
        agtSheet.setColumnWidth(1, 100); agtSheet.setColumnWidth(2, 200); agtSheet.setColumnWidth(5, 250);
      } else if (agtSheet.getLastRow() > 1) {
        const agtData = agtSheet.getDataRange().getValues().slice(1);
        agtData.forEach(row => {
          const code = String(row[0] || "").trim();
          if (code) {
            agtMaster[code] = {
              name: String(row[1] || ""),
              phone: String(row[2] || ""),
              email: String(row[3] || ""),
              web: String(row[4] || ""),
              hours: String(row[5] || ""),
              p_av: String(row[6] || ""),
              p_bk: String(row[7] || ""),
              p_op: String(row[8] || ""),
              p_fn: String(row[9] || ""),
              p_ch: String(row[10] || ""),
              p_cx: String(row[11] || ""),
              p_rem: String(row[12] || ""),
              c_sum: String(row[13] || ""),
              c_fit: String(row[14] || ""),
              c_ben: String(row[15] || ""),
              c_fee: String(row[16] || ""),
              c_pay: String(row[17] || ""),
              c_chg: String(row[18] || ""),
              alb: String(row[19] || ""),
              opt: String(row[20] || ""),
              docs: String(row[21] || ""),
              attn: String(row[22] || ""),
              bouquet: String(row[23] || "")
            };
          }
        });
      }
    } catch(e) { console.log("AGT Master Load Error"); }

    const baseStructure = {
      "キャンペーン": {}, "フォト": {}, "ウェディング": {}, 
      "お役立ち情報": { "手配関連": [], "書類関連": [], "教育・研修": [], "その他": [] },
      "その他": { "お披露目パーティー": [], "前撮り": [], "リング": [], "アルバム": [], "画像加工": [], "ブーケ": [], "ペーパーアイテム": [], "MY DRESS STYLE": [] }
    };

    if (!sheet || sheet.getLastRow() < 2) return { status: "success", structure: baseStructure, isAdmin, userEmail, agtMaster, areaMaster, contactInfo, treeOrder: getTreeOrder_() };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
    
    const structure = data.reduce((acc, row, idx) => {
      let [a, ctry, cty, c, t, sy, st, isDraft, updatedAt, tags, productUrl] = row.map(v => String(v || "").trim());
      if (!a && !ctry && !cty && !c && !t) return acc;

      if (isDraft === "true" && !isAdmin) return acc;
      if (sy.startsWith("{") || sy.length > 10) { sy = ""; st = ""; }

      let cat = c || "未分類";
      if (cat === "フォトウェディング") cat = "フォト"; 

      const area = a;
      const country = ctry;
      const city = cty;
      let title = t || "名称未設定";
      
      if (isDraft === "true" && isAdmin) title = "🔒[非公開] " + title;

      acc[cat] = acc[cat] ?? {};
      
      const itemObj = { id: idx + 2, title, cat, sy, st, updatedAt, tags, productUrl, fullText: "", p_av: "", p_bk: "", agt_code: "", is_draft: isDraft };

      if (cat === "その他" || cat === "キャンペーン" || cat === "お役立ち情報") {
        const sub = area || "未分類";
        if (!Array.isArray(acc[cat][sub])) acc[cat][sub] = [];
        acc[cat][sub].push(itemObj);
      } else {
        if (!area) return acc;
        const path = [area];
        if (country) path.push(country);
        if (city) path.push(city);

        let current = acc[cat];
        for (let i = 0; i < path.length; i++) {
          const node = path[i];
          if (i === path.length - 1) {
            if (current[node] && !Array.isArray(current[node])) {
              current[node][" 共通プラン"] = current[node][" 共通プラン"] || [];
              current[node][" 共通プラン"].push(itemObj);
            } else {
              current[node] = current[node] || [];
              current[node].push(itemObj);
            }
          } else {
            if (current[node] && Array.isArray(current[node])) {
              const existingItems = current[node];
              current[node] = { " 共通プラン": existingItems };
            }
            current[node] = current[node] || {};
            current = current[node];
          }
        }
      }
      return acc;
    }, baseStructure);

    const result = { status: "success", structure, isAdmin, userEmail, agtMaster, areaMaster, contactInfo };
    putLargeCache_(cacheKey, result);
    result.treeOrder = getTreeOrder_();
    return result;
  } catch (e) {
    return { status: "error", message: `Init Error: ${e.message}` };
  }
}

// ★高速化: 検索用テキストからHTMLタグ・URL・連続空白・検索に不要な項目を除いて軽量化する
//   (全プラン分をキャッシュし、閲覧者のブラウザへ毎回送るデータのため)
const SEARCH_SKIP_KEYS = { rowId: 1, status: 1, is_draft: 1, updated_at: 1, co: 1, md_gallery: 1, md_img_url: 1,
  sheet_embed: 1, promo: 1, season_type: 1, season_year: 1, raw_backup: 1 };

function buildSearchText_(record) {
  return Object.keys(record)
    .filter(k => !SEARCH_SKIP_KEYS[k] && record[k] !== '' && record[k] != null)
    .map(k => String(record[k]))
    .join(' ')
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getHeavyDataForSearch() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase() || "unknown";
    const isAdmin = checkAdmin_(userEmail);
    
    const cacheVer = getCacheVer_();
    const cacheKey = isAdmin ? `HEAVY_ADMIN_${cacheVer}` : `HEAVY_USER_${cacheVer}`;
    const cachedData = getLargeCache_(cacheKey);
    if (cachedData) return cachedData;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_MAIN);
    if (!sheet || sheet.getLastRow() < 2) return { status: "success", heavyData: {} };

    const data = sheet.getDataRange().getValues().slice(1);
    
    const heavyData = {};
    
    data.forEach((row, idx) => {
      let isDraft = String(row[7] || "").trim();
      if (isDraft === "true" && !isAdmin) return;
      
      const rowId = idx + 2;
      let fullSearchText = "";
      
      const checkChunk = (chunkIdx) => {
        const col = String(row[chunkIdx] || "").trim();
        if (col.startsWith("{")) {
          return parseJsonSafe_(row.slice(chunkIdx).join(""));
        }
        return null;
      };
      
      let record = checkChunk(11) || checkChunk(10) || checkChunk(8) || checkChunk(7) || checkChunk(5);
      if (!record) {
        record = SCHEMA_MAP.reduce((acc, key, i) => {
          if (key && row[i] !== undefined) acc[key] = row[i];
          return acc;
        }, {});
      }
      fullSearchText = buildSearchText_(record);

      // データ不備チェックは「入力の有無」しか見ないため本文は送らない(転送量削減)
      const filled = v => { const t = String(v || "").trim(); return (t && t !== '<p><br></p>') ? '1' : ''; };
      let p_av = filled(record.p_av);
      let p_bk = filled(record.p_bk);
      let agtCode = String(record.agt_code || "").trim();

      heavyData[rowId] = {
        fullText: fullSearchText,
        p_av: p_av,
        p_bk: p_bk,
        agt_code: agtCode
      };
    });

    const result = { status: "success", heavyData: heavyData };
    putLargeCache_(cacheKey, result);
    return result;
  } catch(e) {
    return { status: "error", message: `Heavy Data Error: ${e.message}` };
  }
}

function getPlanDetail(rowIndex) {
  try {
    const rowNum = parseInt(rowIndex, 10);
    if (isNaN(rowNum) || rowNum < 2) throw new Error("Invalid ID.");

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_MAIN);
    const maxCols = sheet.getLastColumn();
    const rowData = sheet.getRange(rowNum, 1, 1, maxCols).getValues()[0];
    
    const checkChunk = (idx) => {
      const col = String(rowData[idx] || "").trim();
      if (col.startsWith("{")) {
        const record = parseJsonSafe_(rowData.slice(idx).join(""));
        if (record) {
          record.status = "success";
          record.rowId = rowNum;
          return record;
        }
      }
      return null;
    };

    let record = checkChunk(11) || checkChunk(10) || checkChunk(8) || checkChunk(7) || checkChunk(5);
    
    if (!record) {
      record = SCHEMA_MAP.reduce((acc, key, i) => {
        if (key && key !== 'rowId' && rowData[i] !== undefined) acc[key] = rowData[i];
        return acc;
      }, { status: "success", rowId: rowNum });
    }
    
    if (record.is_draft === "true" && !checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) {
      throw new Error("このページは現在非公開に設定されています。");
    }

    return record;
  } catch (e) { return { status: "error", message: e.message }; }
}

function saveData(payload) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("System is busy.");

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_MAIN);
    const fullJson = JSON.stringify(payload);
    const CHUNK_SIZE = 45000;
    const chunks = [];
    for (let i = 0; i < fullJson.length; i += CHUNK_SIZE) {
      chunks.push(fullJson.substring(i, i + CHUNK_SIZE));
    }

    const rowToSave = [
      payload.area || "",
      payload.country || "",
      payload.city || "",
      payload.cat || "",
      payload.title || "",
      payload.season_year || "",
      payload.season_type || "",
      payload.is_draft || "false",
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss"), // updated_at
      payload.tags || "", // tags
      payload.product_url || "" // product_url
    ].concat(chunks);

    const maxCols = sheet.getMaxColumns();
    if (maxCols < rowToSave.length) sheet.insertColumnsAfter(maxCols, rowToSave.length - maxCols);

    let savedId;
    const targetRow = parseInt(payload.rowId, 10);
    
    backupData_('SAVE', targetRow || 'NEW', rowToSave);
    
    if (!isNaN(targetRow) && targetRow >= 2) {
      sheet.getRange(targetRow, 1, 1, sheet.getLastColumn() || 1).clearContent();
      const range = sheet.getRange(targetRow, 1, 1, rowToSave.length);
      range.setNumberFormat('@');  // 本文(JSON)が数式・日付として解釈されないよう書式なしテキストで保存
      range.setValues([rowToSave]);
      savedId = targetRow;
    } else {
      const nextRow = Math.max(sheet.getLastRow(), 1) + 1;
      const range = sheet.getRange(nextRow, 1, 1, rowToSave.length);
      range.setNumberFormat('@');
      range.setValues([rowToSave]);
      savedId = nextRow;
    }
    SpreadsheetApp.flush(); 
    bumpCache_(); 
    return { status: "success", id: savedId };
  } finally { lock.releaseLock(); }
}

function deleteData(rowIndex) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("System is busy.");

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_MAIN);
    const rowNum = parseInt(rowIndex, 10);
    if (isNaN(rowNum) || rowNum < 2) throw new Error("Invalid ID.");
    
    const oldData = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    backupData_('DELETE', rowNum, oldData);

    sheet.getRange(rowNum, 1, 1, sheet.getMaxColumns()).clearContent();
    SpreadsheetApp.flush(); 
    bumpCache_(); 
    return { status: "success" };
  } finally { lock.releaseLock(); }
}

function uploadImage(base64Data) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("System is busy.");
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_IMAGES);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_IMAGES);
      sheet.appendRow(["ImageID", "Timestamp", "Data1", "Data2", "Data3", "Data4", "Data5"]);
    }
    const imgId = "IMG_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
    const ts = new Date();

    const CHUNK_SIZE = 45000;
    const chunks = [];
    for (let i = 0; i < base64Data.length; i += CHUNK_SIZE) {
      chunks.push(base64Data.substring(i, i + CHUNK_SIZE));
    }
    sheet.appendRow([imgId, ts].concat(chunks));
    SpreadsheetApp.flush();
    return { status: "success", id: imgId };
  } finally { lock.releaseLock(); }
}

// ★高速化: 全行・全列(=全画像のBase64本体)を毎回読み込んでいたのをやめ、
//         まずID列(A列)だけを読んで該当行を特定し、必要な行のBase64だけを読み込む
function getImagesByIds(ids) {
  try {
    if (!ids || ids.length === 0) return {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_IMAGES);
    if (!sheet || sheet.getLastRow() < 2) return {};

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const wanted = new Set(ids);
    const idColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    const result = {};
    idColumn.forEach((row, i) => {
      const imgId = row[0];
      if (wanted.has(imgId)) {
        const rowNum = i + 2;
        const rowData = sheet.getRange(rowNum, 3, 1, lastCol - 2).getValues()[0];
        result[imgId] = rowData.join("");
      }
    });
    return result;
  } catch(e) { return {}; }
}

// ★高速化: 本文(巨大なJSON分割列)を含むシート全体を毎回読み書きしていたのをやめ、
//         更新対象行の season_year〜tags(F:J列, 5列)だけを個別に読み書きする
function bulkUpdatePlans(updates) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("System is busy.");
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_MAIN);
    const lastRow = sheet.getLastRow();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");

    updates.forEach(u => {
      const rowNum = parseInt(u.rowId, 10);
      if (isNaN(rowNum) || rowNum < 2 || rowNum > lastRow) return;

      // F列(season_year) 〜 J列(tags) の5列だけを対象にする
      const range = sheet.getRange(rowNum, 6, 1, 5);
      const vals = range.getValues()[0];

      if (u.season_year !== undefined) vals[0] = u.season_year;
      if (u.season_type !== undefined) vals[1] = u.season_type;
      if (u.is_draft !== undefined) vals[2] = u.is_draft;

      let currentTags = vals[4] ? String(vals[4]).split(',').map(t=>t.trim()) : [];
      if (u.add_tags) {
          u.add_tags.split(',').forEach(t => { if(t.trim() && !currentTags.includes(t.trim())) currentTags.push(t.trim()); });
      }
      if (u.remove_tags) {
          const toRemove = u.remove_tags.split(',').map(t=>t.trim());
          currentTags = currentTags.filter(t => !toRemove.includes(t));
      }
      vals[4] = currentTags.filter(Boolean).join(', ');
      vals[3] = timestamp;

      range.setValues([vals]);
      backupData_('BULK_UPDATE', rowNum, vals);
    });

    SpreadsheetApp.flush();
    bumpCache_();
    return { status: "success" };
  } finally { lock.releaseLock(); }
}

function getNewsData() {
  const userEmail = Session.getActiveUser().getEmail().toLowerCase() || "unknown";
  const isAdmin = checkAdmin_(userEmail);
  
  const cacheVer = getCacheVer_();
  const cacheKey = isAdmin ? `NEWS_ADMIN_${cacheVer}` : `NEWS_USER_${cacheVer}`;
  const cachedData = getLargeCache_(cacheKey);
  if (cachedData) return cachedData;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NEWS);
  if (!sheet || sheet.getLastRow() < 2) return []; 
  
  const data = sheet.getDataRange().getValues().slice(1);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const newsList = data.map((row, idx) => {
    if (!row[1] && !row[2] && !row[3] && !row[4]) return null;
    const newsDateStr = row[1];
    if (!newsDateStr) return null;
    
    const newsDate = new Date(newsDateStr);
    if (newsDate < oneYearAgo) return null;

    let is_important = "false";
    let is_draft = "false";
    let contentChunks = [];
    
    const colE = String(row[4] || "").trim(); // is_important
    const colF = String(row[5] || "").trim(); // is_draft

    if (colE === "true" || colE === "false") {
      is_important = colE;
      if (colF === "true" || colF === "false") {
         is_draft = colF;
         contentChunks = row.slice(6);
      } else {
         is_draft = "false";
         contentChunks = row.slice(5);
      }
    } else {
      is_important = "false";
      is_draft = "false";
      contentChunks = row.slice(4);
    }

    if (is_draft === "true" && !isAdmin) return null;

    let title = String(row[3] || "");
    if (is_draft === "true" && isAdmin) title = "🔒[非公開] " + title;

    const fullContent = contentChunks.join("");
    return {
      rowId: idx + 2, 
      date: Utilities.formatDate(newsDate, Session.getScriptTimeZone(), "yyyy/MM/dd"),
      area: String(row[2] || ""), 
      title: title, 
      is_important: is_important,
      is_draft: is_draft,
      content: fullContent
    };
  }).filter(Boolean);

  putLargeCache_(cacheKey, newsList); 
  return newsList;
}

function saveNewsData(payload) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("System is busy.");

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NEWS);
    const content = payload.content || "";
    const CHUNK_SIZE = 45000;
    const chunks = [];
    for (let i = 0; i < content.length; i += CHUNK_SIZE) chunks.push(content.substring(i, i + CHUNK_SIZE));

    const rowToSave = [
      payload.rowId || "", 
      payload.date,        
      payload.area,        
      payload.title,
      payload.is_important || "false",
      payload.is_draft || "false"
    ].concat(chunks);
    
    const maxCols = sheet.getMaxColumns();
    if (maxCols < rowToSave.length) sheet.insertColumnsAfter(maxCols, rowToSave.length - maxCols);
    
    let savedId;
    const targetRow = parseInt(payload.rowId, 10);
    if (!isNaN(targetRow) && targetRow >= 2) {
      rowToSave[0] = targetRow;
      sheet.getRange(targetRow, 1, 1, sheet.getLastColumn() || 1).clearContent();
      sheet.getRange(targetRow, 1, 1, rowToSave.length).setValues([rowToSave]);
      savedId = targetRow;
    } else {
      const nextRow = sheet.getLastRow() + 1;
      rowToSave[0] = nextRow;
      sheet.appendRow(rowToSave);
      savedId = nextRow;
    }
    SpreadsheetApp.flush(); 
    bumpCache_(); 
    return { status: "success", id: savedId };
  } finally { lock.releaseLock(); }
}

function deleteNewsData(rowIndex) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("System is busy.");

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NEWS);
    const rowNum = parseInt(rowIndex, 10);
    if (isNaN(rowNum) || rowNum < 2) throw new Error("Invalid ID.");
    sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).clearContent(); // 修正: 7列固定を建て末列までクリア
    SpreadsheetApp.flush(); 
    bumpCache_(); 
    return { status: "success" };
  } finally { lock.releaseLock(); }
}
function checkCacheSize() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('シート1');
  const data = sheet.getDataRange().getValues();
  Logger.log('行数: ' + data.length);
  Logger.log('シートデータサイズ: ' + JSON.stringify(data).length + ' bytes');
  Logger.log('キャッシュ上限に対して: ' + Math.round(JSON.stringify(data).length / LARGE_CACHE_MAX_CHARS * 100) + '%');
}

/**
 * 旧商説スプレッドシートからの一括移行(1回だけ実行)
 * 1. 変換済みの「移行データ.xlsx」を、このスプレッドシートに「新しいシートを挿入」で読み込む
 *    (シート「移行データ」「移行AGTマスタ」「移行エリア」が追加される)
 * 2. Apps Scriptエディタでこの関数を選んで実行する
 * 3. 完了したら上記3シートは削除してよい
 */
const LEGACY_SHEET_NAME = '移行データ';

function importLegacyData() {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('LEGACY_IMPORTED') === 'true') {
    throw new Error('移行データは既に取り込み済みです(二重登録防止)。やり直す場合はスクリプトプロパティ LEGACY_IMPORTED を削除してから実行してください。');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(LEGACY_SHEET_NAME);
  if (!src) throw new Error(`「${LEGACY_SHEET_NAME}」シートが見つかりません。移行データ.xlsx を「新しいシートを挿入」で読み込んでください。`);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("System is busy.");
  try {
    const raw = src.getDataRange().getValues();
    const rows = [];
    for (let i = 1; i < raw.length; i++) {
      const r = raw[i];
      if (String(r[4] || '').trim() && String(r[11] || '').trim().startsWith('{')) rows.push({ rowNum: i + 1, data: r });
    }
    if (rows.length === 0) throw new Error('取り込む行がありません。');

    // 末尾の空セルを除いた最大列数
    let width = 11;
    rows.forEach(({ data: r }) => { for (let c = r.length - 1; c >= width; c--) { if (r[c] !== '' && r[c] != null) { width = c + 1; break; } } });
    const values = rows.map(({ rowNum, data: r }) => {
      const out = [];
      for (let c = 0; c < width; c++) {
        const v = r[c] == null ? '' : String(r[c]);
        out.push(c >= 11 ? sanitizeJsonString_(v) : v);
      }
      try {
        JSON.parse(out.slice(11).join(''));  // 壊れた行があれば書き込む前に止める
      } catch (e) {
        throw new Error(`移行データ ${rowNum}行目（${out[4]}）のJSONエラー: ${e.message}`);
      }
      return out;
    });

    let dest = ss.getSheetByName(CONFIG.SHEET_MAIN);
    if (!dest) dest = ss.insertSheet(CONFIG.SHEET_MAIN);
    const startRow = Math.max(dest.getLastRow(), 1) + 1;
    if (dest.getMaxColumns() < width) dest.insertColumnsAfter(dest.getMaxColumns(), width - dest.getMaxColumns());
    if (dest.getMaxRows() < startRow + values.length - 1) dest.insertRowsAfter(dest.getMaxRows(), startRow + values.length - 1 - dest.getMaxRows());

    const range = dest.getRange(startRow, 1, values.length, width);
    range.setNumberFormat('@');  // 本文(JSON)が数式・日付・数値として解釈されないよう書式なしテキストにする
    range.setValues(values);
    const agtAdded = importLegacyAgtMaster_(ss);
    const areaAdded = importLegacyAreaMaster_(ss);
    SpreadsheetApp.flush();
    bumpCache_();
    props.setProperty('LEGACY_IMPORTED', 'true');
    Logger.log(`AGTマスタに${agtAdded}社、エリアマスタに${areaAdded}件を追加しました。`);
    backupData_('LEGACY_IMPORT', `${startRow}-${startRow + values.length - 1}`, [`${values.length}件`]);
    Logger.log(`${values.length}件を「${CONFIG.SHEET_MAIN}」の${startRow}行目から取り込みました。`);
  } finally { lock.releaseLock(); }
}

// 「移行AGTマスタ」シートの行のうち、AGTマスタに未登録のコードだけを追加する
function importLegacyAgtMaster_(ss) {
  const src = ss.getSheetByName('移行AGTマスタ');
  if (!src || src.getLastRow() < 2) return 0;
  const rows = src.getDataRange().getValues();
  const header = rows[0].map(String);
  let dest = ss.getSheetByName(CONFIG.SHEET_AGT);
  if (!dest) { dest = ss.insertSheet(CONFIG.SHEET_AGT); dest.appendRow(header); }
  const existing = new Set(dest.getLastRow() > 1
    ? dest.getRange(2, 1, dest.getLastRow() - 1, 1).getValues().flat().map(v => String(v).trim()) : []);
  const add = rows.slice(1)
    .filter(r => String(r[0]).trim() && !existing.has(String(r[0]).trim()))
    .map(r => header.map((_, i) => r[i] == null ? '' : String(r[i])));
  if (add.length) dest.getRange(dest.getLastRow() + 1, 1, add.length, header.length).setValues(add);
  return add.length;
}

// 「移行エリア」シートのエリアのうち、管理マスタC列に未登録のものだけを追加する
function importLegacyAreaMaster_(ss) {
  const src = ss.getSheetByName('移行エリア');
  if (!src || src.getLastRow() < 2) return 0;
  const areas = src.getRange(2, 1, src.getLastRow() - 1, 1).getValues().flat().map(v => String(v).trim()).filter(Boolean);
  const admin = ss.getSheetByName(CONFIG.SHEET_ADMIN);
  if (!admin) return 0;
  const colC = admin.getLastRow() > 1 ? admin.getRange(2, 3, admin.getLastRow() - 1, 1).getValues().flat().map(v => String(v).trim()) : [];
  const existing = new Set(colC.filter(Boolean));
  const add = areas.filter(a => !existing.has(a));
  if (!add.length) return 0;
  let lastC = colC.length;
  while (lastC > 0 && !colC[lastC - 1]) lastC--;
  admin.getRange(2 + lastC, 3, add.length, 1).setValues(add.map(a => [a]));
  return add.length;
}

// ==========================================
// ★ サイドバーの並び順(管理者がドラッグで変更)
//   「表示順」シート: A列=親のパス(JSON配列) / B列=子の並び(JSON配列) / C列=更新者 / D列=更新日時
//   本体データのキャッシュは消さず、並び順だけ別キャッシュで管理する
// ==========================================
const TREE_ORDER_CACHE_KEY = 'TREE_ORDER_V1';

function getTreeOrder_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(TREE_ORDER_CACHE_KEY);
  if (cached) { try { return JSON.parse(cached); } catch (e) {} }
  const order = {};
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_ORDER);
    if (sheet && sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(r => {
        const key = String(r[0] || '');
        if (!key) return;
        const list = parseJsonSafe_(String(r[1] || '[]'));
        if (Array.isArray(list)) order[key] = list.map(String);
      });
    }
    const json = JSON.stringify(order);
    if (json.length < 90000) cache.put(TREE_ORDER_CACHE_KEY, json, 21600);
  } catch (e) {}
  return order;
}

function saveTreeOrder(parentKey, names) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  if (typeof parentKey !== 'string' || !Array.isArray(names)) throw new Error("Invalid request.");
  const list = names.map(n => String(n)).slice(0, 2000);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("System is busy.");
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_ORDER);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_ORDER);
      sheet.appendRow(['親のパス', '並び順', '更新者', '更新日時']);
    }
    const user = Session.getActiveUser().getEmail();
    const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
    const row = [parentKey, JSON.stringify(list), user, ts];
    const last = sheet.getLastRow();
    let target = -1;
    if (last >= 2) {
      const keys = sheet.getRange(2, 1, last - 1, 1).getValues().flat().map(String);
      const i = keys.indexOf(parentKey);
      if (i >= 0) target = i + 2;
    }
    const range = sheet.getRange(target > 0 ? target : last + 1, 1, 1, 4);
    range.setNumberFormat('@');
    range.setValues([row]);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove(TREE_ORDER_CACHE_KEY);
    return { status: "success" };
  } finally { lock.releaseLock(); }
}

// ==========================================
// ★ 旧商説スプレッドシートからの再取り込み(差分同期)
//   ブラウザ側(Index.html の LegacyConverter)で xlsx を変換し、ここで既存行と照合・反映する。
//   照合キー: 元ブック名(タグの先頭) + タイトル。同名が複数ある場合は出現順で対応付ける。
// ==========================================
const LEGACY_FP_SKIP = { rowId: 1, status: 1, is_draft: 1, updated_at: 1, src: 1 };

// legacy_converter.js の fnv / fieldFingerprints と同じ計算
function legacyFnv_(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

function legacyFingerprints_(rec) {
  const out = {};
  Object.keys(rec).sort().forEach(k => {
    if (!LEGACY_FP_SKIP[k] && rec[k] !== '' && rec[k] != null) out[k] = legacyFnv_(String(rec[k]));
  });
  return out;
}

function getLegacySyncIndex() {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_MAIN);
  if (!sheet || sheet.getLastRow() < 2) return { status: "success", rows: [] };
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const title = String(r[4] || '').trim();
    if (!title) continue;
    const tags = String(r[9] || '').split(',').map(t => t.trim()).filter(Boolean);
    let rec = null;
    for (const idx of [11, 10, 8, 7, 5]) {
      if (String(r[idx] || '').trim().startsWith('{')) { rec = parseJsonSafe_(r.slice(idx).join('')); if (rec) break; }
    }
    rows.push({
      rowId: i + 1,
      title: title,
      cat: String(r[3] || ''),
      book: tags[0] || '',
      edited: String(r[8] || '').trim() !== '',   // ポータルで保存されると更新日時が入る
      fp: rec ? legacyFingerprints_(rec) : {}
    });
  }
  return { status: "success", rows: rows };
}

function legacyRowValues_(payload, keepDraft) {
  const json = JSON.stringify(payload);
  const chunks = [];
  for (let i = 0; i < json.length; i += 30000) chunks.push(json.substring(i, i + 30000));
  return [
    payload.area || '', payload.country || '', payload.city || '', payload.cat || '', payload.title || '',
    payload.season_year || '', payload.season_type || '', keepDraft || payload.is_draft || 'false',
    '',  // 更新日時は空(旧シート由来の行の目印。ポータルで保存すると日時が入る)
    payload.tags || '', payload.product_url || ''
  ].concat(chunks);
}

/** items: [{ rowId: 既存行(更新時) or null(新規), expectTitle: 更新対象のタイトル, payload }] */
function applyLegacySync(items) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  if (!Array.isArray(items) || !items.length) return { status: "success", updated: 0, added: 0, skipped: [] };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("System is busy.");
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_MAIN);
    let updated = 0, added = 0;
    const skipped = [];
    items.forEach(it => {
      const p = it.payload || {};
      if (!p.title || !p.cat) return;
      const rowId = parseInt(it.rowId, 10);
      if (!isNaN(rowId) && rowId >= 2) {
        // プレビュー後に行がずれていないか確認
        const cur = sheet.getRange(rowId, 1, 1, 11).getValues()[0];
        if (String(cur[4] || '').trim() !== String(it.expectTitle || '').trim()) { skipped.push(p.title); return; }
        const lastCol = Math.max(sheet.getLastColumn(), 11);
        const old = sheet.getRange(rowId, 1, 1, lastCol).getValues()[0];
        backupData_('LEGACY_SYNC', rowId, old);
        const values = legacyRowValues_(p, String(cur[7] || '').trim());
        if (sheet.getMaxColumns() < values.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), values.length - sheet.getMaxColumns());
        sheet.getRange(rowId, 1, 1, lastCol).clearContent();
        const range = sheet.getRange(rowId, 1, 1, values.length);
        range.setNumberFormat('@');
        range.setValues([values]);
        updated++;
      } else {
        const values = legacyRowValues_(p, '');
        if (sheet.getMaxColumns() < values.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), values.length - sheet.getMaxColumns());
        const nextRow = Math.max(sheet.getLastRow(), 1) + 1;
        const range = sheet.getRange(nextRow, 1, 1, values.length);
        range.setNumberFormat('@');
        range.setValues([values]);
        backupData_('LEGACY_SYNC_NEW', nextRow, [p.title]);
        added++;
      }
    });
    SpreadsheetApp.flush();
    bumpCache_();
    return { status: "success", updated: updated, added: added, skipped: skipped };
  } finally { lock.releaseLock(); }
}

/** 新しく出てきたAGTコード・エリアだけをマスタに追加(既存の行は変更しない) */
function applyLegacyMasters(agtRows, areas) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("System is busy.");
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let agtAdded = 0, areaAdded = 0;
    const agt = ss.getSheetByName(CONFIG.SHEET_AGT);
    if (agt && Array.isArray(agtRows) && agtRows.length) {
      const width = Math.max(agt.getLastColumn(), 5);
      const existing = new Set(agt.getLastRow() > 1 ? agt.getRange(2, 1, agt.getLastRow() - 1, 1).getValues().flat().map(v => String(v).trim()) : []);
      const add = agtRows.filter(a => a && a.code && !existing.has(String(a.code).trim())).map(a => {
        const row = new Array(width).fill('');
        row[0] = a.code; row[1] = a.name || ''; row[2] = a.phone || ''; row[3] = a.email || ''; row[4] = a.web || '';
        return row;
      });
      if (add.length) { agt.getRange(agt.getLastRow() + 1, 1, add.length, width).setValues(add); agtAdded = add.length; }
    }
    const admin = ss.getSheetByName(CONFIG.SHEET_ADMIN);
    if (admin && Array.isArray(areas) && areas.length) {
      const colC = admin.getLastRow() > 1 ? admin.getRange(2, 3, admin.getLastRow() - 1, 1).getValues().flat().map(v => String(v).trim()) : [];
      const existing = new Set(colC.filter(Boolean));
      const add = areas.map(a => String(a).trim()).filter(a => a && !existing.has(a));
      if (add.length) {
        let lastC = colC.length;
        while (lastC > 0 && !colC[lastC - 1]) lastC--;
        admin.getRange(2 + lastC, 3, add.length, 1).setValues(add.map(a => [a]));
        areaAdded = add.length;
      }
    }
    SpreadsheetApp.flush();
    if (agtAdded || areaAdded) bumpCache_();
    return { status: "success", agtAdded: agtAdded, areaAdded: areaAdded };
  } finally { lock.releaseLock(); }
}

