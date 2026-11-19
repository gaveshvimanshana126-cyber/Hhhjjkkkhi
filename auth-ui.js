/* Sign In modal redesign + "Remember me" + "Lost password". Load in <head>. */
(function(){
  // Remember Me off => session ends when the browser is closed
  try{
    if(localStorage.getItem('cf_remember')==='0' && !sessionStorage.getItem('cf_alive')){
      localStorage.removeItem('cf_user');
    }
  }catch(_){}

  function build(){
    var modal = document.getElementById('authModal');
    if(!modal || modal.dataset.aui) return;
    modal.dataset.aui = '1';
    modal.classList.add('aui');
    modal.innerHTML =
      '<div class="aui-card" role="dialog" aria-label="Sign In">' +
        '<div class="aui-head"><h2 class="aui-title">Sign In</h2>' +
        '<button type="button" class="aui-x" aria-label="Close" onclick="closeAuthModal()">&times;</button></div>' +
        '<input class="aui-in" id="loginEmail" type="text" inputmode="email" autocomplete="username" autocapitalize="none" placeholder="Email">' +
        '<input class="aui-in" id="loginPassword" type="password" autocomplete="current-password" placeholder="Password">' +
        '<div class="aui-row"><label class="aui-rem"><input type="checkbox" id="loginRemember" checked> Remember Me</label>' +
        '<button type="button" class="aui-lost" id="loginLost">Lost Password?</button></div>' +
        '<div class="aui-status" id="loginStatus"></div>' +
        '<button type="button" class="aui-btn red" id="loginBtn" onclick="doLogin()">Log in</button>' +
        '<a class="aui-btn grey" href="/account/?action=signup">Create New Account</a>' +
      '</div>';

    var pw = document.getElementById('loginPassword');
    pw.addEventListener('keydown', function(e){ if(e.key==='Enter') window.doLogin(); });

    document.getElementById('loginLost').addEventListener('click', function(){
      var st = document.getElementById('loginStatus');
      var email = document.getElementById('loginEmail').value.trim();
      st.className = 'aui-status';
      if(!/^\S+@\S+\.\S+$/.test(email)){ st.textContent = 'Enter your email above, then tap Lost Password?'; return; }
      st.textContent = 'Sending...';
      fetch('/api/auth', {method:'POST', headers:{'Content-Type':'application/json','X-Frontend-Access':'true','X-Verified':'true'},
        body: JSON.stringify({action:'reset', email: email})})
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(d.error) throw new Error(d.error);
          st.className = 'aui-status ok'; st.textContent = 'Password reset email sent. Check your inbox.';
        })
        .catch(function(e){
          var m = String(e.message||'');
          st.textContent = m.indexOf('EMAIL_NOT_FOUND')>-1 ? 'No account with this email' : (m || 'Could not send reset email');
        });
    });

    // Remember Me: remember the choice, then run the page's own login
    var orig = window.doLogin;
    if(typeof orig === 'function'){
      window.doLogin = function(){
        try{
          var chk = document.getElementById('loginRemember');
          localStorage.setItem('cf_remember', chk && !chk.checked ? '0' : '1');
          sessionStorage.setItem('cf_alive','1');
        }catch(_){}
        return orig.apply(this, arguments);
      };
    }
    // Old tabs are gone: registration lives on /account/?action=signup
    window.switchAuthTab = function(tab){ if(tab==='register') location.href = '/account/?action=signup'; };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
