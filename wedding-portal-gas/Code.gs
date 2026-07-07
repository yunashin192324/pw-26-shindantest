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

function putLargeCache_(key, dataObj) {
  try {
    const cache = CacheService.getScriptCache();
    const jsonStr = JSON.stringify(dataObj);
    if (jsonStr.length > 1500000) return;
    const chunkSize = 20000; 
    const chunksCount = Math.ceil(jsonStr.length / chunkSize);
    const meta = { count: chunksCount };
    cache.put(key, JSON.stringify(meta), 21600);
    for (let i = 0; i < chunksCount; i++) {
      cache.put(`${key}_${i}`, jsonStr.substring(i * chunkSize, (i + 1) * chunkSize), 21600);
    }
  } catch(e) {}
}

function getLargeCache_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const metaStr = cache.get(key);
    if (!metaStr) return null;
    const meta = JSON.parse(metaStr);
    let jsonStr = "";
    for (let i = 0; i < meta.count; i++) {
      const chunk = cache.get(`${key}_${i}`);
      if (!chunk) return null; 
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

    if (!sheet || sheet.getLastRow() < 2) return { status: "success", structure: baseStructure, isAdmin, userEmail, agtMaster, areaMaster, contactInfo };

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
    return result;
  } catch (e) {
    return { status: "error", message: `Init Error: ${e.message}` };
  }
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
          try { return JSON.parse(row.slice(chunkIdx).join("")); } catch(e) { return null; }
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
      fullSearchText = Object.values(record).join(" ").replace(/<[^>]*>?/gm, ' ').toLowerCase();

      let p_av = String(record.p_av || "").trim();
      let p_bk = String(record.p_bk || "").trim();
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
        try {
          const record = JSON.parse(rowData.slice(idx).join(""));
          record.status = "success";
          record.rowId = rowNum;
          return record;
        } catch(e) { return null; }
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
      sheet.getRange(targetRow, 1, 1, rowToSave.length).setValues([rowToSave]);
      savedId = targetRow;
    } else {
      sheet.appendRow(rowToSave);
      savedId = sheet.getLastRow();
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

function getImagesByIds(ids) {
  try {
    if (!ids || ids.length === 0) return {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_IMAGES);
    if (!sheet) return {};
    const data = sheet.getDataRange().getValues();
    const result = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const imgId = row[0];
      if (ids.includes(imgId)) {
        result[imgId] = row.slice(2).join(""); 
      }
    }
    return result;
  } catch(e) { return {}; }
}

function bulkUpdatePlans(updates) {
  if (!checkAdmin_(Session.getActiveUser().getEmail().toLowerCase())) throw new Error("Unauthorized.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("System is busy.");
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_MAIN);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");

    updates.forEach(u => {
      const rowIdx = parseInt(u.rowId, 10) - 1; 
      if (rowIdx > 0 && rowIdx < values.length) {
        if (u.season_year !== undefined) values[rowIdx][5] = u.season_year;
        if (u.season_type !== undefined) values[rowIdx][6] = u.season_type;
        if (u.is_draft !== undefined) values[rowIdx][7] = u.is_draft;
        
        let currentTags = values[rowIdx][9] ? String(values[rowIdx][9]).split(',').map(t=>t.trim()) : [];
        if (u.add_tags) {
            u.add_tags.split(',').forEach(t => { if(t.trim() && !currentTags.includes(t.trim())) currentTags.push(t.trim()); });
        }
        if (u.remove_tags) {
            const toRemove = u.remove_tags.split(',').map(t=>t.trim());
            currentTags = currentTags.filter(t => !toRemove.includes(t));
        }
        values[rowIdx][9] = currentTags.filter(Boolean).join(', ');
        values[rowIdx][8] = timestamp;
        
        backupData_('BULK_UPDATE', u.rowId, values[rowIdx]);
      }
    });
    
    dataRange.setValues(values);
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
  Logger.log('1.5MB上限に対して: ' + Math.round(JSON.stringify(data).length / 15000) + '%');
}