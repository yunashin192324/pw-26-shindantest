# Adobe画像編集・技術仕様リファレンス

画像編集機能、生成AI、写真選別、色調補正、ファイル形式、自動化の仕様を検索・比較できる知識データベース（React + TypeScript + Vite）。

## 重要：収録状況

- 基になる元資料（Adobe製品の機能解説文書）の本文は、開発時点（2026-10-21）でリポジトリ・Issue・PR のいずれにも存在しなかった。
- そのため、開発指示書に記載された構成（章・節・機能名・英語名・表の列・図の工程・検査項目など）だけを収録している。各機能の説明文は `null` のままにしてあり、画面では「未記載（元資料本文が未提供）」と表示する。推測では埋めていない。
- 公式資料のリンクは、Web 検索で URL とページ題名を確認できたものだけ。開発環境から Adobe のヘルプサイトへ直接接続できなかったため、ページ本文は未照合（確認状況は「未確認」）。

## 起動

```bash
cd adobe-reference
npm install
npm run dev       # 開発サーバー
npm run build     # 型検査 + 本番ビルド（dist/）
npm run preview   # ビルド結果の確認
npm test          # データ整合性・検索・絞り込みの単体テスト
```

画面遷移はハッシュ（`#/feature/generative-fill` など）で行うため、`dist/` を任意の静的サーバーに置けば動く。

## 元資料が提供されたときの作業

1. `src/data/sourceText.ts` に、各データの `sourceTextKey`（例：`feature:generative-fill`、`section:2-2`、`format:psd`、`automation:resize`）をキーとして原文を貼り付ける。各ページの「元資料の文章」欄と「収録対応表」に反映される。
2. 原文に基づいて `src/data/features.ts` などの各項目（purpose, inputs, …）を埋め、`verificationStatus` の `source-missing` を `source` に改める。
3. `tests/data.test.ts` の「推測で埋めていないこと」の検査は、本文登録済みの項目を除外して動くよう作ってある。

## 構成

```
src/
  data/        types / chapters / features / products / reference（形式・自動化・工程・品質検査）/ officialRefs / sourceText
  utils/       search（全文検索）/ filtering / comparison / coverage（収録対応表）/ navigation / storage / store / provenance
  components/  Layout（ヘッダー・サイドバー・検索欄）/ FeatureParts / Blocks（表・図）/ Buttons / common
  pages/       ホーム、全機能一覧、製品、機能詳細、章、検索、比較、ファイル形式、自動化、作業工程、品質検査、ブックマーク、公式資料・出典、収録対応表、アプリについて
tests/         vitest
```

## ブラウザー内の保存

`localStorage` の `adobe-ref:bookmarks` / `recent` / `compare` / `settings` のみ。サーバーには送信しない。保存できない環境ではブックマークボタンを無効にし、その旨を表示する。
