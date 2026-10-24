// 外部の監査報告（ChatGPT・Gemini）の指摘を、1つずつ合否の出る試験にしたもの。
// 修正前（v2.7.7）では指摘どおりの不具合が再現し、修正後（v2.7.8）では解消することを確かめる。
const fs = require('fs'), vm = require('vm'), path = require('path');
const { createBackend } = require(process.argv[2]);
let pass = 0, fail = 0; const assert = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ': ' + m); c ? pass++ : fail++; };
const mk = () => { const be = createBackend(); const S = be.sandbox; be.sheets[S.SHEET_NAME].maxRows = 5000;
  be.sheets[S.STAFF_SHEET_NAME].getRange(2, 1, 1, 5).setValues([['master@example.com', 'M', '', '', 'マスタ権限']]); return { be, S, N: S.ALL_COLUMNS.length }; };
const row = (S, f) => S.ALL_COLUMNS.map(c => (c.key in f) ? f[c.key] : '');
const idx = (S, k) => S.ALL_COLUMNS.findIndex(c => c.key === k);
const col = (S, k) => S.ALL_COLUMNS[idx(S, k)];
const tryCall = fn => { try { return { v: fn() }; } catch (e) { return { err: e.message }; } };

// BUG-01：重複削除で、「-」だけの行が「〇・数量・メモ」の行より優先されて実績が消える／別々の行の入力が統合されない
{ const { be, S, N } = mk();
  const base = { reservationNo: 'R1', area: '東', office: 'A', departureDate: new be.SDate(2027, 0, 1) };
  be.sheets[S.SHEET_NAME].getRange(2, 1, 2, N).setValues([
    row(S, Object.assign({}, base, { chkDate: new be.SDate(2026, 9, 1), insuranceStatus: '-', wifiStatus: '-', tavicaStatus: '-', cansapoStatus: '-' })),
    row(S, Object.assign({}, base, { insuranceStatus: '〇', insuranceQty: 2, memo: '大事なメモ' }))]);
  const res = S.removeDuplicateRows();
  const rows = be.sheets[S.SHEET_NAME].data.slice(1).filter(x => x && x[0]);
  const r = rows[0];
  assert(rows.length === 1 && r[idx(S, 'insuranceStatus')] === '〇' && r[idx(S, 'insuranceQty')] === 2 && r[idx(S, 'memo')] === '大事なメモ' && r[idx(S, 'chkDate')] && r[idx(S, 'chkDate')].getFullYear,
    'BUG-01 重複削除で、保険〇・数量2・メモ・CHK日がすべて1行に残る（保険=' + r[idx(S, 'insuranceStatus')] + ' 数量=' + r[idx(S, 'insuranceQty')] + ' メモ=' + r[idx(S, 'memo')] + ' CHK=' + (r[idx(S, 'chkDate')] ? 'あり' : 'なし') + '）');
  // 両方に違う内容がある項目は、入力の多い方を残し、件数を知らせる
  const e2 = mk(); const b2 = { reservationNo: 'R2', area: '東', office: 'A', departureDate: new e2.be.SDate(2027, 0, 1) };
  e2.be.sheets[e2.S.SHEET_NAME].getRange(2, 1, 2, e2.N).setValues([row(e2.S, Object.assign({}, b2, { memo: 'メモA' })), row(e2.S, Object.assign({}, b2, { memo: 'メモB', wifiStatus: '☆', wifiQty: 1 }))]);
  const res2 = e2.S.removeDuplicateRows(); const kept = e2.be.sheets[e2.S.SHEET_NAME].data[1];
  assert(kept[idx(e2.S, 'memo')] === 'メモB' && kept[idx(e2.S, 'wifiStatus')] === '☆' && res2.conflicts === 1, 'BUG-01 両方に違うメモがある場合は入力の多い行の内容を残し、食い違いを1件として知らせる（conflicts=' + res2.conflicts + '）');
  // 手で入れた「未定」などは、統合の後も読み込んだ値のまま残る（v2.7.6の修正が壊れていない）
  const e3 = mk(); const b3 = { reservationNo: 'R3', area: '東', office: 'A', departureDate: '未定' };
  e3.be.sheets[e3.S.SHEET_NAME].getRange(2, 1, 2, e3.N).setValues([row(e3.S, Object.assign({}, b3, { chkDate: '要確認' })), row(e3.S, Object.assign({}, b3, { memo: 'm' }))]);
  e3.S.removeDuplicateRows(); const k3 = e3.be.sheets[e3.S.SHEET_NAME].data[1];
  assert(k3[idx(e3.S, 'departureDate')] === '未定' && k3[idx(e3.S, 'chkDate')] === '要確認' && k3[idx(e3.S, 'memo')] === 'm', 'BUG-01 統合しても、手で入れた「未定」「要確認」はそのまま残る');
}
// BUG-02：存在しない日付を含むCSVを2回取り込んでも増えない
{ const { be, S } = mk();
  const labels = S.COLUMNS.map((c, i) => String(i + 1).padStart(3, '0') + ':' + c.label);
  const csv = { matrix: [labels, S.COLUMNS.map(c => ({ reservationNo: 'X1', area: '東', office: 'A', departureDate: '2026/02/29', bookingDate: '2024/02/29' })[c.key] || '')] };
  S.importCsv(csv, 'a.csv'); const r2 = S.importCsv(JSON.parse(JSON.stringify(csv)), 'a.csv');
  const n = be.sheets[S.SHEET_NAME].data.slice(1).filter(x => x && x[0]).length;
  assert(n === 1 && r2.imported === 0, 'BUG-02 存在しない日付（2026/02/29）を含むCSVを2回取り込んでも1行のまま（行数=' + n + '）');
}
// BUG-03：CHK日に日付として読めない値を送ると、既存のCHK日が知らせなく消える
{ const { S } = mk();
  assert(!!tryCall(() => S.normalizeEditableInput_(col(S, 'chkDate'), 'abc')).err, 'BUG-03 CHK日に「abc」は保存せずエラー（消去されない）');
  assert(tryCall(() => S.normalizeEditableInput_(col(S, 'chkDate'), '')).v === null, 'BUG-03 CHK日の空欄は消去として受け付ける（従来どおり）');
  assert(!!tryCall(() => S.normalizeEditableInput_(col(S, 'chkDate'), '2026-02-31')).err, 'BUG-03 CHK日に存在しない日付はエラー');
}
// BUG-04：担当者マスタの「編集」で既にある別のコードへ書き換えられる
{ const { be, S } = mk(); be.sheets[S.STAFF_NAME_SHEET_NAME].getRange(2, 1, 2, 2).setValues([['C1', '山田'], ['C2', '佐藤']]);
  const r = tryCall(() => S.updateStaffName(3, 'C1', '佐藤', 'C2'));
  assert(!!r.err && be.sheets[S.STAFF_NAME_SHEET_NAME].data[2][0] === 'C2', 'BUG-04 編集で既存の別コード（C1）へ書き換えようとするとエラーになり、行は変わらない');
  assert(!tryCall(() => S.updateStaffName(3, 'C2', '佐藤花子', 'C2')).err, 'BUG-04 同じ行のコードのままで氏名だけ変えるのは受け付ける');
}
// BUG-05：数量の空白・true/false・配列が数値に化ける
{ const { S } = mk();
  assert(tryCall(() => S.parseAncillaryQty_('   ')).v === null, 'BUG-05 数量「空白だけ」は未入力（0にしない）');
  [false, true, []].forEach(v => assert(!!tryCall(() => S.parseAncillaryQty_(v)).err, 'BUG-05 数量 ' + JSON.stringify(v) + ' は受け付けない'));
  assert(tryCall(() => S.parseAncillaryQty_('3')).v === 3 && tryCall(() => S.parseAncillaryQty_(2.7)).v === 2 && tryCall(() => S.parseAncillaryQty_(0)).v === 0, 'BUG-05 「3」「2.7」「0」は従来どおり 3・2・0');
}
// BUG-06：所属店舗「東京第一ｴﾘｱ…」と所属エリア「10:東京第1エリア」（漢数字と算用数字だけが違う）
{ const { be, S, N } = mk();
  be.sheets[S.STAFF_SHEET_NAME].getRange(3, 1, 1, 5).setValues([['st@example.com', 'S', '東京第一ｴﾘｱﾄﾗﾍﾞﾙﾜﾝﾀﾞｰﾗﾝﾄﾞ新宿', '10:東京第1エリア', '社員']]);
  be.sheets[S.SHEET_NAME].getRange(2, 1, 2, N).setValues([row(S, { reservationNo: 'R1', area: '10:東京第1エリア', office: '003:トラベルワンダーランド新宿', departureDate: new be.SDate(2027, 0, 1) }), row(S, { reservationNo: 'R2', area: '10:東京第1エリア', office: '004:トラベルワンダーランド池袋', departureDate: new be.SDate(2027, 0, 1) })]);
  S.Session.getActiveUser = () => ({ getEmail: () => 'st@example.com' });
  const seen = S.getBootstrapData({ mode: 'all' }).rows.map(r => r.reservationNo);
  assert(JSON.stringify(seen) === '["R1"]', 'BUG-06 その社員には自店舗（新宿）の行だけが見える（見えた行=' + JSON.stringify(seen) + '）');
}
// BUG-07：アーカイブの基準日に存在しない日付
{ const { S } = mk();
  ['2026-02-31', '2026-99-99', '2025-02-29'].forEach(d => assert(!!tryCall(() => S.previewArchiveCandidates(d)).err, 'BUG-07 基準日 ' + d + ' は拒否'));
  assert(!tryCall(() => S.previewArchiveCandidates('2024-02-29')).err, 'BUG-07 基準日 2024-02-29（うるう日）は受け付ける');
}
// BUG-08：Excelの中のXMLの読み取り（文字参照の戻しすぎ・' で囲んだ属性）
{ const js = fs.readFileSync(path.join(process.env.APP_DIR || path.join(__dirname, '..', '..', 'reservation-dashboard-gas') + path.sep, 'Javascript.html'), 'utf8');
  const grab = name => { const i = js.indexOf('function ' + name + '('); let d = 0, j = js.indexOf('{', i); for (; j < js.length; j++) { if (js[j] === '{') d++; else if (js[j] === '}' && --d === 0) break; } return js.slice(i, j + 1); };
  const pre = (js.match(/var XML_NAMED_ENTITIES_ = [^;]+;/) || [''])[0];
  const ctx = {}; vm.createContext(ctx); vm.runInContext(pre + grab('decodeXmlEntities_') + grab('xmlAttr_'), ctx);
  assert(ctx.decodeXmlEntities_('&#38;lt;hello&#38;gt;') === '&lt;hello&gt;', 'BUG-08 「&#38;lt;」は「&lt;」まで戻す（「<」まで戻しすぎない）：' + ctx.decodeXmlEntities_('&#38;lt;hello&#38;gt;'));
  assert(ctx.decodeXmlEntities_('&amp;lt;a&amp;gt; &quot;x&quot; &#x3042;') === '&lt;a&gt; "x" あ', 'BUG-08 通常の文字参照は従来どおり戻す');
  assert(ctx.xmlAttr_(" r='A1' t=\"s\"", 'r') === 'A1' && ctx.xmlAttr_(" r='A1' t=\"s\"", 't') === 's', "BUG-08 ' で囲んだ属性（r='A1'）も読める");
}
// BUG-09：無限大（1e309）
{ const { S } = mk(); const st = {};
  assert(S.convertValue_(col(S, 'salesAmount'), '1e309', st) === null && st.number && st.number.count === 1, 'BUG-09 CSVの「1e309」は数値として読まず、取込結果で知らせる');
  assert(S.normalizeCellValue_(col(S, 'salesAmount'), Infinity) === null, 'BUG-09 シートの無限大は空欄扱い');
  assert(S.normalizeEditableInput_(col(S, 'insuranceQty'), '1e309') === null, 'BUG-09 編集の「1e309」は数値として扱わない');
}
// BUG-11：表示期間の指定（開始日と終了日の逆転・不正な日付）
{ const { S } = mk();
  const w = S.resolveListWindow_({ mode: 'custom', from: '2026-12-01', to: '2026-01-01' });
  assert(w.from === '2026-01-01' && w.to === '2026-12-01', 'BUG-11 開始日＞終了日は入れ替える：' + JSON.stringify(w));
  assert(!!tryCall(() => S.resolveListWindow_({ mode: 'custom', from: 'abc', to: null })).err && !!tryCall(() => S.resolveListWindow_({ mode: 'custom', from: '2026-02-31', to: null })).err, 'BUG-11 不正な日付・存在しない日付の期間指定はエラー');
}
// BUG-13：予約番号の先頭0の復元（負の数・小数）
{ const { S } = mk(); const c = col(S, 'reservationNo');
  assert(S.normalizeCellValue_(c, 123456789) === '00123456789' && S.normalizeCellValue_(c, -123) === '-123' && S.normalizeCellValue_(c, 12.34) === '12.34', 'BUG-13 先頭0の復元は0以上の整数だけ（-123・12.34 はそのまま）');
}
// R2-CSV-001・DATE-001：取込の日付の後ろの文字・シート上の存在しない日付
{ const { S } = mk(); const c = col(S, 'departureDate'); const st = {};
  const v = s => S.convertValue_(c, s, st);
  assert(v('2026/10/24 10:30') === '2026-10-24' && v('2026/10/24 10:30:15') === '2026-10-24', 'R2-CSV-001 時刻付き（10:30・10:30:15）は日付として読む（知らせない）');
  assert(v('2026-10-24oops') === '2026-10-24' && v('2026/10/24 25:99') === '2026-10-24', 'R2-CSV-001 日付の後ろに余分な文字・不正な時刻がある値は、日付の部分を使う');
  assert(st.dateExtra && st.dateExtra.count === 2 && (!st.date), 'R2-CSV-001 余分な文字がある2件は「日付の後ろに余分な文字」として知らせる（' + JSON.stringify(st) + '）');
  assert(v('not-a-date') === null && st.date && st.date.count === 1, 'R2-CSV-001 「not-a-date」は空欄にして「日付として読めない値」として知らせる（従来どおり）');
  assert(S.normalizeCellValue_(c, '2026/02/30') === '2026/02/30' && S.normalizeCellValue_(c, '2026/2/3') === '2026-02-03', 'DATE-001 シートの文字「2026/02/30」は日付にそろえずそのまま／正しい日付の文字はそろえる');
}
console.log('TOTAL PASS=' + pass + ' FAIL=' + fail);
