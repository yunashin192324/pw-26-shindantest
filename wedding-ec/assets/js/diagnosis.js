/* 30-second destination diagnosis. Vanilla JS, client-side only. */
(function () {
  'use strict';

  var PRODUCTS = {
    'hawaii-basic':    { name: 'ハワイ ベーシックプラン',       price: '¥298,000', avail: 'instant', availLabel: '即予約できます', href: 'products/hawaii-basic.html',    reason: '王道のビーチ×市街地ロケーションを、無理のない予算で。' },
    'hawaii-premium':  { name: 'ハワイ プレミアムプラン',       price: '¥458,000', avail: 'confirm', availLabel: '現地確認後ご回答', href: 'products/hawaii-premium.html',  reason: 'ビーチ・教会・ヨットの3ロケーションで、特別な一日を。' },
    'danang-basic':    { name: 'ダナン ビーチプラン',           price: '¥248,000', avail: 'instant', availLabel: '即予約できます', href: 'products/danang-basic.html',    reason: '世界的評価のビーチとリゾートで、コスパよく非日常を。' },
    'danang-premium':  { name: 'ダナン ラグジュアリープラン',    price: '¥348,000', avail: 'confirm', availLabel: '現地確認後ご回答', href: 'products/danang-premium.html',  reason: '「黄金の橋」とリゾート貸切で、非日常感を最大限に。' },
    'london-basic':    { name: 'ロンドン クラシックプラン',      price: '¥398,000', avail: 'instant', availLabel: '即予約できます', href: 'products/london-basic.html',    reason: 'タワーブリッジと石畳の街並みで、気品ある一枚を。' },
    'london-premium':  { name: 'ロンドン ロイヤルプラン',        price: '¥598,000', avail: 'confirm', availLabel: '現地確認後ご回答', href: 'products/london-premium.html',  reason: '古城・庭園を含む、格式高い特別な物語を。' }
  };

  var answers = {};
  var panels = document.querySelectorAll('.diag-panel');
  var progressFill = document.querySelector('.diag-progress-fill');
  var total = panels.length - 1; /* excluding result panel */

  function showPanel(index) {
    panels.forEach(function (p, i) { p.classList.toggle('is-active', i === index); });
    if (progressFill) {
      var pct = Math.min(index, total) / total * 100;
      progressFill.style.width = pct + '%';
    }
  }

  document.querySelectorAll('.diag-option').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = btn.closest('.diag-panel');
      var key = panel.getAttribute('data-key');
      answers[key] = btn.getAttribute('data-value');
      var next = parseInt(panel.getAttribute('data-index'), 10) + 1;
      if (next < total) {
        showPanel(next);
      } else {
        renderResult();
        showPanel(total);
      }
    });
  });

  document.querySelectorAll('.diag-restart').forEach(function (btn) {
    btn.addEventListener('click', function () {
      answers = {};
      showPanel(0);
    });
  });

  function renderResult() {
    var dest = answers.vibe || 'hawaii';
    var isPremium = answers.budget === 'high' || answers.priority === 'special';
    var key = dest + '-' + (isPremium ? 'premium' : 'basic');
    var p = PRODUCTS[key];
    var resultPanel = document.querySelector('.diag-result');
    if (!resultPanel || !p) return;
    resultPanel.querySelector('.diag-result-name').textContent = p.name;
    resultPanel.querySelector('.diag-result-reason').textContent = p.reason;
    resultPanel.querySelector('.diag-result-price').textContent = p.price + '（税込・2名）';
    var tag = resultPanel.querySelector('.diag-result-avail');
    tag.textContent = p.availLabel;
    tag.className = 'avail-tag ' + p.avail + ' diag-result-avail';
    resultPanel.querySelector('.diag-result-link').setAttribute('href', p.href);
  }

  showPanel(0);
})();
