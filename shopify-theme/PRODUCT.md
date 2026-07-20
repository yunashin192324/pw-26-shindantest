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
| — | `sections/product-booking.liquid` | Appointo → Shopifyカート → 標準チェックアウトの起点。"buy box", sits directly under the hero |
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
6. Decide the booking type and tag the product accordingly (see
   "予約・決済フロー" below): add the **`即予約`** tag for instant
   booking, or leave it untagged for リクエスト予約. This one tag also
   drives the badge shown on the hero, this section, collection cards,
   featured-plan cards, and the diagnosis result — no separate config.
7. Once **Appointo** is installed, open the "予約（Appointo → カート →
   チェックアウト）" section → *Add block* → *Apps* → add the Appointo
   booking block. Until then the section shows a lightweight
   date/time placeholder plus a working fallback (a real Add to Cart
   button for 即予約 products, an inquiry link for リクエスト予約 ones).

## 予約・決済フロー (booking → payment flow)

```
撮影地一覧（Collection） → 商品ページ（Product） → Appointoで日時選択
  → Shopifyカート → Shopify標準チェックアウト → 決済完了 → 予約確定
```

Appointo owns date/time selection; **Shopify's standard cart and
checkout own payment** — this theme never builds a competing "buy"
mechanism. `product-booking.liquid` wraps everything in a real
`{% form 'product', product %}`, so submitting it is a normal
`/cart/add` request (with `return_to` set to `/cart`), exactly what
Shopify's own Add to Cart button would do. Once Appointo is installed,
its block renders *inside* that same form (via the section's `"@app"`
block slot + `{% render block %}`), so whatever hidden inputs it writes
for the selected date/time are submitted as line-item properties along
with the add-to-cart request — nothing about the standard flow is
overridden or duplicated.

**Two booking types, one tag** (`即予約` on the product):

| | `即予約` tag present | no `即予約` tag (= リクエスト予約) |
| --- | --- | --- |
| Badge | 即予約 | リクエスト予約 |
| `product-booking.liquid` behaviour | Renders the real product form + "カートに追加して予約する" button → `/cart` → checkout → payment → booking confirmed immediately | No competing button rendered by default (Appointo's own "request to book" UI, once installed, submits itself); shows an explanatory note instead — 手配課 confirms availability afterwards, **no customer contact happens** |
| Fallback (Appointo not installed yet) | Working Add to Cart button | Inquiry link (`request_button_label` / `fallback_url` settings) |

Toggle **"このセクション標準のボタンを非表示にする"** in the section
settings once Appointo's own block ships its own submit button, to
avoid a duplicate. The same `即予約` tag is read by
`collection-products.liquid`, `featured-products.liquid`,
`product-hero.liquid` and the diagnosis result blocks, so the badge is
always consistent across every page a plan appears on.

## Cart

`templates/cart.json` + `sections/main-cart.liquid` is a standard
Shopify cart page (quantity update, remove, subtotal, `checkout`
submit button) — the mandatory step between "Appointoで日時選択" and
"Shopify標準チェックアウト". Line-item properties (the 予約タイプ this
theme sets, plus whatever Appointo's block adds for the selected
date/time) are shown under each line item. `sections/header.liquid` now
also has a cart icon with an item-count badge (`routes.cart_url`,
`cart.item_count`) so the cart is reachable from every page.

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

- **Appointo** — see "予約・決済フロー" above. The section's container
  (`.appointo-embed`) carries `data-product-id` / `data-variant-id` in
  case Appointo's block needs them, and for 即予約 products sits inside
  the real product form so the app's date/time selection becomes part
  of the add-to-cart submission.
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
pill to "即予約" (default is "リクエスト予約" — see "予約・決済フロー"
above) — set via Admin → Product → Tags, no code change.

## Not yet covered

- Live app installs (Appointo / Judge.me / Search & Discovery) — the
  theme code is wired for them, but the apps themselves need to be
  installed and configured in this store's Admin.
