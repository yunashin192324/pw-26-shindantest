# HIS WEDDING 初夢フェア「FIND YOUR WEDDING」モックアップ

写真を選んで進む診断 → ふたりの好みの可視化（Favorites）→ 初夢SALE商品TOP3 → 商品詳細 → 相談CTA。

## 確認方法
ES Modules を使うため HTTP 配信が必要（file:// 不可）。
`python3 -m http.server 8000` をリポジトリ直下で実行し `/hatsuyume-fair/` を開く（スマホ幅 375〜430px 推奨）。

## 差し替えが必要なもの（TODO）
- **写真**: 各選択肢の `image`（`src/data/questions.js`）と商品の `image`（`src/data/products.js`）に `images/…` を置く。無い間はグラデーションの仮枠を表示。
- **商品情報**: `src/data/products.js` の title / catchcopy / price / discount / limited / venue / description / sourceUrl は未確認のため `TODO`。現行SALEページから転記すること。1カテゴリー複数商品は配列に追加するだけでよい。
- **リンク**: `src/data/copy.js` の来店・オンライン相談URLは公式トップの仮設定。

## ロジック（src/utils/scoring.js）
- Q1〜Q4: 選択タグに +3（短めの旅行のみ +2）。Q5: 選択エリアの商品に +4。Q6: 「写真重視」でフォト商品に +4。
- family_trip は商品側の family と同一視。価格は使わない。予算質問は `budgetQuestion`（無効）として用意。
- DISCOVERY = 上位2件を除き、選んだエリア以外で最高スコアの商品。
