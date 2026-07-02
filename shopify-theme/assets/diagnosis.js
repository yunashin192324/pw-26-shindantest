/* 30-second destination diagnosis. Vanilla JS, client-side only.
   Reads live product data (price/handle/availability) from
   window.DIAGNOSIS_PRODUCTS, injected by templates/page.diagnosis.liquid
   from the actual Shopify product objects — so prices never drift out
   of sync with the store. */
(function () {
  'use strict';

  var PRODUCTS = window.DIAGNOSIS_PRODUCTS || {};

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
