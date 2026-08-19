/* =====================================================================
   propose-booking.js (Shopify build)
   -----------------------------------------------------------------
   Same LOCATION → PLAN → DATE → TIME → OPTIONS → CUSTOMER → PAYMENT
   state machine as /propose-lp/assets/js/propose-booking.js (the
   mockup), adapted to:
     - read real data from window.ProposeBookingConfig (rendered by
       sections/propose-booking.liquid from propose_location
       metaobjects + Product variants)
     - add the plan variant + selected add-on variants to the real
       cart via /cart/add.js, with the booking details attached as
       line item properties (visible to both customer and merchant,
       in checkout, the order, and packing slips)
     - write the "surprise" note + a shared reservation-group id to
       cart.attributes via /cart/update.js
     - hand off to Shopify's own secure checkout at the PAYMENT step
   ===================================================================== */
(function () {
  "use strict";
  var C = window.ProposeBookingConfig;
  var root = document.getElementById("pp-booking-app");
  if (!C || !root) return;

  var STEPS = ["location", "plan", "date", "time", "options", "customer", "payment"];
  var STEP_LABELS = { location: "LOCATION", plan: "PLAN", date: "DATE", time: "TIME", options: "OPTIONS", customer: "CUSTOMER", payment: "PAYMENT" };
  var STORE_KEY = "ppBookingState";

  function formatMoney(amount) {
    var fmt = C.moneyFormat || "¥{{amount_no_decimals_with_comma_separator}}";
    var noDecimals = Math.round(amount).toLocaleString("ja-JP");
    return fmt
      .replace("{{amount_no_decimals_with_comma_separator}}", noDecimals)
      .replace("{{amount_with_comma_separator}}", noDecimals)
      .replace("{{amount_no_decimals}}", Math.round(amount))
      .replace("{{amount}}", Math.round(amount));
  }

  function readQuery() {
    var p = new URLSearchParams(window.location.search);
    return { loc: p.get("loc"), plan: p.get("plan") };
  }
  function getLocation(id) { return C.locations.filter(function (l) { return l.id === id; })[0] || null; }

  function loadState() {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch (e) { s = null; }
    if (!s) s = { stepIndex: 0, locationId: null, planId: null, date: null, time: null, options: [], customer: {}, reservationGroup: null };
    var q = readQuery();
    if (q.loc && getLocation(q.loc)) { s.locationId = q.loc; if (s.stepIndex === 0) s.stepIndex = 1; }
    if (q.plan) { s.planId = q.plan; if (s.stepIndex <= 1) s.stepIndex = 2; }
    return s;
  }
  var state = loadState();
  function save() { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  var calMonthOffset = 0;

  function loc() { return state.locationId ? getLocation(state.locationId) : null; }
  function plan() {
    var l = loc();
    if (!l || !state.planId) return null;
    return l.plans.filter(function (p) { return p.id === state.planId; })[0] || null;
  }
  function planTier() {
    var p = plan();
    return p ? p.id : null; // "basic" | "flower" | "premium" (from handleized variant title)
  }
  function optionIsIncluded(opt) {
    var tier = planTier();
    if (tier === "flower") return !!opt.includedInFlower;
    if (tier === "premium") return !!opt.includedInFlower || !!opt.includedInPremium;
    return false;
  }
  function selectedOptions() {
    return (C.options || []).filter(function (o) { return optionIsIncluded(o) || state.options.indexOf(o.id) > -1; });
  }
  function total() {
    var p = plan();
    if (!p) return 0;
    var sum = p.price;
    selectedOptions().forEach(function (o) { if (!optionIsIncluded(o)) sum += o.price; });
    return sum;
  }
  function fmtDate(d) {
    if (!d) return "";
    var dt = new Date(d + "T00:00:00");
    return dt.getFullYear() + "." + String(dt.getMonth() + 1).padStart(2, "0") + "." + String(dt.getDate()).padStart(2, "0") + "（" + "日月火水木金土"[dt.getDay()] + "）";
  }
  function availabilityFor(l, dateStr) {
    if (l.blockedDates && l.blockedDates.indexOf(dateStr) > -1) return "soldout";
    if (l.fewLeftDates && l.fewLeftDates.indexOf(dateStr) > -1) return "few";
    return "available";
  }

  var stepperEl = document.getElementById("pp-stepper");
  var mainEl = document.getElementById("pp-booking-main");
  var bottomBar = document.getElementById("pp-booking-bottombar");
  var bbAmount = document.getElementById("pp-bb-amount");
  var bbNext = document.getElementById("pp-bb-next");
  var bbBack = document.getElementById("pp-bb-back");

  function renderStepper() {
    stepperEl.innerHTML = STEPS.map(function (key, i) {
      var cls = "pp-stepper-item" + (i === state.stepIndex ? " is-active" : i < state.stepIndex ? " is-done" : "");
      return '<div class="' + cls + '">' + STEP_LABELS[key] + "</div>";
    }).join("");
  }

  function renderLocation() {
    return (
      '<h2>どこで、伝えますか？</h2><p class="pp-step-lede">目的地から、プロポーズの舞台を選んでください。</p>' +
      '<div class="pp-loc-pick-grid">' +
      C.locations.map(function (l) {
        var sel = state.locationId === l.id ? " is-selected" : "";
        var from = l.plans.length ? l.plans[0].price : 0;
        return (
          '<button type="button" class="pp-loc-pick-card' + sel + '" data-pp-loc="' + l.id + '">' +
          '<span class="pp-ph" style="--c1:' + l.hue[0] + ";--c2:" + l.hue[1] + '"></span>' +
          '<span class="pp-lp-scrim"></span>' +
          '<span class="pp-lp-label"><strong>' + l.name + "</strong>" + formatMoney(from) + "〜</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }
  function bindLocation() {
    mainEl.querySelectorAll("[data-pp-loc]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-pp-loc");
        if (state.locationId !== id) { state.planId = null; state.date = null; state.time = null; state.options = []; }
        state.locationId = id; save(); render();
      });
    });
  }

  function renderPlan() {
    var l = loc();
    if (!l) return "<p>先にロケーションを選んでください。</p>";
    return (
      "<h2>プランを選ぶ</h2><p class=\"pp-step-lede\">" + l.name + "（" + l.nameJa + "）でのプランです。</p>" +
      '<div class="pp-plan-pick-list">' +
      l.plans.map(function (p) {
        var sel = state.planId === p.id ? " is-selected" : "";
        var lastInclude = p.includes.length ? p.includes[p.includes.length - 1] : "";
        return (
          '<button type="button" class="pp-plan-pick' + sel + '" data-pp-plan="' + p.id + '">' +
          '<span><span class="pp-pp-name">' + p.name + '</span><span class="pp-pp-includes">' + lastInclude + "</span></span>" +
          '<span class="pp-pp-price">' + formatMoney(p.price) + "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }
  function bindPlan() {
    mainEl.querySelectorAll("[data-pp-plan]").forEach(function (btn) {
      btn.addEventListener("click", function () { state.planId = btn.getAttribute("data-pp-plan"); save(); render(); });
    });
  }

  function buildMonthGrid(year, month) {
    var first = new Date(year, month, 1), startDow = first.getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var cells = [];
    for (var i = 0; i < startDow; i++) cells.push(null);
    for (var d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }
  function renderDate() {
    var l = loc();
    if (!l) return "<p>先にロケーションを選んでください。</p>";
    var today = new Date();
    var base = new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1);
    var y = base.getFullYear(), m = base.getMonth();
    var cells = buildMonthGrid(y, m);
    var dows = ["日", "月", "火", "水", "木", "金", "土"];
    var todayStr = today.toISOString().slice(0, 10);
    var grid = cells.map(function (d) {
      if (!d) return '<span class="pp-cal-day is-empty"></span>';
      var dateStr = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var isPast = dateStr < todayStr;
      var status = isPast ? "closed" : availabilityFor(l, dateStr);
      var sel = state.date === dateStr ? " is-selected" : "";
      var disabled = status === "soldout" || status === "closed";
      var mark = status === "available" ? "○" : status === "few" ? "△" : status === "closed" ? "休" : "×";
      return (
        '<button type="button" class="pp-cal-day is-' + status + sel + '" data-pp-date="' + dateStr + '"' + (disabled ? " disabled" : "") + ">" +
        "<span>" + d + "</span><span class=\"pp-cal-mark\">" + mark + "</span></button>"
      );
    }).join("");
    return (
      "<h2>日付を選ぶ</h2><p class=\"pp-step-lede\">" + l.name + "で予約可能な日付です。</p>" +
      '<div class="pp-cal-nav"><button type="button" id="pp-cal-prev"' + (calMonthOffset <= 0 ? " disabled" : "") + ">← 前の月</button>" +
      '<span class="pp-cal-month">' + y + "年" + (m + 1) + "月</span>" +
      '<button type="button" id="pp-cal-next"' + (calMonthOffset >= 5 ? " disabled" : "") + ">次の月 →</button></div>" +
      '<div class="pp-cal-grid">' + dows.map(function (dw) { return '<div class="pp-cal-dow">' + dw + "</div>"; }).join("") + grid + "</div>" +
      '<div class="pp-cal-legend"><span><i class="pp-legend-dot available"></i>○ 空きあり</span><span><i class="pp-legend-dot few"></i>△ 残りわずか</span><span><i class="pp-legend-dot soldout"></i>× 満席 / 休</span></div>'
    );
  }
  function bindDate() {
    var prev = document.getElementById("pp-cal-prev"), next = document.getElementById("pp-cal-next");
    if (prev) prev.addEventListener("click", function () { if (calMonthOffset > 0) { calMonthOffset--; renderCurrentStepOnly(); } });
    if (next) next.addEventListener("click", function () { if (calMonthOffset < 5) { calMonthOffset++; renderCurrentStepOnly(); } });
    mainEl.querySelectorAll(".pp-cal-day[data-pp-date]:not(:disabled)").forEach(function (btn) {
      btn.addEventListener("click", function () { state.date = btn.getAttribute("data-pp-date"); state.time = null; save(); render(); });
    });
  }

  function renderTime() {
    var l = loc();
    if (!l || !state.date) return "<p>先に日付を選んでください。</p>";
    return (
      "<h2>時間を選ぶ</h2><p class=\"pp-step-lede\">" + fmtDate(state.date) + " にご案内できる時間帯です。</p>" +
      '<div class="pp-time-grid">' +
      l.timeSlots.map(function (t) {
        var sel = state.time === t ? " is-selected" : "";
        var best = t === l.bestTime;
        return '<button type="button" class="pp-time-pick' + sel + '" data-pp-time="' + t + '">' + t + (best ? '<span class="pp-best-tag">BEST TIME</span>' : "") + "</button>";
      }).join("") +
      "</div>"
    );
  }
  function bindTime() {
    mainEl.querySelectorAll("[data-pp-time]").forEach(function (btn) {
      btn.addEventListener("click", function () { state.time = btn.getAttribute("data-pp-time"); save(); render(); });
    });
  }

  function renderOptions() {
    if (!loc()) return "";
    var opts = C.options || [];
    return (
      "<h2>オプションを選ぶ</h2><p class=\"pp-step-lede\">必要なものだけ追加してください。プランに含まれるものは自動で選択済みです。</p>" +
      '<div class="pp-option-list">' +
      opts.map(function (o) {
        var included = optionIsIncluded(o);
        var isSel = included || state.options.indexOf(o.id) > -1;
        var cls = "pp-option-card" + (included ? " is-included" : "") + (isSel && !included ? " is-selected" : "");
        return (
          '<button type="button" class="' + cls + '" data-pp-opt="' + o.id + '"' + (included ? " disabled" : "") + ">" +
          '<span><span class="pp-oc-name">' + o.name + (included ? '<span class="pp-included-tag">含む</span>' : "") + '</span><span class="pp-oc-desc">' + (o.desc || "") + "</span></span>" +
          '<span style="display:flex;align-items:center;gap:12px;"><span class="pp-oc-price">' + (included ? "—" : "+" + formatMoney(o.price)) + '</span><span class="pp-oc-toggle">' + (isSel ? "✓" : "") + "</span></span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }
  function bindOptions() {
    mainEl.querySelectorAll(".pp-option-card:not(:disabled)").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-pp-opt");
        var idx = state.options.indexOf(id);
        if (idx > -1) state.options.splice(idx, 1); else state.options.push(id);
        save(); render();
      });
    });
  }

  function renderCustomer() {
    var c = state.customer || {};
    return (
      "<h2>予約者情報</h2><p class=\"pp-step-lede\">ご本人（予約者）の情報をご入力ください。お支払い情報は次の画面（Shopifyの安全なチェックアウト）でご入力いただきます。</p>" +
      '<div class="pp-field"><label for="pp-c-name">お名前</label><input id="pp-c-name" type="text" autocomplete="name" value="' + (c.name || "").replace(/"/g, "&quot;") + '" placeholder="山田 太郎"></div>' +
      '<div class="pp-field"><label for="pp-c-email">メールアドレス</label><input id="pp-c-email" type="email" autocomplete="email" value="' + (c.email || "").replace(/"/g, "&quot;") + '" placeholder="you@example.com"></div>' +
      '<div class="pp-field"><label for="pp-c-note">ご要望・共有事項（任意）</label><textarea id="pp-c-note" rows="3" placeholder="例：滞在ホテル名、記念日など">' + (c.note || "") + "</textarea></div>" +
      '<div class="pp-checkbox-row" style="margin-bottom:14px;"><input type="checkbox" id="pp-c-surprise"' + (c.surprise ? " checked" : "") + '><label for="pp-c-surprise">相手にサプライズにしたいので、確認連絡は控えめな件名にしてほしい</label></div>' +
      '<div class="pp-checkbox-row"><input type="checkbox" id="pp-c-agree"' + (c.agree ? " checked" : "") + '><label for="pp-c-agree">利用規約・キャンセルポリシーに同意する</label></div>'
    );
  }
  function bindCustomer() {
    ["name", "email", "note"].forEach(function (key) {
      var el = document.getElementById("pp-c-" + key);
      if (el) el.addEventListener("input", function () { state.customer[key] = el.value; save(); updateBottomBar(); });
    });
    ["surprise", "agree"].forEach(function (key) {
      var el = document.getElementById("pp-c-" + key);
      if (el) el.addEventListener("change", function () { state.customer[key] = el.checked; save(); updateBottomBar(); });
    });
  }

  function summaryRows() {
    var l = loc(), p = plan();
    var rows = [
      ["LOCATION", l ? l.name + "（" + l.nameJa + "）" : "—"],
      ["PLAN", p ? p.name : "—"],
      ["DATE", state.date ? fmtDate(state.date) : "—"],
      ["TIME", state.time || "—"],
      ["MEETING POINT", l ? l.meetingPoint : "—"]
    ];
    var opts = selectedOptions().filter(function (o) { return !optionIsIncluded(o); });
    rows.push(["OPTIONS", opts.length ? opts.map(function (o) { return o.name; }).join("、") : "なし"]);
    return rows;
  }
  function renderPayment() {
    return (
      "<h2>内容の確認</h2><p class=\"pp-step-lede\">この内容でよろしければ、Shopifyの安全なチェックアウトへ進みます。</p>" +
      '<div class="pp-summary-card">' +
      summaryRows().map(function (r) { return '<div class="pp-summary-row"><span class="pp-sr-label">' + r[0] + '</span><span class="pp-sr-value">' + r[1] + "</span></div>"; }).join("") +
      '<div class="pp-summary-row pp-total"><span class="pp-sr-label">TOTAL</span><span class="pp-sr-value">' + formatMoney(total()) + "</span></div>" +
      "</div>" +
      '<div id="pp-confirm-error" role="alert" style="display:none;color:#a3402f;font-size:.85rem;margin-bottom:14px;"></div>' +
      '<button type="button" class="pp-btn pp-btn-primary pp-btn-block" id="pp-confirm-btn">予約内容をカートに入れて、お支払いへ進む</button>'
    );
  }
  function bindPayment() {
    var btn = document.getElementById("pp-confirm-btn");
    if (btn) btn.addEventListener("click", submitBooking);
  }

  async function submitBooking() {
    var btn = document.getElementById("pp-confirm-btn");
    var errEl = document.getElementById("pp-confirm-error");
    var l = loc(), p = plan();
    if (!l || !p || !state.date || !state.time) { showError("内容が不足しています。前のステップを確認してください。"); return; }
    btn.disabled = true;
    btn.textContent = "処理しています…";
    errEl.style.display = "none";
    try {
      state.reservationGroup = "PRP-" + Date.now().toString(36).toUpperCase();
      var baseProps = {
        LOCATION: l.name + "（" + l.nameJa + "）",
        PLAN: p.name,
        DATE: state.date,
        TIME: state.time,
        "Meeting Point": l.meetingPoint,
        "Reservation Group": state.reservationGroup
      };
      var items = [{ id: p.variantId, quantity: 1, properties: baseProps }];
      selectedOptions().forEach(function (o) {
        if (optionIsIncluded(o)) return;
        var props = Object.assign({}, baseProps, { "For Reservation": l.name + " / " + state.date + " " + state.time });
        items.push({ id: o.variantId, quantity: 1, properties: props });
      });

      var addRes = await fetch(C.cartAddUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: items })
      });
      if (!addRes.ok) throw new Error("cart-add-failed");

      var note = (state.customer.note || "");
      if (state.customer.surprise) note = "【サプライズ配慮：件名を控えめに】\n" + note;
      await fetch(C.cartUpdateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ note: note, attributes: { pp_reservation_group: state.reservationGroup } })
      });

      sessionStorage.removeItem(STORE_KEY);
      window.location.href = C.cartUrl || "/cart";
    } catch (err) {
      showError("カートへの追加に失敗しました。通信環境をご確認のうえ、もう一度お試しください。");
      btn.disabled = false;
      btn.textContent = "予約内容をカートに入れて、お支払いへ進む";
    }
    function showError(msg) { errEl.textContent = msg; errEl.style.display = "block"; }
  }

  function canAdvance() {
    switch (STEPS[state.stepIndex]) {
      case "location": return !!state.locationId;
      case "plan": return !!state.planId;
      case "date": return !!state.date;
      case "time": return !!state.time;
      case "options": return true;
      case "customer": return !!(state.customer.name && state.customer.email && state.customer.agree);
      default: return false;
    }
  }
  function updateBottomBar() {
    bbAmount.textContent = plan() ? formatMoney(total()) : "—";
    var last = state.stepIndex === STEPS.length - 1;
    bbNext.classList.toggle("pp-hidden", last);
    bbBack.disabled = state.stepIndex === 0;
    if (!last) bbNext.disabled = !canAdvance();
  }
  function goNext() { if (canAdvance() && state.stepIndex < STEPS.length - 1) { state.stepIndex++; save(); render(); } }
  function goBack() { if (state.stepIndex > 0) { state.stepIndex--; save(); render(); } }

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
