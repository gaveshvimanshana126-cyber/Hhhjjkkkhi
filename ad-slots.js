/* ═══════════════════════════════════════════════════════════════════════════
   MovieManiaLK — auto-rotating ad slots
   ---------------------------------------------------------------------------
   Every element marked with [data-ad-slot] cycles through its direct
   .mm-ad-slide children (PWA install banner, WhatsApp channel banner, ...).

   • Starts on a random banner so both ads get exposure.
   • Changes every 8 seconds (override with data-interval="6000").
   • Pauses while hovered / keyboard-focused, resumes on leave.
   • Stops when the tab is hidden.
   • If a banner image fails to load it is dropped and the next one is shown.
   • If the PWA is installed (banner hidden by /pwa.js) the WhatsApp banner
     takes over automatically.
   • Without JS, or for prefers-reduced-motion users, CSS keeps the banners
     stacked as a small list (no rotation).

   Slots can be injected at any time (download gateway, detail view, …) —
   a MutationObserver picks them up automatically.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DEFAULT_INTERVAL = 8000;

  var reduceMotion = false;
  try {
    reduceMotion =
      !!(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) {}
  if (reduceMotion) return; // keep the stacked list

  function slidesOf(slot) {
    var list = [];
    for (var i = 0; i < slot.children.length; i++) {
      var el = slot.children[i];
      if (el.classList && el.classList.contains('mm-ad-slide')) list.push(el);
    }
    return list;
  }

  function initSlot(slot) {
    if (slot.__mmAdSlot) return;
    var slides = slidesOf(slot);
    if (slides.length < 2) return;

    slot.__mmAdSlot = true;
    slot.classList.add('mm-rotating');

    var current = null;
    var timer = null;
    var paused = false;
    var interval = parseInt(slot.getAttribute('data-interval'), 10);
    if (!interval || interval < 3000) interval = DEFAULT_INTERVAL;

    function usable(slide) {
      return (
        slide.getAttribute('data-mm-dead') !== '1' &&
        slide.style.display !== 'none' &&
        !(
          slide.hasAttribute('data-pwa-banner') &&
          document.documentElement.hasAttribute('data-pwa-installed')
        )
      );
    }

    function alive() {
      return slides.filter(usable);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function hideSlot() {
      stop();
      slot.classList.remove('mm-rotating');
      slot.style.display = 'none';
    }

    function paint(slide) {
      for (var i = 0; i < slides.length; i++) {
        slides[i].classList.remove('is-active');
      }
      if (!slide) return;
      current = slide;
      slide.classList.add('is-active');
    }

    function next() {
      if (!slot.isConnected) {
        stop();
        return;
      }
      var list = alive();
      if (!list.length) {
        hideSlot();
        return;
      }
      if (list.length === 1) {
        paint(list[0]);
        stop();
        return;
      }
      var i = list.indexOf(current);
      paint(list[(i + 1) % list.length]);
    }

    function start() {
      if (timer || paused || !slot.isConnected) return;
      if (alive().length < 2) return;
      timer = setInterval(next, interval);
    }

    function pause() {
      paused = true;
      stop();
    }

    function resume() {
      paused = false;
      start();
    }

    function drop(slide) {
      if (slide.getAttribute('data-mm-dead') === '1') return;
      slide.setAttribute('data-mm-dead', '1');
      slide.classList.remove('is-active');
      if (!alive().length) {
        hideSlot();
        return;
      }
      if (slide === current) {
        current = null;
        next();
      }
    }

    // Broken banner → skip it (never leave an empty slot behind).
    slides.forEach(function (slide) {
      var img = slide.querySelector('img');
      if (!img) return;
      img.addEventListener('error', function () {
        drop(slide);
      });
      if (img.complete && img.naturalWidth === 0) {
        setTimeout(function () {
          drop(slide);
        }, 0);
      }
    });

    var list = alive();
    if (!list.length) {
      hideSlot();
      return;
    }
    paint(list[Math.floor(Math.random() * list.length)]);

    // The PWA banner disappears after install — switch to the next banner.
    if (window.MutationObserver) {
      var observer = new MutationObserver(function () {
        if (!slot.isConnected) {
          observer.disconnect();
          return;
        }
        if (current && !usable(current)) {
          current = null;
          next();
        }
      });
      try {
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-pwa-installed'],
        });
      } catch (_) {}
    }

    slot.addEventListener('mouseenter', pause);
    slot.addEventListener('mouseleave', resume);
    slot.addEventListener('focusin', pause);
    slot.addEventListener('focusout', function (event) {
      if (!slot.contains(event.relatedTarget)) resume();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') resume();
      else stop();
    });

    start();
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches('[data-ad-slot]')) initSlot(root);
    if (root.querySelectorAll) {
      var slots = root.querySelectorAll('[data-ad-slot]');
      for (var i = 0; i < slots.length; i++) initSlot(slots[i]);
    }
  }

  function boot() {
    scan(document.body);
    if (!window.MutationObserver) return;

    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) scan(added[j]);
      }
    }).observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
