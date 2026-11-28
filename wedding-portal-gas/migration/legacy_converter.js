/*
 * 旧商説スプレッドシート(xlsx) → 新ポータル形式 変換ロジック
 * migration/convert_legacy.py と同じ結果になるよう移植したもの。
 * ブラウザ(ポータルの「旧商説から更新」)とNode(検証用)の両方で動く。
 * 依存: SheetJS(XLSX) — readWorkbook() に渡す。
 */
(function (root) {
  'use strict';

  // ---------- 文字列ユーティリティ(Pythonの挙動に合わせる) ----------
  const cpLen = (s) => Array.from(s).length;  // Pythonのlen()と同じくコードポイント数
  const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => escHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const unescHtml = (s) => String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isNaN(n) ? m : String.fromCodePoint(n);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
  });
  // Pythonの json.dumps(obj, ensure_ascii=False) と同じ書式(", " と ": ")
  const pyDumps = (v) => {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return '[' + v.map(pyDumps).join(', ') + ']';
    if (typeof v === 'object') return '{' + Object.keys(v).map(k => JSON.stringify(k) + ': ' + pyDumps(v[k])).join(', ') + '}';
    return JSON.stringify(v);
  };
  const strip = (s) => String(s).trim();
  const stripNL = (s) => String(s).replace(/^\n+|\n+$/g, '');

  // ---------- 元ブック名 -> エリア / 国 ----------
  const BOOK_AREA = [
    ['HWI', 'ハワイ'], ['Feel Hawaii', 'ハワイ'], ['ハワイ', 'ハワイ'],
    ['沖縄', '沖縄'], ['Okinawa', '沖縄'],
    ['GUM', 'グアム'], ['グアム', 'グアム'],
    ['DPS', 'バリ'],
    ['EUR', 'ヨーロッパ'],
    ['南太平洋', '南太平洋'],
    ['その他エリア', 'その他海外'],
    ['国内', '国内'],
  ];
  const COUNTRY_KW = [
    ['モルディブ', 'モルディブ'], ['タヒチ', 'タヒチ'], ['ボラボラ', 'タヒチ'], ['モーレア', 'タヒチ'],
    ['ニューカレドニア', 'ニューカレドニア'], ['フィジー', 'フィジー'],
    ['ニュージーランド', 'ニュージーランド'], ['（CNS）', 'オーストラリア'], ['（OOL）', 'オーストラリア'],
    ['オーストラリア', 'オーストラリア'],
    ['ベトナム', 'ベトナム'], ['ダナン', 'ベトナム'], ['セブ', 'フィリピン'], ['エジプト', 'エジプト'],
    ['ロサンゼルス', 'アメリカ'], ['ニューヨーク', 'アメリカ'], ['ラスベガス', 'アメリカ'],
    ['サイパン', 'サイパン'], ['パラオ', 'パラオ'], ['台湾', '台湾'], ['韓国', '韓国'], ['タイ', 'タイ'],
    ['イタリア', 'イタリア'], ['ヴィラ', 'イタリア'], ['フランス', 'フランス'], ['パリ', 'フランス'],
    ['スペイン', 'スペイン'], ['ポルトガル', 'ポルトガル'], ['チェコ', 'チェコ'], ['ドイツ', 'ドイツ'],
    ['イギリス', 'イギリス'], ['ロンドン', 'イギリス'], ['オーストリア', 'オーストリア'],
    ['フィンランド', '北欧'], ['スウェーデン', '北欧'], ['ノルウェー', '北欧'],
    ['ウズベキスタン', 'ウズベキスタン'], ['ウユニ', 'ボリビア'], ['カナダ', 'カナダ'], ['カンボジア', 'カンボジア'],
    ['ケニア', 'ケニア'], ['シンガポール', 'シンガポール'], ['セドナ', 'アメリカ'], ['バハマ', 'バハマ'],
    ['プーケット', 'タイ'], ['モロッコ', 'モロッコ'], ['CUN', 'メキシコ'], ['カンクン', 'メキシコ'], ['ジラーラ', 'メキシコ'],
    ['ギリシャ', 'ギリシャ'], ['スイス', 'スイス'], ['トルコ', 'トルコ'], ['ドバイ', 'UAE'], ['モンサンミシェル', 'フランス'],
    ['マルタ', 'マルタ'], ['サントニー', 'フランス'], ['シャンティ', 'フランス'], ['シェーンブルン', 'オーストリア'],
    ['アメリカンカテドラル', 'フランス'], ['アメリカンチャーチ', 'フランス'], ['ヴィッキオマッジョ', 'イタリア'],
    ['サン・ジョヴァンニ', 'イタリア'], ['ローマ', 'イタリア'], ['フィレンツェ', 'イタリア'], ['ヴェネツィア', 'イタリア'],
    ['ウィーン', 'オーストリア'], ['プラハ', 'チェコ'], ['バルセロナ', 'スペイン'], ['リスボン', 'ポルトガル'],
    ['北海道', '北海道'], ['札幌', '北海道'], ['小樽', '北海道'], ['トマム', '北海道'], ['水の教会', '北海道'],
    ['ハウステンボス', '長崎'], ['石垣', '八重山'], ['竹富', '八重山'], ['西表', '八重山'],
  ];

  function areaOf(book) {
    for (const [k, v] of BOOK_AREA) if (book.includes(k)) return v;
    return 'その他';
  }

  function countOcc(text, k) {
    if (!k) return 0;
    let n = 0, i = 0;
    while ((i = text.indexOf(k, i)) !== -1) { n++; i += k.length; }
    return n;
  }

  function countryOf(area, book, tab, fullTitle, allText) {
    if (!['南太平洋', 'その他海外', 'ヨーロッパ'].includes(area)) return '';
    const hits = (text) => {
      const found = [];
      for (const [k, v] of COUNTRY_KW) if (text.includes(k) && !found.includes(v)) found.push(v);
      return found;
    };
    let h = hits(tab);
    if (h.length) return h[0];
    h = hits(fullTitle || '');
    if (h.length === 1) return h[0];
    const cnt = new Map();
    for (const [k, v] of COUNTRY_KW) {
      if (cpLen(k) >= 2 && !k.startsWith('（')) cnt.set(v, (cnt.get(v) || 0) + countOcc(allText || '', k));
    }
    const top = Array.from(cnt.entries()).map((e, i) => [e[0], e[1], i])
      .sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, 2);
    if (top.length && top[0][1] >= 3 && (top.length === 1 || top[0][1] >= 2 * top[1][1])) return top[0][0];
    return 'その他';
  }

  // ---------- セル ----------
  const pad = (n) => String(n).padStart(2, '0');

  function fmtValue(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && v.__dt) {
      if (v.kind === 'time') return `${pad(v.H)}:${pad(v.M)}`;
      const d = `${v.y}/${pad(v.m)}/${pad(v.d)}`;
      return (v.H || v.M) ? `${d} ${pad(v.H)}:${pad(v.M)}` : d;
    }
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      return String(v);
    }
    let s = String(v);
    s = s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => {
      const l = h.toLowerCase();
      if (l === '000d') return '';
      if (l === '000a' || l === '000b') return '\n';
      return String.fromCharCode(parseInt(h, 16));
    });
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x0b/g, '\n');
    s = s.replace(/[\x00-\x08\x0c\x0e-\x1f\x7f]/g, '');
    return s;
  }

  const linkOf = (c) => c.link || null;

  function styleLine(c, inner) {
    if (c.strike) inner = `<s>${inner}</s>`;
    if (c.red) inner = `<span style="color: rgb(230, 0, 0);">${inner}</span>`;
    if (c.bold) inner = `<strong>${inner}</strong>`;
    return inner;
  }

  const linkBtn = (url, label) => `<a href="${escAttr(url)}" target="_blank">${label === undefined ? 'リンクを開く' : label}</a>`;

  function cellLines(c) {
    const text = stripNL(fmtValue(c.value));
    if (!strip(text)) return [];
    const raw = text.split('\n');
    let lines = raw.map(l => strip(l) ? styleLine(c, escHtml(l)) : '');
    const url = linkOf(c);
    if (url) {
      if (raw.length === 1 && cpLen(text) <= 30) lines = [styleLine(c, linkBtn(url, escHtml(text)))];
      else lines.push(linkBtn(url));
    }
    return lines;
  }

  const cellHtml = (c) => cellLines(c).filter(Boolean).join(' ／ ');

  function cellPlain(c) {
    let t = strip(fmtValue(c.value));
    const url = linkOf(c);
    if (url && !t.includes(url)) t = `${t}（${url}）`;
    return t;
  }

  function htmlToPlain(h) {
    h = String(h).replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
      (m, href, txt) => (txt.includes(href) ? txt : `${txt}（${unescHtml(href)}）`));
    h = h.replace(/<br\s*\/{0,1}>/g, '\n');
    h = h.replace(/<\/p>\s*/g, '\n');
    h = h.replace(/<[^>]+>/g, '');
    return strip(unescHtml(h));
  }

  const safeAttrText = (s) => String(s).replace(/"/g, '”').replace(/</g, '＜').replace(/>/g, '＞');

  // ---------- 見出しの正規化・項目ルール ----------
  const normLabel = (s) => String(s).split('\n')[0].replace(/[①-⑳★☆■□●◆◇・※＊*【】\[\]<>＜＞〈〉:：\s　]/gu, '');

  const RULES = [
    ['agt', ['催行会社']],
    ['product_url', ['商品詳細']],
    ['point', ['ポイント', 'POINT']],
    ['x_transfer', ['送迎', '打ち合わせ', '打合せ', '待ち合わせ', '集合場所']],
    ['x_course', ['撮影コース', 'コースについて', '撮影可能都市', '撮影場所', '撮影時間', '挙式開始時間', '挙式時間',
      '対応可能時間', '含まれる内容', '含まれるもの', 'プラン内容', 'ロケーション', '撮影箇所']],
    ['w_imp', ['挙式不可', '撮影不可']],
    ['w_ins', ['即日回答']],
    ['area_f', ['滞在先対象', '対象エリア']],
    ['deliv', ['データ納品']],
    ['loc', ['お支度場所', '支度場所']],
    ['child', ['お子様', 'ベビーシッター']],
    ['comp', ['同行者']],
    ['c_ben', ['早期申し込み特典', '早期申込', '早期特典']],
    ['c_fit', ['衣裳合わせ', '衣装合わせ', '試着']],
    ['w_abd', ['放棄']],
    ['w_ret', ['返却']],
    ['w_fit', ['衣裳小物持込', '衣装小物持込', '小物持込']],
    ['c_pay', ['差額', '集金先', '収受先']],
    ['c_fee', ['衣裳持込', '衣装持込', '持込料']],
    ['c_chg', ['お着換え', 'お着替え', '着替え', '着換え']],
    ['opt', ['OPについて', 'オプションについて', 'オプション概要']],
    ['alb', ['アルバム']],
    ['bouquet', ['ブーケ']],
    ['docs', ['書類', '同意書', '約款', '提出物']],
    ['attn', ['注意事項']],
    ['qa', ['よくある質問']],
    ['w_flw', ['現地到着後', '現地BFG', '挙式当日']],
    ['sch', ['スケジュール']],
    ['p_av', ['空き状況', '空き照会', 'STS確認', 'HOLD']],
    ['p_bk', ['予約方法', '予約フロー', '予約の流れ', '手配フロー', 'NBコメント', 'NB時', '電子契約']],
    ['m_sum', ['明細作成', '必要な明細', '流す明細', '明細']],
    ['p_op', ['OPが追加', 'OPの追加', 'OP追加', '追加オプション', '登録内容変更']],
    ['w_ga', ['最終書面']],
    ['p_fn', ['ファイナル', 'FNL']],
    ['w_ga', ['書面お渡し', 'G/A']],
    ['p_cx', ['取消', 'キャンセル', 'CXL']],
    ['p_ch', ['変更']],
    ['p_rem', ['備考', '申込期限', '申込み期限', 'お申込み可能期間', '申込可能期間', '受付期間']],
    ['c_sum', ['衣裳について', '衣装について', '衣裳概要', '手持ち衣裳', 'レンタル衣裳', '衣裳', '衣装']],
  ];

  const UI_LABEL = {
    area_f: '滞在先対象エリア', deliv: 'データ納品について', loc: '撮影当日のお支度場所', child: 'お子様が同行される場合',
    comp: '同行者について', c_sum: '衣裳について', c_fit: '衣裳合わせについて', c_ben: '早期申し込み特典について',
    c_fee: '衣裳持込', c_pay: '衣裳差額収受先', c_chg: 'お着換えについて', alb: 'アルバムについて',
    opt: 'オプションについて', bouquet: 'ブーケについて', docs: 'お渡し書類', attn: '注意事項',
    p_av: '空き状況確認方法', p_bk: '予約方法', p_op: 'OPが追加になった場合', p_fn: 'ファイナル', p_ch: '変更',
    p_cx: 'CXL', p_rem: '備考', w_imp: '挙式不可日', w_fit: '衣裳小物持込', w_abd: '放棄する場合の対応',
    w_ret: '現地での返却時間・場所', w_ga: '書面お渡し（G/A）', w_flw: '現地到着後の流れ', m_sum: '明細作成',
    x_agt_note: '催行会社', x_course: 'プラン内容・コース', x_transfer: '送迎・現地打ち合わせ', point: 'ポイント',
  };
  const UI_ALIASES = {
    c_pay: ['衣裳差額・小物集金先', '差額収受先', '衣装差額収受先'], w_fit: ['衣裳小物持込可否', '衣装小物持込'],
    w_imp: ['挙式不可能日', '撮影不可日', '撮影不可能日'], loc: ['お支度場所'], p_av: ['空き状況確認'],
    p_op: ['OP追加時'], w_ga: ['書面お渡し'], c_fit: ['衣裳合わせ', '衣装合わせ'], c_sum: ['衣裳概要', '衣装について'],
    child: ['お子様同行'], comp: ['同行者'], deliv: ['データ納品'], m_sum: ['チャレンジ明細作成方法', '明細作成方法'],
  };
  const PHOTO_FIELDS = new Set(['area_f', 'deliv', 'loc', 'child', 'comp', 'c_sum', 'c_fit', 'c_ben', 'c_fee', 'c_pay', 'c_chg',
    'alb', 'opt', 'bouquet', 'docs', 'attn', 'p_av', 'p_bk', 'p_op', 'p_fn', 'p_ch', 'p_cx', 'p_rem',
    'm_sum', 'qa', 'sch', 'product_url', 'agt', 'w_imp', 'x_course', 'x_transfer', 'point']);
  const WED_FIELDS = new Set(['w_imp', 'w_ins', 'c_pay', 'w_fit', 'w_abd', 'w_ret', 'p_av', 'p_bk', 'p_op', 'p_fn', 'p_ch', 'p_cx',
    'w_ga', 'p_rem', 'w_flw', 'm_sum', 'qa', 'product_url', 'agt',
    'c_sum', 'c_fit', 'opt', 'docs', 'attn', 'loc', 'x_course', 'x_transfer', 'point']);
  const PHOTO_FALLBACK = { w_fit: 'c_fee', w_abd: 'c_fee', w_ret: 'c_chg', w_ga: 'p_fn', w_ins: 'p_rem', w_flw: 'x_course' };
  const WED_FALLBACK = { c_fee: 'w_fit', c_chg: 'w_ret', c_ben: 'c_sum', alb: 'opt', bouquet: 'opt',
    area_f: 'x_course', deliv: 'opt', child: 'x_transfer', comp: 'x_transfer', sch: 'w_flw' };

  function matchRule(text) {
    const n = normLabel(text);
    if (!n) return null;
    const N = n.toUpperCase();
    for (const [field, kws] of RULES) for (const k of kws) if (N.includes(k.toUpperCase())) return field;
    return null;
  }

  function catOfBook(book) {
    if (book.includes('フォト')) return 'フォト';
    if (['挙式', '商品説明書', 'Feel'].some(k => book.includes(k))) return 'ウェディング';
    return null;
  }

  function detectCat(t) {
    const wed = ['現地到着後の流れ', 'STS確認', '挙式不可', '現地BFG', '挙式当日', '書面お渡し'].filter(k => t.includes(k)).length;
    const photo = ['データ納品', 'お支度場所', '空き状況確認', '撮影当日', 'フォトプラン判別'].filter(k => t.includes(k)).length;
    if (wed >= 2 && wed >= photo) return 'ウェディング';
    if (photo >= 2) return 'フォト';
    return null;
  }

  const AGT_PATTERNS = [/AGTコード[：:]\s*([A-Z]{3})/u, /【([A-Z]{3})】/u, /[（(]([A-Z]{3})[）)]/u];
  function findAgt(...texts) {
    for (const t of texts) {
      if (!t) continue;
      for (const p of AGT_PATTERNS) { const m = p.exec(t); if (m) return m[1]; }
    }
    return '';
  }

  // ---------- 縦型フォームの解析 ----------
  const LABEL_MAX_COL = 2;
  const isEmptyVal = (v) => v === null || v === undefined || v === '';

  function rowsOf(model) {
    // [[rowNumber, [cells...]]] (値のある行のみ、列順)
    const byRow = new Map();
    for (const c of model.cells) {
      if (!byRow.has(c.row)) byRow.set(c.row, []);
      byRow.get(c.row).push(c);
    }
    return Array.from(byRow.keys()).sort((a, b) => a - b).map(r => [r, byRow.get(r).sort((a, b) => a.column - b.column)]);
  }

  function splitLeadLabel(text) {
    const idx = text.indexOf('\n');
    const first = idx === -1 ? text : text.slice(0, idx);
    const more = idx === -1 ? '' : text.slice(idx + 1);
    const m = /^([①-⑳■●・※]?[^\s　：:]{2,15})[\s　]+(\S.*)$/u.exec(first);
    if (!m || !matchRule(m[1])) return null;
    return [m[1], m[2] + (more ? '\n' + more : '')];
  }

  const SECTION_WORDS = ['基本情報', '手配方法', 'その他', '料金', 'プラン内容', '商品概要', '同行者', '衣装', '衣裳'];

  function isSectionTitle(t) {
    t = strip(t);
    if (/^[★☆【].*[★☆】]$/u.test(t)) return true;
    const n = normLabel(t);
    if (SECTION_WORDS.some(w => n === w || n === w + 'について')) return true;
    return matchRule(t) !== null && cpLen(n) <= 12;
  }

  function strictSection(t) {
    t = strip(t);
    if (t.includes('\n') || cpLen(t) > 40) return false;
    return /^[★☆].*[★☆]$/u.test(t) || /^【[^】]*】.*★/u.test(t) || t.includes('手配方法');
  }

  function shortSec(sec) {
    const t = strip(sec);
    const date = /【([^】]*\d[^】]*)】/u.exec(t) || /(\d{4}\/\d{1,2}\/\d{1,2}\s*[～~])/u.exec(t);
    let name;
    if (t.includes('手配方法')) {
      const m = /手配方法\s*[（(]([^）)]+)[）)]/u.exec(t);
      name = m ? m[1] : t.replace(/【[^】]*】/gu, '');
    } else {
      name = t.replace(/【[^】]*】/gu, '');
    }
    name = strip(name.replace(/[★☆■◆]/gu, ''));
    if (date) name += `（${strip(date[1])}）`;
    return name || t;
  }

  function parseForm(model) {
    const rows = [];
    for (const [rn, cs] of rowsOf(model)) {
      const cells = cs.filter(c => !isEmptyVal(c.value) && !['', '社外秘'].includes(strip(fmtValue(c.value))));
      if (cells.length) rows.push([rn, cells]);
    }
    const blocks = [];
    let section = '';
    let i = 0;
    while (i < rows.length) {
      const cells = rows[i][1];
      const first = cells[0];
      if (cells.length >= 4 && i + 1 < rows.length && rows[i + 1][1].length >= 3) {
        const trows = [cells];
        let j = i + 1;
        while (j < rows.length && (rows[j][1].length >= 3 || rows[j][1][0].column > LABEL_MAX_COL)) { trows.push(rows[j][1]); j++; }
        blocks.push({ section, label: '', rows: trows, table: true });
        i = j;
        continue;
      }
      if (first.column <= LABEL_MAX_COL) {
        const labelText = strip(fmtValue(first.value));
        const valueCells = cells.slice(1);
        const cont = [];
        let j = i + 1;
        while (j < rows.length && rows[j][1][0].column > LABEL_MAX_COL) { cont.push(rows[j][1]); j++; }
        const short = cpLen(labelText) <= 25 && !labelText.includes('\n');
        if (!valueCells.length && !cont.length) {
          let m = /^([^\n：:]{2,45}?)\s*[：:]\s*([\s\S]+)$/u.exec(labelText);
          if (m && /\d$/.test(m[1])) m = null;
          const lead = splitLeadLabel(labelText);
          if (lead && !m) blocks.push({ section, label: lead[0], rows: [], inline: lead[1], src: first });
          else if (m) blocks.push({ section, label: m[1], rows: [], inline: m[2], src: first });
          else if (!linkOf(first) && ((short && isSectionTitle(labelText)) || strictSection(labelText))) {
            section = labelText;
            blocks.push({ section, label: labelText, rows: [], header: true });
          } else blocks.push({ section, label: '', rows: [[first]], loose: true });
        } else {
          const leadRows = valueCells.length ? [valueCells] : [];
          if (strictSection(labelText)) {
            section = labelText;
            blocks.push({ section, label: labelText, rows: [], header: true });
            if (leadRows.length || cont.length) blocks.push({ section, label: '', rows: leadRows.concat(cont), loose: true });
          } else if (!short && splitLeadLabel(labelText)) {
            const [lab2, rest] = splitLeadLabel(labelText);
            blocks.push({ section, label: lab2, rows: leadRows.concat(cont), inline: rest, src: first });
          } else if (!short) {
            blocks.push({ section, label: '', rows: [[first].concat(valueCells)].concat(cont), loose: true });
          } else {
            blocks.push({ section, label: labelText, rows: leadRows.concat(cont), labelCell: first });
          }
        }
        i = j;
      } else {
        blocks.push({ section, label: '', rows: [cells], loose: true });
        i += 1;
      }
    }
    return blocks;
  }

  function rowsHtml(rows) {
    const out = [];
    for (const cells of rows) {
      const per = cells.map(cellLines).filter(l => l.some(Boolean));
      if (!per.length) continue;
      if (per.every(l => l.length === 1)) out.push('<p>' + per.map(l => l[0]).join('　') + '</p>');
      else for (const l of per) for (const x of l) out.push(x ? `<p>${x}</p>` : '<p><br></p>');
    }
    return out.join('');
  }

  const MEISAI_COLS = [['name', ['必要な明細']], ['method', ['作成方法']], ['code', ['明細（例）', '明細(例)', 'コード', '明細例']],
    ['city', ['都市']], ['agt', ['AGT']], ['date', ['日付']], ['dest', ['流し先']]];

  function extractMeisai(rows, taken) {
    let hdrIdx = null;
    const colmap = new Map();
    for (let k = 0; k < rows.length; k++) {
      const cells = rows[k];
      const texts = cells.map(c => [c.column, strip(fmtValue(c.value))]);
      const c1 = texts.filter(([, t]) => t.includes('必要な明細') && cpLen(t) <= 15).map(([c]) => c);
      const c2 = texts.filter(([, t]) => t.includes('作成方法') && cpLen(t) <= 15).map(([c]) => c);
      const same = c1.length === c2.length && c1.every(x => c2.includes(x)) && new Set(c1).size === new Set(c2).size;
      if (cells.length >= 4 && c1.length && c2.length && !same) {
        hdrIdx = k;
        // Python: {col: text} の辞書(同じ列は後勝ち)を列順に走査
        const dict = new Map();
        for (const [col, t] of texts) dict.set(col, t);
        for (const [col, t] of dict) {
          for (const [key, kws] of MEISAI_COLS) {
            if (!colmap.has(key) && kws.some(kw => t.includes(kw))) { colmap.set(key, col); break; }
          }
        }
        break;
      }
    }
    if (hdrIdx === null) return [{}, rows];
    const starts = Array.from(colmap.entries()).map((e, i) => [e[0], e[1], i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    const slots = {};
    const rest = rows.slice(0, hdrIdx);
    const extra = [];
    let k = hdrIdx + 1;
    while (k < rows.length && rows[k].length >= 3) {
      const cells = rows[k];
      const rec = {};
      for (const c of cells) {
        let key = null;
        for (let idx = 0; idx < starts.length; idx++) {
          const col = starts[idx][1];
          const nxt = idx + 1 < starts.length ? starts[idx + 1][1] : 1e6;
          if (col <= c.column && c.column < nxt) { key = starts[idx][0]; break; }
        }
        if (key === null && starts.length && c.column < starts[0][1]) key = starts[0][0];
        if (key) rec[key] = strip((rec[key] || '') + ' ' + cellPlain(c));
      }
      const name = rec.name || '';
      let slot = null;
      if (name.includes('プラン') && !('pln' in slots)) slot = 'pln';
      else if (name.includes('判別') && !('dst' in slots)) slot = 'dst';
      else if ((name.includes('オプション') || name.includes('OP')) && !('opt' in slots)) slot = 'opt';
      else if (!('pln' in slots) && k === hdrIdx + 1) slot = 'pln';
      if (slot && taken.has(slot)) slot = null;
      if (slot) {
        const d = {};
        for (const f of ['method', 'code', 'city', 'agt', 'date', 'dest']) d[f] = safeAttrText(rec[f] || '');
        if (name) d.method = safeAttrText(name.replace(/\n/g, ' ') + ' ／ ' + (rec.method || ''));
        for (const f in d) d[f] = d[f].replace(/\n/g, ' ');
        slots[slot] = d;
      } else extra.push(cells);
      k++;
    }
    const hdrHasNote = rows[hdrIdx].some(c => fmtValue(c.value).includes('※') || cpLen(strip(fmtValue(c.value))) > 15);
    if (extra.length || hdrHasNote) { rest.push(rows[hdrIdx]); rest.push(...extra); }
    rest.push(...rows.slice(k));
    return [slots, rest];
  }

  // ---------- 一覧・比較表 ----------
  function listHtml(model) {
    const vals = new Map();
    const key = (r, c) => r + ',' + c;
    for (const c of model.cells) {
      if (!isEmptyVal(c.value) && !['', '社外秘'].includes(strip(fmtValue(c.value)))) vals.set(key(c.row, c.column), c);
    }
    if (!vals.size) return '';
    const span = new Map();
    const covered = new Set();
    for (const mr of model.merges) {
      span.set(key(mr.r1, mr.c1), [mr.r2 - mr.r1 + 1, mr.c2 - mr.c1 + 1]);
      for (let rr = mr.r1; rr <= mr.r2; rr++) for (let cc = mr.c1; cc <= mr.c2; cc++) if (rr !== mr.r1 || cc !== mr.c1) covered.add(key(rr, cc));
    }
    const usedRows = new Set(), usedCols = new Set();
    for (const c of vals.values()) {
      const [rs, cs] = span.get(key(c.row, c.column)) || [1, 1];
      for (let x = c.row; x < c.row + rs; x++) usedRows.add(x);
      for (let x = c.column; x < c.column + cs; x++) usedCols.add(x);
    }
    const rows = Array.from(usedRows).sort((a, b) => a - b);
    const cols = Array.from(usedCols).sort((a, b) => a - b);
    const out = ['<div style="overflow-x:auto;"><table class="meisai-table" style="text-align:left; word-break:normal; min-width:600px;"><tbody>'];
    for (const r of rows) {
      const tds = [];
      for (const c of cols) {
        if (covered.has(key(r, c))) continue;
        let [rs, cs] = span.get(key(r, c)) || [1, 1];
        let ncs = 0; for (let x = c; x < c + cs; x++) if (usedCols.has(x)) ncs++;
        let nrs = 0; for (let x = r; x < r + rs; x++) if (usedRows.has(x)) nrs++;
        const cell = vals.get(key(r, c));
        const inner = cell ? cellLines(cell).join('<br>') : '';
        const attrs = (nrs > 1 ? ` rowspan="${nrs}"` : '') + (ncs > 1 ? ` colspan="${ncs}"` : '');
        tds.push(`<td${attrs}>${inner}</td>`);
      }
      out.push('<tr>' + tds.join('') + '</tr>');
    }
    out.push('</tbody></table></div>');
    return out.join('');
  }

  // ---------- メイン変換 ----------
  function convertSheet(model, book, tab) {
    tab = strip(tab);
    const name = book + '_' + tab;
    const nonEmpty = model.cells.filter(c => !isEmptyVal(c.value)).sort((a, b) => a.row - b.row || a.column - b.column);
    const allText = nonEmpty.map(c => fmtValue(c.value)).join(' ');
    const area = areaOf(book);

    let fullTitle = '';
    for (const c of nonEmpty) {
      if (c.row > 6) break;
      const v = strip(fmtValue(c.value));
      if (v && v !== '社外秘') { fullTitle = v.split('\n')[0]; break; }
    }

    let cat = catOfBook(book) || detectCat(allText);
    const contentCat = detectCat(allText);
    const perRow = new Map();
    for (const c of nonEmpty) perRow.set(c.row, (perRow.get(c.row) || 0) + 1);
    const wideRows = Array.from(perRow.values()).filter(n => n >= 4).length;
    const totRows = perRow.size;
    const looksLikePlan = contentCat !== null || (allText.includes('催行会社') && (allText.includes('予約') || allText.includes('空き')));
    const isList = !looksLikePlan || (['一覧', '比較', '早見表'].some(k => tab.includes(k)) && wideRows / Math.max(totRows, 1) > 0.2);
    if (cat === null && !isList) cat = contentCat;

    const payload = {};
    for (const k of ['area', 'country', 'city', 'cat', 'title', 'notice', 'co', 'sheet_embed', 'sch', 'qa',
      'url', 'season_year', 'season_type', 'is_draft', 'tags', 'promo', 'product_url',
      'agt_code', 'w_ins', 'point', 'm_pln', 'm_dst', 'm_opt']) payload[k] = '';
    const tags = [strip(book)];
    if (tab.includes('取り扱い終了') || tab.includes('取扱終了')) tags.push('取り扱い終了');
    payload.is_draft = 'false';
    payload.agt_code = findAgt(tab, fullTitle);
    const report = { file: name, book, tab, area };

    if (isList) {
      payload.cat = 'お役立ち情報';
      payload.area = '手配関連';
      payload.title = `【${area}】${tab}`;
      payload.notice = listHtml(model);
      payload.url = '[]';
      payload.tags = tags.join(', ');
      report.cat = 'お役立ち情報(一覧)';
      report.agt_info = {};
      return { payload, report };
    }

    payload.cat = cat;
    payload.area = book.includes('Feel') ? `${area}（Feel）` : area;
    payload.country = countryOf(area, book, tab, fullTitle, allText);
    payload.title = tab;
    const allowed = new Set(cat === 'フォト' ? PHOTO_FIELDS : WED_FIELDS); allowed.add('x_agt_note');
    const fallback = cat === 'フォト' ? PHOTO_FALLBACK : WED_FALLBACK;

    const blocks = parseForm(model);
    const fields = new Map();
    const agtInfo = {};
    const notice = [];
    const qaItems = [];
    const schBlocks = [];
    const meisai = {};
    let firstSectionSeen = false;
    const add = (field, heading, h) => { if (!h) return; if (!fields.has(field)) fields.set(field, []); fields.get(field).push([heading, h]); };
    let curSectionHeader = null;
    let lastField = null;

    for (const b of blocks) {
      if (b.header) { firstSectionSeen = true; curSectionHeader = b.label; continue; }
      const sec = b.section;
      const label = b.label || '';
      let body = '';
      if (b.inline !== undefined && b.inline !== null) {
        const src = b.src;
        body = b.inline.split('\n').filter(l => strip(l)).map(l => `<p>${styleLine(src, escHtml(l))}</p>`).join('');
        if (linkOf(src)) body += `<p>${linkBtn(linkOf(src))}</p>`;
      }
      let field = label ? matchRule(label) : null;
      const secField = sec ? matchRule(sec) : null;
      if (field === null && label === '' && ['qa', 'w_flw', 'sch'].includes(secField)) field = secField;
      if (field === null && label && secField === 'qa') field = 'qa';
      if (label && field === null && secField === 'w_flw') field = 'w_flw';
      if (field === null && secField && !['agt', 'product_url', 'qa'].includes(secField)) field = secField;
      if (field === null && lastField === 'm_sum') {
        const t0 = strip(label || htmlToPlain(rowsHtml(b.rows)));
        if (['※', '（', '(', '・', '【'].some(p => t0.startsWith(p)) || cpLen(t0) <= 40) field = 'm_sum';
      }

      let rows = b.rows;
      if (field === 'm_sum' || (field === null && rows.some(cells => cells.some(c => fmtValue(c.value).includes('必要な明細'))))) {
        const [slots, rest] = extractMeisai(rows, new Set(Object.keys(meisai)));
        rows = rest;
        Object.assign(meisai, slots);
        if (field === null) field = 'm_sum';
      }
      if (!body) body = rowsHtml(rows);
      else if (b.inline !== undefined && b.inline !== null && rows.length) body += rowsHtml(rows);

      if (!firstSectionSeen && !label) { notice.push(body); continue; }

      if (field === 'agt') {
        const plain = htmlToPlain(body);
        const code = findAgt(plain);
        if (code) { payload.agt_code = code; if (!(code in agtInfo)) agtInfo[code] = plain; }
        add('x_agt_note', '', body);
        lastField = 'x_agt_note';
        continue;
      }
      if (field === 'product_url') {
        const m = /href="(https?:\/\/[^"]+)"/.exec(body);
        if (m && !payload.product_url) payload.product_url = unescHtml(m[1]);
        notice.push(`<p><strong>${escHtml(label)}</strong></p>${body}`);
        continue;
      }
      if (field === 'qa') {
        let q = label || (curSectionHeader || 'よくある質問');
        let a = htmlToPlain(body);
        if (b.loose && rows.length) {
          const txt = htmlToPlain(body);
          const idx = txt.indexOf('\n');
          q = idx === -1 ? txt : txt.slice(0, idx);
          a = idx === -1 ? '' : txt.slice(idx + 1);
        }
        if (q || a) qaItems.push({ q: safeAttrText(strip(q)), a });
        continue;
      }
      if (field === 'sch' && cat === 'フォト') {
        const items = [];
        for (let line of htmlToPlain(body).split('\n')) {
          line = strip(line);
          if (!line) continue;
          const m = /^(\d{1,2}[:：]\d{2}(?:\s*[～~-]\s*\d{1,2}[:：]\d{2})?)\s*(.*)$/u.exec(line);
          if (m) items.push({ t: safeAttrText(m[1]), x: m[2] });
          else items.push({ t: '', x: line });
        }
        schBlocks.push({ title: safeAttrText(label.split('\n')[0]), items });
        continue;
      }
      if (field in fallback && !allowed.has(field)) field = fallback[field];
      if (field === null || !allowed.has(field) || field === 'sch') {
        const heading = label || '';
        const h3 = `<h3>${escHtml(sec)}</h3>`;
        const secH = sec && (!notice.length || !notice.join('').includes(h3)) ? h3 : '';
        notice.push(secH + (heading ? `<p><strong>${escHtml(heading)}</strong></p>` : '') + body);
        continue;
      }
      let heading = label;
      const ns = normLabel(sec);
      const generic = SECTION_WORDS.includes(ns) || SECTION_WORDS.includes(ns.endsWith('について') ? ns.slice(0, -4) : ns);
      if (sec && !generic && matchRule(sec) === null && sec !== label) {
        const ss = shortSec(sec);
        heading = label ? `${ss} ／ ${label}` : ss;
      }
      add(field, heading, body);
      lastField = field;
    }

    const needsHeading = (f, hd) => {
      if (!hd) return false;
      const n = normLabel(hd);
      for (const lab of [UI_LABEL[f] || ''].concat(UI_ALIASES[f] || [])) {
        const ui = normLabel(lab);
        if (ui && (ui.includes(n) || n.endsWith(ui) || (n.includes(ui) && cpLen(n) <= cpLen(ui) + 4))) return false;
      }
      return true;
    };

    for (const [f, parts] of fields) {
      if (f === 'w_ins') {
        const joined = parts.map(([, h]) => htmlToPlain(h).replace(/\n/g, ' ')).join(' ');
        payload[f] = Array.from(joined).slice(0, 500).join('');
        continue;
      }
      if (parts.length === 1 && !needsHeading(f, parts[0][0])) payload[f] = parts[0][1];
      else payload[f] = parts.map(([hd, h]) => (hd ? `<p><strong>▼ ${escHtml(hd)}</strong></p>` : '') + h).join('');
    }
    for (const k of ['pln', 'dst', 'opt']) if (k in meisai) payload['m_' + k] = pyDumps(meisai[k]);
    payload.notice = notice.join('');
    payload.qa = qaItems.length ? pyDumps(qaItems) : '';
    payload.sch = schBlocks.length ? pyDumps(schBlocks) : '';
    payload.url = '[]';
    payload.tags = tags.join(', ');
    report.agt_info = agtInfo;
    report.cat = cat;
    return { payload, report };
  }

  // お役立ち情報で同名になるものは元ブック名で区別(Python main() と同じ)
  function finalize(results) {
    const cnt = new Map();
    for (const x of results) { const k = x.payload.cat + '\u0000' + x.payload.title; cnt.set(k, (cnt.get(k) || 0) + 1); }
    for (const x of results) {
      if (x.payload.cat === 'お役立ち情報' && cnt.get(x.payload.cat + '\u0000' + x.payload.title) > 1) {
        x.payload.title += `（${strip(x.report.book).replace(/）+$/u, '')}）`;
      }
    }
    return results;
  }

  // ---------- AGTマスタ・エリア(build_xlsx.py と同じ) ----------
  function agtMasterRows(results) {
    const texts = new Map();
    for (const x of results) for (const [code, t] of Object.entries(x.report.agt_info || {})) {
      if (!texts.has(code)) texts.set(code, []);
      texts.get(code).push(t);
    }
    const codes = Array.from(new Set(results.map(x => x.payload.agt_code).filter(Boolean))).sort();
    const plainOf = (h) => unescHtml(String(h || '').replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (m, u, t) => `${t}（${unescHtml(u)}）`)
      .replace(/<\/p>|<br>/g, '\n').replace(/<[^>]+>/g, ''));
    const allText = new Map(codes.map(c => [c, []]));
    for (const x of results) {
      const c = x.payload.agt_code;
      if (c) allText.get(c).push(Object.values(x.payload).filter(v => typeof v === 'string').map(plainOf).join(' '));
    }
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return codes.map(code => {
      const ts = texts.get(code) || [];
      let name = '';
      for (const t of ts) {
        const first = t.split('\n')[0];
        const m = new RegExp('^\\s*(.+?)\\s*(?:[（(]\\s*(?:AGTコード[：:]\\s*)?' + esc(code) + '\\s*[)）]|/\\s*AGTコード)', 'u').exec(first)
          || /^\s*(.+?)\s*\/?\s*AGTコード/u.exec(t.replace(/\n/g, ' '));
        if (m) { name = m[1].replace(/^[ 　/]+|[ 　/]+$/gu, ''); break; }
      }
      if (!name) {
        for (const t of allText.get(code) || []) {
          const m = new RegExp('AGTコード\\s*[＝=：:]\\s*' + esc(code) + '\\s*[（(]([^）)]{2,25})[）)]', 'u').exec(t);
          if (m) { name = strip(m[1]); break; }
        }
      }
      const src = ts.join('\n');
      const phone = (/0\d{1,3}-\d{2,4}-\d{3,4}/.exec(src) || [''])[0];
      const mail = (/[\w.+-]+@[\w-]+\.[\w.-]+/.exec(src) || [''])[0];
      const url = (/https?:\/\/[^\s）)]+/.exec(src) || [''])[0];
      return { code, name, phone, email: mail, web: url };
    });
  }

  function areaList(results) {
    const out = [];
    for (const x of results) {
      const a = x.payload.area;
      if (['フォト', 'ウェディング'].includes(x.payload.cat) && a && !out.includes(a)) out.push(a);
    }
    return out;
  }

  // ---------- xlsx読み込み(SheetJS + 書式はxlsx内部のXMLから直接読む) ----------
  function decodeBytes(content) {
    if (typeof content === 'string') return content;
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(content);
    return Buffer.from(content).toString('utf-8');
  }

  function xmlAttr(attrs, name) {
    const m = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(attrs);
    return m ? m[1] : null;
  }

  function parseFonts(stylesXml) {
    const fonts = [];
    const fontsSec = /<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(stylesXml);
    if (fontsSec) {
      const re = /<font\b[^>]*?(?:\/>|>([\s\S]*?)<\/font>)/g;
      let m;
      while ((m = re.exec(fontsSec[1]))) {
        const inner = m[1] || '';
        const flag = (tag) => {
          const t = new RegExp('<' + tag + '\\b([^>]*)\\/{0,1}>').exec(inner);
          if (!t) return false;
          const v = xmlAttr(t[1], 'val');
          return v === null || v === '1' || v === 'true';
        };
        let red = false;
        const col = /<color\b([^>]*)\/{0,1}>/.exec(inner);
        if (col) {
          const rgb = xmlAttr(col[1], 'rgb');
          if (rgb) {
            const h = rgb.slice(-6).toUpperCase();
            const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), bb = parseInt(h.slice(4, 6), 16);
            red = r >= 0xC0 && g <= 0x50 && bb <= 0x50;
          }
        }
        fonts.push({ b: flag('b'), strike: flag('strike'), red });
      }
    }
    const xfFont = [];
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
    if (xfs) {
      const re = /<xf\b([^>]*?)(?:\/>|>)/g;
      let m;
      while ((m = re.exec(xfs[1]))) xfFont.push(parseInt(xmlAttr(m[1], 'fontId') || '0', 10));
    }
    return { fonts, xfFont };
  }

  function sheetPaths(files) {
    // シート名 -> worksheets/sheetN.xml
    const wbXml = decodeBytes(files['xl/workbook.xml'].content);
    const relsXml = decodeBytes(files['xl/_rels/workbook.xml.rels'].content);
    const rels = {};
    let m;
    const rr = /<Relationship\b([^>]*)\/{0,1}>/g;
    while ((m = rr.exec(relsXml))) rels[xmlAttr(m[1], 'Id')] = xmlAttr(m[1], 'Target');
    const out = {};
    const sr = /<sheet\b([^>]*)\/{0,1}>/g;
    while ((m = sr.exec(wbXml))) {
      const name = unescHtml(xmlAttr(m[1], 'name') || '');
      let target = rels[xmlAttr(m[1], 'r:id')] || '';
      target = target.replace(/^\//, '');
      if (!target.startsWith('xl/')) target = 'xl/' + target;
      out[name] = target;
    }
    return out;
  }

  function cellStyleIndex(sheetXml) {
    const map = {};
    const re = /<c\b([^>]*?)(?:\/>|>)/g;
    let m;
    while ((m = re.exec(sheetXml))) {
      const r = xmlAttr(m[1], 'r');
      const s = xmlAttr(m[1], 's');
      if (r && s !== null) map[r] = parseInt(s, 10);
    }
    return map;
  }

  /** xlsxのバイト列 → シートごとのモデル [{sheetName, cells, merges}] */
  function readWorkbook(data, XLSX) {
    const wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? 'array' : undefined, cellDates: false, cellNF: true, bookFiles: true });
    const files = wb.files || {};
    const styles = files['xl/styles.xml'] ? parseFonts(decodeBytes(files['xl/styles.xml'].content)) : { fonts: [], xfFont: [] };
    let paths = {};
    try { paths = sheetPaths(files); } catch (e) { paths = {}; }
    return wb.SheetNames.map(sheetName => {
      const ws = wb.Sheets[sheetName];
      const p = paths[sheetName];
      const sIdx = p && files[p] ? cellStyleIndex(decodeBytes(files[p].content)) : {};
      const cells = [];
      for (const addr of Object.keys(ws)) {
        if (addr[0] === '!') continue;
        const c = ws[addr];
        const pos = XLSX.utils.decode_cell(addr);
        let value = null;
        if (c.t === 's' || c.t === 'str') value = c.v;
        else if (c.t === 'b') value = !!c.v;
        else if (c.t === 'e') value = c.w || '#ERROR';
        else if (c.t === 'n') {
          const fmt = c.z || '';
          if (fmt && XLSX.SSF.is_date(fmt)) {
            const d = XLSX.SSF.parse_date_code(c.v);
            const timeOnly = c.v < 1 && !/[ymd]/i.test(String(fmt).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, ''));
            value = { __dt: true, kind: timeOnly ? 'time' : 'datetime', y: d.y, m: d.m, d: d.d, H: d.H, M: d.M };
          } else value = c.v;
        } else if (c.t === 'd') value = c.v;
        if (value === null || value === undefined) continue;
        let link = null;
        if (c.l && c.l.Target && /^(https?:|mailto:)/.test(c.l.Target)) {
          link = c.l.Target.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
          if (c.l.location && !link.includes('#')) link += '#' + c.l.location;
          while (link.includes('&amp;')) link = link.replace(/&amp;/g, '&');
        }
        const xf = sIdx[addr];
        const font = styles.fonts[styles.xfFont[xf === undefined ? 0 : xf] || 0] || styles.fonts[0] || { b: false, strike: false, red: false };
        cells.push({ row: pos.r + 1, column: pos.c + 1, coordinate: addr, value, link, bold: !!font.b, strike: !!font.strike, red: !!font.red });
      }
      const merges = (ws['!merges'] || []).map(m => ({ r1: m.s.r + 1, c1: m.s.c + 1, r2: m.e.r + 1, c2: m.e.c + 1 }));
      return { sheetName, cells, merges };
    });
  }

  /** ファイル名(拡張子なし)とシート名から (元ブック名, タブ名) を決める */
  function bookAndTab(fileBase, sheetName, sheetCount) {
    const name = String(fileBase).replace(/#U([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      // 同じファイルを複数回ダウンロードしたときにブラウザが付ける「 (1)」「 (2)」を除く
      .replace(/\s+\(\d+\)\s*$/, '');
    if (sheetCount === 1 && name.includes('_')) {
      const i = name.indexOf('_');
      return [name.slice(0, i), strip(name.slice(i + 1))];
    }
    return [name, strip(sheetName)];
  }

  // 同期判定用の指紋(GAS側 Code.gs の legacyFingerprint_ と同じ計算)
  const FP_SKIP = { rowId: 1, status: 1, is_draft: 1, updated_at: 1, src: 1 };
  function fnv(str) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return h1.toString(36) + h2.toString(36);
  }
  function fieldFingerprints(rec) {
    const out = {};
    Object.keys(rec).sort().forEach(k => { if (!FP_SKIP[k] && rec[k] !== '' && rec[k] != null) out[k] = fnv(String(rec[k])); });
    return out;
  }

  const api = {
    readWorkbook, bookAndTab, convertSheet, finalize, agtMasterRows, areaList, fieldFingerprints,
    _internal: { fmtValue, htmlToPlain, pyDumps, matchRule, normLabel },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LegacyConverter = api;
})(typeof self !== 'undefined' ? self : this);
