/* HIS World Wedding — product page behaviour. Vanilla JS, no dependencies.
   theme.js already covers header scroll state, mobile nav, .reveal
   fade-in and the .accordion (FAQ) toggle — all reused as-is here. */
(function () {
  'use strict';

  /* ⑫ 関連商品 — Shopify product recommendations (Search & Discovery) */
  if (!window.customElements || !customElements.get('product-recommendations')) {
    class ProductRecommendations extends HTMLElement {
      connectedCallback() {
        var url = this.dataset.url;
        if (!url) return;

        var load = function () {
          fetch(url)
            .then(function (response) { return response.text(); })
            .then(function (text) {
              var html = document.createElement('div');
              html.innerHTML = text;
              var recommendations = html.querySelector('product-recommendations');
              if (recommendations && recommendations.innerHTML.trim().length) {
                this.innerHTML = recommendations.innerHTML;
                initCarousels(this);
              }
            }.bind(this))
            .catch(function (error) { console.error('product-recommendations fetch failed', error); });
        }.bind(this);

        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (entries, observer) {
            if (!entries[0].isIntersecting) return;
            observer.unobserve(this);
            load();
          }.bind(this), { rootMargin: '0px 0px 400px 0px' });
          io.observe(this);
        } else {
          load();
        }
      }
    }
    customElements.define('product-recommendations', ProductRecommendations);
  }

  /* Prev/next buttons for any .carousel (used by product-recommendations) */
  function initCarousels(scope) {
    (scope || document).querySelectorAll('.carousel').forEach(function (carousel) {
      if (carousel.dataset.carouselBound) return;
      carousel.dataset.carouselBound = 'true';
      var track = carousel.querySelector('.carousel-viewport');
      var prev = carousel.querySelector('.carousel-prev');
      var next = carousel.querySelector('.carousel-next');
      if (!track) return;
      var scrollByAmount = function () {
        var item = track.querySelector('.carousel-item');
        return item ? item.getBoundingClientRect().width + 24 : track.clientWidth * 0.8;
      };
      if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -scrollByAmount(), behavior: 'smooth' }); });
      if (next) next.addEventListener('click', function () { track.scrollBy({ left: scrollByAmount(), behavior: 'smooth' }); });
    });
  }
  initCarousels(document);
})();
