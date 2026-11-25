"""変換結果(JSON) -> スプレッドシートに読み込む「移行データ」xlsx"""
import sys, json
import openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE

data_path, out_path = sys.argv[1], sys.argv[2]
CHUNK = 30000  # xlsxのセル上限32,767文字未満
BAD_LEAD = ('=', '+', '-', '@')  # 先頭がこれだと数式扱いされうるので分割位置をずらす

data = json.load(open(data_path, encoding='utf-8'))


def chunks(s):
    out, i = [], 0
    while i < len(s):
        j = min(i + CHUNK, len(s))
        while j < len(s) and s[j] in BAD_LEAD:
            j -= 1
        out.append(s[i:j])
        i = j
    return out


def clean(v):
    return ILLEGAL_CHARACTERS_RE.sub('', str(v or ''))


wb = openpyxl.Workbook(write_only=True)
ws = wb.create_sheet('移行データ')
header = ['area', 'country', 'city', 'cat', 'title', 'season_year', 'season_type', 'is_draft', 'updated_at', 'tags', 'product_url']
max_chunks = 0
rows = []
for x in data:
    p = dict(x['payload'])
    p['rowId'] = ''
    p['is_draft'] = 'false'
    p = {k: clean(v) for k, v in p.items()}
    meta = [p.get('area', ''), p.get('country', ''), p.get('city', ''), p.get('cat', ''), p.get('title', ''),
            p.get('season_year', ''), p.get('season_type', ''), 'false', '', p.get('tags', ''), p.get('product_url', '')]
    for m in meta:
        assert not m.startswith('='), m
    js = json.dumps(p, ensure_ascii=False, separators=(',', ':'))
    json.loads(js)
    ch = chunks(js)
    assert ''.join(ch) == js
    max_chunks = max(max_chunks, len(ch))
    rows.append(meta + ch)

ws.append(header + [f'data{i + 1}' for i in range(max_chunks)])
for r in rows:
    ws.append(r)

# ---- AGTマスタ(コード・会社名・電話・メール・参照URL) ----
import re, html as _html, collections


def plain(h):
    h = re.sub(r'<a href="([^"]*)"[^>]*>(.*?)</a>', lambda m: f'{m.group(2)}（{_html.unescape(m.group(1))}）', h or '')
    h = re.sub(r'</p>|<br>', '\n', h)
    return _html.unescape(re.sub(r'<[^>]+>', '', h))


agt = collections.OrderedDict()
for x in data:
    for code, t in (x['report'].get('agt_info') or {}).items():
        agt.setdefault(code, {'texts': []})['texts'].append(t)
codes = sorted({x['payload']['agt_code'] for x in data if x['payload'].get('agt_code')})
alltext = {c: [] for c in codes}
for x in data:
    c = x['payload'].get('agt_code')
    if c:
        alltext[c].append(' '.join(plain(v) for k, v in x['payload'].items() if isinstance(v, str)))

AGT_HEADER = ['AGTコード', '正式会社名', '電話番号', 'メールアドレス', 'WEBサイトURL', '営業時間/定休日', '空き状況確認', '予約方法',
              'OP追加時', 'ファイナル', '変更', 'CXL', '備考', '衣裳概要', '衣裳合わせ', '早期特典', '衣裳持込', '差額収受先',
              'お着換え', 'アルバム概要', 'オプション概要', '予約後お渡しする書類', '注意事項', 'ブーケについて']
agt_rows = []
for code in codes:
    texts = agt.get(code, {}).get('texts', [])
    name = ''
    for t in texts:
        first = t.split('\n')[0]
        m = re.match(r'^\s*(.+?)\s*(?:[（(]\s*(?:AGTコード[：:]\s*)?' + code + r'\s*[)）]|/\s*AGTコード)', first) or \
            re.match(r'^\s*(.+?)\s*/?\s*AGTコード', t.replace('\n', ' '))
        if m:
            name = m.group(1).strip(' 　/')
            break
    if not name:
        for t in alltext.get(code, []):
            m = re.search(r'AGTコード\s*[＝=：:]\s*' + code + r'\s*[（(]([^）)]{2,25})[）)]', t)
            if m:
                name = m.group(1).strip()
                break
    src = '\n'.join(texts)
    phone = (re.search(r'0\d{1,3}-\d{2,4}-\d{3,4}', src) or [''])[0]
    mail = (re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', src) or [''])[0]
    url = (re.search(r'https?://[^\s）)]+', src) or [''])[0]
    agt_rows.append([code, name, phone, mail, url] + [''] * (len(AGT_HEADER) - 5))
wa = wb.create_sheet('移行AGTマスタ')
wa.append(AGT_HEADER)
for r in agt_rows:
    wa.append([clean(v) for v in r])

# ---- エリアマスタ ----
areas = []
for x in data:
    a = x['payload'].get('area')
    if x['payload']['cat'] in ('フォト', 'ウェディング') and a and a not in areas:
        areas.append(a)
we = wb.create_sheet('移行エリア')
we.append(['エリア'])
for a in areas:
    we.append([a])
print('agt', len(agt_rows), 'named', sum(1 for r in agt_rows if r[1]), 'areas', areas)
for r in agt_rows:
    print('  ', r[:5])
wb.save(out_path)
print('rows', len(rows), 'max chunks', max_chunks)
