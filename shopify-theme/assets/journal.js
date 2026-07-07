/* HIS World Wedding — JOURNAL behaviour. Vanilla JS, no dependencies.
   Builds the article table of contents from the rendered rich-text body
   and highlights the current section while scrolling. Loads after
   assets/theme.js (shared header / reveal / accordion behaviour). */
(function () {
  'use strict';

  var content = document.querySelector('[data-article-content]');
  var tocList = document.querySelector('[data-toc-list]');
  var tocWrap = document.querySelector('[data-toc]');
  if (!content || !tocList || !tocWrap) return;

  var headings = content.querySelectorAll('h2, h3');
  if (!headings.length) return;

  var links = [];
  headings.forEach(function (heading, index) {
    if (!heading.id) heading.id = 'toc-' + index;

    var li = document.createElement('li');
    if (heading.tagName === 'H3') li.className = 'toc-h3';

    var a = document.createElement('a');
    a.href = '#' + heading.id;
    a.textContent = heading.textContent;
    li.appendChild(a);
    tocList.appendChild(li);
    links.push({ link: a, target: heading });
  });

  tocWrap.hidden = false;

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var match = links.filter(function (item) { return item.target === entry.target; })[0];
          if (!match) return;
          if (entry.isIntersecting) {
            links.forEach(function (item) { item.link.classList.remove('is-active'); });
            match.link.classList.add('is-active');
          }
        });
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    headings.forEach(function (heading) { io.observe(heading); });
  }
})();
