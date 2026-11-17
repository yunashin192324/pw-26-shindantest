#!/usr/bin/env python3
"""source/式場追加情報.xlsx の入力内容を js/data/venue-extras.js に書き出す。

使い方:
    python3 tools/build_extras.py [Excelのパス（省略時は source/式場追加情報.xlsx）]
問題（存在しない式場名、URLの形式、表示順が数字でない など）があれば、書き出さずにエラーを表示する。
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "source" / "式場追加情報.xlsx"
OUT = ROOT / "js" / "data" / "venue-extras.js"
KEYS = ["area", "url", "address", "price", "description", "image", "imageAlt", "order",
        "style", "color", "location", "waikiki", "gardenParty", "photoSpot"]
SCENES = ["開始画面", "質問画面", "読み込み中", "結果画面"]
STYLES = {"チャペル", "教会", "ガーデン"}
COLORS = {"白系", "茶系"}
WAIKIKI = {"ホテル内", "30分圏内", "60分程度"}
SPLIT = re.compile(r"[・、,，/／\s]+")
SAFE = re.compile(r"^(https?://[^\s]+|[\w./-]+\.(jpe?g|png|webp|gif|avif))$", re.I)


def main():
    t = (ROOT / "js/data/venues.js").read_text(encoding="utf-8")
    data = json.loads(t.split("/*__DATA_BEGIN__*/", 1)[1].split("/*__DATA_END__*/", 1)[0])
    names = {v["name"] for v in data["venues"]}
    excel_cats = {v["name"]: v["categories"] for v in data["venues"]}
    wb = openpyxl.load_workbook(SRC, data_only=True)
    errors, extras, seen = [], {}, set()

    for row in wb["式場情報"].iter_rows(min_row=2):
        name = row[0].value
        if name is None:
            continue
        cell = "A%d" % row[0].row
        if name not in names:
            errors.append("%s「%s」は診断データにない式場名です" % (cell, name))
            continue
        seen.add(name)
        item = {}
        for key, c in zip(KEYS, row[1:1 + len(KEYS)]):
            v = c.value
            if v is None or (isinstance(v, str) and not v.strip()):
                continue
            if key == "order":
                if not isinstance(v, (int, float)) or v < 1 or int(v) != v:
                    errors.append("%s: 表示順は1以上の整数で入力してください (%r)" % (c.coordinate, v))
                    continue
                item[key] = int(v)
            elif key in ("style", "color"):
                allowed = STYLES if key == "style" else COLORS
                vals = [x for x in SPLIT.split(str(v).strip()) if x]
                bad = [x for x in vals if x not in allowed]
                if bad:
                    errors.append("%s: 「%s」は使えません（使える値：%s）" % (c.coordinate, "・".join(bad), "・".join(sorted(allowed))))
                    continue
                item[key] = vals
            elif key == "waikiki":
                v = str(v).strip()
                if v not in WAIKIKI:
                    errors.append("%s: ワイキキからの移動は %s のどれかで入力してください (%s)" % (c.coordinate, "・".join(sorted(WAIKIKI)), v))
                    continue
                item[key] = v
            elif key == "gardenParty":
                if str(v).strip() not in ("○", "〇", "o", "O"):
                    errors.append("%s: ガーデンでパーティができる場合は ○ を入力してください (%r)" % (c.coordinate, v))
                    continue
                item[key] = True
            else:
                v = str(v).strip()
                if key == "url" and not v.startswith(("https://", "http://")):
                    errors.append("%s: URLは https:// で始めてください (%s)" % (c.coordinate, v))
                    continue
                if key == "image" and not SAFE.match(v):
                    errors.append("%s: 写真はURLまたは画像ファイル名で入力してください (%s)" % (c.coordinate, v))
                    continue
                item[key] = v
        # 診断で使う特徴（式場追加情報から作るもの）
        feats = ["挙式：" + s for s in item.get("style", [])] + ["内観：" + s for s in item.get("color", [])]
        if item.get("location"): feats.append("立地：" + item["location"])
        if item.get("waikiki") in ("ホテル内", "30分圏内"): feats.append("ワイキキから30分圏内")
        if item.get("gardenParty"): feats.append("ガーデンでパーティができる")
        if item.get("photoSpot"): feats.append("撮影：" + item["photoSpot"])
        if "ホテル内" not in excel_cats[name]: feats.append("独立型")
        item["features"] = feats
        extras[name] = item
    missing = names - seen
    if missing:
        errors.append("「式場情報」シートに無い式場があります（make_extras_template.py --sync で追加できます）: " + "、".join(sorted(missing)))

    scenes = {"start": "", "question": "", "loading": "", "result": ""}
    for row in wb["背景写真"].iter_rows(min_row=2):
        label, v = row[0].value, row[1].value
        if label not in SCENES or v is None or not str(v).strip():
            continue
        v = str(v).strip()
        if not SAFE.match(v):
            errors.append("%s: 写真はURLまたは画像ファイル名で入力してください (%s)" % (row[1].coordinate, v))
            continue
        if label == "開始画面": scenes["start"] = v
        elif label == "読み込み中": scenes["loading"] = v
        elif label == "結果画面": scenes["result"] = v
        else: scenes["question"] = v

    if errors:
        print("エラーのため書き出しませんでした:", file=sys.stderr)
        for e in errors:
            print(" - " + e, file=sys.stderr)
        sys.exit(1)

    OUT.write_text(
        "/* 自動生成ファイル: tools/build_extras.py により source/式場追加情報.xlsx から生成。直接編集しないでください。\n"
        "   EXTRAS: 式場ごとの表示用情報（order は同点時の表示順。これ以外は順位計算に使いません）\n"
        "   SCENE_IMAGES: 各画面の背景写真（空欄は写真なし） */\n"
        "(function (root) {\n"
        "  root.VENUE_DIAG = root.VENUE_DIAG || {};\n"
        "  root.VENUE_DIAG.EXTRAS = %s;\n"
        "  root.VENUE_DIAG.SCENE_IMAGES = %s;\n"
        "})(typeof window !== 'undefined' ? window : globalThis);\n"
        % (json.dumps(extras, ensure_ascii=False, indent=2), json.dumps(scenes, ensure_ascii=False, indent=2)),
        encoding="utf-8")
    print("書き出しました: 追加情報のある式場 %d件 / 背景写真 %d件" % (
        len(extras), sum(1 for s in scenes.values() if s)))


if __name__ == "__main__":
    main()
