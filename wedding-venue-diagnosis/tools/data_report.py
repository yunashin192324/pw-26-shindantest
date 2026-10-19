#!/usr/bin/env python3
"""js/data/venues.js から、式場×カテゴリの一覧表（docs/DATA_REPORT.md）を作る。"""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
t = (ROOT / "js/data/venues.js").read_text(encoding="utf-8")
d = json.loads(t.split("/*__DATA_BEGIN__*/", 1)[1].split("/*__DATA_END__*/", 1)[0])
cats, vs = d["categories"], d["venues"]
L = ["# 診断データ一覧（%s から自動生成）" % d["source"]["file"], "",
     "- 式場数: %d件 / カテゴリ数: %d件 / 付与されたカテゴリの総数: %d" % (len(vs), len(cats), sum(len(v["categories"]) for v in vs)), "",
     "## カテゴリごとの該当式場", "", "| カテゴリ | 件数 | 該当する式場（Excelの行番号） |", "|---|---:|---|"]
for c in cats:
    hit = [v for v in vs if c in v["categories"]]
    L.append("| %s | %d | %s |" % (c, len(hit), "、".join("%s(%d)" % (v["name"], v["row"]) for v in hit)))
L += ["", "## 式場ごとのカテゴリ", "", "| 行 | 式場名 | 件数 | カテゴリ |", "|---:|---|---:|---|"]
for v in vs:
    L.append("| %d | %s | %d | %s |" % (v["row"], v["name"], len(v["categories"]), "、".join(v["categories"])))
(ROOT / "docs/DATA_REPORT.md").write_text("\n".join(L) + "\n", encoding="utf-8")
print("docs/DATA_REPORT.md を書き出しました")
