/* =====================================================================
   app.js — TOP / LOCATION / BOOKING in one document.
   Hash routes keep the browser Back button working and mirror the
   intended Shopify URLs:
     #/                         → /pages/propose
     #/propose/<id>?place=      → /pages/propose/<id>?place=
     #/book?loc=&date=&time=&place=  → /pages/propose-booking?...
     #<section-id>              → TOP, scrolled to that section
   ===================================================================== */
(function () {
  "use strict";
  var D = window.ProposeData;
  var PHOTOS = window.PROPOSE_PHOTOS || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var DOW = ["日", "月", "火", "水", "木", "金", "土"];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function nl2br(s) { return esc(s).replace(/\n/g, "<br>"); }
  function yen(n) { return D.yen(n); }
  function fmtDate(iso, withYear) {
    var d = new Date(iso + "T00:00:00");
    return (withYear ? d.getFullYear() + "年" : "") + (d.getMonth() + 1) + "月" + d.getDate() + "日（" + DOW[d.getDay()] + "）";
  }
  function fmtShort(iso) {
    var d = new Date(iso + "T00:00:00");
    return (d.getMonth() + 1) + "/" + d.getDate() + "（" + DOW[d.getDay()] + "）";
  }
  var STATUS = {
    available: { mark: "◎", ja: "受付中" },
    few: { mark: "△", ja: "残りわずか" },
    soldout: { mark: "×", ja: "受付終了" },
    closed: { mark: "―", ja: "締切" }
  };
  var LEGEND = '<span class="legend"><span><i>◎</i>受付中</span><span><i>△</i>残りわずか</span><span><i>×</i>受付終了</span><span><i>―</i>締切</span></span>';
  var VENUE_NOTE = "※ 会場の使用料や条件は会場ごとに異なるため、確定のご連絡でご案内します。";
  var FEE_TYPES = ["chapel", "church", "restaurant", "hotel"];

  /* ---------------- icons (line, 32px grid) ---------------- */
  var ICONS = {
    beach: '<circle cx="22" cy="9" r="3.6"/><path d="M3 22c3.2-3 6.4-3 9.6 0s6.4 3 9.6 0 6.4-3 9.8 0"/><path d="M3 27c3.2-3 6.4-3 9.6 0s6.4 3 9.6 0 6.4-3 9.8 0"/>',
    chapel: '<path d="M16 2.5v6M13.2 5.3h5.6"/><path d="M8 28V16l8-5.5 8 5.5v12z"/><path d="M13 28v-6.5a3 3 0 0 1 6 0V28"/><path d="M4 28h24"/>',
    church: '<path d="M16 2v5M13.5 4.5h5"/><path d="M12 13l4-6 4 6v15h-8z"/><path d="M12 17H7l-2 3v8h7M20 17h5l2 3v8h-7"/><path d="M14.2 28v-5h3.6v5"/>',
    monument: '<path d="M16 2.5v4"/><path d="M13.5 28 16 6.5 18.5 28"/><path d="M14.6 16.5h2.8M13.9 21h4.2"/><path d="M10 28h12"/>',
    restaurant: '<path d="M8 3v7a3 3 0 0 0 6 0V3M11 3v25"/><path d="M20 3h7l-.9 8a2.6 2.6 0 0 1-5.2 0zM23.5 13.6V28M20 28h7"/>',
    hotel: '<path d="M7 28V5h13v23"/><path d="M20 13h5v15"/><path d="M3 28h26"/><path d="M11 10h1.6M15 10h1.6M11 14.5h1.6M15 14.5h1.6M11 19h1.6M15 19h1.6"/><path d="M12 28v-4h4v4"/>',
  };
  function icon(name) {
    return '<svg class="ic" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || "") + "</svg>";
  }

  /* ---------------- photos ---------------- */
  // Real photo when one exists; otherwise a quiet typographic tile in the
  // destination's colours, captioned so nobody mistakes it for final imagery.
  function photoInner(key, alt, loc, eager) {
    var src = key && PHOTOS[key];
    if (src) {
      return '<img src="' + src + '" alt="' + esc(alt || "") + '" decoding="async"' + (eager ? ' fetchpriority="high"' : "") + ">";
    }
    var hue = loc ? loc.hue : ["#3a4a55", "#c9a88a"];
    return '<div class="ph" style="--c1:' + hue[0] + ";--c2:" + hue[1] + '"><span class="ph-name">' + esc(loc ? loc.name : "") + '</span><span class="ph-soon">写真準備中</span></div>';
  }
  function photo(loc, opts) {
    opts = opts || {};
    var pos = opts.pos || (loc && loc.photoPos) || "50% 50%";
    var cls = "photo" + (opts.reveal ? " reveal-img" : "") + (opts.cls ? " " + opts.cls : "");
    var html = photoInner(loc ? loc.photo : opts.key, opts.alt !== undefined ? opts.alt : (loc && loc.photoAlt), loc, opts.eager);
    return '<div class="' + cls + '" style="--pos:' + pos + '">' + html.replace("<img ", '<img style="object-position:' + pos + '" ') + "</div>";
  }
  function hydrateStaticPhotos(root) {
    $$("[data-photo]", root).forEach(function (el) {
      if (el.dataset.done) return;
      var key = el.dataset.photo;
      var loc = D.getLocation(key);
      var pos = el.dataset.pos || (loc && loc.photoPos) || "50% 50%";
      el.innerHTML = photoInner(key, el.dataset.alt, loc, el.hasAttribute("data-eager")).replace("<img ", '<img style="object-position:' + pos + '" ');
      el.dataset.done = "1";
    });
  }

  /* ---------------- reveal on scroll ---------------- */
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }) : null;
  function observeReveals(root) {
    $$(".reveal:not(.is-in), .reveal-img:not(.is-in)", root).forEach(function (el) {
      if (io) io.observe(el); else el.classList.add("is-in");
    });
  }

  /* ---------------- shared markup ---------------- */
  function faqHTML(items) {
    return items.map(function (f) {
      return '<details><summary><span class="q">Q</span><span>' + esc(f.q) + '</span><span class="pm" aria-hidden="true"></span></summary><div class="a">' + esc(f.a) + "</div></details>";
    }).join("");
  }
  function faqAbout(word) { return D.faq.filter(function (f) { return f.q.indexOf(word) > -1; })[0]; }

  // Plans as one comparison table: a row per plan, a column per thing included, then the price.
  // loc = a destination (its own prices) or null on TOP (lowest per plan, with "〜").
  function planTable(loc) {
    var from = !loc, cols = D.planCols;
    var head = '<tr><th scope="col"><span class="sr-only">プラン</span></th>' + cols.map(function (c) { return '<th scope="col">' + c.label + "</th>"; }).join("") + '<th scope="col">料金</th></tr>';
    var rows = D.planTiers.map(function (t) {
      var price = loc ? loc.plans.filter(function (p) { return p.id === t.id; })[0].price : D.minPrice(t.id);
      return '<tr><th scope="row"><span class="pt-ja">' + t.nameJa.replace(/プラン$/, "") + '</span><span class="pt-en">' + t.name.replace(/ PLAN$/, "") + "</span></th>" +
        cols.map(function (c) {
          return t.has[c.id] ? '<td><span class="yes" aria-hidden="true">✓</span><span class="sr-only">含む</span></td>' : '<td><span class="no" aria-hidden="true">–</span><span class="sr-only">含まない</span></td>';
        }).join("") +
        '<td class="pt-price"><span class="price">' + yen(price) + "</span>" + (from ? "<small>〜</small>" : "") + "</td></tr>";
    }).join("");
    return (
      '<div class="ptable-wrap reveal"><table class="ptable"><caption class="sr-only">' + (loc ? esc(loc.nameJa) + "の" : "") + 'プランの比較表</caption>' +
        '<colgroup><col style="width:35%"><col style="width:8.5%"><col style="width:8.5%"><col style="width:8.5%"><col style="width:8.5%"><col style="width:31%"></colgroup>' +
        "<thead>" + head + "</thead><tbody>" + rows + "</tbody></table></div>" +
      '<ul class="pt-legend reveal">' + cols.map(function (c) { return "<li><b>" + c.label + "</b>" + esc(c.detail) + "</li>"; }).join("") + "</ul>" +
      '<p class="pt-guide reveal">写真や動画を残すなら、スタンダード以上を。花束だけでも、サプライズは成立します。</p>' +
      (from ? '<p class="note">料金は旅行先によって異なります。各旅行先のページで確認できます。</p>' : "")
    );
  }
  function optionsHTML() {
    return (
      '<div class="plan-options reveal"><p class="sub-h">オプション（追加できるもの）</p><div class="opt-list">' +
      D.options.map(function (o) {
        return '<div class="opt-row"><div class="opt-name"><b>' + esc(o.nameJa) + '</b><span class="en-sm">' + esc(o.name) + '</span></div><div class="price">' + yen(o.price) + "</div><p>" + esc(o.desc) + (o.requiresPhoto ? "（写真撮影付きのプランで選べます）" : "") + "</p></div>";
      }).join("") + "</div></div>"
    );
  }

  /* ---- proposal places (beach / chapel / church / monument / restaurant / hotel) ---- */
  function hasPlace(l, type) { return l.placeList.some(function (p) { return p.type === type; }); }
  function placeNames(l) { return l.placeList.map(function (p) { return D.getPlaceType(p.type).ja; }); }
  // The place chosen on a location page travels with every booking link on it.
  var locPlace = "";
  function withPlace(href) {
    href = href.replace(/&place=[^&]*/, "");
    return locPlace ? href + "&place=" + encodeURIComponent(locPlace) : href;
  }
  function applyPlaceToLinks() {
    $$('a[href^="#/book?loc="]').forEach(function (a) { a.setAttribute("href", withPlace(a.getAttribute("href"))); });
  }
  function placeDetail(l) {
    if (!locPlace) return '<p class="pd-hint">まだ選ばなくても大丈夫です。迷ったときは、その日にいちばん合う場所をご案内します。</p>';
    var t = D.getPlaceType(locPlace), p = l.placeList.filter(function (x) { return x.type === locPlace; })[0];
    return '<p class="pd-title"><b>' + t.ja + "</b>で申し込む</p><p>" + esc(t.desc) + "</p>" +
      (p && p.venues.length ? '<p class="place-venues">選べる会場：' + p.venues.map(esc).join("／") + "</p>" : '<p class="place-venues">会場は、ご希望に合わせてご案内します。</p>') +
      (FEE_TYPES.indexOf(locPlace) > -1 ? '<p class="note">' + VENUE_NOTE + "</p>" : "") +
      '<button type="button" class="btn" data-scroll="loc-avail">日程を確認する <span class="arrow" aria-hidden="true">↓</span></button>';
  }
  function placeSection(l) {
    return (
      '<section class="sec sec-deep" id="loc-place" aria-labelledby="l-place"><div class="wrap">' +
        '<div class="sec-head reveal"><span class="label">Place</span><h2 class="h2" id="l-place">' + esc(l.nameJa) + "の、<br class=\"br-sp\">プロポーズ場所を選ぶ。</h2>" +
        '<p class="lede">' + placeNames(l).join("・") + "から選べます。選んだ場所は、そのまま予約に引き継がれます。</p></div>" +
        '<div class="pcards reveal" role="radiogroup" aria-label="プロポーズの場所">' + l.placeList.map(function (p) {
          var t = D.getPlaceType(p.type), on = locPlace === p.type;
          return '<button type="button" role="radio" aria-checked="' + on + '" class="pcard' + (on ? " is-selected" : "") + '" data-place="' + p.type + '">' + icon(p.type) +
            '<span class="tick" aria-hidden="true">✓</span><b>' + t.ja + '</b><span class="en-sm">' + t.en + "</span><p>" + esc(t.desc) + "</p>" +
            (p.venues.length ? '<span class="pv">' + p.venues.map(esc).join("<br>") + "</span>" : "") + "</button>";
        }).join("") + "</div>" +
        '<div class="place-detail" aria-live="polite">' + placeDetail(l) + "</div>" +
      "</div></section>"
    );
  }

  /* =============================================================
     TOP
     ============================================================= */
  var topBuilt = false;
  var pfState = "";

  function destCard(l) {
    var light = l.plans[0], std = l.plans[1] || l.plans[0];
    return (
      '<a class="dest-card reveal" href="#/propose/' + l.id + '" data-dest="' + l.id + '">' +
        photo(l) +
        '<div class="dest-body">' +
          '<div class="dest-name">' + esc(l.name) + "</div>" +
          '<div class="dest-ja">' + esc(l.nameJa) + "</div>" +
          '<div class="dest-places" data-places>' + placeNames(l).join("・") + "</div>" +
          '<div class="dest-match" data-match hidden></div>' +
          '<div class="dest-price"><small>写真付き</small><span class="price">' + yen(std.price) + "</span>〜</div>" +
          '<div class="dest-sub">花束のみ ' + yen(light.price) + "〜</div>" +
          '<span class="dest-more"><span>プランを見る</span><span aria-hidden="true">→</span></span>' +
        "</div>" +
      "</a>"
    );
  }

  function applyFilter() {
    var f = pfState, shown = 0;
    $$("#dest-grid .dest-card").forEach(function (card) {
      var l = D.getLocation(card.dataset.dest);
      var entry = f ? l.placeList.filter(function (p) { return p.type === f; })[0] : null;
      var match = !f || !!entry;
      card.hidden = !match;
      if (match) shown++;
      var m = $("[data-match]", card), pl = $("[data-places]", card);
      if (f && entry) {
        var t = D.getPlaceType(f);
        m.innerHTML = "<b>" + t.ja + "</b>" + (entry.venues.length ? esc(entry.venues.slice(0, 2).join("／")) + (entry.venues.length > 2 ? " ほか" : "") : "");
        m.hidden = false; pl.hidden = true;
      } else { m.hidden = true; pl.hidden = false; }
      card.setAttribute("href", "#/propose/" + l.id + (f ? "?place=" + f : ""));
    });
    $$("#pf .pf-tile").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.pf === f)); });
    var st = $("#pf-status");
    st.innerHTML = f ? "<span><b>" + D.getPlaceType(f).ja + "</b>でプロポーズできる旅行先：" + shown + 'か所</span><button type="button" class="link" data-pf-reset>すべて表示</button>' : "";
    if (f) observeReveals($("#dest-grid"));
  }

  function buildTop() {
    if (topBuilt) return;
    topBuilt = true;
    var view = $("#view-top");

    // Place filter — the way in for people who know where they want to propose, not which city.
    $("#pf").innerHTML =
      '<p class="pf-title" id="pf-title">プロポーズしたい場所は？<small>選ぶと、その場所でできる旅行先だけを表示します（任意）</small></p>' +
      '<div class="pf-tiles" role="group" aria-labelledby="pf-title">' + D.placeTypes.map(function (t) {
        var n = D.locations.filter(function (l) { return hasPlace(l, t.id); }).length;
        return '<button type="button" class="pf-tile" data-pf="' + t.id + '" aria-pressed="false">' + icon(t.id) + "<span>" + t.ja + "</span><small>" + n + "か所</small></button>";
      }).join("") + "</div>" +
      '<p class="pf-status" id="pf-status" aria-live="polite"></p>';
    $("#pf").addEventListener("click", function (e) {
      var t = e.target.closest("[data-pf]"), r = e.target.closest("[data-pf-reset]");
      if (t) { pfState = pfState === t.dataset.pf ? "" : t.dataset.pf; applyFilter(); }
      if (r) { pfState = ""; applyFilter(); }
    });

    $("#dest-grid").innerHTML = D.locations.map(destCard).join("");

    $("#top-steps").innerHTML = D.proposalSteps.map(function (s, i) {
      return '<li class="tl-item' + (i === 3 ? " is-key" : "") + '"><span class="step-no">' + s.no + '</span><h3 class="h3">' + esc(s.title) + "</h3><p>" + esc(s.text) + "</p></li>";
    }).join("");

    $("#top-plan").innerHTML = planTable(null) + optionsHTML();

    var faq = $("#top-faq");
    faq.innerHTML = faqHTML(D.faq.slice(0, 5));
    $("#faq-more").addEventListener("click", function () {
      faq.innerHTML = faqHTML(D.faq);
      this.parentNode.remove();
    });

    $("#ft-dests").innerHTML = D.locations.map(function (l) { return '<a href="#/propose/' + l.id + '">' + esc(l.nameJa) + "でプロポーズ</a>"; }).join("");

    hydrateStaticPhotos(view);
  }

  /* =============================================================
     LOCATION
     ============================================================= */
  function renderLocation(id, q) {
    var l = D.getLocation(id);
    var view = $("#view-location");
    if (!l) { view.innerHTML = '<section class="sec"><div class="wrap"><p>旅行先が見つかりませんでした。</p><a class="link" href="#destinations">旅行先一覧へ</a></div></section>'; return; }

    var light = l.plans[0], std = l.plans[1] || l.plans[0];
    document.title = l.nameJa + "でプロポーズ｜" + placeNames(l).slice(0, 4).join("・") + "から選べる " + yen(light.price) + "〜｜世界のプロポーズプラン";
    var qPlace = q && q.place;
    locPlace = hasPlace(l, qPlace) ? qPlace : "";

    var steps = D.proposalSteps.map(function (s, i) {
      var text = i === 0 ? l.meetingPoint + "で、フォトグラファーがお二人をお迎えします。" : s.text;
      return '<li class="tl-item' + (i === 3 ? " is-key" : "") + '"><span class="step-no">' + s.no + '</span><h3 class="h3">' + esc(s.title) + "</h3><p>" + esc(text) + "</p></li>";
    }).join("");

    var others = D.locations.filter(function (x) { return x.id !== l.id; }).map(function (x) {
      return '<a href="#/propose/' + x.id + '">' + esc(x.nameJa) + "</a>";
    }).join("");

    var faqs = [faqAbout("気づかれ"), { q: "雨が降ったらどうなりますか？", a: l.rainPlan }, faqAbout("すぐに確定"), faqAbout("写真撮影なし"), faqAbout("キャンセル"), faqAbout("指輪や花束")];

    view.innerHTML =
      '<section class="lhero" aria-labelledby="l-title">' +
        photo(l, { eager: true }) +
        '<div class="hero-scrim"></div>' +
        '<p class="crumb"><a href="#/">TOP</a> ／ <a href="#destinations">旅行先</a> ／ ' + esc(l.nameJa) + "</p>" +
        '<div class="lhero-body">' +
          '<span class="label">Propose in ' + esc(l.name.charAt(0) + l.name.slice(1).toLowerCase()) + "</span>" +
          '<p class="lhero-name" aria-hidden="true">' + esc(l.name) + "</p>" +
          '<h1 class="h1" id="l-title">' + nl2br(l.catch) + "</h1>" +
          '<p class="lhero-price"><span>花束のみ <b class="price">' + yen(light.price) + "</b>〜</span><span>写真付き <b class=\"price\">" + yen(std.price) + "</b>〜</span></p>" +
          '<div class="lhero-cta">' +
            '<button class="btn btn-light" data-scroll="loc-place">場所を選ぶ</button>' +
            '<button class="btn btn-line" data-scroll="loc-avail">日程を確認する</button>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="sec" style="padding-bottom:calc(var(--sec) * .5)" aria-labelledby="l-about">' +
        '<div class="wrap">' +
          '<div class="lintro reveal">' +
            '<div><span class="label">About ' + esc(l.name) + '</span><h2 class="h2" id="l-about">' + esc(l.tagline) + "</h2></div>" +
            '<p class="lede" style="margin-top:0">' + esc(l.lede) + "</p>" +
          "</div>" +
          '<p class="note facts-note">※ 料金・受付期限・雨天対応・受付状況はデモ用の仮データです。</p>' +
        "</div>" +
      "</section>" +

      placeSection(l) +

      '<section class="sec" aria-labelledby="l-day">' +
        '<div class="wrap assure-wrap">' +
          '<div class="sec-head reveal"><span class="label">Your Proposal</span><h2 class="h2" id="l-day">' + esc(l.nameJa) + "での、<br class=\"br-sp\">当日の流れ。</h2>" +
          '<p class="lede">' + esc(l.duration) + "。最初は旅の記念撮影として、気づかれないまま、その瞬間へ。</p></div>" +
          "<div>" +
            '<ol class="timeline reveal">' + steps + "</ol>" +
            '<p class="note" style="margin-top:24px">※ 写真撮影付きのプラン（スタンダード・ラグジュアリー）の流れです。ライトプランは撮影がありません。</p>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="sec sec-deep" aria-labelledby="l-plan">' +
        '<div class="wrap">' +
          '<div class="sec-head reveal"><span class="label">Plan</span><h2 class="h2" id="l-plan">' + esc(l.nameJa) + "の、<br class=\"br-sp\">プランと料金。</h2></div>" +
          planTable(l) + optionsHTML() +
        "</div>" +
      "</section>" +

      '<section class="sec" id="loc-avail" aria-labelledby="l-avail">' +
        '<div class="wrap-narrow">' +
          '<div class="sec-head reveal"><span class="label">Availability</span><h2 class="h2" id="l-avail">' + esc(l.nameJa) + "の、<br class=\"br-sp\">日程を確認する。</h2>" +
          '<p class="lede">旅行中の日付を選ぶと、申し込める時間が分かります。</p></div>' +
          '<div class="avail reveal" id="avail"></div>' +
          '<p class="rain-note reveal"><b>雨の日</b>' + esc(l.rainPlan) + "</p>" +
        "</div>" +
      "</section>" +

      '<section class="sec sec-deep" aria-labelledby="l-faq">' +
        '<div class="wrap-narrow">' +
          '<div class="sec-head reveal"><span class="label">FAQ</span><h2 class="h2" id="l-faq">' + esc(l.nameJa) + "のプロポーズ、<br class=\"br-sp\">よくあるご質問</h2></div>" +
          '<div class="faq">' + faqHTML(faqs) + "</div>" +
        "</div>" +
      "</section>" +

      '<section class="final">' + photo(l, { pos: "50% 18%", alt: "" }) +
        '<div class="wrap"><span class="label">Propose in ' + esc(l.name.charAt(0) + l.name.slice(1).toLowerCase()) + '</span><h2 class="h2">あとは、日程を選ぶだけ。</h2>' +
        '<p class="lede">' + esc(l.nameJa) + "のプロポーズ　花束のみ " + yen(light.price) + "〜／写真付き " + yen(std.price) + "〜</p>" +
        '<a class="btn btn-light" href="#/book?loc=' + l.id + '">この場所で予約する <span class="arrow" aria-hidden="true">→</span></a>' +
        '<nav class="ft-links" style="justify-content:center;margin-top:48px" aria-label="ほかの旅行先">' + others + "</nav></div>" +
      "</section>";

    renderAvail(l);
    var cards = $(".pcards", view);
    cards.addEventListener("click", function (e) {
      var c = e.target.closest("[data-place]"); if (!c) return;
      locPlace = locPlace === c.dataset.place ? "" : c.dataset.place;
      $$(".pcard", cards).forEach(function (x) { var on = x.dataset.place === locPlace; x.classList.toggle("is-selected", on); x.setAttribute("aria-checked", String(on)); });
      $(".place-detail", view).innerHTML = placeDetail(l);
      applyPlaceToLinks();
    });
    observeReveals(view);
  }

  // 14-day quick check → pick a slot → jump straight to the next unanswered step in booking.
  function renderAvail(l) {
    var box = $("#avail");
    var start = D.today();
    var days = [];
    for (var i = 0; i < 14; i++) {
      var d = new Date(start); d.setDate(d.getDate() + i);
      days.push(D.isoDate(d));
    }
    var sel = { date: null, time: null };
    var firstOpen = days.filter(function (iso) { var s = D.dateStatus(l, iso); return s === "available" || s === "few"; })[0];
    sel.date = firstOpen || null;

    function draw() {
      var dayBtns = days.map(function (iso) {
        var st = D.dateStatus(l, iso);
        var dt = new Date(iso + "T00:00:00");
        var disabled = st === "soldout" || st === "closed";
        return (
          '<button type="button" class="day-btn is-' + st + (sel.date === iso ? " is-selected" : "") + '" data-date="' + iso + '"' + (disabled ? " disabled" : "") +
          ' aria-label="' + fmtDate(iso) + " " + STATUS[st].ja + '">' +
            '<span class="dw">' + ((iso === days[0] || dt.getDate() === 1) ? (dt.getMonth() + 1) + "月 " : "") + DOW[dt.getDay()] + '</span><span class="dn">' + dt.getDate() + '</span><span class="ds">' + STATUS[st].mark + "</span>" +
          "</button>"
        );
      }).join("");

      var slots = sel.date ? l.timeSlots.map(function (t) {
        var st = D.slotStatus(l, sel.date, t);
        var disabled = st === "soldout" || st === "closed";
        return (
          '<button type="button" class="slot is-' + st + (sel.time === t ? " is-selected" : "") + '" data-time="' + t + '"' + (disabled ? " disabled" : "") + ">" +
            '<span class="t">' + t + "</span>" +
            '<span class="best">' + (t === l.bestTime ? "<b>ベストタイム</b>" + esc(l.bestTimeNote) : "") + "</span>" +
            '<span class="st">' + STATUS[st].ja + "</span>" +
          "</button>"
        );
      }).join("") : '<p class="slots-empty">この先2週間は受付を終了しています。先の日付をご確認ください。</p>';

      var go = sel.date && sel.time
        ? '<p class="avail-pick"><b>' + fmtDate(sel.date) + " " + sel.time + "</b>　受付中</p>" +
          '<a class="btn btn-block" href="#/book?loc=' + l.id + "&date=" + sel.date + "&time=" + sel.time + '">この日時で申し込む <span class="arrow" aria-hidden="true">→</span></a>'
        : '<p class="avail-pick avail-hint">時間を選ぶと、そのまま予約リクエストに進めます。</p>';

      box.innerHTML =
        '<div class="avail-head"><span class="avail-title">今日から14日間</span>' + LEGEND + "</div>" +
        '<div class="days" role="group" aria-label="日付を選ぶ">' + dayBtns + "</div>" +
        (sel.date ? '<p class="note" style="margin-top:16px">' + fmtDate(sel.date) + " の受付状況</p>" : "") +
        '<div class="slots" role="group" aria-label="時間を選ぶ">' + slots + "</div>" +
        '<div class="avail-go">' + go + "</div>" +
        '<div class="avail-more"><a class="link" href="#/book?loc=' + l.id + '">もっと先の日付を見る <span class="arrow" aria-hidden="true">→</span></a></div>';
      applyPlaceToLinks();
    }
    box.addEventListener("click", function (e) {
      var d = e.target.closest(".day-btn:not(:disabled)");
      var t = e.target.closest(".slot:not(:disabled)");
      if (d) { sel.date = d.dataset.date; sel.time = null; draw(); }
      if (t) { sel.time = t.dataset.time; draw(); }
    });
    draw();
  }

  /* =============================================================
     BOOKING
     ============================================================= */
  var STEP_META = {
    location: { ja: "旅行先" },
    date: { ja: "日にち・時間" },
    place: { ja: "場所" },
    plan: { ja: "プラン・オプション" },
    customer: { ja: "お客様情報" },
    confirm: { ja: "リクエスト内容の確認" }
  };
  var bk = null;
  var calOffset = 0;

  function bLoc() { return bk.loc ? D.getLocation(bk.loc) : null; }
  function firstOpenOffset(l) {
    var t = D.today();
    for (var i = 0; i < 180; i++) {
      var d = new Date(t); d.setDate(d.getDate() + i);
      var st = D.dateStatus(l, D.isoDate(d));
      if (st === "available" || st === "few") return (d.getFullYear() - t.getFullYear()) * 12 + d.getMonth() - t.getMonth();
    }
    return 0;
  }
  function bPlan() { var l = bLoc(); return l ? l.plans.filter(function (p) { return p.id === bk.plan; })[0] : null; }
  function optionAvailable(o) { var p = bPlan(); return !o.requiresPhoto || (!!p && p.hasPhoto); }
  function bOptions() { return D.options.filter(function (o) { return bk.options.indexOf(o.id) > -1 && optionAvailable(o); }); }
  function bPlaceEntry() { var l = bLoc(); return l ? l.placeList.filter(function (p) { return p.type === bk.place; })[0] || null : null; }
  function placeLabel() {
    if (!bk.place) return "おまかせ";
    return D.getPlaceType(bk.place).ja + (bk.venue ? "・" + bk.venue : "");
  }
  function bTotal() {
    var p = bPlan(); if (!p) return 0;
    return bOptions().reduce(function (s, o) { return s + o.price; }, p.price);
  }
  function needsHotel() { return bOptions().some(function (o) { return o.id === "transfer"; }); }
  function curStep() { return bk.steps[bk.i]; }

  function startBooking(params) {
    var l = params.loc && D.getLocation(params.loc);
    bk = { loc: l ? l.id : null, date: null, time: null, plan: ["light", "standard", "luxury"].indexOf(params.plan) > -1 ? params.plan : "standard", place: "", venue: "", placeNote: "", placeSet: false, options: [], customer: {}, steps: [], i: 0, done: false };
    bk.steps = (l ? [] : ["location"]).concat(["date", "place", "plan", "customer", "confirm"]);
    if (l && params.place && hasPlace(l, params.place)) { bk.place = params.place; bk.placeSet = true; }
    if (l && params.date) {
      var st = D.dateStatus(l, params.date);
      if (st === "available" || st === "few") bk.date = params.date;
    }
    if (bk.date && params.time && l.timeSlots.indexOf(params.time) > -1) {
      var ss = D.slotStatus(l, bk.date, params.time);
      if (ss === "available" || ss === "few") bk.time = params.time;
    }
    bk.i = bk.steps.indexOf(!bk.loc ? "location" : (!bk.date || !bk.time) ? "date" : !bk.placeSet ? "place" : "plan");
    calOffset = 0;
    if (bk.date) {
      var dd = new Date(bk.date + "T00:00:00"), t = D.today();
      calOffset = (dd.getFullYear() - t.getFullYear()) * 12 + dd.getMonth() - t.getMonth();
    }
    $("#bk-back-link").href = bk.loc ? "#/propose/" + bk.loc : "#/";
    $("#bk-back-link").textContent = bk.loc ? "← " + D.getLocation(bk.loc).nameJa : "← TOP";
    bRender();
  }

  function go(delta) {
    var ni = bk.i + delta;
    if (ni < 0 || ni >= bk.steps.length) return;
    if (delta > 0 && !canNext()) return;
    bk.i = ni;
    bRender();
  }
  function canNext() {
    switch (curStep()) {
      case "location": return !!bk.loc;
      case "date": return !!bk.date && !!bk.time;
      case "place": return true;
      case "plan": return true;
      case "customer":
        var c = bk.customer;
        return !!(c.name && c.name.trim() && c.email && /.+@.+\..+/.test(c.email) && c.agree && (!needsHotel() || (c.hotel && c.hotel.trim())));
      default: return false;
    }
  }
  function autoNext() { setTimeout(function () { if (canNext()) go(1); }, 260); }

  function bRender() {
    var step = curStep();
    var total = bk.steps.length;
    $("#bk-step-count").textContent = "STEP " + (bk.i + 1) + " / " + total + "　" + STEP_META[step].ja;
    $("#bk-bar-fill").style.width = ((bk.i + 1) / total * 100) + "%";
    $("#bk-progress").classList.remove("hidden");
    $("#bk-bar").classList.remove("hidden");

    var l = bLoc();
    var chips = [];
    if (l && step !== "location") chips.push('<span class="chip"><b>' + esc(l.nameJa) + '</b><button type="button" data-change="location">変更</button></span>');
    if (bk.date && bk.time && ["place", "plan", "customer", "confirm"].indexOf(step) > -1) chips.push('<span class="chip">' + fmtShort(bk.date) + " " + bk.time + '<button type="button" data-change="date">変更</button></span>');
    if (bk.placeSet && ["plan", "customer", "confirm"].indexOf(step) > -1) chips.push('<span class="chip">' + esc(placeLabel()) + '<button type="button" data-change="place">変更</button></span>');
    $("#bk-context").innerHTML = chips.join("");

    var body = $("#bk-body");
    body.innerHTML = '<div class="bk-step">' + RENDER[step]() + "</div>";
    // Bind to the freshly rendered step, never to #bk-body itself —
    // #bk-body persists across renders, so listeners would stack.
    BIND[step] && BIND[step](body.firstChild);
    updateBar();
    window.scrollTo(0, 0);
  }
  function updateBar() {
    var step = curStep();
    $("#bk-total").textContent = bLoc() ? yen(bTotal()) : "—";
    $("#bk-prev").classList.toggle("hidden", bk.i === 0);
    var next = $("#bk-next");
    next.classList.toggle("hidden", step === "confirm");
    next.textContent = step === "customer" ? "確認へ" : "次へ";
    next.disabled = !canNext();
  }

  function slotBoxHTML(l) {
    if (!bk.date) return '<p class="slots-empty">日にちを選ぶと、その日の時間が表示されます。</p>';
    return '<h3 class="h3 slot-h">' + fmtDate(bk.date) + ' の時間を選ぶ</h3><div class="slots">' + l.timeSlots.map(function (t) {
      var st = D.slotStatus(l, bk.date, t), dis = st === "soldout" || st === "closed";
      return '<button type="button" class="slot is-' + st + (bk.time === t ? " is-selected" : "") + '" data-time="' + t + '"' + (dis ? " disabled" : "") + '><span class="t">' + t + '</span><span class="best">' +
        (t === l.bestTime ? "<b>ベストタイム</b>" + esc(l.bestTimeNote) : "") + '</span><span class="st">' + STATUS[st].ja + "</span></button>";
    }).join("") + "</div>";
  }

  var RENDER = {
    location: function () {
      return '<h2 class="h2">どこへ行きますか？</h2><p class="lede">旅行先を選んでください。</p><div class="pick-grid">' +
        D.locations.map(function (l) {
          return '<button type="button" class="pick' + (bk.loc === l.id ? " is-selected" : "") + '" data-loc="' + l.id + '">' + photo(l, { alt: "" }) +
            '<span class="pick-name"><b>' + esc(l.nameJa) + '</b><span class="price">' + yen(l.fromPrice) + "〜</span></span></button>";
        }).join("") + "</div>";
    },
    date: function () {
      var l = bLoc();
      var t = D.today();
      // Open on the first month that still has a bookable day (e.g. a 7-day lead late in the month).
      if (!bk.date && !bk.calSet) { calOffset = firstOpenOffset(l); bk.calSet = true; }
      var base = new Date(t.getFullYear(), t.getMonth() + calOffset, 1);
      var y = base.getFullYear(), m = base.getMonth();
      var first = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
      var cells = [];
      for (var i = 0; i < first; i++) cells.push('<span class="empty"></span>');
      for (var d = 1; d <= dim; d++) {
        var iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        var past = D.daysFromToday(iso) < 0;
        var st = past ? "closed" : D.dateStatus(l, iso);
        var dis = st === "soldout" || st === "closed";
        cells.push('<button type="button" class="day-btn is-' + st + (past ? " is-past" : "") + (bk.date === iso ? " is-selected" : "") + '" data-date="' + iso + '"' + (dis ? " disabled" : "") +
          ' aria-label="' + fmtDate(iso) + " " + STATUS[st].ja + '"><span class="dn">' + d + '</span><span class="ds">' + (past ? "" : STATUS[st].mark) + "</span></button>");
      }
      return '<h2 class="h2">日にちと時間を選ぶ</h2><p class="lede">' + esc(l.nameJa) + "は" + l.leadDays + "日前までリクエストできます。旅行中の日にちを選んでください。</p>" +
        '<div class="cal-nav"><button type="button" data-cal="-1"' + (calOffset <= 0 ? " disabled" : "") + ' aria-label="前の月">←</button><span class="cal-month">' + y + "年" + (m + 1) +
        '月</span><button type="button" data-cal="1"' + (calOffset >= 5 ? " disabled" : "") + ' aria-label="次の月">→</button></div>' +
        '<div class="cal">' + DOW.map(function (w) { return '<span class="cal-dow">' + w + "</span>"; }).join("") + cells.join("") + "</div>" +
        '<div class="cal-foot">' + LEGEND + "</div>" +
        '<div class="slot-box" id="bk-slotbox" aria-live="polite">' + slotBoxHTML(l) + "</div>" +
        '<p class="note" style="margin-top:14px">※ 日時は、リクエストのあと手配を確認してから確定します。受付状況はデモ表示です。</p>';
    },
    place: function () {
      var l = bLoc(), entry = bPlaceEntry();
      var opts = [{ type: "", venues: [] }].concat(l.placeList);
      return '<h2 class="h2">プロポーズの場所を選ぶ</h2><p class="lede">' + esc(l.nameJa) + "で選べる場所です。会場を指定することもできます。</p>" +
        '<div class="plan-toggle" role="radiogroup" aria-label="場所">' + opts.map(function (o) {
          var t = o.type ? D.getPlaceType(o.type) : null, on = bk.place === o.type;
          var sub = t ? esc(t.desc) + (o.venues.length ? "（会場の指定もできます）" : "") : esc(l.meetingPoint) + "など、その日にいちばん合う場所をご案内します。";
          return '<button type="button" role="radio" aria-checked="' + on + '" class="plan-opt is-place' + (on ? " is-selected" : "") + '" data-place="' + o.type + '"><span class="radio"></span><span>' +
            '<b class="place-ja">' + (t ? t.ja : "おまかせ") + "</b>" + (t ? '<span class="en-sm">' + t.en + "</span>" : "") + "<p>" + sub + "</p></span></button>";
        }).join("") + "</div>" +
        (entry && entry.venues.length ?
          '<p class="sub-h">会場を指定する</p>' +
          '<div class="plan-toggle venue-toggle" role="radiogroup" aria-label="会場">' + [""].concat(entry.venues).map(function (v) {
            var on = bk.venue === v;
            return '<button type="button" role="radio" aria-checked="' + on + '" class="plan-opt is-compact' + (on ? " is-selected" : "") + '" data-pvenue="' + esc(v) + '"><span class="radio"></span><span>' + (v ? esc(v) : "指定なし（おすすめをご案内）") + "</span></button>";
          }).join("") + "</div>" : "") +
        (bk.place ? '<div class="field"><label for="c-placenote">ご希望があればご記入ください<span class="req opt">任意</span></label><input id="c-placenote" type="text" maxlength="200" value="' + esc(bk.placeNote) + '" placeholder="例：滞在中のホテル名、行きたいお店など"></div>' : "") +
        (FEE_TYPES.indexOf(bk.place) > -1 ? '<p class="note">' + VENUE_NOTE + "</p>" : "");
    },
    plan: function () {
      var l = bLoc();
      return '<h2 class="h2">プランとオプション</h2><p class="lede">プランを選び、必要なものだけ追加してください。</p>' +
        '<div class="plan-toggle" role="radiogroup" aria-label="プラン">' + l.plans.map(function (p) {
          return '<button type="button" role="radio" aria-checked="' + (bk.plan === p.id) + '" class="plan-opt' + (bk.plan === p.id ? " is-selected" : "") + '" data-plan="' + p.id + '"><span class="radio"></span><span>' +
            '<b class="place-ja">' + esc(p.nameJa) + '</b><span class="en-sm">' + esc(p.name) + "</span><p>" + esc(p.summary) + '</p></span><span class="price">' + yen(p.price) + "</span></button>";
        }).join("") + "</div>" +
        '<p class="sub-h">オプション（追加できるもの）</p>' +
        D.options.map(function (o) {
          var ok = optionAvailable(o), on = ok && bk.options.indexOf(o.id) > -1;
          return '<button type="button" role="checkbox" aria-checked="' + on + '" class="opt-pick' + (on ? " is-on" : "") + '" data-opt="' + o.id + '"' + (ok ? "" : " disabled") + '><span class="box">' + (on ? "✓" : "") +
            '</span><span><b class="place-ja">' + esc(o.nameJa) + '</b><span class="en-sm">' + esc(o.name) + "</span><p>" + esc(o.desc) + '</p></span><span class="price">' + (ok ? "+" + yen(o.price) : "撮影付きプランのみ") + "</span></button>";
        }).join("");
    },
    customer: function () {
      var c = bk.customer;
      function f(id, label, type, req, ac, ph) {
        return '<div class="field"><label for="c-' + id + '">' + label + (req ? '<span class="req">必須</span>' : '<span class="req opt">任意</span>') + "</label>" +
          '<input id="c-' + id + '" type="' + type + '" autocomplete="' + ac + '" value="' + esc(c[id] || "") + '" placeholder="' + ph + '"' + (req ? " required" : "") + "></div>";
      }
      return '<h2 class="h2">ご予約者さまの情報</h2><p class="lede">確定のご連絡と当日の連絡に使います。この時点でのお支払いはありません。</p>' +
        f("name", "お名前", "text", true, "name", "山田 太郎") +
        f("email", "メールアドレス", "email", true, "email", "you@example.com") +
        f("phone", "電話番号（当日の連絡用）", "tel", false, "tel", "090-0000-0000") +
        (needsHotel() ? f("hotel", "ご滞在ホテル（送迎用）", "text", true, "off", "例：ハレクラニ") : "") +
        '<label class="check"><input type="checkbox" id="c-surprise"' + (c.surprise ? " checked" : "") + "><span>サプライズなので、メールは控えめな件名にしてほしい</span></label>" +
        '<label class="check"><input type="checkbox" id="c-flex"' + (c.flex ? " checked" : "") + "><span>希望の時間が難しい場合、同じ日の別の時間でもよい</span></label>" +
        '<label class="check"><input type="checkbox" id="c-agree"' + (c.agree ? " checked" : "") + "><span>利用規約・キャンセルポリシーに同意する</span></label>";
    },
    confirm: function () {
      return '<h2 class="h2">リクエスト内容の確認</h2><p class="lede">この内容でリクエストを送ります。' + (bPlan().hasPhoto ? "フォトグラファーの" : "") + '手配を確認し、' + D.replyHours + '時間以内に確定可否をご連絡します。</p>' + summaryHTML() +
        '<button type="button" class="btn btn-block" id="bk-pay">予約をリクエストする（デモ）<span class="arrow" aria-hidden="true">→</span></button>' +
        '<p class="note" style="margin-top:12px;text-align:center">この時点ではお支払いは発生しません。予約の確定後に、お支払いのご案内をお送りします。</p>';
    }
  };

  function summaryHTML() {
    var l = bLoc(), p = bPlan();
    var extra = bOptions();
    var rows = [
      ["旅行先", esc(l.nameJa) + "（" + esc(l.name) + "）"],
      ["日にち", fmtDate(bk.date, true)],
      ["時間", bk.time + (bk.time === l.bestTime ? "<small>ベストタイム・" + esc(l.bestTimeNote) + "</small>" : "")],
      ["集合場所", esc(l.meetingPoint)],
      ["場所", esc(placeLabel()) + (bk.placeNote ? "<small>" + esc(bk.placeNote) + "</small>" : "")],
      ["プラン", esc(p.nameJa) + "<small>" + esc(p.summary) + "・" + yen(p.price) + "</small>"],
      ["時間の調整", bk.customer.flex ? "同じ日の別の時間でも可" : "希望の時間のみ"],
      ["オプション", extra.length ? extra.map(function (o) { return esc(o.nameJa) + " +" + yen(o.price); }).join("<br>") : "なし"]
    ];
    return '<dl class="summary">' + rows.map(function (r) { return '<div class="sum-row"><dt>' + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") +
      '<div class="sum-total"><dt>合計<small>確定後のお支払い</small></dt><dd class="price">' + yen(bTotal()) + "</dd></div></dl>";
  }

  var BIND = {
    location: function (b) {
      b.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-loc]"); if (!btn) return;
        if (bk.loc !== btn.dataset.loc) { bk.date = null; bk.time = null; bk.place = ""; bk.venue = ""; bk.placeNote = ""; bk.placeSet = false; bk.calSet = false; }
        bk.loc = btn.dataset.loc;
        $$("[data-loc]", b).forEach(function (x) { x.classList.toggle("is-selected", x === btn); });
        updateBar(); autoNext();
      });
    },
    date: function (b) {
      var l = bLoc(), box = $("#bk-slotbox", b);
      b.addEventListener("click", function (e) {
        var c = e.target.closest("[data-cal]:not(:disabled)");
        if (c) { calOffset += Number(c.dataset.cal); bRender(); return; }
        var d = e.target.closest(".day-btn:not(:disabled)");
        if (d) {
          if (bk.date !== d.dataset.date) bk.time = null;
          bk.date = d.dataset.date;
          $$(".day-btn", b).forEach(function (x) { x.classList.toggle("is-selected", x === d); });
          box.innerHTML = slotBoxHTML(l);
          updateBar();
          // Bring the times into view without jumping the page to the top.
          var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          var top = box.getBoundingClientRect().top + window.scrollY - 150;
          if (box.getBoundingClientRect().top > window.innerHeight * 0.55) window.scrollTo({ top: top, behavior: reduce ? "auto" : "smooth" });
          return;
        }
        var t = e.target.closest(".slot:not(:disabled)");
        if (t) {
          bk.time = t.dataset.time;
          $$(".slot", b).forEach(function (x) { x.classList.toggle("is-selected", x === t); });
          updateBar(); autoNext();
        }
      });
    },
    place: function (b) {
      b.addEventListener("click", function (e) {
        var c = e.target.closest("[data-place]"), v = e.target.closest("[data-pvenue]");
        if (c) {
          if (bk.place !== c.dataset.place) { bk.venue = ""; }
          bk.place = c.dataset.place; bk.placeSet = true;
          bRender();
          if (!bk.place) autoNext(); // "おまかせ" needs nothing else
        }
        if (v) { bk.venue = v.dataset.pvenue; bRender(); }
      });
      var note = $("#c-placenote", b);
      if (note) note.addEventListener("input", function () { bk.placeNote = note.value; });
    },
    plan: function (b) {
      b.addEventListener("click", function (e) {
        var p = e.target.closest("[data-plan]");
        var o = e.target.closest("[data-opt]:not(:disabled)");
        if (p) { bk.plan = p.dataset.plan; bk.options = bk.options.filter(function (id) { return optionAvailable(D.options.filter(function (x) { return x.id === id; })[0]); }); bRender(); }
        if (o) {
          var i = bk.options.indexOf(o.dataset.opt);
          if (i > -1) bk.options.splice(i, 1); else bk.options.push(o.dataset.opt);
          bRender();
        }
      });
    },
    customer: function (b) {
      ["name", "email", "phone", "hotel"].forEach(function (k) {
        var el = $("#c-" + k, b);
        if (el) el.addEventListener("input", function () { bk.customer[k] = el.value; updateBar(); });
      });
      ["surprise", "flex", "agree"].forEach(function (k) {
        var el = $("#c-" + k, b);
        el.addEventListener("change", function () { bk.customer[k] = el.checked; updateBar(); });
      });
    },
    confirm: function (b) {
      $("#bk-pay", b).addEventListener("click", renderDone);
    }
  };

  function renderDone() {
    var code = "PRP-" + String(new Date().getFullYear()).slice(2) + Math.random().toString(36).slice(2, 7).toUpperCase();
    var l = bLoc();
    $("#bk-progress").classList.add("hidden");
    $("#bk-bar").classList.add("hidden");
    $("#bk-context").innerHTML = "";
    $("#bk-body").innerHTML =
      '<div class="done bk-step">' +
        '<span class="label">Request received.</span>' +
        '<h2 class="h2">リクエストを、<br>受け付けました。</h2>' +
        '<p class="lede">リクエスト番号 <b class="en" style="font-weight:600">' + code + "</b><br>まだ予約は確定していません。" + D.replyHours + "時間以内に、" + esc(bk.customer.email || "") + " へ確定可否をご連絡します。</p>" +
        summaryHTML() +
        '<ol class="next-steps">' +
          "<li><b>01</b><span>" + (bPlan().hasPhoto ? "フォトグラファーの" : "") + "手配を確認し、" + D.replyHours + "時間以内にメールでご連絡します（" + (bk.customer.surprise ? "控えめな件名で送信" : "件名：ご予約リクエストについて") + "）。" +
            (bk.customer.flex ? "希望の時間が難しい場合は、同じ日の別の時間をご案内します。" : "ご希望の日時が難しい場合は、近い日時をご提案します。") + "</span></li>" +
          "<li><b>02</b><span>確定のメールにあるリンクからお支払いください。お支払いの完了で、予約が確定します。</span></li>" +
          "<li><b>03</b><span>当日の2日前までに、" + (bPlan().hasPhoto ? "フォトグラファー" : "担当スタッフ") + "から集合場所の詳細をお送りします。当日は " + esc(l.meetingPoint) + " へ。</span></li>" +
        "</ol>" +
        '<a class="btn btn-ghost" href="#/">TOPへ戻る</a>' +
      "</div>";
    window.scrollTo(0, 0);
  }

  $("#bk-next").addEventListener("click", function () { go(1); });
  $("#bk-prev").addEventListener("click", function () { go(-1); });
  $("#bk-context").addEventListener("click", function (e) {
    var c = e.target.closest("[data-change]"); if (!c) return;
    if (c.dataset.change === "location") {
      if (bk.steps[0] !== "location") bk.steps.unshift("location");
      bk.i = 0;
    } else {
      bk.i = bk.steps.indexOf(c.dataset.change === "place" ? "place" : "date");
    }
    bRender();
  });

  /* =============================================================
     Router, header, sticky CTA
     ============================================================= */
  var hd = $("#hd"), sticky = $("#sticky-cta"), current = null;

  function parse(hash) {
    var h = (hash || "").replace(/^#/, "");
    if (!h || h === "/") return { view: "top" };
    if (h.charAt(0) !== "/") return { view: "top", anchor: h };
    var parts = h.split("?"), path = parts[0].split("/").filter(Boolean), q = {};
    (parts[1] || "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ""); });
    if (path[0] === "propose" && path[1]) return { view: "location", id: path[1], q: q };
    if (path[0] === "book") return { view: "booking", q: q };
    return { view: "top" };
  }

  function show(name) {
    $$(".view").forEach(function (v) { v.classList.toggle("is-active", v.id === "view-" + name); });
    hd.classList.toggle("hidden", name === "booking");
    $("#ft").classList.toggle("hidden", name === "booking");
    $("#hd-drawer").classList.toggle("hidden", name === "booking");
  }

  function route() {
    var r = parse(location.hash);
    closeDrawer();
    if (r.view === "top") {
      buildTop();
      show("top");
      document.title = "世界のプロポーズプラン｜旅行先で、忘れられないプロポーズを。";
      setHeaderCta("#destinations", "予約する");
      setSticky('<button class="btn" data-scroll="destinations">旅行先から探す <span class="arrow" aria-hidden="true">→</span></button>');
      observeReveals($("#view-top"));
      if (r.anchor) {
        requestAnimationFrame(function () { scrollToId(r.anchor, false); });
      } else if (current !== "top") {
        window.scrollTo(0, 0);
      }
    } else if (r.view === "location") {
      renderLocation(r.id, r.q);
      show("location");
      var l = D.getLocation(r.id);
      if (l) {
        setHeaderCta("#/book?loc=" + l.id, "予約する");
        setSticky('<div class="sticky-price"><small>写真付き</small><span class="price">' + yen((l.plans[1] || l.plans[0]).price) + '〜</span></div><a class="btn" href="#/book?loc=' + l.id + '">この場所で予約する</a>');
        applyPlaceToLinks();
      }
      window.scrollTo(0, 0);
    } else {
      show("booking");
      setSticky("");
      startBooking(r.q || {});
    }
    current = r.view;
    onScroll();
  }

  function setHeaderCta(href, text) {
    var a = $(".hd-nav .btn");
    a.setAttribute("href", href); a.textContent = text;
  }
  function setSticky(html) {
    sticky.innerHTML = html;
    sticky.classList.toggle("hidden", !html);
  }
  function scrollToId(id, smooth) {
    var el = document.getElementById(id);
    if (!el) return;
    var top = el.getBoundingClientRect().top + window.scrollY - (window.innerWidth >= 960 ? 76 : 64) + 1;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top, behavior: smooth && !reduce ? "smooth" : "auto" });
  }

  function onScroll() {
    var y = window.scrollY;
    var hero = $(".view.is-active .hero, .view.is-active .lhero");
    var heroEnd = hero ? hero.offsetHeight - 80 : 0;
    hd.classList.toggle("is-over", !!hero && y < heroEnd && !$("#hd-drawer").classList.contains("is-open"));
    var showSticky = !!hero && y > heroEnd * 0.6;
    if (current === "top") {
      var dest = $("#destinations").getBoundingClientRect();
      if (dest.top < window.innerHeight * 0.6 && dest.bottom > window.innerHeight * 0.4) showSticky = false;
    }
    sticky.classList.toggle("is-shown", showSticky);
    sticky.setAttribute("aria-hidden", String(!showSticky));
  }

  function closeDrawer() {
    $("#hd-drawer").classList.remove("is-open");
    $("#hd-menu").setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  $("#hd-menu").addEventListener("click", function () {
    var open = !$("#hd-drawer").classList.contains("is-open");
    $("#hd-drawer").classList.toggle("is-open", open);
    this.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
    onScroll();
  });

  $("#skip").addEventListener("click", function (e) {
    e.preventDefault();
    var v = $(".view.is-active");
    v.setAttribute("tabindex", "-1"); v.focus(); v.scrollIntoView();
  });

  document.addEventListener("click", function (e) {
    var s = e.target.closest("[data-scroll]");
    if (s) { e.preventDefault(); closeDrawer(); scrollToId(s.dataset.scroll, true); return; }
    var a = e.target.closest('a[href^="#"]');
    if (a && a.getAttribute("href") === location.hash) {
      // Same-hash click (e.g. "#faq" twice): hashchange won't fire, so scroll manually.
      var r = parse(a.getAttribute("href"));
      if (r.anchor) { e.preventDefault(); closeDrawer(); scrollToId(r.anchor, true); }
    }
  });

  window.addEventListener("hashchange", route);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  route();
})();
