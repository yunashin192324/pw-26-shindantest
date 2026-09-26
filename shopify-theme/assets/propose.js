/* =====================================================================
   propose.js — shared behaviour for the propose layout
   (TOP /pages/propose, location /pages/propose/<handle>, booking).
     - header over the hero, mobile drawer, sticky CTA
     - smooth in-page scrolling (data-scroll / same-page #links)
     - reveal on scroll
     - FAQ "show all", scene explorer
     - availability rules (window.ProposeAvail) + the 14-day quick check
   Ported from propose-lp/src/app.js; markup is server-rendered by Liquid.
   ===================================================================== */
(function () {
  "use strict";
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var DOW = ["日", "月", "火", "水", "木", "金", "土"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  /* ---------------- availability rules ----------------
     Booking is request-based: these statuses say whether a slot can be
     REQUESTED, never that it is confirmed.
       closed  — within the destination's lead_time (automatic)
       soldout — listed in blocked_slots   ("2026-10-03" or "2026-10-03 17:30")
       few     — listed in few_left_slots  (same format)
       available — everything else */
  var STATUS = {
    available: { mark: "◎", ja: "受付中", en: "OPEN" },
    few: { mark: "△", ja: "残りわずか", en: "FEW LEFT" },
    soldout: { mark: "×", ja: "受付終了", en: "FULL" },
    closed: { mark: "―", ja: "締切", en: "CLOSED" }
  };
  function pad(n) { return String(n).padStart(2, "0"); }
  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function daysFromToday(iso) { return Math.round((new Date(iso + "T00:00:00") - today()) / 86400000); }
  // Accepts 2026-10-03, 2026/10/3, "2026-10-03 17:30", "2026-10-03 7:30".
  function normalizeEntry(s) {
    var m = String(s || "").trim().match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?$/);
    if (!m) return null;
    var d = m[1] + "-" + pad(m[2]) + "-" + pad(m[3]);
    return m[4] ? d + " " + pad(m[4]) + ":" + m[5] : d;
  }
  function prepare(loc) {
    if (loc._ready) return loc;
    loc.timeSlots = (loc.timeSlots || []).map(function (t) { return String(t).trim(); }).filter(Boolean);
    loc._blocked = {}; loc._few = {};
    (loc.blocked || []).forEach(function (s) { var k = normalizeEntry(s); if (k) loc._blocked[k] = true; });
    (loc.few || []).forEach(function (s) { var k = normalizeEntry(s); if (k) loc._few[k] = true; });
    loc.leadDays = Number(loc.leadDays) || 0;
    loc._ready = true;
    return loc;
  }
  function slotStatus(loc, dateStr, time) {
    prepare(loc);
    if (daysFromToday(dateStr) < loc.leadDays) return "closed";
    var t = normalizeEntry(dateStr + " " + time) || (dateStr + " " + time);
    if (loc._blocked[dateStr] || loc._blocked[t]) return "soldout";
    if (loc._few[dateStr] || loc._few[t]) return "few";
    return "available";
  }
  function dateStatus(loc, dateStr) {
    prepare(loc);
    if (daysFromToday(dateStr) < loc.leadDays) return "closed";
    if (!loc.timeSlots.length) return loc._blocked[dateStr] ? "soldout" : loc._few[dateStr] ? "few" : "available";
    var st = loc.timeSlots.map(function (t) { return slotStatus(loc, dateStr, t); });
    if (st.indexOf("available") > -1) return "available";
    if (st.indexOf("few") > -1) return "few";
    return "soldout";
  }
  function isOpen(st) { return st === "available" || st === "few"; }
  function fmtDate(iso, withYear) {
    var d = new Date(iso + "T00:00:00");
    return (withYear ? d.getFullYear() + "年" : "") + (d.getMonth() + 1) + "月" + d.getDate() + "日（" + DOW[d.getDay()] + "）";
  }
  function fmtShort(iso) {
    var d = new Date(iso + "T00:00:00");
    return (d.getMonth() + 1) + "/" + d.getDate() + "（" + DOW[d.getDay()] + "）";
  }
  // Shopify prices are integers in the currency's subunit (cents).
  function formatMoney(cents, format) {
    var amount = Number(cents || 0) / 100;
    var noDec = Math.round(amount).toLocaleString("ja-JP");
    var withDec = amount.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return String(format || "¥{{amount_no_decimals}}").replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, k) {
      return /no_decimals/.test(k) ? noDec : withDec;
    });
  }
  var LEGEND = '<span class="legend"><span><i>◎</i>受付中</span><span><i>△</i>残りわずか</span><span><i>×</i>受付終了</span><span><i>―</i>締切</span></span>';

  window.ProposeAvail = {
    STATUS: STATUS, DOW: DOW, LEGEND: LEGEND, esc: esc, isoDate: isoDate, today: today, daysFromToday: daysFromToday,
    slotStatus: slotStatus, dateStatus: dateStatus, isOpen: isOpen, prepare: prepare,
    fmtDate: fmtDate, fmtShort: fmtShort, formatMoney: formatMoney
  };

  /* ---------------- reveal on scroll ---------------- */
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }) : null;
  function observeReveals(root) {
    $$(".reveal:not(.is-in), .reveal-img:not(.is-in)", root).forEach(function (el) {
      if (io) io.observe(el); else el.classList.add("is-in");
    });
  }
  window.ProposeAvail.observeReveals = observeReveals;

  /* ---------------- header, drawer, sticky CTA ---------------- */
  var hd = $("#hd"), drawer = $("#hd-drawer"), menu = $("#hd-menu"), sticky = $("#sticky-cta");
  var hero = $(".hero, .lhero");
  var hideOver = sticky && sticky.getAttribute("data-hide-over") ? document.getElementById(sticky.getAttribute("data-hide-over")) : null;

  function onScroll() {
    var y = window.scrollY;
    var heroEnd = hero ? hero.offsetHeight - 80 : 0;
    if (hd) hd.classList.toggle("is-over", !!hero && y < heroEnd && !(drawer && drawer.classList.contains("is-open")));
    if (!sticky) return;
    var show = !!hero && y > heroEnd * 0.6;
    if (hideOver) {
      var r = hideOver.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.6 && r.bottom > window.innerHeight * 0.4) show = false;
    }
    sticky.classList.toggle("is-shown", show);
    sticky.setAttribute("aria-hidden", String(!show));
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("is-open");
    if (menu) menu.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  if (menu && drawer) {
    menu.addEventListener("click", function () {
      var open = !drawer.classList.contains("is-open");
      drawer.classList.toggle("is-open", open);
      menu.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
      onScroll();
    });
  }

  function scrollToId(id, smooth) {
    var el = document.getElementById(id);
    if (!el) return false;
    var top = el.getBoundingClientRect().top + window.scrollY - (window.innerWidth >= 960 ? 76 : 64) + 1;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top, behavior: smooth && !reduce ? "smooth" : "auto" });
    return true;
  }

  document.addEventListener("click", function (e) {
    var s = e.target.closest("[data-scroll]");
    if (s) { e.preventDefault(); closeDrawer(); scrollToId(s.getAttribute("data-scroll"), true); return; }
    var a = e.target.closest("a[href*='#']");
    if (!a || a.target) return;
    var url = new URL(a.href, location.href);
    if (url.pathname === location.pathname && url.hash.length > 1 && document.getElementById(url.hash.slice(1))) {
      e.preventDefault();
      closeDrawer();
      scrollToId(url.hash.slice(1), true);
      if (history.replaceState) history.replaceState(null, "", url.hash);
    } else {
      closeDrawer();
    }
  });

  /* ---------------- FAQ "show all" ---------------- */
  $$("[data-faq-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      $$("[data-faq-more]").forEach(function (el) { el.classList.remove("hidden"); });
      btn.parentNode.remove();
    });
  });

  /* ---------------- scene explorer (TOP) ---------------- */
  var themes = $("[data-themes]"), results = $("[data-theme-results]");
  if (themes && results) {
    themes.addEventListener("click", function (e) {
      var btn = e.target.closest(".theme");
      if (!btn) return;
      var on = btn.getAttribute("aria-pressed") !== "true";
      $$(".theme", themes).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      btn.setAttribute("aria-pressed", String(on));
      var tag = " " + btn.getAttribute("data-theme") + " ";
      var any = false;
      $$(".result-row", results).forEach(function (row) {
        var match = on && (row.getAttribute("data-tags") || "").indexOf(tag) > -1;
        row.classList.toggle("hidden", !match);
        any = any || match;
      });
      results.classList.toggle("is-open", any);
    });
  }

  /* ---------------- place picker (location page) ----------------
     The chosen place travels with every booking link on the page as &place=<type>. */
  var currentPlace = "";
  var picker = $("[data-place-picker]");
  function applyPlace() {
    $$('a[href*="/pages/propose-booking?loc="]').forEach(function (a) {
      var u = new URL(a.getAttribute("href"), location.href);
      if (currentPlace) u.searchParams.set("place", currentPlace); else u.searchParams.delete("place");
      a.setAttribute("href", u.pathname + u.search);
    });
  }
  function selectPlace(type) {
    if (!picker) return;
    currentPlace = type;
    $$(".place-chip", picker).forEach(function (c) {
      var on = c.getAttribute("data-place") === type;
      c.classList.toggle("is-selected", on);
      c.setAttribute("aria-checked", String(on));
    });
    $$("[data-place-panel]", picker).forEach(function (p) { p.hidden = p.getAttribute("data-place-panel") !== type; });
    applyPlace();
  }
  if (picker) {
    picker.addEventListener("click", function (e) {
      var c = e.target.closest("[data-place]");
      if (c) selectPlace(c.getAttribute("data-place"));
    });
    var fromUrl = new URLSearchParams(location.search).get("place");
    if (fromUrl && picker.querySelector('[data-place="' + fromUrl.replace(/[^a-z]/g, "") + '"]')) selectPlace(fromUrl);
  }

  /* ---------------- 14-day quick check (location page) ---------------- */
  var box = $("[data-avail]");
  if (box) {
    var dataEl = document.getElementById(box.getAttribute("data-avail"));
    var loc = null;
    try { loc = dataEl ? prepare(JSON.parse(dataEl.textContent)) : null; } catch (err) { loc = null; }
    if (loc) renderAvail(box, loc);
  }

  function renderAvail(box, l) {
    var start = today(), days = [];
    for (var i = 0; i < 14; i++) { var d = new Date(start); d.setDate(d.getDate() + i); days.push(isoDate(d)); }
    var sel = { date: days.filter(function (iso) { return isOpen(dateStatus(l, iso)); })[0] || null, time: null };
    var bookBase = (l.bookingUrl || "/pages/propose-booking") + "?loc=" + encodeURIComponent(l.id);

    function draw() {
      var dayBtns = days.map(function (iso) {
        var st = dateStatus(l, iso), dt = new Date(iso + "T00:00:00");
        return '<button type="button" class="day-btn is-' + st + (sel.date === iso ? " is-selected" : "") + '" data-date="' + iso + '"' + (isOpen(st) ? "" : " disabled") +
          ' aria-label="' + fmtDate(iso) + " " + STATUS[st].ja + '">' +
          '<span class="dw">' + ((iso === days[0] || dt.getDate() === 1) ? (dt.getMonth() + 1) + "月 " : "") + DOW[dt.getDay()] + '</span><span class="dn">' + dt.getDate() + '</span><span class="ds">' + STATUS[st].mark + "</span></button>";
      }).join("");
      var slots;
      if (!sel.date) slots = '<p class="slots-empty">この先2週間は受付を終了しています。先の日付をご確認ください。</p>';
      else if (!l.timeSlots.length) slots = '<p class="slots-empty">時間は、確定のご連絡の際にご相談します。</p>';
      else slots = l.timeSlots.map(function (t) {
        var st = slotStatus(l, sel.date, t);
        return '<button type="button" class="slot is-' + st + (sel.time === t ? " is-selected" : "") + '" data-time="' + esc(t) + '"' + (isOpen(st) ? "" : " disabled") + ">" +
          '<span class="t">' + esc(t) + "</span>" +
          '<span class="best">' + (l.bestTime && t === l.bestTime ? "<b>BEST TIME</b>" + esc(l.bestTimeNote) : "") + "</span>" +
          '<span class="st">' + STATUS[st].en + "</span></button>";
      }).join("");
      var ready = sel.date && (sel.time || !l.timeSlots.length);
      var go = ready
        ? '<p class="avail-pick"><b>' + fmtDate(sel.date) + (sel.time ? " " + esc(sel.time) : "") + "</b> ・受付中</p>" +
          '<a class="btn btn-block" href="' + bookBase + "&date=" + sel.date + (sel.time ? "&time=" + encodeURIComponent(sel.time) : "") + '">この日時で申し込む <span class="arrow" aria-hidden="true">→</span></a>'
        : '<p class="avail-pick" style="color:var(--ink-faint)">時間を選ぶと、そのまま予約リクエストに進めます。</p>';
      box.innerHTML =
        '<div class="avail-head"><span class="en">NEXT 14 DAYS</span>' + LEGEND + "</div>" +
        '<div class="days" role="group" aria-label="日付を選ぶ">' + dayBtns + "</div>" +
        (sel.date ? '<p class="note" style="margin-top:16px">' + fmtDate(sel.date) + " の受付状況</p>" : "") +
        '<div class="slots" role="group" aria-label="時間を選ぶ">' + slots + "</div>" +
        '<div class="avail-go">' + go + "</div>" +
        '<div class="avail-more"><a class="link" href="' + bookBase + '">もっと先の日付を見る <span class="arrow" aria-hidden="true">→</span></a></div>';
      applyPlace();
    }
    box.addEventListener("click", function (e) {
      var d = e.target.closest(".day-btn:not(:disabled)"), t = e.target.closest(".slot:not(:disabled)");
      if (d) { sel.date = d.getAttribute("data-date"); sel.time = null; draw(); }
      if (t) { sel.time = t.getAttribute("data-time"); draw(); }
    });
    draw();
  }

  observeReveals(document);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
})();
