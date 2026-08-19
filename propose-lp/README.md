# 世界のプロポーズプラン — モックアップ

「世界のプロポーズプラン」LP ＋ オンライン予約サイトの、動作するデザインモックアップです。
外部通信は Google Fonts のみ（フォント読込に失敗してもフォールバック書体で表示されます）で、
それ以外は完全にオフラインで動作します。ブラウザで `index.html` を直接開くだけで確認できます。

## ファイル構成

```
propose-lp/
├── index.html            トップページ（LP）
├── location.html          ロケーション詳細（?loc=hawaii などで切替。全10ロケーション共通の1テンプレート）
├── booking.html            予約フロー（LOCATION→PLAN→DATE→TIME→OPTIONS→CUSTOMER→PAYMENT）
└── assets/
    ├── css/propose.css     デザインシステム一式
    └── js/
        ├── propose-data.js       10ロケーション×3プラン×4オプションのデータ（デモ用availabilityは日付から決定的に生成）
        ├── propose.js             LPの共通挙動（ヘッダー、FAQ、リビール演出、目的地グリッドのレンダリング）
        ├── propose-location.js    location.html を ProposeData から描画
        └── propose-booking.js     予約フローのステートマシン（sessionStorageに保存、離脱・再訪でも続きから）
```

## 見る・試す

### PCでオフラインに見る
`index.html` をダブルクリックしてブラウザで開くだけです（`file://` で完結）。ローカルサーバーは不要です。
`location.html?loc=paris` のようにクエリでロケーションを切り替えられます。

### スマートフォンで見る
同じフォルダをスマホのブラウザから開ける場所（社内サーバー、`python3 -m http.server` を立てて同一Wi-Fi内から等）に置くか、
本セッションで発行した Artifact のURLをスマホで開いてください。375〜430px幅を想定して作られています。

## 試してほしい導線

1. トップページ → 「どこで、伝えますか？」の写真をタップ → ロケーション詳細 → 「このプランで予約する」
2. または一番下の固定CTA／「プロポーズを予約する」から直接 `booking.html` へ
3. 予約フローを最後まで進めると、実際の完了画面（予約番号・今後の流れ）が表示されます

## この中で「モック」であることを明示している箇所

- すべての写真：本物の写真素材がまだ無いため、ロケーションごとに色調を変えたグラデーションのプレースホルダーです（右下に小さくロケーション名を表示）。実写に差し替える前提の設計です。
- 予約カレンダーの空き状況：日付から決定的に生成した**デモ表示**です（画面内にもその旨を明記しています）。実際の空き状況は、Shopify側の予約管理（メタオブジェクトの `blocked_dates` / `few_left_dates`）と連動させます。詳細は `/shopify-theme/PROPOSE-README.md` を参照してください。
- 「予約を確定する」：決済は行われません。実際のサイトでは、この操作が Shopify の安全なチェックアウトへの遷移になります（Shopify版の実装は `/shopify-theme/assets/propose-booking.js` を参照）。
- 実績・お客様の声：捏造した数字やレビューは一切含めていません（意図的に入れていません）。実際の実績が確定したら、`shopify-theme/sections/propose-trust.liquid` の設定値として追記してください。

## Shopify本実装との対応

このモックアップは Shopify テーマの設計を先に固めるためのものです。同じ見た目・同じ挙動を Shopify の
無料テーマ機能（Sections / Blocks / Metaobjects / Cart AJAX API）だけで実装したものが `/shopify-theme/` 以下にあります。
データモデル・メタフィールド定義・Cart連携仕様は `/shopify-theme/PROPOSE-README.md` にまとめています。
