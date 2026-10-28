/*
 * NavegaTV — módulo de TizenBrew.
 * TizenBrew inyecta este archivo en cada página y en cada iframe.
 *  - Bloquea ventanas emergentes, enlaces invisibles y redirecciones a otros sitios.
 *  - Cursor con las flechas del control (OK = clic).
 *  - Modo video: el video que suena pasa a pantalla completa con controles de TV.
 *  - Botón Atrás = menú (buscar, anterior, favoritos, zoom, salir).
 */
(function () {
  'use strict';
  if (window.__navegatv) return;
  window.__navegatv = true;

  var IS_TOP = (function () { try { return window.top === window; } catch (e) { return false; } })();
  var HOME_URL = 'https://duckduckgo.com/?navegatv=home';
  var SEARCH_URL = 'https://duckduckgo.com/?q=';
  var DEFAULT_FAVS = [
    { t: 'DuckDuckGo', u: 'https://duckduckgo.com/' },
    { t: 'Google', u: 'https://www.google.com/' },
    { t: 'YouTube', u: 'https://www.youtube.com/' },
    { t: 'Wikipedia', u: 'https://es.wikipedia.org/' }
  ];

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BACKSPACE: 8,
    PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412,
    CHUP: 427, CHDOWN: 428, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    IME_DONE: 65376, IME_CANCEL: 65385
  };

  /* ------------------------------------------------------------------ */
  /* Redes de anuncios conocidas (se compara contra dominio + ruta)       */
  /* ------------------------------------------------------------------ */
  var AD = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google',
    'popads.net', 'popcash.net', 'propellerads', 'propellerclick', 'adsterra', 'exoclick', 'exosrv.com',
    'exdynsrv', 'juicyads', 'trafficjunky', 'adcash', 'hilltopads', 'clickadu', 'onclickads', 'onclkds',
    'onclickperformance', 'admaven', 'ad-maven', 'mgid.com', 'taboola.com', 'outbrain.com', 'revcontent',
    'a-ads.com', 'coinzilla', 'bidvertiser', 'monetag', 'galaksion', 'richpush', 'pushground', 'evadav',
    'zeropark', 'clickaine', 'adnium', 'plugrush', 'trafficstars', 'tsyndicate', 'highperformanceformat',
    'highperformancecpm', 'profitablegate', 'cpmgate', 'revenuegate', 'effectivegate', 'displaycontentnetwork',
    'adskeeper', 'realsrv.com', 'pemsrv.com', 'magsrv.com', 'twinrdsrv', 'popunder', 'popmyads', 'adspyglass',
    'pushwhy', 'notix.io', 'surfe.pro', 'acint.net', 'dolohen', 'adf.ly', 'shorte.st', 'linkvertise',
    'ouo.io', 'rtmark.net', 'syndication.exo', 'adxadserv', 'clickaduhub', 'stripchat', 'chaturbate',
    'tapioni', 'amung.us', 'yllix', 'adnxs.com', 'criteo', 'pubmatic', 'rubiconproject', 'smartadserver',
    'betterads', 'push-sdk', 'pushnami', 'aclib', 'acscdn', 'bngpt', 'groleegni', 'whos.amung'];

  function parseUrl(u) { try { return new URL(u, location.href); } catch (e) { return null; } }
  function isAd(u) {
    var p = parseUrl(u);
    if (!p || !/^https?:$/.test(p.protocol)) return false;
    var s = (p.hostname + p.pathname).toLowerCase();
    for (var i = 0; i < AD.length; i++) if (s.indexOf(AD[i]) >= 0) return true;
    return false;
  }
  function baseDomain(h) {
    var p = (h || '').toLowerCase().split('.');
    if (p.length > 2 && /^(com|net|org|gov|edu|co)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2) return p.slice(-3).join('.');
    return p.slice(-2).join('.');
  }
  function sameSite(a, b) { return baseDomain(a) === baseDomain(b); }

  /* ------------------------------------------------------------------ */
  /* Mensajes entre frames                                               */
  /* ------------------------------------------------------------------ */
  function sendUp(msg) {
    msg.__ntv = 1; msg.dir = 'up';
    try { window.parent.postMessage(msg, '*'); } catch (e) {}
  }
  function sendDown(win, msg) {
    msg.__ntv = 1; msg.dir = 'down';
    try { win.postMessage(msg, '*'); } catch (e) {}
  }
  function frameElFor(src) {
    var fs = document.querySelectorAll('iframe,frame');
    for (var i = 0; i < fs.length; i++) { try { if (fs[i].contentWindow === src) return fs[i]; } catch (e) {} }
    return null;
  }

  var blockedCount = 0;
  function noteBlocked(what) {
    if (IS_TOP) onBlocked(what); else sendUp({ t: 'blocked', what: what });
  }

  /* ------------------------------------------------------------------ */
  /* 1. Ventanas emergentes                                              */
  /* ------------------------------------------------------------------ */
  function fakeWindow() {
    var w = { closed: false, opener: null, name: '' };
    w.close = function () { w.closed = true; };
    w.focus = w.blur = w.postMessage = w.moveTo = w.resizeTo = function () {};
    w.document = { write: function () {}, writeln: function () {}, open: function () {}, close: function () {}, body: null };
    w.location = { href: 'about:blank', assign: function () {}, replace: function () {} };
    return w;
  }
  function blockedOpen() { noteBlocked('popup'); return fakeWindow(); }
  function patchWindow(w) {
    try {
      if (w.__ntvp) return;
      Object.defineProperty(w, 'open', { value: blockedOpen, writable: false, configurable: false });
      w.__ntvp = true;
    } catch (e) {}
  }
  patchWindow(window);
  // Truco común: crear un iframe vacío y usar su window.open "limpio".
  try {
    var cwDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (cwDesc && cwDesc.get) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        configurable: true, enumerable: cwDesc.enumerable,
        get: function () { var w = cwDesc.get.call(this); if (w) patchWindow(w); return w; }
      });
    }
  } catch (e) {}

  // Scripts e iframes de redes de anuncios agregados con JavaScript.
  function badNode(n) {
    if (!n || n.nodeType !== 1) return false;
    var tag = n.tagName;
    if (tag !== 'SCRIPT' && tag !== 'IFRAME') return false;
    var src = n.getAttribute('src') || '';
    return !!src && isAd(src);
  }
  try {
    var oAppend = Node.prototype.appendChild, oInsert = Node.prototype.insertBefore;
    Node.prototype.appendChild = function (c) {
      if (badNode(c)) { noteBlocked('script'); return c; }
      return oAppend.call(this, c);
    };
    Node.prototype.insertBefore = function (c, r) {
      if (badNode(c)) { noteBlocked('script'); return c; }
      return oInsert.call(this, c, r);
    };
  } catch (e) {}

  /* Clics en enlaces: anuncios, pestañas nuevas y enlaces invisibles. */
  var lastUserAct = 0, lastClickHref = null, allowNavTs = 0;

  function linkLooksReal(a) {
    var r = a.getBoundingClientRect();
    var area = r.width * r.height, vArea = innerWidth * innerHeight;
    if (area > vArea * 0.4) return false;
    var cs = getComputedStyle(a);
    if (parseFloat(cs.opacity) < 0.1 || cs.visibility === 'hidden') return false;
    return !!((a.innerText || '').trim() || a.querySelector('img,svg,picture'));
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href]') : null;
    if (!a) return;
    var href = a.href;
    if (isAd(href)) { e.preventDefault(); e.stopImmediatePropagation(); noteBlocked('link'); return; }
    var tgt = (a.getAttribute('target') || '').toLowerCase();
    var newTab = tgt && tgt !== '_self' && tgt !== '_top' && tgt !== '_parent';
    if (!newTab) return;
    e.preventDefault();
    var u = parseUrl(href);
    if (!u || !/^https?:$/.test(u.protocol)) return;
    // Dentro de un reproductor (iframe) no hay razón para abrir pestañas: es publicidad.
    if (!IS_TOP) { e.stopImmediatePropagation(); noteBlocked('link'); return; }
    if (!sameSite(u.hostname, location.hostname) && !linkLooksReal(a)) {
      e.stopImmediatePropagation(); noteBlocked('link'); return;
    }
    lastClickHref = href; allowNavTs = Date.now();
    location.href = href;
  }, true);

  /* Redirecciones: solo se permite ir a otro sitio si fue el usuario. */
  if (window.navigation && window.navigation.addEventListener) {
    window.navigation.addEventListener('navigate', function (e) {
      try {
        if (!e.cancelable || e.hashChange || e.downloadRequest) return;
        var u = parseUrl(e.destination.url);
        if (!u || !/^https?:$/.test(u.protocol)) return;
        if (isAd(u.href)) { e.preventDefault(); noteBlocked('redirect'); return; }
        if (!IS_TOP) return;
        if (sameSite(u.hostname, location.hostname)) return;
        var now = Date.now();
        if (now - allowNavTs < 4000) return;
        if (lastClickHref && now - lastUserAct < 4000) {
          var c = parseUrl(lastClickHref);
          if (c && sameSite(c.hostname, u.hostname)) return;
        }
        if (e.formData && now - lastUserAct < 4000) return;
        e.preventDefault(); noteBlocked('redirect');
      } catch (err) {}
    });
  }

  /* Capas invisibles encima de la página y iframes de anuncios. */
  var videoMode = false;
  function sweep() {
    if (!document.body) return;
    var vw = innerWidth, vh = innerHeight, vArea = vw * vh;
    var i, el;
    var frames = document.querySelectorAll('iframe[src]');
    for (i = 0; i < frames.length; i++) {
      if (isAd(frames[i].getAttribute('src'))) { frames[i].remove(); noteBlocked('iframe'); }
    }
    var cands = document.querySelectorAll('body > *, a[target], a[href]');
    var n = Math.min(cands.length, 1500);
    for (i = 0; i < n; i++) {
      el = cands[i];
      if (el.id === 'ntv-host' || el.__ntvOk) continue;
      var cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      var r = el.getBoundingClientRect();
      var area = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (area < vArea * 0.3) continue;
      var z = parseInt(cs.zIndex, 10) || 0;
      if (el.tagName === 'A') {
        var u = parseUrl(el.href);
        var external = u && !sameSite(u.hostname, location.hostname);
        if (isAd(el.href) || (external && (z >= 10 || parseFloat(cs.opacity) < 0.1 || !linkLooksReal(el)))) {
          el.remove(); noteBlocked('overlay'); continue;
        }
      } else if (!videoMode && cs.position === 'fixed' && z >= 99999 &&
          !(el.innerText || '').trim() && !el.querySelector('video,img,canvas,iframe,svg,input,button')) {
        el.style.setProperty('pointer-events', 'none', 'important');
        el.__ntvOk = true;
        noteBlocked('overlay');
      }
    }
  }
  var sweepTimer = null;
  function sweepSoon() { if (sweepTimer) return; sweepTimer = setTimeout(function () { sweepTimer = null; try { sweep(); } catch (e) {} }, 600); }
  function startObserver() {
    try {
      new MutationObserver(sweepSoon).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    sweepSoon();
    setInterval(sweepSoon, 3000);
  }

  /* ------------------------------------------------------------------ */
  /* 2. Video                                                            */
  /* ------------------------------------------------------------------ */
  var curVideo = null, videoChild = null, videoSource = null, vstateTimer = null;

  function videoArea(v) { var r = v.getBoundingClientRect(); return r.width * r.height; }
  function pickVideo() {
    if (curVideo && document.contains(curVideo)) return curVideo;
    var vs = document.querySelectorAll('video'), best = null, bestScore = 0;
    for (var i = 0; i < vs.length; i++) {
      var s = videoArea(vs[i]) * (vs[i].paused ? 1 : 3) + (vs[i].currentSrc ? 1 : 0);
      if (s > bestScore) { bestScore = s; best = vs[i]; }
    }
    return best;
  }
  function videoState(v) {
    return { cur: v.currentTime || 0, dur: isFinite(v.duration) ? v.duration : 0, paused: v.paused };
  }
  document.addEventListener('playing', function (e) {
    var v = e.target;
    if (!v || v.tagName !== 'VIDEO') return;
    if (videoArea(v) < 200 * 120 && !videoMode) return;
    curVideo = v;
    var st = videoState(v);
    if (IS_TOP) onVideoFound('local', st); else { videoSource = 'local'; sendUp({ t: 'hasvideo', st: st }); }
  }, true);

  function vcmd(cmd, arg) {
    var v = pickVideo();
    if (!v) return;
    try {
      if (cmd === 'toggle') { if (v.paused) v.play(); else v.pause(); }
      else if (cmd === 'play') v.play();
      else if (cmd === 'pause') v.pause();
      else if (cmd === 'seek') {
        var d = isFinite(v.duration) ? v.duration : Infinity;
        v.currentTime = Math.max(0, Math.min(d - 1, v.currentTime + arg));
      }
    } catch (e) {}
    reportState();
  }
  function reportState() {
    var v = pickVideo();
    if (!v) return;
    if (IS_TOP) onVideoState(videoState(v)); else sendUp({ t: 'vstate', st: videoState(v) });
  }

  // Poner un elemento (video o iframe) a pantalla completa con CSS.
  var STYLE_MAX = 'position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;' +
    'width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;min-width:0!important;' +
    'min-height:0!important;margin:0!important;padding:0!important;border:0!important;z-index:2147483646!important;' +
    'background:#000!important;transform:none!important;visibility:visible!important;opacity:1!important;';
  var maxed = null;
  function ensurePageCss() {
    if (document.getElementById('ntv-page-css')) return;
    var s = document.createElement('style');
    s.id = 'ntv-page-css';
    s.textContent = '.ntv-anc{transform:none!important;filter:none!important;contain:none!important;perspective:none!important;' +
      'will-change:auto!important;z-index:2147483646!important;clip-path:none!important;mask:none!important}' +
      'html.ntv-vmode,html.ntv-vmode body{overflow:hidden!important}' +
      'html.ntv-vmode body > *:not(.ntv-anc):not(#ntv-host):not(.ntv-max){visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(s);
  }
  function maximize(el) {
    if (maxed === el) return;
    restore();
    ensurePageCss();
    el.__ntvStyle = el.getAttribute('style');
    el.setAttribute('style', (el.__ntvStyle || '') + ';' + STYLE_MAX + (el.tagName === 'VIDEO' ? 'object-fit:contain!important;' : ''));
    el.classList.add('ntv-max');
    for (var p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) p.classList.add('ntv-anc');
    document.documentElement.classList.add('ntv-vmode');
    maxed = el;
  }
  function restore() {
    if (!maxed) return;
    if (maxed.__ntvStyle == null) maxed.removeAttribute('style'); else maxed.setAttribute('style', maxed.__ntvStyle);
    maxed.classList.remove('ntv-max');
    var ancs = document.querySelectorAll('.ntv-anc');
    for (var i = 0; i < ancs.length; i++) ancs[i].classList.remove('ntv-anc');
    document.documentElement.classList.remove('ntv-vmode');
    maxed = null;
  }
  function setVideoMode(on) {
    videoMode = on;
    if (!on) {
      restore();
      if (videoChild) sendDown(videoChild.contentWindow, { t: 'vmode', on: false });
      if (vstateTimer) { clearInterval(vstateTimer); vstateTimer = null; }
      return;
    }
    var local = curVideo && document.contains(curVideo) ? curVideo : null;
    if (videoSource === 'child' && videoChild && document.contains(videoChild)) {
      maximize(videoChild);
      sendDown(videoChild.contentWindow, { t: 'vmode', on: true });
    } else {
      if (!local) local = pickVideo();
      if (local) { curVideo = local; maximize(local); }
      else if (videoChild && document.contains(videoChild)) {
        maximize(videoChild);
        sendDown(videoChild.contentWindow, { t: 'vmode', on: true });
      }
      if (local && !vstateTimer) vstateTimer = setInterval(reportState, 1000);
    }
  }
  function routeVcmd(cmd, arg) {
    if (videoSource === 'child' && videoChild && document.contains(videoChild)) {
      sendDown(videoChild.contentWindow, { t: 'vcmd', cmd: cmd, arg: arg });
    } else vcmd(cmd, arg);
  }

  /* ------------------------------------------------------------------ */
  /* 3. Clic y scroll en un punto (también dentro de iframes)            */
  /* ------------------------------------------------------------------ */
  // El teclado de Samsung no le pasa bien el texto a las páginas y se roba las flechas.
  // Las cajas de texto nunca se quedan con el foco: se escribe con el teclado de NavegaTV.
  var pendingEdit = null, editChild = null, editSource = null;
  function isTextField(el) { return isEditable(el) && el.tagName !== 'SELECT'; }
  function dropFocus(t) {
    if (!isTextField(t)) return;
    try { t.setAttribute('inputmode', 'none'); } catch (err) {}
    setTimeout(function () { try { t.blur(); } catch (err) {} }, 0);
  }
  document.addEventListener('focusin', function (e) {
    if (typeof host !== 'undefined' && host && e.target === host) return;
    dropFocus(e.composedPath ? e.composedPath()[0] : e.target);
  }, true);
  function getVal(el) { return el.isContentEditable ? (el.textContent || '') : (el.value || ''); }
  function applyText(el, text, submit) {
    try {
      if (el.isContentEditable) el.textContent = text;
      else {
        var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
    if (!submit) return;
    lastUserAct = Date.now(); allowNavTs = Date.now();
    var ok = true;
    ['keydown', 'keypress', 'keyup'].forEach(function (type) {
      var ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      try { Object.defineProperty(ev, 'keyCode', { get: function () { return 13; } }); Object.defineProperty(ev, 'which', { get: function () { return 13; } }); } catch (e) {}
      var r = el.dispatchEvent(ev);
      if (type === 'keydown') ok = r;
    });
    if (ok && el.form) setTimeout(function () { try { if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit(); } catch (e) {} }, 60);
  }
  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    var tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    var ty = (el.type || 'text').toLowerCase();
    return ['button', 'submit', 'checkbox', 'radio', 'reset', 'image', 'file', 'range', 'color'].indexOf(ty) < 0;
  }
  function mouse(el, type, x, y) {
    var o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: type === 'mouseup' || type === 'click' ? 0 : 1 };
    try {
      if (type.indexOf('pointer') === 0) { o.pointerId = 1; o.pointerType = 'mouse'; o.isPrimary = true; el.dispatchEvent(new PointerEvent(type, o)); }
      else el.dispatchEvent(new MouseEvent(type, o));
    } catch (e) {}
  }
  function iframeOffset(f) {
    var r = f.getBoundingClientRect();
    return { x: r.left + f.clientLeft, y: r.top + f.clientTop };
  }
  function clickAt(x, y) {
    lastUserAct = Date.now();
    var el = document.elementFromPoint(x, y);
    if (!el || el.id === 'ntv-host') return;
    if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
      var off = iframeOffset(el);
      if (el.contentWindow) sendDown(el.contentWindow, { t: 'click', x: x - off.x, y: y - off.y });
      return;
    }
    var a = el.closest ? el.closest('a[href]') : null;
    lastClickHref = a ? a.href : null;
    mouse(el, 'pointerover', x, y); mouse(el, 'mouseover', x, y);
    mouse(el, 'pointerdown', x, y); mouse(el, 'mousedown', x, y);
    if (isTextField(el)) {
      mouse(el, 'pointerup', x, y); mouse(el, 'mouseup', x, y); mouse(el, 'click', x, y);
      pendingEdit = el; editSource = 'local';
      var info = { text: getVal(el), ph: el.getAttribute('placeholder') || el.getAttribute('aria-label') || '', pw: el.type === 'password' };
      if (IS_TOP) openKb('page', info); else sendUp({ t: 'edit', info: info });
      return;
    }
    if (el.tagName === 'SELECT') { try { el.focus(); } catch (e) {} }
    mouse(el, 'pointerup', x, y); mouse(el, 'mouseup', x, y);
    mouse(el, 'click', x, y);
    if (el.tagName === 'VIDEO') vcmd('toggle');
  }
  var lastHover = null;
  function hoverAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || el.id === 'ntv-host') return;
    if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
      var off = iframeOffset(el);
      if (el.contentWindow) sendDown(el.contentWindow, { t: 'hover', x: x - off.x, y: y - off.y });
      return;
    }
    if (el !== lastHover) { mouse(el, 'mouseover', x, y); lastHover = el; }
    mouse(el, 'mousemove', x, y);
  }
  function scrollableAt(el) {
    for (var p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (/(auto|scroll|overlay)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) return p;
    }
    return null;
  }
  function scrollAt(x, y, dy) {
    var el = document.elementFromPoint(x, y);
    if (el && (el.tagName === 'IFRAME' || el.tagName === 'FRAME') && el.contentWindow) {
      var off = iframeOffset(el);
      sendDown(el.contentWindow, { t: 'scroll', x: x - off.x, y: y - off.y, dy: dy });
      return;
    }
    var sc = el ? scrollableAt(el) : null;
    var before;
    if (sc) { before = sc.scrollTop; sc.scrollTop += dy; if (sc.scrollTop !== before) return; }
    window.scrollBy(0, dy);
  }

  /* ------------------------------------------------------------------ */
  /* Mensajes recibidos                                                  */
  /* ------------------------------------------------------------------ */
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.__ntv !== 1) return;
    if (d.dir === 'down') {
      if (e.source !== window.parent) return;
      if (d.t === 'click') clickAt(d.x, d.y);
      else if (d.t === 'hover') hoverAt(d.x, d.y);
      else if (d.t === 'scroll') scrollAt(d.x, d.y, d.dy);
      else if (d.t === 'vmode') {
        if (d.on) setVideoMode(true); else setVideoMode(false);
      } else if (d.t === 'vcmd') routeVcmd(d.cmd, d.arg);
      else if (d.t === 'setval') {
        if (editSource === 'child' && editChild && editChild.contentWindow) sendDown(editChild.contentWindow, { t: 'setval', text: d.text, submit: d.submit });
        else if (pendingEdit) applyText(pendingEdit, d.text, d.submit);
      }
      return;
    }
    // Mensajes que suben desde un iframe hijo.
    var fe = frameElFor(e.source);
    if (!fe) return;
    if (d.t === 'hasvideo') { videoChild = fe; videoSource = 'child'; }
    if (d.t === 'vstate' && fe !== videoChild) return;
    if (d.t === 'edit') { editChild = fe; editSource = 'child'; }
    if (IS_TOP) {
      if (d.t === 'blocked') onBlocked(d.what);
      else if (d.t === 'hasvideo') onVideoFound('child', d.st);
      else if (d.t === 'vstate') onVideoState(d.st);
      else if (d.t === 'key') onKey(d.code, d.repeat, null);
      else if (d.t === 'edit') openKb('frame', d.info);
    } else {
      delete d.__ntv; delete d.dir;
      sendUp(d);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Frames internos: reenviar teclas al nivel superior                  */
  /* ------------------------------------------------------------------ */
  if (!IS_TOP) {
    window.addEventListener('keydown', function (e) {
      if (!e.isTrusted) return;
      var ae = document.activeElement;
      if (ae && ae.tagName === 'SELECT' && e.keyCode !== K.BACK) return;
      e.preventDefault(); e.stopImmediatePropagation();
      sendUp({ t: 'key', code: e.keyCode, repeat: e.repeat });
    }, true);
    onReady(startObserver);
    return;
  }

  /* ================================================================== */
  /* Solo en la página principal: interfaz, cursor, menú y modo video   */
  /* ================================================================== */
  var host, root, cursorEl, toastEl, osdEl, menuEl, kbEl, homeEl;
  var cx = Math.round(innerWidth / 2), cy = Math.round(innerHeight / 2);
  var menuIdx = 0, menuItems = [], homeIdx = 0, homeItems = [], deleteMode = false;
  var zoom = 1;

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:"SamsungOne","Samsung Sans",Roboto,Arial,sans-serif}',
    '#cur{position:fixed;left:0;top:0;width:34px;height:34px;margin:-3px 0 0 -3px;pointer-events:none;z-index:5;transition:transform .06s linear;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}',
    '#toast{position:fixed;top:36px;right:48px;max-width:640px;padding:16px 24px;border-radius:14px;background:rgba(20,22,30,.92);color:#fff;font-size:24px;line-height:1.35;opacity:0;transition:opacity .25s;pointer-events:none}',
    '#toast.on{opacity:1}',
    '#osd{position:fixed;left:0;right:0;bottom:0;padding:40px 80px 56px;background:linear-gradient(transparent,rgba(0,0,0,.85));color:#fff;opacity:0;transition:opacity .3s;pointer-events:none}',
    '#osd.on{opacity:1}',
    '#osd .row{display:flex;align-items:center;gap:28px;font-size:30px}',
    '#osd .bar{flex:1;height:10px;border-radius:5px;background:rgba(255,255,255,.25);overflow:hidden}',
    '#osd .fill{height:100%;width:0;background:#4f8cff}',
    '#osd .st{font-size:44px;width:56px;text-align:center}',
    '#osd .hint{margin-top:18px;font-size:22px;opacity:.75}',
    '.panel{position:fixed;background:rgba(18,20,28,.97);color:#fff;border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.6);pointer-events:auto}',
    '#menu{left:60px;top:60px;width:560px;padding:18px 0;display:none}',
    '#menu.on{display:block}',
    '#menu .it{padding:16px 34px;font-size:28px;display:flex;gap:18px;align-items:center}',
    '#menu .it .ic{width:36px;text-align:center}',
    '#menu .it.sel{background:#4f8cff;color:#fff}',
    '#menu .sub{padding:4px 34px 12px;font-size:20px;opacity:.6}',
    '#kb{left:50%;bottom:40px;width:1240px;margin-left:-620px;padding:28px 30px 24px;display:none;z-index:8}',
    '#kb.on{display:block}',
    '#kb .lbl{font-size:22px;opacity:.7;margin:0 4px 10px}',
    '#kb .field{font-size:34px;padding:16px 20px;border-radius:12px;border:3px solid #4f8cff;background:#0b0d12;color:#fff;min-height:74px;white-space:nowrap;overflow:hidden;text-overflow:clip;direction:ltr}',
    '#kb .field .ph{opacity:.4}',
    '#kb .caret{display:inline-block;width:3px;height:38px;margin-left:2px;vertical-align:middle;background:#4f8cff;animation:bl 1s steps(1) infinite}',
    '@keyframes bl{50%{opacity:0}}',
    '#kb .rows{margin-top:18px}',
    '#kb .row{display:flex;gap:8px;margin-bottom:8px}',
    '#kb .k{flex:1;height:68px;border-radius:12px;background:rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center;font-size:30px;border:3px solid transparent}',
    '#kb .k.sp{font-size:22px;background:rgba(255,255,255,.05)}',
    '#kb .k.on{background:rgba(79,140,255,.35)}',
    '#kb .k.go{background:#2e6be6}',
    '#kb .k.sel{border-color:#fff;background:#4f8cff;transform:scale(1.06)}',
    '#kb .hint{margin-top:8px;font-size:19px;opacity:.55}',
    '#home{left:0;top:0;right:0;bottom:0;border-radius:0;padding:70px 110px;display:none;background:linear-gradient(135deg,#0d1117,#162038)}',
    '#home.on{display:block}',
    '#home h1{margin:0 0 6px;font-size:56px;font-weight:700}',
    '#home .tag{font-size:24px;opacity:.65;margin-bottom:44px}',
    '#home .search{font-size:32px;padding:26px 30px;border-radius:16px;background:rgba(255,255,255,.08);border:3px solid transparent;margin-bottom:44px}',
    '#home .grid{display:flex;flex-wrap:wrap;gap:28px}',
    '#home .fav{width:300px;height:150px;border-radius:18px;background:rgba(255,255,255,.08);border:3px solid transparent;padding:22px;display:flex;flex-direction:column;justify-content:space-between}',
    '#home .fav .t{font-size:28px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '#home .fav .u{font-size:18px;opacity:.55;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '#home .sel{border-color:#4f8cff;background:rgba(79,140,255,.22);transform:scale(1.04)}',
    '#home.del .fav.sel{border-color:#ff5c5c;background:rgba(255,92,92,.22)}',
    '#home .foot{position:absolute;left:110px;bottom:50px;font-size:22px;opacity:.6}'
  ].join('\n');

  var CURSOR_SVG = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 2l7.5 19 2.6-7.7L21 10.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function buildUi() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('div');
    host.id = 'ntv-host';
    host.setAttribute('style', 'position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;visibility:visible!important');
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = '<style>' + CSS + '</style>' +
      '<div id="cur">' + CURSOR_SVG + '</div>' +
      '<div id="toast"></div>' +
      '<div id="osd"><div class="row"><div class="st">▶</div><div class="tm">0:00</div><div class="bar"><div class="fill"></div></div><div class="du">0:00</div></div>' +
      '<div class="hint">◀ ▶ atrasar / adelantar · OK pausa · CH ▲▼ ±1 min · Atrás salir</div></div>' +
      '<div id="menu" class="panel"></div>' +
      '<div id="kb" class="panel"></div>' +
      '<div id="home" class="panel"></div>';
    cursorEl = root.getElementById('cur');
    toastEl = root.getElementById('toast');
    osdEl = root.getElementById('osd');
    menuEl = root.getElementById('menu');
    kbEl = root.getElementById('kb');
    homeEl = root.getElementById('home');
    document.documentElement.appendChild(host);
    drawCursor();
  }

  /* --- avisos --- */
  var toastTimer = null;
  function toast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2500);
  }
  var blockToastTimer = null;
  function onBlocked() {
    blockedCount++;
    clearTimeout(blockToastTimer);
    blockToastTimer = setTimeout(function () {
      toast('🛡 ' + blockedCount + (blockedCount === 1 ? ' anuncio bloqueado' : ' anuncios bloqueados'), 1800);
    }, 300);
  }

  /* --- cursor --- */
  var cursorHideTimer = null;
  function drawCursor() {
    if (!cursorEl) return;
    cursorEl.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
    cursorEl.style.display = videoMode ? 'none' : 'block';
    cursorEl.style.opacity = '1';
    clearTimeout(cursorHideTimer);
    cursorHideTimer = setTimeout(function () { cursorEl.style.opacity = '0.35'; }, 6000);
  }
  var lastMoveKey = 0, lastMoveTs = 0, moveRun = 0;
  function moveCursor(code) {
    var now = Date.now();
    if (code === lastMoveKey && now - lastMoveTs < 220) moveRun++; else moveRun = 0;
    lastMoveKey = code; lastMoveTs = now;
    var step = Math.min(70, 14 + moveRun * 5);
    var W = innerWidth, H = innerHeight, edge = 8;
    if (code === K.LEFT) cx -= step;
    if (code === K.RIGHT) cx += step;
    if (code === K.UP) { if (cy <= edge) scrollAt(cx, Math.max(cy, 20), -Math.max(step * 4, 120)); cy -= step; }
    if (code === K.DOWN) { if (cy >= H - edge) scrollAt(cx, Math.min(cy, H - 20), Math.max(step * 4, 120)); cy += step; }
    cx = Math.max(0, Math.min(W - 2, cx));
    cy = Math.max(0, Math.min(H - 2, cy));
    drawCursor();
    hoverAt(cx, cy);
  }

  /* --- OSD de video --- */
  var osdTimer = null, lastState = null;
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
  }
  function renderOsd() {
    if (!osdEl || !lastState) return;
    var st = lastState;
    osdEl.querySelector('.st').textContent = st.paused ? '❚❚' : '▶';
    osdEl.querySelector('.tm').textContent = fmt(st.cur);
    osdEl.querySelector('.du').textContent = st.dur ? fmt(st.dur) : 'EN VIVO';
    osdEl.querySelector('.fill').style.width = st.dur ? Math.min(100, st.cur / st.dur * 100) + '%' : '100%';
  }
  function showOsd() {
    if (!osdEl) return;
    renderOsd();
    osdEl.classList.add('on');
    clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { if (!(lastState && lastState.paused)) osdEl.classList.remove('on'); }, 4000);
  }
  function onVideoState(st) {
    lastState = st;
    if (videoMode) { renderOsd(); if (st.paused) osdEl.classList.add('on'); }
  }
  var announced = false;
  function onVideoFound(src, st) {
    videoSource = src;
    lastState = st;
    // Pasa a pantalla completa solo con videos largos (o en vivo), no con anuncios cortos.
    if (!videoMode && (!st.dur || st.dur > 90)) {
      enterVideo();
    }
  }
  function enterVideo() {
    closeMenu(); closeKb();
    setVideoMode(true);
    drawCursor();
    showOsd();
    if (!announced) { toast('📺 Modo TV · Atrás para salir', 3500); announced = true; }
  }
  function exitVideo() {
    setVideoMode(false);
    osdEl.classList.remove('on');
    drawCursor();
    toast('Modo TV desactivado · Menú ▸ "Ver video en pantalla completa" para volver', 3000);
  }
  var seekRun = 0, lastSeekTs = 0, lastSeekDir = 0;
  function seek(dir) {
    var now = Date.now();
    if (dir === lastSeekDir && now - lastSeekTs < 400) seekRun++; else seekRun = 0;
    lastSeekDir = dir; lastSeekTs = now;
    var s = seekRun < 3 ? 10 : seekRun < 8 ? 30 : 60;
    routeVcmd('seek', dir * s);
    if (lastState) { lastState.cur = Math.max(0, lastState.cur + dir * s); }
    showOsd();
  }

  /* --- menú --- */
  function go(url) { allowNavTs = Date.now(); location.href = url; }
  function setZoom(z) {
    zoom = Math.max(0.5, Math.min(2.5, Math.round(z * 10) / 10));
    document.documentElement.style.zoom = zoom === 1 ? '' : String(zoom);
    toast('Zoom ' + Math.round(zoom * 100) + '%', 1200);
  }
  function buildMenu() {
    menuItems = [
      { ic: '🔎', t: 'Buscar o escribir dirección', fn: function () { closeMenu(); openUrl(); } },
      { ic: '←', t: 'Página anterior', fn: function () { closeMenu(); allowNavTs = Date.now(); history.back(); } },
      { ic: '⟳', t: 'Recargar', fn: function () { closeMenu(); allowNavTs = Date.now(); location.reload(); } },
      { ic: '🏠', t: 'Inicio y favoritos', fn: function () { closeMenu(); go(HOME_URL); } },
      { ic: '★', t: 'Guardar esta página en favoritos', fn: function () {
        closeMenu();
        go(HOME_URL + '&add=' + encodeURIComponent(location.href) + '&title=' + encodeURIComponent(document.title || location.hostname));
      } },
      { ic: '📺', t: 'Ver video en pantalla completa', fn: function () {
        closeMenu();
        if (!videoSource && !document.querySelector('video') && !videoChild) { toast('No encontré un video. Dale play primero.'); return; }
        enterVideo();
      } },
      { ic: 'A+', t: 'Agrandar página', fn: function () { setZoom(zoom + 0.1); } },
      { ic: 'A−', t: 'Achicar página', fn: function () { setZoom(zoom - 0.1); } },
      { ic: '✕', t: 'Salir de NavegaTV', fn: function () {
        closeMenu();
        try { tizen.application.getCurrentApplication().exit(); return; } catch (e) {}
        try { window.close(); } catch (e) {}
        toast('Presiona el botón Home del control para salir');
      } }
    ];
    var h = '';
    for (var i = 0; i < menuItems.length; i++) {
      h += '<div class="it' + (i === menuIdx ? ' sel' : '') + '"><span class="ic">' + menuItems[i].ic + '</span>' + menuItems[i].t + '</div>';
    }
    h += '<div class="sub">🛡 ' + blockedCount + ' anuncios bloqueados en esta página</div>';
    menuEl.innerHTML = h;
  }
  function menuOpen() { return menuEl && menuEl.classList.contains('on'); }
  function openMenu() { menuIdx = 0; buildMenu(); menuEl.classList.add('on'); }
  function closeMenu() { if (menuEl) menuEl.classList.remove('on'); }
  function menuKey(code) {
    if (code === K.UP) menuIdx = (menuIdx + menuItems.length - 1) % menuItems.length;
    else if (code === K.DOWN) menuIdx = (menuIdx + 1) % menuItems.length;
    else if (code === K.ENTER) { menuItems[menuIdx].fn(); return; }
    else if (code === K.BACK || code === K.ESC || code === K.LEFT) { closeMenu(); return; }
    if (menuOpen()) buildMenu();
  }

  /* --- teclado en pantalla de NavegaTV --- */
  var KB_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-'],
    ['@', '/', ':', '_', '?', '=', '&', '#', '!', '+'],
    [{ k: 'shift', l: '⇧ Mayús', w: 2 }, { k: 'space', l: 'Espacio', w: 3 }, { k: 'bs', l: '⌫', w: 1 },
      { k: 'clear', l: 'Borrar', w: 1 }, { k: '.com', l: '.com', w: 1 }, { k: 'go', l: 'Ir ➜', w: 2 }]
  ];
  var kb = { open: false, mode: null, text: '', ph: '', pw: false, shift: false, r: 1, c: 0 };
  function kbKeyAt(r, c) { var k = KB_ROWS[r][c]; return typeof k === 'string' ? { k: k, l: k, w: 1 } : k; }
  function kbOpen() { return kb.open; }
  function openKb(mode, info) {
    closeMenu();
    kb.open = true; kb.mode = mode; kb.text = info.text || ''; kb.ph = info.ph || ''; kb.pw = !!info.pw;
    kb.shift = false; kb.r = 1; kb.c = 0;
    kbEl.classList.add('on');
    cursorEl.style.display = 'none';
    renderKb();
  }
  function closeKb() {
    if (!kbEl) return;
    kb.open = false; kbEl.classList.remove('on');
    if (!homeOpen()) drawCursor();
  }
  function renderKb() {
    var shown = kb.pw ? kb.text.replace(/./g, '•') : kb.text;
    var h = '<div class="lbl">' + (kb.mode === 'url' ? 'Buscar o escribir dirección' : 'Escribir' + (kb.ph ? ': ' + esc(kb.ph) : '')) + '</div>' +
      '<div class="field">' + (shown ? esc(shown) : '<span class="ph">' + (kb.mode === 'url' ? 'ej: wikipedia.org o una búsqueda' : '') + '</span>') + '<span class="caret"></span></div><div class="rows">';
    for (var r = 0; r < KB_ROWS.length; r++) {
      h += '<div class="row">';
      for (var c = 0; c < KB_ROWS[r].length; c++) {
        var k = kbKeyAt(r, c);
        var label = k.l.length === 1 && kb.shift ? k.l.toUpperCase() : k.l;
        var cls = 'k' + (k.l.length > 1 ? ' sp' : '') + (k.k === 'shift' && kb.shift ? ' on' : '') + (k.k === 'go' ? ' go' : '') + (r === kb.r && c === kb.c ? ' sel' : '');
        h += '<div class="' + cls + '" style="flex:' + k.w + '">' + esc(label) + '</div>';
      }
      h += '</div>';
    }
    h += '</div><div class="hint">Flechas para moverte · OK escribe · Atrás cancela · "Ir" para terminar</div>';
    kbEl.innerHTML = h;
    var f = kbEl.querySelector('.field'); f.scrollLeft = f.scrollWidth;
  }
  function kbCenter(r, c) {
    var x = 0;
    for (var i = 0; i < c; i++) x += kbKeyAt(r, i).w;
    return x + kbKeyAt(r, c).w / 2;
  }
  function kbColFor(r, x) {
    var acc = 0;
    for (var i = 0; i < KB_ROWS[r].length; i++) { acc += kbKeyAt(r, i).w; if (x < acc) return i; }
    return KB_ROWS[r].length - 1;
  }
  function kbPress(k) {
    if (k.k === 'shift') kb.shift = !kb.shift;
    else if (k.k === 'space') kb.text += ' ';
    else if (k.k === 'bs') kb.text = kb.text.slice(0, -1);
    else if (k.k === 'clear') kb.text = '';
    else if (k.k === '.com') kb.text += '.com';
    else if (k.k === 'go') { submitKb(); return; }
    else kb.text += kb.shift ? k.k.toUpperCase() : k.k;
    renderKb();
  }
  function submitKb() {
    var text = kb.text, mode = kb.mode;
    closeKb();
    if (mode === 'url') { goTyped(text); return; }
    if (mode === 'page') { if (pendingEdit) applyText(pendingEdit, text, true); return; }
    if (mode === 'frame' && editChild && editChild.contentWindow) sendDown(editChild.contentWindow, { t: 'setval', text: text, submit: true });
  }
  function kbKey(code, ev) {
    if (code === K.UP) { if (kb.r > 0) { var x = kbCenter(kb.r, kb.c); kb.r--; kb.c = kbColFor(kb.r, x); } }
    else if (code === K.DOWN) { if (kb.r < KB_ROWS.length - 1) { var x2 = kbCenter(kb.r, kb.c); kb.r++; kb.c = kbColFor(kb.r, x2); } }
    else if (code === K.LEFT) kb.c = (kb.c + KB_ROWS[kb.r].length - 1) % KB_ROWS[kb.r].length;
    else if (code === K.RIGHT) kb.c = (kb.c + 1) % KB_ROWS[kb.r].length;
    else if (code === K.ENTER) { kbPress(kbKeyAt(kb.r, kb.c)); return; }
    else if (code === K.BACK || code === K.ESC) { closeKb(); return; }
    else if (code === K.BACKSPACE) kb.text = kb.text.slice(0, -1);
    else if (code === K.PLAYPAUSE || code === K.PLAY) { submitKb(); return; }
    else if (ev && ev.key && ev.key.length === 1) kb.text += ev.key;   // teclado USB o del teléfono
    renderKb();
  }
  function openUrl() { openKb('url', { text: isHome() ? '' : location.href }); }
  function goTyped(v) {
    v = (v || '').trim();
    if (!v) return;
    if (/^[a-z]+:\/\//i.test(v)) go(v);
    else if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(v)) go('https://' + v);
    else go(SEARCH_URL + encodeURIComponent(v));
  }

  /* --- inicio y favoritos (se guardan en el almacenamiento de la página de inicio) --- */
  function isHome() { return /[?&]navegatv=home/.test(location.search); }
  function loadFavs() {
    try { var f = JSON.parse(localStorage.getItem('ntv_favs')); if (f && f.length >= 0 && f.push) return f; } catch (e) {}
    return DEFAULT_FAVS.slice();
  }
  function saveFavs(f) { try { localStorage.setItem('ntv_favs', JSON.stringify(f)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function homeOpen() { return homeEl && homeEl.classList.contains('on'); }
  function renderHome() {
    var favs = loadFavs();
    homeItems = [{ kind: 'search' }];
    var h = '<h1>NavegaTV</h1><div class="tag">Navegador sin ventanas emergentes · Flechas mueven el cursor · OK hace clic · Atrás abre el menú</div>' +
      '<div class="search" data-i="0">🔎 Buscar o escribir dirección…</div><div class="grid">';
    for (var i = 0; i < favs.length; i++) {
      homeItems.push({ kind: 'fav', fav: favs[i], idx: i });
      var host_ = (parseUrl(favs[i].u) || { hostname: favs[i].u }).hostname;
      h += '<div class="fav" data-i="' + (i + 1) + '"><div class="t">' + esc(favs[i].t) + '</div><div class="u">' + esc(host_) + '</div></div>';
    }
    homeItems.push({ kind: 'del' });
    h += '<div class="fav" data-i="' + homeItems.length + '" style="width:300px"><div class="t">' + (deleteMode ? '✓ Listo' : '🗑 Quitar favoritos') + '</div><div class="u">' + (deleteMode ? 'OK sobre un favorito para quitarlo' : 'Editar la lista') + '</div></div>';
    h += '</div><div class="foot">Para guardar una página: ábrela, Atrás ▸ "Guardar esta página en favoritos" · Usar cursor libre: Atrás</div>';
    homeEl.innerHTML = h;
    homeEl.classList.toggle('del', deleteMode);
    homeIdx = Math.min(homeIdx, homeItems.length - 1);
    var els = homeEl.querySelectorAll('[data-i]');
    for (var j = 0; j < els.length; j++) els[j].classList.toggle('sel', j === homeIdx);
  }
  function openHome() { homeEl.classList.add('on'); renderHome(); cursorEl.style.display = 'none'; }
  function closeHome() { homeEl.classList.remove('on'); drawCursor(); }
  function homeKey(code) {
    var n = homeItems.length, perRow = 1;
    var cards = homeEl.querySelectorAll('.fav');
    while (perRow < cards.length && cards[perRow].offsetTop === cards[0].offsetTop) perRow++;
    if (code === K.BACK) { closeHome(); toast('Cursor libre · Atrás abre el menú'); return; }
    if (code === K.ENTER) {
      var it = homeItems[homeIdx];
      if (it.kind === 'search') { openUrl(); return; }
      if (it.kind === 'del') { deleteMode = !deleteMode; renderHome(); return; }
      if (deleteMode) {
        var f = loadFavs(); f.splice(it.idx, 1); saveFavs(f); renderHome(); toast('Favorito quitado', 1200); return;
      }
      go(it.fav.u); return;
    }
    if (homeIdx === 0) {
      if (code === K.DOWN && n > 1) homeIdx = 1;
    } else {
      var g = homeIdx - 1;
      if (code === K.LEFT && g % perRow > 0) homeIdx--;
      else if (code === K.RIGHT && homeIdx < n - 1) homeIdx++;
      else if (code === K.UP) homeIdx = g < perRow ? 0 : homeIdx - perRow;
      else if (code === K.DOWN && homeIdx + perRow <= n - 1) homeIdx += perRow;
    }
    renderHome();
  }
  function handleHomeParams() {
    var q = new URLSearchParams(location.search);
    var add = q.get('add');
    if (add) {
      var favs = loadFavs();
      var exists = favs.some(function (f) { return f.u === add; });
      if (!exists) { favs.push({ t: (q.get('title') || add).slice(0, 60), u: add }); saveFavs(favs); }
      toast(exists ? 'Ya estaba en favoritos' : '★ Guardado en favoritos');
      try { history.replaceState(null, '', location.pathname + '?navegatv=home'); } catch (e) {}
    }
  }

  /* --- teclas --- */
  function onKey(code, repeat, ev) {
    if (kbOpen()) { kbKey(code, ev); return true; }
    if (homeOpen()) { homeKey(code); return true; }
    if (menuOpen()) { menuKey(code); return true; }

    if (videoMode) {
      switch (code) {
        case K.LEFT: case K.RW: seek(-1); return true;
        case K.RIGHT: case K.FF: seek(1); return true;
        case K.CHUP: routeVcmd('seek', 60); showOsd(); return true;
        case K.CHDOWN: routeVcmd('seek', -60); showOsd(); return true;
        case K.ENTER: case K.PLAYPAUSE: routeVcmd('toggle'); if (lastState) lastState.paused = !lastState.paused; showOsd(); return true;
        case K.PLAY: routeVcmd('play'); showOsd(); return true;
        case K.PAUSE: routeVcmd('pause'); showOsd(); return true;
        case K.UP: case K.DOWN: showOsd(); return true;
        case K.STOP: routeVcmd('pause'); exitVideo(); return true;
        case K.BACK: case K.ESC: exitVideo(); return true;
      }
      return true;
    }

    // Si quedó una caja de texto con el foco, se le quita: el control manda siempre el cursor.
    var ae = document.activeElement;
    if (ae && ae !== host && isTextField(ae)) { dropFocus(ae); }
    else if (ev && ae && ae.tagName === 'SELECT') {
      if (code === K.BACK || code === K.ESC) { try { ae.blur(); } catch (e) {} return true; }
      return false;
    }

    switch (code) {
      case K.LEFT: case K.RIGHT: case K.UP: case K.DOWN: moveCursor(code); return true;
      case K.ENTER: clickAt(cx, cy); return true;
      case K.CHUP: scrollAt(cx, cy, -Math.round(innerHeight * 0.8)); return true;
      case K.CHDOWN: scrollAt(cx, cy, Math.round(innerHeight * 0.8)); return true;
      case K.PLAYPAUSE: case K.PLAY: case K.PAUSE: routeVcmd(code === K.PLAY ? 'play' : code === K.PAUSE ? 'pause' : 'toggle'); return true;
      case K.YELLOW: enterVideo(); return true;
      case K.RED: openUrl(); return true;
      case K.GREEN: go(HOME_URL); return true;
      case K.BACK: case K.ESC: case K.BLUE: openMenu(); return true;
    }
    return false;
  }

  window.addEventListener('keydown', function (e) {
    if (!host || !e.isTrusted) return;
    if (onKey(e.keyCode, e.repeat, e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // Las teclas no deben llegar a la página mientras manejamos el cursor.
  window.addEventListener('keyup', function (e) {
    if (!host) return;
    var ae = document.activeElement;
    if (isEditable(ae) && !videoMode) return;
    if ([37, 38, 39, 40, 13, 10009].indexOf(e.keyCode) >= 0) e.stopImmediatePropagation();
  }, true);

  /* --- arranque --- */
  onReady(function () {
    dropFocus(document.activeElement);
    setTimeout(function () { dropFocus(document.activeElement); }, 800);
    buildUi();
    startObserver();
    setInterval(buildUi, 2000);
    if (isHome()) { handleHomeParams(); openHome(); }
    else toast('Flechas: cursor · OK: clic · Atrás: menú', 2500);
  });
})();
