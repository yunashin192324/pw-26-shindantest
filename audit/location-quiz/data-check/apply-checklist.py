# 記入済みチェック表（received/）の内容を fixed.txt の撮影地データに反映する。
# 使い方: python3 -I apply-checklist.py ../fixed.txt received
# - checklist-areas.csv: 推薦文・タグ・主な撮影都市・リンク・画像・予算区分・旅行日数
# - checklist-features.csv: 景色・演出の判定（「正しい判定」が記入されていればそれを、なければ「診断での現在の判定」を使う）
# 景色・演出の判定は撮影地データ（DEST）に一本化し、補助の対応一覧（SCENE_LIST / MOMENT_LIST）は使わなくする。
import csv, re, sys, os

target, recv = sys.argv[1], sys.argv[2]
src = open(target, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in src else '\n'
s = src.replace('\r\n', '\n')

def rd(p):
    return list(csv.DictReader(open(p, encoding='utf-8-sig')))

areas = rd(os.path.join(recv, 'checklist-areas.csv'))
feats = rd(os.path.join(recv, 'checklist-features.csv'))

ITEM = {'ビーチ・海': 'beach', '大自然・森・草原': 'nature', '奇岩・砂漠・絶景地形': 'landscape', '街並み・路地裏': 'street',
        'お城・宮殿': 'castle', '美術館・歴史建築': 'architecture', '遺跡': 'ruins', 'チャペル・教会': 'chapel', '花畑・庭園': 'garden',
        'ラグジュアリーホテル・ヴィラ': 'villa', 'サンセット（黄金の光）': 'sunset', '星空': 'starry', '夜景・イルミネーション': 'nightview',
        '気球・バルーン': 'balloon', '動物と一緒': 'animal', '朝日・早朝の光': 'morning'}
ATTR_ORDER = ['beach', 'nature', 'landscape', 'street', 'castle', 'architecture', 'ruins', 'chapel', 'garden', 'villa',
              'sunset', 'starry', 'nightview', 'balloon', 'animal', 'morning']
BL = {'60万円未満': 1, '60~100万円': 2, '100~140万円': 3, '140~180万円': 4, '180~250万円': 5, '250万円以上': 6}
DL = {'2~3日': 'short', '4~5日': 'medium', '6~7日': 'long', '8~10日': 'verylong', '11日以上': 'ultra'}

# DEST の各行を読む
line_re = re.compile(r"^(\s*)(\w+): \{ name:'([^']*)', en:'([^']*)', img:'([^']*)', link:'([^']*)', reason:'([^']*)', tags:\[([^\]]*)\], subCities:\[([^\]]*)\], (.*)\},?$")
lines = s.split('\n')
dest = {}
for i, ln in enumerate(lines):
    m = line_re.match(ln)
    if m and not ln.lstrip().startswith('//'):
        attrs = dict(re.findall(r"(\w+):(true|false)", m.group(10)))
        dest[m.group(2)] = dict(i=i, indent=m.group(1), name=m.group(3), en=m.group(4), img=m.group(5), link=m.group(6),
                                reason=m.group(7), tags=re.findall(r"'([^']*)'", m.group(8)),
                                sub=re.findall(r"'([^']*)'", m.group(9)), attrs=attrs, comma=ln.rstrip().endswith(','))

vocab = set(t for d in dest.values() for t in d['tags'])
def split_tags(text):
    tok = text.split('・'); out = []; i = 0
    while i < len(tok):
        if i + 1 < len(tok) and tok[i] + '・' + tok[i + 1] in vocab:
            out.append(tok[i] + '・' + tok[i + 1]); i += 2
        else:
            out.append(tok[i]); i += 1
    return out

changes = []
for r in areas:
    k = r['撮影地キー']; d = dest[k]
    for field, col, conv in [('reason', '推薦文', str), ('tags', 'タグ', split_tags), ('sub', '主な撮影都市', lambda t: t.split('・') if t else []),
                             ('link', 'リンク', str), ('img', '画像', str)]:
        v = conv(r[col])
        if v != d[field]:
            changes.append(f'{d["name"]} {col}: {d[field]} → {v}'); d[field] = v
    d['bands'] = [BL[x] for x in r['登録されている予算区分（この区分以上の予算で候補になる）'].split('（')[0].split('・')]
    d['days'] = [DL[x] for x in r['候補になる旅行日数'].split('・')]

for r in feats:
    k = r['撮影地キー']; x = ITEM[r['項目']]
    v = (r['正しい判定（○か×を記入）'] or r['診断での現在の判定']).strip()
    assert v in ('○', '×'), (k, x, v)
    dest[k].setdefault('feat', {})[x] = (v == '○')

def q(v): return "'" + v + "'"
for k, d in dest.items():
    other = {a: v for a, v in d['attrs'].items() if a not in ATTR_ORDER and a != 'domestic'}  # studio など
    parts = [f"{a}:{'true' if d['feat'][a] else 'false'}" for a in ATTR_ORDER]
    parts += [f'{a}:{v}' for a, v in other.items()] + [f"domestic:{d['attrs'].get('domestic', 'false')}"]
    lines[d['i']] = (f"{d['indent']}{k}: {{ name:{q(d['name'])}, en:{q(d['en'])}, img:{q(d['img'])}, link:{q(d['link'])}, reason:{q(d['reason'])}, "
                     f"tags:[{','.join(map(q, d['tags']))}], subCities:[{','.join(map(q, d['sub']))}], {', '.join(parts)}}}" + (',' if d['comma'] else ''))
s = '\n'.join(lines)

# 予算区分・旅行日数の一覧を作り直す（コメントアウト中の korea は元の位置に残す）
def rebuild(name, keys_of):
    global s
    m = re.search(r'const ' + name + r' = \{\n(.*?)\n\};', s, re.S)
    body = m.group(1).split('\n'); new = []
    for ln in body:
        mm = re.match(r"(\s*)(\w+):(\s*)\[(.*)\],?$", ln)
        if not mm: new.append(ln); continue
        key = mm.group(2); old = re.findall(r"'([^']*)'", mm.group(4))
        want = keys_of(key)
        keep = [x for x in old if x in want or x not in dest]       # 既存の並び順を保つ
        keep += [x for x in dest if x in want and x not in keep]     # 追加分は撮影地データの順
        if [x for x in old if x in dest] != [x for x in keep if x in dest]:
            changes.append(f'{name}.{key}: ' + ' '.join(('+' + dest[x]['name']) for x in keep if x in dest and x not in old) + ' ' + ' '.join(('-' + dest[x]['name']) for x in old if x in dest and x not in keep))
        new.append(f"{mm.group(1)}{key}:{mm.group(3)}[{','.join(map(q, keep))}],")
    s = s[:m.start(1)] + '\n'.join(new) + s[m.end(1):]

rebuild('BUDGET_KEYS', lambda b: [k for k, d in dest.items() if int(b) in d['bands']])
rebuild('DAYS_KEYS', lambda dk: [k for k, d in dest.items() if dk in d['days']])

# 判定を撮影地データに一本化する
a = s.index('// 景色・演出に対応しているエリア一覧（DEST の属性を補う）。')
b = s.index('function hasFeature(key,x){')
e = s.index('}\n', s.index("return !!(l&&l.indexOf(key)!==-1);", b)) + 2
s = s[:a] + ("// 景色・演出への対応は撮影地データ（DEST）の属性に一本化（商品担当者の確認済みチェック表から反映）。\n"
             "// 候補選定 score()・予算の選択可否・質問の選択肢・一致率 calcMatching() のすべてがこの判定を使う。\n"
             "function hasFeature(key,x){\n    var d=DEST[key];\n    return !!(d&&d[x]);\n}\n") + s[e:]

open(target, 'w', encoding='utf-8', newline='').write(s.replace('\n', nl))
for c in changes: print(c)
print('反映件数', len(changes))
