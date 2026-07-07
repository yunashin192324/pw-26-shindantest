# JOURNAL — HIS World Wedding Web Magazine

This is a from-scratch Online Store 2.0 build for the **JOURNAL** section of
the HIS World Wedding Shopify store. It uses Shopify's standard blog as CMS
but ships fully custom `blog` / `article` templates — none of Shopify's
default blog styling is used. Every visual element reuses the design
system already shipped on the TOP page (`wedding-ec/assets/css/style.css`):
white/black/gold tokens, Cormorant Garamond + Noto Sans JP, `.container`,
`.btn`, `.card`, `.split`, `.geo-block`, `.check-list`, `.accordion`, the
`.reveal` fade-in, etc. `assets/theme.css` / `assets/theme.js` are that
same stylesheet/script, copied verbatim; `assets/journal.css` /
`assets/journal.js` only *add* JOURNAL-specific rules on top.

## Editor workflow (title / eyecatch / body only)

Creating an article only requires the three standard Shopify fields:
**Title**, **Featured image**, **Body (rich text)** — plus the tags field
that already exists on every article, used here for categorisation.

### 1. Category tags (drives the CATEGORY filter and the H2 on filtered pages)
Add one of these tags to the article: `destinations`, `dress`, `travel`,
`stories`. Clicking a category pill on `/journal` links to Shopify's native
`/blogs/journal/tagged/{tag}` route, which pre-filters `blog.articles` —
no custom filtering JS involved.

### 2. Related products (drives "この記事で紹介したプラン")
Add a tag that matches an existing **collection handle** (e.g. `hawaii`,
`danang`, `london`). `article-related-products.liquid` looks for a
collection with that handle and shows its products automatically. If no
tag matches, it falls back to the collection chosen in the section's
theme-editor settings; if that's empty too, the section hides itself.

### 3. Rich content blocks — paste directly into the body
The body field is plain Shopify rich text, but the theme ships CSS for a
few pre-built blocks. Switch the rich text editor to "Show HTML" and paste:

**POINT box** (AIO-friendly bullet summary):
```html
<div class="point-box">
  <p class="point-box-label">POINT</p>
  <ul class="check-list">
    <li>日本から約5時間半</li>
    <li>時差2時間</li>
  </ul>
</div>
```

**GEO facts block** (destination / flight time / time difference / best
season / who it suits — same component used on product pages):
```html
<div class="geo-block">
  <dl class="geo-grid">
    <div class="geo-item"><dt>撮影地情報</dt><dd>…</dd></div>
    <div class="geo-item"><dt>飛行時間</dt><dd>約5時間半</dd></div>
    <div class="geo-item"><dt>時差</dt><dd>2時間</dd></div>
    <div class="geo-item"><dt>ベストシーズン</dt><dd>2〜8月</dd></div>
    <div class="geo-item"><dt>おすすめな人</dt><dd>…</dd></div>
  </dl>
</div>
```

**Comparison table** (AIO-friendly): `<table class="compare-table">…</table>`

**Full-bleed photo** (lets a photo break out of the narrow reading column):
```html
<figure class="breakout"><img src="…" alt="…"><figcaption>…</figcaption></figure>
```

The table of contents on article pages is generated automatically,
client-side, from whatever `<h2>` / `<h3>` headings appear in the body —
editors never maintain it separately.

## Sections

| File | Purpose |
| --- | --- |
| `sections/journal-hero.liquid` | `/journal` hero photo + headline |
| `sections/journal-featured.liquid` | Full-width pickup article (`.split`) |
| `sections/journal-grid.liquid` | Paginated 3/1-col article grid |
| `sections/journal-category.liquid` | Category filter pills |
| `sections/journal-cta.liquid` | Closing CTA (toggle "控えめに表示する" while the catalogue is small) |
| `sections/article-hero.liquid` | Full-bleed article hero + breadcrumb + schema |
| `sections/article-body.liquid` | TOC + rich-text body |
| `sections/article-related-products.liquid` | Tag→collection matched products |
| `sections/article-related-posts.liquid` | Same-category related articles |
| `sections/article-cta.liquid` | Closing consult/shop CTA |

## SEO / AIO / GEO

`snippets/journal-schema.liquid` outputs `Article` + `BreadcrumbList`
JSON-LD on every article. `layout/theme.liquid` sets canonical, OGP and
Twitter Card tags for every page, using the article's own image on
article pages. The POINT box / GEO block / comparison table markup above
exists specifically so AI answer engines and generative search (AIO/GEO)
have short, structured, quotable facts to lift from each article.

## About the `/journal/` URL

The blog in this theme is expected to be created with the handle
**`journal`**, so article URLs are `/blogs/journal/{article-handle}`
(e.g. `/blogs/journal/danang-guide`) out of the box — this part is theme
code and works immediately.

Dropping the `/blogs/` segment entirely to get exactly `/journal/danang-guide`
requires changing the *store's* URL structure for blogs, which is a
Shopify admin/plan-level setting (Shopify Help: "Change the structure of
URLs for products, collections, blog posts, and pages"), not something a
theme can do on its own. That step needs to be done once in the Shopify
admin (or via Shopify support, if not available on the current plan) —
flagging it here since it's outside this theme's code.
