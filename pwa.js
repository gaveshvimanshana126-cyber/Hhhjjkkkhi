/* ══════════════════════════════════════════════════════════════════════════
   MovieMania LK — PWA install + service worker
   Shared by index.html, movie.html and tv.html.

   Loaded in <head> (blocking, tiny) so `beforeinstallprompt` is captured
   before it can fire. Any element marked with `data-pwa-banner` becomes an
   install button: tapping it opens the browser's native install prompt.

   Exposes:
     window.installPWA()     → open install prompt (or show instructions)
     window.closeInstallBar()→ backwards-compatible no-op for old markup
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var deferredPrompt = null;
  var installed = false;
  var prompting = false;
  var lastTrigger = null;

  function isStandalone() {
    try {
      return (
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true
      );
    } catch (_) {
      return false;
    }
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // iPadOS 13+ reports itself as a Mac — detect touch support instead.
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  function hideBanners() {
    var banners = document.querySelectorAll('[data-pwa-banner]');
    for (var i = 0; i < banners.length; i++) banners[i].style.display = 'none';
  }

  // Runs while the document is still parsing (this file loads in <head>), so the
  // banner never flashes inside the already-installed standalone app.
  try {
    var hideCss = document.createElement('style');
    hideCss.textContent =
      '@media (display-mode: standalone), (display-mode: fullscreen), ' +
      '(display-mode: minimal-ui) { [data-pwa-banner] { display: none !important; } }' +
      'html[data-pwa-installed] [data-pwa-banner] { display: none !important; }';
    (document.head || document.documentElement).appendChild(hideCss);
  } catch (_) {}

  /* ── Tiny toast (used only when the page has no toast() of its own) ───── */
  function flash(message) {
    if (typeof window.toast === 'function') {
      try {
        window.toast(message);
        return;
      } catch (_) {}
    }
    if (!document.body) return;

    var el = document.getElementById('mmPwaFlash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mmPwaFlash';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText =
        'position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);' +
        'z-index:2147483647;max-width:92vw;padding:12px 18px;border-radius:12px;' +
        'background:#1a1614;color:#f2ece2;border:1px solid rgba(240,25,61,.5);' +
        'box-shadow:0 10px 30px rgba(0,0,0,.5);font:600 14px/1.5 system-ui,sans-serif;' +
        'text-align:center;opacity:0;transition:opacity .25s,transform .25s;' +
        'pointer-events:none;';
      document.body.appendChild(el);
    }

    el.textContent = message;
    void el.offsetWidth; // restart the transition
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,0)';

    clearTimeout(el._mmTimer);
    el._mmTimer = setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,16px)';
    }, 3600);
  }

  /* ── Manual instructions (iOS has no prompt; desktop may be gated) ────── */
  var helpEl = null;
  var helpCloseBtn = null;

  function buildHelp() {
    var overlay = document.createElement('div');
    overlay.id = 'mmPwaHelp';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mmPwaHelpTitle');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;display:none;' +
      'align-items:center;justify-content:center;padding:20px;' +
      'background:rgba(6,5,4,.8);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);';

    var steps = isIOS()
      ? [
          'Safari මෙනුවේ <b>Share</b> (⬆) අයිකනය ඔබන්න.',
          '<b>Add to Home Screen</b> / <b>Home Screen එකට එකතු කරන්න</b> තෝරන්න.',
          'ඉහළින් <b>Add</b> ඔබන්න — දැන් Home Screen එකේ MovieMania LK ඇත.',
        ]
      : [
          'Browser මෙනුව (<b>⋮</b>) ඔබන්න.',
          '<b>Install app</b> හෝ <b>Add to Home screen</b> තෝරන්න.',
          '<b>Install</b> ඔබන්න — දැන් ඔබේ Home Screen එකේ ඇත.',
        ];

    overlay.innerHTML =
      '<div style="width:100%;max-width:420px;background:#141210;color:#f2ece2;' +
      'border:1px solid rgba(240,25,61,.35);border-radius:18px;padding:22px 20px 18px;' +
      'box-shadow:0 24px 60px rgba(0,0,0,.6);font-family:system-ui,-apple-system,\'Segoe UI\',sans-serif;">' +
      '<h2 id="mmPwaHelpTitle" style="margin:0 0 6px;font-size:18px;line-height:1.35;">' +
      'MovieMania LK App එක install කරන්න</h2>' +
      '<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#b9b0a6;">' +
      'ඔබේ browser එකේ ස්වයංක්‍රීය install prompt එක නොපෙන්වන විට, පහත පියවර අනුගමනය කරන්න.</p>' +
      '<ol style="margin:0 0 16px;padding-left:20px;font-size:13.5px;line-height:1.8;color:#e8e0d6;">' +
      steps.map(function (s) { return '<li style="margin-bottom:4px;">' + s + '</li>'; }).join('') +
      '</ol>' +
      '<button type="button" id="mmPwaHelpClose" style="width:100%;padding:11px 14px;' +
      'border:0;border-radius:10px;background:#f0193d;color:#fff;font:700 14px system-ui,sans-serif;' +
      'cursor:pointer;">තේරුණා</button>' +
      '</div>';

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeHelp();
    });

    document.body.appendChild(overlay);
    helpEl = overlay;
    helpCloseBtn = overlay.querySelector('#mmPwaHelpClose');
    helpCloseBtn.addEventListener('click', closeHelp);

    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHelp();
        return;
      }
      // Only one focusable control in this dialog — keep focus inside it.
      if (event.key === 'Tab') {
        event.preventDefault();
        try {
          helpCloseBtn.focus();
        } catch (_) {}
      }
    });

    return overlay;
  }

  function openHelp() {
    if (!document.body) return;
    var overlay = helpEl || buildHelp();
    overlay.style.display = 'flex';
    try {
      helpCloseBtn.focus();
    } catch (_) {}
  }

  function closeHelp() {
    if (helpEl) helpEl.style.display = 'none';
    if (lastTrigger && typeof lastTrigger.focus === 'function') {
      try {
        lastTrigger.focus();
      } catch (_) {}
    }
  }

  /* ── Public install action ────────────────────────────────────────────── */
  function installPWA() {
    if (isStandalone() || installed) {
      flash('MovieMania LK දැනටමත් install කරලා තියෙනවා 🎬');
      return;
    }

    if (prompting) return;

    if (deferredPrompt) {
      var promptEvent = deferredPrompt;
      deferredPrompt = null; // a prompt event can only be used once
      prompting = true;

      var finish = function () {
        prompting = false;
      };

      try {
        promptEvent.prompt();
        var choice = promptEvent.userChoice;
        if (choice && typeof choice.then === 'function') {
          choice
            .then(function (result) {
              finish();
              if (result && result.outcome === 'accepted') {
                installed = true;
                hideBanners();
                flash('MovieMania LK install වුණා 🎬');
              }
            })
            .catch(finish);
        } else {
          finish();
        }
      } catch (_) {
        finish();
        openHelp();
      }
      return;
    }

    // No prompt captured (iOS Safari, in-app browsers, or Chrome not ready yet).
    openHelp();
  }

  /* ── Capture the browser prompt as early as possible ──────────────────── */
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
  });

  window.addEventListener('appinstalled', function () {
    installed = true;
    deferredPrompt = null;
    try {
      document.documentElement.setAttribute('data-pwa-installed', '1');
    } catch (_) {}
    hideBanners();
    flash('MovieMania LK install වුණා 🎬');
  });

  /* ── Wire the banner(s) ───────────────────────────────────────────────── */
  function boot() {
    if (isStandalone()) {
      try {
        document.documentElement.setAttribute('data-pwa-installed', '1');
      } catch (_) {}
      hideBanners();
    }

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || target.nodeType !== 1) return;
      var trigger = target.closest ? target.closest('[data-pwa-banner]') : null;
      if (!trigger) return;

      event.preventDefault();
      lastTrigger = trigger;
      installPWA();
    });

    // role="button" on a link: make the Space key work like Enter.
    document.addEventListener('keydown', function (event) {
      if (event.key !== ' ' && event.key !== 'Spacebar') return;
      var target = event.target;
      if (!target || target.nodeType !== 1) return;
      var trigger = target.closest ? target.closest('[data-pwa-banner]') : null;
      if (!trigger) return;

      event.preventDefault();
      lastTrigger = trigger;
      installPWA();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ── Register the service worker (required for installability) ────────── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(function () {
          /* Registration failures must never break the page. */
        });
    });
  }

  // Backwards-compatible globals (old markup / embedded campaign banner).
  window.installPWA = installPWA;
  window.closeInstallBar = function () {
    var bar = document.getElementById('pwaInstallBar');
    if (bar) bar.style.display = 'none';
  };
})();
