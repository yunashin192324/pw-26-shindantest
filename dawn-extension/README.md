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

## 確認をお願いしたいこと（再掲）

- ダナンビーチプランの価格：`danang-beachphoto`ページは¥111,000、
  `area-2.json`のプランブロックは¥99,800。どちらが正しいか
- `plan_url`が空欄の「ダナンビーチ＆ダナン市内フォトプラン
  （ダブルカメラマン）」：対応するProductを作成して「商品」欄に
  設定してください
