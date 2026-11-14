"""旧商説xlsx(1タブ1ファイル) -> 新ポータル「シート1」行形式へ変換"""
import sys, os, re, json, html, datetime, collections
import openpyxl


CHUNK = 30000  # xlsxのセル上限(32,767)未満


def dec(n):
    return re.sub(r'#U([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), n)


# ---------- 元ブック名 -> エリア ----------
BOOK_AREA = [
    ('HWI', 'ハワイ'), ('Feel Hawaii', 'ハワイ'), ('ハワイ', 'ハワイ'),
    ('沖縄', '沖縄'), ('Okinawa', '沖縄'),
    ('GUM', 'グアム'), ('グアム', 'グアム'),
    ('DPS', 'バリ'),
    ('EUR', 'ヨーロッパ'),
    ('南太平洋', '南太平洋'),
    ('その他エリア', 'その他海外'),
    ('国内', '国内'),
]
COUNTRY_KW = [
    ('モルディブ', 'モルディブ'), ('タヒチ', 'タヒチ'), ('ボラボラ', 'タヒチ'), ('モーレア', 'タヒチ'),
    ('ニューカレドニア', 'ニューカレドニア'), ('フィジー', 'フィジー'),
    ('ニュージーランド', 'ニュージーランド'), ('（CNS）', 'オーストラリア'), ('（OOL）', 'オーストラリア'),
('オーストラリア', 'オーストラリア'),
    ('ベトナム', 'ベトナム'), ('ダナン', 'ベトナム'), ('セブ', 'フィリピン'), ('エジプト', 'エジプト'),
    ('ロサンゼルス', 'アメリカ'), ('ニューヨーク', 'アメリカ'), ('ラスベガス', 'アメリカ'),
    ('サイパン', 'サイパン'), ('パラオ', 'パラオ'), ('台湾', '台湾'), ('韓国', '韓国'), ('タイ', 'タイ'),
    ('イタリア', 'イタリア'), ('ヴィラ', 'イタリア'), ('フランス', 'フランス'), ('パリ', 'フランス'),
    ('スペイン', 'スペイン'), ('ポルトガル', 'ポルトガル'), ('チェコ', 'チェコ'), ('ドイツ', 'ドイツ'),
    ('イギリス', 'イギリス'), ('ロンドン', 'イギリス'), ('オーストリア', 'オーストリア'),
    ('フィンランド', '北欧'), ('スウェーデン', '北欧'), ('ノルウェー', '北欧'),
    ('ウズベキスタン', 'ウズベキスタン'), ('ウユニ', 'ボリビア'), ('カナダ', 'カナダ'), ('カンボジア', 'カンボジア'),
    ('ケニア', 'ケニア'), ('シンガポール', 'シンガポール'), ('セドナ', 'アメリカ'), ('バハマ', 'バハマ'),
    ('プーケット', 'タイ'), ('モロッコ', 'モロッコ'), ('CUN', 'メキシコ'), ('カンクン', 'メキシコ'), ('ジラーラ', 'メキシコ'),
    ('ギリシャ', 'ギリシャ'), ('スイス', 'スイス'), ('トルコ', 'トルコ'), ('ドバイ', 'UAE'), ('モンサンミシェル', 'フランス'),
    ('マルタ', 'マルタ'), ('サントニー', 'フランス'), ('シャンティ', 'フランス'), ('シェーンブルン', 'オーストリア'),
    ('アメリカンカテドラル', 'フランス'), ('アメリカンチャーチ', 'フランス'), ('ヴィッキオマッジョ', 'イタリア'),
    ('サン・ジョヴァンニ', 'イタリア'), ('ローマ', 'イタリア'), ('フィレンツェ', 'イタリア'), ('ヴェネツィア', 'イタリア'),
    ('ウィーン', 'オーストリア'), ('プラハ', 'チェコ'), ('バルセロナ', 'スペイン'), ('リスボン', 'ポルトガル'),
    ('北海道', '北海道'), ('札幌', '北海道'), ('小樽', '北海道'), ('トマム', '北海道'), ('水の教会', '北海道'),
    ('ハウステンボス', '長崎'), ('石垣', '八重山'), ('竹富', '八重山'), ('西表', '八重山'),
]


def area_of(book):
    for k, v in BOOK_AREA:
        if k in book:
            return v
    return 'その他'


def country_of(area, book, tab, full_title, all_text=''):
    if area not in ('南太平洋', 'その他海外', 'ヨーロッパ'):
        return ''

    def hits(text):
        found = []
        for k, v in COUNTRY_KW:
            if k in text and v not in found:
                found.append(v)
        return found

    h = hits(tab)
    if h:
        return h[0]
    h = hits(full_title or '')
    if len(h) == 1:
        return h[0]
    # 本文中の地名の出現回数が他を大きく引き離している場合のみ採用
    cnt = collections.Counter()
    for k, v in COUNTRY_KW:
        if len(k) >= 2 and not k.startswith('（'):
            cnt[v] += all_text.count(k)
    top = cnt.most_common(2)
    if top and top[0][1] >= 3 and (len(top) == 1 or top[0][1] >= 2 * top[1][1]):
        return top[0][0]
    return 'その他'


# ---------- セル → HTML ----------
def fmt_value(v):
    if v is None:
        return ''
    if isinstance(v, datetime.datetime):
        if v.hour or v.minute:
            return v.strftime('%Y/%m/%d %H:%M')
        return v.strftime('%Y/%m/%d')
    if isinstance(v, datetime.date):
        return v.strftime('%Y/%m/%d')
    if isinstance(v, datetime.time):
        return v.strftime('%H:%M')
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = str(v)
    s = s.replace('_x000d_', '').replace('\r\n', '\n').replace('\r', '\n')
    return s


def link_of(c):
    h = c.hyperlink
    if h is None:
        return None
    t = h.target
    if t and re.match(r'^(https?:|mailto:)', t):
        return t
    return None


def is_red(c):
    try:
        col = c.font.color
        if col is not None and col.type == 'rgb' and isinstance(col.rgb, str):
            rgb = col.rgb[-6:].upper()
            r, g, b = int(rgb[0:2], 16), int(rgb[2:4], 16), int(rgb[4:6], 16)
            return r >= 0xC0 and g <= 0x50 and b <= 0x50
    except Exception:
        pass
    return False


def style_line(c, inner):
    f = c.font
    if f is not None and f.strike:
        inner = f'<s>{inner}</s>'
    if is_red(c):
        inner = f'<span style="color: rgb(230, 0, 0);">{inner}</span>'
    if f is not None and f.b:
        inner = f'<strong>{inner}</strong>'
    return inner


def link_btn(url, label='リンクを開く'):
    return f'<a href="{html.escape(url)}" target="_blank">{label}</a>'


def cell_lines(c):
    """セル→行ごとのHTML断片のリスト(段落分割用。<br>は使わない)"""
    text = fmt_value(c.value).strip('\n')
    if not text.strip():
        return []
    raw = [l for l in text.split('\n')]
    lines = [style_line(c, html.escape(l, quote=False)) if l.strip() else '' for l in raw]
    url = link_of(c)
    if url:
        if len(raw) == 1 and len(text) <= 30:
            lines = [style_line(c, link_btn(url, html.escape(text, quote=False)))]
        else:
            lines.append(link_btn(url))
    return lines


def cell_html(c):
    """1行に収める用(一覧表の見出し等)"""
    return ' ／ '.join(l for l in cell_lines(c) if l)


def cell_plain(c):
    t = fmt_value(c.value).strip()
    url = link_of(c)
    if url and url not in t:
        t = f'{t}（{url}）'
    return t


def html_to_plain(h):
    h = re.sub(r'<a href="([^"]*)"[^>]*>(.*?)</a>',
               lambda m: m.group(2) if m.group(1) in m.group(2) else f'{m.group(2)}（{html.unescape(m.group(1))}）', h, flags=re.S)
    h = re.sub(r'<br\s*/?>', '\n', h)
    h = re.sub(r'</p>\s*', '\n', h)
    h = re.sub(r'<[^>]+>', '', h)
    return html.unescape(h).strip()


def safe_attr_text(s):
    # CMSのvalue="..."に直接埋め込まれるため
    return s.replace('"', '”').replace('<', '＜').replace('>', '＞')


# ---------- 見出しの正規化 ----------
def norm_label(s):
    s = s.split('\n')[0]
    s = re.sub(r'[①-⑳★☆■□●◆◇・※＊*【】\[\]<>＜＞〈〉:：\s　]', '', s)
    return s


# 項目ルール（上から優先）
RULES = [
    ('agt', ['催行会社']),
    ('product_url', ['商品詳細']),
    ('w_imp', ['挙式不可']),
    ('w_ins', ['即日回答']),
    ('area_f', ['滞在先対象', '対象エリア']),
    ('deliv', ['データ納品']),
    ('loc', ['お支度場所', '支度場所']),
    ('child', ['お子様']),
    ('comp', ['同行者']),
    ('c_ben', ['早期申し込み特典', '早期申込', '早期特典']),
    ('c_fit', ['衣裳合わせ', '衣装合わせ', '試着']),
    ('w_abd', ['放棄']),
    ('w_ret', ['返却']),
    ('w_fit', ['衣裳小物持込', '衣装小物持込', '小物持込']),
    ('c_pay', ['差額', '集金先', '収受先']),
    ('c_fee', ['衣裳持込', '衣装持込', '持込料']),
    ('c_chg', ['お着換え', 'お着替え', '着替え', '着換え']),
    ('opt', ['OPについて', 'オプションについて', 'オプション概要']),
    ('alb', ['アルバム']),
    ('bouquet', ['ブーケ']),
    ('docs', ['書類', '同意書', '約款']),
    ('attn', ['注意事項']),
    ('qa', ['よくある質問']),
    ('w_flw', ['現地到着後', '現地BFG', '挙式当日']),
    ('sch', ['スケジュール']),
    ('p_av', ['空き状況', '空き照会', 'STS確認', 'HOLD']),
    ('p_bk', ['予約方法', '予約フロー', '予約の流れ', '手配フロー']),
    ('m_sum', ['明細作成', '必要な明細', '明細']),
    ('p_op', ['OPが追加', 'OPの追加', 'OP追加', '追加オプション', '登録内容変更']),
    ('p_fn', ['ファイナル', 'FNL']),
    ('w_ga', ['書面お渡し', 'G/A']),
    ('p_cx', ['取消', 'キャンセル', 'CXL']),
    ('p_ch', ['変更']),
    ('p_rem', ['備考', '申込期限']),
    ('c_sum', ['衣裳について', '衣装について', '衣裳概要', '衣裳', '衣装']),
]

UI_LABEL = {
    'area_f': '滞在先対象エリア', 'deliv': 'データ納品について', 'loc': '撮影当日のお支度場所', 'child': 'お子様が同行される場合',
    'comp': '同行者について', 'c_sum': '衣裳について', 'c_fit': '衣裳合わせについて', 'c_ben': '早期申し込み特典について',
    'c_fee': '衣裳持込', 'c_pay': '衣裳差額収受先', 'c_chg': 'お着換えについて', 'alb': 'アルバムについて',
    'opt': 'オプションについて', 'bouquet': 'ブーケについて', 'docs': 'お渡し書類', 'attn': '注意事項',
    'p_av': '空き状況確認方法', 'p_bk': '予約方法', 'p_op': 'OPが追加になった場合', 'p_fn': 'ファイナル', 'p_ch': '変更',
    'p_cx': 'CXL', 'p_rem': '備考', 'w_imp': '挙式不可日', 'w_fit': '衣裳小物持込', 'w_abd': '放棄する場合の対応',
    'w_ret': '現地での返却時間・場所', 'w_ga': '書面お渡し（G/A）', 'w_flw': '現地到着後の流れ', 'm_sum': '明細作成',
}

PHOTO_FIELDS = {'area_f', 'deliv', 'loc', 'child', 'comp', 'c_sum', 'c_fit', 'c_ben', 'c_fee', 'c_pay', 'c_chg',
                'alb', 'opt', 'bouquet', 'docs', 'attn', 'p_av', 'p_bk', 'p_op', 'p_fn', 'p_ch', 'p_cx', 'p_rem',
                'm_sum', 'qa', 'sch', 'product_url', 'agt'}
WED_FIELDS = {'w_imp', 'w_ins', 'c_pay', 'w_fit', 'w_abd', 'w_ret', 'p_av', 'p_bk', 'p_op', 'p_fn', 'p_ch', 'p_cx',
              'w_ga', 'p_rem', 'w_flw', 'm_sum', 'qa', 'product_url', 'agt'}
# カテゴリで表示されない項目の振替先
PHOTO_FALLBACK = {'w_fit': 'c_fee', 'w_abd': 'c_fee', 'w_ret': 'c_chg', 'w_ga': 'p_fn', 'w_ins': 'p_rem'}
WED_FALLBACK = {'c_fee': 'w_fit', 'c_chg': 'w_ret', 'docs': 'w_ga'}


def match_rule(text):
    n = norm_label(text)
    if not n:
        return None
    for field, kws in RULES:
        for k in kws:
            if k.upper() in n.upper():
                return field
    return None


def cat_of_book(book):
    if 'フォト' in book:
        return 'フォト'
    if any(k in book for k in ('挙式', '商品説明書', 'Feel')):
        return 'ウェディング'
    return None


def detect_cat(cells_text, book):
    t = cells_text
    wed = sum(k in t for k in ['現地到着後の流れ', 'STS確認', '挙式不可', '現地BFG', '挙式当日', '書面お渡し'])
    photo = sum(k in t for k in ['データ納品', 'お支度場所', '空き状況確認', '撮影当日', 'フォトプラン判別'])
    if wed >= 2 and wed >= photo:
        return 'ウェディング'
    if photo >= 2:
        return 'フォト'
    return None


AGT_PATTERNS = [r'AGTコード[：:]\s*([A-Z]{3})', r'【([A-Z]{3})】', r'[（(]([A-Z]{3})[）)]']


def find_agt(*texts):
    for t in texts:
        if not t:
            continue
        for p in AGT_PATTERNS:
            m = re.search(p, t)
            if m:
                return m.group(1)
    return ''


# ---------- 縦型フォームの解析 ----------
LABEL_MAX_COL = 2  # A,B列が見出し列


def parse_form(ws):
    rows = []
    for r in ws.iter_rows():
        cells = [c for c in r if c.value not in (None, '') and fmt_value(c.value).strip() not in ('', '社外秘')]
        if cells:
            rows.append((r[0].row, cells))

    blocks = []  # dict(section, label, rows=[cells...], kind)
    section = ''
    i = 0
    while i < len(rows):
        rn, cells = rows[i]
        first = cells[0]
        # 表(明細表など)：4セル以上の行が連続する所は1つの表ブロックにまとめる
        if len(cells) >= 4 and i + 1 < len(rows) and len(rows[i + 1][1]) >= 3:
            trows = [cells]
            j = i + 1
            while j < len(rows) and (len(rows[j][1]) >= 3 or rows[j][1][0].column > LABEL_MAX_COL):
                trows.append(rows[j][1])
                j += 1
            blocks.append(dict(section=section, label='', rows=trows, table=True))
            i = j
            continue
        if first.column <= LABEL_MAX_COL:
            label_text = fmt_value(first.value).strip()
            value_cells = cells[1:]
            cont = []
            j = i + 1
            while j < len(rows) and rows[j][1][0].column > LABEL_MAX_COL:
                cont.append(rows[j][1])
                j += 1
            short = len(label_text) <= 25 and '\n' not in label_text
            if not value_cells and not cont:
                # 見出しのみの行
                m = re.match(r'^([^\n：:]{2,45}?)\s*[：:]\s*(.+)$', label_text, re.S)
                if m and re.search(r'\d$', m.group(1)):
                    m = None  # 「8:45」等の時刻はラベル区切りではない
                if m:
                    blocks.append(dict(section=section, label=m.group(1), rows=[], inline=m.group(2), src=first))
                elif not link_of(first) and ((short and is_section_title(label_text)) or strict_section(label_text)):
                    section = label_text
                    blocks.append(dict(section=section, label=label_text, rows=[], header=True))
                else:
                    blocks.append(dict(section=section, label='', rows=[[first]], loose=True))
            else:
                lab = label_text
                lead_rows = [value_cells] if value_cells else []
                if strict_section(label_text):
                    # 右側にリンク等が付いたセクション見出し
                    section = label_text
                    blocks.append(dict(section=section, label=label_text, rows=[], header=True))
                    if lead_rows or cont:
                        blocks.append(dict(section=section, label='', rows=lead_rows + cont, loose=True))
                elif not short:
                    # 長文が見出し列に入っているケース(本文扱い)
                    blocks.append(dict(section=section, label='', rows=[[first] + value_cells] + cont, loose=True))
                else:
                    blocks.append(dict(section=section, label=lab, rows=lead_rows + cont, label_cell=first))
            i = j
        else:
            # 見出し無しで本文列から始まる行（直前ブロックが無い場合）
            blocks.append(dict(section=section, label='', rows=[cells], loose=True))
            i += 1
    return blocks


SECTION_WORDS = ['基本情報', '手配方法', 'その他', '料金', 'プラン内容', '商品概要', '同行者', '衣装', '衣裳']


def is_section_title(t):
    t = t.strip()
    if re.match(r'^[★☆【].*[★☆】]$', t):
        return True
    n = norm_label(t)
    if any(n == w or n == w + 'について' for w in SECTION_WORDS):
        return True
    return match_rule(t) is not None and len(n) <= 12


def strict_section(t):
    t = t.strip()
    if '\n' in t or len(t) > 40:
        return False
    return bool(re.match(r'^[★☆].*[★☆]$', t) or re.match(r'^【[^】]*】.*★', t) or '手配方法' in t)


def short_section_like(t):
    return bool(re.match(r'^[★☆■【].*[★☆】]?$', t.strip())) and len(t) <= 25


def rows_html(rows):
    out = []
    for cells in rows:
        per = [cell_lines(c) for c in cells]
        per = [l for l in per if any(x for x in l)]
        if not per:
            continue
        if all(len(l) == 1 for l in per):
            out.append('<p>' + '　'.join(l[0] for l in per) + '</p>')
        else:
            for l in per:
                for x in l:
                    out.append(f'<p>{x}</p>' if x else '<p><br></p>')
    return ''.join(out)


MEISAI_COLS = {'name': ['必要な明細'], 'method': ['作成方法'], 'code': ['明細（例）', '明細(例)', 'コード', '明細例'],
               'city': ['都市'], 'agt': ['AGT'], 'date': ['日付'], 'dest': ['流し先']}


def extract_meisai(rows, taken=()):
    """明細表を検出。戻り値: (slots{pln,dst,opt}, 残りrows)"""
    hdr_idx = None
    colmap = {}
    for k, cells in enumerate(rows):
        texts = {c.column: fmt_value(c.value).strip() for c in cells}
        c1 = [col for col, t in texts.items() if '必要な明細' in t and len(t) <= 15]
        c2 = [col for col, t in texts.items() if '作成方法' in t and len(t) <= 15]
        if len(cells) >= 4 and c1 and c2 and set(c1) != set(c2):
            hdr_idx = k
            for col, t in texts.items():
                for key, kws in MEISAI_COLS.items():
                    if key not in colmap and any(kw in t for kw in kws):
                        colmap[key] = col
                        break
            break
    if hdr_idx is None:
        return {}, rows
    # 列は結合されていることがあるので「その列以降で次の見出し列未満」に入る値を拾う
    starts = sorted(colmap.items(), key=lambda kv: kv[1])
    slots = {}
    rest = rows[:hdr_idx]
    extra = []
    k = hdr_idx + 1
    while k < len(rows) and len(rows[k]) >= 3:
        cells = rows[k]
        rec = {}
        for c in cells:
            key = None
            for idx, (kk, col) in enumerate(starts):
                nxt = starts[idx + 1][1] if idx + 1 < len(starts) else 10 ** 6
                if col <= c.column < nxt:
                    key = kk
                    break
            if key is None and starts and c.column < starts[0][1]:
                key = starts[0][0]
            if key:
                rec[key] = (rec.get(key, '') + ' ' + cell_plain(c)).strip()
        name = rec.get('name', '')
        slot = None
        if 'プラン' in name and 'pln' not in slots:
            slot = 'pln'
        elif '判別' in name and 'dst' not in slots:
            slot = 'dst'
        elif ('オプション' in name or 'OP' in name) and 'opt' not in slots:
            slot = 'opt'
        elif 'pln' not in slots and k == hdr_idx + 1:
            slot = 'pln'
        if slot and slot in taken:
            slot = None
        if slot:
            d = {f: safe_attr_text(rec.get(f, '')) for f in ['method', 'code', 'city', 'agt', 'date', 'dest']}
            if name:
                d['method'] = safe_attr_text(name.replace('\n', ' ') + ' ／ ' + rec.get('method', ''))
            for f in d:
                d[f] = d[f].replace('\n', ' ')
            slots[slot] = d
        else:
            extra.append(cells)
        k += 1
    hdr_has_note = any('※' in fmt_value(c.value) or len(fmt_value(c.value).strip()) > 15 for c in rows[hdr_idx])
    if extra or hdr_has_note:
        rest.append(rows[hdr_idx])  # 構造化しきれなかった行は列名付きで本文に残す
        rest.extend(extra)
    rest.extend(rows[k:])
    return slots, rest


# ---------- 一覧・比較表 ----------
def fill_merged(ws):
    grid = {}
    for r in ws.iter_rows():
        for c in r:
            if c.value not in (None, '') and fmt_value(c.value).strip():
                grid[(c.row, c.column)] = c
    for mr in ws.merged_cells.ranges:
        tl = grid.get((mr.min_row, mr.min_col))
        if tl is None:
            continue
        for rr in range(mr.min_row, mr.max_row + 1):
            for cc in range(mr.min_col, mr.max_col + 1):
                if (rr, cc) != (mr.min_row, mr.min_col) and mr.max_row > mr.min_row:
                    # 縦結合のみ複製（横結合は1セル扱い）
                    if cc == mr.min_col:
                        grid[(rr, cc)] = tl
    return grid


def list_html(ws):
    grid = fill_merged(ws)
    by_row = collections.defaultdict(list)
    for (r, c), cell in grid.items():
        by_row[r].append((c, cell))
    rws = [sorted(v, key=lambda x: x[0]) for k, v in sorted(by_row.items())]
    if not rws:
        return ''
    # ヘッダ行: 先頭10行内で最もセル数が多い行
    cand = rws[:10]
    hdr = max(cand, key=len)
    out = []
    started = False
    hdr_cols = {c: fmt_value(cell.value).strip().replace('\n', ' ') for c, cell in hdr} if len(hdr) >= 3 else {}
    for row in rws:
        if row is hdr and hdr_cols:
            started = True
            frags = [cell_html(cell) for _, cell in row]
            out.append('<p><strong>【表の列】</strong>' + '　｜　'.join(f for f in frags if f) + '</p>')
            continue
        if not started or not hdr_cols or len(row) < 2:
            frags = [cell_html(cell) for _, cell in row]
            frags = [f for f in frags if f]
            if frags:
                if len(row) == 1 and len(fmt_value(row[0][1].value)) <= 30:
                    out.append('<h3>' + frags[0] + '</h3>')
                else:
                    out.append('<p>' + '　｜　'.join(frags) + '</p>')
            continue
        first_c, first_cell = row[0]
        out.append('<p><strong>▼ ' + cell_html(first_cell) + '</strong></p>')
        lines = []
        for c, cell in row[1:]:
            h = hdr_cols.get(c)
            if h is None:
                # 結合などで列位置がずれている場合は直前のヘッダ列
                keys = [k for k in hdr_cols if k <= c]
                h = hdr_cols[max(keys)] if keys else ''
            vl = [x for x in cell_lines(cell) if x]
            if vl:
                lines.append((f'{html.escape(h)}：' if h else '') + vl[0])
                lines.extend(vl[1:])
        out.extend(f'<p>{x}</p>' for x in lines)
    return ''.join(out)


# ---------- メイン変換 ----------
def convert(path, fname):
    name = dec(fname)[:-5]
    book, _, tab = name.partition('_')
    tab = tab.strip()
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.worksheets[0]

    all_text = ' '.join(fmt_value(c.value) for r in ws.iter_rows() for c in r if c.value not in (None, ''))
    src_chars = len(re.sub(r'\s', '', all_text))
    area = area_of(book)

    # タイトル行(上部の最初のセル)
    full_title = ''
    for r in ws.iter_rows(max_row=6):
        for c in r:
            v = fmt_value(c.value).strip()
            if v and v != '社外秘':
                full_title = v.split('\n')[0]
                break
        if full_title:
            break

    cat = cat_of_book(book) or detect_cat(all_text, book)
    content_cat = detect_cat(all_text, book)
    wide_rows = sum(1 for r in ws.iter_rows() if sum(1 for c in r if c.value not in (None, '')) >= 4)
    tot_rows = sum(1 for r in ws.iter_rows() if any(c.value not in (None, '') for c in r))
    looks_like_plan = content_cat is not None or ('催行会社' in all_text and ('予約' in all_text or '空き' in all_text))
    is_list = (not looks_like_plan
               or (any(k in tab for k in ('一覧', '比較', '早見表')) and wide_rows / max(tot_rows, 1) > 0.2))
    if cat is None and not is_list:
        cat = content_cat

    payload = {k: '' for k in ['area', 'country', 'city', 'cat', 'title', 'notice', 'co', 'sheet_embed', 'sch', 'qa',
                               'url', 'season_year', 'season_type', 'is_draft', 'tags', 'promo', 'product_url',
                               'agt_code', 'w_ins', 'point', 'm_pln', 'm_dst', 'm_opt']}
    tags = [book.strip()]
    if '取り扱い終了' in tab or '取扱終了' in tab:
        tags.append('取り扱い終了')
    payload['is_draft'] = 'false'
    payload['agt_code'] = find_agt(tab, full_title)

    report = dict(file=name, book=book, tab=tab, area=area, src_chars=src_chars)

    if is_list:
        payload['cat'] = 'お役立ち情報'
        payload['area'] = '手配関連'
        payload['title'] = f'【{area}】{tab}'
        payload['notice'] = list_html(ws)
        payload['url'] = '[]'
        payload['tags'] = ', '.join(tags)
        report.update(cat='お役立ち情報(一覧)', mapped=[], notice_chars=len(html_to_plain(payload['notice'])))
        return payload, report

    payload['cat'] = cat
    payload['area'] = f'{area}（Feel）' if 'Feel' in book else area
    payload['country'] = country_of(area, book, tab, full_title, all_text)
    payload['title'] = tab
    allowed = PHOTO_FIELDS if cat == 'フォト' else WED_FIELDS
    fallback = PHOTO_FALLBACK if cat == 'フォト' else WED_FALLBACK

    blocks = parse_form(ws)
    fields = collections.OrderedDict()   # field -> list of (heading, html)
    notice = []                          # html parts
    qa_items = []
    sch_blocks = []
    meisai = {}
    links = []
    first_section_seen = False

    def add(field, heading, h):
        if not h:
            return
        fields.setdefault(field, []).append((heading, h))

    cur_section_header = None
    for b in blocks:
        if b.get('header'):
            first_section_seen = True
            cur_section_header = b['label']
            continue
        sec = b['section']
        label = b.get('label', '')
        body = ''
        if b.get('inline') is not None:
            src = b['src']
            body = ''.join(f'<p>{style_line(src, html.escape(l, quote=False))}</p>' for l in b['inline'].split('\n') if l.strip())
            if link_of(src):
                body += f'<p>{link_btn(link_of(src))}</p>'
        field = match_rule(label) if label else None
        sec_field = match_rule(sec) if sec else None
        if field is None and label == '' and sec_field in ('qa', 'w_flw', 'sch'):
            field = sec_field
        if field is None and label and sec_field in ('qa',):
            field = 'qa'
        if label and field is None and sec_field in ('w_flw',):
            field = 'w_flw'

        rows = b['rows']
        if field == 'm_sum' or (field is None and any(
                any('必要な明細' in fmt_value(c.value) for c in cells) for cells in rows)):
            slots, rows = extract_meisai(rows, taken=set(meisai))
            meisai.update(slots)
            if field is None:
                field = 'm_sum'
        if not body:
            body = rows_html(rows)

        if not first_section_seen and not label:
            notice.append(body)
            continue

        if field == 'agt':
            code = find_agt(html_to_plain(body))
            if code:
                payload['agt_code'] = code
            notice.append(f'<p><strong>{html.escape(label)}</strong></p>{body}')
            continue
        if field == 'product_url':
            m = re.search(r'href="(https?://[^"]+)"', body)
            if m and not payload['product_url']:
                payload['product_url'] = html.unescape(m.group(1))
            notice.append(f'<p><strong>{html.escape(label)}</strong></p>{body}')
            continue
        if field == 'qa':
            q = label or (cur_section_header or 'よくある質問')
            a = html_to_plain(body)
            if b.get('loose') and rows:
                txt = html_to_plain(body)
                q, _, a = txt.partition('\n')
            if q or a:
                qa_items.append({'q': safe_attr_text(norm_q(q)), 'a': a})
            continue
        if field == 'sch' and cat == 'フォト':
            items = []
            for line in html_to_plain(body).split('\n'):
                line = line.strip()
                if not line:
                    continue
                m = re.match(r'^(\d{1,2}[:：]\d{2}(?:\s*[～~-]\s*\d{1,2}[:：]\d{2})?)\s*(.*)$', line)
                if m:
                    items.append({'t': safe_attr_text(m.group(1)), 'x': m.group(2)})
                else:
                    items.append({'t': '', 'x': line})
            sch_blocks.append({'title': safe_attr_text(label.split('\n')[0]), 'items': items})
            continue
        if field in fallback and field not in allowed:
            field = fallback[field]
        if field is None or field not in allowed or field in ('sch',):
            heading = label or ''
            sec_h = f'<h3>{html.escape(sec)}</h3>' if sec and (not notice or f'<h3>{html.escape(sec)}</h3>' not in ''.join(notice)) else ''
            notice.append(sec_h + (f'<p><strong>{html.escape(heading)}</strong></p>' if heading else '') + body)
            continue
        heading = label
        generic = norm_label(sec) in SECTION_WORDS or norm_label(sec).rstrip('について') in SECTION_WORDS
        if sec and not generic and match_rule(sec) is None and sec != label:
            heading = f'{sec} ／ {label}' if label else sec
        add(field, heading, body)

    # ---- 書き込み ----
    def needs_heading(f, hd):
        if not hd:
            return False
        ui = norm_label(UI_LABEL.get(f, ''))
        n = norm_label(hd)
        return not (ui and (ui in n and len(n) <= len(ui) + 4 or n in ui))

    for f, parts in fields.items():
        if f == 'w_ins':
            payload[f] = ' '.join(html_to_plain(h).replace('\n', ' ') for _, h in parts)[:500]
            continue
        if len(parts) == 1 and not needs_heading(f, parts[0][0]):
            payload[f] = parts[0][1]
        else:
            payload[f] = ''.join((f'<p><strong>▼ {html.escape(hd)}</strong></p>' if hd else '') + h for hd, h in parts)

    for k in ('pln', 'dst', 'opt'):
        if k in meisai:
            payload['m_' + k] = json.dumps(meisai[k], ensure_ascii=False)

    # 表題(正式名)は冒頭の注記と一緒に既に本文先頭に入っている
    payload['notice'] = ''.join(notice)
    payload['qa'] = json.dumps(qa_items, ensure_ascii=False) if qa_items else ''
    payload['sch'] = json.dumps(sch_blocks, ensure_ascii=False) if sch_blocks else ''
    payload['url'] = '[]'
    payload['tags'] = ', '.join(tags)

    out_chars = 0
    for k, v in payload.items():
        if k in ('notice',) or k in fields:
            out_chars += len(re.sub(r'\s', '', html_to_plain(v)))
    report.update(cat=cat, country=payload['country'], agt=payload['agt_code'], mapped=sorted(fields.keys()) +
                  [('m_' + k) for k in meisai] + (['qa'] if qa_items else []) + (['sch'] if sch_blocks else []),
                  notice_chars=len(re.sub(r'\s', '', html_to_plain(payload['notice']))))
    return payload, report


def norm_q(q):
    return q.strip()


def main():
    SRC, OUT_JSON = sys.argv[1], sys.argv[2]
    ONLY = sys.argv[3] if len(sys.argv) > 3 else None
    results = []
    for f in sorted(os.listdir(SRC)):
        if not f.endswith('.xlsx'):
            continue
        if ONLY and ONLY not in dec(f):
            continue
        p, r = convert(os.path.join(SRC, f), f)
        # 取りこぼしチェック: 元テキストの各セル文字列が出力のどこかに含まれるか
        results.append({'payload': p, 'report': r})
    # お役立ち情報で同名になるものは元ブック名で区別
    cnt = collections.Counter((x['payload']['cat'], x['payload']['title']) for x in results)
    for x in results:
        if x['payload']['cat'] == 'お役立ち情報' and cnt[('お役立ち情報', x['payload']['title'])] > 1:
            x['payload']['title'] += f"（{x['report']['book'].strip().rstrip('）')}）"

    with open(OUT_JSON, 'w', encoding='utf-8') as fh:
        json.dump(results, fh, ensure_ascii=False)
    print('converted', len(results))


if __name__ == '__main__':
    main()
