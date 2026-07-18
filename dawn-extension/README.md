# dawn-extension — 既存Dawnテーマへの追加分のみ

独自theme.liquid一式は使いません。実際のストアが素のDawn＋カスタム
セクション方式だったため、**既存の実装（destinations packageを含む）
はそのまま**に、必要な部分だけを追加・修正しています。

前回の`destinations-index.liquid`／`destinations-region.liquid`／
`destination-detail.liquid`とその関連テンプレートは**破棄しました**
（destinations packageの方をベースに進める、というご指示のため）。

## 追加・上書きするファイル一覧

| ファイル | 対応 |
| --- | --- |
| `sections/product-plan.liquid` | Sections フォルダに**新規追加** |
| `templates/product.location-plan.json` | Templates フォルダに**新規追加**（既存の`product.json`・`product.plan.json`とは別名なので、どちらも上書きしません） |
| `sections/area-lp.liquid` | Sections フォルダの**既存`area-lp.liquid`を上書き** |
| `templates/page.destinations.json` | Templates フォルダの**既存ファイルを上書き** |
| `templates/page.region.json` | Templates フォルダの**既存ファイルを上書き** |
| `templates/page.destination.json` | Templates フォルダの**既存ファイルを上書き**（未使用なら新規追加でも可） |
| `sections/destinations-hero.liquid` | Sections フォルダの**既存ファイルを上書き** |
| `sections/region-hero.liquid` | Sections フォルダの**既存ファイルを上書き** |
| `sections/destination-hero.liquid` | Sections フォルダの**既存ファイルを上書き** |
| `sections/destinations-cta.liquid` | Sections フォルダの**既存ファイルを上書き** |
| `sections/destination-reasons.liquid` | Sections フォルダに**新規追加** |
| `sections/destination-schedule.liquid` | Sections フォルダに**新規追加** |
| `sections/destination-gallery.liquid` | Sections フォルダに**新規追加** |
| `assets/destinations-additions.css` | 既存の`assets/destinations.css`の**末尾に追記**（新規ファイルとして追加ではありません） |

`area-lp.liquid`は**設定・ブロックのID構成を一切変えていません**。
今すでに`page.area-2.json`（ダナン）に入っているデータは、そのまま
何も再入力せずに使えます（実際に、いただいたJSONの全設定・全ブロック
がこの新しいスキーマと100%互換であることを確認済みです）。変更した
のは「プラン」ブロックに「商品」欄を追加したことだけです。

`page.destinations.json`／`page.region.json`／`page.destination.json`の
中の`sections`・`order`（＝入力済みのコンテンツ設定）は一切変えて
いません。変えたのはファイル冒頭の`"layout"`指定を削除しただけです。
`destinations-hero.liquid`等4ファイルも、元のマークアップ・スキーマは
そのまま、冒頭に数行追加しただけです（詳細は次項）。

---

## ① プランのProduct化（前回分）

予約日時選択アプリを使うにはShopify Productである必要があるため、
プラン単位のLPを`product-plan.liquid`としてProduct化しています。
予約ボタンはカートページを経由せず直接Shopify標準チェックアウトへ
進みます（`return_to: checkout`）。ヘッダーのカートアイコンは不要です。

## ② area-lp.liquidの「プラン」ブロックに商品連携を追加（今回分）

いただいた実際のセクションコード（`danang-beach-plan`セクション）と
`page.area-2.json`を拝見し、**設定・ブロックのID構成を完全に保った
まま**、Tailwind／Dawn変数の技術構成はそのまま踏襲して再構築しました。

「プラン」ブロックだけ、新しく**「商品」欄（Shopify Product選択）**を
追加しています。

- **商品を選んだ場合**：プラン名・説明・価格・画像・リンク先・
  即予約バッジは、すべてその商品の実データから自動取得されます
  （`plan_url`に`shopify://products/...`と手入力する必要がなくなり、
  価格が変わっても商品側を直せば自動で反映されます）
- **商品を選ばなかった場合**：今まで通り、手入力した
  title/desc/price/plan_url等がそのまま使われます（後方互換）

つまり、既存の`plan_CezWBX`（ダナンビーチプラン）は「商品」欄が空欄の
ままなので今まで通り表示されます。①で作った`product-plan.liquid`で
実際にProductを作ったら、この「商品」欄で選ぶだけで実データ連携に
切り替えられます。

## ヘッダー統一について（ご指示：統一したい）→ 今回コードで解決しました

原因を特定しました。「撮影地ヘッダー」「撮影地フッター」は普通の
セクションではなく、`layout/theme.destinations.liquid`という
**site全体とは別の独立したレイアウトファイル**に直接組み込まれて
いました（`page.destinations.json`・`page.region.json`・
`page.destination.json`の`"layout": "theme.destinations"`という
指定が原因）。この形は**Theme Editorの「セクションを削除」操作では
外せません**（レイアウトファイルに直書きされているため）。前回お伝え
した「Theme Editorで削除するだけで直る可能性が高い」はこの調査の
結果、誤りでした。訂正します。

そこで今回、コードで対応しました。

1. 3つのテンプレートJSONから`"layout": "theme.destinations"`の指定を
   削除 → 通常の共通レイアウト（他のページと同じヘッダー・フッター）
   で表示されるようになります
2. 独自レイアウトの`<head>`で読み込んでいた専用CSS/JS
   （`destinations.css`／`destinations.js`）と、CSSが依存している
   `.destinations-scope`という囲みは、各ページの先頭セクション
   （`destinations-hero.liquid`／`region-hero.liquid`／
   `destination-hero.liquid`）と最後の`destinations-cta.liquid`で
   代わりに読み込む形に変更し、見た目（デザイン）は変えていません

**やること**：上の一覧にある8ファイルをそれぞれ上書きするだけです。
`destinations.css`／`destinations.js`はすでにアセットとして
アップロード済みのはずなので、そちらは触らなくて大丈夫です。
`sections/destinations-header.liquid`・`destinations-footer.liquid`・
`layout/theme.destinations.liquid`はもう使われなくなりますが、
残しておいても害はありません（削除は任意です）。

## テーマチェックのエラー修正（今回分）

VS Codeのtheme-check拡張機能で指摘いただいたエラーはすべて修正済みです。

- `product-plan.liquid`：`{% assign x = a contains b %}`のような比較演算を
  `assign`の右辺に直接書く書き方と、`{% for line in list | split: ... %}`の
  ようにfor文の対象に直接フィルターをかける書き方は、Shopifyの新しい
  strictパーサーでは許可されていません。それぞれ「先に`if`で判定してから
  真偽値を代入」「先に`assign`でフィルター済みの配列を作ってからfor文に渡す」
  という書き方に直しました。また`"@app"`ブロックには`"name"`を付けられない
  仕様のため削除、`max_blocks`は上限の50に修正しました
- `area-lp.liquid`：同じく`assign`内の比較演算を`if`判定に直しました

これらは見た目やロジックには影響しない書き方の修正のみです。

## ③ 都市詳細ページをMetaobject駆動の共通テンプレートに拡張 → **見送り、area-lp方式を継続**

検討の結果、**現時点では対応不要と判断しました。** 理由：都市が増えても
プラン（商品）はテンプレート複製と無関係にいつでも追加できるため、
実質的なメリットは「あとで全都市のデザイン・構成を一括で直したくなった
時」に限られる一方、今回の実装は理由・スケジュール・FAQ欄がJSON手入力
になり、Theme Editorのブロック編集より日常運用がむしろ煩雑になる
面があった。当面は数都市〜十数都市規模のため、**今まで通り
`area-lp.liquid`のテンプレート複製方式（各都市ごとにページ複製→
中身編集、プランはブロックの「商品」欄で個別リンク）を継続**します。

以下③の内容（`destination-reasons.liquid`等）はコードとして残して
いますが、**今は適用しないでください。** 将来的に本当に100都市規模に
近づいたタイミングで、JSON手入力ではなくもっと入力しやすい形に作り
直した上で再検討します。

<details>
<summary>③の詳細（参考・現在は未採用）</summary>

「都市が増えるたびにテンプレートを複製しないといけないのは管理が大変」
というご相談を受け、destinations package側の`page.destination.json`
（Metaobject駆動・都市が増えてもテンプレートは1つのまま）を、今の
`area-lp.liquid`（ダナン）と同じ内容が表示できるように拡張しました。

追加したセクション3つ：

- `destination-reasons.liquid`：選ばれる理由（Metaobjectの`reasons`
  フィールド、JSON形式のリスト）
- `destination-schedule.liquid`：モデルスケジュール（`schedule`
  フィールド、JSON形式のリスト）
- `destination-gallery.liquid`：フォトギャラリー（`gallery_images`
  フィールド、**画像の「リスト」型**。1つの欄で複数枚まとめて
  アップロードできるので、ブロックを1枚ずつ追加する必要がありません）

どれも対応するMetaobjectフィールドが空欄の間は、セクションごと自動的に
非表示になります（既存都市のデータに影響なし）。

**（将来、採用する場合の）やること：**
1. `docs/destinations-metaobject-fields-addition.md`の手順で、
   Destination Metaobject定義に`reasons`／`schedule`／`gallery_images`
   の3フィールドを追加
2. `assets/destinations-additions.css`の中身を、既存の
   `assets/destinations.css`の一番下にコピペで追記
3. 新規セクション3ファイルと、更新した`page.destination.json`を上書き

なお「プラン一覧」（`destination-plans.liquid`、これは既存のままで
変更していません）は、都市の`slug`と同じhandleの**コレクション**に
入っている商品を自動表示する仕組みです。area-lp.liquidのように
ブロックごとに「商品」欄で個別リンクする必要はなく、**コレクションに
商品を追加するだけ**でプランが反映されます。

ダナンを実際にこの新しい仕組みに移行する手順は
`docs/danang-migration-guide.md`にまとめました。本番URLをいきなり
切り替えず、テスト用ページで確認してから切り替える流れにしています。

**繰り返しになりますが、上記は現在未採用です。** 新しい都市は
引き続き`area-lp.liquid`のテンプレート複製方式で追加してください
（手順：Theme Editorで対象都市のページを開く→テンプレート名の
プルダウン→「テンプレートを複製」→新規ページを作成しそのテンプレートを
割り当て→中身を新都市の内容に書き換え。プランは商品を作成して
「プラン」ブロックの「商品」欄でリンクするだけで、テンプレート複製とは
無関係に追加できます）。

</details>

## 確認をお願いしたいこと（再掲）

- ダナンビーチプランの価格：`danang-beachphoto`ページは¥111,000、
  `area-2.json`のプランブロックは¥99,800。どちらが正しいか
- `plan_url`が空欄の「ダナンビーチ＆ダナン市内フォトプラン
  （ダブルカメラマン）」：対応するProductを作成して「商品」欄に
  設定してください
