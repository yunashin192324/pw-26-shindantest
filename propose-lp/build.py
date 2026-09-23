#!/usr/bin/env python3
"""Build propose-lp/all-in-one.html — one self-contained, offline HTML file.

    python3 propose-lp/build.py          # photos inlined as base64 (default)
    python3 propose-lp/build.py --dev    # photos referenced from images/ (smaller, for iterating)

Sources live in propose-lp/src/. Photos live in propose-lp/images/<location-id>.jpg;
any location without a file there falls back to the illustrated placeholder.
Placeholders are replaced with plain str.replace on unique tokens — never a
regex over JS/CSS, which can match inside string literals and corrupt them.
"""
import base64
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
IMAGES = ROOT / "images"


def read(name):
    return (SRC / name).read_text(encoding="utf-8")


def photos_js(inline):
    photos = {}
    for p in sorted(IMAGES.glob("*.jpg")):
        if inline:
            photos[p.stem] = "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode("ascii")
        else:
            photos[p.stem] = "images/" + p.name
    return "window.PROPOSE_PHOTOS = " + json.dumps(photos) + ";"


def main():
    dev = "--dev" in sys.argv
    parts = {
        "/*__CSS__*/": read("styles.css"),
        "/*__PHOTOS__*/": photos_js(inline=not dev),
        "/*__DATA__*/": read("data.js"),
        "/*__APP__*/": read("app.js"),
    }
    html = read("template.html")
    for token, body in parts.items():
        if html.count(token) != 1:
            sys.exit(f"template must contain {token} exactly once")
        if token != "/*__CSS__*/" and "</script" in body.lower():
            sys.exit(f"{token} contains '</script' and would break the inline <script>")
        html = html.replace(token, body)

    out = ROOT / ("dev.html" if dev else "all-in-one.html")
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT.parent)} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
