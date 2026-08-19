/* =====================================================================
   propose-location.js — renders location.html from ?loc=<id> using the
   single shared template + ProposeData. Ten locations, one template —
   adding an eleventh is a data entry, not a new page.
   In the Shopify build this same job is done by
   sections/propose-location-detail.liquid reading page metafields.
   ===================================================================== */
(function () {
  "use strict";
  var D = window.ProposeData;
  var root = document.getElementById("loc-hero");
  if (!D || !root) return;

  var id = new URLSearchParams(window.location.search).get("loc") || "hawaii";
  var l = D.getLocation(id) || D.locations[0];

  document.title = l.name + "（" + l.nameJa + "）でプロポーズ｜世界のプロポーズプラン";
  var metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", l.nameJa + "でプロポーズするための撮影付きプラン。" + l.lede + " " + D.formatYen(l.fromPrice) + "〜、その場でオンライン予約できます。");

  function paint(hue) { return 'data-hue="' + hue[0] + "," + hue[1] + '"'; }

  document.getElementById("breadcrumb").innerHTML =
    '<a href="index.html">TOP</a> ／ <a href="index.html#destinations">DESTINATIONS</a> ／ ' + l.name;

  document.getElementById("loc-hero").innerHTML =
    '<div class="ph" ' + paint(l.hue) + ' data-label="' + l.name + '"></div>' +
    '<div class="hero-scrim"></div>' +
    '<div class="loc-hero-copy"><span class="eyebrow">' + (l.popular ? "POPULAR DESTINATION" : "DESTINATION") + '</span>' +
    "<h1>" + l.name + '<br><span style="font-size:.6em;">' + l.nameJa + "</span></h1></div>";

  document.getElementById("loc-lede").textContent = l.lede;

  document.getElementById("loc-gallery").innerHTML =
    '<div class="ph" ' + paint(l.hue) + ' data-label="' + l.name + ' 1"></div>' +
    '<div class="ph" ' + paint([l.hue[1], l.hue[0]]) + ' data-label="' + l.name + ' 2"></div>' +
    '<div class="ph" ' + paint(l.hue) + ' data-label="' + l.name + ' 3"></div>' +
    '<div class="ph" ' + paint([l.hue[1], l.hue[0]]) + ' data-label="' + l.name + ' 4"></div>' +
    '<div class="ph" ' + paint(l.hue) + ' data-label="' + l.name + ' 5"></div>';

  document.getElementById("loc-plans").innerHTML = l.plans.map(function (p, i) {
    return (
      '<div class="plan-card' + (i === 1 ? " is-featured" : "") + '">' +
      '<span class="plan-name">' + p.name + '</span>' +
      '<span class="plan-price">' + D.formatYen(p.price) + "</span>" +
      "<ul>" + p.includes.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>" +
      '<a class="btn btn-outline btn-block" href="booking.html?loc=' + l.id + "&plan=" + p.id + '">このプランで予約する</a>' +
      "</div>"
    );
  }).join("");

  document.getElementById("loc-info").innerHTML =
    "<tr><th>集合場所</th><td>" + l.meetingPoint + "</td></tr>" +
    "<tr><th>所要時間</th><td>" + l.duration + "</td></tr>" +
    "<tr><th>料金</th><td>" + D.formatYen(l.fromPrice) + "〜（プランにより異なります）</td></tr>";

  document.querySelectorAll(".booking-cta-final, .mobile-cta a, .hero-cta").forEach(function (a) {
    if (a.tagName === "A") a.href = "booking.html?loc=" + l.id;
  });

  // JSON-LD Product + Breadcrumb schema for this location.
  var ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: l.name + " プロポーズプラン",
    description: l.lede,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "JPY",
      lowPrice: l.fromPrice,
      highPrice: l.plans[l.plans.length - 1].price,
      offerCount: l.plans.length
    }
  });
  document.head.appendChild(ld);
})();
