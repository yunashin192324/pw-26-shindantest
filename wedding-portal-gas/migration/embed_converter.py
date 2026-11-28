"""migration/legacy_converter.js を Index.html の LEGACY_CONVERTER 枠へコピーする"""
import os, re
here = os.path.dirname(os.path.abspath(__file__))
idx = os.path.join(here, '..', 'Index.html')
js = open(os.path.join(here, 'legacy_converter.js'), encoding='utf-8').read()
s = open(idx, encoding='utf-8').read()
start = '<!-- LEGACY_CONVERTER_START (migration/legacy_converter.js から自動コピー。直接編集しない) -->\n'
end = '<!-- LEGACY_CONVERTER_END -->'
i, j = s.index(start) + len(start), s.index(end)
s = s[:i] + '<script>\n' + js.replace('</script', '<\\/script') + '</script>\n' + s[j:]
open(idx, 'w', encoding='utf-8').write(s)
print('embedded', len(js), 'chars')
