# 世界のプロポーズプラン — Shopify実装ガイド（v2 再設計）

対象ユーザーを「旅行先・日程がすでに決まっていて、出発の5〜7日前にプロポーズを思い立った人」と
定義し直した再設計（v2）の、Shopify実装のための設計書です。

- **動くモックアップ（v2・完成）**: `/propose-lp/all-in-one.html`（1ファイル・オフライン可）
  ソースは `/propose-lp/src/`、ビルドは `python3 propose-lp/build.py`
- **このディレクトリのLiquid（v1のまま・移植が必要）**: §7 を参照

モックアップの `src/data.js` は、下記メタオブジェクトのフィールドと1対1で対応するように作ってあります。
Liquidへの移植は「名前の置き換え」で済み、構造の再設計は不要です（対応表は §6）。

---

## 1. 導線の考え方

```
Google / Instagram
  └→ /pages/propose/hawaii（ロケーション詳細・最重要ページ）  ← 直接着地する想定
       Hero（写真・料金 ¥128,000〜・「空き状況を見る」）
       └→ 同じページ内の「空き状況」で 9/28 17:30 AVAILABLE を選ぶ
            └→ 予約フロー STEP 3/5（プラン・オプション）から開始 ← 日付・時間は入力済み
                 └→ お客様情報 → 確認 → Shopify Checkout → 予約完了
```

- ロケーション詳細から来た場合、予約フローは **旅行先の選択をスキップ**（5ステップ）。
  空き状況で日時を選んで来た場合は **日付・時間もスキップ**し、STEP 3 から始まります。
- TOP は「旅行先から探す」が主役。旅行先未定の人向けの景色から探す導線は TOP 下部の補助扱い。
- 計測するKPI（離脱を見る段階）: ロケーションページ到達 → 空き状況の操作 → 予約フロー開始 → 予約完了。

## 2. URL構造

| URL | 内容 | Shopifyでの実現方法 |
|---|---|---|
| `/pages/propose` | TOP | 通常のページ（ハンドル `propose`）＋テンプレート `page.propose-home` |
| `/pages/propose/hawaii` など | ロケーション詳細 | **メタオブジェクトのWebページ機能**。定義 `propose` で「Webページとして公開」を有効にすると、エントリごとに `/pages/propose/<ハンドル>` のURLが付き、テンプレート `templates/metaobject/propose.json` で描画される |
| `/pages/propose-booking?loc=&date=&time=` | 予約フロー | 通常のページ＋テンプレート `page.propose-booking`（`layout/propose.liquid`・noindex） |

> 要確認：ハンドル `propose` の通常ページと、タイプ `propose` のメタオブジェクトWebページが
> 同じ `/pages/propose` 配下で競合しないかを開発ストアで確認してください。競合する場合は
> TOPのハンドルを `propose-top` にします（ロケーションURLは変わりません）。

メタオブジェクトのWebページにすることで、v1の「ページ＋メタフィールドで紐付け」が不要になり、
**ロケーション追加はメタオブジェクトを1件作るだけ**になります。

## 3. データモデル

### 3.1 メタオブジェクト `propose`（1エントリ＝1ロケーション）

| 指示書の項目 | キー | 型 | 備考 / モックアップの対応キー |
|---|---|---|---|
| location_name | `location_name` | 単一行テキスト | 「ハワイ」 / `nameJa` |
| location_name_en | `location_name_en` | 単一行テキスト | 「HAWAII」 / `name` |
| hero_image | `hero_image` | ファイル（画像） | 未設定ならイラストの代替表示 / `photo` |
| — | `hero_image_position` | 単一行テキスト | 例 `50% 60%`（トリミング位置） / `photoPos` |
| gallery_images | `gallery_images` | ファイルのリスト（画像） | 2枚以上あればギャラリーを表示 |
| catch_copy | `catch_copy` | 複数行テキスト | 「ハワイで、\n一生忘れない瞬間を。」 / `catch` |
| — | `tagline` | 単一行テキスト | 詳細ページの見出し・探索の一覧 / `tagline` |
| description | `description` | 複数行テキスト | 1〜2行 / `lede` |
| base_price | （持たない） | — | **価格の正は商品バリアント**（§3.2）。表示は `plan_product` の最安バリアントから算出し、二重管理を避ける |
| — | `plan_product` | 商品参照 | §3.2 |
| duration | `duration` | 単一行テキスト | 「約2時間」 |
| meeting_point | `meeting_point` | 単一行テキスト | 当日の流れ STEP 01・予約確認にも使用 |
| proposal_story | `proposal_story` | 複数行テキスト | 任意。場所ごとの特別な演出の説明 |
| proposal_steps | `proposal_steps` | メタオブジェクト参照のリスト → `propose_step` | 未設定なら共通の5ステップを使用 |
| best_time | `best_time` | 単一行テキスト | 「17:30」 |
| — | `best_time_note` | 単一行テキスト | 「夕日の時間」。**空なら BEST TIME を表示しない**（根拠のない「おすすめ」を出さない） |
| — | `time_slots` | 単一行テキストのリスト | 「16:00」「17:30」… 場所ごとに異なる（カッパドキアは早朝のみ等） |
| rain_plan | `rain_plan` | 複数行テキスト | 雨天時の対応 |
| lead_time | `lead_time` | 整数 | 何日前まで予約可。「最短○日前まで」の表示とカレンダーの締切に使用 |
| available_days | `blocked_slots` | 単一行テキストのリスト | `2026-09-28 17:30`（その枠のみ満席）/ `2026-09-28`（終日不可） |
| — | `few_left_slots` | 単一行テキストのリスト | 同じ書式で「残りわずか」 |
| faq | `faq` | メタオブジェクト参照のリスト → `propose_faq` | 場所固有の質問。共通FAQの前に表示 |
| — | `tags` | 単一行テキストのリスト | `sea` `town` `sunset` `nature` `resort` `special`（旅行先未定の人向け探索） |
| — | `popular` | 真偽値 | 並び順の調整に使用 |

補助メタオブジェクト:
- `propose_step`: `no` / `title` / `text` / `image`（プロポーズの実写が揃ったら各ステップに設定）
- `propose_faq`: `question` / `answer`

SEO: メタオブジェクトのWebページはエントリごとにSEOタイトル・説明を設定できます。
「ハワイ プロポーズ」「ハワイ プロポーズプラン」などの検索語は、`title` とH1（`catch_copy`）、
`description` に自然に含まれる構成です。

### 3.2 商品（プラン）

v1の「BASIC / FLOWER / PREMIUM の3つから選ぶ」比較型をやめ、**基本商品＋必要な演出** の構造にしました。

```
商品「HAWAII プロポーズプラン」（ロケーションごとに1商品）
  バリアント: Standard        ¥128,000   ← PROPOSE PLAN（予約フローで初期選択）
  バリアント: All inclusive   ¥203,000   ← 全部入り（4オプション込み。割引するならここで調整）

追加商品（全ロケーション共通、各1バリアント）
  FLOWER 花束              ¥15,000
  PRIVATE TRANSFER 専用送迎 ¥30,000   ← 選ぶと予約者情報に「滞在ホテル」欄が出る
  EXTRA PHOTO 追加撮影30分  ¥20,000
  SUNSET TIME ベストタイム確保 ¥10,000
```

- 含まれるもの（プロフォトグラファー／撮影30分／写真30枚以上／オンライン納品／日本語サポート）は
  商品メタフィールド `propose.includes`（リスト）で管理。**画面では「当日の流れ」より下に置く**
  （「撮影30分」を売り物の先頭にしない）。
- All inclusive を選ぶと4オプションは「含まれています」表示になり、個別追加はできません。

### 3.3 空き状況の扱い（正直な制約）

Shopify標準機能だけでは「時間枠ごとの在庫」を自動では持てません。v2は次の段階で運用します。

1. **当面**: `blocked_slots` / `few_left_slots` を運営が管理画面で更新（本当に埋まっている枠だけを入れる。
   ダミーの空き状況は作らない）。`lead_time` 以内の日は自動で「締切」。
2. **拡張**: 予約管理システムやスタッフのシフト表とつなぎ、Flow／Webhookで上記2フィールドを自動更新。

画面側の締切判定は使い勝手のためのもので、最終的な受付可否は注文後に運営が確認します
（重複予約時の連絡手順を予約確認メールに記載）。

### 3.4 カート連携

v1から変更なし（`POST /cart/add.js` に line item properties を付与 → `/cart` → Shopify Checkout）。
プロパティ: `LOCATION` / `PLAN` / `DATE` / `TIME` / `Meeting Point` / `Hotel`（送迎時）/ `Reservation Group`。
サプライズ配慮の希望は `cart.note` と `attributes` に入れ、注文確認メールのテンプレートで件名を切り替えます。

## 4. 画面設計（v2）

### TOP `/pages/propose`
1. **Hero** — 全画面写真／PROPOSE IN THE WORLD／「世界で、忘れられないプロポーズを。」／
   CTA「旅行先から探す」＋テキストリンク「まだ旅行先が決まっていない方」
2. **Destinations**（主役）— 「旅行先から、プロポーズを探す。」写真カード（名前・From 価格・プランを見る →）。
   スマホ2列・PC5列（10件がちょうど2行）。横スクロールなし。下に「まだ旅行先が決まっていない方へ」
3. **Last Minute** — 「出発の直前でも、間に合います。」最短○日前／14日分の空き状況／日本語サポート
4. **Your Proposal** — 当日の5ステップ（待ち合わせ → 自然に撮影スタート → 二人の時間 → プロポーズ → 記念撮影）
5. **Plan** — PROPOSE PLAN ¥108,000〜＋オプション＋全部入り
6. **FAQ** — 5問表示、残りは「すべての質問を見る」
7. **Not Decided Yet**（補助）— 海／街／夕日／大自然／リゾート／特別な景色 から1タップで候補表示
8. 締めのCTA／フッター。スマホは下部固定「旅行先から探す」（Destinations表示中は非表示）

### ロケーション詳細 `/pages/propose/<handle>`（最重要）
指示書の「ユーザーが知りたい8項目」を上から順に解決する構成:
1. **Hero** — 写真／PROPOSE IN HAWAII／HAWAII／「ハワイで、一生忘れない瞬間を。」／From ¥128,000／
   CTA「空き状況を見る」「予約する」 … *どんな場所・いくら・予約できるか*
2. **About＋Facts** — 1〜2行の紹介と、料金／所要時間／ベストタイム／受付締切／雨天時／日本語対応 … *何分・いつ・雨*
3. **Your Proposal** — 大きな写真＋5ステップのタイムライン … *どんなプロポーズになるか*
4. **Availability** — 「あなたの旅行日は、空いていますか？」今日から14日分→日付→時間枠（AVAILABLE / FEW LEFT / SOLD OUT）→
   「この日時で予約する」で予約フローSTEP 3へ … *空いているか*
5. **Plan** — その場所の料金・含まれるもの・オプション・全部入り
6. **Rain & FAQ** — 雨天対応を最上段に、場所固有の質問を先に
7. **締めのCTA** — 「あとは、日付を選ぶだけ。」＋ほかの旅行先
8. スマホは下部固定「FROM ¥128,000｜この場所で予約する」

### 予約フロー `/pages/propose-booking`
- ステップは状況に応じて短縮: `[旅行先] → 日付 → 時間 → プラン・オプション → お客様情報 → 確認`
- 上部に「STEP 3 / 5 プラン・オプション」と進捗バー、選択済み内容をチップ表示（「変更」で戻れる）
- 旅行先・日付・時間は選んだ瞬間に次へ自動で進む（戻るボタンで修正可）
- プランは PROPOSE PLAN が初期選択。オプションはチェックで追加
- お客様情報は最小限（お名前・メール・任意の電話・送迎時のみホテル）＋サプライズ配慮＋規約同意
- 画面下部に TOTAL と「次へ」を常時表示

## 5. デザインルール

- 色: paper `#faf9f6` / paper-deep `#f2efe8` / ink `#161512` / gold `#a3803f`。
  ゴールドは英字ラベルと細い区切りのみ。ボタンは黒（写真の上は白）。黒背景＋金文字で高級感を出さない。
- 書体: 英字 Cormorant Garamond（ラベル・地名・価格）、日本語 Noto Sans JP（見出し500／本文300）。
- 見出しは必ず「英字ラベル → 日本語見出し（1〜2行）→ 短い説明（2〜3行まで）」の3階層。
- カードUIは Destinations のみ。ほかは写真と余白、罫線で区切る。
- アニメーションはフェード＋わずかな移動と写真のゆっくりしたズームのみ。スマホでは移動なし、
  `prefers-reduced-motion` で全停止。

## 6. モックアップ ↔ Shopify 対応表

| `propose-lp/src/data.js` | Shopify |
|---|---|
| `name` / `nameJa` | `location_name_en` / `location_name` |
| `catch` / `tagline` / `lede` | `catch_copy` / `tagline` / `description` |
| `photo` / `photoPos` / `photoAlt` | `hero_image`（alt は画像の代替テキスト）/ `hero_image_position` |
| `base` / `plans[]` | `plan_product` のバリアント（Standard / All inclusive） |
| `OPTIONS[]` | 追加商品4点 |
| `duration` / `meetingPoint` / `rainPlan` | `duration` / `meeting_point` / `rain_plan` |
| `timeSlots` / `bestTime` / `bestTimeNote` | `time_slots` / `best_time` / `best_time_note` |
| `leadDays` | `lead_time` |
| `slotStatus()`（デモ用の擬似乱数） | `blocked_slots` / `few_left_slots`（実データ） |
| `tags` | `tags` |
| `PROPOSAL_STEPS` | `proposal_steps`（未設定時はセクション設定の共通5ステップ） |
| `FAQ` | 共通FAQ（セクションのブロック）＋ `faq`（場所固有） |

## 7. 実装状況と次の作業

| 対象 | 状態 |
|---|---|
| モックアップ（TOP・ロケーション詳細・予約フロー） | **v2 完了**（375/390/430/1280/1440pxで確認済み） |
| この設計書 | **v2 完了** |
| `sections/*.liquid` ほか既存のLiquid | **v1のまま**。以下の移植が必要 |

移植タスク:
1. メタオブジェクト定義 `propose`（§3.1）と `propose_step` / `propose_faq` を作成し、Webページとして公開
2. `templates/metaobject/propose.json` ＋ `sections/propose-location.liquid`（§4の構成、`metaobject.*` を参照）
3. TOP用セクションを v2 構成に差し替え（`propose-what-is` / `propose-moment` / `propose-invite` /
   `propose-trust` は廃止し、Last Minute・Plan・Not Decided Yet を追加）
4. `sections/propose-booking.liquid` と `assets/propose-booking.js` を v2 のステップ短縮・プラン構造に更新
5. 商品を Standard / All inclusive の2バリアント構成に変更、追加商品4点を作成
6. v2 の `propose-lp/src/styles.css` を `.pp-root` スコープ・`pp-` 接頭辞で `assets/propose.css` に反映

## 8. 写真について

- 使用中: 宮古島・イタリア・パリ・カッパドキア・モルディブ・バリ・カンクン・エアーズロック（ご提供の8枚）。
- **ハワイ**: ご提供の写真は Unsplash+ の透かし入りプレビュー（未購入の状態）だったため使用していません。
  ライセンス購入後の透かしなし画像に差し替えてください。
- **サントリーニ**: 写真未提供。イラストの代替表示（「PHOTO COMING SOON」）です。
- **TOPのHero**: 指示書の「プロポーズ直前・プロポーズ中の一瞬」（人物が写った写真）が未提供のため、
  現在はカッパドキアの風景写真を使用しています。
- 差し替え方法（モックアップ）: `propose-lp/images/<ロケーションID>.jpg` を置いて `python3 propose-lp/build.py`。
  写真がない場所は自動でイラスト表示になります。
