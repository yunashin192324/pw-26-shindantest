/**
 * formItemMaster.gs
 * 第3章の「質問IDで取得する」方式に基づき、フォーム回答（FormResponse）を
 * FormItemMasterの定義を頼りに内部項目名・格納先テーブル／列へ変換する。
 * 列位置（A1形式の列レター）は一切使わない（第3章2-2章）。
 *
 * 前提：FormItemMasterシートのD〜H列（格納先テーブル・格納先列・分岐・型・正規化ルールID）は、
 * 第3章3-1章の運用どおり、初期セットアップ後に運用担当者が第1章6章・第2章の対応表を見ながら
 * 手動で埋めてあるものとする。
 */

/**
 * FormResponseを受け取り、内部項目名ベースのレコード群に変換する。
 * 戻り値:
 * {
 *   byTable: { Cases: {...}, Customers: {...}, WeddingRequests: {...}, PhotoRequests: {...} },
 *   consultationType: '挙式' | 'フォト' | null,   // 第1章6章No.21（相談内容①）の値
 *   unmapped: [ { itemId, title, value } ]         // FormItemMasterに存在しない質問ID（第3章5章）
 * }
 */
function mapFormResponseToRecords_(formResponse) {
  const masterRows = sheetToObjects_(getSheet_(SHEET_NAMES.FORM_ITEM_MASTER))
    .filter(function (r) { return r.有効フラグ === true || r.有効フラグ === 'TRUE'; });
  const masterByItemId = {};
  masterRows.forEach(function (r) { masterByItemId[String(r.ITEM_ID)] = r; });

  const itemResponses = formResponse.getItemResponses();
  const byTable = { Cases: {}, Customers: {}, WeddingRequests: {}, PhotoRequests: {} };
  const unmapped = [];
  let consultationType = null; // No.21の値から挙式／フォトを判定（第1章6-1章No.21）
  let groomAddressRaw = null;

  // 1パス目：新郎住所の値を先に確保しておく（新婦住所「同上」正規化で使うため。第3章4章N-02）
  itemResponses.forEach(function (ir) {
    const master = masterByItemId[String(ir.getItem().getId())];
    if (master && master.内部項目名 === '新郎住所') {
      groomAddressRaw = ir.getResponse();
    }
  });

  itemResponses.forEach(function (ir) {
    const itemId = String(ir.getItem().getId());
    const master = masterByItemId[itemId];
    const rawValue = ir.getResponse();

    if (!master) {
      unmapped.push({ itemId: itemId, title: ir.getItem().getTitle(), value: rawValue });
      return;
    }

    // No.21相当：相談内容①（分岐トリガー）。内部項目名を「相談内容①」として運用担当者に登録してもらう想定。
    if (master.内部項目名 === '相談内容①') {
      consultationType = normalizeConsultationType_(rawValue);
    }

    if (!master.格納先テーブル || !master.格納先列) {
      // 未確定（例：No.3個人情報同意はFormResponses原本のみに残す。第3章6章）のため、DBには書かない。
      return;
    }

    let value = rawValue;
    switch (master.正規化ルールID) {
      case 'N-01': // 複数選択：カンマ区切り → パイプ区切りに統一
        value = normalizeMultiSelect_(rawValue);
        break;
      case 'N-02': // 新婦住所「同上」→ 新郎住所を複写
        value = normalizeBrideAddress_(groomAddressRaw, rawValue);
        break;
      case 'N-03': // 日付自由記述：確定日 or 時期表現
        value = normalizeFreeformDate_(rawValue);
        break;
      case 'N-04': // 未回答はNULL（空欄）のまま。0や"未回答"等の文字列は入れない
      default:
        value = isBlank_(rawValue) ? '' : rawValue;
        break;
    }

    const table = byTable[master.格納先テーブル];
    if (table) {
      table[master.格納先列] = value;
    }
  });

  return { byTable: byTable, consultationType: consultationType, unmapped: unmapped };
}

function normalizeConsultationType_(rawValue) {
  const v = String(rawValue || '');
  if (v.indexOf('フォト') !== -1) return 'フォト';
  if (v.indexOf('挙式') !== -1) return '挙式';
  return null;
}

/** 第3章4章N-01：複数選択項目はGoogle Formsのカンマ区切りをパイプ（｜）区切りへ統一する */
function normalizeMultiSelect_(rawValue) {
  if (isBlank_(rawValue)) return '';
  return String(rawValue).split(',').map(function (s) { return s.trim(); }).join('｜');
}

/**
 * 第3章4章N-03：確定日と幅のある時期表現が混在する自由記述。
 * "YYYY年MM月DD日" 形式で解釈できれば確定日（ISO文字列）、できなければ時期表現としてそのまま返す。
 */
function normalizeFreeformDate_(rawValue) {
  if (isBlank_(rawValue)) return '';
  const m = String(rawValue).match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return formatDateISO_(d);
  }
  return rawValue; // 時期表現（幅のある表現）はそのまま文字列として保存
}
