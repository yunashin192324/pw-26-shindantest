# TOP page and core Pages — HIS World Wedding

Closes the loop on the site-wide flow (`TOP → 撮影地一覧 → 商品ページ →
Appointo → 相談予約`) by porting the remaining `wedding-ec/*.html` pages
(TOP, About, Dress, FAQ) into Shopify OS 2.0, in the same visual language
as `PRODUCT.md`'s product/collection work. Every new section reuses
existing `theme.css` components — no new CSS shipped for this layer.

## Templates

| Template | Renders | Sections |
| --- | --- | --- |
| `templates/index.json` | TOP (`/`) | hero → 人気のプラン → 撮影地から選ぶ → 5つの安心 → ドレス訴求 → 利用の流れ → FAQ抜粋 → CTA |
| `templates/page.about.json` | `/pages/about` | hero → HISについて → フォーシスについて → 大切にしていること → お問い合わせ |
| `templates/page.dress.json` | `/pages/dress` | hero → ブランド紹介 → 試着の安心 → 写真2枚 → 流れ → CTA（概要ページ） |
| `templates/page.dress-gallery.json` | `/pages/dress-gallery` | hero → ドレスの系統（4種、アンカー付き）→ 小物 → タキシード → CTA |
| `templates/page.dress-diagnosis.json` | `/pages/dress-diagnosis` | hero → ドレス診断（3問）→ CTA |
| `templates/page.faq.json` | `/pages/faq` | hero → カテゴリ別FAQ（19問） → CTA |
| `templates/page.diagnosis.json` | `/pages/diagnosis` | hero → 30秒診断（3問、撮影地・プラン向け） → CTA |

Shopify Pages don't pick up `page.<suffix>.json` automatically — after
creating each Page in Admin with the matching **handle** (`about`,
`dress`, `dress-gallery`, `dress-diagnosis`, `faq`, `diagnosis`), open
it and set **Theme template** to the matching `page.*` entry in the
dropdown. This is the same one-click, no-code mechanism `PRODUCT.md`
documents for per-product templates.

## ドレスの3階層構成

```
/pages/dress（概要・衣装会社紹介）
  ├─ /pages/dress-gallery（ドレス画像・小物・タキシード紹介）
  └─ /pages/dress-diagnosis（ドレス診断）
```

Shopify Pagesはフラット（`/pages/{handle}`）なので、URL自体に親子関係
は表現できません。「概要ページの `dress-cta` セクションから2つの子
ページへボタンでリンクする」ことで、この3階層を表現しています。

- `dress-style-gallery.liquid`（`page.dress-gallery.json` の中核）は
  各スタイルのブロックに `id="{{ anchor }}"` を出力するので、
  `/pages/dress-gallery#princess` のように直接ジャンプできます。ドレス
  診断の結果は個別の商品ではなくカタログ内の1着を直接提示するため
  （下記参照）、このアンカーは主に「診断せずにスタイルから探したい」
  導線として使われます。
- 実際のストアには `/pages/wedding-dress-diagnosis` という**既存の
  空ページ**があり（`/pages/dress-diagnosis` は404で存在しない）、この
  ハンドルに合わせるか、Admin側でハンドルを `dress-diagnosis`
  （`dress` / `dress-gallery` と表記を揃えたもの）に変更するかは
  未確定です。本テーマは `page.dress-diagnosis.json` というファイル名
  を採用しているので、後者（ハンドルを `dress-diagnosis` に変更）の方
  が手間がありません。

## ドレス診断（`dress-diagnostic.liquid` + `assets/dress-diagnostic.js`）

固定の「系統4パターンから1つ選ぶ」方式ではなく、**Metaobjectに登録した
実際のドレス全件と、回答の特性（trait）を突き合わせて毎回スコアリング
し、最も一致度の高い1着を提案する**方式（提供いただいた既存実装のロジ
ックをそのまま採用し、デザインのみサイトのトンマナ＝`.diag-*` コンポ
ーネント／`var(--gold)`・`var(--font-serif)` に合わせて再構築）。

### 必要なMetaobject定義（Admin側で1回だけ作成）

**設定 → メタオブジェクト → 定義を追加**、タイプは半角小文字で
`dress_diagnostic_data` としてください（コードが直接この名前を参照す
るため、1文字でも違うと動きません）。フィールド：

| 名前（表示用） | キー（半角） | フィールドの種類 |
|---|---|---|
| 名称 | `name` | 単一行テキスト |
| 対応サイズ | `size` | 単一行テキスト |
| 説明文 | `desc` | 複数行テキスト |
| 画像 | `img` | ファイル（画像を選択） |
| 雰囲気 | `style` | 単一行テキスト（`classic` / `natural` / `modern`） |
| シルエット | `silhouette` | 単一行テキスト（`volume` / `slender`） |
| 首元・袖 | `neck` | 単一行テキスト（`clear` / `sheer` / `sleeves`） |
| 素材・質感 | `fabric` | 単一行テキスト（`lace` / `tulle` / `satin`） |

**コンテンツ → メタオブジェクト → dress_diagnostic_data → エントリー
を追加**で、ドレス1着ごとに上記8項目を入力すると、コード変更なしで
診断対象に追加されます（増減自由）。`style`/`silhouette`/`neck`/
`fabric` の値は、Theme Editorの「診断結果」ブロックではなく**「選択
肢」ブロックの「値」欄**と綴りを一致させる必要があります（`page.dress-
diagnosis.json` に同梱した4問12択はこの表の値と揃えてあります）。

### 撮影地診断との違い

撮影地診断（`page.diagnosis.json` / `diagnosis-quiz.liquid` /
`assets/diagnosis.js`）は「あらかじめ用意した数パターンのどれかを選ぶ」
方式のままです。ドレス診断は商品ではなくMetaobjectのカタログ全件を
対象にした一致度スコアリングという別ロジックのため、あえて
`diagnosis-quiz.liquid` を流用せず、専用のセクション／JSとして独立
させています。両者は見た目（`.diag-*` コンポーネント）だけを共有して
います。

## 30秒診断 (`diagnosis-quiz.liquid` + `assets/diagnosis.js`)

Client-side quiz, no server round-trip. Blocks come in three types,
added in a fixed order in Theme Editor:

1. **「質問」** blocks (one per question — key + question text)
2. **「選択肢」** blocks placed right after their question (2–3 each —
   value / label / optional sub-label)
3. **「診断結果」** blocks, any number — each links a real Shopify
   **product** plus a `result_key` (e.g. `hawaii-premium`)

`diagnosis.js` reads a JSON blob the section embeds (built from the
「診断結果」 blocks, so it's always in sync with real product
price/title/url — no hardcoded product data) and computes the result
key as `<first question's answer>-premium`/`-basic`, bumped to premium
when the `budget` or `priority` answer is `high`/`special`. Ships in
`page.diagnosis.json` with the original 3 questions × 3 options
pre-filled; the 「診断結果」 blocks are intentionally empty until real
destination products exist (same reasoning as `featured-products` /
`collections-grid` below) — add up to 6 (or more, for future
destinations) once products are created, matching `result_key` to each
destination × tier combination.

## New reusable sections

Built once, instantiated multiple times with different settings —
several are shared across TOP, About, Dress and even future pages:

| Section | Reused on |
| --- | --- |
| `page-hero.liquid` | About, Dress, FAQ (breadcrumb + `BreadcrumbList` schema built in) |
| `split-content.liquid` | About story ×2, Dress intro, TOP dress teaser |
| `icon-grid.liquid` | TOP "5つの安心", About "大切にしていること", Dress "試着の安心" |
| `flow-steps.liquid` | TOP "利用の流れ", Dress "試着の流れ" |
| `faq-accordion.liquid` | TOP FAQ excerpt (flat), full FAQ page (category-grouped) — see below |
| `cta-band.liquid` | TOP, Dress, FAQ closing CTAs (up to 3 buttons each) |
| `index-hero.liquid` / `featured-products.liquid` / `collections-grid.liquid` / `contact-cards.liquid` / `image-duo.liquid` | TOP / TOP / TOP / About / Dress (page-specific, single use) |

### `faq-accordion.liquid`'s two block types

Add **"質問" (qa)** blocks for a flat list (used for the TOP page
excerpt). To group questions under category headers (used on the full
FAQ page), add a **"カテゴリ見出し" (category)** block before each run of
qa blocks — the section detects the run and wraps it in its own
`.accordion`. `FAQPage` JSON-LD is built from every qa block regardless
of grouping, so SEO/AIO stays correct either way.

## No-code content wiring

- **TOP "人気のプラン" (`featured-products`)** and **"撮影地から選ぶ"
  (`collections-grid`)** ship with zero blocks in `index.json` because
  they reference actual Products/Collections that don't exist until
  created in Admin. Once destinations and plans exist, add blocks in
  Theme Editor and pick the resource — no code change.
- Product cards read the same `人気` / `即予約` tags documented in
  `PRODUCT.md`'s collection-page section.
- `index-schema.liquid` builds the TOP page's `TravelAgency` JSON-LD
  `areaServed` list from every Collection in the store automatically —
  it doesn't need to be told which destinations exist.

## Still open

- Live app installs (Appointo / Judge.me / Search & Discovery) — store
  Admin configuration, not theme code. See `PRODUCT.md`.
- Actually creating the Products / Collections / Pages in Admin and
  filling in real photos/copy per destination, and then wiring the
  `featured-products` / `collections-grid` / 診断結果 blocks to them.
