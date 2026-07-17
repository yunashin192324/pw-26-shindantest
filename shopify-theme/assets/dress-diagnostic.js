/* ドレス診断（カタログ連動）— client-side only. Scores every dress in
   shop.metaobjects.dress_diagnostic_data against the visitor's answers
   (trait -> value) and shows the single best match. Adding/removing a
   dress in Admin needs no code change; this file only implements the
   scoring/UI, the data itself comes from dress-diagnostic.liquid's
   embedded JSON. */
(function () {
  'use strict';

  document.querySelectorAll('[data-dress-diagnostic]').forEach(initDressDiagnostic);

  function initDressDiagnostic(root) {
    var dataEl = document.getElementById(root.dataset.resultsId);
    var dresses = [];
    try { dresses = dataEl ? JSON.parse(dataEl.textContent) : []; } catch (e) { dresses = []; }

    var panels = root.querySelectorAll('.diag-panel');
    var total = root.querySelectorAll('.diag-panel[data-view="question"]').length;
    var answers = {};

    function showView(view, index) {
      panels.forEach(function (p) {
        var isQuestion = p.dataset.view === 'question';
        var match = p.dataset.view === view && (!isQuestion || parseInt(p.dataset.index, 10) === index);
        p.classList.toggle('is-active', match);
      });
    }

    function updateProgress(index) {
      var fill = root.querySelector('.diag-progress-fill');
      if (fill && total > 0) fill.style.width = (index / total * 100) + '%';
    }

    var startBtn = root.querySelector('[data-start]');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        answers = {};
        updateProgress(0);
        showView('question', 0);
      });
    }

    root.querySelectorAll('.diag-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = btn.closest('.diag-panel');
        var index = parseInt(panel.dataset.index, 10);
        answers[btn.dataset.trait] = btn.dataset.value;
        var next = index + 1;
        if (next < total) {
          updateProgress(next);
          showView('question', next);
        } else {
          updateProgress(total);
          renderResult();
          showView('result');
        }
      });
    });

    root.querySelectorAll('[data-restart]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        answers = {};
        showView('start');
      });
    });

    function renderResult() {
      var resultPanel = root.querySelector('.diag-result');
      if (!resultPanel) return;
      var nameEl = resultPanel.querySelector('.diag-result-name');
      var reasonEl = resultPanel.querySelector('.diag-result-reason');
      var sizeEl = resultPanel.querySelector('.diag-result-size');
      var imageWrap = resultPanel.querySelector('.diag-result-image');

      if (!dresses.length) {
        if (nameEl) nameEl.textContent = '';
        if (reasonEl) reasonEl.textContent = '現在、診断対象のドレスが登録されていません。';
        if (sizeEl) sizeEl.style.display = 'none';
        if (imageWrap) imageWrap.classList.remove('is-visible');
        return;
      }

      var best = null;
      var bestScore = -1;
      dresses.forEach(function (dress) {
        var score = 0;
        Object.keys(answers).forEach(function (trait) {
          if (dress.traits && dress.traits[trait] === answers[trait]) score += 1;
        });
        if (score > bestScore) {
          bestScore = score;
          best = dress;
        }
      });
      if (!best) return;

      if (nameEl) nameEl.textContent = best.name || '';
      if (reasonEl) reasonEl.textContent = best.desc || '';

      if (sizeEl) {
        if (best.size) {
          sizeEl.textContent = '対応サイズ：' + best.size;
          sizeEl.style.display = '';
        } else {
          sizeEl.style.display = 'none';
        }
      }

      if (imageWrap) {
        var img = imageWrap.querySelector('img');
        if (best.img && img) {
          img.src = best.img;
          img.alt = best.name || '';
          imageWrap.classList.add('is-visible');
        } else {
          imageWrap.classList.remove('is-visible');
        }
      }
    }
  }
})();
