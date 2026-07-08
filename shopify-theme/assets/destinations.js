/* ===================================================================
   撮影地一覧 (Destinations) — 独立ビヘイビア。Vanilla JS, no dependencies.
   layout/theme.destinations.liquid からのみ読み込まれる。
   assets/theme.js とは完全に独立（DOM構造・クラス名がdst-接頭辞のため
   衝突しない）。
   =================================================================== */
(function () {
  'use strict';

  /* ---------- Header: solid background after scroll ---------- */
  var header = document.querySelector('.dst-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 40);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Mobile nav toggle ---------- */
  var toggle = document.querySelector('.dst-nav-toggle');
  var navLinks = document.querySelector('.dst-nav-links');
  if (toggle && navLinks) {
    toggle.addEventListener('click', function () {
      var open = navLinks.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        navLinks.classList.remove('is-open');
        document.body.style.overflow = '';
      });
    });
  }

  /* ---------- Scroll reveal (fade-up), IntersectionObserver only ---------- */
  var revealEls = document.querySelectorAll('.dst-reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.dst-accordion-item').forEach(function (item) {
    var trigger = item.querySelector('.dst-accordion-trigger');
    var panel = item.querySelector('.dst-accordion-panel');
    if (!trigger || !panel) return;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', function () {
      var isOpen = item.classList.contains('is-open');
      item.classList.toggle('is-open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
      panel.style.maxHeight = isOpen ? null : panel.scrollHeight + 'px';
    });
  });

  /* ---------- Incremental search ----------
     destinations-search.liquid embeds the full Destination catalogue as a
     lightweight JSON payload (#dst-search-data — text fields + one small
     thumbnail URL each, no full card markup) so that with 120-300 cities
     the page never has to eagerly render/load hundreds of card images:
     result cards are only created, on demand, from a <template> for the
     rows that actually match the current query. */
  var searchInput = document.getElementById('dst-search-input');
  var searchDataEl = document.getElementById('dst-search-data');
  var resultsEl = document.getElementById('dst-search-results');
  var resultTemplate = document.getElementById('dst-result-template');
  var countEl = document.getElementById('dst-search-count');
  var emptyEl = document.getElementById('dst-search-empty');

  if (searchInput && searchDataEl && resultsEl && resultTemplate && countEl) {
    var destinations = [];
    try {
      destinations = JSON.parse(searchDataEl.textContent || '[]');
    } catch (e) {
      destinations = [];
    }

    var renderResults = function (matches) {
      resultsEl.textContent = '';
      var frag = document.createDocumentFragment();
      matches.forEach(function (dest) {
        var node = resultTemplate.content.firstElementChild.cloneNode(true);
        node.setAttribute('href', dest.url);
        var img = node.querySelector('img');
        if (img) {
          img.src = dest.thumb;
          img.alt = dest.name_ja;
        }
        var country = node.querySelector('.dst-card-country');
        if (country) country.textContent = dest.country;
        var nameEn = node.querySelector('.dst-card-name-en');
        if (nameEn) nameEn.textContent = dest.name_en;
        var nameJa = node.querySelector('.dst-card-name-ja');
        if (nameJa) nameJa.textContent = dest.name_ja;
        var themesEl = node.querySelector('.dst-card-themes');
        if (themesEl && Array.isArray(dest.theme_labels)) {
          dest.theme_labels.forEach(function (label) {
            var tag = document.createElement('span');
            tag.className = 'dst-tag';
            tag.textContent = label;
            themesEl.appendChild(tag);
          });
        }
        frag.appendChild(node);
      });
      resultsEl.appendChild(frag);
    };

    var runSearch = function () {
      var rawQuery = searchInput.value.trim();
      var themeKey = searchInput.dataset.filterTheme || '';

      if (!rawQuery && !themeKey) {
        resultsEl.hidden = true;
        resultsEl.textContent = '';
        emptyEl.classList.remove('is-visible');
        countEl.textContent = '';
        return;
      }

      var query = rawQuery.toLowerCase();
      var matches = destinations.filter(function (dest) {
        if (themeKey) {
          return Array.isArray(dest.themes) && dest.themes.indexOf(themeKey) !== -1;
        }
        var haystack = [dest.name_ja, dest.name_en, dest.country, dest.region_label]
          .concat(dest.theme_labels || [])
          .join(' ')
          .toLowerCase();
        return haystack.indexOf(query) !== -1;
      });

      resultsEl.hidden = false;
      countEl.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = String(matches.length);
      countEl.appendChild(strong);
      countEl.appendChild(document.createTextNode('件 見つかりました'));

      emptyEl.classList.toggle('is-visible', matches.length === 0);
      renderResults(matches);
    };

    searchInput.addEventListener('input', function () {
      delete searchInput.dataset.filterTheme;
      runSearch();
    });

    /* テーマタイル / 人気タグなど、ページ内の他要素から検索条件を
       セットするための共通イベント。detail: { query, themeKey, label } */
    document.addEventListener('dst:search', function (evt) {
      var detail = evt.detail || {};
      searchInput.value = detail.label || detail.query || '';
      if (detail.themeKey) {
        searchInput.dataset.filterTheme = detail.themeKey;
      } else {
        delete searchInput.dataset.filterTheme;
      }
      runSearch();
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ---------- テーマタイル: クリックで検索条件へ反映 ---------- */
  document.querySelectorAll('[data-dst-theme-key]').forEach(function (tile) {
    tile.addEventListener('click', function (evt) {
      if (!searchInput) return;
      evt.preventDefault();
      document.querySelectorAll('[data-dst-theme-key]').forEach(function (t) {
        t.classList.remove('is-active');
      });
      tile.classList.add('is-active');
      document.dispatchEvent(new CustomEvent('dst:search', {
        detail: { themeKey: tile.dataset.dstThemeKey, label: tile.dataset.dstThemeLabel || '' }
      }));
    });
  });
})();
