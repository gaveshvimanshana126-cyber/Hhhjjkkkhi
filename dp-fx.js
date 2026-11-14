/* Details-page effects (movie.html + tv.html): scroll reveal, rating count-up,
   hero parallax (desktop banner). Pure progressive enhancement – if anything
   fails the page simply shows normally. Respects prefers-reduced-motion. */
(function () {
  'use strict';
  if (window.__dpFx) return;
  window.__dpFx = true;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  var REVEAL = '.dp-section-head,.dp-cast-row,.dp-stills-row,.dp-dl-wrap,.dp-sub-wrap,' +
               '.dp-similar-row,.dp-comment-wrap,#dpSeasonsWrap,.dp-credit-row';
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

  function countUp(el) {
    var m = (el.textContent || '').match(/(\d+(?:\.\d+)?)/);
    if (!m) return;
    var to = parseFloat(m[1]), dec = (m[1].split('.')[1] || '').length, t0 = performance.now();
    var raw = el.textContent;
    (function step(t) {
      var p = Math.min((t - t0) / 1100, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = raw.replace(m[1], (to * e).toFixed(dec));
      if (p < 1) requestAnimationFrame(step); else el.textContent = raw;
    })(t0);
  }

  var card = null, ticking = false;
  function onScroll() {
    if (ticking || !card) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (!card.isConnected) { card = null; return; }
      var y = Math.min(window.scrollY, 600);
      card.style.setProperty('--py', (y * 0.2).toFixed(1) + 'px');
    });
  }
  addEventListener('scroll', onScroll, { passive: true });

  function init() {
    var hero = document.querySelector('.dp-hero-card');
    if (!hero || hero.__fx) return;
    hero.__fx = true;
    card = hero;
    document.documentElement.classList.add('dp-fx');

    var rate = hero.querySelector('.dp-badge-rate');
    if (rate) countUp(rate);

    document.querySelectorAll(REVEAL).forEach(function (el) {
      el.classList.add('dp-rv');
      el.querySelectorAll('.dp-cast-item,.dp-similar-item').forEach(function (c, i) {
        c.style.setProperty('--i', Math.min(i, 12));
      });
      io.observe(el);
    });
  }

  var t;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(init, 60); })
    .observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') init(); else addEventListener('DOMContentLoaded', init);
})();
