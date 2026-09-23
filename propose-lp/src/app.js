/* =====================================================================
   app.js — TOP / LOCATION / BOOKING in one document.
   Hash routes keep the browser Back button working and mirror the
   intended Shopify URLs:
     #/                         → /pages/propose
     #/propose/<id>             → /pages/propose/<id>
     #/book?loc=&date=&time=    → /pages/propose-booking?...
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
    available: { mark: "◎", ja: "受付中", en: "OPEN" },
    few: { mark: "△", ja: "残りわずか", en: "FEW LEFT" },
    soldout: { mark: "×", ja: "受付終了", en: "FULL" },
    closed: { mark: "―", ja: "締切", en: "CLOSED" }
  };

  /* ---------------- photos ---------------- */
  // Real photo when a licensed one exists; otherwise the illustrated
  // fallback, captioned so nobody mistakes it for final imagery.
  function photoInner(key, alt, loc, eager) {
    var src = key && PHOTOS[key];
    if (src) {
      return '<img src="' + src + '" alt="' + esc(alt || "") + '" decoding="async">';
    }
    var hue = loc ? loc.hue : ["#3a4a55", "#c9a88a"];
    return D.sceneSVG(hue[0], hue[1], loc ? loc.motif : "") + '<span class="soon">Photo coming soon</span>';
  }
  function photo(loc, opts) {
    opts = opts || {};
    var pos = opts.pos || (loc && loc.photoPos) || "50% 50%";
    var cls = "photo" + (opts.reveal ? " reveal-img" : "") + (opts.cls ? " " + opts.cls : "");
    var html = photoInner(loc ? loc.photo : opts.key, opts.alt || (loc && loc.photoAlt), loc, opts.eager);
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
  function planHTML(base, locId) {
    var allin = D.options.reduce(function (s, o) { return s + o.price; }, base);
    var cta = locId
      ? '<a class="btn btn-block" href="#/book?loc=' + locId + '" style="margin-top:28px">この場所で予約する <span class="arrow" aria-hidden="true">→</span></a>'
      : "";
    return (
      '<div class="plan-box">' +
        '<div class="plan-main reveal">' +
          '<div class="plan-name">PROPOSE PLAN</div>' +
          '<div class="plan-price"><span class="price">' + yen(base) + "</span>" + (locId ? "" : "<small>〜</small>") + "</div>" +
          (locId ? "" : '<p class="note plan-price-note">料金は行き先により異なります。</p>') +
          '<div class="includes"><p class="includes-h">含まれるもの</p><ul>' + D.planIncludes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" +
          cta +
        "</div>" +
        '<div class="reveal">' +
          '<p class="sub-h">Option</p>' +
          '<div class="opt-list">' +
            D.options.map(function (o) {
              return '<div class="opt-row"><div class="en">＋ ' + esc(o.name) + "<span>" + esc(o.nameJa) + '</span></div><div class="price">' + yen(o.price) + "</div><p>" + esc(o.desc) + "</p></div>";
            }).join("") +
            '<div class="opt-row is-allin"><div class="en">ALL INCLUSIVE<span>全部入り</span></div><div class="price">' + yen(allin) + (locId ? "" : "〜") + "</div><p>プロポーズプランに、" + D.options.length + "つのオプションをすべて含めたプランです。</p></div>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  /* =============================================================
     TOP
     ============================================================= */
  var topBuilt = false;
  function buildTop() {
    if (topBuilt) return;
    topBuilt = true;
    var view = $("#view-top");

    $("#dest-grid").innerHTML = D.locations.map(function (l) {
      return (
        '<a class="dest-card reveal" href="#/propose/' + l.id + '">' +
          photo(l) +
          '<div class="dest-body">' +
            '<div class="dest-name">' + esc(l.name) + "</div>" +
            '<div class="dest-ja">' + esc(l.nameJa) + "</div>" +
            '<div class="dest-price">From<span class="price">' + yen(l.fromPrice) + "</span></div>" +
            '<span class="dest-more"><span><span class="sm-hide">プロポーズ</span>プランを見る</span><span aria-hidden="true">→</span></span>' +
          "</div>" +
        "</a>"
      );
    }).join("");

    $("#assure-list").innerHTML = [
      { key: D.minLeadDays + "<small>日前</small>", h: "まで予約できます", p: "受付締切は行き先ごとに異なります。各ページでご確認ください。" },
      { key: "14<small>日分</small>", h: "の受付状況をすぐ確認", p: "旅行日を選ぶだけで、その日に申し込める時間が分かります。" },
      { key: D.replyHours + "<small>時間</small>", h: "以内に確定のご連絡", p: "リクエスト後、フォトグラファーの手配を確認してメールでお知らせします。お支払いは確定のあとです。" },
      { key: "JP", h: "日本語でサポート", p: "予約から当日の連絡まで、日本語で対応します。" }
    ].map(function (a) {
      return '<li class="assure-item reveal"><span class="assure-key">' + a.key + '</span><div><h3 class="h3">' + a.h + "</h3><p>" + a.p + "</p></div></li>";
    }).join("");

    $("#top-steps").innerHTML = D.proposalSteps.map(function (s) {
      var loc = D.getLocation(s.photo);
      return (
        '<li class="step reveal">' +
          photo(loc, { alt: "", pos: loc && loc.photoPos }) +
          '<div><span class="step-no">' + s.no + '</span><h3 class="h3">' + esc(s.title) + "</h3><p>" + esc(s.text) + "</p></div>" +
        "</li>"
      );
    }).join("");

    $("#top-plan").innerHTML = planHTML(D.minPrice, null);

    var faq = $("#top-faq");
    faq.innerHTML = faqHTML(D.faq.slice(0, 5));
    $("#faq-more").addEventListener("click", function () {
      faq.innerHTML = faqHTML(D.faq);
      this.parentNode.remove();
    });

    var themes = $("#themes");
    themes.innerHTML = D.themes.map(function (t) {
      var loc = D.getLocation(t.photo);
      return (
        '<button type="button" class="theme" data-theme="' + t.id + '" aria-pressed="false">' +
          photo(loc, { alt: "" }) +
          '<span class="theme-label"><span class="en">' + t.en + "</span><b>" + esc(t.label) + "</b></span>" +
        "</button>"
      );
    }).join("");
    themes.addEventListener("click", function (e) {
      var btn = e.target.closest(".theme");
      if (!btn) return;
      var on = btn.getAttribute("aria-pressed") !== "true";
      $$(".theme", themes).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      btn.setAttribute("aria-pressed", String(on));
      var res = $("#theme-results");
      if (!on) { res.innerHTML = ""; return; }
      var matches = D.locations.filter(function (l) { return l.tags.indexOf(btn.dataset.theme) > -1; });
      res.innerHTML = matches.map(function (l) {
        return (
          '<a class="result-row" href="#/propose/' + l.id + '">' +
            photo(l, { alt: "" }) +
            '<div><div class="dest-name">' + esc(l.name) + '</div><div class="dest-ja">' + esc(l.nameJa) + "・" + esc(l.tagline) + "</div></div>" +
            '<div class="price">' + yen(l.fromPrice) + "〜</div>" +
          "</a>"
        );
      }).join("");
    });

    hydrateStaticPhotos(view);
  }

  /* =============================================================
     LOCATION
     ============================================================= */
  function renderLocation(id) {
    var l = D.getLocation(id);
    var view = $("#view-location");
    if (!l) { view.innerHTML = '<section class="sec"><div class="wrap"><p>旅行先が見つかりませんでした。</p><a class="link" href="#destinations">旅行先一覧へ</a></div></section>'; return; }

    document.title = l.nameJa + "でプロポーズ｜世界のプロポーズプラン";

    var steps = D.proposalSteps.map(function (s, i) {
      var text = i === 0 ? l.meetingPoint + "で、フォトグラファーがお二人をお迎えします。" : s.text;
      return '<li class="tl-item' + (i === 3 ? " is-key" : "") + '"><span class="step-no">' + s.no + '</span><h3 class="h3">' + esc(s.title) + "</h3><p>" + esc(text) + "</p></li>";
    }).join("");

    var others = D.locations.filter(function (x) { return x.id !== l.id; }).map(function (x) {
      return '<a href="#/propose/' + x.id + '">' + esc(x.name) + "</a>";
    }).join("");

    view.innerHTML =
      '<section class="lhero" aria-labelledby="l-title">' +
        photo(l, { eager: true }) +
        '<div class="hero-scrim"></div>' +
        '<p class="crumb"><a href="#/">TOP</a> ／ <a href="#destinations">DESTINATIONS</a> ／ ' + esc(l.name) + "</p>" +
        '<div class="lhero-body">' +
          '<span class="label">Propose in ' + esc(l.name.charAt(0) + l.name.slice(1).toLowerCase()) + "</span>" +
          '<p class="lhero-name" aria-hidden="true">' + esc(l.name) + "</p>" +
          '<h1 class="h1" id="l-title">' + nl2br(l.catch) + "</h1>" +
          '<p class="lhero-price">From<span class="price">' + yen(l.fromPrice) + "</span></p>" +
          '<div class="lhero-cta">' +
            '<button class="btn btn-light" data-scroll="loc-avail">受付状況を見る</button>' +
            '<a class="btn btn-line" href="#/book?loc=' + l.id + '">予約する</a>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="sec" style="padding-bottom:calc(var(--sec) * .6)">' +
        '<div class="wrap">' +
          '<div class="lintro reveal">' +
            '<div><span class="label">About ' + esc(l.name) + '</span><h2 class="h2">' + esc(l.tagline) + "</h2></div>" +
            '<p class="lede" style="margin-top:0">' + esc(l.lede) + "</p>" +
          "</div>" +
          '<dl class="facts reveal" style="margin-top:56px">' +
            '<div class="fact"><dt>Price</dt><dd><span class="price">' + yen(l.fromPrice) + "</span><small>プロポーズプラン</small></dd></div>" +
            '<div class="fact"><dt>Time</dt><dd>' + esc(l.duration) + "<small>うち撮影30分</small></dd></div>" +
            '<div class="fact"><dt>Best Time</dt><dd>' + esc(l.bestTime) + "<small>" + esc(l.bestTimeNote) + "</small></dd></div>" +
            '<div class="fact"><dt>Book By</dt><dd>最短' + l.leadDays + "日前まで<small>" + D.replyHours + "時間以内に確定のご連絡</small></dd></div>" +
            '<div class="fact"><dt>Rain</dt><dd>無料で振替<small>翌日以降の空き枠へ</small></dd></div>' +
            '<div class="fact"><dt>Support</dt><dd>日本語対応<small>当日の連絡も日本語で</small></dd></div>' +
          "</dl>" +
          '<p class="note facts-note">※ 所要時間・受付締切・確定連絡までの時間・雨天対応・受付状況はデモ用の仮データです。</p>' +
        "</div>" +
      "</section>" +

      '<section class="sec sec-deep" aria-labelledby="l-day">' +
        '<div class="wrap day">' +
          photo(l, { reveal: true, pos: "50% 50%" }) +
          "<div>" +
            '<div class="sec-head reveal"><span class="label">Your Proposal</span><h2 class="h2" id="l-day">当日は、<br>こんな時間になります。</h2>' +
            '<p class="lede">最初は旅の記念撮影として。気づかれないまま、その瞬間へ。</p></div>' +
            '<ol class="timeline reveal">' + steps + "</ol>" +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="sec" id="loc-avail" aria-labelledby="l-avail">' +
        '<div class="wrap-narrow">' +
          '<div class="sec-head reveal"><span class="label">Availability</span><h2 class="h2" id="l-avail">あなたの旅行日に、<br>間に合いますか？</h2>' +
          '<p class="lede">日付を選ぶと、その日に申し込める時間が分かります。予約はリクエスト制で、' + D.replyHours + '時間以内に確定をご連絡します。</p></div>' +
          '<div class="avail reveal" id="avail"></div>' +
        "</div>" +
      "</section>" +

      '<section class="sec sec-deep" aria-labelledby="l-plan">' +
        '<div class="wrap">' +
          '<div class="sec-head reveal"><span class="label">Plan</span><h2 class="h2" id="l-plan">' + esc(l.nameJa) + "の料金</h2>" +
          '<p class="lede">基本はプロポーズプランだけ。必要な演出だけを足してください。</p></div>' +
          planHTML(l.base, l.id) +
        "</div>" +
      "</section>" +

      '<section class="sec" aria-labelledby="l-faq">' +
        '<div class="wrap-narrow">' +
          '<div class="sec-head reveal"><span class="label">If It Rains &amp; FAQ</span><h2 class="h2" id="l-faq">雨の日も、<br class="br-sp">直前の予約も。</h2></div>' +
          '<div class="rain reveal"><span class="en">IF IT RAINS</span><p>' + esc(l.rainPlan) + "</p></div>" +
          '<div class="faq" style="margin-top:32px">' + faqHTML([
            { q: "何日前まで予約できますか？", a: esc(l.nameJa) + "は、撮影日の" + l.leadDays + "日前までリクエストできます。確定のご連絡は" + D.replyHours + "時間以内です。" },
            { q: "集合場所はどこですか？", a: l.meetingPoint + "です。詳細は予約確認メールでご案内します。" },
            D.faq[1], D.faq[3], D.faq[4]
          ]) + "</div>" +
        "</div>" +
      "</section>" +

      '<section class="final">' + photo(l, { pos: "50% 40%" }) +
        '<div class="wrap"><span class="label">Propose in ' + esc(l.name.charAt(0) + l.name.slice(1).toLowerCase()) + '</span><h2 class="h2">あとは、日付を選ぶだけ。</h2>' +
        '<p class="lede">' + esc(l.nameJa) + "のプロポーズプラン " + yen(l.fromPrice) + "〜</p>" +
        '<a class="btn btn-light" href="#/book?loc=' + l.id + '">この場所で予約する <span class="arrow" aria-hidden="true">→</span></a>' +
        '<nav class="ft-links" style="justify-content:center;margin-top:48px;color:rgba(255,255,255,.85)" aria-label="ほかの旅行先">' + others + "</nav></div>" +
      "</section>";

    renderAvail(l);
    observeReveals(view);
  }

  // 14-day quick check → pick a slot → jump straight to PLAN in booking.
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
            '<span class="best">' + (t === l.bestTime ? "<b>BEST TIME</b>" + esc(l.bestTimeNote) : "") + "</span>" +
            '<span class="st">' + STATUS[st].en + "</span>" +
          "</button>"
        );
      }).join("") : '<p class="slots-empty">この先2週間は受付を終了しています。先の日付をご確認ください。</p>';

      var go = sel.date && sel.time
        ? '<p class="avail-pick"><b>' + fmtDate(sel.date) + " " + sel.time + "</b> ・受付中</p>" +
          '<a class="btn btn-block" href="#/book?loc=' + l.id + "&date=" + sel.date + "&time=" + sel.time + '">この日時で申し込む <span class="arrow" aria-hidden="true">→</span></a>'
        : '<p class="avail-pick" style="color:var(--ink-faint)">時間を選ぶと、そのまま予約リクエストに進めます。</p>';

      box.innerHTML =
        '<div class="avail-head"><span class="en">NEXT 14 DAYS</span>' +
        '<span class="legend"><span><i>◎</i>受付中</span><span><i>△</i>残りわずか</span><span><i>×</i>受付終了</span><span><i>―</i>締切</span></span></div>' +
        '<div class="days" role="group" aria-label="日付を選ぶ">' + dayBtns + "</div>" +
        (sel.date ? '<p class="note" style="margin-top:16px">' + fmtDate(sel.date) + " の受付状況</p>" : "") +
        '<div class="slots" role="group" aria-label="時間を選ぶ">' + slots + "</div>" +
        '<div class="avail-go">' + go + "</div>" +
        '<div class="avail-more"><a class="link" href="#/book?loc=' + l.id + '">もっと先の日付を見る <span class="arrow" aria-hidden="true">→</span></a></div>';
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
    location: { ja: "旅行先", en: "DESTINATION" },
    date: { ja: "日付", en: "DATE" },
    time: { ja: "時間", en: "TIME" },
    plan: { ja: "プラン・オプション", en: "PLAN" },
    customer: { ja: "お客様情報", en: "YOUR DETAILS" },
    confirm: { ja: "リクエスト内容の確認", en: "REVIEW" }
  };
  var bk = null;
  var calOffset = 0;

  function bLoc() { return bk.loc ? D.getLocation(bk.loc) : null; }
  function bPlan() { var l = bLoc(); return l ? l.plans.filter(function (p) { return p.id === bk.plan; })[0] : null; }
  function isIncluded(optId) { var p = bPlan(); return !!p && p.includedOptionIds.indexOf(optId) > -1; }
  function bOptions() { return D.options.filter(function (o) { return isIncluded(o.id) || bk.options.indexOf(o.id) > -1; }); }
  function bTotal() {
    var p = bPlan(); if (!p) return 0;
    return bOptions().reduce(function (s, o) { return isIncluded(o.id) ? s : s + o.price; }, p.price);
  }
  function needsHotel() { return bOptions().some(function (o) { return o.id === "transfer"; }); }
  function curStep() { return bk.steps[bk.i]; }

  function startBooking(params) {
    var l = params.loc && D.getLocation(params.loc);
    bk = { loc: l ? l.id : null, date: null, time: null, plan: params.plan === "allin" ? "allin" : "standard", options: [], customer: {}, steps: [], i: 0, done: false };
    bk.steps = (l ? [] : ["location"]).concat(["date", "time", "plan", "customer", "confirm"]);
    if (l && params.date) {
      var st = D.dateStatus(l, params.date);
      if (st === "available" || st === "few") bk.date = params.date;
    }
    if (bk.date && params.time && l.timeSlots.indexOf(params.time) > -1) {
      var ss = D.slotStatus(l, bk.date, params.time);
      if (ss === "available" || ss === "few") bk.time = params.time;
    }
    bk.i = bk.steps.indexOf(!bk.loc ? "location" : !bk.date ? "date" : !bk.time ? "time" : "plan");
    calOffset = 0;
    if (bk.date) {
      var dd = new Date(bk.date + "T00:00:00"), t = D.today();
      calOffset = (dd.getFullYear() - t.getFullYear()) * 12 + dd.getMonth() - t.getMonth();
    }
    $("#bk-back-link").href = bk.loc ? "#/propose/" + bk.loc : "#/";
    $("#bk-back-link").textContent = bk.loc ? "← " + D.getLocation(bk.loc).name : "← TOP";
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
      case "date": return !!bk.date;
      case "time": return !!bk.time;
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
    $("#bk-step-en").textContent = STEP_META[step].en;
    $("#bk-bar-fill").style.width = ((bk.i + 1) / total * 100) + "%";
    $("#bk-progress").classList.remove("hidden");
    $("#bk-bar").classList.remove("hidden");

    var l = bLoc();
    var chips = [];
    if (l && step !== "location") chips.push('<span class="chip"><span class="en">' + esc(l.name) + "</span>" + esc(l.nameJa) + '<button type="button" data-change="location">変更</button></span>');
    if (bk.date && ["time", "plan", "customer", "confirm"].indexOf(step) > -1) chips.push('<span class="chip">' + fmtShort(bk.date) + (bk.time && step !== "time" ? " " + bk.time : "") + '<button type="button" data-change="date">変更</button></span>');
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

  var RENDER = {
    location: function () {
      return '<h2 class="h2">どこへ行きますか？</h2><p class="lede">旅行先を選んでください。</p><div class="pick-grid">' +
        D.locations.map(function (l) {
          return '<button type="button" class="pick' + (bk.loc === l.id ? " is-selected" : "") + '" data-loc="' + l.id + '">' + photo(l, { alt: "" }) +
            '<span class="pick-name"><span class="en">' + esc(l.name) + '</span><span class="price">' + yen(l.fromPrice) + "〜</span></span></button>";
        }).join("") + "</div>";
    },
    date: function () {
      var l = bLoc();
      var t = D.today();
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
      return '<h2 class="h2">撮影する日を選ぶ</h2><p class="lede">' + esc(l.nameJa) + "は" + l.leadDays + "日前まで予約できます。旅行中の日付を選んでください。</p>" +
        '<div class="cal-nav"><button type="button" data-cal="-1"' + (calOffset <= 0 ? " disabled" : "") + ' aria-label="前の月">←</button><span class="cal-month">' + y + "." + String(m + 1).padStart(2, "0") +
        '</span><button type="button" data-cal="1"' + (calOffset >= 5 ? " disabled" : "") + ' aria-label="次の月">→</button></div>' +
        '<div class="cal">' + DOW.map(function (w) { return '<span class="cal-dow">' + w + "</span>"; }).join("") + cells.join("") + "</div>" +
        '<div class="cal-foot"><span class="legend"><span><i>◎</i>受付中</span><span><i>△</i>残りわずか</span><span><i>×</i>受付終了</span><span><i>―</i>締切</span></span></div>' +
        '<p class="note" style="margin-top:10px">※ 受付状況はデモ表示です。日時はリクエスト後に確定します。</p>';
    },
    time: function () {
      var l = bLoc();
      return '<h2 class="h2">時間を選ぶ</h2><p class="lede">' + fmtDate(bk.date) + " に申し込める時間です。</p>" +
        '<div class="slots" style="margin-top:0">' + l.timeSlots.map(function (t) {
          var st = D.slotStatus(l, bk.date, t), dis = st === "soldout" || st === "closed";
          return '<button type="button" class="slot is-' + st + (bk.time === t ? " is-selected" : "") + '" data-time="' + t + '"' + (dis ? " disabled" : "") + '><span class="t">' + t + '</span><span class="best">' +
            (t === l.bestTime ? "<b>BEST TIME</b>" + esc(l.bestTimeNote) : "") + '</span><span class="st">' + STATUS[st].en + "</span></button>";
        }).join("") + "</div>";
    },
    plan: function () {
      var l = bLoc();
      return '<h2 class="h2">プランとオプション</h2><p class="lede">基本のプロポーズプランは選択済みです。必要なものだけ追加してください。</p>' +
        '<div class="plan-toggle" role="radiogroup" aria-label="プラン">' + l.plans.map(function (p) {
          var desc = p.id === "standard" ? "撮影30分・花束・写真30枚以上・日本語サポート" : "プロポーズプラン＋" + D.options.length + "つのオプションすべて";
          return '<button type="button" role="radio" aria-checked="' + (bk.plan === p.id) + '" class="plan-opt' + (bk.plan === p.id ? " is-selected" : "") + '" data-plan="' + p.id + '"><span class="radio"></span><span><span class="en">' +
            esc(p.name) + "</span><p>" + esc(desc) + '</p></span><span class="price">' + yen(p.price) + "</span></button>";
        }).join("") + "</div>" +
        '<p class="sub-h">Option</p>' +
        D.options.map(function (o) {
          var inc = isIncluded(o.id), on = inc || bk.options.indexOf(o.id) > -1;
          return '<button type="button" role="checkbox" aria-checked="' + on + '" class="opt-pick' + (on ? " is-on" : "") + '" data-opt="' + o.id + '"' + (inc ? " disabled" : "") + '><span class="box">' + (on ? "✓" : "") +
            '</span><span><span class="en">' + esc(o.name) + "<span>" + esc(o.nameJa) + "</span></span><p>" + esc(o.desc) + '</p></span><span class="price">' + (inc ? "含まれています" : "+" + yen(o.price)) + "</span></button>";
        }).join("");
    },
    customer: function () {
      var c = bk.customer;
      function f(id, label, type, req, ac, ph) {
        return '<div class="field"><label for="c-' + id + '">' + label + (req ? '<span class="req">必須</span>' : '<span class="req" style="color:var(--ink-faint)">任意</span>') + "</label>" +
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
      return '<h2 class="h2">リクエスト内容の確認</h2><p class="lede">この内容でリクエストを送ります。フォトグラファーの手配を確認し、' + D.replyHours + '時間以内に確定可否をご連絡します。</p>' + summaryHTML() +
        '<button type="button" class="btn btn-block" id="bk-pay">予約をリクエストする（デモ）<span class="arrow" aria-hidden="true">→</span></button>' +
        '<p class="note" style="margin-top:12px;text-align:center">この時点ではお支払いは発生しません。予約の確定後に、お支払いのご案内をお送りします。</p>';
    }
  };

  function summaryHTML() {
    var l = bLoc(), p = bPlan();
    var extra = bOptions().filter(function (o) { return !isIncluded(o.id); });
    var rows = [
      ["Destination", l.name + "（" + l.nameJa + "）"],
      ["Date", fmtDate(bk.date, true)],
      ["Time", bk.time + (bk.time === l.bestTime ? "<small>BEST TIME・" + esc(l.bestTimeNote) + "</small>" : "")],
      ["Meeting", esc(l.meetingPoint)],
      ["Plan", esc(p.name) + "<small>" + yen(p.price) + "</small>"],
      ["Flexible", bk.customer.flex ? "同じ日の別の時間でも可" : "希望の時間のみ"],
      ["Option", extra.length ? extra.map(function (o) { return esc(o.nameJa) + " +" + yen(o.price); }).join("<br>") : (p.id === "allin" ? "すべて含まれています" : "なし")]
    ];
    return '<dl class="summary">' + rows.map(function (r) { return '<div class="sum-row"><dt>' + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") +
      '<div class="sum-total"><dt>TOTAL<small>確定後のお支払い</small></dt><dd class="price">' + yen(bTotal()) + "</dd></div></dl>";
  }

  var BIND = {
    location: function (b) {
      b.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-loc]"); if (!btn) return;
        if (bk.loc !== btn.dataset.loc) { bk.date = null; bk.time = null; }
        bk.loc = btn.dataset.loc;
        $$("[data-loc]", b).forEach(function (x) { x.classList.toggle("is-selected", x === btn); });
        updateBar(); autoNext();
      });
    },
    date: function (b) {
      b.addEventListener("click", function (e) {
        var c = e.target.closest("[data-cal]:not(:disabled)");
        if (c) { calOffset += Number(c.dataset.cal); bRender(); return; }
        var d = e.target.closest(".day-btn:not(:disabled)"); if (!d) return;
        if (bk.date !== d.dataset.date) bk.time = null;
        bk.date = d.dataset.date;
        $$(".day-btn", b).forEach(function (x) { x.classList.toggle("is-selected", x === d); });
        updateBar(); autoNext();
      });
    },
    time: function (b) {
      b.addEventListener("click", function (e) {
        var t = e.target.closest(".slot:not(:disabled)"); if (!t) return;
        bk.time = t.dataset.time;
        $$(".slot", b).forEach(function (x) { x.classList.toggle("is-selected", x === t); });
        updateBar(); autoNext();
      });
    },
    plan: function (b) {
      b.addEventListener("click", function (e) {
        var p = e.target.closest("[data-plan]");
        var o = e.target.closest("[data-opt]:not(:disabled)");
        if (p) { bk.plan = p.dataset.plan; if (bk.plan === "allin") bk.options = []; bRender(); }
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
          "<li><b>01</b><span>フォトグラファーの手配を確認し、" + D.replyHours + "時間以内にメールでご連絡します（" + (bk.customer.surprise ? "控えめな件名で送信" : "件名：ご予約リクエストについて") + "）。" +
            (bk.customer.flex ? "希望の時間が難しい場合は、同じ日の別の時間をご案内します。" : "ご希望の日時が難しい場合は、近い日時をご提案します。") + "</span></li>" +
          "<li><b>02</b><span>確定のメールにあるリンクからお支払いください。お支払いの完了で、予約が確定します。</span></li>" +
          "<li><b>03</b><span>撮影日の2日前までに、フォトグラファーから集合場所の詳細をお送りします。当日は " + esc(l.meetingPoint) + " へ。</span></li>" +
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
      bk.i = bk.steps.indexOf("date");
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
    if (path[0] === "propose" && path[1]) return { view: "location", id: path[1] };
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
      renderLocation(r.id);
      show("location");
      var l = D.getLocation(r.id);
      if (l) {
        setHeaderCta("#/book?loc=" + l.id, "予約する");
        setSticky('<div class="sticky-price"><small>FROM</small><span class="price">' + yen(l.fromPrice) + '</span></div><a class="btn" href="#/book?loc=' + l.id + '">この場所で予約する</a>');
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
