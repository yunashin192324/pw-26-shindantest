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
| `templates/page.dress.json` | `/pages/dress` | hero → ブランド紹介 → 試着の安心 → 写真2枚 → 流れ → CTA |
| `templates/page.faq.json` | `/pages/faq` | hero → カテゴリ別FAQ（19問） → CTA |

Shopify Pages don't pick up `page.<suffix>.json` automatically — after
creating each Page in Admin with the matching **handle** (`about`,
`dress`, `faq`), open it and set **Theme template** to `page.about` /
`page.dress` / `page.faq` in the dropdown. This is the same one-click,
no-code mechanism `PRODUCT.md` documents for per-product templates.

A `diagnosis` page (30秒診断) is referenced throughout (nav, CTAs) but
isn't part of this delivery — it's a separate interactive quiz feature,
not a content page, and needs its own scoping.

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

- The `diagnosis` (30秒診断) interactive quiz — linked from nav/CTAs
  throughout, but a distinct feature needing its own design pass, not a
  static content page like the others here.
- Live app installs (Appointo / Judge.me / Search & Discovery) — see
  `PRODUCT.md`.
