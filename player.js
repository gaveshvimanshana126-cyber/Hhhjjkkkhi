// player.js - MovieManiaLK Interactive Video Player (v6: mobile-first redesign)
// Usage: new IntegratedPlayer(containerId, { _id, title, thumbnailUrl, subtitleUrl, players:[{name,url,type,quality}] })

(function () {
  /* ───────────────────────── Styles ───────────────────────── */
  if (!document.getElementById("mm-player-styles")) {
    const style = document.createElement("style");
    style.id = "mm-player-styles";
    style.textContent = `
    :root { --mm-accent:#E8262A; --mm-accent-d:#b91c1c; --mm-ink:#0d0b09; --mm-panel:rgba(22,19,16,.96); --mm-text:#f4efe9; --mm-dim:rgba(244,239,233,.62); --mm-line:rgba(255,255,255,.1); --mm-ease:cubic-bezier(.2,.7,.2,1); }

    /* ── Hero (poster + watch entry) — inline box that turns into the player ── */
    .mm-hero-wrap { position:relative; width:100%; margin:0; border-radius:0; overflow:hidden; background:#000; aspect-ratio:16/9; cursor:pointer; user-select:none; -webkit-tap-highlight-color:transparent; isolation:isolate; }
    .mm-hero-wrap:focus-visible { outline:2px solid var(--mm-accent); outline-offset:3px; }
    .mm-hero-thumb { width:100%; height:100%; object-fit:cover; display:block; transition:transform .6s var(--mm-ease), filter .4s ease; }
    .mm-hero-wrap:hover .mm-hero-thumb { transform:scale(1.025); filter:brightness(.92); }
    .mm-hero-shade { position:absolute; inset:0; background:linear-gradient(to bottom, rgba(0,0,0,.25) 0%, transparent 35%, rgba(0,0,0,.78) 100%); }
    .mm-hero-badge { position:absolute; top:12px; right:12px; display:flex; align-items:center; gap:6px; background:rgba(13,11,9,.6); border:1px solid var(--mm-line); border-radius:20px; padding:5px 11px; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); z-index:5; }
    .mm-hero-badge svg { width:13px; height:13px; fill:none; stroke:var(--mm-accent); stroke-width:2; }
    .mm-hero-badge span { font-size:10.5px; font-weight:800; color:rgba(255,255,255,.9); letter-spacing:.3px; font-family:'Manrope',sans-serif; }
    .mm-play-btn { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:68px; height:68px; border-radius:50%; background:rgba(232,38,42,.92); display:flex; align-items:center; justify-content:center; box-shadow:0 0 0 8px rgba(232,38,42,.18), 0 10px 34px rgba(232,38,42,.5); transition:transform .3s var(--mm-ease), background .25s; z-index:6; }
    .mm-hero-wrap:hover .mm-play-btn { transform:translate(-50%,-50%) scale(1.08); background:var(--mm-accent-d); }
    .mm-play-btn svg { width:28px; height:28px; fill:#fff; margin-left:4px; }
    .mm-hero-bottom { position:absolute; left:0; right:0; bottom:0; padding:14px 16px; z-index:5; display:flex; align-items:flex-end; justify-content:space-between; gap:12px; }
    .mm-hero-title { font-family:'Anton',sans-serif; font-size:clamp(16px,4.5vw,24px); color:#fff; text-shadow:0 2px 10px rgba(0,0,0,.8); line-height:1.2; min-width:0; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
    .mm-hero-cta { flex-shrink:0; display:inline-flex; align-items:center; gap:7px; background:var(--mm-accent); color:#fff; border-radius:50px; padding:9px 16px 9px 13px; font:800 12.5px 'Manrope',sans-serif; box-shadow:0 6px 20px rgba(232,38,42,.45); transition:background .2s, transform .2s var(--mm-ease); }
    .mm-hero-cta svg { width:14px; height:14px; fill:#fff; }
    .mm-hero-wrap:hover .mm-hero-cta { background:var(--mm-accent-d); transform:translateY(-1px); }

    /* ── Server picker ── */
    .mm-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.7); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); z-index:100000; display:flex; align-items:flex-end; justify-content:center; opacity:0; visibility:hidden; transition:opacity .25s ease, visibility 0s linear .25s; }
    .mm-modal-backdrop.open { opacity:1; visibility:visible; transition-delay:0s; }
    .mm-modal-sheet { background:#15120f; border:1px solid var(--mm-line); border-radius:24px 24px 0 0; width:100%; max-width:560px; padding:20px 18px calc(24px + env(safe-area-inset-bottom,0px)); box-shadow:0 -12px 50px rgba(0,0,0,.8); transform:translateY(24px); transition:transform .35s var(--mm-ease); color:var(--mm-text); font-family:'Manrope',sans-serif; max-height:86dvh; overflow:auto; }
    .mm-modal-backdrop.open .mm-modal-sheet { transform:none; }
    @media (min-width:600px) { .mm-modal-backdrop { align-items:center; } .mm-modal-sheet { border-radius:22px; padding-bottom:22px; transform:translateY(12px) scale(.97); } }
    .mm-modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; }
    .mm-modal-title { font-family:'Anton',sans-serif; font-size:20px; letter-spacing:.4px; color:#fff; }
    .mm-modal-sub { font-size:12px; color:var(--mm-dim); margin-top:3px; }
    .mm-modal-close { background:rgba(255,255,255,.08); border:none; border-radius:50%; width:34px; height:34px; display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; flex-shrink:0; transition:background .2s; }
    .mm-modal-close:hover { background:rgba(232,38,42,.35); }
    .mm-modal-close svg { width:16px; height:16px; }
    .mm-selector-list { display:flex; flex-direction:column; gap:8px; }
    .mm-player-opt { all:unset; box-sizing:border-box; background:rgba(255,255,255,.04); border:1px solid var(--mm-line); border-radius:14px; padding:11px 13px; display:flex; align-items:center; gap:12px; cursor:pointer; transition:background .2s, border-color .2s, transform .2s var(--mm-ease); -webkit-tap-highlight-color:transparent; }
    .mm-player-opt:hover { background:rgba(232,38,42,.1); border-color:rgba(232,38,42,.45); }
    .mm-player-opt:active { transform:scale(.985); }
    .mm-player-opt:focus-visible { outline:2px solid var(--mm-accent); outline-offset:2px; }
    .mm-player-opt.is-current { border-color:var(--mm-accent); background:rgba(232,38,42,.12); }
    .mm-opt-icon { width:38px; height:38px; border-radius:10px; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .mm-opt-info { flex:1; min-width:0; }
    .mm-opt-name { font-size:14px; font-weight:800; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .mm-opt-desc { font-size:11.5px; color:var(--mm-dim); margin-top:2px; }
    .mm-opt-badge { background:rgba(232,38,42,.18); color:#fca5a5; border:1px solid rgba(232,38,42,.35); font-size:11px; font-weight:800; padding:4px 10px; border-radius:8px; }
    .mm-opt-now { font-size:11px; font-weight:800; color:var(--mm-accent); }

    /* ── Player screen — INLINE: the same box becomes the player, no fullscreen takeover ── */
    .mm-player-screen { display:none; position:relative; width:100%; aspect-ratio:16/9; background:#000; z-index:2; overflow:hidden; user-select:none; -webkit-user-select:none; -webkit-tap-highlight-color:transparent; font-family:'Manrope',system-ui,sans-serif; color:var(--mm-text); overscroll-behavior:contain; }
    .mm-player-screen.active { display:block; animation:mmIn .3s var(--mm-ease); }
    .mm-player-screen:fullscreen { width:100vw; height:100vh; height:100dvh; aspect-ratio:auto; border-radius:0; }
    .mm-player-screen:-webkit-full-screen { width:100vw; height:100vh; aspect-ratio:auto; border-radius:0; }
    @keyframes mmIn { from { opacity:0; transform:scale(.985); } to { opacity:1; transform:none; } }
    .mm-player-screen button { font-family:inherit; -webkit-tap-highlight-color:transparent; }
    .mm-player-screen button:focus-visible, .mm-player-screen input:focus-visible { outline:2px solid var(--mm-accent); outline-offset:2px; }
    .mm-player-screen.hide-cursor { cursor:none; }

    .mm-player-media { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; background:#000; display:none; z-index:1; }
    .mm-player-iframe { position:absolute; inset:0; width:100%; height:100%; border:none; display:none; z-index:2; background:#000; }
    .mm-tap { position:absolute; inset:0; z-index:3; touch-action:manipulation; }
    .mm-player-screen.is-embed .mm-tap { display:none; }

    /* Subtitles */
    .mm-sub-overlay { position:absolute; left:0; right:0; bottom:calc(26px + env(safe-area-inset-bottom,0px)); text-align:center; pointer-events:none; z-index:4; padding:0 16px; transition:bottom .3s var(--mm-ease); }
    .mm-player-screen.ctl-on .mm-sub-overlay { bottom:calc(104px + env(safe-area-inset-bottom,0px)); }
    .mm-sub-box { display:inline-block; padding:6px 14px; border-radius:8px; line-height:1.45; max-width:min(86%,820px); word-wrap:break-word; font-weight:700; }
    .mm-sub-box.sz-sm { font-size:clamp(13px,2.4vw,16px); }
    .mm-sub-box.sz-md { font-size:clamp(16px,3.2vw,21px); }
    .mm-sub-box.sz-lg { font-size:clamp(19px,4.2vw,26px); }
    .mm-sub-box.sz-xl { font-size:clamp(23px,5.2vw,32px); }
    .mm-sub-box.clr-white { color:#fff; } .mm-sub-box.clr-yellow { color:#fde047; } .mm-sub-box.clr-cyan { color:#67e8f9; } .mm-sub-box.clr-green { color:#86efac; }
    .mm-sub-box.bg-dark { background:rgba(0,0,0,.88); }
    .mm-sub-box.bg-translucent { background:rgba(0,0,0,.5); }
    .mm-sub-box.bg-none { background:transparent; text-shadow:0 0 6px #000, 0 0 6px #000, 0 2px 8px #000; }

    /* Double-tap seek feedback */
    .mm-skip-feedback { position:absolute; top:50%; margin-top:-44px; width:88px; height:88px; border-radius:50%; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; z-index:5; pointer-events:none; opacity:0; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
    .mm-skip-feedback.left { left:9%; } .mm-skip-feedback.right { right:9%; }
    .mm-skip-feedback.go { animation:mmPing .65s var(--mm-ease); }
    @keyframes mmPing { 0% { opacity:0; transform:scale(.7); } 25% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1.15); } }

    /* Loader (small ring, no dark curtain) */
    .mm-spinner-screen { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:6; pointer-events:none; opacity:0; transition:opacity .2s ease; }
    .mm-spinner-screen.active { opacity:1; }
    .mm-spinner { width:54px; height:54px; border-radius:50%; border:3px solid rgba(255,255,255,.14); border-top-color:var(--mm-accent); animation:mmSpin .8s linear infinite; background:rgba(0,0,0,.35); }
    @keyframes mmSpin { to { transform:rotate(360deg); } }

    /* Ad Screen (ExoClick VAST) */
    .mm-ad-screen { position:absolute; inset:0; z-index:50; background:#000; display:none; flex-direction:column; justify-content:center; align-items:center; user-select:none; }
    .mm-ad-screen.active { display:flex; }
    .mm-ad-video { width:100%; height:100%; object-fit:contain; background:#000; cursor:pointer; }
    .mm-ad-badge { position:absolute; top:max(env(safe-area-inset-top,0px),16px); left:max(env(safe-area-inset-left,0px),16px); background:rgba(0,0,0,0.78); color:#fff; font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.18); pointer-events:none; z-index:60; font-family:'Manrope',sans-serif; backdrop-filter:blur(8px); }
    .mm-ad-skip { position:absolute; bottom:max(env(safe-area-inset-bottom,0px),24px); right:max(env(safe-area-inset-right,0px),16px); background:rgba(0,0,0,0.85); color:#fff; font-size:13px; font-weight:800; padding:10px 18px; border-radius:8px; border:1px solid rgba(255,255,255,0.3); cursor:pointer; z-index:60; font-family:'Manrope',sans-serif; transition:background .2s, border-color .2s; backdrop-filter:blur(8px); }
    .mm-ad-skip:hover { background:var(--mm-accent); border-color:var(--mm-accent); }
    .mm-ad-cta { position:absolute; bottom:max(env(safe-area-inset-bottom,0px),24px); left:max(env(safe-area-inset-left,0px),16px); background:var(--mm-accent); color:#fff; font-size:12px; font-weight:800; padding:10px 16px; border-radius:8px; border:none; cursor:pointer; z-index:60; display:flex; align-items:center; gap:6px; font-family:'Manrope',sans-serif; box-shadow:0 4px 14px rgba(232,38,42,0.5); }
    .mm-ad-cta:hover { background:var(--mm-accent-d); }

    /* Error + VLC panels */
    .mm-error-screen, .mm-vlc-screen { position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:24px; background:rgba(13,11,9,.94); z-index:8; }
    .mm-error-screen.active { display:flex; z-index:9; animation:mmIn .25s var(--mm-ease); }
    .mm-error-title, .mm-vlc-title { font-size:17px; font-weight:800; }
    .mm-error-msg, .mm-vlc-msg { font-size:13px; color:var(--mm-dim); margin-top:8px; max-width:360px; line-height:1.55; }
    .mm-error-actions { display:flex; gap:10px; margin-top:18px; flex-wrap:wrap; justify-content:center; }
    .mm-btn { background:var(--mm-accent); color:#fff; border:none; border-radius:50px; padding:10px 20px; font-size:13px; font-weight:800; cursor:pointer; transition:background .2s, transform .2s var(--mm-ease); }
    .mm-btn:hover { background:var(--mm-accent-d); } .mm-btn:active { transform:scale(.97); }
    .mm-btn.alt { background:rgba(255,255,255,.12); } .mm-btn.alt:hover { background:rgba(255,255,255,.2); }
    .mm-btn.vlc { background:#FF8800; box-shadow:0 6px 20px rgba(255,136,0,.35); margin-top:16px; }

    /* ── Controls layer ── */
    .mm-ctrl { position:absolute; inset:0; z-index:10; pointer-events:none; opacity:0; visibility:hidden; transition:opacity .25s ease, visibility 0s linear .25s; }
    .mm-player-screen.ctl-on .mm-ctrl, .mm-player-screen.is-embed .mm-ctrl { opacity:1; visibility:visible; transition-delay:0s; }
    .mm-scrim-top, .mm-scrim-bot { position:absolute; left:0; right:0; pointer-events:none; }
    .mm-scrim-top { top:0; height:150px; background:linear-gradient(to bottom, rgba(0,0,0,.78), transparent); }
    .mm-scrim-bot { bottom:0; height:210px; background:linear-gradient(to top, rgba(0,0,0,.85), transparent); }
    .mm-player-screen.is-embed .mm-scrim-top { height:90px; }
    .mm-player-screen.is-embed .mm-scrim-bot, .mm-player-screen.is-embed .mm-ctrl-mid, .mm-player-screen.is-embed .mm-ctrl-bot, .mm-player-screen.is-embed .mm-lock-btn, .mm-player-screen.is-embed .mm-set-layer { display:none; }

    .mm-ctrl-top { position:absolute; top:0; left:0; right:0; display:flex; align-items:center; gap:12px; padding:max(env(safe-area-inset-top,0px),12px) max(env(safe-area-inset-right,0px),16px) 0 max(env(safe-area-inset-left,0px),16px); }
    .mm-circle-btn { pointer-events:auto; width:42px; height:42px; border-radius:50%; flex-shrink:0; background:rgba(20,17,14,.55); border:1px solid var(--mm-line); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); transition:background .2s, transform .2s var(--mm-ease); }
    .mm-circle-btn:hover { background:rgba(232,38,42,.85); } .mm-circle-btn:active { transform:scale(.94); }
    .mm-circle-btn svg { width:22px; height:22px; stroke:currentColor; fill:none; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
    .mm-ctrl-title { flex:1; min-width:0; font-family:'Anton',sans-serif; font-size:clamp(15px,2.6vw,19px); letter-spacing:.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 2px 8px rgba(0,0,0,.7); }
    .mm-ctrl-switch { pointer-events:auto; display:inline-flex; align-items:center; gap:7px; height:40px; padding:0 15px 0 12px; border-radius:50px; background:rgba(20,17,14,.55); border:1px solid var(--mm-line); color:#fff; font-size:12.5px; font-weight:800; cursor:pointer; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); transition:background .2s; }
    .mm-ctrl-switch:hover { background:rgba(255,255,255,.16); }
    .mm-ctrl-switch svg { width:17px; height:17px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

    /* Centre cluster (touch) */
    .mm-ctrl-mid { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
    .mm-btn-play { pointer-events:auto; width:clamp(60px,8vw,82px); height:clamp(60px,8vw,82px); border-radius:50%; background:#f2f2f2; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 10px 34px rgba(0,0,0,.5); transition:transform .25s var(--mm-ease), background .2s, opacity .25s; color:#0a0a0a; }
    .mm-btn-play:hover { background:#fff; } .mm-btn-play:active { transform:scale(.93); }
    .mm-btn-play svg { width:42%; height:42%; fill:currentColor; stroke:none; transform:translateX(6%); }
    @media (hover:hover) and (pointer:fine) {
      .mm-player-screen.is-playing .mm-btn-play { opacity:0; pointer-events:none; transform:scale(.8); }
    }
    @media (max-height:460px) { .mm-btn-play { width:54px; height:54px; } }

    /* play/pause icon swap driven by one class */
    .mm-ico-pause { display:none; }
    .mm-player-screen.is-playing .mm-ico-play { display:none; }
    .mm-player-screen.is-playing .mm-ico-pause { display:block; }

    /* Bottom bar */
    .mm-ctrl-bot { position:absolute; left:0; right:0; bottom:0; padding:0 max(env(safe-area-inset-right,0px),16px) max(env(safe-area-inset-bottom,0px),10px) max(env(safe-area-inset-left,0px),16px); }
    .mm-seek { --p:0; --b:0; --h:0; position:relative; height:30px; display:flex; align-items:center; cursor:pointer; touch-action:none; pointer-events:auto; }
    .mm-seek-track { position:relative; width:100%; height:4px; border-radius:99px; background:rgba(255,255,255,.26); transition:height .15s var(--mm-ease); }
    .mm-seek:hover .mm-seek-track, .mm-seek.dragging .mm-seek-track { height:6px; }
    .mm-seek-buf, .mm-seek-fill { position:absolute; inset:0; border-radius:inherit; transform-origin:left center; will-change:transform; }
    .mm-seek-buf { background:rgba(255,255,255,.34); transform:scaleX(var(--b)); }
    .mm-seek-fill { background:var(--mm-accent); transform:scaleX(var(--p)); }
    .mm-seek-thumb { position:absolute; top:50%; left:calc(var(--p) * 100%); width:15px; height:15px; margin:-7.5px 0 0 -7.5px; border-radius:50%; background:var(--mm-accent); box-shadow:0 0 0 4px rgba(232,38,42,.22), 0 2px 8px rgba(0,0,0,.55); transform:scale(1); transition:transform .15s var(--mm-ease); will-change:left; }
    .mm-seek:hover .mm-seek-thumb, .mm-seek.dragging .mm-seek-thumb { transform:scale(1.18); }
    @media (pointer:coarse) { .mm-seek { height:34px; } .mm-seek-thumb { transform:scale(.95); } .mm-seek.dragging .mm-seek-thumb { transform:scale(1.3); } }
    .mm-bubble { position:absolute; bottom:30px; left:clamp(26px, calc(var(--h) * 100%), calc(100% - 26px)); transform:translateX(-50%); background:rgba(13,11,9,.95); color:#fff; border:1px solid var(--mm-line); padding:4px 9px; border-radius:7px; font-size:12px; font-weight:700; font-variant-numeric:tabular-nums; pointer-events:none; opacity:0; transition:opacity .12s; white-space:nowrap; }
    .mm-seek.show-bubble .mm-bubble { opacity:1; }

    .mm-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .mm-row-l, .mm-row-r { display:flex; align-items:center; gap:6px; pointer-events:auto; }
    .mm-ibtn { background:none; border:none; color:rgba(255,255,255,.92); cursor:pointer; min-width:40px; height:40px; padding:0 8px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background .15s, color .15s, transform .15s var(--mm-ease); font-size:13px; font-weight:800; }
    .mm-ibtn:hover { background:rgba(255,255,255,.12); color:#fff; } .mm-ibtn:active { transform:scale(.92); }
    .mm-ibtn svg { width:22px; height:22px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block; }
    .mm-ibtn svg .f { fill:currentColor; stroke:none; }

    /* ========== DEFINITIVE FIX: ONLY ONE ICON VISIBLE (mute + fs) ========== */
    /* Hide every possible state icon by default */
    .mm-ibtn svg.mm-ico-vol,
    .mm-ibtn svg.mm-ico-muted,
    .mm-ibtn svg.mm-ico-fs,
    .mm-ibtn svg.mm-ico-fs-exit {
      display: none !important;
    }

    /* MUTE BUTTON: show the speaker icon by default */
    .mm-ibtn svg.mm-ico-vol { display: block !important; }

    /* When the mute button has .is-muted, show the crossed-out icon instead */
    .mm-ibtn.is-muted svg.mm-ico-vol { display: none !important; }
    .mm-ibtn.is-muted svg.mm-ico-muted { display: block !important; }

    /* FULLSCREEN BUTTON: show the "enter fullscreen" arrows by default */
    .mm-ibtn svg.mm-ico-fs { display: block !important; }
    .mm-ibtn svg.mm-ico-fs-exit { display: none !important; }

    /* When the whole player screen is in fullscreen mode, show the "exit" arrows */
    .mm-player-screen.is-fs .mm-ibtn svg.mm-ico-fs { display: none !important; }
    .mm-player-screen.is-fs .mm-ibtn svg.mm-ico-fs-exit { display: block !important; }

    .mm-ibtn.is-on { color:var(--mm-accent); }
    .mm-ibtn.is-on:hover { color:#ff5a5e; }
    .mm-only-fine { display:none !important; }
    @media (hover:hover) and (pointer:fine) { .mm-only-fine { display:flex !important; } }

    .mm-time { font-size:13px; font-weight:700; font-variant-numeric:tabular-nums; color:rgba(255,255,255,.88); margin-left:6px; white-space:nowrap; }
    .mm-time .sep { opacity:.5; margin:0 3px; }

    /* Volume */
    .mm-vol-wrap { display:flex; align-items:center; }
    .mm-vol { -webkit-appearance:none; appearance:none; width:0; height:4px; border-radius:2px; margin:0; background:linear-gradient(to right, #fff var(--v,100%), rgba(255,255,255,.25) var(--v,100%)); opacity:0; transition:width .25s var(--mm-ease), opacity .2s, margin .25s; cursor:pointer; }
    .mm-vol-wrap:hover .mm-vol, .mm-vol:focus-visible, .mm-vol-wrap.touching .mm-vol { width:84px; opacity:1; margin:0 10px 0 4px; }
    .mm-vol::-webkit-slider-thumb { -webkit-appearance:none; width:13px; height:13px; border-radius:50%; background:#fff; border:none; }
    .mm-vol::-moz-range-thumb { width:13px; height:13px; border-radius:50%; background:#fff; border:none; }


    /* ═══════════════════════════════════════════════════════
       v6 PLAYER REDESIGN — mobile-first cinematic controls
       ═══════════════════════════════════════════════════════ */

    /* Centre: floating white play orb */
    .mm-ctrl-mid { gap:0; }
    .mm-btn-skip { display:none !important; }
    .mm-btn-play { width:clamp(72px,12vw,132px); height:clamp(72px,12vw,132px); background:#f5f5f5; color:#0a0a0a; box-shadow:0 0 0 12px rgba(255,255,255,.055), 0 20px 54px rgba(0,0,0,.5); }
    .mm-btn-play:hover { background:#fff; transform:scale(1.04); }
    .mm-btn-play:active { transform:scale(.95); }
    .mm-btn-play svg { width:36%; height:36%; transform:translateX(5%); }
    .mm-btn-play svg .f { fill:#0b0b0b; stroke:none; }
    .mm-player-screen.is-playing .mm-btn-play { opacity:0; pointer-events:none; transform:scale(.82); }

    /* Scrub bar: red dot on a light rail */
    .mm-ctrl-bot { padding:0 max(env(safe-area-inset-right,0px),18px) max(env(safe-area-inset-bottom,0px),12px) max(env(safe-area-inset-left,0px),18px); }
    .mm-seek { height:28px; }
    .mm-seek-track { height:5px; background:rgba(255,255,255,.3); }
    .mm-seek:hover .mm-seek-track, .mm-seek.dragging .mm-seek-track { height:6px; }
    .mm-seek-buf { background:rgba(255,255,255,.44); }
    .mm-seek-fill { background:#ff2a2a; box-shadow:0 0 14px rgba(255,42,42,.55); }
    .mm-seek-thumb { width:15px; height:15px; margin:-7.5px 0 0 -7.5px; background:#ff2a2a; box-shadow:0 0 0 4px rgba(255,42,42,.16), 0 2px 8px rgba(0,0,0,.55); transform:scale(1); }
    .mm-seek:hover .mm-seek-thumb, .mm-seek.dragging .mm-seek-thumb { transform:scale(1.25); }
    .mm-bubble { bottom:26px; border-radius:6px; background:#101010; }

    /* Bottom control row */
    .mm-row { gap:10px; }
    .mm-row-l, .mm-row-r { gap:6px; }
    .mm-ibtn { width:42px; height:42px; min-width:42px; padding:0; border-radius:50%; color:#fff; }
    .mm-ibtn svg { width:23px; height:23px; }
    .mm-time { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px; font-weight:700; letter-spacing:.4px; margin-left:6px; color:#fff; font-variant-numeric:tabular-nums; text-shadow:0 2px 6px rgba(0,0,0,.6); }
    .mm-time .sep { opacity:.55; margin:0 4px; }

    /* Amber settings button (the circled button in the reference) */
    .mm-feature-btn { pointer-events:auto; width:42px; height:42px; border-radius:50%; border:1px solid rgba(255,255,255,.12); background:rgba(16,14,12,.62); color:#ff9d1f; display:flex; align-items:center; justify-content:center; cursor:pointer; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); transition:background .2s, border-color .2s, transform .2s var(--mm-ease); }
    .mm-feature-btn:hover { background:rgba(255,157,31,.18); border-color:rgba(255,157,31,.42); }
    .mm-feature-btn:active { transform:scale(.92); }
    .mm-feature-btn[aria-disabled="true"] { opacity:.48; }
    .mm-feature-btn[aria-disabled="true"]:hover { background:rgba(16,14,12,.62); border-color:rgba(255,255,255,.12); }
    .mm-feature-btn svg { width:21px; height:21px; fill:none; stroke:none; }

    /* Top bar */
    .mm-ctrl-title { font-family:'Manrope',sans-serif; font-size:clamp(12.5px,2.4vw,16px); font-weight:800; color:rgba(255,255,255,.9); letter-spacing:.2px; }
    .mm-ctrl-switch { background:rgba(16,14,12,.55); }

    /* Lock control */
    .mm-lock-btn { position:absolute; left:max(env(safe-area-inset-left,0px),16px); top:50%; transform:translateY(-50%); z-index:14; width:50px; height:50px; border-radius:50%; border:1px solid rgba(255,255,255,.13); background:rgba(12,11,10,.6); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); opacity:0; visibility:hidden; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s, transform .2s var(--mm-ease), background .2s; }
    .mm-lock-btn span { display:flex; }
    .mm-lock-btn svg { width:21px; height:21px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .mm-player-screen.ctl-on .mm-lock-btn, .mm-player-screen.lock-reveal .mm-lock-btn { opacity:1; visibility:visible; pointer-events:auto; transition-delay:0s; }
    .mm-lock-btn:hover { background:rgba(255,255,255,.18); }
    .mm-player-screen.is-locked .mm-ctrl { opacity:0; visibility:hidden; transition-delay:0s; }
    .mm-player-screen.is-locked .mm-lock-btn { background:rgba(232,38,42,.2); border-color:rgba(232,38,42,.4); }
    .mm-lock-btn .lock-ico-unlock { display:none; }
    .mm-player-screen.is-locked .mm-lock-btn .lock-ico-lock { display:none; }
    .mm-player-screen.is-locked .mm-lock-btn .lock-ico-unlock { display:flex; }
    .mm-player-screen.is-embed .mm-lock-btn { display:none; }

    /* Subtitle position */
    .mm-player-screen .mm-sub-overlay.pos-mid { top:50%; bottom:auto; transform:translateY(-50%); }
    .mm-player-screen .mm-sub-overlay.pos-top { top:14%; bottom:auto; }
    .mm-player-screen .mm-sub-overlay.pos-bottom { bottom:calc(24px + env(safe-area-inset-bottom,0px)); }
    .mm-player-screen.ctl-on .mm-sub-overlay.pos-bottom { bottom:calc(108px + env(safe-area-inset-bottom,0px)); }

    /* Aspect ratio + flip */
    .mm-player-media.mm-ar-cover { object-fit:cover; }
    .mm-player-media.mm-ar-fill { object-fit:fill; }
    .mm-player-media.mm-ar-16-9, .mm-player-media.mm-ar-21-9 { inset:auto; left:0; top:50%; width:100%; height:auto; translate:0 -50%; object-fit:fill; }
    .mm-player-media.mm-ar-16-9 { aspect-ratio:16/9; }
    .mm-player-media.mm-ar-21-9 { aspect-ratio:21/9; }
    .mm-player-media.mm-ar-4-3 { inset:auto; left:50%; top:0; height:100%; width:auto; translate:-50% 0; aspect-ratio:4/3; object-fit:fill; }
    .mm-player-media.mm-flip-h { transform:scaleX(-1); }
    .mm-player-media.mm-flip-v { transform:scaleY(-1); }
    .mm-player-media.mm-flip-h.mm-flip-v { transform:scale(-1,-1); }

    /* In-player toast */
    .mm-toast { position:absolute; left:50%; bottom:calc(120px + env(safe-area-inset-bottom,0px)); transform:translate(-50%,8px); z-index:30; max-width:84%; padding:8px 14px; border-radius:999px; background:rgba(10,10,10,.9); border:1px solid rgba(255,255,255,.14); color:#fff; font:700 12px 'Manrope',sans-serif; text-align:center; opacity:0; pointer-events:none; transition:opacity .2s, transform .2s; backdrop-filter:blur(10px); }
    .mm-toast.show { opacity:1; transform:translate(-50%,0); }

    /* ═══ Player settings panel ═══ */
    .mm-set-layer { position:fixed; inset:0; z-index:70; display:flex; align-items:center; justify-content:center; padding:18px; opacity:0; visibility:hidden; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; font-family:'Manrope',system-ui,sans-serif; }
    .mm-set-layer.open { opacity:1; visibility:visible; pointer-events:auto; transition-delay:0s; }
    .mm-set-scrim { position:absolute; inset:0; background:rgba(0,0,0,.52); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); }
    .mm-set-panel { position:relative; width:min(438px,100%); max-height:min(86dvh,640px); display:flex; flex-direction:column; background:#0e0e0f; border:1px solid rgba(255,255,255,.13); border-radius:14px; box-shadow:0 30px 90px rgba(0,0,0,.85); color:#f5f5f5; transform:translateY(10px) scale(.985); transition:transform .24s var(--mm-ease); overflow:hidden; }
    .mm-set-panel:focus { outline:none; }
    .mm-set-layer.open .mm-set-panel { transform:none; }
    .mm-set-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px; border-bottom:1px solid rgba(255,255,255,.09); font-size:10.5px; font-weight:800; letter-spacing:2.1px; text-transform:uppercase; color:rgba(255,255,255,.66); }
    .mm-set-close { width:34px; height:34px; border-radius:50%; border:0; background:transparent; color:rgba(255,255,255,.8); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; transition:background .15s, color .15s; }
    .mm-set-close:hover { background:rgba(255,255,255,.1); color:#fff; }
    .mm-set-close svg { width:15px; height:15px; }
    .mm-set-list { overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.22) transparent; }
    .mm-set-list::-webkit-scrollbar { width:6px; }
    .mm-set-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,.22); border-radius:99px; }
    .mm-set-group { border-bottom:1px solid rgba(255,255,255,.065); }
    .mm-set-group:last-child { border-bottom:0; }
    .mm-set-row { all:unset; box-sizing:border-box; width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 18px; cursor:pointer; transition:background .15s; -webkit-tap-highlight-color:transparent; }
    .mm-set-row:hover { background:rgba(255,255,255,.045); }
    .mm-set-row:focus-visible { outline:2px solid var(--mm-accent); outline-offset:-2px; }
    .mm-set-main { display:flex; align-items:center; gap:12px; min-width:0; font-size:14px; font-weight:600; color:#fff; }
    .mm-set-ico { display:flex; width:20px; height:20px; flex-shrink:0; color:rgba(255,255,255,.84); }
    .mm-set-ico svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .mm-set-right { display:flex; align-items:center; gap:8px; flex-shrink:0; min-width:0; }
    .mm-set-value { display:inline-block; max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:5px 9px; border-radius:5px; background:#26272a; border:1px solid rgba(255,255,255,.1); color:rgba(255,255,255,.82); font-size:11.5px; font-weight:700; }
    .mm-set-chev { width:14px; height:14px; flex-shrink:0; fill:none; stroke:rgba(255,255,255,.66); stroke-width:2; stroke-linecap:round; stroke-linejoin:round; transition:transform .2s var(--mm-ease); }
    .mm-set-row[aria-expanded="true"] .mm-set-value { background:#26282b; border-color:rgba(255,255,255,.28); color:#fff; }
    .mm-set-row[aria-expanded="true"] .mm-set-chev { transform:rotate(90deg); }
    .mm-set-opts { display:grid; grid-template-columns:repeat(auto-fit,minmax(112px,1fr)); gap:6px; padding:9px 18px 13px; background:rgba(255,255,255,.028); }
    .mm-set-opts[hidden] { display:none; }
    .mm-set-opt { appearance:none; border:1px solid rgba(255,255,255,.1); background:#17181a; color:rgba(255,255,255,.78); border-radius:5px; padding:8px 10px; font:700 12px 'Manrope',system-ui,sans-serif; text-align:left; cursor:pointer; transition:background .15s, border-color .15s, color .15s; }
    .mm-set-opt:hover { background:#222427; color:#fff; }
    .mm-set-opt.on { background:rgba(232,38,42,.14); border-color:rgba(232,38,42,.62); color:#fff; }
    .mm-set-opt:focus-visible { outline:2px solid var(--mm-accent); outline-offset:2px; }
    .mm-player-screen.set-open { z-index:100001; }

    @media (max-width:640px) {
      .mm-only-fine { display:none !important; }
      .mm-ctrl-bot { padding:0 max(env(safe-area-inset-right,0px),10px) max(env(safe-area-inset-bottom,0px),8px) max(env(safe-area-inset-left,0px),10px); }
      .mm-row { gap:6px; }
      .mm-row-l, .mm-row-r { gap:2px; }
      .mm-ibtn { width:36px; height:36px; min-width:36px; }
      .mm-ibtn svg { width:20px; height:20px; }
      .mm-feature-btn { width:36px; height:36px; }
      .mm-feature-btn svg { width:19px; height:19px; }
      .mm-time { font-size:10.5px; letter-spacing:0; margin-left:2px; }
      .mm-time .sep { margin:0 2px; }
      .mm-seek { height:32px; }
      .mm-seek-thumb { transform:scale(.95); }
      .mm-player-screen .mm-sub-overlay.pos-bottom { bottom:18px; }
      .mm-player-screen.ctl-on .mm-sub-overlay.pos-bottom { bottom:calc(86px + env(safe-area-inset-bottom,0px)); }
      .mm-ctrl-top { gap:8px; padding-top:max(env(safe-area-inset-top,0px),8px); }
      .mm-ctrl-title { display:none; }
      .mm-ctrl-switch { display:none; }
      .mm-lock-btn { left:max(env(safe-area-inset-left,0px),10px); width:44px; height:44px; }
      .mm-lock-btn svg { width:20px; height:20px; }
      .mm-btn-play { width:clamp(66px,19vw,84px); height:clamp(66px,19vw,84px); box-shadow:0 0 0 9px rgba(255,255,255,.05), 0 14px 38px rgba(0,0,0,.45); }
      .mm-toast { bottom:calc(94px + env(safe-area-inset-bottom,0px)); font-size:11.5px; }
      .mm-set-layer { align-items:center; padding:12px; }
      .mm-set-panel { width:min(430px,100%); max-height:calc(100dvh - 24px); border-radius:14px; }
      .mm-set-head { padding:14px 16px; }
      .mm-set-row { padding:11px 16px; }
      .mm-set-main { font-size:13.5px; gap:10px; }
      .mm-set-ico, .mm-set-ico svg { width:18px; height:18px; }
      .mm-set-value { padding:5px 8px; font-size:11.5px; max-width:130px; }
      .mm-set-opts { padding:8px 16px 12px; grid-template-columns:repeat(2,minmax(0,1fr)); }
      .mm-set-close { width:32px; height:32px; }
    }
    @media (max-width:380px) {
      .mm-time { font-size:9.5px; margin-left:1px; }
      .mm-time .sep { margin:0 1px; }
      .mm-ibtn, .mm-feature-btn { width:32px; height:32px; min-width:32px; }
      .mm-ibtn svg { width:18px; height:18px; }
      .mm-feature-btn svg { width:17px; height:17px; }
      .mm-row-l, .mm-row-r { gap:0; }
      .mm-set-value { max-width:104px; font-size:11px; }
    }
    @media (max-height:430px) and (orientation:landscape) {
      .mm-btn-play { width:58px; height:58px; }
      .mm-lock-btn { width:38px; height:38px; }
      .mm-ctrl-bot { padding-bottom:6px; }
      .mm-seek { height:26px; }
      .mm-set-layer { align-items:center; padding:10px; }
      .mm-set-panel { max-height:calc(100dvh - 20px); border-radius:12px; }
    }

    @media (prefers-reduced-motion:reduce) { .mm-player-screen *, .mm-modal-backdrop, .mm-modal-sheet, .mm-hero-wrap * { transition-duration:.01ms !important; animation-duration:.01ms !important; } }
    `;
    document.head.appendChild(style);
  }

  /* ───────────────────────── Helpers ───────────────────────── */
  const I = {
    play: '<svg viewBox="0 0 24 24"><path class="f" d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12.3-7.4a1 1 0 0 0 0-1.72L8.5 3.74A1 1 0 0 0 7 4.6z"/></svg>',
    pause:
      '<svg viewBox="0 0 24 24"><rect class="f" x="6" y="4" width="4.2" height="16" rx="1.4"/><rect class="f" x="13.8" y="4" width="4.2" height="16" rx="1.4"/></svg>',
    back: '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    rew: '<svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><polyline points="3.5 3.8 3.5 8.6 8.3 8.6"/><text x="12" y="15.3" text-anchor="middle" font-size="7.4" font-weight="800" fill="currentColor" stroke="none" font-family="Manrope,sans-serif">10</text></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><polyline points="20.5 3.8 20.5 8.6 15.7 8.6"/><text x="12" y="15.3" text-anchor="middle" font-size="7.4" font-weight="800" fill="currentColor" stroke="none" font-family="Manrope,sans-serif">10</text></svg>',
    servers:
      '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6.5" rx="2"/><rect x="3" y="13.5" width="18" height="6.5" rx="2"/><line x1="7" y1="7.2" x2="7.01" y2="7.2"/><line x1="7" y1="16.8" x2="7.01" y2="16.8"/></svg>',
    vol: '<svg class="mm-ico-vol" viewBox="0 0 24 24"><polygon class="f" points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg><svg class="mm-ico-muted" viewBox="0 0 24 24"><polygon class="f" points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"/><line x1="16" y1="9.5" x2="22" y2="15.5"/><line x1="22" y1="9.5" x2="16" y2="15.5"/></svg>',
    cc: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3.2"/><path d="M10.4 10.2a2.2 2.2 0 1 0 0 3.6M16.6 10.2a2.2 2.2 0 1 0 0 3.6"/></svg>',
    fs: '<svg class="mm-ico-fs" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg><svg class="mm-ico-fs-exit" viewBox="0 0 24 24"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="4.5" y="10.5" width="15" height="10" rx="2.6"/><path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3"/></svg>',
    unlock: '<svg viewBox="0 0 24 24"><rect x="4.5" y="10.5" width="15" height="10" rx="2.6"/><path d="M8 10.5V7.2a4 4 0 0 1 7.4-2.1"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10.12 3V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09A1.7 1.7 0 0 0 20.96 10.12H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ff8c27" d="M12 1 23 21H1Z"></path><path fill="#fff" d="M12 6 18.5 18H5.5Z"></path><path fill="#ff8c27" d="M12 10 15 16H9Z"></path></svg>',
    setSpeed: '<svg viewBox="0 0 24 24"><path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 14l3.6-3.6"/><circle cx="12" cy="14" r="1.1"/></svg>',
    setAspect: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M8 9.5h8v5H8z"/></svg>',
    setFlip: '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M8.5 7 4.5 12l4 5"/><path d="M15.5 7l4 5-4 5"/></svg>',
    setSync: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><polyline points="12 7.5 12 12 15.5 14"/></svg>',
    setSize: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h11M4 17h7"/></svg>',
    setPos: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15.5h10"/></svg>',
  };

  function getIcon(name) {
    const n = (name || "").toLowerCase();
    if (n.includes("facebook") || n.includes("fb")) {
      return `<svg fill="#1877F2" viewBox="0 0 24 24" width="22" height="22"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
    } else if (n.includes("vlc")) {
      return `<svg fill="#FF8800" viewBox="0 0 24 24" width="22" height="22"><path d="M12 2L9 10h6L12 2zm-5.5 9l-2 7h15l-2-7h-11zm-3 8l-1 3h19l-1-3h-17z"/></svg>`;
    }
    return `<div style="width:24px;height:24px;background:#e8262a;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:13px;font-family:'Anton',sans-serif;">M</div>`;
  }

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatTime(s) {
    if (!s || isNaN(s) || !isFinite(s)) return "00:00";
    const t = Math.floor(s),
      h = Math.floor(t / 3600),
      m = Math.floor((t % 3600) / 60),
      sec = t % 60;
    const mm = String(m).padStart(2, "0"),
      ss = String(sec).padStart(2, "0");
    return h > 0 ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // hls.js loader (pinned version + CDN fallback)
  let hlsPromise = null;
  function ensureHls() {
    if (typeof Hls !== "undefined") return Promise.resolve(true);
    if (hlsPromise) return hlsPromise;
    const urls = [
      "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js",
    ];
    hlsPromise = (async () => {
      for (const u of urls) {
        try {
          await new Promise((res, rej) => {
            const sc = document.createElement("script");
            sc.src = u;
            sc.onload = res;
            sc.onerror = rej;
            document.head.appendChild(sc);
          });
          if (typeof Hls !== "undefined") return true;
        } catch (_) {}
      }
      hlsPromise = null;
      return false;
    })();
    return hlsPromise;
  }

  function parseSubtitleText(text) {
    if (!text) return [];
    const cues = [];
    const normalized = text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const parseTs = (ts) => {
      if (!ts) return 0;
      const parts = ts.trim().split(/\s+/)[0].replace(",", ".").split(":");
      let secs = 0;
      if (parts.length === 3)
        secs =
          parseFloat(parts[0]) * 3600 +
          parseFloat(parts[1]) * 60 +
          parseFloat(parts[2]);
      else if (parts.length === 2)
        secs = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      return isNaN(secs) ? 0 : secs;
    };
    for (const block of normalized.split(/\n\n+/)) {
      const lines = block.trim().split("\n");
      const ti = lines.findIndex((l) => l.includes("-->"));
      if (ti === -1) continue;
      const times = lines[ti].split("-->");
      if (times.length !== 2) continue;
      const start = parseTs(times[0]),
        end = parseTs(times[1]);
      const subText = lines
        .slice(ti + 1)
        .join("\n")
        .trim();
      if (subText && end > start) cues.push({ start, end, text: subText });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  /* ───────────────────────── Player ───────────────────────── */
  class IntegratedPlayer {
    constructor(containerId, mediaData) {
      IntegratedPlayer._reg = IntegratedPlayer._reg || {};
      if (IntegratedPlayer._reg[containerId])
        IntegratedPlayer._reg[containerId].destroy();
      IntegratedPlayer._reg[containerId] = this;

      this.containerId = containerId;
      this.abort = new AbortController();
      this.streamToken = 0;
      this.loadTimer = null;
      this.spinTimer = null;
      this.ctrlTimer = null;
      this.clickTimer = null;
      this.raf = null;
      this.netRetries = 0;
      this.mediaData = mediaData;
      this.container = document.getElementById(containerId);
      this.hls = null;
      this.activePlayerIdx = 0;
      this.subtitles = [];
      this._curCue = undefined;
      this.isScrubbing = false;
      this.scrubPct = 0;
      this.ctrlHover = false;
      this.lastTap = { time: 0 };
      this._lastTimeStr = "";
      this.prerollPlayed = false;
      this.postrollPlayed = false;
      this.adActive = false;
      this.locked = false;
      this.settingsOpen = false;
      this.lockTimer = null;
      this.toastTimer = null;

      this.viewSettings = { speed: 1, aspect: "default", flip: "normal" };
      try {
        const vs = localStorage.getItem("mm_view_settings");
        if (vs) Object.assign(this.viewSettings, JSON.parse(vs));
      } catch (_) {}

      this.subtitleSettings = {
        visible: true,
        fontSize: "sz-md",
        color: "clr-white",
        background: "bg-dark",
        sync: 0,
        pos: "bottom",
      };
      try {
        const saved = localStorage.getItem("mm_sub_settings");
        if (saved) Object.assign(this.subtitleSettings, JSON.parse(saved));
      } catch (_) {}

      this.init();
    }

    $(n) {
      return document.getElementById(`mm${n}_${this.uid}`);
    }

    init() {
      const md = this.mediaData;
      if (!this.container || !md || !md.players || !md.players.length) {
        if (this.container) this.container.innerHTML = "";
        return;
      }
      IntegratedPlayer._n = (IntegratedPlayer._n || 0) + 1;
      const uid =
        String(md._id || "media").replace(/[^a-zA-Z0-9_-]/g, "_") +
        "_" +
        IntegratedPlayer._n;
      this.uid = uid;
      const title = escHtml(md.title || "");
      const multi = md.players.length > 1;
      const featureLabel = multi
        ? "Change player"
        : "No other servers available";

      const speedLabel = (v) =>
        Number(v) === 1 ? "Normal (1x)" : `${v}x`;
      const syncOpts = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((v) => ({
        v,
        l: v === 0 ? "0 ms" : `${v > 0 ? "+" : ""}${Math.round(v * 1000)} ms`,
      }));
      const settingRow = (key, icon, label, value, opts) => {
        const oid = `mmSetOpts_${key}_${uid}`;
        return `<div class="mm-set-group">
          <button type="button" class="mm-set-row" data-set="${key}" aria-expanded="false" aria-controls="${oid}">
            <span class="mm-set-main"><span class="mm-set-ico" aria-hidden="true">${icon}</span><span>${label}</span></span>
            <span class="mm-set-right"><span class="mm-set-value" id="mmVal_${key}_${uid}">${value}</span><svg class="mm-set-chev" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg></span>
          </button>
          <div class="mm-set-opts" id="${oid}" hidden>
            ${opts
              .map(
                (o) =>
                  `<button type="button" class="mm-set-opt" data-set-key="${key}" data-val="${o.v}">${o.l}</button>`
              )
              .join("")}
          </div>
        </div>`;
      };

      this.container.innerHTML = `
        <div class="mm-hero-wrap" id="mmHero_${uid}" role="button" tabindex="0" aria-label="Watch ${title}">
          <img class="mm-hero-thumb" src="${escHtml(
            md.thumbnailUrl || ""
          )}" alt="${title}" decoding="async">
          <div class="mm-hero-shade"></div>
          <div class="mm-hero-badge">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="#E8262A" stroke="none"/></svg>
            <span>MovieMania.lk</span>
          </div>
          <div class="mm-play-btn"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
          <div class="mm-hero-bottom">
            <div class="mm-hero-title">${title}</div>
            <div class="mm-hero-cta"><svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>Watch now</div>
          </div>
        </div>

        <div class="mm-modal-backdrop" id="mmModal_${uid}" role="dialog" aria-modal="true" aria-label="Choose a server">
          <div class="mm-modal-sheet">
            <div class="mm-modal-header">
              <div>
                <div class="mm-modal-title">Choose a server</div>
                <div class="mm-modal-sub">If one is slow, switch to another at any time.</div>
              </div>
              <button class="mm-modal-close" id="mmModalClose_${uid}" aria-label="Close">${
        I.close
      }</button>
            </div>
            <div class="mm-selector-list">
              ${md.players
                .map(
                  (p, i) => `
                <button class="mm-player-opt" id="mmOpt_${i}_${uid}">
                  <div class="mm-opt-icon">${getIcon(p.name)}</div>
                  <div class="mm-opt-info">
                    <div class="mm-opt-name">${escHtml(
                      p.name || "Player"
                    )}</div>
                    <div class="mm-opt-desc">${
                      (p.name || "").toLowerCase().includes("vlc")
                        ? "Opens in the VLC app"
                        : "Plays here in the browser"
                    }</div>
                  </div>
                  <div class="mm-opt-now" id="mmNow_${i}_${uid}" hidden>Playing</div>
                  <div class="mm-opt-badge">${escHtml(p.quality || "HD")}</div>
                </button>`
                )
                .join("")}
            </div>
          </div>
        </div>

        <div class="mm-player-screen" id="mmScreen_${uid}">
          <video class="mm-player-media" id="mmVideo_${uid}" playsinline webkit-playsinline preload="metadata"></video>
          <iframe class="mm-player-iframe" id="mmIframe_${uid}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerpolicy="no-referrer"></iframe>
          <div class="mm-tap" id="mmTap_${uid}"></div>

          <div class="mm-sub-overlay pos-${this.subtitleSettings.pos || "bottom"}" id="mmSubOverlay_${uid}"><div class="mm-sub-box ${
            this.subtitleSettings.fontSize
          } ${this.subtitleSettings.color} ${
        this.subtitleSettings.background
      }" id="mmSubBox_${uid}" style="display:none"></div></div>

          <div class="mm-toast" id="mmToast_${uid}" role="status" aria-live="polite"></div>

          <div class="mm-skip-feedback left" id="mmSkipLeft_${uid}">−10s</div>
          <div class="mm-skip-feedback right" id="mmSkipRight_${uid}">+10s</div>
          <div class="mm-spinner-screen" id="mmSpinner_${uid}"><div class="mm-spinner"></div></div>

          <div class="mm-ad-screen" id="mmAdScreen_${uid}">
            <video class="mm-ad-video" id="mmAdVideo_${uid}" playsinline webkit-playsinline preload="auto"></video>
            <div class="mm-ad-badge" id="mmAdBadge_${uid}">Ad &middot; <span id="mmAdTime_${uid}"></span></div>
            <button class="mm-ad-skip" id="mmAdSkip_${uid}" style="display:none">Skip Ad &#x276F;</button>
            <button class="mm-ad-cta" id="mmAdCta_${uid}" style="display:none">Visit Advertiser <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></button>
          </div>

          <div class="mm-error-screen" id="mmErr_${uid}" role="alert">
            <div class="mm-error-title">Couldn't play this stream</div>
            <div class="mm-error-msg" id="mmErrMsg_${uid}"></div>
            <div class="mm-error-actions">
              <button class="mm-btn" id="mmErrRetry_${uid}">Retry</button>
              ${
                multi
                  ? `<button class="mm-btn alt" id="mmErrSwitch_${uid}">Switch server</button>`
                  : ""
              }
            </div>
          </div>

          <div class="mm-vlc-screen" id="mmVlc_${uid}">
            <div style="width:60px;height:60px;margin-bottom:14px;display:flex;align-items:center;justify-content:center;transform:scale(2.2)">${getIcon(
              "VLC"
            )}</div>
            <div class="mm-vlc-title">Opening VLC…</div>
            <div class="mm-vlc-msg">If VLC doesn't open, download the playlist and open it in VLC. The Sinhala subtitles are included.</div>
            <button class="mm-btn vlc" id="mmVlcDl_${uid}">Download playlist (.m3u)</button>
          </div>

          <div class="mm-ctrl" id="mmCtrl_${uid}">
            <div class="mm-scrim-top"></div><div class="mm-scrim-bot"></div>

            <div class="mm-ctrl-top" id="mmTop_${uid}">
              <button class="mm-circle-btn" id="mmBack_${uid}" aria-label="Close player">${
        I.back
      }</button>
              <div class="mm-ctrl-title">${title}</div>
              ${
                multi
                  ? `<button class="mm-ctrl-switch" id="mmSwitch_${uid}">${I.servers}<span>Servers</span></button>`
                  : ""
              }
            </div>

            <div class="mm-ctrl-mid">
              <button class="mm-btn-skip" id="mmSkipBack_${uid}" aria-label="Back 10 seconds">${
        I.rew
      }</button>
              <button class="mm-btn-play" id="mmBigPlay_${uid}" aria-label="Play or pause"><span class="mm-ico-play">${
        I.play
      }</span><span class="mm-ico-pause">${I.pause}</span></button>
              <button class="mm-btn-skip" id="mmSkipFwd_${uid}" aria-label="Forward 10 seconds">${
        I.fwd
      }</button>
            </div>

            <div class="mm-ctrl-bot" id="mmBot_${uid}">
              <div class="mm-seek" id="mmSeek_${uid}" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div class="mm-seek-track"><div class="mm-seek-buf"></div><div class="mm-seek-fill"></div></div>
                <div class="mm-seek-thumb"></div>
                <div class="mm-bubble" id="mmBubble_${uid}">00:00</div>
              </div>
              <div class="mm-row">
                <div class="mm-row-l">
                  <button class="mm-ibtn" id="mmBotPlay_${uid}" aria-label="Play or pause"><span class="mm-ico-play">${
        I.play
      }</span><span class="mm-ico-pause">${I.pause}</span></button>
                  <button class="mm-ibtn mm-only-fine" id="mmRew_${uid}" aria-label="Back 10 seconds">${
        I.rew
      }</button>
                  <button class="mm-ibtn mm-only-fine" id="mmFwd_${uid}" aria-label="Forward 10 seconds">${
        I.fwd
      }</button>
                  <div class="mm-vol-wrap" id="mmVolWrap_${uid}">
                    <button class="mm-ibtn" id="mmMute_${uid}" aria-label="Mute">${
        I.vol
      }</button>
                    <input class="mm-vol mm-only-fine" id="mmVol_${uid}" type="range" min="0" max="1" step="0.02" value="1" aria-label="Volume">
                  </div>
                  <span class="mm-time" id="mmTime_${uid}">00:00<span class="sep">/</span>00:00</span>
                </div>
                <div class="mm-row-r">
                  <button class="mm-feature-btn" id="mmFeatureBtn_${uid}" aria-label="${featureLabel}" title="${featureLabel}"${
                    multi ? "" : ' aria-disabled="true"'
                  }>${
        I.warn
      }</button>
                  <button class="mm-ibtn" id="mmSetBtn_${uid}" aria-label="Player settings" title="Player settings" aria-haspopup="dialog" aria-expanded="false">${I.gear}</button>
                  <button class="mm-ibtn" id="mmFs_${uid}" aria-label="Fullscreen">${
        I.fs
      }</button>
                </div>
              </div>
            </div>

          </div>

          <button class="mm-lock-btn" id="mmLock_${uid}" aria-label="Lock player controls" aria-pressed="false" title="Lock controls">
            <span class="lock-ico-lock">${I.lock}</span><span class="lock-ico-unlock">${I.unlock}</span>
          </button>

          <div class="mm-set-layer" id="mmSetLayer_${uid}" aria-hidden="true">
            <div class="mm-set-scrim" id="mmSetScrim_${uid}"></div>
            <div class="mm-set-panel" id="mmSetPanel_${uid}" role="dialog" aria-modal="true" aria-labelledby="mmSetTitle_${uid}" tabindex="-1">
              <div class="mm-set-head" id="mmSetTitle_${uid}">
                <span>Player Settings</span>
                <button type="button" class="mm-set-close" id="mmSetClose_${uid}" aria-label="Close player settings">${I.close}</button>
              </div>
              <div class="mm-set-list">
                ${settingRow(
                  "speed",
                  I.setSpeed,
                  "Play Speed",
                  speedLabel(this.viewSettings.speed),
                  [
                    { v: 0.5, l: "0.5x" },
                    { v: 0.75, l: "0.75x" },
                    { v: 1, l: "Normal (1x)" },
                    { v: 1.25, l: "1.25x" },
                    { v: 1.5, l: "1.5x" },
                    { v: 1.75, l: "1.75x" },
                    { v: 2, l: "2x" },
                  ]
                )}
                ${settingRow(
                  "aspect",
                  I.setAspect,
                  "Aspect Ratio",
                  {
                    default: "Default",
                    "16-9": "16:9",
                    "4-3": "4:3",
                    "21-9": "21:9",
                    cover: "Fill",
                    fill: "Stretch",
                  }[this.viewSettings.aspect] || "Default",
                  [
                    { v: "default", l: "Default" },
                    { v: "16-9", l: "16:9" },
                    { v: "4-3", l: "4:3" },
                    { v: "21-9", l: "21:9" },
                    { v: "cover", l: "Fill" },
                    { v: "fill", l: "Stretch" },
                  ]
                )}
                ${settingRow(
                  "flip",
                  I.setFlip,
                  "Video Flip",
                  { normal: "Normal", h: "Horizontal", v: "Vertical", both: "Both" }[
                    this.viewSettings.flip
                  ] || "Normal",
                  [
                    { v: "normal", l: "Normal" },
                    { v: "h", l: "Horizontal" },
                    { v: "v", l: "Vertical" },
                    { v: "both", l: "Both" },
                  ]
                )}
                ${settingRow(
                  "subtitle",
                  I.cc,
                  "Subtitle",
                  this.subtitleSettings.visible ? "Sinhala" : "Off",
                  [
                    { v: "on", l: "Sinhala" },
                    { v: "off", l: "Off" },
                  ]
                )}
                ${settingRow(
                  "subsync",
                  I.setSync,
                  "Sub Sync (Delay)",
                  `${Math.round((this.subtitleSettings.sync || 0) * 1000) === 0 ? "0" : (this.subtitleSettings.sync > 0 ? "+" : "") + Math.round(this.subtitleSettings.sync * 1000)} ms`,
                  syncOpts
                )}
                ${settingRow(
                  "subsize",
                  I.setSize,
                  "Sub Size",
                  { "sz-sm": "Small", "sz-md": "Medium", "sz-lg": "Large", "sz-xl": "Extra large" }[
                    this.subtitleSettings.fontSize
                  ] || "Medium",
                  [
                    { v: "sz-sm", l: "Small" },
                    { v: "sz-md", l: "Medium" },
                    { v: "sz-lg", l: "Large" },
                    { v: "sz-xl", l: "Extra large" },
                  ]
                )}
                ${settingRow(
                  "subpos",
                  I.setPos,
                  "Sub Pos",
                  { bottom: "Bottom", mid: "Middle", top: "Top" }[
                    this.subtitleSettings.pos
                  ] || "Bottom",
                  [
                    { v: "bottom", l: "Bottom" },
                    { v: "mid", l: "Middle" },
                    { v: "top", l: "Top" },
                  ]
                )}
              </div>
            </div>
          </div>
        </div>
      `;
      this.bindEvents();
      this.applyViewSettings();
      this.applySubtitleSettings();
      this.updateSettingsUI();
    }

    /* ── small state helpers ── */
    get screen() {
      return this.$("Screen");
    }
    get video() {
      return this.$("Video");
    }

    // Watch counter: fires once per player instance when playback actually
    // starts. The host page provides window.mmCountWatch(mediaId).
    countWatch() {
      if (this._watchCounted) return;
      this._watchCounted = true;
      try {
        if (typeof window.mmCountWatch === "function")
          window.mmCountWatch(this.mediaData && this.mediaData._id);
      } catch (_) {}
    }

    showSpinner() {
      clearTimeout(this.spinTimer);
      // delay so quick buffering never flashes a loader
      this.spinTimer = setTimeout(() => {
        const s = this.$("Spinner");
        if (s) s.classList.add("active");
      }, 250);
    }
    hideSpinner() {
      clearTimeout(this.spinTimer);
      const s = this.$("Spinner");
      if (s) s.classList.remove("active");
    }
    clearLoadTimer() {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
    showError(msg) {
      this.hideSpinner();
      this.clearLoadTimer();
      const el = this.$("Err"),
        m = this.$("ErrMsg");
      if (m) m.textContent = msg || "";
      if (el) el.classList.add("active");
      const sc = this.screen;
      if (sc) sc.classList.add("ctl-on");
    }
    hideError() {
      const el = this.$("Err");
      if (el) el.classList.remove("active");
    }

    popOpen() {
      return !!this.settingsOpen;
    }
    closePops() {
      this.closeSettings(false);
    }
    isEmbed() {
      const s = this.screen;
      return !!(s && s.classList.contains("is-embed"));
    }

    /* ── player settings sheet ── */
    closeAllSettingOpts() {
      const sc = this.screen;
      if (!sc) return;
      sc.querySelectorAll(".mm-set-opts").forEach((o) => (o.hidden = true));
      sc.querySelectorAll(".mm-set-row").forEach((r) =>
        r.setAttribute("aria-expanded", "false")
      );
    }
    openSettings() {
      const sc = this.screen;
      if (!sc) return;
      this.settingsOpen = true;
      this.closeAllSettingOpts();
      clearTimeout(this.ctrlTimer);
      sc.classList.add("ctl-on");
      sc.classList.add("set-open");
      const layer = this.$("SetLayer");
      if (layer) {
        layer.classList.add("open");
        layer.setAttribute("aria-hidden", "false");
      }
      const gear = this.$("SetBtn");
      if (gear) gear.setAttribute("aria-expanded", "true");
      setTimeout(() => {
        const c = this.$("SetPanel");
        if (c) c.focus({ preventScroll: true });
      }, 60);
    }
    closeSettings(restoreFocus = true) {
      const sc = this.screen;
      if (!sc) return;
      this.settingsOpen = false;
      const layer = this.$("SetLayer");
      if (layer) {
        layer.classList.remove("open");
        layer.setAttribute("aria-hidden", "true");
      }
      sc.classList.remove("set-open");
      this.closeAllSettingOpts();
      const gear = this.$("SetBtn");
      if (gear) gear.setAttribute("aria-expanded", "false");
      if (restoreFocus && sc.classList.contains("active")) {
        const b = this.$("SetBtn");
        if (b) b.focus({ preventScroll: true });
      }
      this.armHide();
    }
    toggleSettings() {
      if (this.settingsOpen) this.closeSettings();
      else this.openSettings();
    }
    showToast(msg) {
      const t = this.$("Toast");
      if (!t) return;
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
    }
    setSettingValue(key, text) {
      const el = this.$(`Val_${key}`);
      if (el) el.textContent = text;
    }
    persistViewSettings() {
      try {
        localStorage.setItem(
          "mm_view_settings",
          JSON.stringify(this.viewSettings)
        );
      } catch (_) {}
    }
    applyViewSettings() {
      const v = this.video;
      if (!v) return;
      v.playbackRate = this.viewSettings.speed || 1;
      const aspect = this.viewSettings.aspect || "default";
      ["mm-ar-cover", "mm-ar-fill", "mm-ar-16-9", "mm-ar-4-3", "mm-ar-21-9"].forEach(
        (c) => v.classList.toggle(c, c === `mm-ar-${aspect}`)
      );
      v.classList.toggle(
        "mm-flip-h",
        this.viewSettings.flip === "h" || this.viewSettings.flip === "both"
      );
      v.classList.toggle(
        "mm-flip-v",
        this.viewSettings.flip === "v" || this.viewSettings.flip === "both"
      );
    }
    updateSettingsUI() {
      if (!this.uid) return;
      const s = this.subtitleSettings;
      const ms = Math.round((+s.sync || 0) * 1000);
      this.setSettingValue(
        "speed",
        Number(this.viewSettings.speed) === 1
          ? "Normal (1x)"
          : `${this.viewSettings.speed}x`
      );
      this.setSettingValue(
        "aspect",
        {
          default: "Default",
          "16-9": "16:9",
          "4-3": "4:3",
          "21-9": "21:9",
          cover: "Fill",
          fill: "Stretch",
        }[this.viewSettings.aspect] || "Default"
      );
      this.setSettingValue(
        "flip",
        { normal: "Normal", h: "Horizontal", v: "Vertical", both: "Both" }[
          this.viewSettings.flip
        ] || "Normal"
      );
      this.setSettingValue(
        "subtitle",
        !s.visible
          ? "Off"
          : this.activeSubUrl || this.subtitles.length
          ? "Sinhala"
          : "None"
      );
      this.setSettingValue(
        "subsync",
        ms === 0 ? "0 ms" : `${ms > 0 ? "+" : ""}${ms} ms`
      );
      this.setSettingValue(
        "subsize",
        {
          "sz-sm": "Small",
          "sz-md": "Medium",
          "sz-lg": "Large",
          "sz-xl": "Extra large",
        }[s.fontSize] || "Medium"
      );
      this.setSettingValue(
        "subpos",
        { bottom: "Bottom", mid: "Middle", top: "Top" }[s.pos] || "Bottom"
      );
      this.syncSettingOptions();
    }
    syncSettingOptions() {
      const sc = this.screen;
      if (!sc) return;
      const s = this.subtitleSettings;
      const state = {
        speed: String(this.viewSettings.speed),
        aspect: this.viewSettings.aspect,
        flip: this.viewSettings.flip,
        subtitle:
          s.visible && (this.activeSubUrl || this.subtitles.length)
            ? "on"
            : "off",
        subsync: String(+s.sync || 0),
        subsize: s.fontSize,
        subpos: s.pos,
      };
      sc.querySelectorAll(".mm-set-opt").forEach((b) => {
        b.classList.toggle(
          "on",
          String(b.dataset.val) === String(state[b.dataset.setKey])
        );
      });
    }
    applySetting(key, val) {
      const v = this.video;
      if (key === "speed") {
        const spd = parseFloat(val) || 1;
        this.viewSettings.speed = spd;
        if (v) v.playbackRate = spd;
        this.persistViewSettings();
      } else if (key === "aspect") {
        this.viewSettings.aspect = val;
        this.applyViewSettings();
        this.persistViewSettings();
      } else if (key === "flip") {
        this.viewSettings.flip = val;
        this.applyViewSettings();
        this.persistViewSettings();
      } else if (key === "subtitle") {
        if (val === "on" && !this.activeSubUrl && !this.subtitles.length) {
          this.subtitleSettings.visible = false;
          this.showToast("No subtitles for this server");
        } else {
          this.subtitleSettings.visible = val === "on";
        }
        this.applySubtitleSettings();
      } else if (key === "subsync") {
        this.subtitleSettings.sync = parseFloat(val) || 0;
        this.applySubtitleSettings();
      } else if (key === "subsize") {
        this.subtitleSettings.fontSize = val;
        this.applySubtitleSettings();
      } else if (key === "subpos") {
        this.subtitleSettings.pos = val;
        this.applySubtitleSettings();
      }
      this.updateSettingsUI();
    }
    revealLock() {
      const sc = this.screen;
      if (!sc) return;
      sc.classList.add("lock-reveal");
      clearTimeout(this.lockTimer);
      this.lockTimer = setTimeout(
        () => sc.classList.remove("lock-reveal"),
        2400
      );
    }
    toggleLock() {
      const sc = this.screen;
      if (!sc) return;
      this.locked = !this.locked;
      this.closeSettings(false);
      sc.classList.toggle("is-locked", this.locked);
      const btn = this.$("Lock");
      if (btn) {
        btn.setAttribute("aria-pressed", this.locked ? "true" : "false");
        btn.setAttribute(
          "aria-label",
          this.locked ? "Unlock player controls" : "Lock player controls"
        );
      }
      if (this.locked) {
        clearTimeout(this.ctrlTimer);
        sc.classList.remove("ctl-on", "hide-cursor");
        this.revealLock();
        this.showToast("Controls locked");
      } else {
        sc.classList.remove("lock-reveal");
        clearTimeout(this.lockTimer);
        this.showCtrl();
      }
    }

    canAutoHide() {
      const v = this.video;
      return (
        v &&
        !v.paused &&
        !v.ended &&
        !this.isScrubbing &&
        !this.ctrlHover &&
        !this.popOpen() &&
        !this.isEmbed()
      );
    }
    showCtrl() {
      const sc = this.screen;
      if (!sc) return;
      if (this.locked) {
        this.revealLock();
        return;
      }
      sc.classList.add("ctl-on");
      sc.classList.remove("hide-cursor");
      this.armHide();
    }
    armHide() {
      clearTimeout(this.ctrlTimer);
      if (!this.canAutoHide()) return;
      this.ctrlTimer = setTimeout(() => {
        if (!this.canAutoHide()) return;
        const sc = this.screen;
        if (!sc) return;
        sc.classList.remove("ctl-on");
        sc.classList.add("hide-cursor");
      }, 3000);
    }
    hideCtrlNow() {
      const sc = this.screen;
      if (!sc) return;
      if (this.canAutoHide()) sc.classList.remove("ctl-on");
    }

    /* ── subtitles ── */
    async fetchAndParseSubtitles(url) {
      this.subtitles = [];
      this._curCue = undefined;
      if (!url) return;
      const token = this.streamToken;
      try {
        const res = await fetch(url, { referrerPolicy: "no-referrer" });
        if (res.ok) {
          const text = await res.text();
          if (token === this.streamToken)
            this.subtitles = parseSubtitleText(text);
        }
      } catch (err) {
        console.warn("Subtitle fetch warning:", err);
      }
    }

    findCue(t) {
      const a = this.subtitles;
      let lo = 0,
        hi = a.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1,
          c = a[mid];
        if (t < c.start - 0.05) hi = mid - 1;
        else if (t > c.end + 0.05) lo = mid + 1;
        else return c;
      }
      return null;
    }

    updateSubtitles(force) {
      const box = this.$("SubBox"),
        v = this.video;
      if (!box || !v) return;
      const shifted = Math.max(
        0,
        (v.currentTime || 0) - (+this.subtitleSettings.sync || 0)
      );
      const cue =
        this.subtitleSettings.visible && this.subtitles.length
          ? this.findCue(shifted)
          : null;
      if (!force && cue === this._curCue) return;
      this._curCue = cue;
      if (!cue) {
        box.style.display = "none";
        return;
      }
      const cleaned = cue.text
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/?[^>]+(>|$)/g, "")
        .replace(/\{\\[^}]*\}/g, "")
        .trim();
      box.innerHTML = escHtml(cleaned).replace(/\n/g, "<br>");
      box.style.display = "inline-block";
    }

    applySubtitleSettings() {
      const box = this.$("SubBox"),
        overlay = this.$("SubOverlay");
      const s = this.subtitleSettings;
      if (box)
        box.className = `mm-sub-box ${s.fontSize} ${s.color} ${s.background}`;
      if (overlay)
        overlay.className = `mm-sub-overlay pos-${s.pos || "bottom"}`;
      try {
        localStorage.setItem("mm_sub_settings", JSON.stringify(s));
      } catch (_) {}
      this.updateSubtitles(true);
      this.updateSettingsUI();
    }

    skipFeedback(side) {
      const el = this.$(side === "left" ? "SkipLeft" : "SkipRight");
      if (!el) return;
      el.classList.remove("go");
      void el.offsetWidth;
      el.classList.add("go");
    }

    /* ── progress (rAF-driven, GPU transforms) ── */
    renderProgress() {
      const v = this.video,
        seek = this.$("Seek"),
        timeEl = this.$("Time");
      if (!v || !seek) return;
      const dur = v.duration || 0,
        cur = v.currentTime || 0;
      const shown = this.isScrubbing ? this.scrubPct * dur : cur;
      const p = dur ? Math.min(1, Math.max(0, shown / dur)) : 0;
      seek.style.setProperty("--p", p);
      let b = 0;
      if (dur && v.buffered && v.buffered.length) {
        for (let i = 0; i < v.buffered.length; i++) {
          if (
            cur >= v.buffered.start(i) - 0.3 &&
            cur <= v.buffered.end(i) + 0.3
          ) {
            b = v.buffered.end(i) / dur;
            break;
          }
        }
        if (!b) b = v.buffered.end(v.buffered.length - 1) / dur;
      }
      seek.style.setProperty("--b", Math.min(1, b));
      const str = `${formatTime(shown)}|${formatTime(dur)}`;
      if (str !== this._lastTimeStr && timeEl) {
        this._lastTimeStr = str;
        timeEl.innerHTML = `${formatTime(
          shown
        )}<span class="sep">/</span>${formatTime(dur)}`;
        seek.setAttribute("aria-valuenow", Math.round(p * 100));
      }
      if (!this.isScrubbing) this.updateSubtitles();
    }
    startTick() {
      if (this.raf) return;
      const tick = () => {
        this.raf = null;
        const sc = this.screen,
          v = this.video;
        if (!sc || !v || !sc.isConnected) {
          this.destroy();
          return;
        }
        this.renderProgress();
        if (!v.paused && !v.ended && sc.classList.contains("active"))
          this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    /* ── events ── */
    bindEvents() {
      const uid = this.uid,
        $ = (n) => this.$(n);
      const hero = $("Hero"),
        modal = $("Modal"),
        screen = $("Screen"),
        video = $("Video");
      const seek = $("Seek"),
        bubble = $("Bubble"),
        tap = $("Tap");
      const bigPlay = $("BigPlay"),
        botPlay = $("BotPlay"),
        muteBtn = $("Mute"),
        vol = $("Vol"),
        volWrap = $("VolWrap");
      const fsBtn = $("Fs"),
        setBtn = $("SetBtn"),
        featureBtn = $("FeatureBtn"),
        lockBtn = $("Lock"),
        setLayer = $("SetLayer");
      const sig = { signal: this.abort.signal };
      const players = this.mediaData.players;

      /* hero + server picker */
      const openModal = () => {
        modal.classList.add("open");
        const cur = $(`Opt_${this.activePlayerIdx}`) || $("Opt_0");
        setTimeout(() => cur && cur.focus({ preventScroll: true }), 50);
      };
      const closeModal = () => modal.classList.remove("open");
      const openHero = () => {
        players.length === 1 ? this.startPlayer(0) : openModal();
      };
      hero.onclick = openHero;
      hero.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openHero();
        }
      };
      $("ModalClose").onclick = closeModal;
      modal.onclick = (e) => {
        if (e.target === modal) closeModal();
      };
      players.forEach((p, i) => {
        const o = $(`Opt_${i}`);
        if (o)
          o.onclick = () => {
            closeModal();
            this.startPlayer(i);
          };
      });
      const sw = $("Switch");
      if (sw) sw.onclick = openModal;
      const es = $("ErrSwitch");
      if (es) es.onclick = openModal;
      $("ErrRetry").onclick = () => this.startPlayer(this.activePlayerIdx);
      $("Back").onclick = () => this.closeScreen();

      /* settings sheet, lock, player switch */
      if (setBtn) setBtn.onclick = () => this.toggleSettings();
      if (lockBtn)
        lockBtn.onclick = (e) => {
          e.stopPropagation();
          this.toggleLock();
        };
      if (featureBtn)
        featureBtn.onclick = () => {
          if (players.length > 1) {
            this.closeSettings(false);
            openModal();
          } else {
            this.showToast("No other servers available");
          }
          this.showCtrl();
        };
      const setClose = $("SetClose");
      if (setClose) setClose.onclick = () => this.closeSettings();
      const setScrim = $("SetScrim");
      if (setScrim) setScrim.onclick = () => this.closeSettings();
      if (setLayer) {
        setLayer.querySelectorAll(".mm-set-row").forEach((row) => {
          row.onclick = () => {
            const opts = $(`SetOpts_${row.dataset.set}`);
            if (!opts) return;
            const willOpen = opts.hidden;
            this.closeAllSettingOpts();
            if (willOpen) {
              opts.hidden = false;
              row.setAttribute("aria-expanded", "true");
            }
          };
        });
        setLayer.querySelectorAll(".mm-set-opt").forEach((opt) => {
          opt.onclick = (e) => {
            e.stopPropagation();
            this.applySetting(opt.dataset.setKey, opt.dataset.val);
            this.closeAllSettingOpts();
          };
        });
        setLayer.addEventListener("keydown", (e) => {
          if (e.key !== "Tab") return;
          const items = Array.from(
            setLayer.querySelectorAll(
              'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null);
          if (!items.length) return;
          const first = items[0],
            last = items[items.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === setLayer)
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        });
      }

      /* play / pause */
      const togglePlay = () => {
        if (!video.getAttribute("src") && !video.srcObject) return;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      };
      bigPlay.onclick = () => {
        togglePlay();
        this.showCtrl();
      };
      botPlay.onclick = () => {
        togglePlay();
        this.showCtrl();
      };

      video.onplay = () => {
        screen.classList.add("is-playing");
        this.startTick();
        this.armHide();
      };
      video.onpause = () => {
        screen.classList.remove("is-playing");
        this.renderProgress();
        this.showCtrl();
      };
      video.onended = () => {
        screen.classList.remove("is-playing");
        this.showCtrl();
        if (!this.postrollPlayed) {
          this.postrollPlayed = true;
          this.playVastAd("postroll");
        }
      };
      video.onwaiting = () => this.showSpinner();
      video.onseeking = () => {
        if (!video.paused) this.showSpinner();
        this.renderProgress();
      };
      video.onseeked = () => {
        this.hideSpinner();
        this.renderProgress();
      };
      video.oncanplay = () => {
        this.hideSpinner();
      };
      video.onplaying = () => {
        this.hideSpinner();
        this.clearLoadTimer();
        this.hideError();
        this.netRetries = 0;
        screen.classList.add("is-playing");
        this.countWatch();
        this.startTick();
      };
      video.onloadeddata = () => {
        this.clearLoadTimer();
        this.renderProgress();
      };
      video.onloadedmetadata = () => {
        this.renderProgress();
        this.applyViewSettings();
      };
      video.onprogress = () => this.renderProgress();
      video.ontimeupdate = () => {
        if (!screen.isConnected) {
          this.destroy();
          return;
        }
        if (video.paused) this.renderProgress();
      };
      video.ondurationchange = () => this.renderProgress();

      video.onerror = () => {
        if (!video.getAttribute("src") && !this.hls) return; // teardown noise
        const code = video.error && video.error.code;
        let msg =
          "The server didn\u2019t load the video. Retry, or switch to another server.";
        if (code === 4)
          msg =
            "The browser can\u2019t open this file. It may be removed, blocked, or in a format like MKV. Try another server or VLC.";
        else if (code === 3)
          msg = "The video couldn\u2019t be decoded. Try another server.";
        else if (code === 2)
          msg =
            "The connection dropped while loading. Check your internet and retry.";
        console.warn("Video error:", video.error);
        this.showError(msg);
      };

      const skipSec = (sec) => {
        if (!video.duration) return;
        video.currentTime = Math.max(
          0,
          Math.min(video.duration, video.currentTime + sec)
        );
        this.skipFeedback(sec < 0 ? "left" : "right");
        this.renderProgress();
      };
      $("SkipBack").onclick = () => {
        skipSec(-10);
        this.showCtrl();
      };
      $("SkipFwd").onclick = () => {
        skipSec(10);
        this.showCtrl();
      };
      $("Rew").onclick = () => {
        skipSec(-10);
        this.showCtrl();
      };
      $("Fwd").onclick = () => {
        skipSec(10);
        this.showCtrl();
      };

      /* seekbar: visual scrub, single seek on release */
      const posFrom = (e) => {
        const r = seek.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      };
      const showBubble = (pos) => {
        seek.style.setProperty("--h", pos);
        bubble.textContent = formatTime(pos * (video.duration || 0));
        seek.classList.add("show-bubble");
      };
      seek.onpointerdown = (e) => {
        if (!video.duration) return;
        e.preventDefault();
        this.isScrubbing = true;
        this.scrubPct = posFrom(e);
        seek.classList.add("dragging");
        try {
          seek.setPointerCapture(e.pointerId);
        } catch (_) {}
        showBubble(this.scrubPct);
        this.renderProgress();
        clearTimeout(this.ctrlTimer);
      };
      seek.onpointermove = (e) => {
        if (!video.duration) return;
        const pos = posFrom(e);
        if (this.isScrubbing) {
          this.scrubPct = pos;
          showBubble(pos);
          this.renderProgress();
        } else if (e.pointerType === "mouse") showBubble(pos);
      };
      const endScrub = (e, commit) => {
        if (!this.isScrubbing) return;
        this.isScrubbing = false;
        seek.classList.remove("dragging");
        try {
          seek.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (commit && video.duration)
          video.currentTime = this.scrubPct * video.duration;
        if (e.pointerType !== "mouse") seek.classList.remove("show-bubble");
        this.renderProgress();
        this.armHide();
      };
      seek.onpointerup = (e) => endScrub(e, true);
      seek.onpointercancel = (e) => endScrub(e, false);
      seek.onpointerleave = (e) => {
        if (!this.isScrubbing) seek.classList.remove("show-bubble");
      };
      seek.onkeydown = (e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          skipSec(-5);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          skipSec(5);
        }
      };
      seek.tabIndex = 0;

      /* volume (persisted) */
      let saved = { v: 1, m: false };
      try {
        saved = Object.assign(
          saved,
          JSON.parse(localStorage.getItem("mm_vol") || "{}")
        );
      } catch (_) {}
      video.volume = Math.max(0, Math.min(1, +saved.v));
      video.muted = !!saved.m;
      const syncVol = () => {
        const eff = video.muted ? 0 : video.volume;
        vol.value = eff;
        vol.style.setProperty("--v", eff * 100 + "%");
        muteBtn.classList.toggle("is-muted", video.muted || video.volume === 0);
        try {
          localStorage.setItem(
            "mm_vol",
            JSON.stringify({ v: video.volume, m: video.muted })
          );
        } catch (_) {}
      };
      video.onvolumechange = syncVol;
      syncVol();
      muteBtn.onclick = () => {
        if (video.muted || video.volume === 0) {
          video.muted = false;
          if (video.volume === 0) video.volume = 0.6;
        } else video.muted = true;
        this.showCtrl();
      };
      vol.oninput = () => {
        const n = +vol.value;
        video.muted = n === 0;
        video.volume = n;
      };

      /* fullscreen (+ landscape lock on phones) */
      // NOTE: `screen` here is the player div — the Orientation API lives on
      // window.screen, so always use that explicitly (the old code read
      // `screen.orientation` off the div, which is undefined → lock never ran).
      const isFs = () =>
        document.fullscreenElement === screen ||
        document.webkitFullscreenElement === screen;
      const lockLandscape = () => {
        try {
          const o = window.screen && window.screen.orientation;
          if (o && o.lock && matchMedia("(pointer:coarse)").matches)
            o.lock("landscape").catch(() => {});
        } catch (_) {}
      };
      const unlockOrient = () => {
        try {
          const o = window.screen && window.screen.orientation;
          if (o && o.unlock) o.unlock();
        } catch (_) {}
      };
      const toggleFs = () => {
        if (isFs())
          (document.exitFullscreen || document.webkitExitFullscreen).call(
            document
          );
        else if (screen.requestFullscreen) {
          const p = screen.requestFullscreen();
          if (p && p.catch) p.catch(() => {});
          lockLandscape(); // keep gesture context: lock right away, not only on fs-change
        } else if (screen.webkitRequestFullscreen) {
          screen.webkitRequestFullscreen();
          lockLandscape();
        } else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone Safari (no orientation-lock API there)
      };
      fsBtn.onclick = () => {
        toggleFs();
        this.showCtrl();
      };
      const onFsChange = () => {
        const fs = isFs();
        screen.classList.toggle("is-fs", fs);
        if (fs) lockLandscape();
        else unlockOrient();
      };
      document.addEventListener("fullscreenchange", onFsChange, sig);
      document.addEventListener("webkitfullscreenchange", onFsChange, sig);

      /* keep controls alive while pointer is over them */
      ["Top", "Bot"].forEach((n) => {
        const el = $(n);
        el.onpointerenter = (e) => {
          if (e.pointerType === "mouse") {
            this.ctrlHover = true;
            clearTimeout(this.ctrlTimer);
          }
        };
        el.onpointerleave = () => {
          this.ctrlHover = false;
          this.armHide();
        };
      });

      /* tap / click on the video area */
      tap.onpointerdown = () => {
        if (this.locked) {
          this.revealLock();
          return;
        }
        if (this.popOpen()) {
          this.closePops();
          this._popJustClosed = true;
        } else this._popJustClosed = false;
      };
      tap.onpointerup = (e) => {
        if (this.locked) {
          this.revealLock();
          return;
        }
        if (e.button > 0) return;
        if (this._popJustClosed) {
          this._popJustClosed = false;
          return;
        }
        const now = Date.now(),
          r = screen.getBoundingClientRect(),
          x = e.clientX - r.left;
        const zone =
          x < r.width * 0.35 ? "left" : x > r.width * 0.65 ? "right" : "mid";
        const quick = now - this.lastTap.time < 300;
        clearTimeout(this.clickTimer);

        if (e.pointerType === "mouse") {
          if (quick) {
            toggleFs();
            this.lastTap.time = 0;
            return;
          } // double-click = fullscreen
          this.lastTap.time = now;
          this.clickTimer = setTimeout(() => {
            togglePlay();
            this.showCtrl();
          }, 230); // click = play/pause
          return;
        }
        // touch / pen
        if (quick && zone !== "mid") {
          skipSec(zone === "left" ? -10 : 10);
          this.lastTap.time = now;
          this.showCtrl();
          return;
        }
        this.lastTap.time = now;
        this.clickTimer = setTimeout(() => {
          const on = screen.classList.contains("ctl-on");
          if (on) this.hideCtrlNow();
          else this.showCtrl();
        }, 260);
      };
      screen.onpointermove = (e) => {
        if (this.locked) return;
        if (e.pointerType === "mouse" && !this.isEmbed()) this.showCtrl();
      };

      /* keyboard */
      window.addEventListener(
        "keydown",
        (e) => {
          if (!screen.isConnected) {
            this.destroy();
            return;
          }
          if (e.key === "Escape" && modal.classList.contains("open")) {
            closeModal();
            return;
          }
          if (e.key === "Escape" && this.settingsOpen) {
            this.closeSettings();
            e.preventDefault();
            return;
          }
          if (!screen.classList.contains("active")) return;
          if (modal.classList.contains("open") || this.settingsOpen || this.locked)
            return;
          if (
            ["INPUT", "TEXTAREA", "SELECT"].includes(
              document.activeElement && document.activeElement.tagName
            ) &&
            document.activeElement !== vol
          )
            return;
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const k = e.key;
          let handled = true;
          if (k === " " || k === "k" || k === "K") togglePlay();
          else if (k === "ArrowLeft") skipSec(-5);
          else if (k === "ArrowRight") skipSec(5);
          else if (k === "j" || k === "J") skipSec(-10);
          else if (k === "l" || k === "L") skipSec(10);
          else if (k === "ArrowUp") {
            video.muted = false;
            video.volume = Math.min(1, video.volume + 0.05);
          } else if (k === "ArrowDown") {
            video.volume = Math.max(0, video.volume - 0.05);
          } else if (k === "m" || k === "M") muteBtn.click();
          else if (k === "f" || k === "F") toggleFs();
          else if (k === "c" || k === "C") {
            this.subtitleSettings.visible = !this.subtitleSettings.visible;
            this.applySubtitleSettings();
          } else if (k === "Escape") {
            if (this.popOpen()) this.closePops();
            else if (!isFs()) this.closeScreen();
          } else handled = false;
          if (handled) {
            e.preventDefault();
            this.showCtrl();
          }
        },
        sig
      );
    }

    /* ── ExoClick VAST Video Ads (Preroll & Postroll) ── */
    playVastAd(type, onComplete) {
      const adScreen = this.$("AdScreen");
      const adVideo = this.$("AdVideo");
      const adTime = this.$("AdTime");
      const adSkip = this.$("AdSkip");
      const adCta = this.$("AdCta");
      const token = this.streamToken;

      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        this.adActive = false;
        if (adVideo) {
          try {
            adVideo.pause();
          } catch (_) {}
          adVideo.removeAttribute("src");
          try {
            adVideo.load();
          } catch (_) {}
        }
        if (adScreen) adScreen.classList.remove("active");
        if (typeof onComplete === "function") onComplete();
      };

      if (!adScreen || !adVideo) {
        done();
        return;
      }

      const vastUrl = "https://s.magsrv.com/v1/vast.php?idz=6038654";
      console.log(`[ExoClick VAST] Requesting ${type} ad from: ${vastUrl}`);

      const timeoutId = setTimeout(() => {
        console.warn(`[ExoClick VAST] ${type} ad request timed out after 6s. Proceeding to content.`);
        done();
      }, 6000);

      const sendBeacon = (url) => {
        if (!url) return;
        try {
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url);
          } else {
            const img = new Image();
            img.src = url;
          }
        } catch (_) {}
      };

      fetch(vastUrl, { mode: "cors" })
        .then((res) => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then((xmlText) => {
          clearTimeout(timeoutId);
          if (finished || token !== this.streamToken) return;

          const parser = new DOMParser();
          const xml = parser.parseFromString(xmlText, "text/xml");

          // Extract MediaFiles
          const mediaEls = Array.from(xml.querySelectorAll("MediaFile"));
          let mediaUrl = "";
          const mp4El = mediaEls.find((m) =>
            (m.getAttribute("type") || "").toLowerCase().includes("mp4")
          );
          if (mp4El && mp4El.textContent) {
            mediaUrl = mp4El.textContent.trim();
          } else if (mediaEls.length > 0 && mediaEls[0].textContent) {
            mediaUrl = mediaEls[0].textContent.trim();
          }

          if (!mediaUrl) {
            console.log(`[ExoClick VAST] No playable video media found in ${type} VAST response.`);
            done();
            return;
          }

          // Impressions
          const impressions = Array.from(xml.querySelectorAll("Impression"))
            .map((el) => (el.textContent || "").trim())
            .filter(Boolean);

          // ClickThrough & ClickTracking
          const ctEl = xml.querySelector("ClickThrough");
          const clickThroughUrl =
            ctEl && ctEl.textContent ? ctEl.textContent.trim() : "";
          const clickTrackings = Array.from(
            xml.querySelectorAll("ClickTracking")
          )
            .map((el) => (el.textContent || "").trim())
            .filter(Boolean);

          // TrackingEvents
          const trackingEvents = {};
          xml.querySelectorAll("Tracking").forEach((t) => {
            const evt = t.getAttribute("event");
            const u = (t.textContent || "").trim();
            if (evt && u) {
              if (!trackingEvents[evt]) trackingEvents[evt] = [];
              trackingEvents[evt].push(u);
            }
          });

          this.adActive = true;
          adScreen.classList.add("active");

          // Configure CTA
          if (clickThroughUrl && adCta) {
            adCta.style.display = "inline-flex";
            adCta.onclick = (e) => {
              e.stopPropagation();
              clickTrackings.forEach(sendBeacon);
              window.open(clickThroughUrl, "_blank", "noopener,noreferrer");
            };
          } else if (adCta) {
            adCta.style.display = "none";
          }

          // Video click acts as clickthrough
          adVideo.onclick = (e) => {
            if (clickThroughUrl) {
              e.stopPropagation();
              clickTrackings.forEach(sendBeacon);
              window.open(clickThroughUrl, "_blank", "noopener,noreferrer");
            }
          };

          // Configure Skip countdown (5 seconds standard)
          const skipAfterSec = 5;
          let canSkip = false;
          if (adSkip) {
            adSkip.style.display = "block";
            adSkip.textContent = `Skip in ${skipAfterSec}s`;
            adSkip.style.opacity = "0.7";
            adSkip.style.cursor = "default";
            adSkip.onclick = (e) => {
              e.stopPropagation();
              if (canSkip) {
                if (trackingEvents["skip"]) {
                  trackingEvents["skip"].forEach(sendBeacon);
                }
                done();
              }
            };
          }

          let firedStart = false;
          let firedFirstQ = false;
          let firedMid = false;
          let firedThirdQ = false;

          adVideo.src = mediaUrl;

          adVideo.onplay = () => {
            if (!firedStart) {
              firedStart = true;
              impressions.forEach(sendBeacon);
              if (trackingEvents["start"]) {
                trackingEvents["start"].forEach(sendBeacon);
              }
            }
          };

          adVideo.ontimeupdate = () => {
            const cur = adVideo.currentTime || 0;
            const dur = adVideo.duration || 0;
            if (adTime) {
              const rem = Math.max(0, Math.ceil(dur - cur));
              adTime.textContent = rem > 0 ? `${rem}s` : "";
            }
            if (!canSkip && adSkip) {
              const wait = Math.max(0, Math.ceil(skipAfterSec - cur));
              if (wait > 0 && cur < dur) {
                adSkip.textContent = `Skip in ${wait}s`;
              } else {
                canSkip = true;
                adSkip.textContent = "Skip Ad \u276F";
                adSkip.style.opacity = "1";
                adSkip.style.cursor = "pointer";
              }
            }
            if (dur > 0) {
              const pct = cur / dur;
              if (pct >= 0.25 && !firedFirstQ) {
                firedFirstQ = true;
                if (trackingEvents["firstQuartile"])
                  trackingEvents["firstQuartile"].forEach(sendBeacon);
              }
              if (pct >= 0.5 && !firedMid) {
                firedMid = true;
                if (trackingEvents["midpoint"])
                  trackingEvents["midpoint"].forEach(sendBeacon);
              }
              if (pct >= 0.75 && !firedThirdQ) {
                firedThirdQ = true;
                if (trackingEvents["thirdQuartile"])
                  trackingEvents["thirdQuartile"].forEach(sendBeacon);
              }
            }
          };

          adVideo.onended = () => {
            if (trackingEvents["complete"]) {
              trackingEvents["complete"].forEach(sendBeacon);
            }
            done();
          };

          adVideo.onerror = (e) => {
            console.warn("[ExoClick VAST] Ad video playback error:", e);
            done();
          };

          adVideo.play().catch((err) => {
            console.warn("[ExoClick VAST] Autoplay prevented, attempting muted playback:", err);
            adVideo.muted = true;
            adVideo.play().catch(() => {
              done();
            });
          });
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          console.warn("[ExoClick VAST] Ad load failed (CORS/AdBlock):", err.message || err);
          done();
        });
    }

    /* ── lifecycle ── */
    stopMedia() {
      this.streamToken++;
      this.clearLoadTimer();
      this.hideSpinner();
      if (this.adActive) {
        const adVideo = this.$("AdVideo");
        const adScreen = this.$("AdScreen");
        if (adVideo) {
          try {
            adVideo.pause();
          } catch (_) {}
          adVideo.removeAttribute("src");
          try {
            adVideo.load();
          } catch (_) {}
        }
        if (adScreen) adScreen.classList.remove("active");
        this.adActive = false;
      }
      if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = null;
      }
      if (this.hls) {
        try {
          this.hls.destroy();
        } catch (_) {}
        this.hls = null;
      }
      const video = this.video,
        iframe = this.$("Iframe");
      if (video) {
        try {
          video.pause();
        } catch (_) {}
        video.removeAttribute("src");
        try {
          video.load();
        } catch (_) {}
        video.style.display = "none";
      }
      if (iframe) {
        iframe.src = "about:blank";
        iframe.style.display = "none";
      }
    }

    closeScreen() {
      this.stopMedia();
      this.hideError();
      this.closePops();
      clearTimeout(this.ctrlTimer);
      clearTimeout(this.clickTimer);
      clearTimeout(this.lockTimer);
      clearTimeout(this.toastTimer);
      this.locked = false;
      const sc = this.screen;
      if (
        (document.fullscreenElement || document.webkitFullscreenElement) &&
        (document.exitFullscreen || document.webkitExitFullscreen)
      ) {
        try {
          (document.exitFullscreen || document.webkitExitFullscreen).call(
            document
          );
        } catch (_) {}
      }
      if (sc) sc.classList.remove("active", "is-playing", "ctl-on", "is-fs", "is-locked", "lock-reveal", "set-open");
      // INLINE: restore the thumbnail box
      const hero = this.$("Hero");
      if (hero) hero.style.display = "";
    }

    destroy() {
      try {
        this.abort.abort();
      } catch (_) {}
      this.stopMedia();
      clearTimeout(this.ctrlTimer);
      clearTimeout(this.clickTimer);
      clearTimeout(this.lockTimer);
      clearTimeout(this.toastTimer);
      if (
        IntegratedPlayer._reg &&
        IntegratedPlayer._reg[this.containerId] === this
      )
        delete IntegratedPlayer._reg[this.containerId];
    }

    markCurrent(idx) {
      this.mediaData.players.forEach((_, i) => {
        const o = this.$(`Opt_${i}`),
          n = this.$(`Now_${i}`);
        if (o) o.classList.toggle("is-current", i === idx);
        if (n) n.hidden = i !== idx;
      });
    }

    startPlayer(idx) {
      this.activePlayerIdx = idx;
      const p = this.mediaData.players[idx];
      if (!p || !p.url) return;
      // Subtitle resolution: the player's own subtitleUrl wins, otherwise the common one
      const subUrl = (
        (p.subtitleUrl || p.subtitle || this.mediaData.subtitleUrl || "") + ""
      ).trim();
      this.activeSubUrl = subUrl;
      this.updateSettingsUI();

      const screen = this.screen,
        video = this.video,
        iframe = this.$("Iframe");
      const hero = this.$("Hero");
      const vlc = this.$("Vlc"),
        vlcDl = this.$("VlcDl");
      const pName = (p.name || "").toLowerCase(),
        pType = (p.type || "").toLowerCase(),
        pUrl = (p.url || "").trim();

      // INLINE: turn the thumbnail box into the player — stay in page flow, no fullscreen takeover
      if (hero) hero.style.display = "none";
      screen.classList.add("active");

      this.stopMedia();
      this.hideError();
      this.closePops();
      this.subtitles = [];
      this._curCue = undefined;
      this.netRetries = 0;
      this._lastTimeStr = "";
      this.locked = false;
      clearTimeout(this.lockTimer);
      const lockReset = this.$("Lock");
      if (lockReset) {
        lockReset.setAttribute("aria-pressed", "false");
        lockReset.setAttribute("aria-label", "Lock player controls");
      }
      vlc.style.display = "none";
      screen.classList.remove(
        "is-playing",
        "is-embed",
        "is-locked",
        "lock-reveal",
        "set-open"
      );
      screen.classList.add("ctl-on");
      this.applyViewSettings();
      this.markCurrent(idx);
      const token = this.streamToken;

      // 1) VLC (external app)
      if (pName.includes("vlc") || pType === "vlc") {
        screen.classList.add("is-embed");
        vlc.style.display = "flex";
        // VLC's vlc:// handler expects host/path WITHOUT a protocol and
        // prepends https:// itself. Strip any existing http(s):// so VLC
        // doesn't end up with https://https://... (syntax error).
        const vlcUrl = pUrl.startsWith("vlc://")
          ? pUrl
          : `vlc://${pUrl.replace(/^(https?:\/\/)/i, "")}`;
        window.location.href = vlcUrl;
        this.countWatch();
        vlcDl.onclick = () => {
          let m3u = `#EXTM3U\n#EXTINF:-1,${
            this.mediaData.title || "Video"
          }\n${pUrl}`;
          if (subUrl) m3u += `\n#EXTVLCOPT:sub-file=${subUrl}`;
          const url = URL.createObjectURL(
            new Blob([m3u], { type: "audio/mpegurl" })
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = `${(this.mediaData.title || "stream").replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}.m3u`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        };
        return;
      }

      // 2) Third-party embeds
      const isEmbed =
        (pType === "embed" ||
          pUrl.includes("youtube.com/embed") ||
          pUrl.includes("vimeo.com/video") ||
          pUrl.includes("dailymotion.com/embed")) &&
        !pUrl.includes("fb-con.vercel.app");
      if (isEmbed) {
        screen.classList.add("is-embed");
        iframe.style.display = "block";
        iframe.src = pUrl;
        this.countWatch();
        return;
      }

      // 3) Direct file / HLS (plain <video>; no crossorigin attribute, so direct files never need CORS)
      video.style.display = "block";
      this.showSpinner();
      this.renderProgress();
      if (subUrl) this.fetchAndParseSubtitles(subUrl);

      const loadContentMedia = () => {
        if (token !== this.streamToken) return;

        this.loadTimer = setTimeout(() => {
          if (token !== this.streamToken) return;
          this.showError(
            "This server is taking too long to respond. Retry, or switch to another server."
          );
        }, 30000);

        const tryPlay = () => {
          if (token !== this.streamToken) return;
          const pr = video.play();
          if (pr && pr.catch)
            pr.catch((err) => {
              if (err && err.name !== "AbortError")
                console.warn("Autoplay notice:", err);
            });
        };

        const isHls = pUrl.toLowerCase().includes(".m3u8") || pType === "hls";
        if (!isHls) {
          video.src = pUrl;
          tryPlay();
          return;
        }
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = pUrl;
          tryPlay();
          return;
        }

        ensureHls().then((ok) => {
          if (token !== this.streamToken) return;
          if (!ok || typeof Hls === "undefined" || !Hls.isSupported()) {
            this.showError(
              "This browser can\u2019t play this stream type. Try another server or VLC."
            );
            return;
          }
          const hls = new Hls({
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 2,
            levelLoadingMaxRetry: 3,
            fragLoadingMaxRetry: 4,
            enableWorker: true,
          });
          this.hls = hls;
          hls.loadSource(pUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            tryPlay();
          });
          hls.on(Hls.Events.ERROR, (_ev, data) => {
            if (token !== this.streamToken || !data || !data.fatal) return;
            console.warn("HLS fatal:", data.type, data.details);
            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              this.netRetries < 3
            ) {
              this.netRetries++;
              setTimeout(() => {
                if (token === this.streamToken && this.hls) this.hls.startLoad();
              }, 800 * this.netRetries);
            } else if (
              data.type === Hls.ErrorTypes.MEDIA_ERROR &&
              this.netRetries < 3
            ) {
              this.netRetries++;
              this.hls.recoverMediaError();
            } else {
              this.showError(
                data.details === "manifestLoadError"
                  ? "This stream blocked the browser from loading it. Try another server or VLC."
                  : "Playback stopped unexpectedly. Retry, or switch to another server."
              );
            }
          });
        });
      };

      if (!this.prerollPlayed) {
        this.prerollPlayed = true;
        this.playVastAd("preroll", loadContentMedia);
      } else {
        loadContentMedia();
      }
    }
  }

  window.IntegratedPlayer = IntegratedPlayer;
})();
