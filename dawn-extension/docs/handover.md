# HIS WEDDING（check-p1wk01-yy.myshopify.com）引継ぎ書

最終更新：2026-07-24
このドキュメントは、これまでの作業を別スレッド（別のClaude会話）に
引き継ぐための網羅的なまとめです。新しいスレッドの冒頭にこのファイルの
中身を貼るか、添付して読み込ませれば、経緯を再説明せずに作業を再開できます。

旧版（2026-07-20時点）はこのファイルの下部に大枠を残していますが、
**このセッションで内容の多くが刷新されているため、まずこの最新版を
信頼すること。矛盾があれば必ずこちらを優先する。**

---

## 1. 案件概要

- サイト：HIS WEDDING（海外フォトウェディング事業）
- Shopifyストア：`check-p1wk01-yy.myshopify.com`
- テーマ：Dawn（カスタマイズ済み。`Shopify.theme.id`は`160483180675`、
  `schema_version: 15.4.0`）
- 依頼者（ユーザー）は非エンジニア。コードは書けない。PC操作にも不慣れな
  場面がある（DevToolsの使い方などはこちらが手順込みで案内する必要がある）。
- **Claude（AI）はこのShopifyストアへの直接アクセス権（Admin API等）を
  持っていない。** すべての納品物は「コードファイルをチャットで提示 →
  ユーザーがShopify管理画面のコード編集画面に手動でコピペ →保存」という
  フローで反映される。この制約は今後も変わらない前提で進めること。
- メタフィールド・メタオブジェクトのデータ入力も同様に、正しい形式の
  テキストをAIが用意し、ユーザーが管理画面から貼り付ける運用。

## 2. リポジトリ構成

このリポジトリ（`pw-26-shindantest`）内に2つの独立したフォルダがある。
**どちらも同じ1つのライブShopifyテーマに反映される（別テーマではない）。**

```
dawn-extension/     … TOP・撮影地一覧・都市詳細・商品ページ・各種診断
shopify-theme/      … JOURNAL（ブログ）専用の一式
```

### dawn-extension/（メイン導線）

```
dawn-extension/
├── layout/
│   └── theme.destinations.liquid   … 撮影地一覧/地域/都市ページ専用レイアウト
├── assets/
│   ├── destinations.css                … 都市系ページ共通CSS（最重要ファイル）
│   ├── destinations-additions.css      … 旧・destinations.cssへの追記分①（現在は使われていない参考ファイル）
│   ├── destinations-additions-2.css    … 同②（同上）
│   └── lucide-0.263.0.min.js           … 自己ホスト化したLucideアイコン(CDN依存排除)
├── docs/
│   ├── handover.md                              … このファイル
│   ├── danang-migration-guide.md                … ダナン移行手順（実施済み、詳細は6節）
│   ├── destinations-metaobject-fields-addition.md … Destination等メタオブジェクト設定手順（最新版）
│   └── product-plan-metafields-setup.md         … product-plan.liquid用メタフィールド設定手順
├── sections/   … 都市・一覧・商品・診断・衣装まわり一式（詳細は4節、衣装は11節）
├── snippets/   … 共通部品（衣装の前後ナビゲーションは11節参照）
└── templates/  … JSON テンプレート
```

**2026-07-24に追加した衣装（ドレス）関連ファイル**（11節に詳細）：
`sections/custom-collection-lp.liquid`（衣装一覧ページ本体）、
`sections/dresslp.liquid`（衣装ブランド紹介LP）、
`snippets/dress-prev-next-nav.liquid`（商品詳細ページの前後ナビ）、
`templates/page.dress.json` / `page.dresslp.json` / `page.weddingdress.json`、
`sections/his-wedding-intro.liquid` + `templates/page.about.json`
（HIS WEDDING紹介ページ、新規）。

### shopify-theme/（JOURNAL）

```
shopify-theme/
├── layout/theme.liquid   … JOURNAL専用ではなく、サイト全体の唯一のメインレイアウト
│                            （後述「最重要の発見」を必ず読むこと）
├── assets/theme.css, journal.css, theme.js, journal.js
├── sections/    … journal-hero / journal-featured / journal-grid / journal-category /
│                  journal-cta / article-hero / article-body / article-related-posts /
│                  article-related-products / article-cta / header / footer
├── snippets/    … journal-card / journal-breadcrumb / journal-schema / journal-title-break 等
└── templates/blog.json, article.json
```

### ⚠️ 最重要の発見：`shopify-theme/layout/theme.liquid`はサイト全体の唯一のレイアウト

以前の引継ぎ書では「JOURNAL専用レイアウト」と誤解されていたが、実際には
**このファイルがサイト全体（TOP・都市ページ以外）の唯一のメインレイアウト**
であり、中身はほぼ無改造のDawn標準（カラースキーム変数生成、カートドロワー、
予測検索など）。JOURNAL用の`theme.css`/`journal.css`/`theme.js`/`journal.js`は、
このファイル内の以下の条件分岐でだけ読み込まれる：

```liquid
{%- if template.name == 'blog' or template.name == 'article' -%}
  {{ 'theme.css' | asset_url | stylesheet_tag }}
  {{ 'journal.css' | asset_url | stylesheet_tag }}
{%- endif -%}
```
（`<script>`側も同様の条件分岐が`</body>`直前にある）

**この発見に至った経緯**：word-break修正後にJOURNAL記事ページのレイアウトが
崩れ・目次が消えた、という報告を受けて調査した結果、リポジトリで管理していた
簡略版レイアウトファイルは実際にはライブ環境で使われておらず、
ユーザーに実際のライブ`theme.liquid`を貼ってもらって初めて実態を把握できた。
**今後同種の「原因不明のレイアウト崩れ」が起きたら、まずライブの
`layout/theme.liquid`の中身を貼ってもらって確認すること。憶測で直さない。**

一方、`dawn-extension/layout/theme.destinations.liquid`は撮影地一覧・地域・
都市詳細ページ専用の完全に別のレイアウトファイル（独自ヘッダー/フッター、
`destinations.css`/`destinations.js`を読み込む）。このセッションで初めて
実物をユーザーから提示してもらい、このリポジトリに追加した
（それまでリポジトリには存在しなかった）。

商品ページ・TOPページは`shopify-theme/layout/theme.liquid`を使う
（`template.name`が`product`/`index`等になり、JOURNAL専用CSSは読み込まれない）。

## 3. 技術的な前提・ハマりどころ（全て実際に踏んだ地雷。番号は踏襲元と統合）

1. **Liquidの構文制限**：`{% assign %}`内に比較演算子や`contains`を
   直接書けない（`{% if %}`で先に判定してから`assign`する）。
   `{% if %}`の条件に括弧`()`は使えない。
2. **`where: 'x.value', y`フィルターがネストしたプロパティで不安定**：
   `shop.metaobjects.destination.values | where: 'slug.value', page.handle`
   のような、メタオブジェクトのネストしたプロパティへの`where`は
   この環境では機能しないことがある。
   **対策**：常に明示的な`for`+`if`ループに置き換える。
   ```liquid
   {%- assign destination = blank -%}
   {%- for d in all_destination_entries -%}
     {%- if d.slug.value == page.handle -%}{%- assign destination = d -%}{%- endif -%}
   {%- endfor -%}
   ```
   （`.id`のようなメタオブジェクトの**トップレベル**プロパティへの`where`は
   問題なく動く。使用例：`destinations-browse.liquid`の並び替えリスト
   フォールバック処理で`all_destination_entries | where: 'id', d.id`。
   不安定なのはネストした`.value`プロパティだけ）
3. **メタフィールド／メタオブジェクトのフィールド型は後から変更不可**：
   型を間違えて作った場合、削除して作り直すしかない。
4. **リッチテキスト型メタフィールドの`.value`は生JSONを返すことがある**：
   対策は`| metafield_tag`フィルターを使うこと。
5. **JSON形式のメタフィールドは非エンジニアには難しすぎる**という要望で
   全面的に廃止し、後述の各種方式（パイプ区切り／逆参照メタオブジェクト／
   ALTテキスト規約）に統一済み。
6. **全角パイプ「｜」と半角パイプ「|」の不一致**：`split: '|'`は半角にしか
   マッチしない。パイプ区切りをパースする箇所は必ず
   `| replace: '｜', '|' | split: '|'`の順でフィルターを掛けること。
7. **セクションはスコープを共有しない**：都市ページを構成する各セクション
   （hero/intro/quickfacts/reasons/spots/schedule/gallery/plans/faq）は
   それぞれ独立して同じ「slugでmetaobjectを検索する」処理を繰り返している。
8. **同期実行される`<script>`はDOM構築順に注意**：後で描画される別セクションの
   要素を参照する場合、実行タイミングに気をつけること。
9. **CSS Gridの`auto-fill`と`auto-fit`の違い（重要・頻出）**：
   `repeat(auto-fill, minmax(220px, 1fr))`は、アイテム数が列数に満たない
   場合でも「空の列」を確保してしまい、1fr込みでその空列にもスペースが
   配分されるため、少数アイテム時にカードの右側に不自然な空白ができる
   （プラン1件の都市、関連都市1件などで発生）。
   **対策**：`repeat(auto-fit, minmax(220px, 280px))`のように`auto-fit`
   （空列を詰める）＋ 上限付き`minmax`（1frではなく固定上限）の組み合わせに
   変更。ただしこの対策には**副作用**があり、スマホの1カラム表示時に
   上限（280px等）で頭打ちになり画面幅を余らせて「左寄り」に見える
   バグを新たに生む。**この副作用の対策として、狭い画面
   （`@media (max-width: 560px)`程度）では`grid-template-columns: 1fr;`
   で上書きし、フル幅の単一カラムに戻すこと。** `destinations.css`内の
   `.dst-region-grid` / `.dst-plans-grid` / `.dst-reasons-grid` /
   `.dst-spots-grid`すべてにこの2段構えの対策を適用済み。今後同種の
   グリッドを追加するときは最初からこのパターンで書くこと。
10. **CSS Gridで「長い1単語」が列幅を歪める**：`grid-template-columns:
    repeat(3, 1fr)`の均等割りは、グリッドアイテムの既定`min-width: auto`が
    子要素の最小コンテンツ幅（≒途中で折り返せない一番長いトークンの幅）を
    考慮するため、スペースなしで長く続くカタカナ語（例：
    「フォーシスアンドカンパニー」）を含むカードだけ列全体が広がって
    見えることがある（JOURNAL「最新記事」グリッドで実際に発生。他の列は
    正常で、該当カードの列だけ明らかに大きく見えた）。
    **対策**：グリッドアイテム（`.card`）に`min-width: 0;`を追加する。
    これで自動最小幅の計算が無効化され、意図通り均等な列幅になる。
    **診断のコツ**：見た目だけで「サイズが違う」と判断せず、一時的に
    `outline: 4px solid red;`のようなデバッグ用の枠線を該当要素に
    付けてスクリーンショットを送ってもらうと、ユーザー自身の目で
    一発で確認できて手戻りが減る（実際にこの手法で特定した）。
11. **「親要素に指定した色」は「子要素(h1等)に直接指定された色」に
    負ける**（CSS継承の優先度に関する重要な地雷）：`.hero-content { color:
    white; }`のように親divにだけ色を指定しても、Dawn標準の`base.css`が
    `h1, h2, h3, ... { color: rgb(var(--color-foreground)); }`のように
    **要素自体に直接**低い詳細度で色を指定していると、そちらが必ず勝つ
    （継承値は「その要素への直接指定が一つも無いとき」だけ使われる
    フォールバックであり、詳細度の勝負にすら参加しない）。ヒーロー画像上の
    タイトル文字が白のはずなのに黒っぽく見える、という形で実際に発生。
    **対策**：色を変えたい要素自身（`h1`本体）にも直接色を指定すること。
    **診断のコツ**：ブラウザDevToolsで該当要素を選択→Stylesで実際に
    「打ち消し線なしで効いている」ルールとその出典ファイル/行番号を
    確認してもらうのが最も確実（このセッションで複数回、これで
    一発解決した）。
12. **Shopify管理画面の「複製する」機能は、メタオブジェクトの
    ユニーク制約付きフィールド（`slug`等）でエラーになることがある**：
    「都市名」だけ変更できても`slug`はそのままコピーされ、既存エントリーと
    重複してユニーク制約違反＝「不明なエラー」として表示される。
    **対策**：新規都市は「複製する」を使わず、必ず「エントリーを追加」で
    ゼロから作成し、`slug`を必ず専用の値で手入力する。
13. **PDF読み込みには`poppler-utils`が必要**：このサンドボックス環境には
    `libpoppler134`はあるが`pdftoppm`/`pdftotext`本体（`poppler-utils`
    パッケージ）が入っていないことがある。Readツールで88ページ超のPDFを
    渡された場合など、`apt-get install -y poppler-utils`（必要なら先に
    `apt-get update`）で解決する。
14. **xlsxスキル使用時、`openpyxl`が未インストールなことがある**：
    `pip install openpyxl`で解決（root権限の警告は無視してよい）。
15. **`shop.metaobjects.<type>.values.first`がこの環境では機能しない
    （重大・要注意）**：単体エントリー（シングルトン）のmetaobjectを
    `.values.first`で取得しようとすると、`.values.size`は正しく`1`を
    返すにもかかわらず、`.first`はblank/nilを返す。原因不明だが実際に
    再現し、都市一覧ページの都市が全件消える重大な不具合を引き起こした
    （Destination Orderのエントリー取得で発生）。
    **対策**：`.first`は使わず、`{% for %}`ループで確実に取り出す。
    ```liquid
    {%- assign order_entry = blank -%}
    {%- for oe in shop.metaobjects.destination_order.values -%}
      {%- assign order_entry = oe -%}
    {%- endfor -%}
    ```
    **診断の経緯**：`order_entry exists: false`なのに
    `shop.metaobjects.destination_order.values.size`が`1`という、
    一見矛盾する2つのデバッグ出力を画面に直接表示させて初めて発見できた。
    「原因不明の空表示」系の不具合は、口頭でのやり取りより先に、
    こうした変数の中身を直接ページに出力するデバッグ表示を入れてもらう方が
    早く確実に特定できる。
    **関連の教訓**：`{{ }}`（出力タグ）の中では`!=`/`==`等の比較演算子は
    使えない（`{% if %}`の中でしか使えない）。デバッグ用コード自体にも
    このミスを一度混入させてしまい、余計な手戻りが発生した。急いで書く
    一時的なコードでも、通常のコードと同じ構文ルールを守ること。
16. **この作業環境からは、ライブのShopifyストアや外部サイトに直接
    アクセスできない**：`https://check-p1wk01-yy.myshopify.com/...`への
    アクセスはネットワークプロキシ側のポリシーで拒否される（`CONNECT`
    自体が403）。競合他社サイト（例：`watabe-wedding.co.jp`）のような
    一般の外部サイトも、ページ側のボット対策で弾かれることがある
    （こちらはプロキシは通るがサイト自体が403を返す）。
    **つまり「このURLを見て」と言われても中身を直接確認する手段が無い。**
    今後も、実際のコード・スクリーンショット・DevToolsの出力・PDF等を
    ユーザーから提示してもらう前提で進めること（本セッションで確立した
    やり方の延長）。

## 4. 都市ページのデータ入力方式（現行、JSON廃止後）

| データ | 保存場所 | 方式 |
|---|---|---|
| 都市の基本情報（名前・国・地域・説明・早わかり情報等） | Destinationメタオブジェクト本体 | 通常のフィールド |
| フォトギャラリー画像 | Destinationの`gallery_images`（ファイルのリスト） | まとめてアップロード |
| 撮影スポット | Destinationの`photo_spots`（Photo Spot参照リスト） | その場で新規作成＆画像アップロード |
| **選ばれる理由** | **Reason**メタオブジェクト（`destination`欄で都市を指定） | 逆参照方式（後述） |
| **モデルスケジュール** | **Schedule Item**メタオブジェクト（`destination`欄で都市を指定） | 逆参照方式 |
| **よくある質問** | **FAQ Item**メタオブジェクト（`destination`欄で都市を指定） | 逆参照方式 |
| **プラン一覧** | Destinationの`plans`（商品参照のリスト） | 都市ごとに直接商品を選択 |
| **都市の並び順** | **Destination Order**メタオブジェクト（1件のみ、`destinations`欄をドラッグ並び替え） | ドラッグ方式（後述） |
| 画像のトリミング位置（都市ギャラリー/商品ギャラリー/プラン画像） | 各画像のALTテキストに`｜位置`を追記 | ALTテキスト規約（後述） |

### 4-1. 逆参照方式（Reason / Schedule Item / FAQ Item）— 最重要アーキテクチャ

**背景**：当初はDestination側が`reasons`/`schedule`/`faqs`という参照リストを
持つ設計だったが、この方式だと「`page.destination.json`が全都市共通の
1テンプレートである」ため、**ある都市用に選んだ理由が全都市ページの
選択肢プールに混ざり、都市が増えるたびに一覧が際限なく増え続ける**という
致命的な欠陥が判明（ユーザーからの指摘で発覚）。

**解決策**：関係の向きを逆にした。Destination側は何も持たず、
`Reason`/`Schedule Item`/`FAQ Item`という独立したメタオブジェクトの
各エントリー側に`destination`（単一のメタオブジェクト参照）フィールドを
持たせ、「このエントリーはどの都市のものか」を1件ずつ指定する。

表示側（`destination-reasons.liquid`等）は、対象の全エントリーを
`shop.metaobjects.reason.values`のように取得し、明示的な`for`+`if`ループで
`item.destination.value.slug.value == destination.slug.value`のものだけを
抽出して表示する（3節②のwhere不安定問題を回避するため、ここも
where filterではなく明示的ループ）。

**管理画面上の注意**：Destinationエントリーの編集画面には、今も
「選ばれる理由」「モデルスケジュール」「よくある質問」という**古い
未使用の参照リストフィールドが残っている**（削除していないだけで
実害はない。コードはこの欄をもう読みに行っていない）。この欄の
選択肢一覧には全都市ぶんの項目がまとめて表示されるが、これは
Shopifyの参照リストピッカーの仕様上の見え方であり、実際の表示は
各エントリー自身の`destination`欄だけで完全に都市ごとに独立している。
ユーザーが繰り返し「他都市のが混ざって見える」と心配した経緯があるが
実害なし。気になるなら削除してよい。

**管理画面での一覧の見づらさ対策**：都市・質問数が増えると
Content→メタオブジェクト→「FAQ Item」等の一覧が全都市ごちゃまぜになる。
各メタオブジェクト定義の`destination`フィールドで「フィルタリングを
有効にする」（メタオブジェクト定義編集画面の下部「フィールドのオプション」
→「フィルターとして使用されるフィールド」→「＋フィールドを追加する」）を
設定すると、一覧画面でdestinationによる絞り込みができるようになる
（Shopify標準機能。テーマコードとは無関係）。ユーザーへの案内済み、
設定できたかは未確認。

### 4-2. プラン一覧（`destination-plans.liquid`）も同じ問題を解決済み

旧方式（セクションの**ブロック**に商品を1つずつ紐付け）も、
`page.destination.json`が全都市共通テンプレートである以上、
ある都市で追加したプランが全都市に出てしまう同じ欠陥を抱えていた。

**解決策**：Destinationに`plans`フィールド（商品参照の**リスト**、
`リストにする`必須）を追加し、都市ごとに直接商品を選ぶ方式に変更。
旧ブロック方式は後方互換のため残してあり、`plans`が1件でも設定されている
都市ではそちらが優先される（ハワイは旧ブロック方式のまま動作継続中、
未移行）。新しい都市には必ず`plans`欄を使うこと。

各商品のメイン画像の代替テキストに「｜位置」を追記すると、その商品だけ
トリミング位置を上書きできる（4-4節のALTテキスト規約と同じ仕組み）。

### 4-3. 都市の並び順（Destination Order）— 2026-07-23 導入

**背景**：当初はDestinationに`sort_order`（数値の単一行テキスト）を追加し
数値で管理する方式にしたが、ユーザーから「他の都市が何番か分からないと
入力しづらい」「運用（暗記・Excel参照）でカバーするのではなく機能的に
直してほしい」という強い要望があり、方式を変更した。

**現行方式**：`Destination Order`という専用メタオブジェクトを**1件だけ**
作成し、`destinations`フィールド（Destinationの参照**リスト**、管理画面で
ドラッグして並び替え可能）に全都市をまとめて入れておく。表示順は
このリストの並び＝そのまま。数字の入力・記憶は一切不要。

`destinations-browse.liquid`側のロジック：
```liquid
{%- assign order_entry = shop.metaobjects.destination_order.values.first -%}
{%- assign ordered_list = order_entry.destinations.value -%}
{%- assign all_destinations = ordered_list -%}
{%- comment -%} リストに入れ忘れている都市は自動的に末尾へ追加(表示が消えない安全策) {%- endcomment -%}
{%- for d in all_destination_entries -%}
  ...where: 'id', d.id で不足分をconcat...
{%- endfor -%}
```
旧`sort_order`フィールドはもう読まれていない（残っていても無害、削除可）。

**未確認事項**：`Destination Order`メタオブジェクト定義＋エントリー1件の
作成、および全都市（既存2件＋新規24件、4-5節参照）をドラッグで並べる作業は
ユーザー側でこれから実施。**次のスレッドで最初に確認すべき事項。**

### 4-4. ALTテキストによる画像トリミング位置の指定（規約）

対象：都市フォトギャラリー（`destination-gallery.liquid`）、撮影スポット
（`destination-spots.liquid`、こちらは専用の「画像位置」参照メタオブジェクト
経由）、プラン商品画像（`destination-plans.liquid`／`product-plan.liquid`の
商品ギャラリー）。

画像のALT（代替）テキストに`説明文｜位置`の形式で書くと、その1枚だけ
トリミング位置を上書きできる。

```
ワイキキビーチの夕暮れ｜下
チャペル外観｜左
```

使える位置の言葉：上／下／左／右／中央／左上／右上／左下／右下
（英語 `top`/`bottom`等や`30% 50%`のような生のCSS値も可、`destination-image-position.liquid`
スニペットが変換）。`｜`が無ければセクション設定の既定値にフォールバックする。
全角「｜」対応済み（3節⑥参照）。

撮影スポットだけは方式が異なり、`image_position`という専用の「画像位置」
参照メタオブジェクト（9つの固定エントリー：上/下/左/右/中央/左上/右上/左下/右下）
をクリックで選ぶ方式（この環境のメタオブジェクトフィールドには
「選択肢を制限するドロップダウン」機能が無いため、この小さな参照専用
メタオブジェクトで代用している）。

### 4-5. 24都市の新規追加（下書き済み・未反映）

ユーザーから「ウィーン、パリ、アムステルダム、ヘルシンキ、ブダペスト、
沖縄本島、宮古島、石垣島、ロサンゼルス、ラスベガス、カンクン、ケアンズ、
パース、シドニー、ゴールドコースト、メルボルン、バリ島、カッパドキア、
エジプト（カイロ）、バルセロナ、ローマ、フィレンツェ、ベネチア、アマルフィ」
の24都市を追加したいという依頼があり、全都市分の

- 都市基本情報（説明文・飛行時間・時差・ベストシーズン・おすすめな人・テーマ）
- 選ばれる理由（各2件）
- モデルスケジュール（各2〜3日分）
- よくある質問（各3件）
- 撮影スポット（各3件）

をマーケティング文案として下書きし、Excelファイル
`都市ページ一括入力テンプレート.xlsx`にまとめて渡した（ユーザーの
スクラッチパッド経由で送付、リポジトリには未コミット。再生成する場合は
`/tmp`配下の`build_destination_template.py`と`cities_data.py`が
ソース。セッションが変わると`/tmp`の中身は消えている前提で、
再度必要なら同内容を作り直すこと）。

**このExcelは下書き案であり、実際にShopifyへの入力はまだ行われていない
（次スレッドの主要タスク）。** 地域(region)キーは
`snippets/destination-region-label.liquid`で定義された12種の固定キー
（`hawaii`/`micronesia`/`south_pacific`/`indian_ocean`/`oceania`/`asia`/
`middle_east`/`europe`/`north_america`/`south_america`/`africa`/`japan`）
のいずれかを使うこと（表示ラベルではなくキーをそのままDestinationの
`region`欄に入れる）。

## 5. 都市ページのSEO自動化（`layout/theme.destinations.liquid`）

都市ページ（`template.suffix == 'destination'`）は本文(`page.content`)を
使わずセクションだけで組んでいるため、Shopify管理画面の
「検索エンジンリスティング」（SEOタイトル/ディスクリプション）を
手入力しない限り、`<meta name="description">`自体が出力されない、
OGP画像がサイト全体共通の1枚になる、といった問題があった。

`layout/theme.destinations.liquid`内で、`page.handle`からDestination
エントリーを検索し（3節②の明示的ループ）、管理画面の手入力が空の場合は
`name_ja`/`description`/`hero_image`から自動でタイトル・ディスクリプション・
OGP画像を生成するようフォールバック処理を追加済み。手入力があれば
そちらが常に優先される。

## 6. 各都市の移行状況（`destination`テンプレート方式への移行）

- **ハワイ**：新方式（`destination`テンプレート）。プランのみ旧ブロック
  方式のまま（4-2節）。`reasons`/`schedule`/`gallery_images`は
  データが入っているかセッション終盤時点で未確認（一時期は未入力で
  非表示だった）。
- **ダナン**：ユーザーの発言により**新方式（`destination`テンプレート）に
  移行済み**（従来の`area-lp.liquid`方式ではなくなった）。ただし
  `reasons`/`schedule`/`faqs`/`plans`等のデータ投入状況は未確認。
  次スレッドで確認すること。
- **ロンドン**：状況不明（旧方式`area-lp.liquid`のまま残っている可能性が
  高いが、このセッション中に明確な確認はしていない）。JOURNALの
  関連記事カード等には「ロンドンフォトウェディング完全ガイド」という
  記事が存在することは確認済み（`/blogs/journal/london-photo-wedding`）。
- **新規24都市**（4-5節）：Destinationエントリー自体も未作成。

`sections/area-lp.liquid`（旧方式）はまだリポジトリに残っている
（ダナンが移行済みなら、ロンドンの移行が終われば削除候補）。

## 7. 完了している主な機能（このセッションで実施した範囲）

- TOP・JOURNAL・都市ページ全体の改行崩れ（CJK文字のword-break）を
  多層的に修正（`.lp-container`／`.destinations-scope`／JOURNAL
  `body`・見出し・`.article-content`見出し全体に`word-break: keep-all;
  overflow-wrap: break-word;`を適用）。
- 外部CDN依存の排除：Tailwind/Lucideを自己ホスト化。
- 都市ページの画像トリミング位置指定を3段階で整備
  （4-4節のALTテキスト規約に統一、Photo Spotは専用参照メタオブジェクト）。
- Reason/Schedule Item/FAQ Item/Plansの逆参照アーキテクチャへの全面移行
  （4-1, 4-2節）。
- 都市の並び順をDestination Order方式に刷新（4-3節）。
- 都市ページのSEO自動生成（5節）。
- 都市ページのフォトギャラリーに拡大表示＋前後スワイプ・矢印付き
  ライトボックスを追加（`destination-gallery.liquid`、`product-plan.liquid`
  と同じ仕組み）。矢印/×ボタンが明るい写真の上で見えなくなる不具合と、
  さらにDawn標準スタイルとの詳細度負けで実は真っ黒だった不具合の
  両方を修正済み（3節⑪参照）。
- CSS Gridの空白バグ（3節⑨）・列幅歪みバグ（3節⑩）を一通り修正。
- JOURNAL：関連記事/最新記事カードの画像アスペクト比崩れ修正、
  記事見出しの数字ガタつき（Cormorant Garamondのオールドスタイル数字）
  修正、記事ヒーロー画像の文字色・暗さをテーマエディタから調整できる
  設定を追加（`article-hero.liquid`/`journal-hero.liquid`両方）。
- 見ている人はこれも見ています系のレコメンド（Shopify Product
  Recommendations API＋同一撮影地フォールバック、撮影地は
  同地域→同テーマフォールバック）。
- TOPページの「オンライン相談」CTA、「撮影地診断」大型バナー＋
  フローティングボタン（TOP・撮影地一覧ページ両方、それぞれ表示/非表示
  切替可）。
- 撮影地診断（`destination-quiz.liquid`）のUIリッチ化（進捗バー、
  アイコン、カードスタイル、ホバーアニメーション、結果ランクバッジ。
  診断ロジック自体は変更なし）。
- 撮影地一覧ページ（`destinations-browse.liquid`）：PCで表示順の
  先頭3件を大きなカードで、残りを4列グリッドで表示するよう変更。

## 8. 未完了・引き継ぐべきタスク（優先度順ではなく網羅列挙）

1. **ドレス診断ページに進捗バー等のUIリッチ化を追加する（保留中）**：
   撮影地診断（`destination-quiz.liquid`）と同じ仕様に揃えたいという
   依頼があったが、**ドレス診断のセクション/ページファイルがこの
   リポジトリに存在せず、ユーザーからの提示待ちで止まっている**。
   `/pages/wedding-dress-diagnosis`というURLが`shopify-theme`側の
   ヘッダーリンクに存在することは確認済み（`custom-header-wrapper`内の
   ナビゲーション、`shopify-theme/sections/header.liquid`相当だが、
   実際のヘッダーは各ページに埋め込まれた`custom-header-wrapper`
   スタイル/スクリプト付きの独自マークアップの模様。`wedding-ec/`配下の
   静的HTMLプロトタイプにdiagnosis.htmlがあるが、これは初期プロトタイプで
   実際のライブページの実装そのものではない可能性が高い）。次スレッドで
   まずこのページの実際のliquidファイル一式を提示してもらうこと。
2. **24都市のShopifyへの実投入**（4-5節）：Excelの下書きを元に
   Destinationエントリー・Reason・Schedule Item・FAQ Item・Photo Spot・
   `plans`・ギャラリー画像を全都市ぶん作成する必要がある。地域(region)
   キーの入力ミスに注意（12種の固定キー、5節参照）。
3. **Destination Orderメタオブジェクトの定義・エントリー作成**（4-3節）：
   まだ設定されていない可能性が高い。次スレッドで最優先に確認。
4. **ロンドンの新テンプレート移行**（未確認、6節）。
   `danang-migration-guide.md`の手順がそのまま流用できるはず
   （ダナンで実施済みの前例あり）。
5. **Appointoの予約設定**：ダナン以外の残りプランで
   サービス作成・営業時間・1日あたり上限件数・日付ごとの特例設定が
   未実施（前回引継ぎからの持ち越し、今回未着手）。
6. **ハワイのプランを`plans`欄（新方式）へ移行**（4-2節、任意・急ぎではない）。
7. **旧・未使用フィールド／ファイルの整理（任意）**：
   - Destinationエントリーに残る古い「選ばれる理由」「モデルスケジュール」
     「よくある質問」参照リストフィールド（4-1節、実害なし）
   - 旧`sort_order`フィールド（4-3節、実害なし）
   - `sections/destinations-search.liquid` / `destinations-popular.liquid` /
     `destinations-theme-list.liquid` / `region-list.liquid`
     （どのテンプレートからも未参照、`destinations-browse.liquid`に統合済み）
   - `sections/area-lp.liquid`（旧方式都市ページ用、全都市移行後に削除可）
8. **`destinations.css`のリポジトリ同期**：このセッション中に何度も
   Shopify側の実ファイルとリポジトリ版の内容確認・同期を行ったが、
   今後も編集のたびにリポジトリへの反映を忘れないこと。
9. **Shopify Flowによるキャンセル料自動化**：構想のみ、未着手（前回引継ぎからの持ち越し）。
10. **Destination Order修正の動作確認**（12節）：`.values.first`不具合の
    修正版がユーザーの環境で実際に直っているか未確認。最優先。
11. **衣装関連の新規ファイルのShopifyへの反映確認**（11節）：
    `custom-collection-lp.liquid`（元に戻した版）・`dress-prev-next-nav.liquid`・
    `his-wedding-intro.liquid`＋`page.about.json`が実際に管理画面へ
    貼り付けられ動作しているか未確認。
12. **HIS WEDDING紹介ページの実データ差し替え**（11-3節）：実績数字・
    お客様の声3件はプレースホルダーのまま。
13. **ドレス商品への複数枚画像の追加**（11-2節）：現状1商品1枚のため、
    商品詳細ページのDawn標準ギャラリーで「次の写真」が機能しない。

## 9. 過去のインシデント記録（教訓として保持）

### 9-1. 2026-07-20：`destinations.css`消失インシデント
プラン一覧の余白バグ修正時、ユーザーが誤ってファイル全体を追加分だけに
置き換えてしまい、基本デザインシステムが消失。Shopifyの「TIMELINE」機能
（変更履歴）から10時間前の版を復旧。**教訓**：`destinations.css`は
Shopify側にしか実体がないファイルなので、差分ではなく全文での
やり取りを徹底する（10節にも反映済み）。

### 9-2. 2026-07-22ごろ：JOURNAL記事ページのレイアウト崩れ
word-break修正後に発生。原因は2節の「最重要の発見」の通り、リポジトリの
`theme.liquid`が実際のライブ環境と異なっていたこと。ユーザーに実際の
ライブファイルを貼ってもらって解決。**教訓**：レイアウトファイル関連の
原因不明の不具合は、まずライブの実ファイルを確認する。

### 9-3. このセッションで多発した「見た目のバグ」診断の教訓
- CSS Gridの列幅・空白系の不具合は、口頭説明やスクリーンショットの
  目視だけで水掛け論になりやすい。**一時的なデバッグ用の赤枠
  （`outline: 4px solid red;`）を該当要素に入れて再度スクリーンショットを
  送ってもらう**のが最も早く確実（3節⑩）。
- 色が反映されない系の不具合は、**ブラウザDevToolsで対象要素を選択し、
  Stylesパネルで実際に効いているルールの出典（ファイル名:行番号）を
  確認してもらう**のが最も確実（3節⑪）。
- 「たぶんキャッシュ／貼り替え漏れだろう」という憶測での指摘は、
  ユーザーを何度も同じ確認作業に付き合わせることになり信頼を損ねやすい。
  可能な限り上記のような「客観的に一発で分かる」診断手段を優先すること。

## 10. コミュニケーション上の注意

- ユーザーは非エンジニア。「差分だけ渡す」より「置き換える範囲ごと
  全文を渡す」方が事故が少ない。
- Shopify管理画面のUI要素の名称・位置を聞かれたら、具体的なクリック
  パスを省略せず案内すること（例：「設定 →メタオブジェクト→
  ○○→フィールドを追加」のように毎回フルパスで書く）。
- コード変更は基本的にこのリポジトリにコミット・プッシュしてから、
  Shopifyへの反映手順（貼り替え先ファイル名・貼り替え方法）を案内する
  運用で進めてきた（`git push -u origin claude/thread-migration-qlsyoe`）。
- ユーザーは「運用でカバーする」提案（数字を覚える、Excelで管理する等）を
  好まない傾向がある。可能な限り、Shopify標準機能（ドラッグ並び替え、
  フィルタリング設定等）や自動化で「覚えなくても済む」仕組みを優先して
  提案すること。
- ユーザーは通常、送られたファイルをすぐには貼り替えず、後でまとめて
  作業することがある。「まだ直っていない」という報告を受けたら、
  まず「最新版を貼り替え済みか」を確認してから調査すること
  （ただし決めつけて何度も同じ質問を繰り返すと不満を招くため、
  9-3節の客観的診断手段も併用するバランスが必要）。

## 11. 衣装（ドレス）関連ページの調査結果とHIS WEDDING紹介ページ（2026-07-24）

### 11-1. 衣装まわりのページ構成が判明

以前は「ドレス一覧・ドレス診断の実コードが不明」という状態だったが、
このセッションでユーザーから実ファイルの提示を受け、以下が判明した
（いずれもリポジトリに同期済み）。

| URL | テンプレート | セクション | 役割 |
|---|---|---|---|
| `/pages/dress`（想定） | `page.dress.json` | `dress-lp` (`sections/dresslp.liquid`) | 衣装ブランドの紹介LP。ヒーロー/About/特徴/ギャラリー2枚/流れ/CTA＋店舗一覧 |
| `/pages/dress-tuxedo` | `page.dresslp.json` | `custom-collection-lp` (`sections/custom-collection-lp.liquid`) | **実際の衣装一覧ページ**。`gallery_grid`ブロックがShopifyコレクションから商品を自動取得しグリッド表示 |
| `/pages/wedding-dress-diagnosis` | `page.weddingdress.json` | `custom-liquid`（インラインJS） | ドレス診断。`shop.metaobjects.dress_diagnostic_data`からデータ取得 |
| `/products/xxx`（例：HIVER） | 商品テンプレート | `main-product`（**Dawn標準・無改造**） | 個別ドレスの商品詳細ページ |

### 11-2. 「ドレスの写真を見ても次に進めない」問題の切り分け結果

ユーザー報告：衣装ページで写真を見ても「次に進まない」。調査の結果、
2つの別々の論点があることが分かった。

1. **商品詳細ページ内で写真が複数枚見られない**：
   `mainproduct.liquid`はDawn標準そのまま（無改造）で、コードのバグでは
   ない。**各ドレス商品にまだ写真が1枚しか登録されていないため**、
   Dawn標準のギャラリーが「次の写真」を出しようがない状態
   （商品に2枚目以降の画像を追加すれば自動的に矢印/サムネイルが
   表示される、Shopify標準の仕様）。コード対応不要、データ追加のみで解決。
2. **一覧ページのサムネイルをクリックした後、他のドレスにも移動したい**：
   これは新機能として対応。「クリック→通常通り商品詳細ページへ遷移→
   その詳細ページ内に前後移動の矢印を追加する」という方針で確定
   （途中、逆方向の「その場で拡大表示するライトボックス」案を実装した
   ことがあったが、方針転換により`custom-collection-lp.liquid`は
   通常の`<a href>`リンクに戻し、ライトボックスは削除済み）。

**実装**：`snippets/dress-prev-next-nav.liquid`を新規作成。Dawn標準の
`main-product.liquid`は直接編集せず、商品ページのテーマエディタで
「ブロックを追加→Custom Liquid」から中身をそのまま貼り付けて使う
（安全なアップグレードパス維持のため、ファイル編集ではなくこの方式を
採用）。「次のドレス」の判定は`product.collections.first`（商品が
属する最初のコレクション）の並び順を基準にしている。**未確認**：
実際にテーマエディタへ貼り付けて動作するか、意図した並び順になるか
（複数コレクションに属す商品がある場合は要調整）。

### 11-3. HIS WEDDING紹介ページ（新規、`/pages/about`想定）

ユーザーが競合他社（Watabe Wedding）のLPに似た「about us的」な紹介
ページを求めたことを受け新規作成。**ただし他社の実際の文言は取得
できず**（3節⑯参照）、**構成のみ参考にしてHIS WEDDING向けに独自の
文章で作成**という方針で合意し実装。

途中、TOPページに既にある「撮影地(抜粋)」「ご利用の流れ」「よくある
質問(抜粋)」「おすすめプラン」と内容が重複する構成になっていたため、
ユーザー指摘を受けて削除し、TOPには無い**差別化ポイント・実績・
お客様の声**に絞った最終構成にした。

- ファイル：`sections/his-wedding-intro.liquid` + `templates/page.about.json`
- 最終構成：①ヒーロー ②選ばれる理由（特徴3つ） ③実績バナー
  ④先輩カップルの声（3件） ⑤最後のCTA（撮影地一覧／衣装一覧の2枚）
- **要対応（次スレッドで確認）**：
  - 実績の数字（`stat_number`、現状「500」のプレースホルダー）を実数に差し替え
  - お客様の声3件（現状すべて仮の文章）を実際の声に差し替え
  - 管理画面でページを新規作成し、テーマテンプレートに`page.about`を
    割り当てる作業（まだユーザー側で未実施）
  - `sections/custom-collection-lp.liquid`・`snippets/dress-prev-next-nav.liquid`・
    `sections/his-wedding-intro.liquid`＋`templates/page.about.json`は
    いずれもコードをお渡し済みだが、**ユーザー側でShopify管理画面への
    貼り付けがまだ完了しているか未確認**。

## 12. Destination Order（都市の並び順）修正の確認状況（未確認のまま持ち越し）

3節⑮・4-3節の`.values.first`不具合修正（`for`ループへの置き換え、
コミット`9af4960`）は実装・プッシュ済みだが、**この修正が実際に
表示順を解決したかどうか、ユーザーからの確認をまだ受けていない**。
次スレッドで最優先に確認すること。

---

<details>
<summary>旧版（2026-07-20時点、参考として保持）</summary>

上記の最新版と矛盾する記述が含まれるため、必ず最新版を優先すること。
主な差分：destinations.cssの位置づけ（当時は消失インシデント直後）、
JOSN形式のreasons/schedule/faqs（現在は逆参照メタオブジェクトに刷新済み）、
都市の並び順の概念自体が当時は存在しなかった、等。

（旧本文は分量が多いため、Git履歴の本ファイル旧バージョン、または
このリポジトリのコミット履歴で参照可能。）

</details>
