/* 診断クイズ（30秒診断 / ドレス診断など）— client-side only, no server
   round-trip. Reads its answer options and result data (name/image/
   price/url/reason) from the JSON blob diagnosis-quiz.liquid embeds,
   so all copy — and, for product-linked results, the linked Shopify
   product's price/URL — stay editable from Theme Editor with no code
   changes. Shared by every page using the diagnosis-quiz section
   (multiple instances can exist on different pages at once). */
(function () {
  'use strict';

  document.querySelectorAll('[data-diagnosis-quiz]').forEach(initQuiz);

  function initQuiz(root) {
    var dataScript = document.getElementById(root.dataset.resultsId);
    var RESULTS = {};
    try { RESULTS = dataScript ? JSON.parse(dataScript.textContent) : {}; } catch (e) { RESULTS = {}; }

    var answers = {};
    var panels = root.querySelectorAll('.diag-panel');
    var progressFill = root.querySelector('.diag-progress-fill');
    var questionKeys = Array.prototype.slice.call(root.querySelectorAll('.diag-panel[data-key]')).map(function (p) {
      return p.getAttribute('data-key');
    });
    var keyFormula = root.dataset.keyFormula || 'first_plus_tier';
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

    function computeKey() {
      var first = answers[questionKeys[0]];
      if (keyFormula === 'first_question') return first;
      var isPremium = questionKeys.slice(1).some(function (k) {
        return answers[k] === 'high' || answers[k] === 'special';
      });
      return first + '-' + (isPremium ? 'premium' : 'basic');
    }

    function setText(el, value) {
      if (!el) return;
      el.textContent = value || '';
      el.style.display = value ? '' : 'none';
    }

    function renderResult() {
      var p = RESULTS[computeKey()];
      var resultPanel = root.querySelector('.diag-result');
      if (!resultPanel || !p) return;

      resultPanel.querySelector('.diag-result-name').textContent = p.name || '';
      setText(resultPanel.querySelector('.diag-result-reason'), p.reason);
      setText(resultPanel.querySelector('.diag-result-price'), p.price);

      var tag = resultPanel.querySelector('.diag-result-avail');
      if (tag) {
        if (p.availLabel) {
          tag.textContent = p.availLabel;
          tag.className = 'avail-tag ' + (p.avail || 'confirm') + ' diag-result-avail';
          tag.style.display = '';
        } else {
          tag.style.display = 'none';
        }
      }

      var imageWrap = resultPanel.querySelector('.diag-result-image');
      if (imageWrap) {
        var img = imageWrap.querySelector('img');
        if (p.image && img) {
          img.src = p.image;
          img.alt = p.name || '';
          imageWrap.classList.add('is-visible');
        } else {
          imageWrap.classList.remove('is-visible');
        }
      }

      var link = resultPanel.querySelector('.diag-result-link');
      if (link) {
        if (p.url) {
          link.setAttribute('href', p.url);
          link.style.display = '';
        } else {
          link.style.display = 'none';
        }
      }
    }

    showPanel(0);
  }
})();
