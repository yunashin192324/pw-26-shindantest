"use strict";
/**
 * AI Photo Curator — Google Sites「埋め込みコード」専用・素のJavaScript版
 * ============================================================
 * React / JSZip などの外部ライブラリを一切使わず、素のDOM操作だけで
 * 実装しています（Google Sitesの埋め込みコード欄にそのまま貼り付けられる
 * サイズに収めるため）。機能はReact版と完全に同一です。
 */

// ==========================================
// 🔒 Gemini API 呼び出し設定（Apps Script プロキシ経由）
// ==========================================
// このファイル自体はGemini APIキーを一切持ちません。
// 代わりに、社内のGoogleアカウントで動く Google Apps Script の
// Webアプリ（プロキシ）にリクエストを送り、APIキーはそのApps Script側の
// 「スクリプトのプロパティ」にだけ保存します。ブラウザの「ページのソースを
// 表示」を見てもAPIキーは一切出てこないため、社内利用でも安全です。
//
// セットアップ手順は README.md を参照してください。
// デプロイ後に発行される Web アプリURL（.../exec で終わるURL）を
// ここに貼り付けます。
const PROXY_URL = "ここにApps ScriptのWebアプリURLを貼り付け";

// （任意・推奨）Apps Script側で SHARED_SECRET を設定した場合は、
// 同じ文字列をここにも設定すると、プロキシURLが漏れても
// この合言葉を知らない相手からは呼び出せなくなります。
const PROXY_SHARED_SECRET = "";

// ==========================================
// 定数定義
// ==========================================
const RESIZE_W = 900;
const RESIZE_H = 600;

const CRITERIA = [
  { key: "location", label: "撮影場所", weight: 2 },
  { key: "composition", label: "配置・均衡", weight: 2 },
  { key: "brightness", label: "明るさ・色", weight: 1.5 },
  { key: "naturalness", label: "自然な姿", weight: 1.5 },
  { key: "storytelling", label: "物語性", weight: 1 },
];

const SYSTEM_PROMPT = `あなたは、旅行会社でリゾートウェディングやフォトウェディングを体験されたお客様の事例写真をウェブサイトに掲載するため、写真を選定する専門家です。
撮影地は世界中（ハワイ、グアム、ラスベガス、ヨーロッパなど）の様々なロケーションです。
各基準を1〜10点で採点し、掲載に相応しいか評価してください。

【厳格な分類ルール】
1. 背景カテゴリ (sceneCategory): 似た背景の連続を防ぐため、次の中から**写真の大部分を占める要素に最も近いものを1つだけ**選んでください。
   ["ビーチ・海", "大聖堂・教会・歴史的建造物", "自然・緑・森", "岩山・荒野・砂漠", "街並み・ストリート", "屋内・ホテル・カジノ", "夕景・夜景", "その他"]
2. 構図・寄り引き (shotType): 構図のバリエーションを出すため、次の中から**最も当てはまるものを1つだけ**選んでください。
   - "wide" (広大な景色の中に人物が小さく写っている、風景メインの引きの写真)
   - "medium" (人物の全身〜膝上がしっかり写っている、標準的な距離の写真)
   - "close-up" (人物のバストアップ、顔のアップ、または手元などのパーツ写真)
3. モノクロ判定 (isMonochrome): 白黒またはセピア調の場合は true。ウェブサイトはカラー写真を基本とするため、モノクロ写真ばかりにならないようバランスを取ります。
4. 写真の具体的内容 (contentDescription): 最終選考で似た写真の重複を防ぐため、写真の具体的な内容（背景の被写体、人物のポーズ、距離感など。例「エッフェル塔を背景に見つめ合う上半身」「指輪のケースのアップ」「階段で振り返る全身」等）を端的に20文字以内で記述してください。`;

// ==========================================
// IndexedDB ユーティリティ（自動保存機能）
// ==========================================
const DB_NAME = "AIPhotoCuratorDB";
const STORE_NAME = "photos";
const DB_VERSION = 1;

const initDB = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const savePhotoToDB = async (photo) => {
  if (!window.indexedDB) return;
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const photoToSave = { ...photo };
      delete photoToSave.url; // URLは再起動時に無効になるため除外して保存
      store.put(photoToSave);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error("DB保存エラー:", err);
  }
};

const loadPhotosFromDB = async () => {
  if (!window.indexedDB) return [];
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("DB読み込みエラー:", err);
    return [];
  }
};

const clearDB = async () => {
  if (!window.indexedDB) return;
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error("DBクリアエラー:", err);
  }
};

// ==========================================
// ユーティリティ関数
// ==========================================

// ファイル名を「撮影順」として自然順（数値考慮）で比較する。
// 標準の localeCompare だけだと "IMG_2.jpg" が "IMG_10.jpg" より後になり、
// ストーリー性の判定やファイル名順ソートが崩れるため numeric オプションを付与する。
const compareFileNameNatural = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

// HTMLへの文字列埋め込み時のエスケープ（ファイル名・AIの回答テキストなど、
// 外部からの文字列がそのままHTML化されるため、XSS対策として必須）。
const escapeHtml = (value) => {
  const s = value === undefined || value === null ? "" : String(value);
  return s.replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
};

const resizeImageForDownload = (objectUrl, filename) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = RESIZE_W;
        canvas.height = RESIZE_H;
        const ctx = canvas.getContext("2d");

        const srcRatio = img.width / img.height;
        const dstRatio = RESIZE_W / RESIZE_H;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;

        if (srcRatio > dstRatio) {
          sw = img.height * dstRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / dstRatio;
          sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, RESIZE_W, RESIZE_H);
        canvas.toBlob((blob) => {
          if (!blob) throw new Error("Blob生成に失敗しました");
          resolve({ blob, filename: filename.replace(/\.[^.]+$/, "") + "_resized.jpg" });
        }, "image/jpeg", 0.92);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = objectUrl;
  });

const compressImageForAI = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const isPortrait = img.height > img.width;
        const orientation = isPortrait ? "portrait" : "landscape";

        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        const maxSize = 800;

        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
        resolve({ base64, orientation });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("送信用画像の圧縮に失敗しました"));
    img.src = url;
  });

// Gemini APIへの実際のリクエストはすべてこの関数を経由してApps Scriptプロキシに送る。
// payload（contents/generationConfig）はGeminiにそのまま渡す形をクライアント側で組み立て、
// APIキーの付与だけをサーバー側（Apps Script）に任せる。
//
// 注意: Apps ScriptのWebアプリはHTTPステータスコードを自由に返せない仕様のため、
// 成功・失敗の判定はレスポンスJSON本体の中身（error フィールドの有無）で行う。
// また、"application/json" でPOSTするとブラウザがCORSプリフライト(OPTIONS)を送出し、
// Apps Scriptはこれに正しく応答できずエラーになるため、意図的に
// "text/plain" として送信している（本文は引き続きJSON文字列）。
const callGeminiViaProxy = async (payload) => {
  if (!PROXY_URL || PROXY_URL.includes("ここに")) {
    throw new Error("プロキシURLが未設定です。app.js 冒頭の PROXY_URL を設定してください（README参照）。");
  }

  const delays = [1000, 2000, 4000, 8000, 16000];

  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ payload, secret: PROXY_SHARED_SECRET })
      });

      if (!response.ok) {
        throw new Error(`プロキシへの接続に失敗しました: HTTP ${response.status}`);
      }

      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("プロキシから予期しない応答がありました。Apps Scriptのデプロイ設定（アクセス権限・ログイン状態）をご確認ください。");
      }

      if (data.error) {
        const errInfo = data.error;
        const msg = typeof errInfo === "string" ? errInfo : (errInfo.message || JSON.stringify(errInfo));
        const permanentErr = new Error(msg);
        permanentErr.permanent =
          errInfo.code === 401 || errInfo.code === 403 ||
          errInfo.status === "PERMISSION_DENIED" || errInfo.status === "UNAUTHENTICATED";
        throw permanentErr;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("APIレスポンスの形式が異常です（テキストが見つかりません）");
      }

      return JSON.parse(text);
    } catch (error) {
      if (error.permanent || i === 4) {
        if (error.permanent) {
          throw new Error("サーバー側（Apps Script）のAPIキー設定に問題があります。管理者にご連絡ください。\n\nデータはブラウザに安全に保存されていますので、右下の「ページを再読み込み」ボタンを押しても消えません。");
        }
        console.error("API呼び出しが上限回数失敗しました:", error);
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
};

const analyzePhotoWithAPI = async (base64) => {
  const payload = {
    contents: [{
      role: "user",
      parts: [
        { text: SYSTEM_PROMPT },
        { inlineData: { mimeType: "image/jpeg", data: base64 } }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          location: { type: "INTEGER" },
          composition: { type: "INTEGER" },
          brightness: { type: "INTEGER" },
          naturalness: { type: "INTEGER" },
          storytelling: { type: "INTEGER" },
          totalScore: { type: "NUMBER" },
          recommend: { type: "BOOLEAN" },
          reason: { type: "STRING" },
          tags: { type: "ARRAY", items: { type: "STRING" } },
          sceneCategory: { type: "STRING" },
          shotType: { type: "STRING" },
          isMonochrome: { type: "BOOLEAN" },
          contentDescription: { type: "STRING" }
        },
        required: ["location", "composition", "brightness", "naturalness", "storytelling", "totalScore", "recommend", "reason", "tags", "sceneCategory", "shotType", "isMonochrome", "contentDescription"]
      }
    }
  };

  return callGeminiViaProxy(payload);
};

const selectOptimalPhotosWithAI = async (candidates, targetSlots) => {
  const prompt = `あなたはウェディング写真のアルバム構成ディレクターです。
以下のJSONデータは、一次評価を終えた写真の候補リストです。
この中から、指定された「${targetSlots}枠」を埋める最適な写真のIDリストを選出してください。

【最優先事項：「多様性」と「ストーリー展開」をスコアより優先する】
単に高得点の写真を集めるのではなく、1冊のアルバムを通して見るような、
最初から最後までの一連のストーリー（時間の流れ）を感じられる構成にすることを最優先してください。

【逐次選考プロセス（必ず従うこと）】
写真を1枚選ぶたびに、以下の「使用済みリスト」を更新し、次の選択に反映してください：
- 使用済み category リスト（背景カテゴリ）
- 使用済み shotType リスト（構図タイプ）

次の1枚を選ぶ基準（優先順位順）：
  1. まだ使用していない category → まだ使用していない shotType の組み合わせを最優先
  2. まだ使用していない category だけ一致する写真を次点
  3. まだ使用していない shotType だけ一致する写真を次点
  4. どうしても被る場合のみ、同じ category や shotType を許可（その場合は description が全く異なるものを選ぶ）
  5. 上記を満たす写真が複数ある場合のみ、スコアで判断する

【絶対遵守ルール】
1. 同じ category が2枚連続してはいけない
2. 同じ shotType が3枚以上連続してはいけない
3. ストーリー展開: "name"（ファイル名）の順序は撮影順を表しています。序盤・中盤・終盤から均等な間隔でピックアップしてください
4. 枠数の計算: orientation が "landscape" は「1枠」、"portrait" は「0.5枠」として計算し、縦画像は必ず偶数枚選んでください
5. isMonochrome が true の写真は全体の1〜2枚以内に抑えること
6. 合計枠数が必ず ${targetSlots} 枠にぴったり一致すること

【候補データ】
${JSON.stringify(candidates)}
`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          selectedIds: { type: "ARRAY", items: { type: "STRING" } },
          reasoning: { type: "STRING" }
        },
        required: ["selectedIds", "reasoning"]
      }
    }
  };

  return callGeminiViaProxy(payload);
};

const formatRemainingTime = (ms) => {
  if (ms === null || ms === undefined) return "計算中...";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `残り約 ${minutes}分 ${seconds.toString().padStart(2, '0')}秒`;
  }
  return `残り約 ${seconds}秒`;
};

// ==========================================
// 自前ZIP生成（無圧縮=STORE方式。JSZip等の外部ライブラリ不使用）
// ==========================================
const crc32 = (() => {
  let table = null;
  return (bytes) => {
    if (!table) {
      table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
})();

const dosDateTime = (date) => ({
  time: ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F),
  date: (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F),
});

// files: [{ name: string, data: Uint8Array }] -> Blob(application/zip)
const createZip = (files) => {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralEntries = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);
    const localHeaderOffset = offset;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true); // 圧縮方式: 0 = 無圧縮(store)
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    offset += 30 + nameBytes.length + data.length;

    centralEntries.push({ nameBytes, crc, size: data.length, localHeaderOffset, time, date });
  }

  const centralDirStart = offset;
  for (const entry of centralEntries) {
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, entry.time, true);
    central.setUint16(14, entry.date, true);
    central.setUint32(16, entry.crc, true);
    central.setUint32(20, entry.size, true);
    central.setUint32(24, entry.size, true);
    central.setUint16(28, entry.nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, entry.localHeaderOffset, true);
    chunks.push(new Uint8Array(central.buffer), entry.nameBytes);
    offset += 46 + entry.nameBytes.length;
  }
  const centralDirSize = offset - centralDirStart;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, centralEntries.length, true);
  eocd.setUint16(10, centralEntries.length, true);
  eocd.setUint32(12, centralDirSize, true);
  eocd.setUint32(16, centralDirStart, true);
  eocd.setUint16(20, 0, true);
  chunks.push(new Uint8Array(eocd.buffer));

  return new Blob(chunks, { type: "application/zip" });
};

// ==========================================
// アイコン（SVG）ヘルパー
// ==========================================
const iconSpinner = (sizeClasses, colorClass) =>
  `<svg class="animate-spin ${sizeClasses} ${colorClass}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

// ==========================================
// アプリケーション状態
// ==========================================
const state = {
  photos: [],
  processing: false,
  filter: "all",
  sortBy: "score",
  pickCount: 16,
  isDragging: false,
  timeRemaining: null,
  isSelectingAI: false,
  isZipping: false,
  showClearModal: false,
  errorMessage: null,
};
let objectUrls = [];
// 「全データ消去」が押されるたびに増分するトークン。
// 消去前から走っていた非同期処理（評価API・AI最終選考）が、消去後に
// 古い結果を state.photos / savePhotoToDB に書き戻して「ゾンビデータ」を
// 復活させてしまうのを防ぐために使う。
let resetToken = 0;

const countDone = () => state.photos.filter(p => p.status === "done").length;
const countError = () => state.photos.filter(p => p.status === "error").length;
const countSelected = () => state.photos.filter(p => p.selected).length;

// ==========================================
// サブコンポーネント（HTML文字列を返す関数）
// ==========================================
function renderScoreBadge(score) {
  const safeScore = typeof score === "number" ? score : 0;
  const colorClass = safeScore >= 8 ? "bg-green-500" : safeScore >= 6 ? "bg-amber-500" : "bg-red-500";
  return `<div class="${colorClass} text-white font-mono font-bold text-xl rounded-md px-2 py-0.5 inline-block tracking-wider">${safeScore.toFixed(1)}</div>`;
}

function renderCriteriaBar(label, score) {
  const safeScore = typeof score === "number" ? score : 0;
  const colorClass = safeScore >= 8 ? "bg-green-500" : safeScore >= 6 ? "bg-amber-500" : "bg-red-500";
  return `<div class="mb-1">
    <div class="flex justify-between text-[11px] text-neutral-400 mb-0.5"><span>${escapeHtml(label)}</span><span>${safeScore}/10</span></div>
    <div class="h-1 bg-neutral-800 rounded-full overflow-hidden">
      <div class="h-full ${colorClass} rounded-full transition-all duration-700 ease-out" style="width:${safeScore * 10}%"></div>
    </div>
  </div>`;
}

// ==========================================
// メインレンダリング
// ==========================================
function renderHeader() {
  const total = state.photos.length;
  const doneCount = countDone();
  const selectedCount = countSelected();

  const statsHtml = total > 0 ? `
    <div class="flex items-center gap-3 mr-2">
      <span class="text-xs text-neutral-400">評価完了: ${doneCount}/${total}枚</span>
      <span class="text-xs text-[#c9a96e] font-medium border-l border-neutral-700 pl-3">選択中: ${selectedCount}枚</span>
    </div>` : "";

  const aiDisabled = state.isSelectingAI || state.processing || doneCount === 0;
  const aiControlsHtml = total > 0 ? `
    <div class="flex items-center gap-2">
      <button data-action="auto-select" ${aiDisabled ? "disabled" : ""} ${doneCount === 0 ? 'title="評価が完了した写真がありません"' : ""}
        class="text-black border-none rounded-md px-4 py-2 text-xs font-bold transition-colors flex items-center gap-2 ${aiDisabled ? "bg-[#c9a96e]/50 cursor-not-allowed" : "bg-[#c9a96e] hover:bg-[#b8985d] cursor-pointer"}">
        ${state.isSelectingAI ? `${iconSpinner("h-3 w-3", "text-black")}AIが最終調整中...` : `上位${state.pickCount}枚をAI選考`}
      </button>
      <select data-action="set-pick-count" class="bg-[#1a1a1a] text-[#e8e0d8] border border-[#333] rounded-md px-2 py-2 text-xs focus:outline-none focus:border-[#c9a96e] cursor-pointer">
        ${[4, 8, 12, 16, 20, 30].map(n => `<option value="${n}" ${state.pickCount === n ? "selected" : ""}>${n}枚</option>`).join("")}
      </select>
    </div>` : "";

  const clearButtonHtml = total > 0 ? `
    <button data-action="open-clear-modal" title="保存されているすべてのデータを完全に消去します"
      class="bg-transparent hover:bg-red-950/30 text-neutral-400 hover:text-red-400 border border-[#333] hover:border-red-900/50 rounded-md px-3 py-2 text-xs cursor-pointer transition-colors">全データ消去</button>` : "";

  return `<header class="sticky top-0 z-50 border-b border-[#222] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between bg-[#0f0f0f]/95 backdrop-blur-sm gap-4">
    <div>
      <div class="text-[10px] tracking-widest text-neutral-500 uppercase mb-1">AI Photo Curator</div>
      <h1 class="text-xl font-medium tracking-wide">自動画像評価システム</h1>
      <div class="text-[10px] text-neutral-500 mt-1">保存時の寸法：${RESIZE_W} × ${RESIZE_H} px</div>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      ${statsHtml}
      ${aiControlsHtml}
      <div class="flex gap-2">
        <button data-action="open-file-picker" class="bg-[#222] hover:bg-[#333] text-[#e8e0d8] border border-[#444] rounded-md px-4 py-2 text-xs cursor-pointer transition-colors">写真を追加</button>
        <button data-action="open-folder-picker" title="Googleドライブなどのフォルダを丸ごと追加" class="bg-[#222] hover:bg-[#333] text-[#e8e0d8] border border-[#444] rounded-md px-4 py-2 text-xs cursor-pointer transition-colors hidden sm:block">フォルダ読込</button>
        ${clearButtonHtml}
      </div>
    </div>
  </header>`;
}

function renderDropzone() {
  const dragging = state.isDragging;
  return `<div class="flex-1 flex items-center justify-center p-6">
    <div data-dropzone data-action="open-file-picker"
      class="w-full max-w-2xl border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[400px] ${dragging ? "border-[#c9a96e] bg-[#c9a96e]/10 scale-[1.02]" : "border-[#333] hover:border-[#555] hover:bg-[#111]"}">
      <div class="mb-4">
        <svg class="w-16 h-16 ${dragging ? "text-[#c9a96e]" : "text-neutral-600"}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <div class="text-xl mb-3 font-medium ${dragging ? "text-[#c9a96e]" : "text-[#e8e0d8]"}">画像ファイルをここにドロップ</div>
      <div class="text-sm text-neutral-500 leading-relaxed">またはクリックしてファイルを選択<br>（複数選択可能・JPEG, PNG, WebP対応）</div>
    </div>
  </div>`;
}

function renderProgressBar() {
  if (!state.processing) return "";
  const doneCount = countDone();
  const errorCount = countError();
  const total = state.photos.length;
  const progressPercent = total > 0 ? Math.round(((doneCount + errorCount) / total) * 100) : 0;
  return `<div class="px-6 py-3 bg-[#111] border-b border-[#1e1e1e]">
    <div class="flex justify-between text-xs text-neutral-400 mb-2">
      <span class="flex items-center gap-2">
        ${iconSpinner("h-3 w-3", "text-[#c9a96e]")}
        AIが画像を評価しています...
        <span class="text-[#c9a96e]/80 ml-1">(${formatRemainingTime(state.timeRemaining)})</span>
      </span>
      <span>${progressPercent}%</span>
    </div>
    <div class="h-1.5 bg-[#222] rounded-full overflow-hidden">
      <div class="h-full bg-[#c9a96e] rounded-full transition-all duration-300 ease-out" style="width:${progressPercent}%"></div>
    </div>
  </div>`;
}

function renderToolbar() {
  const total = state.photos.length;
  const selectedCount = countSelected();
  const recommendedCount = state.photos.filter(p => p.result && p.result.recommend).length;
  const excludedCount = state.photos.filter(p => p.status === "done" && !(p.result && p.result.recommend)).length;

  const filters = [
    { key: "all", label: `すべて (${total})` },
    { key: "recommended", label: `推奨 (${recommendedCount})` },
    { key: "selected", label: `選択中 (${selectedCount})` },
    { key: "excluded", label: `非推奨 (${excludedCount})` },
  ];
  const sorts = [
    { key: "score", label: "点数順" },
    { key: "name", label: "ファイル名順" },
  ];

  return `<div class="px-6 py-4 border-b border-[#1a1a1a] flex flex-wrap gap-4 items-center justify-between bg-[#0a0a0a] sticky top-[73px] z-40">
    <div class="flex flex-wrap gap-2">
      ${filters.map(f => `<button data-action="set-filter" data-value="${f.key}" class="px-4 py-1.5 rounded-full text-xs font-medium transition-colors border ${state.filter === f.key ? "border-[#c9a96e] bg-[#c9a96e]/10 text-[#c9a96e]" : "border-[#333] bg-transparent text-neutral-400 hover:border-[#555] hover:text-[#e8e0d8]"}">${escapeHtml(f.label)}</button>`).join("")}
    </div>
    <div class="flex items-center gap-2">
      <span class="text-xs text-neutral-500 mr-1">並び替え:</span>
      ${sorts.map(s => `<button data-action="set-sort" data-value="${s.key}" class="px-3 py-1.5 rounded text-[11px] transition-colors border ${state.sortBy === s.key ? "border-[#444] bg-[#222] text-[#e8e0d8]" : "border-transparent bg-transparent text-neutral-500 hover:text-neutral-300 hover:bg-[#111]"}">${escapeHtml(s.label)}</button>`).join("")}
    </div>
  </div>`;
}

function renderPhotoCard(photo) {
  const isDone = photo.status === "done";
  const isError = photo.status === "error";
  const isPending = photo.status === "pending";
  const result = photo.result;

  const cardStateClass = photo.selected
    ? "ring-2 ring-[#c9a96e] ring-offset-2 ring-offset-[#0a0a0a] transform scale-[1.02]"
    : (isDone && result && result.recommend)
      ? "border border-[#2a3a2a] hover:border-[#4a5a4a]"
      : "border border-[#1e1e1e] hover:border-[#333]";

  const tags = (result && result.tags) || [];
  const tagsHtml = tags.slice(0, 3).map(tag => `<span class="bg-black/60 backdrop-blur-md text-neutral-300 text-[10px] px-2 py-0.5 rounded shadow-sm">#${escapeHtml(tag)}</span>`).join("");
  const moreTagsHtml = tags.length > 3 ? `<span class="bg-black/60 backdrop-blur-md text-neutral-400 text-[10px] px-1.5 py-0.5 rounded shadow-sm">+${tags.length - 3}</span>` : "";

  let badgesHtml = "";
  if (isDone) {
    const shotLabel = result && result.shotType
      ? (result.shotType === "wide" ? "引き" : result.shotType === "close-up" ? "アップ" : "全身/標準")
      : "";
    badgesHtml = `<div class="absolute bottom-2 right-2 flex gap-1 flex-wrap justify-end">
      <span class="bg-black/70 backdrop-blur-md text-[#c9a96e] text-[10px] px-1.5 py-0.5 rounded shadow-sm border border-[#c9a96e]/30">${photo.orientation === "landscape" ? "横画像" : "縦画像"}</span>
      ${result && result.shotType ? `<span class="bg-blue-900/80 text-blue-100 font-medium text-[10px] px-1.5 py-0.5 rounded shadow-sm border border-blue-700/50">${escapeHtml(shotLabel)}</span>` : ""}
      ${result && result.isMonochrome ? `<span class="bg-neutral-800 text-neutral-300 font-medium text-[10px] px-1.5 py-0.5 rounded shadow-sm border border-neutral-600">モノクロ</span>` : ""}
      ${result && result.sceneCategory ? `<span class="bg-[#c9a96e]/90 text-black font-medium text-[10px] px-1.5 py-0.5 rounded shadow-sm">${escapeHtml(result.sceneCategory)}</span>` : ""}
    </div>`;
  }

  const checkHtml = photo.selected ? `<div class="absolute top-2 right-2 bg-[#c9a96e] text-black rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shadow-lg transform scale-in">
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>
  </div>` : "";

  const pendingHtml = isPending ? `<div class="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-xs text-neutral-300">
    ${iconSpinner("h-6 w-6 mb-2", "text-[#c9a96e]")}評価待機中...
  </div>` : "";

  const errorHtml = isError ? `<div class="absolute inset-0 bg-red-950/70 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
    <svg class="w-8 h-8 text-red-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
    <span class="text-xs text-red-200 font-medium">評価失敗</span>
    <span class="text-[10px] text-red-400 mt-1 line-clamp-2">${escapeHtml(photo.errorMsg)}</span>
  </div>` : "";

  const detailHtml = result ? `<div class="flex-1 flex flex-col">
    <div class="text-[11px] text-neutral-300 leading-relaxed mb-4 flex-1 opacity-90 line-clamp-3" title="${escapeHtml(result.contentDescription || result.reason)}">${escapeHtml(result.contentDescription || result.reason)}</div>
    <div class="space-y-1.5 mt-auto pt-3 border-t border-[#222]">${CRITERIA.map(c => renderCriteriaBar(c.label, result[c.key] || 0)).join("")}</div>
    <div class="mt-4 flex justify-end">
      <button data-action="download-one" data-id="${photo.id}" class="flex items-center gap-1.5 bg-[#222] hover:bg-[#333] border border-[#333] hover:border-[#555] text-neutral-300 rounded px-3 py-1.5 text-[10px] transition-colors">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>個別保存
      </button>
    </div>
  </div>` : "";

  return `<div ${isDone ? `data-action="toggle-select" data-id="${photo.id}"` : ""}
    class="bg-[#111] rounded-xl overflow-hidden transition-all duration-200 group flex flex-col ${cardStateClass} ${isDone ? "cursor-pointer" : "cursor-default opacity-80"}">
    <div class="relative aspect-[4/3] overflow-hidden bg-[#050505]">
      <img src="${photo.url}" alt="${escapeHtml(photo.name)}" class="w-full h-full object-cover transition-transform duration-700 ${isDone ? "group-hover:scale-105" : ""}">
      <div class="absolute top-2 left-2 flex flex-wrap gap-1.5 max-w-[80%]">${tagsHtml}${moreTagsHtml}</div>
      ${badgesHtml}
      ${checkHtml}
      ${pendingHtml}
      ${errorHtml}
    </div>
    <div class="p-4 flex flex-col flex-1 bg-gradient-to-b from-[#151515] to-[#0f0f0f]">
      <div class="flex justify-between items-start mb-3 gap-2">
        <div class="text-[11px] text-neutral-400 truncate flex-1 font-medium leading-tight" title="${escapeHtml(photo.name)}">${escapeHtml(photo.name)}</div>
        ${result ? renderScoreBadge(result.totalScore) : ""}
      </div>
      ${detailHtml}
    </div>
  </div>`;
}

function getSortedFilteredPhotos() {
  const sorted = state.photos.slice().sort((a, b) => {
    if (state.sortBy === "score") {
      const scoreA = (a.result && a.result.totalScore) || (a.status === "error" ? -1 : 0);
      const scoreB = (b.result && b.result.totalScore) || (b.status === "error" ? -1 : 0);
      return scoreB - scoreA;
    }
    if (state.sortBy === "name") return compareFileNameNatural(a.name, b.name);
    return 0;
  });

  return sorted.filter(p => {
    if (state.filter === "recommended") return p.result && p.result.recommend;
    if (state.filter === "selected") return p.selected;
    if (state.filter === "excluded") return p.status === "done" && !(p.result && p.result.recommend);
    return true;
  });
}

function renderPhotosList() {
  const filteredPhotos = getSortedFilteredPhotos();
  const gridHtml = filteredPhotos.map(renderPhotoCard).join("");

  return `<div class="flex flex-col flex-1 pb-24">
    ${renderProgressBar()}
    ${renderToolbar()}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 p-6">${gridHtml}</div>
    ${filteredPhotos.length === 0 ? `<div class="flex-1 flex items-center justify-center text-neutral-500 text-sm">表示できる画像がありません。</div>` : ""}
  </div>`;
}

function renderFloatingBar() {
  const selectedCount = countSelected();
  if (selectedCount === 0) return "";
  const names = state.photos.filter(p => p.selected).map(p => p.name).join(" / ");
  return `<div class="fixed bottom-0 left-0 right-0 bg-[#0f0f0f]/95 backdrop-blur-md border-t border-[#222] px-6 py-4 flex items-center gap-4 z-50 transform transition-transform duration-300 translate-y-0">
    <div class="flex items-center gap-2 text-[#c9a96e]">
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
      <span class="font-bold text-sm">${selectedCount}枚選択中</span>
    </div>
    <div class="flex-1 text-[11px] text-neutral-500 truncate px-4 hidden sm:block">${escapeHtml(names)}</div>
    <button data-action="download-zip" ${state.isZipping ? "disabled" : ""} class="ml-auto bg-gradient-to-r from-[#d4b479] to-[#c9a96e] hover:from-[#e5c58a] hover:to-[#d4b479] text-black border-none rounded-lg px-6 py-2.5 text-sm font-bold shadow-lg shadow-[#c9a96e]/20 flex items-center gap-2 transition-all transform active:scale-95 ${state.isZipping ? "opacity-75 cursor-wait" : "cursor-pointer"}">
      ${state.isZipping
        ? `${iconSpinner("h-4 w-4", "text-black")}ZIP作成中...`
        : `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>選択した画像をZIPで保存`}
    </button>
  </div>`;
}

function renderClearModal() {
  if (!state.showClearModal) return "";
  return `<div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
    <div class="bg-[#111] border border-[#333] rounded-xl p-6 max-w-md w-full shadow-2xl">
      <h3 class="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        データを完全に消去しますか？
      </h3>
      <p class="text-sm text-neutral-400 mb-6 leading-relaxed">現在ブラウザに保存されているすべての画像データとAIの評価結果を完全に削除します。この操作は取り消せません。</p>
      <div class="flex justify-end gap-3">
        <button data-action="close-clear-modal" class="px-4 py-2 rounded text-sm text-neutral-300 bg-[#222] hover:bg-[#333] transition-colors">キャンセル</button>
        <button data-action="confirm-clear" class="px-4 py-2 rounded text-sm bg-red-900/60 hover:bg-red-700 text-red-100 transition-colors font-bold">完全に消去する</button>
      </div>
    </div>
  </div>`;
}

function renderErrorModal() {
  if (!state.errorMessage) return "";
  const showReload = state.errorMessage.includes("再読み込み");
  return `<div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
    <div class="bg-[#111] border border-[#333] rounded-xl p-6 max-w-md w-full shadow-2xl">
      <h3 class="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        エラー
      </h3>
      <p class="text-sm text-neutral-300 mb-6 leading-relaxed whitespace-pre-wrap">${escapeHtml(state.errorMessage)}</p>
      <div class="flex justify-end gap-3">
        <button data-action="close-error-modal" class="px-4 py-2 rounded text-sm bg-[#333] hover:bg-[#444] text-white transition-colors font-bold">閉じる</button>
        ${showReload ? `<button data-action="reload-page" class="px-4 py-2 rounded text-sm bg-red-900/60 hover:bg-red-700 text-red-100 transition-colors font-bold">ページを再読み込み</button>` : ""}
      </div>
    </div>
  </div>`;
}

function renderApp() {
  return `<div class="min-h-screen bg-[#0a0a0a] text-[#e8e0d8] font-sans flex flex-col relative">
    ${renderHeader()}
    <main class="flex-1 flex flex-col relative">
      ${state.photos.length === 0 ? renderDropzone() : renderPhotosList()}
    </main>
    ${renderFloatingBar()}
    ${renderClearModal()}
    ${renderErrorModal()}
  </div>`;
}

function render() {
  document.getElementById("root").innerHTML = renderApp();
}

// ==========================================
// 業務ロジック
// ==========================================
async function loadInitialData() {
  try {
    const savedPhotos = await loadPhotosFromDB();
    if (savedPhotos && savedPhotos.length > 0) {
      const restored = savedPhotos.map(p => {
        const url = URL.createObjectURL(p.file);
        objectUrls.push(url);

        let status = p.status;
        let errorMsg = p.errorMsg;
        if (status === "pending") {
          status = "error";
          errorMsg = "ブラウザの再読み込みにより処理が中断されました。";
          savePhotoToDB({ ...p, status, errorMsg });
        }
        return { ...p, url, status, errorMsg };
      });
      state.photos = restored;
      render();
    }
  } catch (error) {
    console.error("データの復元に失敗しました:", error);
  }
}

async function handleFullReset() {
  try {
    // 実行中の評価処理・AI最終選考からの書き戻しを無効化する
    resetToken += 1;
    await clearDB();
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls = [];
    state.photos = [];
    state.processing = false;
    state.timeRemaining = null;
    state.showClearModal = false;
    render();
  } catch (err) {
    console.error("データの消去に失敗しました", err);
    state.errorMessage = "データの消去に失敗しました。";
    render();
  }
}

function replacePhotoAndRender(id, updated) {
  state.photos = state.photos.map(p => p.id === id ? updated : p);
  render();
}

async function handleFiles(files) {
  const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
  if (!imageFiles.length) return;

  // このバッチ実行中に「全データ消去」が行われたかを判定するためのトークン
  const myResetToken = resetToken;

  const initialPhotos = imageFiles.map((f) => {
    const url = URL.createObjectURL(f);
    objectUrls.push(url);
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      file: f,
      name: f.name,
      type: f.type,
      url,
      orientation: null,
      status: "pending",
      result: null,
      selected: false,
      errorMsg: "",
    };
  });

  state.photos = state.photos.concat(initialPhotos);
  initialPhotos.forEach(p => savePhotoToDB(p));

  state.processing = true;
  state.timeRemaining = null;
  render();

  const startTime = Date.now();
  let processedCount = 0;

  const poolLimit = 3;
  const executing = new Set();

  for (const currentPhoto of initialPhotos) {
    const p = (async () => {
      try {
        const { base64, orientation } = await compressImageForAI(currentPhoto.file);
        const result = await analyzePhotoWithAPI(base64);

        // 消去済みのバッチなら結果を書き戻さない
        if (resetToken !== myResetToken) return;

        const updatedPhoto = { ...currentPhoto, status: "done", result, orientation };
        replacePhotoAndRender(currentPhoto.id, updatedPhoto);
        await savePhotoToDB(updatedPhoto);

      } catch (e) {
        if (resetToken !== myResetToken) return;

        const failedPhoto = { ...currentPhoto, status: "error", errorMsg: e.message };
        replacePhotoAndRender(currentPhoto.id, failedPhoto);
        await savePhotoToDB(failedPhoto);

      } finally {
        processedCount++;
        if (resetToken === myResetToken) {
          const remainingCount = initialPhotos.length - processedCount;
          if (remainingCount > 0) {
            const elapsed = Date.now() - startTime;
            const avgTime = elapsed / processedCount;
            state.timeRemaining = avgTime * remainingCount;
          } else {
            state.timeRemaining = null;
          }
          render();
        }
      }
    })();

    executing.add(p);
    p.finally(() => executing.delete(p));

    if (executing.size >= poolLimit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  if (resetToken === myResetToken) {
    state.processing = false;
    state.timeRemaining = null;
    render();
  }
}

function toggleSelected(id) {
  const photo = state.photos.find(p => p.id === id);
  if (!photo || photo.status !== "done") return;
  const newP = { ...photo, selected: !photo.selected };
  state.photos = state.photos.map(p => p.id === id ? newP : p);
  savePhotoToDB(newP);
  render();
}

async function downloadOne(photo) {
  try {
    const { blob, filename } = await resizeImageForDownload(photo.url, photo.name);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("ダウンロード中にエラーが発生しました", error);
    state.errorMessage = "画像の個別保存に失敗しました。";
    render();
  }
}

async function downloadSelectedAsZip() {
  const selected = state.photos.filter(p => p.selected);
  if (selected.length === 0) return;

  state.isZipping = true;
  render();
  try {
    const files = [];
    for (let i = 0; i < selected.length; i++) {
      const photo = selected[i];
      const { blob, filename } = await resizeImageForDownload(photo.url, photo.name);
      const uniqueFilename = `${String(i + 1).padStart(2, '0')}_${filename}`;
      const buf = new Uint8Array(await blob.arrayBuffer());
      files.push({ name: uniqueFilename, data: buf });
    }

    const zipBlob = createZip(files);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.download = `wedding_photos_${dateStr}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("ZIP作成中にエラーが発生しました", error);
    state.errorMessage = "ZIPファイルの作成・保存に失敗しました。";
  } finally {
    state.isZipping = false;
    render();
  }
}

async function autoSelect() {
  const donePhotos = state.photos.filter(p => p.status === "done");
  if (donePhotos.length === 0) return;

  // 選考の途中で「全データ消去」が行われた場合に結果を書き戻さないためのトークン
  const myResetToken = resetToken;

  state.isSelectingAI = true;
  render();
  try {
    // 🚀 高速化＆タイムアウト防止策＆候補の多様性確保
    const maxCandidates = Math.max(state.pickCount * 4, 40);

    // category × shotType の組み合わせでグループ化
    const groupMap = {};
    for (const photo of donePhotos) {
      const cat = (photo.result && photo.result.sceneCategory) || "その他";
      const shot = (photo.result && photo.result.shotType) || "medium";
      const key = `${cat}__${shot}`;
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(photo);
    }

    // 各グループ内をスコア降順に
    Object.values(groupMap).forEach(g =>
      g.sort((a, b) => ((b.result && b.result.totalScore) || 0) - ((a.result && a.result.totalScore) || 0))
    );

    // ラウンドロビン：各グループから1枚ずつ交互にピック
    const groups = Object.values(groupMap);
    const pickedIds = new Set();
    const targetPhotos = [];
    let round = 0;
    while (targetPhotos.length < maxCandidates) {
      let added = false;
      for (const g of groups) {
        if (g[round] && !pickedIds.has(g[round].id)) {
          pickedIds.add(g[round].id);
          targetPhotos.push(g[round]);
          added = true;
          if (targetPhotos.length >= maxCandidates) break;
        }
      }
      round++;
      if (!added) break;
    }

    // ストーリー性のためファイル名順（自然順）にソート
    targetPhotos.sort((a, b) => compareFileNameNatural(a.name, b.name));

    const candidates = targetPhotos.map(p => ({
      id: p.id,
      name: p.name,
      score: (p.result && p.result.totalScore) || 0,
      description: (p.result && p.result.contentDescription) || "",
      category: (p.result && p.result.sceneCategory) || "other",
      shotType: (p.result && p.result.shotType) || "medium",
      isMonochrome: (p.result && p.result.isMonochrome) || false,
      orientation: p.orientation || "landscape"
    }));

    const selectionResult = await selectOptimalPhotosWithAI(candidates, state.pickCount);

    // 選考中に全データ消去された場合はここで結果を破棄する
    if (resetToken !== myResetToken) return;

    const selectedIds = new Set(selectionResult.selectedIds);

    state.photos = state.photos.map(p => {
      const isSelected = selectedIds.has(p.id);
      if (p.selected !== isSelected) {
        const newP = { ...p, selected: isSelected };
        savePhotoToDB(newP); // 状態が変わったものだけDB更新
        return newP;
      }
      return p;
    });

    console.log("AIの選考理由:", selectionResult.reasoning);
  } catch (error) {
    if (resetToken !== myResetToken) return;

    console.error("AIによる最終選考に失敗しました:", error);

    let errMsg = error.message || "AIによる最終選考に失敗しました。";
    if (errMsg.includes("503") || errMsg.includes("504")) {
      errMsg = "AIの処理時間が長すぎたためタイムアウトしました。時間をおいて再度お試しください。";
    }

    state.errorMessage = errMsg;
  } finally {
    if (resetToken === myResetToken) {
      state.isSelectingAI = false;
    }
    render();
  }
}

// ==========================================
// イベント処理（#rootへのイベント委任）
// ==========================================
function handleRootClick(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  switch (action) {
    case "open-file-picker":
      document.getElementById("fileInput").click();
      break;
    case "open-folder-picker":
      document.getElementById("folderInput").click();
      break;
    case "open-clear-modal":
      state.showClearModal = true;
      render();
      break;
    case "close-clear-modal":
      state.showClearModal = false;
      render();
      break;
    case "confirm-clear":
      handleFullReset();
      break;
    case "close-error-modal":
      state.errorMessage = null;
      render();
      break;
    case "reload-page":
      window.location.reload();
      break;
    case "auto-select":
      autoSelect();
      break;
    case "download-zip":
      downloadSelectedAsZip();
      break;
    case "set-filter":
      state.filter = target.dataset.value;
      render();
      break;
    case "set-sort":
      state.sortBy = target.dataset.value;
      render();
      break;
    case "toggle-select":
      toggleSelected(id);
      break;
    case "download-one": {
      const photo = state.photos.find(p => p.id === id);
      if (photo) downloadOne(photo);
      break;
    }
  }
}

function handleRootChange(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.action === "set-pick-count") {
    state.pickCount = Number(target.value);
    render();
  }
}

function handleRootDragOver(e) {
  if (e.target.closest("[data-dropzone]")) {
    e.preventDefault();
    if (!state.isDragging) {
      state.isDragging = true;
      render();
    }
  }
}

function handleRootDragLeave(e) {
  if (e.target.closest("[data-dropzone]")) {
    e.preventDefault();
    if (state.isDragging) {
      state.isDragging = false;
      render();
    }
  }
}

function handleRootDrop(e) {
  if (!e.target.closest("[data-dropzone]")) return;
  e.preventDefault();
  state.isDragging = false;
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleFiles(e.dataTransfer.files);
  } else {
    render();
  }
}

// ==========================================
// 初期化
// ==========================================
function initApp() {
  const root = document.getElementById("root");
  root.addEventListener("click", handleRootClick);
  root.addEventListener("change", handleRootChange);
  root.addEventListener("dragover", handleRootDragOver);
  root.addEventListener("dragleave", handleRootDragLeave);
  root.addEventListener("drop", handleRootDrop);

  document.getElementById("fileInput").addEventListener("change", e => handleFiles(e.target.files));
  document.getElementById("folderInput").addEventListener("change", e => handleFiles(e.target.files));

  render();
  loadInitialData();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
