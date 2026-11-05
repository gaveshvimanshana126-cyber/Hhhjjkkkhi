/* ============================================================================
   Movie Mania LK — WhatsApp download gate (shared by index / movie / tv pages)
   Rules (enforced on the server by POST /api/wp/claim):
     • Login required
     • Free account: 3 downloads per day → then "Daily Limit Reached"
     • Premium account: unlimited
   Uses the page's own globals: currentUser, openAuthModal, toast, adGate.
   ========================================================================== */
(function () {
  var WP_RE = /\/wp\/download\/([A-Za-z0-9_-]+)/i;

  function getUser() {
    try { if (typeof currentUser !== 'undefined' && currentUser) return currentUser; } catch (_) {}
    try { return JSON.parse(localStorage.getItem('cf_user')); } catch (_) { return null; }
  }
  function saveUser(u) {
    try { localStorage.setItem('cf_user', JSON.stringify(u)); } catch (_) {}
  }
  function say(msg) {
    if (typeof toast === 'function') toast(msg); else alert(msg);
  }
  function closeGateway() {
    try { if (typeof closeDownloadGateway === 'function') closeDownloadGateway(); } catch (_) {}
  }
  function askLogin(msg) {
    closeGateway();
    say(msg || 'WhatsApp Download කරන්න මුලින් Register / Login වෙන්න');
    try { if (typeof openAuthModal === 'function') openAuthModal(); } catch (_) {}
  }

  /* ---------- "Daily Limit Reached" popup ---------- */
  function showLimit(limit) {
    var old = document.getElementById('mmWpLimit');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'mmWpLimit';
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.78);font-family:Manrope,system-ui,sans-serif';
    el.innerHTML =
      '<div style="max-width:360px;width:100%;background:#17130f;border:1px solid rgba(232,38,42,.45);border-radius:18px;padding:26px 22px;text-align:center;color:#f2ece2;box-shadow:0 20px 50px rgba(0,0,0,.6)">' +
        '<div style="font-size:42px;line-height:1">🚫</div>' +
        '<div style="font-size:19px;font-weight:800;margin:12px 0 6px;color:#ff5a5e">Daily Limit Reached</div>' +
        '<div style="font-size:13.5px;line-height:1.7;color:#d9d0c2">අද දවසට Free Downloads ' + limit + ' ම අවසන්.<br>හෙට නැවත Downloads ' + limit + ' ක් ලැබෙනවා.<br><b style="color:#ffd166">Premium</b> Account එකකට <b>Unlimited Downloads</b>.</div>' +
        '<button id="mmWpLimitOk" style="margin-top:20px;width:100%;padding:12px;border:0;border-radius:12px;background:#e8262a;color:#fff;font-weight:800;font-size:14px;cursor:pointer">හරි</button>' +
      '</div>';
    document.body.appendChild(el);
    function close() { el.remove(); }
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    document.getElementById('mmWpLimitOk').onclick = close;
  }

  /* ---------- Firebase tokens last 1 hour → refresh when expired ---------- */
  async function refreshSession(u) {
    if (!u || !u.refreshToken) return false;
    try {
      var r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', refreshToken: u.refreshToken })
      });
      if (!r.ok) return false;
      var d = await r.json();
      if (!d || !d.idToken) return false;
      u.idToken = d.idToken;
      if (d.refreshToken) u.refreshToken = d.refreshToken;
      saveUser(u);
      return true;
    } catch (_) { return false; }
  }

  async function claim(code, u, retried) {
    var res, data = {};
    try {
      res = await fetch('/api/wp/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, idToken: u.idToken })
      });
      try { data = await res.json(); } catch (_) {}
    } catch (_) {
      say('Network error. නැවත උත්සාහ කරන්න.');
      return;
    }

    if (res.status === 401) {
      if (!retried && (await refreshSession(u))) return claim(code, u, true);
      askLogin('Session එක අවසන්. නැවත Login වෙන්න.');
      return;
    }
    if (res.status === 429) { closeGateway(); showLimit(data.limit || 3); return; }
    if (!res.ok || !data.whatsappUrl) {
      say((data && (data.message || data.error)) || 'Download කරන්න බැරි වුණා. නැවත උත්සාහ කරන්න.');
      return;
    }

    if (!data.premium && typeof data.remaining === 'number') {
      say('✅ WhatsApp එක open වෙනවා · අද තව Downloads ' + data.remaining + ' ක් ඉතුරුයි');
    }
    // Navigate (not window.open) so popup blockers can't stop it after the async call.
    setTimeout(function () { window.location.assign(data.whatsappUrl); }, data.premium ? 0 : 700);
  }

  function start(code) {
    var u = getUser();
    if (!u || !u.idToken) { askLogin(); return; }       // must register / log in first
    var run = function () { claim(code, u, false); };
    if (typeof adGate === 'function') adGate('wp_' + code, run); else run();
  }

  /* Called from finalizeDownload(url) on each page. true = handled here. */
  window.mmWpIntercept = function (url) {
    var m = WP_RE.exec(String(url || ''));
    if (!m) return false;
    start(m[1]);
    return true;
  };

  // Visitors who hit /wp/download/CODE directly are sent to /?wp=login
  document.addEventListener('DOMContentLoaded', function () {
    if (/[?&]wp=login/.test(location.search) && !getUser()) {
      setTimeout(function () { askLogin('WhatsApp Download කරන්න මුලින් Login වෙන්න'); }, 600);
    }
  });
})();
