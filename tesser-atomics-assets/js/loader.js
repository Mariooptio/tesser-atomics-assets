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

  function start() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-tz-scene]'));
    if (!els.length) return;
    els.forEach(function (el) {
      (el.getAttribute('data-tz-prep') || '').split(',').forEach(function (id) {
        id = id.trim();
        if (id && window.__TZ_PREP) { try { window.__TZ_PREP(id); } catch (err) { console.warn('[tz] prep failed:', id, err); } }
      });
    });
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
