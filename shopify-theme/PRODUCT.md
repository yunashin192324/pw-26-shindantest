# Product pages — HIS World Wedding

A from-scratch Online Store 2.0 build for the destination-plan **Product**
page (`/products/{handle}`), replacing the static LP mockups in
`wedding-ec/products/*.html`. Every section reuses the same design system
already shipped for JOURNAL and the TOP page (`assets/theme.css`: white /
black / gold tokens, Cormorant Garamond + Noto Sans JP, `.hero`, `.card`,
`.split`, `.price-panel`, `.check-list`, `.info-table`, `.geo-block`,
`.accordion`, `.gallery`, `.sticky-cta`, the `.reveal` fade-in, etc.).
`assets/product.css` / `assets/product.js` only *add* the handful of
component patterns the LP mockups didn't already have (horizontal photo
scroll, the Appointo booking panel, the Instagram-style photo grid, the
related-products carousel) — both are loaded only on `template.name ==
'product'` (wired in `layout/theme.liquid`).

## Sections (in page order)

| # | File | Purpose |
| - | --- | --- |
| ① | `sections/product-hero.liquid` | Full-bleed visual, name, catchcopy, price, Appointo CTA, scroll cue |
| — | `sections/product-booking.liquid` | Appointo "buy box" — sits directly under the hero, buy-box position |
| ② | `sections/product-gallery.liquid` | Horizontal-scroll photo gallery |
| ③ | `sections/product-about.liquid` | Plan overview / feature tags |
| ④ | `sections/product-features.liquid` | Icon list of what's included (時間・カット数・レタッチ…) |
| ⑤ | `sections/product-options.liquid` | Add-on option cards |
| ⑥ | `sections/product-schedule.liquid` | Timeline of the shoot day |
| ⑦ | `sections/product-locations.liquid` | Per-spot photo / description / best time |
| ⑧ | `sections/product-attire.liquid` | Dress / tuxedo + fitting guidance |
| ⑨ | `sections/product-customer-photos.liquid` | Instagram-style customer photo grid |
| ⑩ | `sections/product-reviews.liquid` | Judge.me widget |
| ⑪ | `sections/product-faq.liquid` | Accordion FAQ + FAQPage JSON-LD |
| ⑫ | `sections/product-related.liquid` | Product recommendations carousel (Search & Discovery) |
| ⑬ | `sections/product-cta.liquid` | Closing CTA band |

Every section starts with a "表示する" (show/hide) toggle, and every
repeating list (gallery photos, plan-content items, options, schedule
steps, locations, attire photos, customer photos, FAQ) is a theme-editor
**block**, so items can be added / removed / drag-reordered entirely from
Theme Editor — no code changes for day-to-day content edits.

## Adding a new destination (Danang, Hawaii, Paris, …) — no code required

1. **Admin → Products → Add product.** Title = plan name (e.g. "ダナン
   ラグジュアリープラン"), set the price on the default variant, write
   the plan overview in **Description** (used as the ③ fallback body if
   the section's own "本文" field is left blank).
2. Upload photos to **Product media** — the ② gallery section uses these
   directly, in the order set in Admin (drag to reorder there).
3. Add the product to the matching **Collection** (e.g. `danang`) so the
   breadcrumb / Product JSON-LD picks it up automatically.
4. In Admin, on the product, use the **Theme template** dropdown →
   "Create new template" to clone `product.json` into a
   product-specific template (e.g. `product.danang-luxury.json`). This
   is what lets each destination have its *own* schedule / locations /
   FAQ / features while still sharing one theme — no code, no repeated
   section markup.
5. Open that template in **Theme Editor** and fill in each section's
   blocks (features, schedule steps, locations, options, FAQ, etc.).
   Reuse an existing product's template as a starting point via "Copy
   from another template" in the same dropdown to avoid rebuilding
   from scratch each time.
6. Once **Appointo** is installed, open the "予約（Appointo）" section →
   *Add block* → *Apps* → add the Appointo booking block. Until then the
   section shows a lightweight date/time/guests placeholder plus the
   "空き状況を問い合わせる" fallback link (edit its URL in the section
   settings).

## Metafields / Dynamic Source

Any `text`, `richtext` or `image_picker` setting in these sections (the
hero catchcopy, the ③ body copy, feature values, etc.) can be connected
to a product metafield from Theme Editor (the small database icon next to
the field) — this lets a single shared section pull different values per
product without touching the template file. Suggested metafield
definitions to create in **Admin → Settings → Custom data → Products**
(namespace `custom`) if this is worth automating later: `catchcopy`,
`duration`, `retouch`, `hair_makeup`, `delivery_note`. Definitions
themselves are store-level Admin config and aren't part of the theme
code, so they aren't included here.

## Apps

- **Appointo** — see step 6 above. The section's container
  (`.appointo-embed`) carries `data-product-id` / `data-variant-id` in
  case Appointo's block needs them.
- **Judge.me** — `product-reviews.liquid` renders
  `{{ shop.metafields.judgeme.widget }}`, which Judge.me populates
  automatically once installed (its own documented embed method). No
  extra script tags needed.
- **Search & Discovery** — `product-related.liquid` calls Shopify's
  native `routes.product_recommendations_url` endpoint (see
  `assets/product.js`'s `<product-recommendations>` custom element).
  Whatever Search & Discovery is configured to boost/recommend in Admin
  is reflected here automatically.

## SEO / AIO

`snippets/product-schema.liquid` emits `Product` + `BreadcrumbList`
JSON-LD; `product-faq.liquid` emits `FAQPage` JSON-LD from its own
blocks so the two can never drift out of sync. `layout/theme.liquid`
sets canonical / OGP (`og:type: product`, `og:image` from the product's
featured image) / Twitter Card for every product page. Keep FAQ answers
and location descriptions in full sentences (not just keyword fragments)
— that's what AI answer engines and generative search actually lift.

## Collection pages (撮影地一覧)

`templates/collection.json` covers the other end of the funnel — TOP →
**Collection** → Product → Appointo. Sections: `collection-hero`
(breadcrumb + `BreadcrumbList` schema), `collection-features` (why this
destination, icon grid), `collection-products` (pulls straight from
`collection.products` — add a product to the Collection in Admin and it
appears, no theme edit), `collection-season`, `collection-gallery`,
`collection-faq` (+ `FAQPage` schema), `collection-cta`. All reuse
existing `theme.css` components (`.card`, `.trust-item`, `.gallery`,
`.accordion`) — no new CSS needed. Product cards read two optional tags
per product: `人気` shows a gold badge, `即予約` swaps the availability
pill to "即予約できます" (default is "現地確認後ご回答") — set via
Admin → Product → Tags, no code change.

## Not yet covered

- Live app installs (Appointo / Judge.me / Search & Discovery) — the
  theme code is wired for them, but the apps themselves need to be
  installed and configured in this store's Admin.
