import sys, os, re, json, html, collections
import openpyxl
sys.path.insert(0, os.path.dirname(__file__))
from convert_legacy import dec, fmt_value, html_to_plain, match_rule, is_section_title
src, out = sys.argv[1], sys.argv[2]
res = json.load(open(out, encoding='utf-8'))
def norm(s): return re.sub(r'[\s　]', '', html.unescape(s))
by_name = {r['report']['file']: r for r in res}
tot_missing=0; worst=[]
cats=collections.Counter()
for f in sorted(os.listdir(src)):
    name = dec(f)[:-5]
    r = by_name[name]; p = r['payload']
    blob = ''
    for k,v in p.items():
        if not v: continue
        if k == 'sch' and v:
            for b in json.loads(v):
                blob += norm(b.get('title',''))
                for it in b['items']: blob += norm(it['t']+it['x']) + '|' + norm(it['t']+' '+it['x'])
        if k in ('qa','sch','m_pln','m_dst','m_opt','url'):
            blob += norm(json.dumps(json.loads(v), ensure_ascii=False) if v.startswith(('[','{')) else v)
            try:
                blob += norm(' '.join(str(x) for x in re.findall(r'"[^"]*"', v)))
                blob += norm(json.loads(v).__str__())
            except Exception: pass
        else:
            blob += norm(html_to_plain(v)) + norm(v)
    ws = openpyxl.load_workbook(os.path.join(src,f), data_only=True).worksheets[0]
    missing=[]; total=0
    for row in ws.iter_rows():
        for c in row:
            t = fmt_value(c.value).strip()
            if not t or t=='社外秘': continue
            if t in ('都市','日付','流し先','作成方法','必要な明細','明細（例）','明細(例)','AGT','コード'): continue
            total+=1
            # 改行ごとに確認
            for line in t.split('\n'):
                n = norm(html.escape(line, quote=False))
                n2 = norm(line)
                if len(n2)<2: continue
                if len(line.strip())<=25 and (match_rule(line) or is_section_title(line)):
                    continue  # 見出しとして新ポータルの項目名に置き換わった行
                # 「見出し：本文」形式は見出しと本文に分割して確認
                segs=[norm(x) for x in re.split(r'[：:]', line, maxsplit=1)]
                if len(segs)==2 and all((not x) or x in blob or norm(html.escape(x,quote=False)) in blob for x in segs[1:]) and (segs[0] in blob or match_rule(segs[0])):
                    continue
                if n2 not in blob and n not in blob:
                    # safe_attr_text変換分
                    n3 = n2.replace('"','”').replace('<','＜').replace('>','＞')
                    if n3 not in blob:
                        missing.append((c.coordinate,line[:60]))
    cats[r['report']['cat']]+=1
    tot_missing+=len(missing)
    if missing: worst.append((len(missing), name, missing[:5]))
print(cats)
print('total missing lines', tot_missing, 'files with missing', len(worst))
for w in sorted(worst, reverse=True)[:15]: print(w)
