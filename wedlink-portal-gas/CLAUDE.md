# WEDLINK 支店ポータル（Google Apps Script）

新郎新婦の海外撮影（フォトウェディング）予約を、日本の手配課（JP）・現地支店（BRANCH）・
日本の店舗（SHOP）の3者で管理するGoogle Apps Script製Webアプリ。単一スプレッドシートを
DBとして使い、`HtmlService`で1画面SPAを配信する。

## ファイル構成

- `Code.gs` — サーバー側ロジック（GASのdoGet/API関数一式）。ヘッダー名ベースでスプレッドシートに
  アクセスする（列の位置ではなく`RESERVATION_HEADERS`内の名前で引く）。
- `Index.html` / `Stylesheet.html` / `JavaScript.html` — クライアント側。`Index.html`が
  `<?!= include('Stylesheet'); ?>` 等でテンプレート合成される。実質1枚のSPA。
- `test/` — `node run_all.js`でサーバー側・監査・画面(jsdom)の3種類をまとめて実行する
  （個別には`node gas_test.js` / `node audit_test.js` / `node ui_test.js`）。
  **機能を変更したら必ずここを更新し、変更後は必ず全種類グリーンにしてからコミットする。**
- `tools/mockup/` — オフラインモックアップのビルドスクリプト（下記参照）。
- `SETUP.md` — 全変更履歴を番号付きセクションで記録した仕様書。**新しい機能変更をしたら
  末尾に新しい番号のセクションを追記する**（これが実質のチェンジログ・詳細仕様）。
  何か「これはどういう仕様だったか」を調べるときはまずここを読む。
- `HANDOVER.md` — 別スレッド・別担当者への引き継ぎ書。「いま何が終わっていて、次に何をすべきか」
  「新規依頼フォームの現在の構造」「落とし穴」「未解決の項目」がまとまっている。
  **セッションを引き継いだら最初にここを読む**（大きな区切りごとに更新すること）。

## 3ロールモデル

- `JP_ROLE`（手配課・日本国内）／`BRANCH_ROLE`（現地支店）／`SHOP_ROLE`（日本の店舗、後発拡張）
- 案件は「STS(JP側)」「STS(支店側)」という2つの独立したステータス列を持ち、
  `STATUS_AUTO_CASCADE`・`applyStatusCascade_`・`applyHopeStatusCascade_`が特定の遷移で
  自動連動させる（例：支店がOK/UCで回答するとJP側にも自動反映、希望日のOKが撮影日FIXへ反映）。
- オプション欄は`OP1`〜`OP5`まであり、案件全体とは別に「OPn STS JP」「OPn STS 支店」を持つ。
  **`isJpStatusField_(field)`は`STS JP`と`OPn STS JP`の両方にマッチする**ため、権限チェックを
  書くときは「案件全体を含むか」「オプションだけか」を`/^OP\d+ STS JP$/`で毎回明示的に
  区別すること（過去に何度もここでスコープを間違えかけた）。
- `BRANCH_EDIT_GATE`は支店が「STS 支店」を編集できる条件（キー＝現在の「STS JP」の値）。
  **`'OK'`はこのオブジェクトのキーに存在しない**＝STS(JP側)がOKの間、支店側は自分の
  STSを編集できずロック表示になる（意図的な仕様。バグではない）。
- 店舗が設定できるSTS(JP側)の許可値は3段階：`SHOP_STATUS_TARGETS`（既定）
  `SHOP_STATUS_TARGETS_FROM_OK`（オプションがOKになった後：CR/FNのみ）
  `SHOP_STATUS_TARGETS_FROM_OK_CASE`（案件全体がOKになった後：CR/FN/DC/PC。RQのみ除外）。
  この3つはCode.gs（`validateFieldPermission_`）とJavaScript.html（`shopStatusCell`）の
  **両方**に同じ分岐があるので、片方だけ直すと画面とサーバーで挙動がずれる。

## 画面まわりの設計（履歴）

- 案件詳細画面はもともとJP/BRANCHが「隠す/表示のタブ切替」、SHOPが「常時スクロール＋
  クイックナビ（押すと該当セクションへスムーズスクロール）」という別方式だったが、
  JP/BRANCHもSHOPと同じスクロール＋クイックナビ形式に統一済み（SETUP.md 項目64）。
  ただし「記入欄」内の日本記入欄／現地記入欄（`jpEntry`/`local`）だけは、手配課・現地支店
  ならではの項目のため今も切替タブ（`.entry-switch-btn`、隠す/表示）として残っている。
  `detailActiveTab`はこの2択の状態だけを持つ（他の全セクションは常時表示）。
- 既存の`ui_test.js`が`data-tab-pane`/`data-tab`属性に依存しているため、表示方式を
  変えてもこれらの属性名は後方互換のため残してある（実体はhidden切替→常時表示に変わった）。
- クイックナビでスクロール移動した先が上部のsticky2段（ヘッダー＋クイックナビ）に隠れない
  よう、スクロール先の要素には`scroll-margin-top`（`.tab-pane`はCSSで一括、`#sec-entry`の
  ようにクラスが無い要素はインラインstyleで）を必ず付けること。
- JP/BRANCHの「プラン・オプション明細」は`<table class="plan-table">`（`.plan-option-card`
  でラップ）で、プラン行＋オプション①〜⑤行を1つの表にまとめ、各行にSTS(JP側)/STS(支店側)を
  列として持つ（SETUP.md 項目65。実際に現場で使っている外部システムの画面に寄せた配色・枠組み）。
- 希望日①〜⑤の一覧は`<details class="hope-collapse">`でふだん折りたたみ、
  「撮影日FIX未確定」または「STS(JP側)がDC」の間だけ自動で開く（SETUP.md 項目66）。

## モックアップのビルド・確認手順

`tools/mockup/`に実物のCode.gs/Index.html/Stylesheet.html/JavaScript.htmlをそのまま
埋め込んだオフラインHTMLを生成するビルドスクリプトがある（**このディレクトリはリポジトリに
コミットされているので、どのセッションからでも動く**。以前はセッションのscratchpadだけに
置いていて、セッションが変わると消えていた）。

```
node tools/mockup/build_offline_mockup.js   # → tools/mockup/dist/WEDLINK-モックアップ_PC用.html
node tools/mockup/build_mobile_artifact.js  # → tools/mockup/dist/wedlink-portal-preview.html
```

`dist/`は`.gitignore`済み（生成物なのでコミットしない）。機能を変更したら必ず両方を
再ビルドし、以下の手順で確認してからユーザーに渡す：

1. 構文チェック：生成HTML内の`<script>`タグを`new Function(...)`に通してエラーが無いか確認
   （embedded scriptはブラウザでしか実行されないため、これをやらないと壊れたまま届けてしまう）
2. Playwrightで実際に開いて操作を確認する。Chromiumは`/opt/pw-browsers/chromium`に
   インストール済み（`playwright install`は不要）。`file://`でPC用HTMLを開き、画面上部の
   ログイン例ボタン（`text=関東手配課`等）をクリック→案件を開く→スクリーンショットを撮って
   `Read`で目視確認、という流れをこのプロジェクトでは一貫して使っている。
3. PC用は`SendUserFile`でユーザーに送付。スマホ用は`Artifact`でPublishする
   （**同じURLに対して`action:"read"`→`action:"publish"`（`url`指定）で更新すること**。
   毎回新規作成すると別のURLになってしまう）。
   現在のスマホ用Artifact URL：`https://claude.ai/code/artifact/b09ea622-77f6-44f2-9e5e-9f4dad6355c0`

### ハマりどころ

- `mockup_core.js`は巨大なテンプレートリテラル（バッククォート文字列）でHTML全体を
  組み立てている。この中でさらにネストした文字列（デモ用のシード値など）にリテラルの
  `\n`を書くと、**外側のテンプレートリテラル自身のエスケープ処理が先に効いてしまい**、
  埋め込み先のスクリプトの中で本物の改行文字になってしまい構文が壊れる。複数項目を
  1つの文字列に詰めたいときは`\n`ではなく全角読点`、`など改行以外の区切り文字を使うこと。

## テスト・コミットの流れ（このリポジトリでの定型）

1. 機能を変更する（Code.gs / Index.html / JavaScript.html / Stylesheet.html）
2. `test/gas_test.js`・`test/ui_test.js`に、その変更を検証する新規チェックを追加する
   （既存のセクション名の連番（U1, U2, ...）に続けて新セクションを足していく形式）
3. `cd test && node run_all.js`を実行し、3種類とも0件失敗になるまで直す
4. `SETUP.md`の末尾に新しい番号のセクションを追記する（何を・なぜ変えたかを日本語で）
5. コミット（日本語の説明的なメッセージ）→ push
6. `tools/mockup/`のビルドスクリプトで両モックアップを再ビルド→構文チェック→Playwrightで
   目視確認→PC用はファイル送付、スマホ用はArtifact再公開
