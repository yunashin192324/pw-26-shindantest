/* =====================================================================
   propose.js — shared LP interactions (header, FAQ, reveal, ph paint)
   Vanilla JS, no dependencies. Ported 1:1 into shopify-theme/assets/.
   ===================================================================== */
(function () {
  "use strict";

  // ---- Header scroll state ----
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ---- Mobile nav toggle ----
  var toggle = document.querySelector(".nav-toggle");
  var navLinks = document.querySelector(".nav-links");
  if (toggle && navLinks) {
    toggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      navLinks.style.display = open ? "flex" : "";
    });
  }

  // ---- Paint gradient placeholder photos from data-hue="#c1,#c2" ----
  document.querySelectorAll(".ph[data-hue]").forEach(function (el) {
    var parts = el.getAttribute("data-hue").split(",");
    if (parts[0]) el.style.setProperty("--c1", parts[0].trim());
    if (parts[1]) el.style.setProperty("--c2", parts[1].trim());
  });

  // ---- FAQ accordion ----
  document.querySelectorAll(".faq-q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".faq-item");
      var expanded = item.getAttribute("aria-expanded") === "true";
      document.querySelectorAll(".faq-item").forEach(function (i) { i.setAttribute("aria-expanded", "false"); });
      item.setAttribute("aria-expanded", expanded ? "false" : "true");
    });
  });

  // ---- Scroll reveal (fade only, respects reduced motion) ----
  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReduced && "IntersectionObserver" in window) {
    var revealables = document.querySelectorAll("[data-reveal]");
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
  }

  // ---- Data-driven render: destination grid / flow / invite tips / FAQ ----
  // Keeping these data-driven (rather than 10 hand-written cards) mirrors
  // how the Shopify build works: add one metafield entry / section block
  // and every list on the site picks it up automatically.
  var D = window.ProposeData;
  if (D) {
    var destGrid = document.getElementById("destination-grid");
    if (destGrid) {
      destGrid.innerHTML = D.locations.map(function (l) {
        return (
          '<a class="dest-card" href="location.html?loc=' + l.id + '" data-reveal>' +
          '<span class="ph" data-hue="' + l.hue[0] + "," + l.hue[1] + '" data-label="' + l.name + '"></span>' +
          '<span class="dest-card-body">' +
          (l.popular ? '<span class="dest-tag">POPULAR</span>' : "") +
          "<h3>" + l.name + '</h3><div class="dest-ja">' + l.nameJa + "</div>" +
          '<p class="dest-copy">' + l.tagline + "</p>" +
          '<div class="dest-price">' + D.formatYen(l.fromPrice) + '<span> 〜</span></div>' +
          "</span></a>"
        );
      }).join("");
    }

    var flowList = document.getElementById("flow-list");
    if (flowList) {
      flowList.innerHTML = D.howItWorks.map(function (s) {
        return '<div class="flow-item" data-reveal><span class="step-no">' + s.step + '</span><div><h3>' + s.title + "</h3><p>" + s.desc + "</p></div></div>";
      }).join("");
    }

    var tipList = document.getElementById("tip-list");
    if (tipList) {
      tipList.innerHTML = D.inviteTips.map(function (t) {
        return '<div class="tip-item" data-reveal><span class="tip-mark">＋</span><span>' + t + "</span></div>";
      }).join("");
    }

    var faqList = document.getElementById("faq-list");
    if (faqList) {
      faqList.innerHTML = D.faq.map(function (f, i) {
        return (
          '<div class="faq-item" aria-expanded="false">' +
          '<button class="faq-q" aria-controls="faq-a-' + i + '"><span>' + f.q + '</span><span class="mark">＋</span></button>' +
          '<div class="faq-a" id="faq-a-' + i + '"><p class="faq-a-inner">' + f.a + "</p></div>" +
          "</div>"
        );
      }).join("");
      // re-bind (this runs before the accordion binder above in DOM order
      // safety, so bind directly here too)
      faqList.querySelectorAll(".faq-q").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var item = btn.closest(".faq-item");
          var expanded = item.getAttribute("aria-expanded") === "true";
          document.querySelectorAll(".faq-item").forEach(function (i) { i.setAttribute("aria-expanded", "false"); });
          item.setAttribute("aria-expanded", expanded ? "false" : "true");
        });
      });
      faqList.querySelectorAll(".ph[data-hue]").forEach(paintHue);
    }

    // Re-run hue paint + reveal registration for nodes injected above.
    document.querySelectorAll(".ph[data-hue]").forEach(paintHue);
    if (!prefersReduced && "IntersectionObserver" in window) {
      var io2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.style.transition = "opacity .7s ease, transform .7s ease";
            entry.target.style.opacity = "1";
            entry.target.style.transform = "none";
            io2.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      document.querySelectorAll("[data-reveal]").forEach(function (el) {
        if (el.style.opacity === "") { el.style.opacity = "0"; el.style.transform = "translateY(16px)"; }
        io2.observe(el);
      });
    }
  }

  function paintHue(el) {
    var parts = el.getAttribute("data-hue").split(",");
    if (parts[0]) el.style.setProperty("--c1", parts[0].trim());
    if (parts[1]) el.style.setProperty("--c2", parts[1].trim());
  }

  // ---- Smooth-scroll CTA targets within the same page ----
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").slice(1);
      var target = id && document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
      }
    });
  });
})();
