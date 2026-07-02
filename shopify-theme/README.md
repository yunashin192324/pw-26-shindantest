# HIS World Wedding — Shopify テーマ

`wedding-ec/`（静的HTML版）と同じデザイン・コピーを、Shopify Online
Store 2.0 のテーマ（Liquid）として再構築したものです。`theme check`
（`npx @shopify/cli theme check`）でエラー0件を確認済みです。

## 設計方針

- `templates/collection.liquid` と `templates/product.liquid` は
  **1ファイルで全ての撮影地・プランに対応する汎用テンプレート**です。
  新しい撮影地／プランを追加するときはテーマのコードを変更する必要はなく、
  Shopify管理画面でCollection／Productを追加するだけで反映されます
  （設計書の「Collection追加 / Product追加のみ」という要件に対応）。
- 商品写真は **Shopifyのネイティブな商品画像**（複数枚アップロード可）
  をそのまま「撮影イメージ」ギャラリーとして使用します。1枚目が
  ヒーロー画像になります。追加のメタフィールド設定は不要です。
- 価格・在庫状況・FAQ・比較情報などはメタフィールド／メタオブジェクトと
  商品説明（description）で管理します。詳細は下記「初期セットアップ」
  を参照してください。
- 診断クイズ（`page.diagnosis.liquid`）は実際のShopify商品データ
  （価格・URL・availability）を読み込むため、価格が実店舗の値と
  ズレることがありません。

## ディレクトリ構成

```
layout/theme.liquid          共通レイアウト（header/footer/CSS/JS読み込み）
templates/index.json         TOPページ（セクション構成）
templates/collection.liquid  撮影地ページ（汎用・全Collection共通）
templates/product.liquid     商品ページ（汎用・全Product共通）
templates/page.about.liquid  会社情報ページ
templates/page.dress.liquid  ドレスページ
templates/page.faq.liquid    FAQページ
templates/page.diagnosis.liquid  30秒診断ページ
sections/                    TOPページの各セクション（テーマエディタで編集可）
snippets/                    header / footer / パンくず / FAQアコーディオン / 商品カード
assets/                      style.css, main.js, diagnosis.js, プレースホルダーSVG
config/settings_schema.json  ブランドカラー設定（テーマエディタから変更可）
content/                     Admin にコピペする初期コンテンツ（下記参照）
```

## 初期セットアップ

### 1. Metaobject定義を作成（Settings > Custom data > Metaobjects）

| Name | フィールド |
|---|---|
| `faq_item` | `question`（単一行テキスト）, `answer`（複数行テキスト）, `category`（単一行テキスト・任意。サイト全体FAQページの見出しグルーピングに使用） |
| `feature_item` | `title`（単一行テキスト）, `description`（複数行テキスト） |
| `season_card` | `title`（単一行テキスト）, `description`（複数行テキスト）, `image`（ファイル） |

### 2. Metafield定義を作成（Settings > Custom data）

**Collections**
- `custom.lede`（単一行テキスト）
- `custom.features`（metaobject一覧参照 → feature_item）
- `custom.seasons`（metaobject一覧参照 → season_card）
- `custom.gallery`（ファイル一覧）
- `custom.faqs`（metaobject一覧参照 → faq_item）

**Products**
- `custom.availability`（単一行テキスト。値は `instant` または `confirm`）
- `custom.availability_label`（単一行テキスト。例: 「即予約できます」）
- `custom.region`（単一行テキスト。例: 「Hawaii — Basic」）
- `custom.short_description`（単一行テキスト）
- `custom.diagnosis_reason`（単一行テキスト。診断結果の一言コメント）
- `custom.faqs`（metaobject一覧参照 → faq_item）

**Pages**
- `custom.faqs`（metaobject一覧参照 → faq_item。FAQページ専用）

### 3. Pageを作成（Online Store > Pages）

| Title | Handle | 割り当てるテーマテンプレート |
|---|---|---|
| 会社情報 | `about` | `page.about` |
| ドレス | `dress` | `page.dress` |
| FAQ | `faq` | `page.faq` |
| 診断 | `diagnosis` | `page.diagnosis` |

各Pageの「コンテンツ」欄は「HTMLで表示」に切り替え、
`content/page-about.html` / `content/page-dress.html` の内容を
そのまま貼り付けてください（`REPLACE_WITH_IMAGE_URL` はAdmin >
コンテンツ > ファイル にアップロードした実写真のURLに差し替え）。
FAQページのFAQ本体は`custom.faqs`メタフィールドに
`content/page-faq.md`の内容を登録してください。

### 4. Collectionを作成（3方面）

`hawaii` / `danang` / `london` の3つを作成し、
`content/collections.md` の内容をそれぞれ登録してください。

### 5. Productを作成（6プラン）

各Collectionに2商品ずつ、計6商品を作成し、
`content/products.md` の内容をそれぞれ登録してください
（価格はバリアント価格として設定）。

### 6. ナビゲーション

`snippets/header.liquid` / `snippets/footer.liquid` は
上記の Page handle / Collection handle を直接参照しています。
手順3〜4のhandleを変更した場合はスニペット側も合わせて修正してください。

## 既知の制限

- 商品写真・撮影地の背景写真は全てプレースホルダーSVGです。実写真に
  差し替えてください（商品は「商品画像」をアップロードするだけ、
  コレクション/ページは `content/*.md` 内の `REPLACE_WITH_IMAGE_URL`
  やファイル参照メタフィールドを差し替えてください）。
- `robots.txt` / `sitemap.xml` はShopifyが自動生成するため、この
  テーマには含めていません（`wedding-ec/` の静的版のみに存在します）。
- 実際のShopyストアでの動作確認（`shopify theme dev` によるプレビュー等）
  はこの環境では行えていません。`npx @shopify/cli theme check` による
  Liquid構文チェックのみ実施済み（エラー0件）。導入時は開発ストアで
  一度プレビューして表示・アコーディオン・診断クイズの動作を確認して
  ください。
