/* Tesser Atomics · scene loader
   ---------------------------------------------------------------------------
   Attribute-driven. In Webflow, wrap each scene's markup (markup/<name>.html):

     <div data-tz-scene="m1" data-tz-prep="tsr-m1"> …scene markup… </div>

   data-tz-scene   the file to load: <base>js/scenes/<name>.js
   data-tz-prep    scene root ids (comma-separated) that core.js's __TZ_PREP
                   prepares before any scene code arrives (theme, text column,
                   drive mode). The handoff ran these inline after each root.
   data-tz-ahead   how far ahead to start loading, in viewport heights (default 1.5)

   A scene's script is injected once its wrapper is within data-tz-ahead
   screens of the viewport, or has already been scrolled past (anchor jumps,
   fast flings, a long main-thread stall). Nothing scene-related downloads
   before first paint. After the page has loaded and gone idle, the rest are
   prefetched at low priority, so a scene is usually cached before it is needed.

   Base URL: this script's src minus "js/loader(.min).js", so one pinned
   jsDelivr tag pins every file. Override with data-tz-base on the script tag.

   v1.0.4: with core.js loaded as <script ... data-tz-eager>, everything loads up front behind a preloader instead
   (see preload() below).

   The scenes themselves already pause offscreen and in hidden tabs, cap their
   pixel ratio at 1.5 and respect prefers-reduced-motion. core.js must load
   first, in <head>.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';
  var me = document.currentScript;
  var src = (me && me.src) || '';
  var base = (me && me.getAttribute('data-tz-base')) || src.replace(/js\/loader(\.min)?\.js(\?.*)?$/, '');
  var min = /loader\.min\.js/.test(src) ? '.min' : '';
  var url = function (name) { return base + 'js/scenes/' + name + min + '.js'; };
  var loaded = {}, pending = [], ticking = false;

  function load(name) {
    if (!name || loaded[name]) return;
    loaded[name] = true;
    var s = document.createElement('script');
    s.src = url(name);
    s.async = false;                                   // keep execution in request order
    s.onerror = function () { console.warn('[tz] scene failed to load:', name); };
    document.body.appendChild(s);
  }

  function check() {
    ticking = false;
    var vh = window.innerHeight;
    pending = pending.filter(function (el) {
      var ahead = parseFloat(el.getAttribute('data-tz-ahead')) || 1.5;
      if (el.getBoundingClientRect().top < vh * (1 + ahead)) { load(el.getAttribute('data-tz-scene')); return false; }
      return true;
    });
    if (!pending.length) {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(check); } }

  function prefetchRest() {
    pending.forEach(function (el) {
      var l = document.createElement('link');
      l.rel = 'prefetch'; l.as = 'script'; l.href = url(el.getAttribute('data-tz-scene'));
      document.head.appendChild(l);
    });
  }


  /* v1.0.7 · ?tzdebug in the URL shows a small report in the corner: browser, GPU, each scene's build time and whether
     it runs live or as a still, and the preloader time. Send a screenshot of it when something misbehaves. */
  var DEBUG = /[?&]tzdebug\b/.test(location.search), logs = [];
  function log(msg) {
    logs.push(msg);
    if (window.console) console.info('[tz] ' + msg);
    if (DEBUG) paintDebug();
  }
  function gpu() {
    try {
      var c = document.createElement('canvas'), gl = c.getContext('webgl');
      if (!gl) return 'no WebGL (' + (document.documentElement.className.indexOf('tz-nogl') >= 0 ? 'refused: software/slow GPU' : 'unavailable') + ')';
      var d = gl.getExtension('WEBGL_debug_renderer_info');
      var r = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      var lc = gl.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext();
      return r;
    } catch (e) { return 'error: ' + e.message; }
  }
  var box;
  function paintDebug() {
    if (!document.body) return;
    if (!box) {
      box = document.createElement('pre');
      box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;max-width:min(560px,92vw);max-height:60vh;overflow:auto;margin:0;padding:10px 12px;font:11px/1.45 ui-monospace,Menlo,monospace;color:#F5F1E8;background:rgba(4,9,15,.92);border:1px solid #E1AB25;white-space:pre-wrap;pointer-events:auto';
      document.body.appendChild(box);
      logs.unshift('UA: ' + navigator.userAgent, 'GPU: ' + gpu(), 'screen: ' + innerWidth + 'x' + innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x, cores ' + (navigator.hardwareConcurrency || '?') + ', memory ' + (navigator.deviceMemory || '?') + ' GB');
    }
    box.textContent = 'Tesser debug (screenshot this)\n' + logs.join('\n');
  }
  if (DEBUG) {
    if ('PerformanceObserver' in window) try {
      new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (e.duration > 400) log('long task: ' + Math.round(e.duration) + ' ms'); }); }).observe({ entryTypes: ['longtask'] });
    } catch (e) {}
    addEventListener('error', function (e) { log('error: ' + (e.message || e.type)); });
    addEventListener('DOMContentLoaded', paintDebug);
  }

  function prepAll(els) {
    els.forEach(function (el) {
      (el.getAttribute('data-tz-prep') || '').split(',').forEach(function (id) {
        id = id.trim();
        if (id && window.__TZ_PREP) { try { window.__TZ_PREP(id); } catch (err) { console.warn('[tz] prep failed:', id, err); } }
      });
    });
  }

  /* v1.0.4 · Preload mode (core.js was loaded with data-tz-eager, so window.__TZ_EAGER is set and html has
     tz-loading tz-locked). Everything the page needs is fetched and built while the preloader shows:
       - every scene script, in page order; each scene mounts and draws its first frame at once (its shaders compile here,
         not mid-scroll), then idles until it scrolls into view;
       - every lazy image is switched to eager, so nothing pops in later;
       - web fonts, and the hero background video's first frames.
     Progress goes to the preloader as --tz-progress (0..1) on [data-tz-preloader], as scaleX on its
     [data-tz-preloader-bar] (or [data-tz-preloader-fill]) and as a whole number into [data-tz-preloader-count].
     Scroll is held by blocking wheel, touch and scroll keys (v1.0.5), so nothing reflows when it is released. When all of it is in, or after an 8 s safety cap, the page unlocks
     (html loses tz-locked, gains tz-ready), the preloader fades (.is-done) and is then removed (tz-loading goes).
     window fires 'tz:ready'. A #id in the URL is honoured once the page is unlocked. */
  function preload(els) {
    var H = document.documentElement, pre = document.querySelector('[data-tz-preloader]');
    var count = pre && pre.querySelector('[data-tz-preloader-count]');
    var bar = pre && pre.querySelector('[data-tz-preloader-bar], [data-tz-preloader-fill]');
    // v1.0.5 · scroll is held by blocking input, not overflow, so the scrollbar and page width the scenes measure
    // while loading are the final ones
    var KEYS = { 32: 1, 33: 1, 34: 1, 35: 1, 36: 1, 37: 1, 38: 1, 39: 1, 40: 1 };
    var stop = function (e) { e.preventDefault(); }, stopKey = function (e) { if (KEYS[e.keyCode]) e.preventDefault(); };
    addEventListener('wheel', stop, { passive: false });
    addEventListener('touchmove', stop, { passive: false });
    addEventListener('keydown', stopKey);
    if (pre) pre.setAttribute('aria-busy', 'true');
    var t0 = Date.now(), MIN = 700, CAP = 8000, done = false, total = 0, got = 0, shown = 0;
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    function paint() {
      if (done) return;
      var p = total ? got / total : 1;
      shown += (p - shown) * 0.5; if (p - shown < 0.004) shown = p;
      if (pre) pre.style.setProperty('--tz-progress', shown.toFixed(3));
      if (bar) bar.style.transform = 'scaleX(' + shown.toFixed(3) + ')';
      if (count) count.textContent = String(Math.round(shown * 100));
      raf(paint);
    }
    function task() { total++; var settled = false; return function () { if (settled) return; settled = true; got++; if (got >= total) finish(); }; }
    function finish() {
      if (done) return;
      var wait = Math.max(0, MIN - (Date.now() - t0));
      setTimeout(function () {
        if (done) return; done = true;
        if (pre) pre.style.setProperty('--tz-progress', '1');
        if (bar) bar.style.transform = 'scaleX(1)';
        if (count) count.textContent = '100';
        // two frames so the last scene's first draw is on screen before the curtain lifts
        raf(function () { raf(function () {
          removeEventListener('wheel', stop, { passive: false });
          removeEventListener('touchmove', stop, { passive: false });
          removeEventListener('keydown', stopKey);
          H.classList.remove('tz-locked'); H.classList.add('tz-ready');
          if (pre) { pre.classList.add('is-done'); pre.setAttribute('aria-busy', 'false'); }
          setTimeout(function () {
            H.classList.remove('tz-loading');
            if (window.ScrollTrigger) window.ScrollTrigger.refresh();
            window.dispatchEvent(new Event('resize'));
          }, 700);
          var id = (location.hash || '').slice(1), target = id && /^[\w-]+$/.test(id) && document.getElementById(id);
          if (target) target.scrollIntoView({ block: 'start' });
          try { localStorage.removeItem('tzBuild'); } catch (e) {}
          log('page unlocked after ' + Math.round(performance.now()) + ' ms' + (window.__TZ_FORCE_NOGL ? ' (stills from: ' + window.__TZ_FORCE_NOGL + ')' : ''));
          try { window.dispatchEvent(new CustomEvent('tz:ready')); } catch (e) {}
        }); });
      }, wait);
    }
    var hold = task();                      // held open until every task below is registered

    // scenes (v1.0.7): every script is fetched in parallel up front, but they are run ONE AT A TIME, with a pause for the
    // browser between them, and each one is timed. Building a scene (compiling its shaders, drawing its first frame) is
    // the heavy part; doing all five back to back is what hung weaker machines. If one scene takes longer than the
    // budget, or the browser drops a GPU context, the rest are told to show their still image instead
    // (window.__TZ_FORCE_NOGL, honoured by core.js), so a slow machine gets a working page in seconds, not a frozen one.
    prepAll(els);
    var queue = [], BUDGET = 1500, built = 0;
    els.forEach(function (el) {
      var name = el.getAttribute('data-tz-scene');
      if (!name || loaded[name]) return;
      loaded[name] = true;
      var l = document.createElement('link'); l.rel = 'preload'; l.as = 'script'; l.href = url(name); l.crossOrigin = 'anonymous';
      document.head.appendChild(l);
      queue.push({ name: name, t: task() });
    });
    addEventListener('webglcontextlost', function (e) { if (!(e.target && e.target.closest && e.target.closest('[data-tz-scene]'))) return; if (!window.__TZ_FORCE_NOGL) { window.__TZ_FORCE_NOGL = 'context-lost'; log('GPU context lost: remaining scenes use stills'); } }, true);
    function next() {
      var q = queue.shift();
      if (!q) return;
      var s = document.createElement('script'), t1 = performance.now();   // timed from insertion: a scene builds while its script runs
      s.src = url(q.name); s.crossOrigin = 'anonymous';
      s.onload = function () {
        raf(function () { raf(function () {
          var ms = Math.round(performance.now() - t1);
          var root = document.querySelector('[data-tz-scene="' + q.name + '"] [id]');
          var state = root ? (/is-live/.test(root.className) ? 'live' : /nogl|no-gl/.test(root.className) ? 'still' : 'built') : '?';
          log(q.name + ': ' + state + ', built in ' + ms + ' ms');
          if (ms > BUDGET && !window.__TZ_FORCE_NOGL) { window.__TZ_FORCE_NOGL = 'slow:' + q.name; log('over budget: remaining scenes use stills'); }
          built++; q.t();
          setTimeout(next, 30);                       // let the browser breathe (and the safety cap fire) between scenes
        }); });
      };
      s.onerror = function () { log(q.name + ': failed to load'); q.t(); setTimeout(next, 0); };
      document.body.appendChild(s);
    }
    try { if (!window.__TZ_FORCE_NOGL) localStorage.setItem('tzBuild', String(Date.now())); } catch (e) {}
    if (window.__TZ_FORCE_NOGL) log('stills mode: ' + window.__TZ_FORCE_NOGL);
    next();

    // images: lazy ones become eager; each counts when loaded (or failed)
    Array.prototype.forEach.call(document.images, function (img) {
      if (img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
      if (img.complete) return;
      var t = task();
      img.addEventListener('load', t, { once: true });
      img.addEventListener('error', t, { once: true });
    });

    // fonts
    if (document.fonts && document.fonts.ready) { var tf = task(); document.fonts.ready.then(tf, tf); }

    // the hero background video: enough of it to play smoothly (capped at 6 s; it keeps loading after)
    var vid = document.querySelector('.w-background-video video, video[autoplay]');
    if (vid && vid.readyState < 3) {
      var tv = task();
      vid.addEventListener('canplay', tv, { once: true });
      vid.addEventListener('error', tv, { once: true });
      setTimeout(tv, 6000);
    }

    // v1.0.6 · the window load event is not waited for: third-party embeds (the forms' Turnstile check) can hold it
    // back for a long time, and everything the page itself needs is already counted above.

    setTimeout(finish, CAP);                // safety: never keep the page locked longer than this
    raf(paint);
    hold();
  }

  function start() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-tz-scene]'));
    if (window.__TZ_EAGER) { preload(els); return; }
    if (!els.length) return;
    prepAll(els);
    pending = els;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    check();
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1500); };
    var afterLoad = function () { idle(prefetchRest, { timeout: 4000 }); };
    if (document.readyState === 'complete') afterLoad(); else window.addEventListener('load', afterLoad);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
