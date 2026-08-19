# 世界のプロポーズプラン — Shopifyテーマ実装ガイド

`/propose-lp/` の動作モックアップを、Shopifyの無料テーマ機能（Sections / Blocks / Metaobjects /
Cart AJAX API）だけで実装した本番相当のコードです。有料アプリ・有料テーマは使用していません。
既存の HIS World Wedding テーマ（journal / article 系）のファイルには一切手を加えていません。

- 動くモックアップ（オフラインで見られるもの）: `/propose-lp/`
- 設計の理由・データモデル・セットアップ手順: このファイル

---

## 1. サイトマップ

```
/pages/propose-home  … トップ（LP）                     … templates/page.propose-home.json
/pages/propose-<slug> … ロケーション詳細（×10、可変）      … templates/page.propose-location.json
/pages/propose-booking … 予約フロー（SPA・ヘッダー/フッターなし） … templates/page.propose-booking.json
```

ロケーションは「1メタオブジェクト（データ）＋1ページ（ルーティング）」の組で増減します。
コード変更・新規テンプレート作成は不要です（詳細は §3）。

## 2. ユーザーフロー

```
広告/SNS
  └→ propose-home（LP）
       └→ 目的地グリッドをタップ
            └→ propose-<location>（詳細）
                 └→ 「このプランで予約する」 (?loc=&plan=&variant= 付き)
                      └→ propose-booking（SPA）
                           LOCATION → PLAN → DATE → TIME → OPTIONS → CUSTOMER → PAYMENT
                                                                              └→ /cart/add.js
                                                                                   └→ Shopify Checkout（決済）
                                                                                        └→ 注文完了（Shopifyの標準Thank youページ）
```

「お問い合わせ」「ご相談」を主要動線にしない、という要件どおり、LPから予約完了までページ遷移は
最大3回（LP → 詳細 → 予約SPA → チェックアウト）。予約SPA内はページ遷移なし（JSでステップ切替）。

## 3. Shopifyデータモデル

### 3.1 Metaobject: `propose_location`

Settings → Custom data → Metaobjects で定義を作成します（無料機能）。

| フィールド名 | キー | 型 | 用途 |
|---|---|---|---|
| 英語名 | `title` | 単一行テキスト | "HAWAII" |
| 日本語名 | `name_ja` | 単一行テキスト | "ハワイ" |
| 一言コピー | `tagline` | 単一行テキスト | カードの一言 |
| 紹介文 | `lede` | 複数行テキスト | 「この場所でプロポーズする理由」 |
| メイン写真 | `hero_image` | ファイル（画像） | 未設定時は `hue_start`/`hue_end` のグラデーションで代替表示 |
| ギャラリー | `gallery` | ファイルのリスト（画像） | 詳細ページのギャラリー |
| プレースホルダー色1/2 | `hue_start` / `hue_end` | 色 | 写真未登録時のフォールバック |
| 集合場所 | `meeting_point` | 単一行テキスト | |
| 所要時間 | `duration` | 単一行テキスト | |
| 人気表示 | `popular` | 真偽値 | POPULARバッジ |
| おすすめ時間 | `best_time` | 単一行テキスト | 例 "17:30"。BEST TIME表示に使用 |
| 時間帯候補 | `time_slots` | 単一行テキストのリスト | 例 ["15:00","16:00","17:00","17:30","18:00"] |
| 予約不可日 | `blocked_dates` | 日付のリスト | カレンダーで「×満席/休」表示 |
| 残りわずかな日 | `few_left_dates` | 日付のリスト | カレンダーで「△残りわずか」表示 |
| プラン商品 | `plan_product` | 商品参照 | §3.2 参照。BASIC/FLOWER/PREMIUMの3バリアントを持つ商品 |
| 紐づくページ | `page` | ページ参照 | カードのリンク先（`/pages/propose-<slug>`） |

**空き状況について**：この実装は実在の在庫・予約枠を捏造しません。`blocked_dates` /
`few_left_dates` は運営が管理画面から入力する実データです（本当に埋まっている日だけを入れる）。
将来、予約管理システムと連携する場合はこの2フィールドをAPI経由で自動更新する形に差し替え可能です。

### 3.2 商品・バリアント（プラン）

ロケーションごとに1商品、3バリアント（Basic / Flower / Premium）を作成します。

```
商品名: 「HAWAII プロポーズプラン」  ハンドル: hawaii-propose
  バリアント: Basic   ¥128,000
  バリアント: Flower  ¥143,000
  バリアント: Premium ¥173,000
```

- バリアントのタイトルは **Basic / Flower / Premium**（大文字小文字は問わない）固定です。
  `assets/propose-booking.js` はこのタイトルを handleize（小文字化・記号除去）した文字列を
  プランIDとして扱い、オプションの自動包含判定（FLOWER以上は花束を含む、等）にも使います。
- 各バリアントに商品メタフィールド `propose.includes`（単一行テキスト、`|` 区切り）を設定すると、
  ロケーション詳細ページのプランカードに内容リストとして表示されます。
  例: `プロカメラマンによる撮影（約30分）|写真データ30カット〜|現地日本語サポート`
- 実際の価格・在庫・税・通貨換算はすべて Shopify 標準機能に委ねられます（独自の価格計算をしない）。

### 3.3 オプション商品（花束・送迎・追加撮影・サンセット）

それぞれ1バリアントのシンプルな商品として作成し、`sections/propose-booking.liquid` の
セクションブロック「オプション商品」から紐付けます（商品ピッカー＋説明文＋「FLOWERに含む」
「PREMIUMに含む」チェックボックス）。全ロケーション共通です。ロケーションごとに価格を変えたい
場合は、ロケーションごとに専用のオプション商品を用意し、`propose_location` 側にオプション参照
フィールドを追加する形に拡張できます（現状は10ロケーションで共通の4オプション運用を想定）。

### 3.4 ページ

| ページ | テンプレート | 必須メタフィールド |
|---|---|---|
| `propose-home` | `page.propose-home` | なし |
| `propose-<slug>`（×10〜） | `page.propose-location` | `propose.location` = 対応する `propose_location` メタオブジェクト |
| `propose-booking` | `page.propose-booking`（独自レイアウト `layout/propose.liquid` を使用） | なし |

ページのメタフィールド `propose.location`（型: メタオブジェクト参照 → `propose_location`）を
Settings → Custom data → Pages で1つ定義しておけば、あとは10ページぶん「ページを作成して
メタフィールドで紐付ける」だけで詳細ページが揃います。コードの複製は発生しません。

### 3.5 カート連携（オンライン予約の実体）

「予約を確定する」ボタンを押すと、`assets/propose-booking.js` が Cart AJAX API を叩きます。

1. `POST /cart/add.js` — プランのバリアント（数量1）＋選択された追加オプションのバリアント
   （数量1ずつ）を、以下の line item properties を付けて追加します。

   | プロパティキー | 内容 |
   |---|---|
   | `LOCATION` | 例 "HAWAII（ハワイ）" |
   | `PLAN` | 例 "FLOWER" |
   | `DATE` | `YYYY-MM-DD` |
   | `TIME` | 例 "17:30" |
   | `Meeting Point` | 集合場所 |
   | `Reservation Group` | 同一予約の行を束ねるための生成ID（例 `PRP-LX9F2A`） |

2. `POST /cart/update.js` — カート全体の `note`（サプライズ配慮の指示や要望メモ）と
   `attributes.pp_reservation_group` を設定します。
3. `routes.cart_url`（`/cart`）へ遷移 → 通常のShopifyカート/チェックボタンから決済へ。
   決済・注文確認メール・配送設定・税・通貨表示はすべて Shopify 標準機能がそのまま使えます。

こうすることで、「価格・税・通貨計算は本物のShopify Product/Variantに任せつつ、予約特有の
付随情報（場所・日時・オプション）だけをline item propertiesで運ぶ」という、無料機能だけで
成立する構成になっています。

## 4. コンポーネント構成

```
sections/
  propose-hero.liquid              LPファーストビュー（画像・コピー・CTAを編集可）
  propose-destination-grid.liquid  目的地一覧（propose_locationメタオブジェクトを自動列挙）
  propose-what-is.liquid           3ステップ説明 ＋ プラン概要（ブロックで編集可）
  propose-moment.liquid            大写真セクション
  propose-flow.liquid              当日の流れ・6ステップ（ブロックで編集可、LP用）
  propose-invite.liquid            誘い方のヒント（ブロックで編集可）
  propose-trust.liquid             信頼性セクション（捏造実績なし・テキストのみ）
  propose-faq.liquid               FAQ（ブロックで編集可）＋ FAQPage構造化データ
  propose-location-detail.liquid   ロケーション詳細ページ本体（メタオブジェクト駆動、1テンプレートで全ロケーション）
  propose-booking.liquid           予約フロー本体（メタオブジェクト＋商品バリアントをJSに渡す）

snippets/
  propose-location-card.liquid     目的地カード1枚
  propose-flow-steps.liquid        6ステップの当日の流れ（ロケーション詳細ページ用の共通版）
  propose-faq-list.liquid          FAQ（ロケーション詳細ページ用の共通版）
  propose-schema.liquid            Product / BreadcrumbList 構造化データ

assets/
  propose.css                      デザインシステム一式。`.pp-root` 配下にスコープし、
                                    既存テーマ（`.btn` `.eyebrow` `.container` 等）と衝突しないよう
                                    すべてのクラス名に `pp-` を付与、CSSカスタムプロパティも
                                    `--pp-*` に統一しています。
  propose.js                       スクロールリビール演出のみ（ヘッダー挙動・FAQ開閉は各所で個別処理）
  propose-booking.js               予約フローのステートマシン＋Cart AJAX連携

templates/
  page.propose-home.json
  page.propose-location.json
  page.propose-booking.json        独自レイアウト `layout/propose.liquid` を指定（ヘッダー/フッターなし）

layout/
  propose.liquid                   予約フロー専用の最小レイアウト（サプライズを意識し、
                                    サイト全体のナビゲーションを出さない“予約に集中できる画面”）
```

既存の `layout/theme.liquid` / `sections/header.liquid` / `sections/footer.liquid` は無変更です。
`propose-home` / `propose-location` は通常どおり `layout/theme.liquid` を使うため、既存のヘッダー・
フッター（ナビゲーションの `main_menu` にDESTINATIONS/PLANS/HOW IT WORKS/FAQ、`cta_label` に
「予約する」、`cta_url` に `/pages/propose-booking` を設定）がそのまま使えます。

## 5. 管理画面から変更できるもの（コード変更不要）

| 項目 | 変更方法 |
|---|---|
| ロケーション名・コピー・写真・集合場所・所要時間・人気表示・空き状況 | Metaobjects → propose_location の該当エントリ |
| プラン料金・プラン名 | 該当ロケーションの `plan_product` の商品バリアント価格 |
| プラン内容（含まれるもの） | バリアントのメタフィールド `propose.includes` |
| オプション名・価格・説明・どのプランに含むか | propose-booking セクションのブロック設定（テーマカスタマイザ） |
| ヒーローの見出し・写真・CTA文言 | propose-hero セクション設定 |
| 3ステップ／当日の流れ／誘い方のヒント／FAQ（LP側） | 各セクションのブロック（テーマカスタマイザで追加・削除・並び替え可） |
| 信頼性セクションの本文 | propose-trust セクション設定 |
| ナビゲーションメニュー・ヘッダーCTA | 既存の header セクション設定（`main_menu` / `cta_label` / `cta_url`） |
| 新しいロケーションの追加 | Metaobjectを1件追加 → ページを1件作成しテンプレート `page.propose-location` を割当 → メタフィールド `propose.location` で紐付け → 目的地グリッドに自動反映 |

## 6. SEO / 構造化データ

- 各ページで individual `<title>` / meta description（Shopifyページ設定の「検索エンジン向けの
  ページタイトル」「メタディスクリプション」を使用）。
- ロケーション詳細ページ: `Product`（AggregateOffer＝プラン価格帯）＋ `BreadcrumbList` を出力
  （`snippets/propose-schema.liquid`）。
- LP: `FAQPage` 構造化データ（`sections/propose-faq.liquid`）。
- OGP / canonical は `layout/theme.liquid` の既存実装をそのまま利用（変更なし）。
- 予約フローページ（`propose-booking`）は `<meta name="robots" content="noindex">` を指定し、
  検索結果には出さずLP・詳細ページからの導線のみでアクセスさせます（決済に近い画面のため）。

## 7. パフォーマンス / アクセシビリティ

- 外部JSライブラリ・CSSフレームワーク不使用。バニラJS + バニラCSSのみ。
- 画像は `image_url` フィルタでリサイズ済みURLを生成し、装飾用以外は `loading="lazy"`。
- アニメーションはフェード＋わずかな移動のみ、`prefers-reduced-motion: reduce` で無効化。
- フォーカス可視化（`:focus-visible`）、十分なタップ領域（最小48px）、コントラスト比を確保した
  配色（濃いインク色 `#161512` on オフホワイト `#faf9f6`）。
- カレンダー・オプションなどのインタラクティブ要素はすべて `<button>` で実装（キーボード操作可）。

## 8. 既知の制約・今後の拡張ポイント

- オプション価格は現状「全ロケーション共通」です。ロケーション別に価格を変えたい場合は、
  `propose_location` にオプション商品参照フィールドを追加し、`propose-booking.liquid` の
  データ組み立てをロケーション単位に変更してください。
- 予約カレンダーの空き状況はメタオブジェクトの日付リストで手動管理する設計です。外部の
  予約管理システム／スタッフシフトと連携する場合は、このフィールドをWebhookやFlowで
  自動更新する仕組みに置き換えられます。
- 「予約者情報」ステップで集めるのは花束・送迎に関わる要望と連絡用メモのみで、正式な氏名・
  住所・支払い情報は Shopify Checkout 側で収集します（PCI DSS等の対応をShopify標準に委ねるため、
  独自フォームでカード情報等は一切扱いません）。
