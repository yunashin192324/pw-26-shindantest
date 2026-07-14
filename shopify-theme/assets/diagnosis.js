/* 30秒診断 — client-side only, no server round-trip. Reads its answer
   options and result data (product name/price/url/reason) from the
   JSON blob diagnosis-quiz.liquid embeds, so all copy and the linked
   Shopify products stay editable from Theme Editor with no code
   changes. Result-bucket key formula (destination + tier) matches the
   fixed 3-question funnel the section renders: first question = which
   destination, "budget"/"priority" answers of "high"/"special" bump
   the result to the premium bucket. */
(function () {
  'use strict';

  var root = document.querySelector('[data-diagnosis-quiz]');
  if (!root) return;

  var dataEl = document.getElementById('diagnosis-results-data');
  var RESULTS = {};
  try { RESULTS = dataEl ? JSON.parse(dataEl.textContent) : {}; } catch (e) { RESULTS = {}; }

  var answers = {};
  var panels = root.querySelectorAll('.diag-panel');
  var progressFill = root.querySelector('.diag-progress-fill');
  var questionKeys = Array.prototype.slice.call(root.querySelectorAll('.diag-panel[data-key]')).map(function (p) {
    return p.getAttribute('data-key');
  });
  var total = panels.length - 1; /* excluding result panel */

  function showPanel(index) {
    panels.forEach(function (p, i) { p.classList.toggle('is-active', i === index); });
    if (progressFill && total > 0) {
      progressFill.style.width = (Math.min(index, total) / total * 100) + '%';
    }
  }

  root.querySelectorAll('.diag-option').forEach(function (btn) {
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

  root.querySelectorAll('.diag-restart').forEach(function (btn) {
    btn.addEventListener('click', function () {
      answers = {};
      showPanel(0);
    });
  });

  function renderResult() {
    var destKey = questionKeys[0];
    var dest = answers[destKey];
    var isPremium = answers.budget === 'high' || answers.priority === 'special';
    var key = dest + '-' + (isPremium ? 'premium' : 'basic');
    var p = RESULTS[key];
    var resultPanel = root.querySelector('.diag-result');
    if (!resultPanel || !p) return;
    resultPanel.querySelector('.diag-result-name').textContent = p.name;
    resultPanel.querySelector('.diag-result-reason').textContent = p.reason;
    resultPanel.querySelector('.diag-result-price').textContent = p.price;
    var tag = resultPanel.querySelector('.diag-result-avail');
    tag.textContent = p.availLabel;
    tag.className = 'avail-tag ' + p.avail + ' diag-result-avail';
    resultPanel.querySelector('.diag-result-link').setAttribute('href', p.url);
  }

  showPanel(0);
})();
