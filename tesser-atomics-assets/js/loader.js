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
     Scroll is held by blocking wheel, touch and scroll keys (v1.0.5), so nothing reflows when it is released. When all of it is in, or after a 15 s safety cap, the page unlocks
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
    var t0 = Date.now(), MIN = 700, CAP = 15000, done = false, total = 0, got = 0, shown = 0;
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
          try { window.dispatchEvent(new CustomEvent('tz:ready')); } catch (e) {}
        }); });
      }, wait);
    }
    var hold = task();                      // held open until every task below is registered

    // scenes: prep, then load in page order; each counts once its script has run and two frames have passed
    prepAll(els);
    els.forEach(function (el) {
      var name = el.getAttribute('data-tz-scene');
      if (!name || loaded[name]) return;
      loaded[name] = true;
      var t = task(), s = document.createElement('script');
      s.src = url(name); s.async = false;
      s.onload = function () { raf(function () { raf(t); }); };
      s.onerror = function () { console.warn('[tz] scene failed to load:', name); t(); };
      document.body.appendChild(s);
    });

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

    // the page itself (stylesheets, the rest of the document)
    if (document.readyState !== 'complete') { var tw = task(); window.addEventListener('load', tw, { once: true }); }

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
