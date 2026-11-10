#!/usr/bin/env python3
"""式場の追加情報（地域・URL・写真など）を入力する Excel（source/式場追加情報.xlsx）を作る。

使い方:
    python3 tools/make_extras_template.py          # ファイルが無いときだけ作成
    python3 tools/make_extras_template.py --sync   # 入力済みの内容を残したまま、式場名の行を診断データに合わせる

入力した内容は tools/build_extras.py で js/data/venue-extras.js に取り込みます。
"""
import json
import sys
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "source" / "式場追加情報.xlsx"

VENUE_COLS = [
    ("式場名（変更しないでください）", 44),
    ("エリア", 16),
    ("詳細ページURL", 40),
    ("住所", 36),
    ("料金の目安", 20),
    ("紹介文", 50),
    ("式場写真（ファイル名またはURL）", 36),
    ("写真の説明", 28),
    ("同点時の表示順（数字・小さいほど上）", 22),
]
SCENES = ["開始画面"] + ["質問%d" % i for i in range(1, 8)] + ["読み込み中", "結果画面"]
HEAD_FILL = PatternFill("solid", fgColor="1D3A3A")
LOCK_FILL = PatternFill("solid", fgColor="EEEEEE")
HEAD_FONT = Font(bold=True, color="FFFFFF")


def venue_names():
    t = (ROOT / "js/data/venues.js").read_text(encoding="utf-8")
    d = json.loads(t.split("/*__DATA_BEGIN__*/", 1)[1].split("/*__DATA_END__*/", 1)[0])
    return [v["name"] for v in d["venues"]]


def header(ws, cols):
    for i, (name, width) in enumerate(cols, 1):
        c = ws.cell(1, i, name)
        c.fill, c.font = HEAD_FILL, HEAD_FONT
        c.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = width
    ws.row_dimensions[1].height = 36
    ws.freeze_panes = "B2"


def build(existing=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "式場情報"
    header(ws, VENUE_COLS)
    dv = DataValidation(type="whole", operator="greaterThanOrEqual", formula1="1", allow_blank=True,
                        error="1以上の整数を入力してください", showErrorMessage=True)
    ws.add_data_validation(dv)
    for r, name in enumerate(venue_names(), 2):
        c = ws.cell(r, 1, name)
        c.fill = LOCK_FILL
        for col in range(2, len(VENUE_COLS) + 1):
            ws.cell(r, col).alignment = Alignment(wrap_text=True, vertical="top")
            if existing and name in existing["venues"]:
                ws.cell(r, col, existing["venues"][name][col - 2])
        dv.add("I%d" % r)

    ws2 = wb.create_sheet("背景写真")
    header(ws2, [("画面（変更しないでください）", 24), ("写真（ファイル名またはURL）", 50)])
    for r, s in enumerate(SCENES, 2):
        ws2.cell(r, 1, s).fill = LOCK_FILL
        if existing and s in existing["scenes"]:
            ws2.cell(r, 2, existing["scenes"][s])

    ws3 = wb.create_sheet("記入方法")
    ws3.column_dimensions["A"].width = 110
    for r, line in enumerate([
        "記入方法",
        "・「式場情報」シート：灰色の式場名は変更しないでください（診断データの式場名と照合します）。",
        "・空欄の項目は画面に表示されません。分からない項目は空欄のままにしてください。",
        "・写真は、Webで公開されている画像のURL（https://〜）か、公開フォルダ内のファイル名（例：images/plumeria.jpg）を入力します。",
        "・「同点時の表示順」は、希望条件の一致具合が同じ式場どうしを並べる順番です（例：人気順）。小さい数字ほど上に表示します。",
        "　空欄の式場は、数字が入っている式場の後に、診断データの掲載順で並びます。一致具合が違う式場の順位は変わりません。",
        "・「背景写真」シート：各画面の背景に使う写真です。空欄の画面は写真なし（グラデーション）になります。",
        "・入力後、tools/build_extras.py を実行すると診断に反映されます。",
        "・この内容は表示用です。「同点時の表示順」以外は、診断の順位計算には使いません。",
    ], 1):
        ws3.cell(r, 1, line).font = Font(bold=(r == 1), size=12 if r == 1 else 11)
    wb.save(OUT)


def read_existing():
    wb = openpyxl.load_workbook(OUT)
    ws, ws2 = wb["式場情報"], wb["背景写真"]
    venues = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0]:
            venues[row[0]] = list(row[1:len(VENUE_COLS)])
    scenes = {row[0]: row[1] for row in ws2.iter_rows(min_row=2, values_only=True) if row[0]}
    return {"venues": venues, "scenes": scenes}


if __name__ == "__main__":
    if "--sync" in sys.argv and OUT.exists():
        build(read_existing())
        print("式場名の行を更新しました（入力済みの内容は保持）: %s" % OUT)
    elif OUT.exists():
        print("既に存在するため作成しませんでした: %s" % OUT)
    else:
        build()
        print("作成しました: %s" % OUT)
