/* =====================================================================
   propose.js (Shopify build) — scroll-reveal only.
   Header scroll state, nav toggle and FAQ accordions are already
   handled by theme.js and by the inline script in propose-faq.liquid /
   propose-faq-list.liquid respectively, so this file has one job.
   ===================================================================== */
(function () {
  "use strict";
  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealables = document.querySelectorAll("[data-pp-reveal]");
  if (!revealables.length) return;

  if (prefersReduced || !("IntersectionObserver" in window)) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.style.transition = "opacity .7s ease, transform .7s ease";
        entry.target.style.opacity = "1";
        entry.target.style.transform = "none";
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  revealables.forEach(function (el) {
    el.style.opacity = "0";
    el.style.transform = "translateY(16px)";
    io.observe(el);
  });
})();
