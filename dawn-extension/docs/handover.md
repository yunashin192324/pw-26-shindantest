# HIS WEDDING（check-p1wk01-yy.myshopify.com）引継ぎ書

作成日：2026-07-20
このドキュメントは、これまでの作業を別スレッド（別のClaude会話）に
引き継ぐための網羅的なまとめです。新しいスレッドの冒頭にこのファイルの
中身を貼るか、添付して読み込ませれば、経緯を再説明せずに作業を再開できます。

---

## 1. 案件概要

- サイト：HIS WEDDING（海外フォトウェディング事業）
- Shopifyストア：`check-p1wk01-yy.myshopify.com`
- テーマ：Dawn（カスタマイズ済み。テーマID例: `160483180675`）
- 依頼者（ユーザー）は非エンジニア。コードは書けない。
- **Claude（AI）はこのShopifyストアへの直接アクセス権（Admin API等）を
  持っていない。** すべての納品物は「コードファイルをチャットで提示 →
  ユーザーがShopify管理画面のコード編集画面に手動でコピペ →保存」という
  フローで反映される。この制約は今後も変わらない前提で進めること。
- メタフィールド・メタオブジェクトのデータ入力も同様に、正しい形式の
  テキストをAIが用意し、ユーザーが管理画面から貼り付ける運用。

## 2. リポジトリ構成

このリポジトリ（`pw-26-shindantest`）内の `dawn-extension/` フォルダが
成果物一式。**Dawnテーマ本体一式ではなく、既存の実装への「追加・上書き分」
だけ**を格納している（`README.md`参照）。

```
dawn-extension/
├── README.md                 … 初期の反映手順まとめ（やや古い。要更新）
├── assets/
│   ├── destinations.css              … ★今回追加。ライブ版の参照コピー(後述)
│   ├── destinations-additions.css    … destinations.cssへの追記分①
│   └── destinations-additions-2.css  … destinations.cssへの追記分②
├── docs/
│   ├── handover.md                              … このファイル
│   ├── danang-migration-guide.md                … ダナン移行手順（更新済み）
│   ├── destinations-metaobject-fields-addition.md … Destinationメタオブジェクト拡張手順
│   └── product-plan-metafields-setup.md         … product-plan.liquid用メタフィールド設定手順
├── sections/   … 22ファイル（詳細は4節）
├── snippets/   … 5ファイル
└── templates/  … 5ファイル（JSON）
```

### ⚠️ 最重要の注意点：`assets/destinations.css` について

`destinations.css`はこのリポジトリには**元々存在しなかった**（Shopify側に
直接作られたファイルで、一度もこのリポジトリに取り込まれていなかった）。
2026-07-20、ユーザーがこのファイルの中身を誤って全消去し、
`destinations-additions-2.css`の内容だけに置き換えてしまうインシデントが
発生。Shopifyのコード編集画面の「Timeline（変更履歴）」機能で10時間前の
バージョンまで復旧し、その中身をユーザーからチャットに貼ってもらう形で
Claude側も初めて全文を把握できた。

**今回それをこのリポジトリに `assets/destinations.css` として保存した
（`destinations-additions.css`＋`destinations-additions-2.css`の内容も
含めて1本にマージ済み）。** ただし、これは「参照用のスナップショット」
であり、Shopify側の実ファイルと自動同期はしていない。**今後
`destinations.css`を編集するときは、必ずShopify管理画面側を直接編集し、
可能であれば作業後にこのリポジトリのファイルも手動で最新化すること。**

## 3. 技術的な前提・ハマりどころ（重要・全て実際に踏んだ地雷）

1. **Liquidの構文制限**：`{% assign %}`内に比較演算子や`contains`を
   直接書けない（`{% if %}`で先に判定してから`assign`する）。
   `{% if %}`の条件に括弧`()`は使えない。`{% render %}`のパラメータ値には
   フィルターチェーンを使ってよい（例: `theme_key: raw_key | strip | downcase`）。
2. **`where: 'x.value', y`フィルターがネストしたプロパティで不安定**：
   `shop.metaobjects.destination.values | where: 'slug.value', page.handle`
   のような、メタオブジェクトのネストしたプロパティへの`where`フィルターは
   この環境では機能しないことがある（同じ値でもマッチしない）。
   **対策**：常に明示的な`for`+`if`ループに置き換える。
   ```liquid
   {%- assign destination = blank -%}
   {%- for d in all_destination_entries -%}
     {%- if d.slug.value == page.handle -%}{%- assign destination = d -%}{%- endif -%}
   {%- endfor -%}
   ```
   （`section.blocks | where: 'type', 'xxx'`のような、トップレベルの
   単純なプロパティへの`where`は問題なく動く。ネストしたプロパティだけの
   問題）
3. **メタフィールド／メタオブジェクトのフィールド型は後から変更不可**：
   型を間違えて作った場合、削除して作り直すしかない。
4. **リッチテキスト型メタフィールドの`.value`は生JSONを返すことがある**：
   `{"type"=>"root",...}`のようなRubyハッシュ風の文字列がそのまま出る
   バグがこの環境にある。**対策**：`.value`ではなく、メタフィールド
   オブジェクト自体に`| metafield_tag`フィルターを適用する。
   ```liquid
   {%- assign plan_needed_items = mf.need | metafield_tag -%}
   ```
5. **JSON形式のメタフィールドは非エンジニアのユーザーには難しすぎる**、
   という強い要望を受け、プロジェクト全体でJSON形式を廃止し、
   「1行1項目、2つの情報は｜（縦棒）で区切る」というパイプ区切りの
   プレーンテキスト形式に統一済み（後述の一覧参照）。
6. **全角パイプ「｜」と半角パイプ「|」の不一致**：日本語IMEは自然に
   全角の「｜」(U+FF5C)を入力するが、`split: '|'`は半角の「|」(U+007C)
   にしかマッチしない。**対策**：パイプ区切りをパースする箇所は必ず
   `| replace: '｜', '|' | split: '|'`という順でフィルターを掛ける
   （このリポジトリ内の全パース箇所で対応済み。新しく同様の処理を
   書くときも必ずこの正規化を入れること）。
7. **セクションはスコープを共有しない**：例えば`destination-hero.liquid`
   で見つけた`destination`変数は、同じページの`destination-plans.liquid`
   など他セクションからは見えない。都市ページを構成する7セクション
   （hero/intro/reasons/spots/schedule/gallery/plans/faq）はそれぞれ
   独立して同じ「slugでmetaobjectを検索する」処理を繰り返している。
8. **同期実行される`<script>`はDOM構築順に注意**：あるセクションの
   `<script>`が、**後で描画される別セクション**の要素を
   `document.getElementById`等で参照する場合、`DOMContentLoaded`で
   包まないと「まだ存在しない要素」を探しにいって常に失敗する。
   2026-07-20に`destination-hero.liquid`の「プランを見る↓」リンクで
   実際にこのバグを踏んで修正した（全都市ページでリンクが永久に
   非表示になっていた）。同一セクション内で、自分より前に描画される
   要素を参照する分には問題ない。
9. **CSS Gridの`align-items: stretch`（既定値）に注意**：グリッドの
   行数・要素数が少ないと、アイテムが親要素の高さいっぱいまで
   間延びして見えることがある（`destination-plans.liquid`のプランが
   1件しかない都市で実際に発生）。対策として`align-content: start;
   align-items: start;`（グリッド側）と`height: fit-content;`
   （アイテム側）を指定。

## 4. パイプ区切り形式まとめ（JSON廃止後の統一フォーマット）

| 対象 | フィールドキー | 形式 | 使用ファイル |
|---|---|---|---|
| プラン: 料金オプション | `plan_options`（商品メタフィールド） | `名称｜価格` | product-plan.liquid |
| プラン: スケジュール | `plan_schedule`（商品メタフィールド） | `時刻｜内容` | product-plan.liquid |
| プラン: FAQ | `plan_faqs`（商品メタフィールド） | `質問｜回答` | product-plan.liquid |
| 都市: 選ばれる理由 | `reasons`（Destinationメタオブジェクト） | `見出し｜本文` | destination-reasons.liquid |
| 都市: モデルスケジュール | `schedule`（Destinationメタオブジェクト） | `時刻｜内容` | destination-schedule.liquid |
| 都市: FAQ | `faqs`（Destinationメタオブジェクト） | `質問｜回答` | destination-faq.liquid |

`photo_spots`（撮影スポット）だけは例外で、JSONではなく「Photo Spot」
という小さな別メタオブジェクトへの参照リスト方式（画像をその場で
アップロードできる）。詳細は`docs/destinations-metaobject-fields-addition.md`参照。

## 5. Metaobject駆動の都市ページシステム（現行の主力アーキテクチャ）

新しい撮影地（都市）ページを増やすのに、テンプレート複製もコード変更も
不要な仕組み。手順は「①Destinationメタオブジェクトに1件エントリー追加
②同じslugのPageを`destination`テンプレートで作成」のみ。

- テンプレート：`templates/page.destination.json`
- 構成セクション（`order`順）：
  `destination-hero → destination-intro → destination-reasons →
  destination-spots → destination-schedule → destination-gallery →
  destination-plans → destination-faq → destinations-cta`
- 各セクションは対応するメタオブジェクトフィールドが空なら**自動的に
  非表示**になる（エラーではなく仕様）。「選ばれる理由が出ない」等の
  問い合わせがあれば、まずメタオブジェクトのデータ未入力を疑うこと。
- `destination-plans.liquid`はブロックに商品を1つずつ紐付ける方式
  （コレクション自動連携ではない。過去そう説明していたが現在は違う。
  `danang-migration-guide.md`は既に修正済み）。

撮影地一覧ページ（`/pages/destinations`）は`destinations-browse.liquid`
1セクションに統合済み（検索ボックス＋地域/テーマのフィルターチップ＋
1つのカードグリッド）。旧来の4セクション構成
（destinations-search/popular/theme-list/region-list.liquid）は
ファイルとして残っているが、どのテンプレートからも参照されていない
（削除しても影響なし、掃除候補）。

地域ページ（`/pages/{region}`、例: `europe`）は`page.region.json`
テンプレートで、`region-hero.liquid`＋`region-intro.liquid`＋
`region-city-list.liquid`の3セクション構成。地域自体はメタオブジェクト化
しておらず、12地域のキー・日本語ラベル対応は
`snippets/destination-region-label.liquid`に集約。同様にテーマ（14種）は
`snippets/destination-theme-label.liquid`。

## 6. 現時点で「区別しておくべき2系統」の都市ページ

- **新方式（`destination`テンプレート、Metaobject駆動）**：ハワイなど
  新しく作った都市はこちら。
- **旧方式（`area-lp.liquid` + 個別テンプレート、例: `page.area-2.json`）**：
  ダナンが現状これ。まだ移行していない。移行手順は
  `docs/danang-migration-guide.md`に用意済みだが未実施。
  ロンドンも同様に旧方式のまま残っている可能性が高い（要確認）。

## 7. 完了している主な機能（このリポジトリ内、詳細な経緯は割愛）

- 商品ページ（`product-plan.liquid`）：Appointo予約カレンダー統合
  （即予約・リクエスト予約の両方の購入フロー、ギャラリー、日程、
  オプション、FAQ、注意事項、JSON-LD等）。ダナンのプランで設定済み、
  他プラン（6件程度）は未設定。
- Metaobject駆動の都市詳細ページ（7セクション）＋撮影地一覧＋地域ページ。
- ドレス診断・都市診断（30秒診断）の各クイズページ。
- TOPページ（`korean-wedding-lp.liquid`）：数字表示の文字化けバグ修正、
  「人気プラン」ブロックに商品連携オプション追加済み。

## 8. 未完了・引き継ぐべきタスク

優先度順ではなく、把握している範囲を列挙：

1. **ダナン・ロンドンの新テンプレート移行**（`danang-migration-guide.md`
   参照、実施前提の下準備は完了、実行はこれから）
2. **メタフィールド／メタオブジェクトフィールドの定義整備**：
   - 商品側 `plan_options`/`plan_schedule`/`plan_faqs`：JSON型から
     「複数行テキスト」型への削除→作り直しが必要（旧JSON型が残って
     いれば。使用中の商品が0件なのは確認済みなので削除して問題ない）
   - Destinationメタオブジェクト側 `reasons`/`schedule`：新規作成が必要
     （元々フィールド自体が存在しなかった）
   - Destinationメタオブジェクト側 `faqs`：JSON型なら削除→
     「複数行テキスト」で作り直し
   - 進捗はユーザー側で作業中だった。どこまで終わったか要確認。
3. **Appointoの予約設定**：ダナン以外の残りプラン（約6件）で
   サービス作成・営業時間・1日あたり上限件数・日付ごとの特例設定が
   未実施。リクエスト予約型プランは「支払いをスキップ」設定推奨。
4. **destinations.css の完全な最新状態への統一**：
   `destinations-additions.css`（選ばれる理由/スケジュール/ギャラリー用）
   の内容が、Shopify側の実ファイルに追記済みかどうか2026-07-20時点で
   未確認。追記手順は本引継ぎ書と一緒に渡された直近のやり取りを参照、
   または本リポジトリの`assets/destinations.css`（マージ済み版）を
   丸ごと使うよう案内してもよい。
5. **ハワイの`reasons`/`schedule`/`gallery_images`データ未入力**：
   このため現在ハワイのページで「選ばれる理由」「モデルスケジュール」
   「フォトギャラリー」の3セクションが非表示（仕様通り、バグではない）。
   入力内容が決まっていれば整形して渡せる。
6. **Shopify Flowによるキャンセル料自動化**：構想のみ、未着手。
7. **不要ファイルの掃除**（任意）：`destinations-search/popular/
   theme-list/region-list.liquid`（どのテンプレートからも未参照）、
   `README.md`の内容更新（初期の反映手順のままで現状と乖離あり）。
8. **Shopify AI Toolkit**：導入手順の説明・`--allow-mutations`運用方針の
   相談まで完了。実際のインストール・認証はユーザー側で未実施
   （ユーザーのローカルPCでのセットアップが必要、このセッションからは
   操作不可）。方針としては「コードは複製テーマ相手に積極活用可、
   データ変更はドラフト状態が存在しないため慎重に」で合意済み。

## 9. 2026-07-20 に発生した destinations.css 消失インシデントの経緯

1. プラン一覧カードの余白バグ修正のため、`destinations-additions-2.css`
   の該当ブロックだけを書き換えて提示
2. ユーザーがShopify側の`destinations.css`を編集する際、「該当ブロックを
   探して置き換える」つもりが、誤ってファイル全体を今回の追加分
   （30行程度）だけに置き換えてしまい、基本デザインシステム
   （`.dst-hero`, `.dst-container`, `.dst-btn`, カラートークン等
   300行以上）が消失。サイト全体が無地表示になる重大な表示崩れが発生
3. Shopifyコード編集画面の「TIMELINE」パネル（VS Code風の変更履歴機能）
   から10時間前の保存版を発見・復旧
4. 復旧した内容をユーザーがチャットに貼り付け、Claude側で初めて
   `destinations.css`の完全な中身を把握。この内容を
   `assets/destinations.css`としてリポジトリに保存（4節参照）
5. 復旧版には`destinations-additions.css`（選ばれる理由/スケジュール/
   ギャラリー用CSS）の内容が含まれていなかったため、追加で提示。
   Shopify側への反映完了確認は未了（8節タスク4）

**教訓**：`destinations.css`はこのリポジトリで完結管理できない
「Shopify側にしか実体がないファイル」だったため、今回のような事故で
一時的にロスト寸前になった。今後は編集のたびに、可能であれば
Shopify側の最新内容をこのリポジトリにも反映させる運用を推奨。

## 10. コミュニケーション上の注意

- ユーザーは非エンジニア。「差分だけ渡す」より「置き換える範囲ごと
  全文を渡す」方が事故が少ない（実際に今回の事故もその教訓から）。
- Shopify管理画面のUI要素の名称・位置を聞かれたら、具体的なクリック
  パスを省略せず案内すること。
- コード変更は基本的にこのリポジトリにコミット・プッシュしてから、
  Shopifyへの反映手順（貼り替え先ファイル名・貼り替え方法）を案内する
  運用で進めてきた。
