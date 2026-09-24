#!/usr/bin/env python3
"""Build the hand-off zip for 世界のプロポーズプラン (Shopify files + setup guide + data + photos).

    python3 shopify-theme/tools/package_propose.py [output_dir]

Writes <output_dir>/世界のプロポーズプラン_Shopify一式.zip (default: shopify-theme/dist, git-ignored).
Only propose files are included, so the zip can be added to any existing theme.
The guide is also rendered to HTML (needs `pip install markdown`).
"""
import glob
import os
import re
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
THEME = os.path.join(ROOT, "shopify-theme")
TOP = "世界のプロポーズプラン_Shopify一式"

THEME_FILES = (
    ["layout/propose.liquid"]
    + sorted(os.path.relpath(p, THEME) for p in glob.glob(os.path.join(THEME, "snippets/propose-*.liquid")))
    + sorted(os.path.relpath(p, THEME) for p in glob.glob(os.path.join(THEME, "sections/propose-*.liquid")))
    + ["assets/propose.css", "assets/propose.js", "assets/propose-booking.js",
       "templates/page.propose.json", "templates/page.propose-booking.json", "templates/metaobject/propose.json"]
)

GUIDE_CSS = """
body{margin:0;background:#faf9f6;color:#161512;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Meiryo",sans-serif;line-height:1.9;font-size:15px}
main{max-width:920px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:1.6rem;font-weight:600;line-height:1.5;border-bottom:1px solid #161512;padding-bottom:16px}
h2{font-size:1.25rem;margin-top:56px;padding-top:16px;border-top:1px solid #e3ded2}
h3{font-size:1.05rem;margin-top:32px}
table{border-collapse:collapse;width:100%;margin:12px 0;background:#fff;font-size:.9rem;display:block;overflow-x:auto}
th,td{border:1px solid #e3ded2;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#f2efe8;white-space:nowrap}
code{background:#f2efe8;padding:1px 5px;border-radius:3px;font-size:.88em}
pre{background:#fff;border:1px solid #e3ded2;padding:14px;overflow-x:auto;line-height:1.6}
pre code{background:none;padding:0}
blockquote{margin:16px 0;padding:10px 16px;border-left:3px solid #a3803f;background:#f2efe8}
a{color:#7a5d27}
hr{border:0;border-top:1px solid #e3ded2;margin:40px 0}
"""


def guide_html(md_text):
    import markdown
    md_text = md_text.replace("- [ ] ", "- ☐ ")
    body = markdown.markdown(md_text, extensions=["tables", "fenced_code"])
    return ('<!doctype html><html lang="ja"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            "<title>世界のプロポーズプラン Shopify 設定マニュアル</title><style>" + GUIDE_CSS +
            "</style></head><body><main>" + body + "</main></body></html>")


def main():
    out_dir = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(THEME, "dist")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, TOP + ".zip")
    guide = open(os.path.join(THEME, "PROPOSE-SETUP.md"), encoding="utf-8").read()

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(TOP + "/00_はじめにお読みください.html", guide_html(guide))
        z.writestr(TOP + "/設定マニュアル.md", guide)
        for rel in THEME_FILES:
            z.write(os.path.join(THEME, rel), TOP + "/theme/" + rel)
        for name in ("products.csv", "locations-data.csv"):
            z.write(os.path.join(THEME, "propose-import", name), TOP + "/import/" + name)
        for p in sorted(glob.glob(os.path.join(ROOT, "propose-lp/images/*.jpg"))):
            z.write(p, TOP + "/photos/propose-" + os.path.basename(p))
        z.write(os.path.join(ROOT, "propose-lp/all-in-one.html"),
                TOP + "/mockup/世界のプロポーズプラン-モックアップ_PC用.html")

    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        assert z.testzip() is None
    theme_count = sum(1 for n in names if "/theme/" in n)
    print("wrote %s (%d KB): %d files, %d theme files" % (out, os.path.getsize(out) // 1024, len(names), theme_count))


if __name__ == "__main__":
    main()
