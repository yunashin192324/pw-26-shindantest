/* =====================================================================
   propose-booking.js — booking REQUEST flow (/pages/propose-booking)
   Ported from propose-lp/src/app.js (BOOKING).

   Steps adapt to what is already known:
     [location] → date → time → plan & options → your details → review
   ?loc=&date=&time= (from a location page) skip the steps already answered.

   Nothing is charged here. "予約をリクエストする" fills the hidden Shopify
   contact form (#pp-request-form) and submits it; the store receives the
   request by email, confirms within replyHours, then sends a draft-order
   invoice. After Shopify redirects back (?contact_posted=true) the
   completion screen is rebuilt from sessionStorage.
   Depends on window.ProposeAvail from propose.js (loaded by the layout).
   ===================================================================== */
(function () {
  "use strict";

  function init() {
    var A = window.ProposeAvail;
    var dataEl = document.getElementById("pp-booking-data");
    if (!A || !dataEl) return;
    var C;
    try { C = JSON.parse(dataEl.textContent); } catch (e) { return; }

    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
    var esc = A.esc, STATUS = A.STATUS, DOW = A.DOW;
    var STORE_KEY = "pp-request";
    function money(c) { return A.formatMoney(c, C.moneyFormat); }

    C.locations = (C.locations || []).filter(function (l) { return l.plans && l.plans.length; });
    C.locations.forEach(A.prepare);
    C.options = C.options || [];
    function getLocation(id) { return C.locations.filter(function (l) { return l.id === id; })[0] || null; }
    function fromPrice(l) { return l.plans[0].price; }

    var STEP_META = {
      location: { ja: "旅行先", en: "DESTINATION" },
      date: { ja: "日付", en: "DATE" },
      time: { ja: "時間", en: "TIME" },
      place: { ja: "場所", en: "PLACE" },
      plan: { ja: "プラン・オプション", en: "PLAN" },
      customer: { ja: "お客様情報", en: "YOUR DETAILS" },
      confirm: { ja: "リクエスト内容の確認", en: "REVIEW" }
    };
    var bk = null;
    var calOffset = 0;

    function bLoc() { return bk.loc ? getLocation(bk.loc) : null; }
    function firstOpenOffset(l) {
      var t = A.today();
      for (var i = 0; i < 180; i++) {
        var d = new Date(t); d.setDate(d.getDate() + i);
        if (A.isOpen(A.dateStatus(l, A.isoDate(d)))) return (d.getFullYear() - t.getFullYear()) * 12 + d.getMonth() - t.getMonth();
      }
      return 0;
    }
    function bPlan() { var l = bLoc(); return l ? l.plans.filter(function (p) { return p.id === bk.plan; })[0] || l.plans[0] : null; }
    function bTotal() { return describe(bk).total; }
    function needsHotel() { return describe(bk).extra.some(function (o) { return o.requiresHotel; }); }
    var FEE_TYPES = ["chapel", "church", "restaurant", "hotel"];
    var VENUE_NOTE = "※ 会場の使用料や条件は会場ごとに異なるため、確定のご連絡でご案内します。";
    function placeType(id) { return (C.placeTypes || []).filter(function (t) { return t.id === id; })[0] || null; }
    function placesOf(l) { return (l && l.places) || []; }
    function placeEntry(l, type) { return placesOf(l).filter(function (p) { return p.type === type; })[0] || null; }
    function placeLabel(s) {
      var t = s.place && placeType(s.place);
      return t ? t.ja + (s.venue ? "・" + s.venue : "") : "おまかせ";
    }
    function optionAvailable(o, p) { return !o.requiresPhoto || (!!p && p.hasPhoto); }
    function staff(p) { return p && p.hasPhoto ? "フォトグラファー" : "担当スタッフ"; }
    function hasSlots() { var l = bLoc(); return !!l && l.timeSlots.length > 0; }
    function curStep() { return bk.steps[bk.i]; }

    function stepsFor(withLocation) {
      var s = withLocation ? ["location", "date"] : ["date"];
      if (!bk.loc || hasSlots()) s.push("time");
      if (!bk.loc || placesOf(bLoc()).length) s.push("place");
      return s.concat(["plan", "customer", "confirm"]);
    }

    function startBooking(params, saved) {
      var l = params.loc && getLocation(params.loc);
      bk = { loc: l ? l.id : null, date: null, time: null, plan: ["light", "standard", "luxury"].indexOf(params.plan) > -1 ? params.plan : "standard", place: "", venue: "", placeNote: "", placeSet: false, options: [], customer: {}, steps: [], i: 0 };
      if (saved) {
        bk.loc = saved.loc; bk.date = saved.date; bk.time = saved.time; bk.plan = saved.plan; bk.place = saved.place || ""; bk.venue = saved.venue || ""; bk.placeNote = saved.placeNote || ""; bk.placeSet = true; bk.options = saved.options || []; bk.customer = saved.customer || {};
        l = getLocation(bk.loc);
      }
      if (l && !saved && params.place && placeEntry(l, params.place)) { bk.place = params.place; bk.placeSet = true; }
      bk.steps = stepsFor(!l);
      if (l && !saved && params.date && A.isOpen(A.dateStatus(l, params.date))) bk.date = params.date;
      if (l && !saved && bk.date && params.time && l.timeSlots.indexOf(params.time) > -1 && A.isOpen(A.slotStatus(l, bk.date, params.time))) bk.time = params.time;
      if (saved) bk.i = bk.steps.indexOf("confirm");
      else bk.i = bk.steps.indexOf(!bk.loc ? "location" : !bk.date ? "date" : (hasSlots() && !bk.time) ? "time" : (!bk.placeSet && bk.steps.indexOf("place") > -1) ? "place" : "plan");
      calOffset = 0;
      if (bk.date) {
        var dd = new Date(bk.date + "T00:00:00"), t = A.today();
        calOffset = (dd.getFullYear() - t.getFullYear()) * 12 + dd.getMonth() - t.getMonth();
      }
      var back = $("#bk-back-link");
      back.href = l ? l.url : C.topUrl;
      back.textContent = l ? "← " + l.name : "← TOP";
      bRender();
    }

    function go(delta) {
      var ni = bk.i + delta;
      if (ni < 0 || ni >= bk.steps.length) return;
      if (delta > 0 && !canNext()) return;
      bk.i = ni;
      bRender();
    }
    function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || ""); }
    function canNext() {
      switch (curStep()) {
        case "location": return !!bk.loc;
        case "date": return !!bk.date;
        case "time": return !!bk.time;
        case "place": return true;
        case "plan": return true;
        case "customer":
          var c = bk.customer;
          return !!(c.name && c.name.trim() && validEmail(c.email) && c.agree && (!needsHotel() || (c.hotel && c.hotel.trim())));
        default: return false;
      }
    }
    function autoNext() { setTimeout(function () { if (canNext()) go(1); }, 260); }

    function bRender(errorMsg) {
      var step = curStep(), total = bk.steps.length;
      $("#bk-step-count").textContent = "STEP " + (bk.i + 1) + " / " + total + "　" + STEP_META[step].ja;
      $("#bk-step-en").textContent = STEP_META[step].en;
      $("#bk-bar-fill").style.width = ((bk.i + 1) / total * 100) + "%";
      $("#bk-progress").classList.remove("hidden");
      $("#bk-bar").classList.remove("hidden");

      var l = bLoc(), chips = [];
      if (l && step !== "location") chips.push('<span class="chip"><span class="en">' + esc(l.name) + "</span>" + esc(l.nameJa) + '<button type="button" data-change="location">変更</button></span>');
      if (bk.date && ["time", "place", "plan", "customer", "confirm"].indexOf(step) > -1) chips.push('<span class="chip">' + A.fmtShort(bk.date) + (bk.time && step !== "time" ? " " + esc(bk.time) : "") + '<button type="button" data-change="date">変更</button></span>');
      if (bk.placeSet && ["plan", "customer", "confirm"].indexOf(step) > -1) chips.push('<span class="chip">' + esc(placeLabel(bk)) + '<button type="button" data-change="place">変更</button></span>');
      $("#bk-context").innerHTML = chips.join("");

      var body = $("#bk-body");
      body.innerHTML = '<div class="bk-step">' + (errorMsg ? '<p class="bk-error" role="alert">' + esc(errorMsg) + "</p>" : "") + RENDER[step]() + "</div>";
      // Bind to the freshly rendered step, never to #bk-body itself (it persists; listeners would stack).
      if (BIND[step]) BIND[step](body.firstChild);
      updateBar();
      window.scrollTo(0, 0);
    }
    function updateBar() {
      var step = curStep();
      $("#bk-total").textContent = bLoc() ? money(bTotal()) : "—";
      $("#bk-prev").classList.toggle("hidden", bk.i === 0);
      var next = $("#bk-next");
      next.classList.toggle("hidden", step === "confirm");
      next.textContent = step === "customer" ? "確認へ" : "次へ";
      next.disabled = !canNext();
    }

    function photoHTML(l) {
      if (!l.photo) return '<div class="photo"></div>';
      return '<div class="photo"><img src="' + esc(l.photo) + '" alt="" loading="lazy" decoding="async" style="object-position:' + esc(l.photoPos) + '"></div>';
    }

    var RENDER = {
      location: function () {
        return '<h2 class="h2">どこへ行きますか？</h2><p class="lede">旅行先を選んでください。</p><div class="pick-grid">' +
          C.locations.map(function (l) {
            return '<button type="button" class="pick' + (bk.loc === l.id ? " is-selected" : "") + '" data-loc="' + esc(l.id) + '">' + photoHTML(l) +
              '<span class="pick-name"><span class="en">' + esc(l.name) + '</span><span class="price">' + money(fromPrice(l)) + "〜</span></span></button>";
          }).join("") + "</div>";
      },
      date: function () {
        var l = bLoc(), t = A.today();
        // Open on the first month that still has a bookable day (e.g. a 7-day lead late in the month).
        if (!bk.date && !bk.calSet) { calOffset = firstOpenOffset(l); bk.calSet = true; }
        var base = new Date(t.getFullYear(), t.getMonth() + calOffset, 1);
        var y = base.getFullYear(), m = base.getMonth();
        var first = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
        var cells = [];
        for (var i = 0; i < first; i++) cells.push('<span class="empty"></span>');
        for (var d = 1; d <= dim; d++) {
          var iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
          var past = A.daysFromToday(iso) < 0;
          var st = past ? "closed" : A.dateStatus(l, iso);
          cells.push('<button type="button" class="day-btn is-' + st + (past ? " is-past" : "") + (bk.date === iso ? " is-selected" : "") + '" data-date="' + iso + '"' + (A.isOpen(st) ? "" : " disabled") +
            ' aria-label="' + A.fmtDate(iso) + " " + STATUS[st].ja + '"><span class="dn">' + d + '</span><span class="ds">' + (past ? "" : STATUS[st].mark) + "</span></button>");
        }
        return '<h2 class="h2">プロポーズの日を選ぶ</h2><p class="lede">' + esc(l.nameJa) + "は" + l.leadDays + "日前までリクエストできます。旅行中の日付を選んでください。</p>" +
          '<div class="cal-nav"><button type="button" data-cal="-1"' + (calOffset <= 0 ? " disabled" : "") + ' aria-label="前の月">←</button><span class="cal-month">' + y + "." + String(m + 1).padStart(2, "0") +
          '</span><button type="button" data-cal="1"' + (calOffset >= 11 ? " disabled" : "") + ' aria-label="次の月">→</button></div>' +
          '<div class="cal">' + DOW.map(function (w) { return '<span class="cal-dow">' + w + "</span>"; }).join("") + cells.join("") + "</div>" +
          '<div class="cal-foot">' + A.LEGEND + "</div>" +
          '<p class="note" style="margin-top:10px">※ 日時はリクエスト後、手配を確認してから確定します。</p>';
      },
      time: function () {
        var l = bLoc();
        return '<h2 class="h2">時間を選ぶ</h2><p class="lede">' + A.fmtDate(bk.date) + " に申し込める時間です。</p>" +
          '<div class="slots" style="margin-top:0">' + l.timeSlots.map(function (t) {
            var st = A.slotStatus(l, bk.date, t);
            return '<button type="button" class="slot is-' + st + (bk.time === t ? " is-selected" : "") + '" data-time="' + esc(t) + '"' + (A.isOpen(st) ? "" : " disabled") + '><span class="t">' + esc(t) + '</span><span class="best">' +
              (l.bestTime && t === l.bestTime ? "<b>BEST TIME</b>" + esc(l.bestTimeNote) : "") + '</span><span class="st">' + STATUS[st].en + "</span></button>";
          }).join("") + "</div>";
      },
      place: function () {
        var l = bLoc(), entry = placeEntry(l, bk.place);
        var opts = [{ type: "", venues: [] }].concat(placesOf(l));
        return '<h2 class="h2">プロポーズの場所を選ぶ</h2><p class="lede">' + esc(l.nameJa) + "で選べる場所です。会場を指定することもできます。</p>" +
          '<div class="plan-toggle" role="radiogroup" aria-label="場所">' + opts.map(function (o) {
            var t = o.type ? placeType(o.type) : null, on = bk.place === o.type;
            var sub = t ? esc(t.desc) + (o.venues.length ? "（会場の指定もできます）" : "") : esc(l.meetingPoint || "おすすめの場所") + "など、その日にいちばん合う場所をご案内します。";
            return '<button type="button" role="radio" aria-checked="' + on + '" class="plan-opt is-place' + (on ? " is-selected" : "") + '" data-place="' + esc(o.type) + '"><span class="radio"></span><span><span class="en">' +
              (t ? t.en : "ANY") + '</span><b class="place-ja">' + (t ? esc(t.ja) : "おまかせ") + "</b><p>" + sub + "</p></span></button>";
          }).join("") + "</div>" +
          (entry && entry.venues.length ?
            '<p class="sub-h">Venue</p>' +
            '<div class="plan-toggle venue-toggle" role="radiogroup" aria-label="会場">' + [""].concat(entry.venues).map(function (v) {
              var on = bk.venue === v;
              return '<button type="button" role="radio" aria-checked="' + on + '" class="plan-opt is-compact' + (on ? " is-selected" : "") + '" data-pvenue="' + esc(v) + '"><span class="radio"></span><span>' + (v ? esc(v) : "指定なし（おすすめをご案内）") + "</span></button>";
            }).join("") + "</div>" : "") +
          (bk.place ? '<div class="field"><label for="c-placenote">ご希望があればご記入ください<span class="req" style="color:var(--ink-faint)">任意</span></label><input id="c-placenote" type="text" maxlength="200" value="' + esc(bk.placeNote) + '" placeholder="例：滞在中のホテル名、行きたいお店など"></div>' : "") +
          (FEE_TYPES.indexOf(bk.place) > -1 ? '<p class="note">' + VENUE_NOTE + "</p>" : "");
      },
      plan: function () {
        var l = bLoc(), cur = bPlan();
        return '<h2 class="h2">プランとオプション</h2><p class="lede">プランを選び、必要なものだけ追加してください。</p>' +
          '<div class="plan-toggle" role="radiogroup" aria-label="プラン">' + l.plans.map(function (p) {
            var on = cur.id === p.id;
            return '<button type="button" role="radio" aria-checked="' + on + '" class="plan-opt' + (on ? " is-selected" : "") + '" data-plan="' + p.id + '"><span class="radio"></span><span><span class="en">' +
              esc(p.name) + "</span><p>" + esc(p.nameJa) + "｜" + esc(p.summary) + '</p></span><span class="price">' + money(p.price) + "</span></button>";
          }).join("") + "</div>" +
          (C.options.length ? '<p class="sub-h">Option</p>' + C.options.map(function (o) {
            var ok = optionAvailable(o, cur), on = ok && bk.options.indexOf(o.id) > -1;
            return '<button type="button" role="checkbox" aria-checked="' + on + '" class="opt-pick' + (on ? " is-on" : "") + '" data-opt="' + esc(o.id) + '"' + (ok ? "" : " disabled") + '><span class="box">' + (on ? "✓" : "") +
              '</span><span><span class="en">' + esc(o.name) + (o.nameJa ? "<span>" + esc(o.nameJa) + "</span>" : "") + "</span><p>" + esc(o.desc) + '</p></span><span class="price">' + (ok ? "+" + money(o.price) : "撮影付きプランのみ") + "</span></button>";
          }).join("") : "");
      },
      customer: function () {
        var c = bk.customer;
        function f(id, label, type, req, ac, ph) {
          return '<div class="field"><label for="c-' + id + '">' + label + (req ? '<span class="req">必須</span>' : '<span class="req" style="color:var(--ink-faint)">任意</span>') + "</label>" +
            '<input id="c-' + id + '" type="' + type + '" autocomplete="' + ac + '" value="' + esc(c[id] || "") + '" placeholder="' + ph + '"' + (req ? " required" : "") + "></div>";
        }
        var terms = C.termsUrl ? '<a href="' + esc(C.termsUrl) + '" target="_blank" rel="noopener" style="text-decoration:underline">利用規約・キャンセルポリシー</a>' : "利用規約・キャンセルポリシー";
        return '<h2 class="h2">ご予約者さまの情報</h2><p class="lede">確定のご連絡と当日の連絡に使います。この時点でのお支払いはありません。</p>' +
          f("name", "お名前", "text", true, "name", "山田 太郎") +
          f("email", "メールアドレス", "email", true, "email", "you@example.com") +
          f("phone", "電話番号（当日の連絡用）", "tel", false, "tel", "090-0000-0000") +
          (needsHotel() ? f("hotel", "ご滞在ホテル（送迎用）", "text", true, "off", "例：ハレクラニ") : "") +
          '<label class="check"><input type="checkbox" id="c-surprise"' + (c.surprise ? " checked" : "") + "><span>サプライズなので、メールは控えめな件名にしてほしい</span></label>" +
          '<label class="check"><input type="checkbox" id="c-flex"' + (c.flex ? " checked" : "") + "><span>希望の時間が難しい場合、同じ日の別の時間でもよい</span></label>" +
          '<label class="check"><input type="checkbox" id="c-agree"' + (c.agree ? " checked" : "") + "><span>" + terms + "に同意する</span></label>";
      },
      confirm: function () {
        return '<h2 class="h2">リクエスト内容の確認</h2><p class="lede">この内容でリクエストを送ります。' + (bPlan().hasPhoto ? "フォトグラファーの" : "") + '手配を確認し、' + C.replyHours + "時間以内に確定可否をご連絡します。</p>" + summaryHTML(bk) +
          '<button type="button" class="btn btn-block" id="bk-send">予約をリクエストする <span class="arrow" aria-hidden="true">→</span></button>' +
          '<p class="note" style="margin-top:12px;text-align:center">この時点ではお支払いは発生しません。予約の確定後に、お支払いのご案内をお送りします。</p>';
      }
    };

    // Works on the live state or on a saved copy (completion screen after the redirect).
    function describe(s) {
      var l = getLocation(s.loc);
      var p = l && (l.plans.filter(function (x) { return x.id === s.plan; })[0] || l.plans[0]);
      var extra = C.options.filter(function (o) { return (s.options || []).indexOf(o.id) > -1 && optionAvailable(o, p); });
      var total = p ? extra.reduce(function (sum, o) { return sum + o.price; }, p.price) : 0;
      return { l: l, p: p, extra: extra, total: total, hasPlaces: placesOf(l).length > 0 };
    }
    function summaryHTML(s) {
      var x = describe(s), l = x.l, p = x.p;
      if (!l || !p) return "";
      var rows = [
        ["Destination", esc(l.name) + "（" + esc(l.nameJa) + "）"],
        ["Date", A.fmtDate(s.date, true)]
      ];
      if (s.time) rows.push(["Time", esc(s.time) + (l.bestTime && s.time === l.bestTime ? "<small>BEST TIME・" + esc(l.bestTimeNote) + "</small>" : "")]);
      rows.push(["Meeting", esc(l.meetingPoint || "確定のご連絡でご案内します")]);
      rows.push(["Plan", esc(p.name) + "<small>" + esc(p.summary) + "・" + money(p.price) + "</small>"]);
      if (x.hasPlaces) rows.push(["Place", esc(placeLabel(s)) + (s.placeNote ? "<small>" + esc(s.placeNote) + "</small>" : "")]);
      if (s.time) rows.push(["Flexible", s.customer && s.customer.flex ? "同じ日の別の時間でも可" : "希望の時間のみ"]);
      rows.push(["Option", x.extra.length ? x.extra.map(function (o) { return esc(o.nameJa || o.name) + " +" + money(o.price); }).join("<br>") : "なし"]);
      return '<dl class="summary">' + rows.map(function (r) { return '<div class="sum-row"><dt>' + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") +
        '<div class="sum-total"><dt>TOTAL<small>確定後のお支払い</small></dt><dd class="price">' + money(x.total) + "</dd></div></dl>";
    }

    var BIND = {
      location: function (b) {
        b.addEventListener("click", function (e) {
          var btn = e.target.closest("[data-loc]"); if (!btn) return;
          if (bk.loc !== btn.getAttribute("data-loc")) { bk.date = null; bk.time = null; bk.place = ""; bk.venue = ""; bk.placeNote = ""; bk.placeSet = false; bk.calSet = false; }
          bk.loc = btn.getAttribute("data-loc");
          // The time step only exists for destinations with fixed time slots.
          var rest = stepsFor(true);
          bk.steps = rest;
          $$("[data-loc]", b).forEach(function (x) { x.classList.toggle("is-selected", x === btn); });
          updateBar(); autoNext();
        });
      },
      date: function (b) {
        b.addEventListener("click", function (e) {
          var c = e.target.closest("[data-cal]:not(:disabled)");
          if (c) { calOffset += Number(c.getAttribute("data-cal")); bRender(); return; }
          var d = e.target.closest(".day-btn:not(:disabled)"); if (!d) return;
          if (bk.date !== d.getAttribute("data-date")) bk.time = null;
          bk.date = d.getAttribute("data-date");
          $$(".day-btn", b).forEach(function (x) { x.classList.toggle("is-selected", x === d); });
          updateBar(); autoNext();
        });
      },
      time: function (b) {
        b.addEventListener("click", function (e) {
          var t = e.target.closest(".slot:not(:disabled)"); if (!t) return;
          bk.time = t.getAttribute("data-time");
          $$(".slot", b).forEach(function (x) { x.classList.toggle("is-selected", x === t); });
          updateBar(); autoNext();
        });
      },
      place: function (b) {
        b.addEventListener("click", function (e) {
          var c = e.target.closest("[data-place]"), v = e.target.closest("[data-pvenue]");
          if (c) {
            if (bk.place !== c.getAttribute("data-place")) bk.venue = "";
            bk.place = c.getAttribute("data-place"); bk.placeSet = true;
            bRender();
            if (!bk.place) autoNext(); // "おまかせ" needs nothing else
          }
          if (v) { bk.venue = v.getAttribute("data-pvenue"); bRender(); }
        });
        var note = $("#c-placenote", b);
        if (note) note.addEventListener("input", function () { bk.placeNote = note.value; });
      },
      plan: function (b) {
        b.addEventListener("click", function (e) {
          var p = e.target.closest("[data-plan]"), o = e.target.closest("[data-opt]:not(:disabled)");
          if (p) { bk.plan = p.getAttribute("data-plan"); bRender(); }
          if (o) {
            var id = o.getAttribute("data-opt"), i = bk.options.indexOf(id);
            if (i > -1) bk.options.splice(i, 1); else bk.options.push(id);
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
        $("#bk-send", b).addEventListener("click", function () { send(this); });
      }
    };

    /* ---------------- submit via Shopify contact form ---------------- */
    function requestText(s, code) {
      var x = describe(s), l = x.l, p = x.p, c = s.customer || {};
      var lines = [
        "【プロポーズ予約リクエスト】" + code,
        "旅行先: " + l.name + "（" + l.nameJa + "）",
        "希望日: " + A.fmtDate(s.date, true),
        "時間: " + (s.time ? s.time + (l.bestTime && s.time === l.bestTime ? "（BEST TIME・" + l.bestTimeNote + "）" : "") : "未指定（確定時に相談）"),
        "時間の調整: " + (c.flex ? "同じ日の別の時間でも可" : "希望の時間のみ"),
        "集合場所: " + (l.meetingPoint || "-"),
        "プラン: " + p.name + "（" + p.summary + "） " + money(p.price),
        "場所: " + (x.hasPlaces ? placeLabel(s) + (s.placeNote ? "（ご希望：" + s.placeNote + "）" : "") : "-"),
        "オプション: " + (x.extra.length ? x.extra.map(function (o) { return (o.nameJa || o.name) + " +" + money(o.price); }).join(" / ") : "なし"),
        "合計: " + money(x.total),
        "",
        "お名前: " + (c.name || ""),
        "メール: " + (c.email || ""),
        "電話: " + (c.phone || "-"),
        "滞在ホテル: " + (c.hotel || "-"),
        "サプライズ配慮: " + (c.surprise ? "控えめな件名で連絡" : "なし"),
        "",
        C.replyHours + "時間以内に確定可否を返信してください。"
      ];
      return lines.join("\n");
    }
    function send(btn) {
      var form = document.getElementById("pp-request-form");
      if (!form) return;
      var code = "PRP-" + String(new Date().getFullYear()).slice(2) + Math.random().toString(36).slice(2, 7).toUpperCase();
      var x = describe(bk), l = x.l, c = bk.customer;
      var values = {
        name: c.name, email: c.email, phone: c.phone || "", code: code,
        location: l.name + "（" + l.nameJa + "）",
        date: A.fmtDate(bk.date, true),
        time: bk.time || "未指定",
        flexible: c.flex ? "同じ日の別の時間でも可" : "希望の時間のみ",
        plan: x.p.name + "（" + x.p.summary + "） " + money(x.p.price),
        place: x.hasPlaces ? placeLabel(bk) + (bk.placeNote ? "（ご希望：" + bk.placeNote + "）" : "") : "",
        options: x.extra.length ? x.extra.map(function (o) { return (o.nameJa || o.name) + " +" + money(o.price); }).join(" / ") : "なし",
        total: money(x.total),
        hotel: c.hotel || "",
        surprise: c.surprise ? "控えめな件名で連絡" : "なし",
        body: requestText(bk, code)
      };
      $$("[data-f]", form).forEach(function (el) { el.value = values[el.getAttribute("data-f")] || ""; });
      try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify({ code: code, state: { loc: bk.loc, date: bk.date, time: bk.time, plan: bk.plan, place: bk.place, venue: bk.venue, placeNote: bk.placeNote, options: bk.options, customer: bk.customer } }));
      } catch (e) { /* completion screen falls back to a generic message */ }
      btn.disabled = true;
      btn.textContent = "送信しています…";
      form.submit();
    }

    function renderDone(saved) {
      var s = saved && saved.state, c = (s && s.customer) || {};
      $("#bk-progress").classList.add("hidden");
      $("#bk-bar").classList.add("hidden");
      $("#bk-context").innerHTML = "";
      var l = s && getLocation(s.loc), x = s && l ? describe(s) : null;
      $("#bk-body").innerHTML =
        '<div class="done bk-step">' +
          '<span class="label">Request received.</span>' +
          '<h2 class="h2">リクエストを、<br>受け付けました。</h2>' +
          '<p class="lede">' + (saved ? "リクエスト番号 <b class=\"en\" style=\"font-weight:600\">" + esc(saved.code) + "</b><br>" : "") +
            "まだ予約は確定していません。" + C.replyHours + "時間以内に、" + (c.email ? esc(c.email) + " へ" : "ご入力のメールアドレスへ") + "確定可否をご連絡します。</p>" +
          (s && l ? summaryHTML(s) : "") +
          '<ol class="next-steps">' +
            "<li><b>01</b><span>" + (x && x.p && x.p.hasPhoto ? "フォトグラファーの" : "") + "手配を確認し、" + C.replyHours + "時間以内にメールでご連絡します" + (c.surprise ? "（控えめな件名で送信）" : "") + "。" +
              (c.flex ? "希望の時間が難しい場合は、同じ日の別の時間をご案内します。" : "ご希望の日時が難しい場合は、近い日時をご提案します。") + "</span></li>" +
            "<li><b>02</b><span>確定のメールにあるリンクからお支払いください。お支払いの完了で、予約が確定します。</span></li>" +
            "<li><b>03</b><span>当日の2日前までに、" + staff(x && x.p) + "から集合場所の詳細をお送りします。" + (l && l.meetingPoint ? "当日は " + esc(l.meetingPoint) + " へ。" : "") + "</span></li>" +
          "</ol>" +
          '<a class="btn btn-ghost" href="' + esc(C.topUrl) + '">TOPへ戻る</a>' +
        "</div>";
      window.scrollTo(0, 0);
    }

    $("#bk-next").addEventListener("click", function () { go(1); });
    $("#bk-prev").addEventListener("click", function () { go(-1); });
    $("#bk-context").addEventListener("click", function (e) {
      var c = e.target.closest("[data-change]"); if (!c) return;
      if (c.getAttribute("data-change") === "location") {
        if (bk.steps[0] !== "location") bk.steps = stepsFor(true);
        bk.i = 0;
      } else {
        bk.i = bk.steps.indexOf(c.getAttribute("data-change") === "place" ? "place" : "date");
      }
      bRender();
    });

    /* ---------------- start ---------------- */
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch (e) { saved = null; }
    var params = {};
    new URLSearchParams(location.search).forEach(function (v, k) { params[k] = v; });

    if (document.getElementById("pp-request-ok")) {
      renderDone(saved);
      try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    } else if (document.getElementById("pp-request-error") && saved && getLocation(saved.state.loc)) {
      startBooking({}, saved.state);
      bRender("送信できませんでした。" + (document.getElementById("pp-request-error").getAttribute("data-message") || "") + " 内容をご確認のうえ、もう一度お試しください。");
    } else {
      startBooking(params, null);
    }
  }

  // This file is deferred and sits before propose.js in the document, so it can run
  // first; DOMContentLoaded fires only after every deferred script has executed.
  if (window.ProposeAvail || document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
