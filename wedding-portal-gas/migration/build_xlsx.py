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
wb.save(out_path)
print('rows', len(rows), 'max chunks', max_chunks)
