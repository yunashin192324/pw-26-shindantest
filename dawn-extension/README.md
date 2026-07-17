# dawn-extension — 既存Dawnテーマへの追加分のみ

前回お送りしたzip（独自theme.liquid一式）は**使いません**。実際のストアが
素のDawn＋カスタムセクション方式だったため、方針を変更し、**既存の実装は
そのまま**に、必要な部分だけを追加しています。

## 追加するファイル一覧

| ファイル | 置き場所（テーマのコードエディタ） |
| --- | --- |
| `sections/product-plan.liquid` | Sections フォルダに追加 |
| `templates/product.json` | Templates フォルダに追加 |
| `sections/destinations-index.liquid` | Sections フォルダに追加 |
| `sections/destinations-region.liquid` | Sections フォルダに追加 |
| `sections/destination-detail.liquid` | Sections フォルダに追加 |
| `templates/page.destinations.json` | Templates フォルダに追加 |
| `templates/page.region.json` | Templates フォルダに追加 |
| `templates/page.destination.json` | Templates フォルダに追加 |
| `snippets/destination-card.liquid` | Snippets フォルダに追加 |

他のファイル（ドレスLP、コレクションLP、FAQ、お問い合わせ、
特定商取引法ページ、`collections/dress-wedding`、JOURNAL一式）は
**一切変更していません**。今回のzipには含まれていません。

---

## ① プランページのProduct化（前回分、変更なし）

予約日時選択アプリは「選んだ日時をカートに追加 → Shopify標準チェック
アウトで決済」という仕組みで動きます。ShopifyのPageはカート/チェック
アウトと直接つながらないため、**Product**でないとこの仕組みが機能
しません。

`product-plan.liquid` は「予約（価格パネル）」部分を本物の
`{% raw %}{% form 'product', product %}{% endraw %}` で実装しており、
予約アプリのブロックはTheme Editorの「ブロックを追加 → アプリ」から
このフォームの内側に追加されます。

### カートアイコンについて（ご質問への回答）

**カートアイコンを消したのは問題ありませんでした。今回さらに一歩進めて
「カートページすら経由しない」形にしています。**

`return_to` を `checkout` に変更したので、予約ボタンを押すと
カート追加と同時に、カートページを経由せずShopify標準チェックアウトへ
直接進みます（Amazonの「今すぐ買う」に近い体験）。「フォトウェディングで
カートは変」という違和感の解消と、購入導線が途切れない、を両立させて
います。ヘッダーへのカートアイコン復活は不要です。

### 使い方（ダナン ビーチプランを例に）

1. Admin → 商品 → 商品を追加。名前・価格・タグ`即予約`（有無で「即予約」
   ⇄「リクエスト予約」表示が自動切替）を設定
2. テーマテンプレートで `product` を選択
3. 別プランはAdminの「テーマテンプレートを複製」でコード変更なしに量産

⚠️ **価格の確認をお願いします**：今回の`templates/product.json`には
ダナンビーチプランの価格として **¥111,000**（`danang-beachphoto`ページの
データ）を入れていますが、いただいたエリアLP（`area-2.json`）内の
「プラン一覧」ブロックには同じプランと思われるものが **¥99,800** と
記載されていました。どちらが最新の正しい価格か教えてください。

---

## ② 撮影地一覧のMetaobject化（今回追加分）

「数十〜100以上の撮影地を扱う」というご要望に合わせて、今のダナンの
`area-lp`（Page 1枚を手作業で作る方式）を、**1つのMetaobjectエントリー
から自動でページが生成される方式**に置き換えました。

```
/pages/destinations（撮影地一覧・検索・人気・地域リンク）
  └─ /pages/{region}（地域別一覧、8地域固定）
       └─ /pages/{slug}（撮影地詳細：魅力・撮影スポット・
                          モデルスケジュール・ギャラリー・
                          プラン一覧・FAQ）
```

**詳細な設定手順は `docs/destination-metaobject-setup.md` を参照して
ください。** 要点だけ書くと、Metaobject定義`destination`を1回作成し、
撮影地を1件登録するたびに「Metaobjectへの入力＋Page 1枚作成（テーマ
テンプレート`page.destination`を選択、URLハンドルをslugと一致）」を
繰り返すだけです。コード変更は一切不要です。

### プラン一覧は「手入力」ではなく「実商品への参照」

実は、いただいた`area-2.json`（ダナンのエリアLP）を見ると、既に
「プラン一覧」セクションに`plan`ブロックがあり、
`plan_url: "shopify://products/ダナンフォトウェディング"` のように
**Shopify Productへのリンクが手入力の形で存在していました。**
（前回「エリアページから各プランへの導線が無い」とお伝えしましたが、
誤りでした。訂正します。）

今回のMetaobject版では、この「プラン」を手入力（価格・バッジも含めて
手動）ではなく、Metaobjectの`plans`フィールド（商品参照のリスト）で
**実際のProductを直接選択**する方式にしました。価格・在庫・
即予約／リクエスト予約バッジは常に商品側の実データから自動反映される
ので、値が古くなる心配がありません。①のProduct化と自然につながる
設計です。

---

## いじらなくてよいもの（前回確認済み・変更なし）

| ページ / 機能 | 状態 |
| --- | --- |
| `page.dress.json`（ドレスLP） | そのままでOK。店舗一覧の実データ差し替えのみ推奨 |
| `page.dress-lp.json`（コレクションLP） | そのままでOK |
| `collection.dress-wedding.json` | そのままでOK |
| `page.custom-contact.json` | そのままでOK |
| `page.tokushoho.json` | そのままでOK |
| `page.faq.json` | ほぼOK。「渡航について」カテゴリ追加とプレースホルダー2件の入力を推奨（コード不要） |
| JOURNAL一式 | 実装・実データ確認済み、そのままでOK |
| `page.area-2.json`（ダナンのエリアLP） | 今回のMetaobject版に置き換えるなら、このPageのデータをMetaobjectへ移行後、既存Pageは削除でOK（既存分のコード自体は今回何も変更していません） |

## 見つかった要修正・要確認事項（別途対応推奨）

- **ドレス関連ページのハンドル不一致**：`dress` / `dress-lp` /
  `dress-tuxedo` / `wedding-dress` とファイルごとに参照URLがバラバラ
- **`wedding-dress-diagnosis`ページ**：実在するが中身が空
- **ダナンプランの価格差異**：上記「¥111,000 vs ¥99,800」の確認
- **`plan_url`が空の項目**：`area-2.json`の2件目のプラン
  「ダナンビーチ＆ダナン市内フォトプラン（ダブルカメラマン）」は
  `plan_url`が空欄でした。対応するProductを作成してMetaobjectの
  `plans`に追加してください
