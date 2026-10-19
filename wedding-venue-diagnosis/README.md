# 結婚式場診断

既存のフォトウェディング診断の操作感・演出を踏襲した、結婚式場の診断コンテンツです。
診断の根拠は `source/診断.xlsx` の式場とカテゴリのみです。設計と検証の詳細は [docs/DESIGN.md](docs/DESIGN.md) を参照してください。

## 見方
- **オフラインのモックアップ**：`dist/wedding-venue-diagnosis-mockup.html` をダブルクリックしてブラウザで開くだけで動きます（1ファイル、外部通信なし）。
- **開発用**：`index.html` をそのまま開いても動きます（サーバー不要）。

## ファイル構成
| ファイル | 役割 |
|---|---|
| `index.html` / `css/style.css` | 画面 |
| `js/data/venues.js` | 式場とカテゴリ（Excel から自動生成。直接編集しない） |
| `js/data/venue-extras.js` | 画像・URL・地域など Excel に無い情報の設定欄（現在は空） |
| `js/data/questions.js` | 質問・選択肢と、Excel カテゴリとの対応 |
| `js/config.js` | 候補の表示件数、背景写真、相談ボタン、シェア文 |
| `js/logic.js` | 判定処理（画面処理なし） |
| `js/app.js` | 画面の切り替えと操作 |
| `tools/` | Excel 取り込み・照合・一覧表・1ファイル版作成 |
| `tests/` | 判定処理のテスト、ブラウザ操作のテスト |
| `docs/` | 設計資料、データ一覧、画面の写し |

## 式場・カテゴリを変更するとき
```sh
python3 tools/build_data.py source/診断.xlsx    # Excel → js/data/venues.js
python3 tools/verify_data.py source/診断.xlsx   # Excel と照合
python3 tools/data_report.py                    # docs/DATA_REPORT.md を更新
node tools/build_mockup.js                      # 1ファイル版を作り直す
```
カテゴリを増やした場合は、`js/data/questions.js` のいずれかの選択肢に対応させてください（どの質問でも使われていないカテゴリは、テストで検出されます）。

## テスト
```sh
node --test tests/logic.test.js                               # 判定処理（約40秒）
FULL=1 node --test tests/logic.test.js                        # 全組み合わせ（約4分）
NODE_PATH=$(npm root -g) node --test tests/e2e.test.js        # ブラウザ操作（Playwright が必要）
```
