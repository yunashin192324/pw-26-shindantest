/* =====================================================================
   propose-booking.js — the reservation flow (SPA, no page reloads).
   LOCATION → PLAN → DATE → TIME → OPTIONS → CUSTOMER → PAYMENT → COMPLETE

   This mockup keeps everything client-side in sessionStorage. In the
   Shopify build (see shopify-theme/assets/propose-booking.js) the same
   state machine instead:
     - reads plan prices from real Product Variants
     - reads availability from location page metafields
     - calls /cart/add.js to add the plan variant + selected add-on
       products, attaching date/time/options as line item properties
     - step PAYMENT redirects to the real Shopify /checkout
   ===================================================================== */
(function () {
  "use strict";
  var D = window.ProposeData;
  if (!D) return;

  var STEPS = ["location", "plan", "date", "time", "options", "customer", "payment"];
  var STEP_LABELS = { location: "LOCATION", plan: "PLAN", date: "DATE", time: "TIME", options: "OPTIONS", customer: "CUSTOMER", payment: "PAYMENT" };
  var STORE_KEY = "proposeBookingState";

  function readQuery() {
    var p = new URLSearchParams(window.location.search);
    return { loc: p.get("loc"), plan: p.get("plan") };
  }

  function loadState() {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch (e) { s = null; }
    if (!s) {
      s = { stepIndex: 0, locationId: null, planId: null, date: null, time: null, options: [], customer: {}, reservationCode: null };
    }
    var q = readQuery();
    if (q.loc && D.getLocation(q.loc)) { s.locationId = q.loc; if (s.stepIndex === 0) s.stepIndex = 1; }
    if (q.plan && ["basic", "flower", "premium"].indexOf(q.plan) > -1) { s.planId = q.plan; if (s.stepIndex <= 1) s.stepIndex = 2; }
    return s;
  }

  var state = loadState();
  function save() { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  var calMonthOffset = 0; // 0 = current month, increments via prev/next

  // ---------- helpers ----------
  function loc() { return state.locationId ? D.getLocation(state.locationId) : null; }
  function plan() {
    var l = loc();
    if (!l || !state.planId) return null;
    return l.plans.filter(function (p) { return p.id === state.planId; })[0] || null;
  }
  function includedOptionIds() { var p = plan(); return p ? p.includedOptionIds : []; }
  function selectedOptions() {
    var l = loc();
    if (!l) return [];
    var included = includedOptionIds();
    return D.optionsFor(included).filter(function (o) { return o.included || state.options.indexOf(o.id) > -1; });
  }
  function total() {
    var p = plan();
    if (!p) return 0;
    var sum = p.price;
    selectedOptions().forEach(function (o) { if (!o.included) sum += o.price; });
    return sum;
  }
  function fmtDate(d) {
    if (!d) return "";
    var dt = new Date(d + "T00:00:00");
    return dt.getFullYear() + "." + String(dt.getMonth() + 1).padStart(2, "0") + "." + String(dt.getDate()).padStart(2, "0") + "（" + "日月火水木金土"[dt.getDay()] + "）";
  }

  // ---------- DOM refs ----------
  var root = document.getElementById("booking-app");
  if (!root) return;
  var stepperEl = document.getElementById("stepper");
  var mainEl = document.getElementById("booking-main");
  var bottomBar = document.getElementById("booking-bottombar");
  var bbAmount = document.getElementById("bb-amount");
  var bbNext = document.getElementById("bb-next");
  var bbBack = document.getElementById("bb-back");

  // ---------- stepper ----------
  function renderStepper() {
    stepperEl.innerHTML = STEPS.map(function (key, i) {
      var cls = "stepper-item" + (i === state.stepIndex ? " is-active" : i < state.stepIndex ? " is-done" : "");
      return '<div class="' + cls + '">' + STEP_LABELS[key] + "</div>";
    }).join("");
  }

  // ---------- step: location ----------
  function renderLocation() {
    return (
      '<h2>どこで、伝えますか？</h2><p class="step-lede">10のロケーションから、プロポーズの舞台を選んでください。</p>' +
      '<div class="loc-pick-grid">' +
      D.locations.map(function (l) {
        var sel = state.locationId === l.id ? " is-selected" : "";
        return (
          '<button class="loc-pick-card' + sel + '" data-loc="' + l.id + '">' +
          '<span class="ph" data-hue="' + l.hue[0] + "," + l.hue[1] + '" data-label="' + l.name + '"></span>' +
          '<span class="lp-scrim"></span>' +
          '<span class="lp-label"><strong>' + l.name + "</strong>" + D.formatYen(l.fromPrice) + "〜</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }
  function bindLocation() {
    mainEl.querySelectorAll("[data-loc]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-loc");
        if (state.locationId !== id) { state.planId = null; state.date = null; state.time = null; state.options = []; }
        state.locationId = id;
        save(); render();
      });
    });
  }

  // ---------- step: plan ----------
  function renderPlan() {
    var l = loc();
    if (!l) return '<p>先にロケーションを選んでください。</p>';
    return (
      "<h2>プランを選ぶ</h2><p class=\"step-lede\">" + l.name + "（" + l.nameJa + "）でのプランです。</p>" +
      '<div class="plan-pick-list">' +
      l.plans.map(function (p) {
        var sel = state.planId === p.id ? " is-selected" : "";
        return (
          '<button class="plan-pick' + sel + '" data-plan="' + p.id + '">' +
          '<span><span class="pp-name">' + p.name + '</span><span class="pp-includes">' + p.includes[p.includes.length - 1] + "</span></span>" +
          '<span class="pp-price">' + D.formatYen(p.price) + "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }
  function bindPlan() {
    mainEl.querySelectorAll("[data-plan]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.planId = btn.getAttribute("data-plan");
        save(); render();
      });
    });
  }

  // ---------- step: date (calendar) ----------
  function buildMonthGrid(year, month) {
    var first = new Date(year, month, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var cells = [];
    for (var i = 0; i < startDow; i++) cells.push(null);
    for (var d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }
  function renderDate() {
    var l = loc();
    if (!l) return '<p>先にロケーションを選んでください。</p>';
    var today = new Date();
    var base = new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1);
    var y = base.getFullYear(), m = base.getMonth();
    var cells = buildMonthGrid(y, m);
    var dows = ["日", "月", "火", "水", "木", "金", "土"];
    var todayStr = today.toISOString().slice(0, 10);

    var grid = cells.map(function (d) {
      if (!d) return '<span class="cal-day is-empty"></span>';
      var dateStr = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var isPast = dateStr < todayStr;
      var status = isPast ? "closed" : D.availabilityFor(l.id, dateStr);
      var sel = state.date === dateStr ? " is-selected" : "";
      var disabled = status === "soldout" || status === "closed";
      var mark = status === "available" ? "○" : status === "few" ? "△" : status === "closed" ? "休" : "×";
      return (
        '<button class="cal-day is-' + status + sel + '" data-date="' + dateStr + '"' + (disabled ? " disabled" : "") + ">" +
        "<span>" + d + "</span><span class=\"cal-mark\">" + mark + "</span>" +
        "</button>"
      );
    }).join("");

    var monthLabel = y + "年" + (m + 1) + "月";
    return (
      "<h2>日付を選ぶ</h2><p class=\"step-lede\">" + l.name + "で予約可能な日付です。</p>" +
      '<div class="cal-nav">' +
      '<button id="cal-prev"' + (calMonthOffset <= 0 ? " disabled" : "") + ">← 前の月</button>" +
      '<span class="cal-month">' + monthLabel + "</span>" +
      '<button id="cal-next"' + (calMonthOffset >= 5 ? " disabled" : "") + ">次の月 →</button>" +
      "</div>" +
      '<div class="cal-grid">' + dows.map(function (dw) { return '<div class="cal-dow">' + dw + "</div>"; }).join("") + grid + "</div>" +
      '<div class="cal-legend">' +
      '<span><i class="legend-dot available"></i>○ 空きあり</span>' +
      '<span><i class="legend-dot few"></i>△ 残りわずか</span>' +
      '<span><i class="legend-dot soldout"></i>× 満席 / 休</span>' +
      "</div>" +
      '<p class="cal-note">※ このカレンダーはデモ表示です。実際の空き状況はストア側の予約管理と連動します。</p>'
    );
  }
  function bindDate() {
    var prev = document.getElementById("cal-prev"), next = document.getElementById("cal-next");
    if (prev) prev.addEventListener("click", function () { if (calMonthOffset > 0) { calMonthOffset--; renderCurrentStepOnly(); } });
    if (next) next.addEventListener("click", function () { if (calMonthOffset < 5) { calMonthOffset++; renderCurrentStepOnly(); } });
    mainEl.querySelectorAll(".cal-day[data-date]:not(:disabled)").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.date = btn.getAttribute("data-date");
        state.time = null;
        save(); render();
      });
    });
  }

  // ---------- step: time ----------
  function renderTime() {
    var l = loc();
    if (!l || !state.date) return '<p>先に日付を選んでください。</p>';
    return (
      "<h2>時間を選ぶ</h2><p class=\"step-lede\">" + fmtDate(state.date) + " にご案内できる時間帯です。</p>" +
      '<div class="time-grid">' +
      l.timeSlots.map(function (t) {
        var sel = state.time === t ? " is-selected" : "";
        var best = t === l.bestTime;
        return '<button class="time-pick' + sel + '" data-time="' + t + '">' + t + (best ? '<span class="best-tag">BEST TIME</span>' : "") + "</button>";
      }).join("") +
      "</div>"
    );
  }
  function bindTime() {
    mainEl.querySelectorAll("[data-time]").forEach(function (btn) {
      btn.addEventListener("click", function () { state.time = btn.getAttribute("data-time"); save(); render(); });
    });
  }

  // ---------- step: options ----------
  function renderOptions() {
    var l = loc();
    if (!l) return "";
    var included = includedOptionIds();
    var opts = D.optionsFor(included);
    return (
      "<h2>オプションを選ぶ</h2><p class=\"step-lede\">必要なものだけ追加してください。プランに含まれるものは自動で選択済みです。</p>" +
      '<div class="option-list">' +
      opts.map(function (o) {
        var isSel = o.included || state.options.indexOf(o.id) > -1;
        var cls = "option-card" + (o.included ? " is-included" : "") + (isSel && !o.included ? " is-selected" : "");
        return (
          '<button class="' + cls + '" data-opt="' + o.id + '"' + (o.included ? " disabled" : "") + ">" +
          '<span><span class="oc-name">' + o.name + (o.included ? '<span class="included-tag">含む</span>' : "") + '</span><span class="oc-desc">' + o.desc + "</span></span>" +
          '<span style="display:flex;align-items:center;gap:12px;"><span class="oc-price">' + (o.included ? "—" : "+" + D.formatYen(o.price)) + '</span><span class="oc-toggle">' + (isSel ? "✓" : "") + "</span></span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }
  function bindOptions() {
    mainEl.querySelectorAll(".option-card:not(:disabled)").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-opt");
        var idx = state.options.indexOf(id);
        if (idx > -1) state.options.splice(idx, 1); else state.options.push(id);
        save(); render();
      });
    });
  }

  // ---------- step: customer ----------
  function renderCustomer() {
    var c = state.customer || {};
    return (
      "<h2>予約者情報</h2><p class=\"step-lede\">ご本人（予約者）の情報をご入力ください。</p>" +
      '<div class="field"><label for="c-name">お名前</label><input id="c-name" type="text" autocomplete="name" value="' + (c.name || "").replace(/"/g, "&quot;") + '" placeholder="山田 太郎"></div>' +
      '<div class="field"><label for="c-email">メールアドレス</label><input id="c-email" type="email" autocomplete="email" value="' + (c.email || "").replace(/"/g, "&quot;") + '" placeholder="you@example.com"></div>' +
      '<div class="field"><label for="c-phone">電話番号</label><input id="c-phone" type="tel" autocomplete="tel" value="' + (c.phone || "").replace(/"/g, "&quot;") + '" placeholder="090-0000-0000"></div>' +
      '<div class="field"><label for="c-note">ご要望・共有事項（任意）</label><textarea id="c-note" rows="3" placeholder="例：滞在ホテル名、記念日など">' + (c.note || "") + "</textarea></div>" +
      '<div class="checkbox-row" style="margin-bottom:14px;"><input type="checkbox" id="c-surprise"' + (c.surprise ? " checked" : "") + '><label for="c-surprise">相手にサプライズにしたいので、確認連絡は控えめな件名にしてほしい</label></div>' +
      '<div class="checkbox-row"><input type="checkbox" id="c-agree"' + (c.agree ? " checked" : "") + '><label for="c-agree">利用規約・キャンセルポリシーに同意する</label></div>'
    );
  }
  function bindCustomer() {
    ["c-name", "c-email", "c-phone", "c-note"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", function () {
        var key = id.replace("c-", "");
        state.customer[key] = el.value;
        save();
        updateBottomBar();
      });
    });
    ["c-surprise", "c-agree"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", function () {
        var key = id.replace("c-", "");
        state.customer[key] = el.checked;
        save();
        updateBottomBar();
      });
    });
  }

  // ---------- step: payment ----------
  function summaryRows() {
    var l = loc(), p = plan();
    var rows = [
      ["LOCATION", l ? l.name + "（" + l.nameJa + "）" : "—"],
      ["PLAN", p ? p.name : "—"],
      ["DATE", state.date ? fmtDate(state.date) : "—"],
      ["TIME", state.time || "—"],
      ["MEETING POINT", l ? l.meetingPoint : "—"]
    ];
    var opts = selectedOptions().filter(function (o) { return !o.included; });
    rows.push(["OPTIONS", opts.length ? opts.map(function (o) { return o.name; }).join("、") : "なし"]);
    return rows;
  }
  function renderPayment() {
    return (
      "<h2>内容の確認</h2><p class=\"step-lede\">この内容でよろしければ、予約を確定してください。</p>" +
      '<div class="summary-card">' +
      summaryRows().map(function (r) { return '<div class="summary-row"><span class="sr-label">' + r[0] + '</span><span class="sr-value">' + r[1] + "</span></div>"; }).join("") +
      '<div class="summary-row total"><span class="sr-label">TOTAL</span><span class="sr-value">' + D.formatYen(total()) + "</span></div>" +
      "</div>" +
      '<p class="demo-note">これはモックアップです。実際のサイトでは、このボタンから Shopify の安全なチェックアウト画面（決済）に進みます。</p>' +
      '<button class="btn btn-primary btn-block" id="confirm-btn">予約を確定する（デモ）</button>'
    );
  }
  function bindPayment() {
    var btn = document.getElementById("confirm-btn");
    if (btn) btn.addEventListener("click", function () {
      state.reservationCode = "PRP-" + new Date().getFullYear() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      save();
      renderComplete();
    });
  }

  // ---------- complete ----------
  function renderComplete() {
    var l = loc(), p = plan();
    stepperEl.classList.add("hidden");
    bottomBar.classList.add("hidden");
    document.body.classList.add("no-sticky-cta");
    mainEl.innerHTML =
      '<div class="complete-wrap">' +
      '<span class="eyebrow">Your moment is reserved.</span>' +
      "<h2>プロポーズの日が、決まりました。</h2>" +
      "<p>予約番号 " + state.reservationCode + " を確認メールにも記載しています。当日までの流れは、そのままメールでご案内します。</p>" +
      '<div class="summary-card complete-detail">' +
      summaryRows().map(function (r) { return '<div class="summary-row"><span class="sr-label">' + r[0] + '</span><span class="sr-value">' + r[1] + "</span></div>"; }).join("") +
      '<div class="summary-row"><span class="sr-label">DURATION</span><span class="sr-value">' + (l ? l.duration : "—") + "</span></div>" +
      '<div class="summary-row total"><span class="sr-label">TOTAL</span><span class="sr-value">' + D.formatYen(total()) + "</span></div>" +
      "</div>" +
      '<div style="text-align:left;max-width:520px;margin:0 auto;">' +
      "<h3 style=\"margin-bottom:10px;\">今後の流れ</h3>" +
      '<ul style="display:grid;gap:8px;font-size:.88rem;color:var(--ink-soft);">' +
      "<li>1. ご入力のメールアドレスに予約確認メールをお送りします。</li>" +
      "<li>2. 当日1週間前を目安に、集合場所・持ち物のご案内をお送りします。</li>" +
      "<li>3. 撮影後、オンラインで写真データをお届けします。</li>" +
      "</ul></div>" +
      '<div style="margin-top:32px;"><a href="index.html" class="btn btn-outline">TOPへ戻る</a></div>' +
      "</div>";
    sessionStorage.removeItem(STORE_KEY);
  }

  // ---------- bottom bar / navigation ----------
  function canAdvance() {
    switch (STEPS[state.stepIndex]) {
      case "location": return !!state.locationId;
      case "plan": return !!state.planId;
      case "date": return !!state.date;
      case "time": return !!state.time;
      case "options": return true;
      case "customer": return !!(state.customer.name && state.customer.email && state.customer.agree);
      case "payment": return false; // payment step has its own confirm button, not "next"
      default: return false;
    }
  }
  function updateBottomBar() {
    bbAmount.textContent = plan() ? D.formatYen(total()) : "—";
    var last = state.stepIndex === STEPS.length - 1;
    bbNext.classList.toggle("hidden", last);
    bbBack.disabled = state.stepIndex === 0;
    if (!last) bbNext.disabled = !canAdvance();
  }

  function goNext() {
    if (!canAdvance()) return;
    if (state.stepIndex < STEPS.length - 1) { state.stepIndex++; save(); render(); }
  }
  function goBack() {
    if (state.stepIndex > 0) { state.stepIndex--; save(); render(); }
  }

  var RENDERERS = { location: renderLocation, plan: renderPlan, date: renderDate, time: renderTime, options: renderOptions, customer: renderCustomer, payment: renderPayment };
  var BINDERS = { location: bindLocation, plan: bindPlan, date: bindDate, time: bindTime, options: bindOptions, customer: bindCustomer, payment: bindPayment };

  function renderCurrentStepOnly() {
    var key = STEPS[state.stepIndex];
    mainEl.innerHTML = RENDERERS[key]();
    BINDERS[key]();
    updateBottomBar();
  }

  function render() {
    renderStepper();
    calMonthOffset = 0;
    renderCurrentStepOnly();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  bbNext.addEventListener("click", goNext);
  bbBack.addEventListener("click", goBack);

  render();
})();
