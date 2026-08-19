# AI Photo Curator — 不具合修正メモ

アップロードされた `App.jsx`（Gemini APIで結婚式・フォトウェディング写真を自動採点・選定するReactアプリ）をレビューし、見つかった不具合を修正しました。

## 修正した不具合

### 1. 「全データ消去」と非同期処理の競合でデータが復活する（重要）
`handleFullReset` は IndexedDB と画面上の `photos` を即座にクリアしますが、その時点でバックグラウンドで走っている
- 写真評価API呼び出し（`handleFiles` 内のループ）
- AI最終選考（`autoSelect`）

は止まらず、完了時に古い結果を `setPhotos` / `savePhotoToDB` で書き戻していました。その結果、消去したはずの写真が消去後に再び画面とDBに「復活」してしまいます。

**修正**: `resetTokenRef` という世代カウンターを追加し、「全データ消去」のたびにインクリメント。`handleFiles` と `autoSelect` は処理開始時にそのトークンを控えておき、完了時にトークンが変わっていたら（＝その間に消去された）結果の書き戻しを行わないようにしました。

### 2. ファイル名の並び替えが自然順になっていない
`a.name.localeCompare(b.name)` は文字列としての辞書順比較のため、`IMG_2.jpg` が `IMG_10.jpg` より後にくるなど番号順が崩れます。このアプリは「ファイル名の順序＝撮影順」を前提に
- 「ファイル名順」ソート機能
- AI最終選考プロンプトに渡す `candidates` の順序（序盤・中盤・終盤からのストーリー性ピック）

を実装しているため、これは見た目のソート崩れだけでなくAIの選考結果の質にも影響する実害あるバグでした。

**修正**: `compareFileNameNatural()` ヘルパーを追加し、`localeCompare(..., { numeric: true })` で数値を考慮した自然順ソートに統一しました。

### 3. 完了写真が0枚でも「AI選考」ボタンが押せる
`doneCount === 0`（全て処理中／全て失敗）の状態でもボタンが有効なままで、押しても `autoSelect` が黙って何もせず終了するため、ユーザーには「反応がない」ように見えていました。

**修正**: ボタンの `disabled` 条件に `doneCount === 0` を追加し、無効時は理由を `title` で表示するようにしました。

### 4. （軽微）AIレスポンスが欠けていた場合に画面全体がクラッシュしうる
`ScoreBadge` が `score.toFixed(1)` を無条件に呼んでいたため、万一 `totalScore` が数値でない場合に例外が発生し、エラーバウンダリがないため写真グリッド全体が描画不能になり得ました。

**修正**: `ScoreBadge` / `CriteriaBar` に数値以外のフォールバック（`0`）を追加し、防御的にしました。

### 5. （`index.html` ビルド版で新規発見・現在は解消）バージョン無指定のCDNで真っ白画面になる
Google Sites埋め込み用に単一HTML化する際、当初は`@babel/standalone`をCDN（バージョン指定なし）から読み込む方式にしていましたが、CDNが配信する最新版（Babel 8系）がJSXを `React.createElement` ではなく `import { jsx as _jsx } from "react/jsx-runtime"` という ES Modules 形式に変換するようになっており、クラシックな `<script>` タグの中では実行できず「Cannot use import statement outside a module」で完全に真っ白な画面のまま止まることを実機検証で確認しました。

**その後**: 会社のセキュリティポリシー上そもそも外部CDN（unpkg.com / cdn.tailwindcss.com / cdnjs.cloudflare.com）が使えないことが判明したため、下記「完全オフライン同梱ビルド」に全面的に作り直し、この問題ごと解消しています（JSXはビルド時に事前コンパイルするため、ブラウザ上でのBabel変換自体が不要になりました）。

---

## さらなる改善提案

1. **`CRITERIA` の `weight`（重み）が実際には使われていない**
   `location`, `composition` などに `weight: 2` 等が定義されていますが、`totalScore` はAIが独自に返す値をそのまま信頼しているだけで、この重みを使ってアプリ側で再計算する処理がどこにもありません。設計意図通りに「重み付き合計」をアプリ側でも検証・再計算するか、不要ならフィールド自体を削除するのが良いと思います。

2. ~~**APIキーが空文字列 (`apiKey = ""`)**~~ → **対応済み**。会社利用の要望を受け、`index.html` はGemini APIキーを一切持たず、Google Apps Scriptのプロキシ（`apps-script/Code.gs`）経由でAPIキーをサーバー側に隠す構成に変更しました。詳細は下記「Apps Scriptプロキシのセットアップ」を参照してください。

3. **写真の削除（個別）ができない**
   誤ってアップロードした写真を1枚だけ取り除く手段がなく、「全データ消去」しかありません。サムネイルにホバーで削除ボタンを出すなど、個別削除機能があると実用性が上がります。

4. **`handleFiles` を複数回連続で呼ぶと同時実行数の上限（poolLimit=3）が呼び出しごとにリセットされる**
   ドラッグ＆ドロップやファイル選択を短時間に複数回行うと、それぞれの呼び出しが独立して最大3並列で走るため、合計で6並列・9並列…とAPIへの同時リクエスト数が増えていきます。グローバルなセマフォ（例: 全体で同時3件まで）にすると、APIレート制限に対して安全になります。

5. **AIの選考理由 (`reasoning`) が `console.log` にしか出ない**
   `autoSelect` 成功時にAIがなぜその写真を選んだかの説明を取得していますが、コンソールログのみでUIには表示されません。選考結果の横に「AIの選定理由を見る」的なパネルを出すとユーザーの納得感が上がりそうです。

6. **アップロード時のファイルサイズ／枚数の上限チェックがない**
   大量・大容量の画像を一度にドロップすると、IndexedDBの容量やAPIコストの面で問題になり得ます。事前に警告するか、上限を設けることを検討してください。

---

## `index.html`（Google Sites 埋め込み用・完全オフライン同梱ビルド）

**会社のセキュリティポリシーで「Google関連サービス以外は使用不可」という制約があるため、`index.html` はページの表示に外部CDNを一切使いません。** React・ReactDOM・JSZip・Tailwind CSS（実際に使われているクラスのみ）はすべてビルド時にこのファイルの中へ埋め込み済みで、JSXも事前にプレーンなJavaScriptへコンパイル済みです。ブラウザがページを開いた時点で発生する外部通信はゼロです。

**唯一発生する外部通信は、ボタン操作でAIを呼び出すときの Google Apps Script（`.../macros/s/.../exec`, script.google.comドメイン）へのfetchだけ**で、そこからGemini API（`generativelanguage.googleapis.com`）を呼ぶのもApps Script側（サーバー間通信）です。ブラウザが直接Gemini APIやunpkg.com・cdnjs.cloudflare.com等の非Googleドメインと通信することは一切ありません。

```
[ブラウザ (index.html・外部CDN不使用)]
        │ fetch (Googleドメインのみ)
        ▼
[Apps Script プロキシ (script.google.com・会社アカウントで実行)]
        │ サーバー間通信
        ▼
[Gemini API (generativelanguage.googleapis.com・Google純正)]
```

**会社での利用を想定し、`index.html` はGemini APIキーを一切持ちません。** 代わりに `apps-script/Code.gs` を Google Apps Script のWebアプリとしてデプロイし、APIキーはそちら側の「スクリプトのプロパティ」にだけ保存します。ブラウザは常にこのApps Scriptを経由してGeminiを呼び出すため、ページのソースを見てもAPIキーは一切出てきません。

### リポジトリ構成
| ファイル | 役割 |
|---|---|
| `src/app-source.jsx` | **編集する時はここ**。アプリ本体のJSXソース（人が読み書きする唯一の場所） |
| `build.js` / `package.json` / `tailwind.config.js` | `src/app-source.jsx` から `index.html` を生成するビルド一式 |
| `index.html` | **`npm run build` の自動生成物**。Google Sitesに埋め込む実体はこれ。直接編集しない |
| `apps-script/Code.gs` | Gemini APIキーを隠すApps Scriptプロキシ |
| `App.jsx` | 当初の不具合修正版（bundler前提のReactコンポーネント単体）。参考用・現在は未使用 |

コードの挙動を変更したい場合は `src/app-source.jsx` を編集し、`ai-photo-curator/` ディレクトリで次を実行して `index.html` を再生成してください（要 Node.js / npm）。
```bash
npm install   # 初回のみ
npm run build
```

### 手順①: Apps Scriptプロキシをデプロイする

1. [script.google.com](https://script.google.com/) を開き、「新しいプロジェクト」を作成（社用のGoogleアカウントで）。
2. デフォルトの `Code.gs` の中身を全て削除し、このリポジトリの `apps-script/Code.gs` の内容を貼り付ける。
3. 左メニューの歯車アイコン「プロジェクトの設定」→「スクリプト プロパティ」→「スクリプト プロパティを追加」で、次を登録:
   - `GEMINI_API_KEY` … [Google AI Studio](https://aistudio.google.com/apikey) で発行したAPIキー
   - `SHARED_SECRET`（任意・推奨）… 好きな合言葉文字列。設定すると、この文字列を知らない相手はプロキシURLを知っていても呼び出せなくなる、追加の防御になります。
4. 右上「デプロイ」→「新しいデプロイ」→ 種類の選択で歯車アイコンから「ウェブアプリ」を選択。
   - **実行するユーザー**: 自分（Me）
   - **アクセスできるユーザー**: 会社のGoogle Workspaceなら **「〇〇（組織名）内のユーザー」を強く推奨**（ログイン中の社員だけが呼び出せる＝実質、社外からは使えなくなります）。この選択肢が出ない個人アカウントの場合は「全員」を選ばざるを得ませんが、その場合は手順3の `SHARED_SECRET` を必ず設定してください。
5. 「デプロイ」をクリックし、承認を求められたら自分のアカウントで許可。発行された **ウェブアプリのURL**（`.../exec` で終わるもの）をコピーしておく。
6. **Code.gsを後から編集した場合**は、保存しただけでは公開URLに反映されません。「デプロイを管理」→ 対象デプロイの鉛筆アイコン →「新しいバージョン」を選んで再デプロイしてください（Apps Scriptあるあるの落とし穴です）。

### 手順②: プロキシURLを設定して `index.html` を再ビルドする

`src/app-source.jsx` 冒頭付近にある以下の定数を書き換えます（**`index.html` を直接編集しないでください**。ビルドで上書きされます）。

```js
const PROXY_URL = "ここにApps ScriptのWebアプリURLを貼り付け"; // 手順①で発行されたURL
const PROXY_SHARED_SECRET = ""; // 手順①でSHARED_SECRETを設定した場合は同じ文字列を入れる
```

書き換えたら、`ai-photo-curator/` ディレクトリで再ビルドして `index.html` に反映させます。
```bash
npm install   # 初回のみ
npm run build
```
> Node.js/npmが手元にない環境の場合は、私（Claude）にPROXY_URLを伝えていただければ、代わりにビルドして`index.html`を更新できます。

### 手順③: `index.html` をホスティングする

Google Sites自体はHTMLファイルを直接アップロードできないため、`index.html` をどこかの公開URLに置く必要があります。候補:
- GitHub Pages（このリポジトリの `ai-photo-curator/` フォルダをそのまま公開する等）
- Firebase Hosting
- 別のApps ScriptをWebアプリとして公開し、`doGet` で `index.html` のHTML文字列を返す

### 手順④: Google Sitesに埋め込む

Google Sitesの編集画面で「挿入」→「埋め込み」→「埋め込みコード」を選び、次のようなiframeタグを貼り付けます（URLは手順③で発行された公開URLに置き換えてください）。
```html
<iframe src="https://your-hosting-url/index.html" style="width:100%; height:900px; border:0;"></iframe>
```
高さはお好みで調整してください（写真一覧が縦に伸びるため900px以上を推奨）。

### 既知の制約
- **APIキーの請求責任は依然として会社のGoogle Cloudプロジェクトにあります。** プロキシ化によって「キーが漏れて誰でも使い放題」というリスクはなくなりますが、社内の利用量自体（Gemini API呼び出し回数）に応じた課金は発生します。アクセス制御を「組織内のユーザー」にしておけば、少なくとも社外からの不正利用は防げます。
- **Apps ScriptのWebアプリはCORSのプリフライト(OPTIONS)に正しく応答できない**という既知の制約があるため、`index.html` 側は意図的に `Content-Type: text/plain` でPOSTしてプリフライトを回避しています（本文は引き続きJSON文字列です）。この構成自体を変更する必要はありませんが、もし将来手を入れる場合はご注意ください。
- **Apps ScriptのWebアプリは無料利用枠に1日あたりの実行回数上限があります**（Google Workspaceの契約種別により変動）。大量の写真を毎日処理するような使い方だと上限に達する可能性があるため、様子を見ながら運用してください。
- **`index.html` はビルド生成物（約310KB）です。** `src/app-source.jsx` を直接編集しても `npm run build` を実行するまで反映されません。逆に `index.html` を直接編集しても、次にビルドし直すと上書きされて消えます。
- **IndexedDBによる自動保存はブラウザのタブ内ローカルストレージ**です。Google Sitesにiframeとして埋め込むと「サードパーティコンテキスト」になるため、ブラウザ（特にSafariやプライバシー設定を厳しくしたブラウザ）によってはストレージが分離・制限され、期待通りに保存が効かない場合があります。重要なデータは都度ZIPでダウンロードして保存する運用を推奨します。
- **この `apps-script/Code.gs` は実際にApps Scriptへデプロイしての動作確認はできていません**（このセッションの環境からはApps Scriptプロジェクトを作成・デプロイできないため）。doPost + ContentService + text/plain送信によるCORS回避は広く使われている実績のあるパターンですが、実際にデプロイした際にCORSエラー等が出た場合は、アクセス権限の設定やデプロイURLが最新版になっているか（手順①-6）をまずご確認ください。
- 一方、**`index.html` 自体（外部CDN不使用・完全オフライン同梱）は、このリポジトリ内で `npm run build` → 実ブラウザ（Playwright）でのレンダリング・ファイルアップロード・エラー表示まで実機検証済み**です。ページ読み込み時に発生する外部通信がゼロであること（DevTools/Playwrightのネットワークログで確認）、TailwindのスタイルやReact/JSZipが正しく動作することを確認しています。
