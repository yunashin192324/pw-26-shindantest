# 撮影地一覧（Destinations）— Metaobject セットアップ手順

このドキュメントはコードではなく、Shopify管理画面で一度だけ行う設定手順です。
`Destination` Metaobjectをこの通りに作成すれば、あとは都市を1件登録するだけで
検索・人気都市・テーマ・地域一覧・都市ページ・地域ページに自動反映されます。
コード変更は一切不要です。

## 1. Metaobject定義の作成

**設定 → メタオブジェクト → 定義を追加** で、以下の通り作成してください。

- **名前**: `Destination`
- **タイプ (handle)**: `destination` ← Liquid側はこのハンドルを直接参照するので必須

### フィールド一覧（この順番・このキーで作成）

| # | フィールド名 | キー (Key) | タイプ | 必須 | 備考 |
|---|---|---|---|---|---|
| 1 | 都市名（日本語） | `name_ja` | 単一行テキスト | ✅ | 例: `パリ` |
| 2 | 英語名 | `name_en` | 単一行テキスト | ✅ | 例: `Paris` |
| 3 | slug | `slug` | 単一行テキスト | ✅ | 例: `paris`。`/pages/paris` のURLと一致させる。**ストア内で重複不可** |
| 4 | Hero画像 | `hero_image` | ファイル（画像） | ✅ | カード・都市ページHeroで使用 |
| 5 | 地域 | `region` | 単一行テキスト（値の検証で下記8種に限定推奨） | ✅ | 下記「地域キー一覧」のいずれか1つを**そのまま**入力 |
| 6 | 国 | `country` | 単一行テキスト | ✅ | 例: `フランス` |
| 7 | 説明 | `description` | 複数行テキスト | ✅ | カード・一覧用の短い紹介文 |
| 8 | テーマ | `themes` | 単一行テキストのリスト | 任意 | 下記「テーマキー一覧」から複数選択・入力（例: `streets`, `heritage`） |
| 9 | 人気 | `popular` | 真偽値（true/false） | 任意 | ONのものだけ「人気都市」に表示 |
| 10 | 表示順 | `sort_order` | 整数 | 任意（未入力時は末尾扱い） | 人気都市・地域一覧内の並び順。数字が小さいほど先 |
| 11 | SEOタイトル | `seo_title` | 単一行テキスト | 任意 | 未入力時は `{都市名} フォトウェディング撮影地 | HIS World Wedding` を自動生成 |
| 12 | SEO説明文 | `seo_description` | 複数行テキスト | 任意 | 未入力時は `description` を160文字に短縮して使用 |

さらに、都市ページ用に以下の**任意**フィールドを追加すると `destination-spots` /
`destination-faq` セクションが自動でリッチ表示されます（未入力でも壊れません）。

| # | フィールド名 | キー (Key) | タイプ | 備考 |
|---|---|---|---|---|
| 13 | 撮影スポット | `photo_spots` | JSON（リスト） | `[{"name":"エッフェル塔","description":"..."}]` 形式。管理画面のJSON編集欄に貼り付け |
| 14 | よくある質問 | `faqs` | JSON（リスト） | `[{"question":"...","answer":"..."}]` 形式 |
| 15 | 飛行時間 | `flight_time` | 単一行テキスト | GEOブロック用。例: `約14時間` |
| 16 | 時差 | `time_difference` | 単一行テキスト | GEOブロック用。例: `−8時間` |
| 17 | ベストシーズン | `best_season` | 単一行テキスト | GEOブロック用。例: `4〜6月・9〜10月` |
| 18 | おすすめな人 | `recommended_for` | 単一行テキスト | GEOブロック用 |

## 2. 地域キー一覧（`region` フィールドに入力する値）

コード側で固定されているため、**Metaobjectとしては作成不要**です。`region`
フィールドには必ず以下のキー（英語小文字）をそのまま入力してください。

| キー | 表示名（日本語） | 地域ページURL |
|---|---|---|
| `europe` | Europe（ヨーロッパ） | `/pages/europe` |
| `america` | America（アメリカ） | `/pages/america` |
| `asia` | Asia（アジア） | `/pages/asia` |
| `oceania` | Oceania（オセアニア） | `/pages/oceania` |
| `middle_east` | Middle East（中東） | `/pages/middle-east` |
| `africa` | Africa（アフリカ） | `/pages/africa` |
| `south_america` | South America（南米） | `/pages/south-america` |
| `japan` | Japan（日本） | `/pages/japan` |

地域ページ（`/pages/europe` 等）は、そのURL handleでShopifyの「ページ」を8件作成し、
テンプレートに `page.region` を指定するだけで機能します（後述）。

## 3. テーマキー一覧（`themes` フィールドの選択肢）

テーマの見出し・画像は「テーマから選ぶ」セクション（`destinations-theme-list.liquid`）
の**テーマエディタ側のブロック設定**で自由に変更できます。`themes` フィールドには
各ブロックが持つ `theme_key` 設定と一致するキーを入力してください。初期プリセットは
以下の13種です（キーは変更しないでください。表示名・画像はテーマエディタで自由に編集可）。

`beach`, `streets`, `palace`, `heritage`, `view`, `lake`, `desert`,
`balloon`, `church`, `museum`, `library`, `resort`, `sunset`

## 4. ページの作成

管理画面 **オンラインストア → ページ** で以下を作成し、テンプレートを指定してください。

| ページ | handle | テンプレート |
|---|---|---|
| 撮影地一覧 | `destinations` | `page.destinations` |
| 各地域（8件） | `europe` / `america` / `asia` / `oceania` / `middle-east` / `africa` / `south-america` / `japan` | `page.region` |
| 各都市（120件以上） | Destinationの `slug` と同じhandle（例: `paris`） | `page.destination` |

※ `middle-east` / `south-america` はURLがハイフン区切りのため、`region-city-list.liquid`
内で `middle_east` → `middle-east` のようにアンダースコアをハイフンに変換して
リンクを生成しています（コード側で吸収済み、Metaobjectの`region`値自体はアンダースコアのままでOK）。

## 5. 都市を1件追加する手順（運用フロー）

1. 管理画面 → コンテンツ → メタオブジェクト → Destination → 「エントリーを追加」
2. 上記フィールドをすべて入力
3. 保存

これだけで、検索・人気都市（`popular`がtrueの場合）・テーマ一覧・該当地域の
地域一覧・`/pages/{slug}` の都市ページ・当該地域ページ、すべてに自動反映されます。
コード変更は不要です。
