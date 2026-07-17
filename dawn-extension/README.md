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
| `templates/product.json` | Templates フォルダに**新規追加** |
| `sections/area-lp.liquid` | Sections フォルダの**既存`area-lp.liquid`を上書き** |

`area-lp.liquid`は**設定・ブロックのID構成を一切変えていません**。
今すでに`page.area-2.json`（ダナン）に入っているデータは、そのまま
何も再入力せずに使えます（実際に、いただいたJSONの全設定・全ブロック
がこの新しいスキーマと100%互換であることを確認済みです）。変更した
のは「プラン」ブロックに「商品」欄を追加したことだけです。

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

## ヘッダー統一について（ご指示：統一したい）

destinations package側の各ページ（撮影地一覧・地域別一覧・都市詳細）
に、専用の「撮影地ヘッダー」「撮影地フッター」セクションが個別に
追加されているのが原因です。**Theme Editor上での操作だけで直せる
可能性が高いです：**

1. 該当ページ（撮影地一覧、地域ページ等）をTheme Editorで開く
2. 左側のセクション一覧から「撮影地ヘッダー」を選択 →「…」→ 削除
3. 同様に「撮影地フッター」も削除
4. 保存して、共通ヘッダー（他のページと同じもの）が表示されるか確認

これで直らない場合（テンプレートJSON側で専用レイアウト
`theme.destinations`のような別レイアウトファイルが指定されている
可能性があります）、`templates/page.destinations.json`
（または該当ページの現在のテンプレートJSON）を共有してください。
`"layout"`の指定を外す形で修正します。

## 確認をお願いしたいこと（再掲）

- ダナンビーチプランの価格：`danang-beachphoto`ページは¥111,000、
  `area-2.json`のプランブロックは¥99,800。どちらが正しいか
- `plan_url`が空欄の「ダナンビーチ＆ダナン市内フォトプラン
  （ダブルカメラマン）」：対応するProductを作成して「商品」欄に
  設定してください
