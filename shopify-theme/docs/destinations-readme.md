# 撮影地一覧 (Destinations) — 実装メモ

`/pages/destinations`・地域ページ・都市ページの実装。**既存のTOP/JOURNAL
ビルド(`layout/theme.liquid`、`sections/header.liquid` / `footer.liquid`、
`assets/theme.css` / `theme.js`)には一切変更を加えていない。** 完全に
独立したレイアウト・CSS・JS・header/footerを新規に用意している
(理由: JOURNALとは別サイト相当として扱ってほしいという要望のため)。

## ファイル構成

```
layout/theme.destinations.liquid      独立レイアウト(このファミリー専用)
assets/destinations.css               独立デザインシステム(dst-接頭辞)
assets/destinations.js                独立ビヘイビア(検索・reveal・accordion等)

sections/destinations-header.liquid   撮影地専用ヘッダー
sections/destinations-footer.liquid   撮影地専用フッター
sections/destinations-hero.liquid     一覧ページ Hero
sections/destinations-search.liquid   一覧ページ 検索
sections/destinations-popular.liquid  一覧ページ 人気都市
sections/destinations-theme-list.liquid   一覧ページ テーマから選ぶ
sections/destinations-region-list.liquid  一覧ページ 地域から選ぶ
sections/destinations-cta.liquid      一覧/地域/都市 共通CTA

sections/region-hero.liquid           地域ページ Hero(handleから自動判定)
sections/region-intro.liquid          地域ページ 紹介文(任意)
sections/region-city-list.liquid      地域ページ 都市一覧(全件)

sections/destination-hero.liquid      都市ページ Hero + 構造化データ
sections/destination-intro.liquid     都市ページ 紹介文 + GEOブロック
sections/destination-spots.liquid     都市ページ 撮影スポット
sections/destination-plans.liquid     都市ページ おすすめプラン
sections/destination-faq.liquid       都市ページ FAQ + 関連都市

snippets/destination-card.liquid          都市カード(全ページ共通)
snippets/destination-schema.liquid        都市ページの構造化データ
snippets/destination-region-label.liquid  地域キー→表示名(唯一の情報源)
snippets/destination-theme-label.liquid   テーマキー→JP表示名(検索結果用)

templates/page.destinations.json      一覧ページ
templates/page.region.json            地域ページ(8ページで共用)
templates/page.destination.json       都市ページ(120都市以上で共用)
```

## データモデル

すべて `Destination` という1つのMetaobjectだけで駆動する(仕様通り、
コード内に都市データのハードコーディングは一切ない)。フィールド定義
・地域キー・テーマキーの正式な一覧は
[`destinations-metaobject-setup.md`](./destinations-metaobject-setup.md)
を参照。管理画面でMetaobjectエントリーを1件追加するだけで、検索・人気
都市・テーマ一覧・地域一覧・都市ページ・地域ページすべてに自動反映される。

## 実装上の主な判断（ユーザー確認済み）

- **配色**: 仕様書指定のHEX値(#FFFFFF / #FAF8F5 / #B8860B / #D4A843 /
  #222222)をこの機能専用のトークンとして採用。既存TOP/JOURNALの配色
  トークンとは別物(意図的)。
- **おすすめプラン**: `Destination.slug` と同じhandleのコレクションが
  実在すれば(現状 hawaii / danang / london)実商品を表示。一致しない
  都市(大半)は、実プラン公開までのプレースホルダー表示。
- **検索**: 120〜300都市を想定し、`destinations-search.liquid` が
  軽量なJSON(サムネイルURL+テキストのみ)を書き出し、
  `destinations.js` がクライアント側でインクリメンタルフィルタする。
  検索前は結果カードを1件も描画しない(初期表示の画像読み込みゼロ)。
- **診断ボタン**: 診断ページが未確定のため、各CTA/ヒーローの
  ボタンURL設定は初期値を空にしている。空の間はボタンごと非表示になる
  ので、壊れたリンクにはならない。後日URLが決まり次第テーマエディタ
  で設定するだけでよい。

## 見た目確認

`../destinations-preview.html`(リポジトリ直下)がダミーデータ入りの
静的プレビュー。本番の`destinations.css` / `destinations.js`をそのまま
読み込んでいるため、検索・テーマ絞り込み・reveal挙動も含めて実際の
コードで確認できる。中身の都市名・説明文はすべてダミー。
